import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	isStdioMcpRequestNotSentError,
	StdioMcpClient,
	StdioMcpTransportError,
} from "../src/core/mcp/stdio-mcp-client.js";

function executable(path: string, body: string): void {
	writeFileSync(path, `#!/usr/bin/env node\n${body}`);
	chmodSync(path, 0o755);
}

function client(command: string, options: Record<string, number> = {}): StdioMcpClient {
	return new StdioMcpClient({
		server: "hostile",
		command,
		args: [],
		cwd: process.cwd(),
		env: { ...process.env },
		startupTimeoutMs: 1_000,
		...options,
	});
}

const validInitialize = `{ jsonrpc: "2.0", id: message.id, result: { protocolVersion: "2024-11-05", capabilities: { tools: {} }, serverInfo: { name: "test", version: "1" } } }`;

describe("StdioMcpClient transport hardening", () => {
	let dir: string;
	const clients: StdioMcpClient[] = [];
	beforeEach(() => {
		dir = mkdtempSync(join(tmpdir(), "stdio-mcp-hardening-"));
	});
	afterEach(async () => {
		await Promise.allSettled(clients.map((value) => value.dispose()));
		rmSync(dir, { recursive: true, force: true });
	});

	it("terminates a sidecar whose stdout grows without a newline", async () => {
		const command = join(dir, "no-newline.mjs");
		executable(command, `process.stdin.once("data", () => process.stdout.write("x".repeat(300)));`);
		const value = client(command, { maxStdoutBufferBytes: 128, maxMessageBytes: 1_024 });
		clients.push(value);
		await expect(value.listTools()).rejects.toThrow("without a newline");
	});

	it("rejects and terminates an oversized JSON-RPC message", async () => {
		const command = join(dir, "oversized.mjs");
		executable(
			command,
			`process.stdin.once("data", () => process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: 1, result: { padding: "x".repeat(500) } }) + "\\n"));`,
		);
		const value = client(command, { maxStdoutBufferBytes: 1_024, maxMessageBytes: 256 });
		clients.push(value);
		await expect(value.listTools()).rejects.toThrow("JSON-RPC message is");
	});

	it("drains multiple valid frames before applying the no-newline bound", async () => {
		const command = join(dir, "many-frames.mjs");
		executable(
			command,
			`
let input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", chunk => {
  input += chunk;
  while (input.includes("\\n")) {
    const i = input.indexOf("\\n");
    const line = input.slice(0, i); input = input.slice(i + 1);
    if (!line) continue;
    const message = JSON.parse(line);
    if (message.method === "initialize") {
      const notifications = Array.from({ length: 20 }, () => JSON.stringify({ jsonrpc: "2.0", method: "notifications/progress" })).join("\\n") + "\\n";
      process.stdout.write(notifications + JSON.stringify(${validInitialize}) + "\\n");
    } else if (message.id !== undefined) {
      process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: message.id, result: {} }) + "\\n");
    }
  }
});`,
		);
		const value = client(command, { maxStdoutBufferBytes: 128, maxMessageBytes: 1_024 });
		clients.push(value);
		await expect(value.health()).resolves.toBeUndefined();
	});

	it("processes many tiny stdout chunks without retaining scanned prefixes", () => {
		const value = client("unused");
		clients.push(value);
		const state = value as unknown as {
			handleStdout: (chunk: Buffer) => void;
			inputBuffer: Buffer;
			inputBufferLength: number;
		};
		const output = `${JSON.stringify({ jsonrpc: "2.0", method: "notifications/progress" })}\n`.repeat(500);
		for (const character of output) state.handleStdout(Buffer.from(character));
		expect(state.inputBufferLength).toBe(0);
		expect(state.inputBuffer.length).toBeLessThanOrEqual(8_388_608);
	});

	it("keeps many tiny unterminated chunks within bounded buffer capacity and taints on overflow", () => {
		const value = client("unused", { maxStdoutBufferBytes: 32, maxMessageBytes: 64 });
		clients.push(value);
		const state = value as unknown as {
			handleStdout: (chunk: Buffer) => void;
			inputBuffer: Buffer;
			inputBufferLength: number;
			tainted: boolean;
		};
		for (let index = 0; index < 32; index += 1) state.handleStdout(Buffer.from("x"));
		expect(state.tainted).toBe(false);
		expect(state.inputBufferLength).toBe(32);
		expect(state.inputBuffer.length).toBeLessThanOrEqual(32);
		state.handleStdout(Buffer.from("x"));
		expect(state.tainted).toBe(true);
		expect(state.inputBufferLength).toBe(0);
		expect(state.inputBuffer.length).toBe(0);
	});

	it("taints invalid UTF-8 bytes even when replacement text would be valid inside a JSON string", () => {
		const value = client("unused");
		clients.push(value);
		const state = value as unknown as { handleStdout: (chunk: Buffer) => void; tainted: boolean };
		state.handleStdout(
			Buffer.concat([
				Buffer.from('{"jsonrpc":"2.0","method":"notifications/test","params":{"value":"'),
				Buffer.from([0xff]),
				Buffer.from('"}}\n'),
			]),
		);
		expect(state.tainted).toBe(true);
	});

	it("taints a malformed response even when its numeric id is unknown", () => {
		const value = client("unused");
		clients.push(value);
		const state = value as unknown as { handleStdout: (chunk: Buffer) => void; tainted: boolean };
		state.handleStdout(Buffer.from(`${JSON.stringify({ jsonrpc: "1.0", id: 9_999, result: {} })}\n`));
		expect(state.tainted).toBe(true);
	});

	it("ignores only structurally valid late responses and server messages", () => {
		const value = client("unused");
		clients.push(value);
		const state = value as unknown as {
			handleStdout: (chunk: Buffer) => void;
			tainted: boolean;
			inputBufferLength: number;
		};
		state.handleStdout(
			Buffer.from(
				`${[
					{ jsonrpc: "2.0", id: 9_999, result: { late: true } },
					{ jsonrpc: "2.0", method: "notifications/progress", params: {} },
					{ jsonrpc: "2.0", id: "server-request", method: "roots/list", params: {} },
				]
					.map((frame) => JSON.stringify(frame))
					.join("\n")}\n`,
			),
		);
		expect(state.tainted).toBe(false);
		expect(state.inputBufferLength).toBe(0);
	});

	it("cleans pending state when direct-client arguments cannot be JSON-serialized", async () => {
		const value = client("unused");
		clients.push(value);
		let writeCalled = false;
		const fakeChild = {
			exitCode: 0,
			signalCode: null,
			stdin: {
				destroyed: false,
				write: () => {
					writeCalled = true;
				},
			},
		};
		const state = value as unknown as {
			child: unknown;
			initialized: boolean;
			toolsSupported: boolean;
			pending: Map<number, unknown>;
			tainted: boolean;
		};
		state.child = fakeChild;
		state.initialized = true;
		state.toolsSupported = true;
		const cyclic: Record<string, unknown> = {};
		cyclic.self = cyclic;
		await expect(value.callTool("cyclic", cyclic)).rejects.toThrow("request is not JSON-serializable");
		expect(state.pending.size).toBe(0);
		expect(state.tainted).toBe(false);
		expect(writeCalled).toBe(false);
	});

	it("taints malformed JSON and starts a fresh process for the next operation", async () => {
		const command = join(dir, "malformed-then-valid.mjs");
		const count = join(dir, "count");
		executable(
			command,
			`
import { existsSync, readFileSync, writeFileSync } from "node:fs";
const countFile = ${JSON.stringify(count)};
const n = existsSync(countFile) ? Number(readFileSync(countFile, "utf8")) + 1 : 1;
writeFileSync(countFile, String(n));
let input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", chunk => {
 input += chunk;
 while (input.includes("\\n")) {
  const i = input.indexOf("\\n"); const line = input.slice(0, i); input = input.slice(i + 1);
  if (!line) continue;
  const message = JSON.parse(line);
  if (message.method === "initialize") {
   if (n === 1) process.stdout.write("{bad json\\n");
   else process.stdout.write(JSON.stringify(${validInitialize}) + "\\n");
  } else if (message.method === "tools/list") {
   process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: message.id, result: { tools: [{ name: "ok" }] } }) + "\\n");
  }
 }
});`,
		);
		const value = client(command);
		clients.push(value);
		await expect(value.listTools()).rejects.toThrow("malformed JSON-RPC");
		await expect(value.listTools()).resolves.toEqual([{ name: "ok" }]);
		expect(readFileSync(count, "utf8")).toBe("2");
	});

	it("classifies an asynchronous stdin write callback failure as ambiguous delivery", async () => {
		const value = client("unused");
		clients.push(value);
		const fakeChild = {
			exitCode: 0,
			signalCode: null,
			stdin: {
				destroyed: false,
				write: (_request: string, _encoding: string, callback: (error?: Error | null) => void) => {
					queueMicrotask(() => callback(new Error("pipe completion failed")));
					return true;
				},
			},
		};
		const state = value as unknown as {
			child: unknown;
			initialized: boolean;
			toolsSupported: boolean;
		};
		state.child = fakeChild;
		state.initialized = true;
		state.toolsSupported = true;
		let failure: unknown;
		try {
			await value.listTools();
		} catch (error) {
			failure = error;
		}
		expect(failure).toBeInstanceOf(StdioMcpTransportError);
		expect(isStdioMcpRequestNotSentError(failure)).toBe(false);
		expect((failure as Error).message).toContain("write completion failed");
		expect((failure as Error).message).not.toContain("pipe completion failed");
	});

	it("suppresses all captured stderr content regardless of secret format", async () => {
		const command = join(dir, "stderr.mjs");
		executable(
			command,
			`process.stdin.once("data", () => { process.stderr.write("Authorization: Bearer supersecret\\napi_key=abcdef\\ntoken=splitsecret\\n"); process.stderr.write('OPENAI_API_KEY=openai-secret\\nAuthorization: Basic dXNlcjpwYXNz\\n'); process.stderr.write('{"token":"jsonsecret","apiKey":"jsonkey","access_token":"accessvalue","refreshToken":"refreshvalue","client_secret":"clientvalue","password":"passwordvalue"}\\n'); process.stderr.write("-----BEGIN PRIVATE KEY-----\\nPEMSECRET\\n"); process.exit(2); });`,
		);
		const value = client(command, { stderrTailBytes: 1_024 });
		clients.push(value);
		let message = "";
		try {
			await value.listTools();
		} catch (error) {
			message = (error as Error).message;
		}
		expect(message).toMatch(/stderr captured \(\d+ bytes\) and suppressed/);
		for (const secret of [
			"supersecret",
			"abcdef",
			"splitsecret",
			"jsonsecret",
			"jsonkey",
			"accessvalue",
			"refreshvalue",
			"clientvalue",
			"passwordvalue",
			"openai-secret",
			"dXNlcjpwYXNz",
			"PEMSECRET",
		]) {
			expect(message).not.toContain(secret);
		}
		expect(Buffer.byteLength(message, "utf8")).toBeLessThan(900);
	});

	it("never emits an unkeyed secret suffix when stderr retention truncates", async () => {
		const command = join(dir, "truncated-stderr.mjs");
		executable(
			command,
			`process.stdin.once("data", () => { process.stderr.write("access_token=" + "A".repeat(256)); process.exit(2); });`,
		);
		const value = client(command, { stderrTailBytes: 64 });
		clients.push(value);
		let message = "";
		try {
			await value.listTools();
		} catch (error) {
			message = (error as Error).message;
		}
		expect(message).toContain("stderr truncated and suppressed");
		expect(message).not.toContain("AAAAAAAA");
		expect(Buffer.byteLength(message, "utf8")).toBeLessThan(200);
	});
});
