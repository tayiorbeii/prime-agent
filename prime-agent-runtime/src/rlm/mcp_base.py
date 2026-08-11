"""Base class for MCP-client integrations exposed in the RLM kernel.

An integration is a Python skill package that subclasses :class:`McpIntegration`,
declares the MCP ``server`` it targets, and is imported in the kernel like any
other skill. Tools are auto-discovered from the server and bound as async
methods, so the agent writes ordinary Python:

    import linear
    issues = await linear.list_issues(team="Engineering")

Credentials live in the host's ``auth.json`` (single store, survives kernel
rebuilds). This module reads that file directly for the common case; on token
expiry it asks the host to refresh via ``rlm.host_request("mcp.refresh", ...)``
and re-reads. Interactive login runs host-side, never here.
"""

from __future__ import annotations

import asyncio
import hashlib
import ipaddress
import json
import os
import time
from contextlib import AsyncExitStack
from pathlib import Path
from typing import Any
from urllib.parse import urlsplit

from . import _resolve_host_request_timeout, host_request

__all__ = ["Disabled", "MAX_ARGUMENT_BYTES", "McpIntegration", "McpToolError", "NotEnabled"]

# Stored access tokens are treated as expired this many seconds early so a token
# never dies mid-request. Mirrors the host's refresh buffer.
_EXPIRY_SKEW_SECONDS = 30

# Defense in depth: MCP arguments must fit in one generous 8 MiB JSON payload.
# This accommodates bounded indexing content while limiting host queues and direct
# HTTP serialization before any untrusted work begins.
MAX_ARGUMENT_BYTES = 8 * 1024 * 1024
# Wire responses need modest JSON-RPC/SSE envelope headroom above decoded output.
MAX_HTTP_RESPONSE_BYTES = 9 * 1024 * 1024


class NotEnabled(RuntimeError):
    """Raised when an integration has no usable credentials.

    The integration is installed but not logged in. The message tells the agent
    how to enable it so it can relay that to the user rather than retrying.
    """

    def __init__(self, server: str):
        self.server = server
        super().__init__(
            f"The '{server}' integration is not enabled: no credentials found. "
            f"Tell the user to run `/mcp login {server}` in Prime Agent to connect it. "
            f"Do not ask them to set environment variables."
        )


class Disabled(NotEnabled):
    """Raised when the host has explicitly disabled an MCP integration."""

    def __init__(self, server: str):
        self.server = server
        RuntimeError.__init__(
            self,
            f"The '{server}' integration is disabled in Prime Agent settings. "
            "Enable its mcpServers entry before using it.",
        )


class McpToolError(RuntimeError):
    """Raised when an MCP tool call returns a result flagged as an error."""


def _agent_dir() -> Path:
    """Resolve the Prime Agent config dir the same way the rest of the runtime does."""
    raw = (
        os.environ.get("PRIME_AGENT_CODING_AGENT_DIR")
        or os.environ.get("PI_CODING_AGENT_DIR")
        or str(Path.home() / ".prime" / "agent")
    )
    # resolve() so a relative env override reads auth.json from the right place,
    # not relative to the kernel's cwd.
    return Path(raw).expanduser().resolve()


def _read_auth(provider: str) -> dict[str, Any] | None:
    """Read one credential entry from auth.json. Returns None if absent/unreadable."""
    try:
        data = json.loads((_agent_dir() / "auth.json").read_text())
    except (OSError, ValueError):
        return None
    if not isinstance(data, dict):
        return None
    cred = data.get(provider)
    return cred if isinstance(cred, dict) else None


def _resolve_config_value(value: str) -> str:
    """Resolve a stored api_key value the way the host does.

    A value may be a literal, an env-var name, or a `!command` indirection. The
    command form can't run safely in the kernel (the host injects those resolved),
    so skip it; otherwise treat the value as an env-var name if set, else literal.
    """
    value = value.strip()
    if not value or value.startswith("!"):
        return ""
    return (os.environ.get(value) or value).strip()


