from __future__ import annotations

import asyncio
import json
import tempfile
import time
import unittest
from contextlib import AsyncExitStack
from pathlib import Path
from unittest import mock

import rlm as rlm_module
from rlm import mcp_base
from rlm.mcp_base import McpIntegration, McpToolError, NotEnabled


def _run(coro):
    return asyncio.run(coro)


class _FakeSession:
    """Stand-in for an mcp ClientSession with canned tools/results."""

    def __init__(self, tools, result):
        self._tools = tools
        self._result = result
        self.calls = []

    async def list_tools(self):
        Tool = type("Tool", (), {})

        def make(name, desc, schema):
            t = Tool()
            t.name = name
            t.description = desc
            t.inputSchema = schema
            return t

        resp = type("Resp", (), {})()
        resp.tools = [make(*t) for t in self._tools]
        return resp

    async def call_tool(self, name, arguments):
        self.calls.append((name, arguments))
        return self._result


class _Integration(McpIntegration):
    server = "demo"
    url = "https://example.test/mcp"


class _FakeComm:
    instances = []

    def __init__(self, **kwargs):
        self.kwargs = kwargs
        self._on_msg = None
        self.close_calls = 0
        self.open_data = None
        type(self).instances.append(self)

    def on_msg(self, callback):
        self._on_msg = callback

    def open(self, data=None):
        self.open_data = data

    def close(self):
        self.close_calls += 1

    def deliver(self, data):
        assert self._on_msg is not None
        self._on_msg({"content": {"data": data}})


class HostRequestTest(unittest.TestCase):
    def setUp(self):
        _FakeComm.instances.clear()

    def test_timeout_uses_env_override_and_closes_comm(self):
        async def exercise():
            with mock.patch.object(rlm_module, "Comm", _FakeComm), mock.patch.dict(
                "os.environ", {"RLM_HOST_REQUEST_TIMEOUT": "0.01"}
            ):
                with self.assertRaisesRegex(TimeoutError, "mcp.timeout"):
                    await rlm_module.host_request("mcp.timeout")

        _run(exercise())
        self.assertEqual(len(_FakeComm.instances), 1)
        self.assertEqual(_FakeComm.instances[0].close_calls, 1)

    def test_cancellation_closes_comm_and_names_request(self):
        async def exercise():
            with mock.patch.object(rlm_module, "Comm", _FakeComm):
                task = asyncio.create_task(rlm_module.host_request("mcp.cancel"))
                await asyncio.sleep(0)
                task.cancel()
                with self.assertRaisesRegex(asyncio.CancelledError, "mcp.cancel"):
                    await task

        _run(exercise())
        self.assertEqual(len(_FakeComm.instances), 1)
        self.assertEqual(_FakeComm.instances[0].close_calls, 1)

    def test_late_reply_after_timeout_is_ignored_and_does_not_reclose(self):
        async def exercise():
            with mock.patch.object(rlm_module, "Comm", _FakeComm):
                with self.assertRaises(TimeoutError):
                    await rlm_module.host_request("mcp.late", timeout=0.01)
                comm = _FakeComm.instances[0]
                comm.deliver({"status": "ok", "value": "late"})
                await asyncio.sleep(0)
                self.assertEqual(comm.close_calls, 1)

        _run(exercise())


