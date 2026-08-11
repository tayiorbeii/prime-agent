#!/usr/bin/env python3
"""Capture and restore Prime Agent attachments in Herdr panes.

The Prime Agent daemon persists the Herdr pane identity that was present when a
resident worker was created. This script joins that identity with
`prime-agent list --all --json` and Herdr's workspace metadata, producing an
inventory that can be used after restarting Prime Agent.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import shlex
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Sequence

DEFAULT_INVENTORY_PATH = Path.home() / ".prime" / "herdr-prime-agent-layout.json"
INVENTORY_VERSION = 1
SHELL_NAMES = {"bash", "dash", "fish", "ksh", "sh", "tcsh", "zsh"}


class LayoutError(RuntimeError):
    pass


def run(args: Sequence[str], *, check: bool = True) -> subprocess.CompletedProcess[str]:
    try:
        completed = subprocess.run(args, check=False, capture_output=True, text=True)
    except FileNotFoundError as error:
        raise LayoutError(f"Command not found: {args[0]}") from error

    if check and completed.returncode != 0:
        detail = completed.stderr.strip() or completed.stdout.strip() or f"exit {completed.returncode}"
        raise LayoutError(f"{shlex.join(args)} failed: {detail}")
    return completed


def run_json(args: Sequence[str]) -> dict[str, Any] | list[Any]:
    completed = run(args)
    try:
        value = json.loads(completed.stdout)
    except json.JSONDecodeError as error:
        raise LayoutError(f"{shlex.join(args)} did not return valid JSON") from error
    if not isinstance(value, (dict, list)):
        raise LayoutError(f"{shlex.join(args)} returned an unexpected JSON value")
    return value


def result_list(payload: dict[str, Any] | list[Any], key: str) -> list[dict[str, Any]]:
    if not isinstance(payload, dict):
        raise LayoutError(f"Expected an object containing {key}")
    result = payload.get("result")
    values = result.get(key) if isinstance(result, dict) else None
    if not isinstance(values, list):
        raise LayoutError(f"Expected result.{key} in command output")
    return [value for value in values if isinstance(value, dict)]


def prime_sessions() -> list[dict[str, Any]]:
    payload = run_json(["prime-agent", "list", "--all", "--json"])
    if not isinstance(payload, dict) or not isinstance(payload.get("sessions"), list):
        raise LayoutError("Expected sessions in prime-agent list output")
    return [value for value in payload["sessions"] if isinstance(value, dict)]


def default_daemon_socket() -> str:
    payload = run_json(["prime-agent", "status", "--json"])
    if not isinstance(payload, list):
        raise LayoutError("Expected a service list from prime-agent status")
    for service in payload:
        if isinstance(service, dict) and service.get("isDefault") is True:
            socket_path = service.get("socketPath")
            if isinstance(socket_path, str) and socket_path:
                return socket_path
    raise LayoutError("Could not find the default Prime Agent daemon socket")


def worker_descriptors(socket_path: str) -> dict[str, dict[str, Any]]:
    key = hashlib.sha256(socket_path.encode()).hexdigest()[:12]
    directory = Path.home() / ".prime" / "agent" / "daemon-workers" / key
    if not directory.is_dir():
        raise LayoutError(f"Prime Agent worker descriptor directory does not exist: {directory}")

    descriptors: dict[str, dict[str, Any]] = {}
    for path in directory.glob("*.json"):
        try:
            value = json.loads(path.read_text())
        except (OSError, json.JSONDecodeError):
            continue
        if not isinstance(value, dict):
            continue
        active_session_id = value.get("rootActiveSessionId")
        if isinstance(active_session_id, str):
            descriptors[active_session_id] = value
    return descriptors


def string_value(value: Any) -> str | None:
    return value if isinstance(value, str) and value else None


def descriptor_environment(descriptor: dict[str, Any]) -> dict[str, str]:
    create_command = descriptor.get("createCommand")
    environment = create_command.get("env") if isinstance(create_command, dict) else None
    if not isinstance(environment, dict):
        return {}
    return {key: value for key, value in environment.items() if isinstance(key, str) and isinstance(value, str)}


def direct_agent_panes(agents: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    """Index Herdr agent reports by every session reference they expose."""
    references: dict[str, dict[str, Any]] = {}
    for agent in agents:
        session = agent.get("agent_session")
        if not isinstance(session, dict):
            continue
        value = string_value(session.get("value"))
        if value:
            references[value] = agent
    return references


def capture_inventory() -> dict[str, Any]:
    sessions = prime_sessions()
    socket_path = default_daemon_socket()
    descriptors = worker_descriptors(socket_path)
    workspaces = result_list(run_json(["herdr", "workspace", "list"]), "workspaces")
    panes = result_list(run_json(["herdr", "pane", "list"]), "panes")
    agents = result_list(run_json(["herdr", "agent", "list"]), "agents")

    workspaces_by_id = {
        workspace_id: workspace
        for workspace in workspaces
        if (workspace_id := string_value(workspace.get("workspace_id")))
    }
    panes_by_id = {
        pane_id: pane for pane in panes if (pane_id := string_value(pane.get("pane_id")))
    }
    reported_sessions = direct_agent_panes(agents)

    captured: list[dict[str, Any]] = []
    for session in sessions:
        attached_clients = session.get("attachedClients")
        if not isinstance(attached_clients, int) or attached_clients <= 0:
            continue

        active_session_id = string_value(session.get("activeSessionId")) or string_value(session.get("id"))
        if not active_session_id:
            continue

        descriptor = descriptors.get(active_session_id, {})
        environment = descriptor_environment(descriptor)
        pane_id = string_value(environment.get("HERDR_PANE_ID"))
        tab_id = string_value(environment.get("HERDR_TAB_ID"))
        workspace_id = string_value(environment.get("HERDR_WORKSPACE_ID"))
        mapping_source = "worker-descriptor" if pane_id else None

        session_file = string_value(session.get("sessionFile"))
        session_id = string_value(session.get("sessionId"))
        for reference in (session_file, session_id, active_session_id):
            reported = reported_sessions.get(reference) if reference else None
            if not reported:
                continue
            pane_id = string_value(reported.get("pane_id")) or pane_id
            tab_id = string_value(reported.get("tab_id")) or tab_id
            workspace_id = string_value(reported.get("workspace_id")) or workspace_id
            mapping_source = "herdr-agent-session"
            break

        pane = panes_by_id.get(pane_id, {}) if pane_id else {}
        workspace_id = workspace_id or string_value(pane.get("workspace_id"))
        tab_id = tab_id or string_value(pane.get("tab_id"))
        workspace = workspaces_by_id.get(workspace_id, {}) if workspace_id else {}

        captured.append(
            {
                "activeSessionId": active_session_id,
                "sessionId": session_id,
                "sessionFile": session_file,
                "sessionName": string_value(session.get("sessionName")),
                "cwd": string_value(session.get("cwd")),
                "activity": string_value(session.get("activity")),
                "attachedClients": attached_clients,
                "originalPaneId": pane_id,
                "originalTabId": tab_id,
                "originalWorkspaceId": workspace_id,
                "workspaceLabel": string_value(workspace.get("label")),
                "workspaceNumber": workspace.get("number") if isinstance(workspace.get("number"), int) else None,
                "paneTitle": string_value(pane.get("title")) or string_value(pane.get("terminal_title")),
                "mappingSource": mapping_source,
            }
        )

    captured.sort(key=lambda item: (item.get("workspaceNumber") or 10**9, item["activeSessionId"]))
    return {
        "version": INVENTORY_VERSION,
        "capturedAt": datetime.now(timezone.utc).isoformat(),
        "daemonSocket": socket_path,
        "agents": captured,
    }


def load_inventory(path: Path) -> dict[str, Any]:
    try:
        value = json.loads(path.read_text())
    except FileNotFoundError as error:
        raise LayoutError(f"Inventory does not exist: {path}") from error
    except json.JSONDecodeError as error:
        raise LayoutError(f"Inventory is not valid JSON: {path}") from error
    if not isinstance(value, dict) or value.get("version") != INVENTORY_VERSION:
        raise LayoutError(f"Unsupported inventory format in {path}")
    if not isinstance(value.get("agents"), list):
        raise LayoutError(f"Inventory has no agents list: {path}")
    return value


def display_inventory(inventory: dict[str, Any]) -> None:
    rows: list[list[str]] = []
    for value in inventory["agents"]:
        if not isinstance(value, dict):
            continue
        rows.append(
            [
                string_value(value.get("workspaceLabel")) or "(unknown)",
                string_value(value.get("originalPaneId")) or "(unmapped)",
                string_value(value.get("activeSessionId")) or "",
                string_value(value.get("sessionName")) or "",
                string_value(value.get("activity")) or "",
                string_value(value.get("cwd")) or "",
            ]
        )

    headers = ["workspace", "pane", "prime-agent id", "name", "state", "cwd"]
    widths = [len(header) for header in headers]
    for row in rows:
        for index, cell in enumerate(row):
            widths[index] = max(widths[index], len(cell))

    print("  ".join(header.ljust(widths[index]) for index, header in enumerate(headers)))
    print("  ".join("-" * width for width in widths))
    for row in rows:
        print("  ".join(cell.ljust(widths[index]) for index, cell in enumerate(row)))


def workspace_index() -> tuple[dict[str, dict[str, Any]], dict[str, list[dict[str, Any]]]]:
    workspaces = result_list(run_json(["herdr", "workspace", "list"]), "workspaces")
    by_id: dict[str, dict[str, Any]] = {}
    by_label: dict[str, list[dict[str, Any]]] = {}
    for workspace in workspaces:
        workspace_id = string_value(workspace.get("workspace_id"))
        label = string_value(workspace.get("label"))
        if workspace_id:
            by_id[workspace_id] = workspace
        if label:
            by_label.setdefault(label, []).append(workspace)
    return by_id, by_label


def create_replacement_pane(
    agent: dict[str, Any],
    workspaces_by_id: dict[str, dict[str, Any]],
    workspaces_by_label: dict[str, list[dict[str, Any]]],
) -> str:
    stored_workspace_id = string_value(agent.get("originalWorkspaceId"))
    workspace = workspaces_by_id.get(stored_workspace_id) if stored_workspace_id else None
    if workspace is None:
        label = string_value(agent.get("workspaceLabel"))
        matches = workspaces_by_label.get(label, []) if label else []
        if len(matches) != 1:
            detail = "not found" if not matches else "ambiguous"
            raise LayoutError(f"Workspace {label or stored_workspace_id or '(unknown)'} is {detail}")
        workspace = matches[0]

    workspace_id = string_value(workspace.get("workspace_id"))
    if not workspace_id:
        raise LayoutError("Resolved Herdr workspace has no workspace_id")

    command = ["herdr", "tab", "create", "--workspace", workspace_id, "--no-focus"]
    cwd = string_value(agent.get("cwd"))
    if cwd and Path(cwd).is_dir():
        command.extend(["--cwd", cwd])
    label = string_value(agent.get("sessionName")) or "prime-agent"
    command.extend(["--label", label])
    payload = run_json(command)
    if not isinstance(payload, dict):
        raise LayoutError("Herdr returned an unexpected tab creation response")
    result = payload.get("result")
    root_pane = result.get("root_pane") if isinstance(result, dict) else None
    pane_id = string_value(root_pane.get("pane_id")) if isinstance(root_pane, dict) else None
    if not pane_id:
        raise LayoutError("Herdr tab creation response did not contain root_pane.pane_id")
    return pane_id


def pane_is_shell_ready(pane_id: str) -> tuple[bool, str]:
    payload = run_json(["herdr", "pane", "process-info", "--pane", pane_id])
    if not isinstance(payload, dict):
        return False, "unexpected process-info response"
    result = payload.get("result")
    process_info = result.get("process_info") if isinstance(result, dict) else None
    processes = process_info.get("foreground_processes") if isinstance(process_info, dict) else None
    if not isinstance(processes, list) or len(processes) != 1 or not isinstance(processes[0], dict):
        return False, "pane does not have exactly one foreground shell process"
    process = processes[0]
    argv0 = string_value(process.get("argv0")) or string_value(process.get("name")) or ""
    name = Path(argv0.lstrip("-")).name
    if name not in SHELL_NAMES:
        return False, f"foreground process is {argv0 or '(unknown)'}"
    return True, name


def restore_inventory(inventory: dict[str, Any], *, execute: bool, create_missing_tabs: bool) -> int:
    current_sessions = {
        active_session_id: session
        for session in prime_sessions()
        if (active_session_id := string_value(session.get("activeSessionId")) or string_value(session.get("id")))
    }
    panes = result_list(run_json(["herdr", "pane", "list"]), "panes")
    panes_by_id = {
        pane_id: pane for pane in panes if (pane_id := string_value(pane.get("pane_id")))
    }
    workspaces_by_id, workspaces_by_label = workspace_index()

    failures = 0
    for value in inventory["agents"]:
        if not isinstance(value, dict):
            continue
        active_session_id = string_value(value.get("activeSessionId"))
        workspace_label = string_value(value.get("workspaceLabel")) or "(unknown workspace)"
        pane_id = string_value(value.get("originalPaneId"))

        if pane_id not in panes_by_id:
            if not pane_id and not string_value(value.get("workspaceLabel")):
                print(f"SKIP  {active_session_id}: attachment was not mapped to a Herdr workspace")
                continue
            if not create_missing_tabs:
                print(f"ERROR {active_session_id}: pane {pane_id or '(unmapped)'} is missing in {workspace_label}")
                failures += 1
                continue
            if not execute:
                print(f"PLAN  {active_session_id}: create a tab in {workspace_label}, then relaunch")
                continue
            try:
                pane_id = create_replacement_pane(value, workspaces_by_id, workspaces_by_label)
            except LayoutError as error:
                print(f"ERROR {active_session_id}: {error}")
                failures += 1
                continue

        assert pane_id is not None
        try:
            shell_ready, detail = pane_is_shell_ready(pane_id)
        except LayoutError as error:
            print(f"ERROR {active_session_id}: {error}")
            failures += 1
            continue
        if not shell_ready:
            print(f"SKIP  {active_session_id}: {pane_id} in {workspace_label}: {detail}")
            continue

        current = current_sessions.get(active_session_id) if active_session_id else None
        if current is not None:
            if isinstance(current.get("attachedClients"), int) and current["attachedClients"] > 0:
                print(f"SKIP  {active_session_id}: already has {current['attachedClients']} attached client(s)")
                continue
            prime_command = ["prime-agent", "attach", active_session_id]
        else:
            session_file = string_value(value.get("sessionFile"))
            session_id = string_value(value.get("sessionId"))
            selector = session_file if session_file and Path(session_file).is_file() else session_id
            if not selector:
                print(f"ERROR {active_session_id}: no saved session file or session ID is available")
                failures += 1
                continue
            prime_command = ["prime-agent", "--resume", selector]

        herdr_command = ["herdr", "pane", "run", pane_id, *prime_command]
        action = "RUN " if execute else "PLAN"
        print(f"{action:5} {workspace_label} {pane_id}: {shlex.join(prime_command)}")
        if execute:
            completed = run(herdr_command, check=False)
            if completed.returncode != 0:
                detail = completed.stderr.strip() or completed.stdout.strip() or f"exit {completed.returncode}"
                print(f"ERROR {active_session_id}: {detail}")
                failures += 1

    return failures


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(dest="command", required=True)

    capture = subparsers.add_parser("capture", help="capture attached Prime Agents and their original Herdr panes")
    capture.add_argument("--output", type=Path, default=DEFAULT_INVENTORY_PATH)

    show = subparsers.add_parser("show", help="show a captured inventory")
    show.add_argument("--input", type=Path, default=DEFAULT_INVENTORY_PATH)

    restore = subparsers.add_parser("restore", help="plan or execute relaunches in the captured Herdr panes")
    restore.add_argument("--input", type=Path, default=DEFAULT_INVENTORY_PATH)
    restore.add_argument("--execute", action="store_true", help="run the relaunch commands; otherwise only print the plan")
    restore.add_argument(
        "--create-missing-tabs",
        action="store_true",
        help="create a new tab in the captured workspace when the original pane no longer exists",
    )
    return parser


def main() -> int:
    args = build_parser().parse_args()
    try:
        if args.command == "capture":
            inventory = capture_inventory()
            args.output.parent.mkdir(parents=True, exist_ok=True)
            args.output.write_text(f"{json.dumps(inventory, indent=2)}\n")
            display_inventory(inventory)
            print(f"\nSaved {len(inventory['agents'])} attachment(s) to {args.output}")
            unmapped = sum(1 for agent in inventory["agents"] if not agent.get("originalPaneId"))
            if unmapped:
                print(f"Warning: {unmapped} attachment(s) could not be mapped to an original Herdr pane", file=sys.stderr)
            return 0
        if args.command == "show":
            display_inventory(load_inventory(args.input))
            return 0
        if args.command == "restore":
            failures = restore_inventory(
                load_inventory(args.input),
                execute=args.execute,
                create_missing_tabs=args.create_missing_tabs,
            )
            if not args.execute:
                print("\nDry run only. Add --execute to relaunch the agents.")
            return 1 if failures else 0
        raise LayoutError(f"Unknown command: {args.command}")
    except LayoutError as error:
        print(f"error: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