def _resolve_streamable_http():
    """Return an SDK streamable-HTTP transport callable.

    SDK versions vary: some expose ``streamablehttp_client(url, headers=...)``,
    others ``streamable_http_client(url, *, http_client=...)``, and some expose
    both with *different* signatures. Imported lazily so importing an integration
    package never hard-fails when ``mcp`` is absent.
    """
    import inspect  # noqa: PLC0415

    from mcp.client import streamable_http as mod  # noqa: PLC0415

    fallback = None
    for name in ("streamablehttp_client", "streamable_http_client"):
        fn = getattr(mod, name, None)
        if fn is None:
            continue
        fallback = fallback or fn
        if "http_client" in inspect.signature(fn).parameters:
            return fn
    if fallback is not None:
        return fallback
    raise ImportError(
        "the installed `mcp` SDK exposes no streamable-HTTP client; upgrade `mcp`"
    )


def _validate_http_endpoint(url: str) -> str:
    """Reject insecure remote endpoints before credentials or headers are read."""
    try:
        parsed = urlsplit(url)
        host = parsed.hostname
        port = parsed.port  # Force malformed ports to fail here.
    except ValueError as exc:
        raise ValueError(f"invalid MCP endpoint URL: {url!r}") from exc
    del port
    if parsed.username is not None or parsed.password is not None:
        raise ValueError("MCP endpoint URLs must not contain embedded credentials")
    if parsed.scheme not in {"http", "https"} or not host:
        raise ValueError("MCP endpoints must use https, or http on a loopback address")
    if parsed.scheme == "https":
        return url
    loopback = host.lower() == "localhost" or host.lower().endswith(".localhost")
    if not loopback:
        try:
            loopback = ipaddress.ip_address(host).is_loopback
        except ValueError:
            loopback = False
    if not loopback:
        raise ValueError("plaintext HTTP is only allowed for loopback MCP endpoints")
    return url


def _validated_arguments(arguments: dict[str, Any] | None) -> dict[str, Any]:
    """Validate and bound one tool argument object before dispatch."""
    if arguments is None:
        return {}
    if not isinstance(arguments, dict):
        raise TypeError("MCP tool arguments must be a dict or None")
    try:
        encoded = json.dumps(
            arguments, ensure_ascii=False, separators=(",", ":"), allow_nan=False
        ).encode("utf-8")
    except (TypeError, ValueError) as exc:
        raise ValueError("MCP tool arguments must be JSON serializable") from exc
    if len(encoded) > MAX_ARGUMENT_BYTES:
        raise ValueError(
            f"MCP tool arguments exceed the {MAX_ARGUMENT_BYTES}-byte safety limit"
        )
    # Dispatch the exact JSON payload that was measured. Returning the caller's
    # mutable object would let another task enlarge/change it during config I/O.
    normalized = json.loads(encoded)
    if not isinstance(normalized, dict):  # Defensive; the input check guarantees this.
        raise ValueError("MCP tool arguments must encode to a JSON object")
    return normalized


def _bounded_http_response_hook(max_bytes: int = MAX_HTTP_RESPONSE_BYTES):
    """Build an httpx response hook that caps headers and streamed wire bytes."""
    import httpx  # noqa: PLC0415

    class _BoundedResponseStream(httpx.AsyncByteStream):
        def __init__(self, inner):
            self._inner = inner
            self._seen = 0

        async def __aiter__(self):
            try:
                async for chunk in self._inner:
                    self._seen += len(chunk)
                    if self._seen > max_bytes:
                        raise ValueError(
                            f"MCP HTTP response exceeds the {max_bytes}-byte wire safety limit"
                        )
                    yield chunk
            except BaseException:
                await self._inner.aclose()
                raise

        async def aclose(self):
            await self._inner.aclose()

    async def _hook(response) -> None:
        content_encoding = response.headers.get("content-encoding", "").strip().lower()
        if content_encoding not in {"", "identity"}:
            await response.aclose()
            raise ValueError(
                f"MCP HTTP response uses unsupported Content-Encoding {content_encoding!r}; "
                "only identity is allowed"
            )
        raw_length = response.headers.get("content-length")
        if raw_length is not None:
            try:
                content_length = int(raw_length)
            except ValueError as exc:
                await response.aclose()
                raise ValueError("MCP HTTP response has an invalid Content-Length") from exc
            if content_length < 0 or content_length > max_bytes:
                await response.aclose()
                raise ValueError(
                    f"MCP HTTP response exceeds the {max_bytes}-byte wire safety limit"
                )
        response.stream = _BoundedResponseStream(response.stream)

    return _hook


