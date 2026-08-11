"""Optional MCP adapter for a separately installed jCodeMunch sidecar."""

from __future__ import annotations

import os
import shutil
from contextlib import AsyncExitStack
from typing import Any

from rlm import McpIntegration, mcp_base

__all__ = ["JCodeMunch", "SidecarUnavailable", "jcodemunch"]


class SidecarUnavailable(RuntimeError):
    """Raised when no HTTP or host-managed stdio transport is configured."""


class JCodeMunch(McpIntegration):
    """jCodeMunch's stable structured retrieval surface, discovered at runtime."""

    server = "jcodemunch"
    url = None
    bearer_token_env = "JCODEMUNCH_MCP_TOKEN"
    credentials_optional = True
    executable = "jcodemunch-mcp"
    endpoint_env = "JCODEMUNCH_MCP_URL"
    supported_tools = frozenset(
        {
            "search_symbols",
            "get_file_outline",
            "get_symbol_source",
            "get_context_bundle",
            "get_ranked_context",
            "find_references",
            "find_importers",
            "get_blast_radius",
            "get_changed_symbols",
            "plan_turn",
            "assemble_task_context",
        }
    )

    def _fallback_url(self) -> str | None:
        return self.url or os.environ.get(self.endpoint_env, "").strip() or None

    def _using_environment_fallback(self, config: dict[str, Any]) -> bool:
        configured_url = config.get("url")
        return not (isinstance(configured_url, str) and configured_url) and bool(
            os.environ.get(self.endpoint_env, "").strip()
        )

    def _headers_for_config(self, config: dict[str, Any], url: str) -> dict[str, str]:
        if self._using_environment_fallback(config):
            return {}
        return super()._headers_for_config(config, url)

    def _allow_stored_auth(self, config: dict[str, Any], url: str) -> bool:
        return not self._using_environment_fallback(config)

    async def available(self) -> dict[str, Any]:
        """Return a diagnostic without installing, starting, or upgrading a sidecar."""
        try:
            config = await self._resolve_host_config()
        except mcp_base.Disabled:
            config = {}
            disabled = True
        else:
            disabled = False

        host_stdio = (
            not disabled
            and config.get("type") == "stdio"
            and config.get("bridge") == "host"
        )
        url = None
        if not disabled:
            url = config.get("url")
            if not isinstance(url, str) or not url:
                url = self._fallback_url()
        endpoint = None if disabled or host_stdio else url
        executable = shutil.which(self.executable)
        return {
            "configured": host_stdio or endpoint is not None,
            "disabled": disabled,
            "endpoint": endpoint,
            "transport": "stdio" if host_stdio else "http" if endpoint else None,
            "executable": executable,
            "stdio_only": (
                not disabled and not host_stdio and executable is not None and endpoint is None
            ),
        }

    async def _open_session(
        self,
        stack: AsyncExitStack,
        config: dict[str, Any] | None = None,
    ):
        try:
            return await super()._open_session(stack, config)
        except mcp_base.Disabled as exc:
            raise SidecarUnavailable(
                "jCodeMunch is disabled in Prime Agent settings. Enable "
                "mcpServers.jcodemunch before using this skill."
            ) from exc
        except ValueError as exc:
            if "must set `url`" not in str(exc):
                raise
            diagnostic = await self.available()
            if diagnostic["stdio_only"]:
                raise SidecarUnavailable(
                    "jCodeMunch is installed as a local command, but it is not configured "
                    "as a host-managed stdio server. Configure the separately installed "
                    "command or an HTTP endpoint."
                ) from exc
            raise SidecarUnavailable(
                "jCodeMunch is unavailable: configure JCODEMUNCH_MCP_URL or "
                "a host HTTP/stdio entry. The skill does not manage sidecars."
            ) from exc

    async def list_tools(self) -> list[dict[str, Any]]:
        tools = await super().list_tools()
        return [tool for tool in tools if tool["name"] in self.supported_tools]

    async def call_tool(self, tool: str, arguments: dict[str, Any] | None = None) -> Any:
        if tool not in self.supported_tools:
            raise AttributeError(f"jCodeMunch tool '{tool}' is not part of this skill's retrieval surface")
        tools = {item["name"] for item in await super().list_tools()}
        if tool not in tools:
            available = ", ".join(sorted(tools & self.supported_tools)) or "(none)"
            raise AttributeError(f"jCodeMunch does not provide '{tool}'. Available: {available}")
        return await super().call_tool(tool, arguments)


jcodemunch = JCodeMunch()

_RESERVED = {"run", "__wrapped__", "__call__"}


def __getattr__(name: str):
    if name.startswith("_") or name in _RESERVED:
        raise AttributeError(name)
    return getattr(jcodemunch, name)