class McpIntegrationTest(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.agent_dir = Path(self._tmp.name)
        self.auth_path = self.agent_dir / "auth.json"
        patcher = mock.patch.object(mcp_base, "_agent_dir", return_value=self.agent_dir)
        patcher.start()
        self.addCleanup(patcher.stop)
        self.addCleanup(self._tmp.cleanup)

    def _write_auth(self, cred):
        self.auth_path.write_text(json.dumps({"mcp:demo": cred}))

    def _patch_session(self, session):
        # Replace _open_session so no real network/SDK is needed.
        async def fake_open(self_, stack: AsyncExitStack, config=None):
            return session

        return mock.patch.object(_Integration, "_open_session", fake_open)

    def test_not_enabled_without_credentials(self):
        integration = _Integration()
        with self.assertRaises(NotEnabled):
            _run(integration._resolve_token())

    def test_reads_oauth_access_token(self):
        self._write_auth(
            {"type": "oauth", "access": "tok-123", "refresh": "r", "expires": (time.time() + 3600) * 1000}
        )
        self.assertEqual(_run(_Integration()._resolve_token()), "tok-123")

    def test_reads_api_key(self):
        self._write_auth({"type": "api_key", "key": "key-abc"})
        self.assertEqual(_run(_Integration()._resolve_token()), "key-abc")

    def test_api_key_env_indirection_resolved(self):
        self._write_auth({"type": "api_key", "key": "MY_MCP_KEY"})
        with mock.patch.dict("os.environ", {"MY_MCP_KEY": "resolved-secret"}):
            self.assertEqual(_run(_Integration()._resolve_token()), "resolved-secret")

    def test_refreshes_via_host_when_expired(self):
        self._write_auth(
            {"type": "oauth", "access": "old", "refresh": "r", "expires": (time.time() - 10) * 1000}
        )

        async def fake_host_request(req_type, payload, **kwargs):
            self.assertEqual(req_type, "mcp.refresh")
            self.assertEqual(payload, {"server": "demo"})
            # Simulate the host rewriting auth.json with a fresh token.
            self._write_auth(
                {"type": "oauth", "access": "new", "refresh": "r", "expires": (time.time() + 3600) * 1000}
            )
            return {}

        with mock.patch.object(mcp_base, "host_request", fake_host_request):
            self.assertEqual(_run(_Integration()._resolve_token()), "new")

    def test_not_enabled_when_refresh_leaves_token_expired(self):
        # Host refresh "succeeds" but auth.json still holds an expired token →
        # must raise NotEnabled, not return the stale access value.
        self._write_auth(
            {"type": "oauth", "access": "stale", "refresh": "r", "expires": (time.time() - 10) * 1000}
        )

        async def fake_host_request(req_type, payload, **kwargs):
            return {}  # no-op: token stays expired

        with mock.patch.object(mcp_base, "host_request", fake_host_request):
            with self.assertRaises(NotEnabled):
                _run(_Integration()._resolve_token())

    def test_refresh_failure_surfaces_as_error_not_not_enabled(self):
        # Creds exist but the host refresh fails transiently → surface a refresh
        # error, not a misleading NotEnabled (which implies re-login).
        self._write_auth(
            {"type": "oauth", "access": "stale", "refresh": "r", "expires": (time.time() - 10) * 1000}
        )

        async def failing_host_request(req_type, payload, **kwargs):
            raise RuntimeError("network down")

        with mock.patch.object(mcp_base, "host_request", failing_host_request):
            with self.assertRaises(RuntimeError) as ctx:
                _run(_Integration()._resolve_token())
        self.assertNotIsInstance(ctx.exception, NotEnabled)
        self.assertIn("refresh", str(ctx.exception).lower())

    def test_bearer_token_env_wins(self):
        class EnvIntegration(_Integration):
            bearer_token_env = "DEMO_MCP_TOKEN"

        with mock.patch.dict("os.environ", {"DEMO_MCP_TOKEN": "env-secret"}):
            self.assertEqual(_run(EnvIntegration()._resolve_token()), "env-secret")

    def test_empty_structured_result_preserved(self):
        for payload in ({}, []):
            result = type("R", (), {"structuredContent": payload, "content": [], "isError": False})()
            self.assertEqual(mcp_base._parse_result(result), payload)

    def test_error_result_raises(self):
        block = type("B", (), {"text": "boom"})()
        result = type("R", (), {"isError": True, "content": [block], "structuredContent": None})()
        with self.assertRaises(McpToolError) as ctx:
            mcp_base._parse_result(result)
        self.assertIn("boom", str(ctx.exception))

    def test_auto_bound_tool_calls_session(self):
        session = _FakeSession(
            tools=[("list_issues", "List issues", {"type": "object"})],
            result=type("R", (), {"structuredContent": {"issues": [1, 2]}})(),
        )
        self._write_auth(
            {"type": "oauth", "access": "t", "refresh": "r", "expires": (time.time() + 3600) * 1000}
        )
        with self._patch_session(session), mock.patch.object(
            _Integration, "_resolve_host_config", new=mock.AsyncMock(return_value={})
        ):
            integration = _Integration()
            out = _run(integration.list_issues(team="Eng"))
        self.assertEqual(out, {"issues": [1, 2]})
        self.assertEqual(session.calls, [("list_issues", {"team": "Eng"})])

    def test_unknown_tool_raises_with_available_list(self):
        session = _FakeSession(tools=[("list_issues", "", {})], result=None)
        self._write_auth(
            {"type": "oauth", "access": "t", "refresh": "r", "expires": (time.time() + 3600) * 1000}
        )
        with self._patch_session(session), mock.patch.object(
            _Integration, "_resolve_host_config", new=mock.AsyncMock(return_value={})
        ):
            integration = _Integration()
            with self.assertRaises(AttributeError) as ctx:
                _run(integration.nonexistent_tool())
        self.assertIn("list_issues", str(ctx.exception))

    def test_text_result_parsing(self):
        block = type("B", (), {"text": "hello"})()
        result = type("R", (), {"content": [block], "structuredContent": None})()
        self.assertEqual(mcp_base._parse_result(result), "hello")

    def test_requires_server_attribute(self):
        class Bad(McpIntegration):
            server = ""

        with self.assertRaises(ValueError):
            Bad()

    def _run_open_session_with_transport(self, transport):
        """Drive the real _open_session against a fake transport callable.

        `transport` must declare its real parameters (headers= or http_client=)
        so the signature inspection in _open_session is exercised faithfully.
        """
        self._write_auth(
            {"type": "oauth", "access": "tok-xyz", "refresh": "r", "expires": (time.time() + 3600) * 1000}
        )

        async def fake_host_request(req_type, payload, **kwargs):
            return {}  # no host URL override; _resolve_url falls back to self.url

        with mock.patch.object(mcp_base, "host_request", fake_host_request), \
             mock.patch.object(mcp_base, "_resolve_streamable_http", lambda: transport), \
             mock.patch("mcp.ClientSession") as session_cls:
            session = mock.MagicMock()
            session.initialize = mock.AsyncMock()
            session.call_tool = mock.AsyncMock(
                return_value=type("R", (), {"content": [], "structuredContent": None})()
            )
            session_cls.return_value.__aenter__ = mock.AsyncMock(return_value=session)
            session_cls.return_value.__aexit__ = mock.AsyncMock(return_value=False)
            _run(_Integration().call_tool("noop", {}))

    def test_open_session_uses_headers_signature(self):
        # streamablehttp_client(url, headers=...)
        captured = {}

        class _CM:
            async def __aenter__(self_inner):
                return ("read", "write", None)

            async def __aexit__(self_inner, *a):
                return False

        def transport(url, headers=None):
            captured["headers"] = headers
            return _CM()

        with self.assertRaisesRegex(RuntimeError, "cannot accept a bounded http_client"):
            self._run_open_session_with_transport(transport)
        self.assertEqual(captured, {})

    def test_open_session_uses_http_client_signature(self):
        # streamable_http_client(url, *, http_client=...) — must NOT pass headers=
        captured = {}

        class _CM:
            async def __aenter__(self_inner):
                return ("read", "write", None)

            async def __aexit__(self_inner, *a):
                return False

        def transport(url, *, http_client=None):
            captured["http_client"] = http_client
            return _CM()

        self._run_open_session_with_transport(transport)
        self.assertIsNotNone(captured["http_client"])

    def test_resolve_config_denies_an_explicitly_disabled_server(self):
        async def host_disabled(req_type, payload, **kwargs):
            return {"enabled": False}

        with mock.patch.object(mcp_base, "host_request", host_disabled):
            with self.assertRaisesRegex(mcp_base.Disabled, "disabled"):
                _run(_Integration()._resolve_config())

    def test_stdio_bridge_uses_host_process_without_opening_python_sessions(self):
        calls = []

        async def host_request_bridge(req_type, payload, **kwargs):
            calls.append((req_type, payload))
            if req_type == "mcp.config":
                return {"type": "stdio", "bridge": "host"}
            if req_type == "mcp.list_tools":
                return {"tools": [{"name": "echo", "description": "Echo", "inputSchema": {}}]}
            if req_type == "mcp.call_tool":
                return {"result": {"structuredContent": {"ok": payload["arguments"]}, "content": []}}
            raise AssertionError(req_type)

        with mock.patch.object(mcp_base, "host_request", host_request_bridge):
            with mock.patch.object(_Integration, "_open_session", side_effect=AssertionError("HTTP session opened")):
                integration = _Integration()
                self.assertEqual(_run(integration.list_tools()), [{"name": "echo", "description": "Echo", "inputSchema": {}}])
                self.assertEqual(_run(integration.call_tool("echo", {"value": 1})), {"ok": {"value": 1}})
        self.assertEqual(
            [call[0] for call in calls],
            ["mcp.config", "mcp.list_tools", "mcp.config", "mcp.call_tool"],
        )

    def test_host_request_timeout_propagates_through_bridge_calls(self):
        calls = []

        async def host_request_bridge(req_type, payload, **kwargs):
            calls.append((req_type, kwargs.get("timeout")))
            if req_type == "mcp.config":
                return {"type": "stdio", "bridge": "host"}
            if req_type == "mcp.list_tools":
                return {"tools": [{"name": "echo", "description": "", "inputSchema": {}}]}
            if req_type == "mcp.call_tool":
                return {"result": {"structuredContent": {"ok": True}, "content": []}}
            raise AssertionError(req_type)

        with mock.patch.object(mcp_base, "host_request", host_request_bridge):
            integration = _Integration()
            integration.host_request_timeout = 0.25
            self.assertEqual(_run(integration.list_tools())[0]["name"], "echo")
            self.assertEqual(_run(integration.call_tool("echo")), {"ok": True})

        self.assertEqual(
            calls,
            [
                ("mcp.config", 0.25),
                ("mcp.list_tools", 0.25),
                ("mcp.config", 0.25),
                ("mcp.call_tool", 0.25),
            ],
        )

    def test_list_tools_resolves_filter_config_once_for_many_tools(self):
        calls = []

        async def host_request_many_tools(req_type, payload, **kwargs):
            calls.append((req_type, payload))
            if req_type == "mcp.config":
                return {
                    "type": "stdio",
                    "bridge": "host",
                    "enabledTools": ["tool-0", "tool-2"],
                }
            if req_type == "mcp.list_tools":
                return {
                    "tools": [
                        {"name": f"tool-{index}", "description": "", "inputSchema": {}}
                        for index in range(81)
                    ]
                }
            raise AssertionError(req_type)

        with mock.patch.object(mcp_base, "host_request", host_request_many_tools):
            tools = _run(_Integration().list_tools())

        self.assertEqual([tool["name"] for tool in tools], ["tool-0", "tool-2"])
        self.assertEqual([call[0] for call in calls], ["mcp.config", "mcp.list_tools"])

    def test_host_bridge_parses_error_result(self):
        async def host_request_error(req_type, payload, **kwargs):
            if req_type == "mcp.config":
                return {"type": "stdio", "bridge": "host"}
            return {"result": {"isError": True, "content": [{"text": "boom"}]}}

        with mock.patch.object(mcp_base, "host_request", host_request_error):
            with self.assertRaisesRegex(McpToolError, "boom"):
                _run(_Integration().call_tool("echo"))

    def test_resolve_config_prefers_host_override_and_headers(self):
        async def host_with_override(req_type, payload, **kwargs):
            return {"type": "http", "url": "https://override.test/mcp", "headers": {"X-Extra": "1"}}

        async def host_empty(req_type, payload, **kwargs):
            return {}

        with mock.patch.object(mcp_base, "host_request", host_with_override):
            url, headers = _run(_Integration()._resolve_config())
            self.assertEqual(url, "https://override.test/mcp")
            self.assertEqual(headers, {"X-Extra": "1"})
        with mock.patch.object(mcp_base, "host_request", host_empty):
            url, headers = _run(_Integration()._resolve_config())
            self.assertEqual(url, _Integration.url)
            self.assertEqual(headers, {})


    def test_host_tool_allowlists_apply_to_http_integrations(self):
        integration = _Integration()
        integration._tools = {
            "allowed": {"name": "allowed", "description": "", "inputSchema": {}},
            "blocked": {"name": "blocked", "description": "", "inputSchema": {}},
        }

        async def host_config(req_type, payload, **kwargs):
            self.assertEqual(req_type, "mcp.config")
            return {"type": "http", "url": _Integration.url, "enabledTools": ["allowed"]}

        with mock.patch.object(mcp_base, "host_request", host_config):
            self.assertEqual([tool["name"] for tool in _run(integration.list_tools())], ["allowed"])
            with self.assertRaisesRegex(PermissionError, "not allowed"):
                _run(integration.call_tool("blocked"))

    def test_malformed_successful_host_configs_fail_closed(self):
        invalid = [
            {"arbitrary": True},
            {"generation": -1},
            {"generation": 1.5},
            {"type": "http"},
            {"type": "http", "url": 7},
            {"type": "http", "url": "https://ok.test/mcp", "headers": {"X": 1}},
            {"type": "http", "url": "https://ok.test/mcp", "enabledTools": "x"},
            {"type": "http", "url": "https://ok.test/mcp", "disabledTools": [1]},
            {"type": "http", "url": "https://ok.test/mcp", "allowStoredAuth": 1},
            {"type": "http", "url": "https://ok.test/mcp", "bearerTokenEnvVar": ""},
            {"type": "http", "url": "https://ok.test/mcp", "extra": True},
            {"type": "stdio"},
            {"type": "stdio", "bridge": "python"},
            {"type": "stdio", "bridge": "host", "url": "https://wrong.test"},
            {"url": "https://missing-type.test/mcp"},
        ]

        for config in invalid:
            async def host(req_type, payload, **kwargs):
                return config
            with self.subTest(config=config), mock.patch.object(mcp_base, "host_request", host):
                with self.assertRaises(RuntimeError):
                    _run(_Integration()._resolve_host_config())

    def test_only_empty_or_generation_only_config_is_unconfigured(self):
        for config in ({}, {"generation": 0}, {"generation": 42}):
            async def host(req_type, payload, **kwargs):
                return config
            with self.subTest(config=config), mock.patch.object(mcp_base, "host_request", host):
                self.assertEqual(_run(_Integration()._resolve_host_config()), config)

    def test_catalog_token_does_not_leak_to_unattested_http_override(self):
        class CatalogIntegration(_Integration):
            bearer_token_env = "OFFICIAL_DEMO_TOKEN"
            credentials_optional = True

        captured = {}

        class Transport:
            async def __aenter__(self):
                return ("read", "write", None)
            async def __aexit__(self, *args):
                return False

        def transport(url, *, http_client=None):
            captured.update(url=url, authorization=http_client.headers.get("Authorization"))
            return Transport()

        config = {"type": "http", "url": "https://override.test/mcp"}
        integration = CatalogIntegration()
        self._write_auth({"type": "api_key", "key": "stored-secret"})
        with mock.patch.dict("os.environ", {"OFFICIAL_DEMO_TOKEN": "official-secret"}), mock.patch.object(
            mcp_base, "_resolve_streamable_http", return_value=transport
        ), mock.patch("mcp.ClientSession") as session_class:
            session = mock.MagicMock()
            session.initialize = mock.AsyncMock()
            session_class.return_value.__aenter__ = mock.AsyncMock(return_value=session)
            session_class.return_value.__aexit__ = mock.AsyncMock(return_value=False)
            _run(integration._open_session(AsyncExitStack(), config))
        self.assertEqual(captured, {"url": "https://override.test/mcp", "authorization": None})

    def test_configured_http_uses_only_attested_bearer_environment_variable(self):
        class CatalogIntegration(_Integration):
            bearer_token_env = "OFFICIAL_DEMO_TOKEN"
            credentials_optional = True

        captured = {}

        class Transport:
            async def __aenter__(self):
                return ("read", "write", None)
            async def __aexit__(self, *args):
                return False

        def transport(url, *, http_client=None):
            captured["authorization"] = http_client.headers.get("Authorization")
            return Transport()

        config = {
            "type": "http",
            "url": "https://override.test/mcp",
            "bearerTokenEnvVar": "OVERRIDE_TOKEN",
        }
        integration = CatalogIntegration()
        with mock.patch.dict(
            "os.environ",
            {"OFFICIAL_DEMO_TOKEN": "official-secret", "OVERRIDE_TOKEN": "override-secret"},
        ), mock.patch.object(
            mcp_base, "_resolve_streamable_http", return_value=transport
        ), mock.patch("mcp.ClientSession") as session_class:
            session = mock.MagicMock()
            session.initialize = mock.AsyncMock()
            session_class.return_value.__aenter__ = mock.AsyncMock(return_value=session)
            session_class.return_value.__aexit__ = mock.AsyncMock(return_value=False)
            _run(integration._open_session(AsyncExitStack(), config))
        self.assertEqual(captured["authorization"], "Bearer override-secret")

    def test_configured_http_reads_auth_json_only_when_attested(self):
        self._write_auth({"type": "api_key", "key": "stored-secret"})
        captured = {}

        class Transport:
            async def __aenter__(self):
                return ("read", "write", None)
            async def __aexit__(self, *args):
                return False

        def transport(url, *, http_client=None):
            captured["authorization"] = http_client.headers.get("Authorization")
            return Transport()

        config = {
            "type": "http",
            "url": "https://override.test/mcp",
            "allowStoredAuth": True,
        }
        integration = _Integration()
        with mock.patch.object(
            mcp_base, "_resolve_streamable_http", return_value=transport
        ), mock.patch("mcp.ClientSession") as session_class:
            session = mock.MagicMock()
            session.initialize = mock.AsyncMock()
            session_class.return_value.__aenter__ = mock.AsyncMock(return_value=session)
            session_class.return_value.__aexit__ = mock.AsyncMock(return_value=False)
            _run(integration._open_session(AsyncExitStack(), config))
        self.assertEqual(captured["authorization"], "Bearer stored-secret")

    def test_config_failure_never_falls_back_to_class_url(self):
        async def failing_config(req_type, payload, **kwargs):
            raise RuntimeError("host unavailable")

        with mock.patch.object(mcp_base, "host_request", failing_config):
            with self.assertRaisesRegex(RuntimeError, "host unavailable"):
                _run(_Integration()._resolve_config())

    def test_config_timeout_never_falls_back_to_class_url(self):
        async def timing_out(req_type, payload, **kwargs):
            raise TimeoutError("host timed out")

        with mock.patch.object(mcp_base, "host_request", timing_out):
            with self.assertRaisesRegex(TimeoutError, "host timed out"):
                _run(_Integration()._resolve_config())

    def test_tool_cache_invalidates_when_generation_changes(self):
        generation = {"value": 1}
        list_calls = []

        async def host(req_type, payload, **kwargs):
            if req_type == "mcp.config":
                return {"type": "stdio", "bridge": "host", "generation": generation["value"]}
            if req_type == "mcp.list_tools":
                list_calls.append(payload)
                return {"tools": [{"name": f"tool-{generation['value']}"}]}
            raise AssertionError(req_type)

        with mock.patch.object(mcp_base, "host_request", host):
            integration = _Integration()
            self.assertEqual(_run(integration.list_tools())[0]["name"], "tool-1")
            generation["value"] = 2
            self.assertEqual(_run(integration.list_tools())[0]["name"], "tool-2")
        self.assertEqual(len(list_calls), 2)
        self.assertTrue(all("deadlineEpochMs" in payload for payload in list_calls))
        self.assertTrue(all("deadline_epoch_ms" not in payload for payload in list_calls))

    def test_host_call_includes_deadline_derived_from_effective_timeout(self):
        seen = {}

        async def host(req_type, payload, **kwargs):
            if req_type == "mcp.config":
                return {"type": "stdio", "bridge": "host"}
            seen.update(payload)
            return {"result": {"structuredContent": {"ok": True}, "content": []}}

        integration = _Integration()
        integration.host_request_timeout = 2.0
        before = int(time.time() * 1000)
        with mock.patch.object(mcp_base, "host_request", host):
            _run(integration.call_tool("echo", {}))
        self.assertGreaterEqual(seen["deadlineEpochMs"], before + 1900)
        self.assertLessEqual(seen["deadlineEpochMs"], int(time.time() * 1000) + 2100)

    def test_plaintext_http_is_limited_to_loopback(self):
        for url in ("http://localhost:3000/mcp", "http://127.0.0.1/mcp", "http://[::1]/mcp", "https://remote.test/mcp"):
            self.assertEqual(mcp_base._validate_http_endpoint(url), url)
        for url in ("http://remote.test/mcp", "ftp://localhost/mcp", "https://user:secret@remote.test/mcp"):
            with self.assertRaises(ValueError):
                mcp_base._validate_http_endpoint(url)

    def test_argument_payload_bound_accepts_boundary_and_rejects_oversize(self):
        # Compact JSON for {"x":"..."} has eight bytes of structural overhead.
        boundary = {"x": "a" * (mcp_base.MAX_ARGUMENT_BYTES - 8)}
        normalized = mcp_base._validated_arguments(boundary)
        self.assertEqual(normalized, boundary)
        self.assertIsNot(normalized, boundary)
        with self.assertRaisesRegex(ValueError, "safety limit"):
            mcp_base._validated_arguments({"x": "a" * (mcp_base.MAX_ARGUMENT_BYTES - 7)})

    def test_concurrent_argument_mutation_cannot_bypass_validated_snapshot(self):
        entered_config = asyncio.Event()
        release_config = asyncio.Event()
        dispatched = []

        class Session:
            async def call_tool(self, tool, arguments):
                dispatched.append(arguments)
                return type("R", (), {"structuredContent": {"ok": True}, "content": []})()

        async def host_config(self_):
            entered_config.set()
            await release_config.wait()
            return {}

        async def open_session(self_, stack, config=None):
            return Session()

        async def exercise():
            arguments = {"value": "validated"}
            task = asyncio.create_task(_Integration().call_tool("echo", arguments))
            await entered_config.wait()
            arguments["value"] = "x" * (mcp_base.MAX_ARGUMENT_BYTES + 1)
            release_config.set()
            await task

        with mock.patch.object(_Integration, "_resolve_host_config", host_config), mock.patch.object(
            _Integration, "_open_session", open_session
        ):
            _run(exercise())
        self.assertEqual(dispatched, [{"value": "validated"}])

    def test_direct_list_uses_one_config_snapshot_for_policy_endpoint_and_cache(self):
        config = {
            "generation": 7,
            "type": "http", "url": "https://endpoint-a.test/mcp",
            "enabledTools": ["allowed"],
        }
        resolved = []
        opened = []

        class Session:
            async def list_tools(self):
                return await _FakeSession(
                    [("allowed", "", {}), ("blocked", "", {})], None
                ).list_tools()

        async def resolve(self_):
            resolved.append(True)
            if len(resolved) > 1:
                return {
                    "generation": 8,
                    "type": "http", "url": "https://endpoint-b.test/mcp",
                    "enabledTools": ["blocked"],
                }
            return config

        async def open_session(self_, stack, config=None):
            opened.append(config)
            return Session()

        with mock.patch.object(_Integration, "_resolve_host_config", resolve), mock.patch.object(
            _Integration, "_open_session", open_session
        ):
            integration = _Integration()
            tools = _run(integration.list_tools())
        self.assertEqual(len(resolved), 1)
        self.assertIs(opened[0], config)
        self.assertEqual([tool["name"] for tool in tools], ["allowed"])
        self.assertEqual(integration._tools_config_identity, integration._config_identity(config))

    def test_direct_call_uses_policy_and_endpoint_from_one_config_snapshot(self):
        config = {
            "generation": 11,
            "type": "http", "url": "https://endpoint-a.test/mcp",
            "enabledTools": ["allowed"],
        }
        resolved = []
        opened = []

        class Session:
            async def call_tool(self, tool, arguments):
                return type("R", (), {"structuredContent": {"ok": True}, "content": []})()

        async def resolve(self_):
            resolved.append(True)
            if len(resolved) > 1:
                return {
                    "generation": 12,
                    "type": "http", "url": "https://endpoint-b.test/mcp",
                    "enabledTools": ["blocked"],
                }
            return config

        async def open_session(self_, stack, config=None):
            opened.append(config)
            return Session()

        with mock.patch.object(_Integration, "_resolve_host_config", resolve), mock.patch.object(
            _Integration, "_open_session", open_session
        ):
            self.assertEqual(_run(_Integration().call_tool("allowed", {})), {"ok": True})
        self.assertEqual(len(resolved), 1)
        self.assertIs(opened[0], config)

    def test_cache_identity_tracks_endpoint_filters_without_secret_values(self):
        integration = _Integration()
        first = integration._config_identity(
            {"generation": 3, "type": "http", "url": "https://one.test/mcp", "enabledTools": ["a"], "headers": {"X-Key": "secret-one"}}
        )
        endpoint_changed = integration._config_identity(
            {"generation": 3, "type": "http", "url": "https://two.test/mcp", "enabledTools": ["a"], "headers": {"X-Key": "secret-two"}}
        )
        filter_changed = integration._config_identity(
            {"generation": 3, "type": "http", "url": "https://one.test/mcp", "enabledTools": ["b"], "headers": {"X-Key": "secret-three"}}
        )
        self.assertNotEqual(first, endpoint_changed)
        self.assertNotEqual(first, filter_changed)
        self.assertNotIn("secret", repr(first))

    def test_argument_payload_rejects_non_json_numbers(self):
        with self.assertRaisesRegex(ValueError, "JSON serializable"):
            mcp_base._validated_arguments({"value": float("nan")})

    def test_http_wire_cap_rejects_content_length_before_reading(self):
        import httpx

        class Stream(httpx.AsyncByteStream):
            def __init__(self):
                self.closed = False
            async def __aiter__(self):
                yield b"not-read"
            async def aclose(self):
                self.closed = True

        async def exercise():
            stream = Stream()
            response = httpx.Response(200, headers={"Content-Length": "11"}, stream=stream)
            with self.assertRaisesRegex(ValueError, "wire safety limit"):
                await mcp_base._bounded_http_response_hook(10)(response)
            self.assertTrue(stream.closed)

        _run(exercise())

    def test_http_wire_cap_rejects_chunked_overflow_while_streaming(self):
        import httpx

        class Stream(httpx.AsyncByteStream):
            def __init__(self):
                self.closed = False
            async def __aiter__(self):
                yield b"123456"
                yield b"78901"
            async def aclose(self):
                self.closed = True

        async def exercise():
            stream = Stream()
            response = httpx.Response(200, stream=stream)
            await mcp_base._bounded_http_response_hook(10)(response)
            seen = []
            with self.assertRaisesRegex(ValueError, "wire safety limit"):
                async for chunk in response.stream:
                    seen.append(chunk)
            self.assertEqual(seen, [b"123456"])
            self.assertTrue(stream.closed)

        _run(exercise())

    def test_http_wire_cap_allows_under_bound_stream(self):
        import httpx

        class Stream(httpx.AsyncByteStream):
            async def __aiter__(self):
                yield b"1234"
                yield b"5678"
            async def aclose(self):
                return None

        async def exercise():
            response = httpx.Response(
                200, headers={"Content-Length": "8", "Content-Encoding": "identity"}, stream=Stream()
            )
            await mcp_base._bounded_http_response_hook(10)(response)
            self.assertEqual([chunk async for chunk in response.stream], [b"1234", b"5678"])

        _run(exercise())

    def test_http_wire_cap_rejects_compressed_response(self):
        import httpx

        class Stream(httpx.AsyncByteStream):
            def __init__(self):
                self.closed = False
            async def __aiter__(self):
                yield b"compressed"
            async def aclose(self):
                self.closed = True

        async def exercise():
            stream = Stream()
            response = httpx.Response(
                200, headers={"Content-Encoding": "gzip"}, stream=stream
            )
            with self.assertRaisesRegex(ValueError, "only identity"):
                await mcp_base._bounded_http_response_hook(10)(response)
            self.assertTrue(stream.closed)

        _run(exercise())

    def test_text_blocks_count_utf8_bytes_before_joining(self):
        result = {
            "content": [{"text": "éé"}, {"text": "a"}],
            "structuredContent": None,
        }
        with mock.patch.object(mcp_base, "MAX_ARGUMENT_BYTES", 5):
            with self.assertRaisesRegex(ValueError, "MCP tool result.*safety limit"):
                mcp_base._parse_result(result)

    def test_parsed_results_are_strict_json_and_bounded(self):
        with self.assertRaisesRegex(ValueError, "safety limit"):
            mcp_base._parse_result(
                {"structuredContent": {"value": "x" * mcp_base.MAX_ARGUMENT_BYTES}, "content": []}
            )
        with self.assertRaisesRegex(ValueError, "strict JSON"):
            mcp_base._parse_result(
                {"structuredContent": {"value": float("nan")}, "content": []}
            )

    def test_direct_call_rejects_oversized_decoded_result_before_return(self):
        class Session:
            async def call_tool(self, tool, arguments):
                return {
                    "structuredContent": {"value": "x" * mcp_base.MAX_ARGUMENT_BYTES},
                    "content": [],
                }

        async def open_session(self_, stack, config=None):
            return Session()

        with mock.patch.object(
            _Integration, "_resolve_host_config", new=mock.AsyncMock(return_value={})
        ), mock.patch.object(_Integration, "_open_session", open_session):
            with self.assertRaisesRegex(ValueError, "MCP tool result.*safety limit"):
                _run(_Integration().call_tool("large", {}))

    def test_host_discovery_metadata_is_bounded_before_caching(self):
        async def host(req_type, payload, **kwargs):
            if req_type == "mcp.config":
                return {"type": "stdio", "bridge": "host", "generation": 1}
            return {
                "tools": [
                    {
                        "name": "large",
                        "description": "x" * mcp_base.MAX_ARGUMENT_BYTES,
                        "inputSchema": {},
                    }
                ]
            }

        with mock.patch.object(mcp_base, "host_request", host):
            integration = _Integration()
            with self.assertRaisesRegex(ValueError, "discovery metadata.*safety limit"):
                _run(integration.list_tools())
        self.assertIsNone(integration._tools)

    def test_direct_discovery_metadata_is_bounded_before_caching(self):
        session = _FakeSession(
            tools=[("large", "x" * mcp_base.MAX_ARGUMENT_BYTES, {})], result=None
        )
        with self._patch_session(session), mock.patch.object(
            _Integration, "_resolve_host_config", new=mock.AsyncMock(return_value={})
        ):
            integration = _Integration()
            with self.assertRaisesRegex(ValueError, "discovery metadata.*safety limit"):
                _run(integration.list_tools())
        self.assertIsNone(integration._tools)

    def test_direct_connect_timeout_cancels_transport_entry(self):
        cancelled = []

        class SlowTransport:
            async def __aenter__(self):
                try:
                    await asyncio.sleep(10)
                finally:
                    cancelled.append(True)
            async def __aexit__(self, *args):
                raise AssertionError("transport never finished entering")

        def transport(url, *, http_client=None):
            return SlowTransport()

        integration = _Integration()
        integration.direct_http_timeout = 0.01
        self._write_auth(
            {"type": "oauth", "access": "t", "refresh": "r", "expires": (time.time() + 3600) * 1000}
        )

        async def exercise():
            async with AsyncExitStack() as stack:
                await integration._open_session(stack)

        with mock.patch.object(
            integration, "_resolve_host_config", new=mock.AsyncMock(return_value={})
        ), mock.patch.object(mcp_base, "_resolve_streamable_http", return_value=transport):
            with self.assertRaisesRegex(TimeoutError, "connect"):
                _run(exercise())
        self.assertEqual(cancelled, [True])

    def test_direct_initialize_timeout_cancels_and_closes_entered_resources(self):
        events = []

        class Transport:
            async def __aenter__(self):
                return ("read", "write", None)
            async def __aexit__(self, *args):
                events.append("transport-closed")

        def transport(url, *, http_client=None):
            return Transport()

        integration = _Integration()
        integration.direct_http_timeout = 0.01
        self._write_auth(
            {"type": "oauth", "access": "t", "refresh": "r", "expires": (time.time() + 3600) * 1000}
        )

        async def slow_initialize():
            try:
                await asyncio.sleep(10)
            finally:
                events.append("initialize-cancelled")

        async def exercise():
            async with AsyncExitStack() as stack:
                await integration._open_session(stack)

        with mock.patch.object(
            integration, "_resolve_host_config", new=mock.AsyncMock(return_value={})
        ), mock.patch.object(
            mcp_base, "_resolve_streamable_http", return_value=transport
        ), mock.patch("mcp.ClientSession") as session_class:
            session = mock.MagicMock()
            session.initialize = slow_initialize
            session_class.return_value.__aenter__ = mock.AsyncMock(return_value=session)
            session_class.return_value.__aexit__ = mock.AsyncMock(
                side_effect=lambda *args: events.append("session-closed") or False
            )
            with self.assertRaisesRegex(TimeoutError, "initialize"):
                _run(exercise())
        self.assertEqual(
            events, ["initialize-cancelled", "session-closed", "transport-closed"]
        )

    def test_direct_list_timeout_cancels_and_cleans_up_stack(self):
        events = []

        class Resource:
            async def __aenter__(self):
                return self
            async def __aexit__(self, *args):
                events.append("resource-closed")

        class SlowListSession:
            async def list_tools(self):
                try:
                    await asyncio.sleep(10)
                finally:
                    events.append("list-cancelled")

        async def open_with_resource(self_, stack, config=None):
            await stack.enter_async_context(Resource())
            return SlowListSession()

        integration = _Integration()
        integration.direct_http_timeout = 0.01
        with mock.patch.object(_Integration, "_open_session", open_with_resource), mock.patch.object(
            _Integration, "_resolve_host_config", new=mock.AsyncMock(return_value={})
        ):
            with self.assertRaisesRegex(TimeoutError, "list tools"):
                _run(integration.list_tools())
        self.assertEqual(events, ["list-cancelled", "resource-closed"])

    def test_direct_call_timeout_cancels_and_cleans_up_stack(self):
        cleaned = []

        class Resource:
            async def __aenter__(self):
                return self
            async def __aexit__(self, *args):
                cleaned.append(True)

        class SlowSession:
            async def call_tool(self, tool, arguments):
                await asyncio.sleep(10)

        async def open_with_resource(self_, stack, config=None):
            await stack.enter_async_context(Resource())
            return SlowSession()

        integration = _Integration()
        integration.direct_http_timeout = 0.01
        with mock.patch.object(_Integration, "_open_session", open_with_resource), mock.patch.object(
            _Integration, "_resolve_host_config", new=mock.AsyncMock(return_value={})
        ):
            with self.assertRaisesRegex(TimeoutError, "call tool"):
                _run(integration.call_tool("slow", {}))
        self.assertEqual(cleaned, [True])


if __name__ == "__main__":
    unittest.main()