def _join_bounded_texts(texts: list[str], label: str) -> str:
    """Count UTF-8 incrementally before constructing a combined text result."""
    total = 0
    for index, text in enumerate(texts):
        total += len(text.encode("utf-8")) + (1 if index else 0)
        if total > MAX_ARGUMENT_BYTES:
            raise ValueError(f"{label} exceeds the {MAX_ARGUMENT_BYTES}-byte safety limit")
    return "\n".join(texts)


def _validate_host_config_shape(cfg: dict[str, Any], server: str) -> dict[str, Any]:
    """Validate the host-attested transport/security configuration strictly."""
    if cfg.get("enabled") is False:
        raise Disabled(server)

    generation = cfg.get("generation")
    if "generation" in cfg and (
        not isinstance(generation, int) or isinstance(generation, bool) or generation < 0
    ):
        raise RuntimeError("mcp.config generation must be a nonnegative integer")

    if set(cfg) <= {"generation"}:
        return cfg

    common = {"type", "generation", "enabled", "enabledTools", "disabledTools"}
    for key in ("enabledTools", "disabledTools"):
        if key in cfg and (
            not isinstance(cfg[key], list)
            or any(not isinstance(item, str) or not item for item in cfg[key])
        ):
            raise RuntimeError(f"mcp.config {key} must be a list of non-empty strings")
    if "enabled" in cfg and not isinstance(cfg["enabled"], bool):
        raise RuntimeError("mcp.config enabled must be a boolean")

    transport_type = cfg.get("type")
    if transport_type == "stdio":
        allowed = common | {"bridge"}
        if cfg.get("bridge") != "host" or not set(cfg) <= allowed:
            raise RuntimeError("mcp.config returned an incoherent stdio transport")
        return cfg
    if transport_type == "http":
        allowed = common | {
            "url",
            "headers",
            "allowStoredAuth",
            "bearerTokenEnvVar",
        }
        url = cfg.get("url")
        if not isinstance(url, str) or not url.strip() or not set(cfg) <= allowed:
            raise RuntimeError("mcp.config returned an incoherent HTTP transport")
        headers = cfg.get("headers")
        if headers is not None and (
            not isinstance(headers, dict)
            or any(not isinstance(k, str) or not isinstance(v, str) for k, v in headers.items())
        ):
            raise RuntimeError("mcp.config headers must map strings to strings")
        if "allowStoredAuth" in cfg and not isinstance(cfg["allowStoredAuth"], bool):
            raise RuntimeError("mcp.config allowStoredAuth must be a boolean")
        bearer_env = cfg.get("bearerTokenEnvVar")
        if bearer_env is not None and (not isinstance(bearer_env, str) or not bearer_env.strip()):
            raise RuntimeError("mcp.config bearerTokenEnvVar must be a non-empty string")
        return cfg
    raise RuntimeError("mcp.config returned an unknown or incomplete transport")


def _bounded_json_value(value: Any, label: str) -> Any:
    """Return a strict JSON-normalized value capped at the shared 8 MiB bound."""
    if hasattr(value, "model_dump"):
        value = value.model_dump(mode="json")
    try:
        encoded = json.dumps(
            value, ensure_ascii=False, separators=(",", ":"), allow_nan=False
        ).encode("utf-8")
    except (TypeError, ValueError) as exc:
        raise ValueError(f"{label} is not strict JSON") from exc
    if len(encoded) > MAX_ARGUMENT_BYTES:
        raise ValueError(f"{label} exceeds the {MAX_ARGUMENT_BYTES}-byte safety limit")
    return json.loads(encoded)


class McpIntegration:
    """Subclass and set :attr:`server` (and :attr:`url` for remote servers).

    Tools are discovered on first use and bound as async methods via
    ``__getattr__``; ``await self.call_tool(name, args)`` is the explicit escape
    hatch and the hook for hand-written typed wrappers.
    """

    #: Credential / config key for this integration (matches the auth.json entry
    #: ``mcp:<server>`` and the mcpServers settings key).
    server: str = ""

    #: Remote MCP endpoint. Required unless a subclass overrides ``_open_streams``.
    url: str | None = None

    #: Optional env var holding a static bearer token (used instead of auth.json OAuth).
    bearer_token_env: str | None = None

    #: Per-integration host bridge timeout in seconds. ``None`` uses the runtime
    #: default or the ``RLM_HOST_REQUEST_TIMEOUT`` environment override.
    host_request_timeout: float | None = None

    #: Bound for each direct HTTP connect, initialize, list, and call phase.
    direct_http_timeout: float = 30.0

    #: Sidecars may opt into unauthenticated HTTP while ordinary integrations
    #: continue to require configured credentials.
    credentials_optional: bool = False

    def __init__(self) -> None:
        if not self.server:
            raise ValueError(f"{type(self).__name__} must set a non-empty `server`")
        self._tools: dict[str, Any] | None = None
        self._tools_config_identity: tuple[Any, ...] | None = None
        self._lock = asyncio.Lock()

    async def _host_request(
        self,
        request_type: str,
        payload: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """Forward a host request with this integration's timeout policy."""
        return await host_request(request_type, payload, timeout=self.host_request_timeout)

    def _host_bridge_payload(self, payload: dict[str, Any]) -> dict[str, Any]:
        """Attach an absolute deadline so queued host work can fail before execution."""
        timeout = _resolve_host_request_timeout(self.host_request_timeout)
        return {**payload, "deadlineEpochMs": int(time.time() * 1000 + timeout * 1000)}

    async def _await_direct(self, awaitable, operation: str):
        """Await one direct-HTTP phase with cancellation and a hard deadline."""
        timeout = self.direct_http_timeout
        if not isinstance(timeout, (int, float)) or isinstance(timeout, bool) or timeout <= 0:
            raise ValueError("direct_http_timeout must be a positive number of seconds")
        try:
            return await asyncio.wait_for(awaitable, timeout=float(timeout))
        except TimeoutError as exc:
            raise TimeoutError(
                f"MCP HTTP {operation} for '{self.server}' timed out after {timeout:g}s"
            ) from exc

    # -- credentials --------------------------------------------------------

    @property
    def _provider_id(self) -> str:
        return f"mcp:{self.server}"

    def _stored_token(self) -> str | None:
        """Current usable token from auth.json only (never an environment token)."""
        cred = _read_auth(self._provider_id)
        if cred is None:
            return None
        if cred.get("type") == "api_key":
            return _resolve_config_value(str(cred.get("key") or "")) or None
        access = str(cred.get("access") or "")
        expires = cred.get("expires")
        fresh = isinstance(expires, (int, float)) and (
            time.time() * 1000 < expires - _EXPIRY_SKEW_SECONDS * 1000
        )
        return access if access and fresh else None

    def _token(self) -> str | None:
        """Current class-catalog environment token, then auth.json token."""
        if self.bearer_token_env:
            env_token = os.environ.get(self.bearer_token_env, "").strip()
            if env_token:
                return env_token
        return self._stored_token()

    async def _resolve_stored_token(self) -> str:
        token = self._stored_token()
        if token:
            return token
        if _read_auth(self._provider_id) is not None:
            refresh_error: Exception | None = None
            try:
                await self._host_request("mcp.refresh", {"server": self.server})
            except RuntimeError as exc:
                refresh_error = exc
            token = self._stored_token()
            if token:
                return token
            if refresh_error is not None:
                raise RuntimeError(
                    f"Failed to refresh credentials for '{self.server}': {refresh_error}"
                ) from refresh_error
        raise NotEnabled(self.server)

    async def _resolve_token(self) -> str:
        if self.bearer_token_env:
            env_token = os.environ.get(self.bearer_token_env, "").strip()
            if env_token:
                return env_token
        return await self._resolve_stored_token()

    # -- connection ---------------------------------------------------------

    async def _resolve_host_config(self) -> dict[str, Any]:
        """Read host metadata, failing closed on host errors or malformed replies.

        Only a successful empty or generation-only mapping is unconfigured and
        permits the documented class/environment fallback. An exception, timeout,
        invalid response, or explicit disable never permits fallback.
        """
        cfg = await self._host_request("mcp.config", {"server": self.server})
        if not isinstance(cfg, dict):
            raise RuntimeError("mcp.config returned an invalid configuration")
        return _validate_host_config_shape(cfg, self.server)

    @staticmethod
    def _is_host_bridge_config(cfg: dict[str, Any]) -> bool:
        return cfg.get("type") == "stdio" and cfg.get("bridge") == "host"

    async def _uses_host_bridge(self) -> bool:
        cfg = await self._resolve_host_config()
        return self._is_host_bridge_config(cfg)

    @staticmethod
    def _tool_allowed_from_config(tool: str, cfg: dict[str, Any]) -> bool:
        enabled = cfg.get("enabledTools")
        if isinstance(enabled, list) and tool not in enabled:
            return False
        disabled = cfg.get("disabledTools")
        return not isinstance(disabled, list) or tool not in disabled

    async def _tool_allowed(self, tool: str, config: dict[str, Any] | None = None) -> bool:
        """Apply host-configured tool allow/deny lists to an optional config snapshot."""
        cfg = config if config is not None else await self._resolve_host_config()
        return self._tool_allowed_from_config(tool, cfg)

    def _fallback_url(self) -> str | None:
        """Return the trusted integration fallback used after successful empty config."""
        return self.url

    def _config_identity(self, cfg: dict[str, Any]) -> tuple[Any, ...]:
        """Non-secret identity for cached discovery invalidation."""
        configured_url = cfg.get("url")
        endpoint = configured_url if isinstance(configured_url, str) and configured_url else self._fallback_url()
        generation = cfg.get("generation")
        if not isinstance(generation, (int, float)) or isinstance(generation, bool):
            generation = None
        enabled = cfg.get("enabledTools")
        disabled = cfg.get("disabledTools")
        header_names = cfg.get("headers")
        endpoint_identity = (
            hashlib.sha256(endpoint.encode("utf-8")).hexdigest()
            if isinstance(endpoint, str)
            else None
        )
        return (
            generation,
            cfg.get("type"),
            cfg.get("bridge"),
            endpoint_identity,
            tuple(enabled) if isinstance(enabled, list) else None,
            tuple(disabled) if isinstance(disabled, list) else None,
            tuple(sorted(str(key).lower() for key in header_names))
            if isinstance(header_names, dict)
            else None,
        )

    def _headers_for_config(self, cfg: dict[str, Any], url: str) -> dict[str, str]:
        headers = cfg.get("headers")
        extra = headers if isinstance(headers, dict) else {}
        return {str(k): str(v) for k, v in extra.items()}

    def _allow_stored_auth(self, cfg: dict[str, Any], url: str) -> bool:
        return True

    async def _resolve_config(self) -> tuple[str | None, dict[str, str]]:
        """Resolve URL and headers after a successful host config lookup."""
        cfg = await self._resolve_host_config()
        configured_url = cfg.get("url")
        url = configured_url if isinstance(configured_url, str) and configured_url else self._fallback_url()
        if not url:
            return None, {}
        return url, self._headers_for_config(cfg, url)

    async def _open_session(
        self,
        stack: AsyncExitStack,
        config: dict[str, Any] | None = None,
    ):
        """Open an initialized direct HTTP session using one config snapshot."""
        import inspect  # noqa: PLC0415

        from mcp import ClientSession  # noqa: PLC0415

        cfg = config if config is not None else await self._resolve_host_config()
        configured_url = cfg.get("url")
        url = configured_url if isinstance(configured_url, str) and configured_url else self._fallback_url()
        if not url:
            raise ValueError(
                f"{type(self).__name__} must set `url` or override `_open_session`"
            )
        url = _validate_http_endpoint(url)
        headers = self._headers_for_config(cfg, url)

        token: str | None = None
        if cfg.get("type") == "http":
            bearer_env = cfg.get("bearerTokenEnvVar")
            if isinstance(bearer_env, str):
                token = os.environ.get(bearer_env, "").strip() or None
            if token is None and cfg.get("allowStoredAuth") is True:
                try:
                    token = await self._resolve_stored_token()
                except NotEnabled:
                    if not self.credentials_optional:
                        raise
            elif token is None and not self.credentials_optional:
                raise NotEnabled(self.server)
        elif self._allow_stored_auth(cfg, url):
            try:
                token = await self._resolve_token()
            except NotEnabled:
                if not self.credentials_optional:
                    raise
        elif self.bearer_token_env:
            # An environment fallback may receive only credentials from the same
            # environment source, never auth.json or host-configured headers.
            token = os.environ.get(self.bearer_token_env, "").strip() or None
        if token:
            headers["Authorization"] = f"Bearer {token}"
        # Counted wire bytes must equal decoded bytes; compressed responses could
        # otherwise expand after the stream cap and create a decompression bomb.
        headers["Accept-Encoding"] = "identity"

        transport = _resolve_streamable_http()
        params = inspect.signature(transport).parameters
        if "http_client" in params:
            import httpx  # noqa: PLC0415

            client = await self._await_direct(
                stack.enter_async_context(
                    httpx.AsyncClient(
                        headers=headers,
                        timeout=float(self.direct_http_timeout),
                        event_hooks={"response": [_bounded_http_response_hook()]},
                    )
                ),
                "connect",
            )
            cm = transport(url, http_client=client)
        elif "headers" in params:
            raise RuntimeError(
                "the installed MCP streamable-HTTP transport cannot accept a bounded "
                "http_client; upgrade the `mcp` SDK before using direct HTTP"
            )
        else:
            raise RuntimeError(
                f"unsupported mcp streamable-HTTP client signature: {tuple(params)}"
            )

        read, write, *_ = await self._await_direct(stack.enter_async_context(cm), "connect")
        session = await self._await_direct(
            stack.enter_async_context(ClientSession(read, write)), "connect"
        )
        await self._await_direct(session.initialize(), "initialize")
        return session

    # -- tools --------------------------------------------------------------

    async def list_tools(self) -> list[dict[str, Any]]:
        """Return the server's tools as ``[{name, description, inputSchema}]``."""
        config = await self._ensure_tools()
        tools = [dict(t) for t in (self._tools or {}).values()]
        return [tool for tool in tools if self._tool_allowed_from_config(str(tool["name"]), config)]

    async def _ensure_tools(self) -> dict[str, Any]:
        async with self._lock:
            config = await self._resolve_host_config()
            identity = self._config_identity(config)
            if self._tools is not None and self._tools_config_identity is None:
                # Preserve explicitly pre-seeded tools used by hand-written integrations.
                self._tools_config_identity = identity
                return config
            if self._tools is not None and self._tools_config_identity == identity:
                return config
            # Discard old discovery before querying a changed endpoint/generation.
            self._tools = None
            self._tools_config_identity = None
            if self._is_host_bridge_config(config):
                payload = await self._host_request(
                    "mcp.list_tools",
                    self._host_bridge_payload({"server": self.server}),
                )
                tools = payload.get("tools") if isinstance(payload, dict) else None
                if not isinstance(tools, list):
                    raise RuntimeError("mcp.list_tools returned an invalid tools list")
                discovered = [
                    {
                        "name": tool["name"],
                        "description": tool.get("description", "") or "",
                        "inputSchema": tool.get("inputSchema") or {},
                    }
                    for tool in tools
                    if isinstance(tool, dict) and isinstance(tool.get("name"), str)
                ]
                normalized = _bounded_json_value(discovered, "MCP tool discovery metadata")
                self._tools = {tool["name"]: tool for tool in normalized}
                self._tools_config_identity = identity
                return config
            async with AsyncExitStack() as stack:
                session = await self._open_session(stack, config)
                resp = await self._await_direct(session.list_tools(), "list tools")
                discovered = [
                    {
                        "name": t.name,
                        "description": getattr(t, "description", "") or "",
                        "inputSchema": getattr(t, "inputSchema", None) or {},
                    }
                    for t in resp.tools
                ]
                normalized = _bounded_json_value(discovered, "MCP tool discovery metadata")
                self._tools = {tool["name"]: tool for tool in normalized}
            self._tools_config_identity = identity
            return config

    async def call_tool(self, tool: str, arguments: dict[str, Any] | None = None) -> Any:
        """Call ``tool`` on the server and return its parsed result.

        Stdio integrations use the host bridge: the TypeScript host owns one
        long-lived process per configured server, so snapshot/restore never
        serializes a process, pipe, SDK session, or event-loop transport.
        HTTP integrations retain the existing fresh-session behavior.
        """
        validated_arguments = _validated_arguments(arguments)
        config = await self._resolve_host_config()
        if not self._tool_allowed_from_config(tool, config):
            raise PermissionError(f"MCP tool '{tool}' is not allowed by settings")
        if self._is_host_bridge_config(config):
            payload = await self._host_request(
                "mcp.call_tool",
                self._host_bridge_payload(
                    {"server": self.server, "tool": tool, "arguments": validated_arguments}
                ),
            )
            if not isinstance(payload, dict) or "result" not in payload:
                raise RuntimeError("mcp.call_tool returned an invalid result")
            return _parse_result(payload["result"])
        async with AsyncExitStack() as stack:
            session = await self._open_session(stack, config)
            result = await self._await_direct(
                session.call_tool(tool, validated_arguments), "call tool"
            )
        return _parse_result(result)

    def __getattr__(self, name: str):
        # Only reached for names not found normally; bind as an async tool call.
        if name.startswith("_"):
            raise AttributeError(name)

        async def _call(**kwargs: Any) -> Any:
            await self._ensure_tools()
            if self._tools is not None and name not in self._tools:
                available = ", ".join(sorted(self._tools)) or "(none)"
                raise AttributeError(
                    f"'{self.server}' has no tool '{name}'. Available: {available}"
                )
            return await self.call_tool(name, kwargs)

        _call.__name__ = name
        _call.__qualname__ = f"{type(self).__name__}.{name}"
        if self._tools and name in self._tools:
            schema = self._tools[name].get("inputSchema") or {}
            desc = self._tools[name].get("description") or ""
            _call.__doc__ = f"{desc}\n\nArguments (JSON Schema):\n{json.dumps(schema, indent=2)}"
        return _call


def _parse_result(result: Any) -> Any:
    """Normalize a CallToolResult into plain Python (structured output preferred).

    Raises McpToolError when the server flags the result as an error, so a failed
    tool call doesn't look like a successful one to the caller.
    """
    if isinstance(result, dict):
        blocks = result.get("content") or []
        is_error = bool(result.get("isError", False))
        structured = result.get("structuredContent")
    else:
        blocks = getattr(result, "content", None) or []
        is_error = bool(getattr(result, "isError", False))
        structured = getattr(result, "structuredContent", None)

    texts: list[str] = []
    for block in blocks:
        text = block.get("text") if isinstance(block, dict) else getattr(block, "text", None)
        if text is not None:
            texts.append(str(text))
    if is_error:
        joined = _join_bounded_texts(texts, "MCP error result")
        message = _bounded_json_value(
            joined or "MCP tool returned an error", "MCP error result"
        )
        raise McpToolError(message)

    if structured is not None:  # falsy-but-valid payloads ({} / []) are real results
        return _bounded_json_value(structured, "MCP tool result")
    if texts:
        return _bounded_json_value(
            _join_bounded_texts(texts, "MCP tool result"), "MCP tool result"
        )

    # Non-text content (images, embedded resources): return them as plain dicts
    # rather than the opaque SDK object so callers get usable data.
    if blocks:
        plain_blocks = [
            b.model_dump(mode="json") if hasattr(b, "model_dump") else b for b in blocks
        ]
        return _bounded_json_value(plain_blocks, "MCP tool result")
    if not isinstance(result, (dict, list, str, int, float, bool, type(None))) and hasattr(
        result, "content"
    ):
        return _bounded_json_value(
            {
                "content": [],
                "isError": is_error,
                "structuredContent": structured,
            },
            "MCP tool result",
        )
    return _bounded_json_value(result, "MCP tool result")
