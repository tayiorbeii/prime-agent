import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";

const DEFAULT_STARTUP_TIMEOUT_MS = 10_000;
const DEFAULT_CALL_TIMEOUT_MS = 30_000;
const STOP_TIMEOUT_MS = 1_000;
const FATAL_UTF8_DECODER = new TextDecoder("utf-8", { fatal: true });

/** Conservative transport limits; callers may lower them for constrained integrations. */
export const DEFAULT_MAX_STDOUT_BUFFER_BYTES = 8_388_608;
export const DEFAULT_MAX_JSON_RPC_MESSAGE_BYTES = 8_388_608;
export const DEFAULT_MAX_TOOL_ARGUMENT_BYTES = 8_388_608;
// Reserve one MiB for JSON-RPC/bridge envelope fields around an 8 MiB argument object.
export const DEFAULT_MAX_JSON_RPC_REQUEST_BYTES = 9_437_184;
export const DEFAULT_STDERR_TAIL_BYTES = 8_192;

export const SUPPORTED_PROTOCOL_VERSIONS = ["2024-11-05", "2025-03-26", "2025-06-18"] as const;

export interface StdioMcpClientOptions {
	server: string;
	command: string;
	args: string[];
	cwd: string;
	env: Record<string, string | undefined>;
	startupTimeoutMs?: number;
	callTimeoutMs?: number;
	maxStdoutBufferBytes?: number;
	maxMessageBytes?: number;
	maxRequestBytes?: number;
	stderrTailBytes?: number;
	/** Called once when the current process/stream identity becomes unusable. */
	onLifecycleInvalidated?: () => void;
}

export interface StdioMcpTool {
	name: string;
	description?: string;
	inputSchema?: unknown;
	[key: string]: unknown;
}

export class StdioMcpTransportError extends Error {
	readonly retryable = true;
	readonly requestNotSent: boolean = false;

	constructor(message: string) {
		super(message);
		this.name = "StdioMcpTransportError";
	}
}

/** A transport failure that is known to have happened before the request was sent. */
export class StdioMcpRequestNotSentError extends StdioMcpTransportError {
	readonly requestNotSent = true;

	constructor(message: string) {
		super(message);
		this.name = "StdioMcpRequestNotSentError";
	}
}

export class StdioMcpProtocolError extends Error {
	readonly retryable = false;

	constructor(message: string) {
		super(message);
		this.name = "StdioMcpProtocolError";
	}
}

export function isRetryableStdioMcpError(error: unknown): boolean {
	return error instanceof StdioMcpTransportError;
}

export function isStdioMcpRequestNotSentError(error: unknown): boolean {
	return error instanceof StdioMcpRequestNotSentError;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

interface PendingRequest {
	resolve: (value: unknown) => void;
	reject: (error: Error) => void;
	timer: ReturnType<typeof globalThis.setTimeout>;
}

/** A bounded, long-lived MCP JSON-RPC client for one configured stdio server. */
export class StdioMcpClient {
	private child?: ChildProcessWithoutNullStreams;
	private startPromise?: Promise<void>;
	private initialized = false;
	private toolsSupported = false;
	private disposed = false;
	private tainted = false;
	private lifecycleInvalidated = false;
	private taintError?: StdioMcpTransportError;
	private stopping?: Promise<void>;
	private nextRequestId = 1;
	private inputBuffer = Buffer.alloc(0);
	private inputBufferLength = 0;
	private stderrTail = "";
	private stderrTruncated = false;
	private readonly pending = new Map<number, PendingRequest>();

	constructor(private readonly options: StdioMcpClientOptions) {
		for (const [name, value] of Object.entries({
			maxStdoutBufferBytes: options.maxStdoutBufferBytes,
			maxMessageBytes: options.maxMessageBytes,
			maxRequestBytes: options.maxRequestBytes,
			stderrTailBytes: options.stderrTailBytes,
		})) {
			if (value !== undefined && (!Number.isSafeInteger(value) || value <= 0)) {
				throw new TypeError(`${name} must be a positive safe integer`);
			}
		}
	}

	async listTools(deadlineEpochMs?: number): Promise<StdioMcpTool[]> {
		await this.start();
		this.ensureToolsSupported();
		const result = await this.request("tools/list", {}, this.callTimeoutMs, deadlineEpochMs);
		if (!isRecord(result) || !Array.isArray(result.tools)) {
			throw this.protocolCorruption(`MCP server ${this.options.server} returned invalid tools/list result`);
		}
		return result.tools.filter((tool): tool is StdioMcpTool => isRecord(tool) && typeof tool.name === "string");
	}

	async callTool(tool: string, arguments_: Record<string, unknown>, deadlineEpochMs?: number): Promise<unknown> {
		await this.start();
		this.ensureToolsSupported();
		return this.request("tools/call", { name: tool, arguments: arguments_ }, this.callTimeoutMs, deadlineEpochMs);
	}

	async health(): Promise<void> {
		await this.start();
		await this.request("ping", {}, this.callTimeoutMs);
	}

	async restart(): Promise<void> {
		if (this.disposed) {
			throw new StdioMcpTransportError(`MCP server ${this.options.server} is disposed`);
		}
		try {
			if (this.tainted) {
				await this.waitForTaintCleanup(true);
			} else {
				this.invalidateLifecycle();
				this.tainted = true;
				await this.stop();
			}
			this.tainted = false;
			this.taintError = undefined;
			await this.start();
		} catch (error) {
			this.tainted = true;
			this.taintError = this.toTransportError(error);
			throw error;
		}
	}

	async dispose(): Promise<void> {
		this.disposed = true;
		const starting = this.startPromise;
		await this.stop();
		if (starting) {
			await starting.catch(() => undefined);
		}
	}

	disposeSync(): void {
		this.disposed = true;
		this.stopSync();
	}

	private get startupTimeoutMs(): number {
		return this.options.startupTimeoutMs ?? DEFAULT_STARTUP_TIMEOUT_MS;
	}

	private get callTimeoutMs(): number {
		return this.options.callTimeoutMs ?? DEFAULT_CALL_TIMEOUT_MS;
	}

	private get maxStdoutBufferBytes(): number {
		return this.options.maxStdoutBufferBytes ?? DEFAULT_MAX_STDOUT_BUFFER_BYTES;
	}

	private get maxMessageBytes(): number {
		return this.options.maxMessageBytes ?? DEFAULT_MAX_JSON_RPC_MESSAGE_BYTES;
	}

	private get maxRequestBytes(): number {
		return this.options.maxRequestBytes ?? DEFAULT_MAX_JSON_RPC_REQUEST_BYTES;
	}

	private get stderrTailBytes(): number {
		return this.options.stderrTailBytes ?? DEFAULT_STDERR_TAIL_BYTES;
	}

	private async start(): Promise<void> {
		if (this.disposed) {
			throw new StdioMcpTransportError(`MCP server ${this.options.server} is disposed`);
		}
		if (this.tainted) await this.waitForTaintCleanup(false);
		if (this.initialized && this.child) return;
		if (!this.startPromise) {
			const start = this.startInternal();
			this.startPromise = start;
			start.then(
				() => {
					if (this.startPromise === start) this.startPromise = undefined;
				},
				() => {
					if (this.startPromise === start) this.startPromise = undefined;
				},
			);
		}
		return this.startPromise;
	}

	private async startInternal(): Promise<void> {
		const child = spawn(this.options.command, this.options.args, {
			cwd: this.options.cwd,
			env: this.options.env,
			stdio: ["pipe", "pipe", "pipe"],
			// Put the sidecar in its own group where supported so shutdown also
			// reaps descendants a server may have spawned.
			detached: process.platform !== "win32",
		});
		this.child = child;
		this.initialized = false;
		this.toolsSupported = false;
		this.inputBuffer = Buffer.alloc(0);
		this.inputBufferLength = 0;
		this.stderrTail = "";
		this.stderrTruncated = false;
		child.stderr.setEncoding("utf8");
		child.stdout.on("data", (chunk: Buffer) => this.handleStdout(chunk));
		// Stderr is untrusted and may contain credentials. Keep only a small,
		// redacted tail for bounded startup/exit diagnostics.
		child.stderr.on("data", (chunk: string) => this.handleStderr(chunk));
		child.on("error", (error) => this.handleChildFailure(child, error));
		child.stdin.on("error", (error) => this.handleChildFailure(child, error));
		child.on("exit", () => this.handleChildFailure(child, new Error("process exited")));

		try {
			const initializeResult = await this.request(
				"initialize",
				{
					protocolVersion: "2024-11-05",
					capabilities: {},
					clientInfo: { name: "prime-agent", version: "0.7.1" },
				},
				this.startupTimeoutMs,
			);
			if (!isRecord(initializeResult) || typeof initializeResult.protocolVersion !== "string") {
				throw new StdioMcpProtocolError(`MCP server ${this.options.server} returned an invalid initialize result`);
			}
			if (
				!SUPPORTED_PROTOCOL_VERSIONS.includes(
					initializeResult.protocolVersion as (typeof SUPPORTED_PROTOCOL_VERSIONS)[number],
				)
			) {
				throw new StdioMcpProtocolError(
					`MCP server ${this.options.server} negotiated unsupported protocol version ${initializeResult.protocolVersion}; supported versions: ${SUPPORTED_PROTOCOL_VERSIONS.join(", ")}`,
				);
			}
			if (!isRecord(initializeResult.serverInfo)) {
				throw new StdioMcpProtocolError(`MCP server ${this.options.server} returned invalid serverInfo`);
			}
			if (!isRecord(initializeResult.capabilities)) {
				throw new StdioMcpProtocolError(`MCP server ${this.options.server} returned invalid capabilities`);
			}
			this.toolsSupported = isRecord(initializeResult.capabilities.tools);
			this.sendNotification("notifications/initialized", {});
			this.initialized = true;
			// A successfully initialized process establishes a new usable identity.
			this.lifecycleInvalidated = false;
			if (this.disposed)
				throw new StdioMcpTransportError(`MCP server ${this.options.server} was disposed during startup`);
		} catch (error) {
			await this.stop();
			if (error instanceof StdioMcpTransportError || error instanceof StdioMcpProtocolError) throw error;
			throw new StdioMcpTransportError(`MCP server ${this.options.server} failed to start${this.exitDiagnostic()}`);
		}
	}

	private request(
		method: string,
		params: Record<string, unknown>,
		timeoutMs: number,
		deadlineEpochMs?: number,
	): Promise<unknown> {
		const child = this.child;
		if (!child || child.stdin.destroyed) {
			return Promise.reject(new StdioMcpRequestNotSentError(`MCP server ${this.options.server} is not running`));
		}
		const id = this.nextRequestId++;
		return new Promise<unknown>((resolve, reject) => {
			const deadlineRemainingMs =
				deadlineEpochMs === undefined ? timeoutMs : Math.max(1, deadlineEpochMs - Date.now());
			const effectiveTimeoutMs = Math.min(timeoutMs, deadlineRemainingMs);
			const timer = globalThis.setTimeout(() => {
				this.pending.delete(id);
				this.taintAndStop();
				reject(new StdioMcpTransportError(`MCP server ${this.options.server} timed out during ${method}`));
			}, effectiveTimeoutMs);
			this.pending.set(id, { resolve, reject, timer });
			let request: string;
			try {
				request = `${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`;
			} catch {
				globalThis.clearTimeout(timer);
				this.pending.delete(id);
				reject(
					new StdioMcpProtocolError(
						`MCP server ${this.options.server} ${method} request is not JSON-serializable`,
					),
				);
				return;
			}
			const requestBytes = Buffer.byteLength(request, "utf8");
			if (requestBytes > this.maxRequestBytes) {
				globalThis.clearTimeout(timer);
				this.pending.delete(id);
				reject(
					new StdioMcpProtocolError(
						`MCP server ${this.options.server} ${method} request is ${requestBytes} bytes; limit is ${this.maxRequestBytes}`,
					),
				);
				return;
			}
			const rejectRequestNotSent = (error?: Error): void => {
				if (!this.pending.has(id)) return;
				globalThis.clearTimeout(timer);
				this.pending.delete(id);
				const code = error ? this.safeErrorCode(error) : "";
				reject(
					new StdioMcpRequestNotSentError(`MCP server ${this.options.server} request failed before write${code}`),
				);
			};
			const rejectAmbiguousWrite = (error: Error): void => {
				if (!this.pending.has(id)) return;
				globalThis.clearTimeout(timer);
				this.pending.delete(id);
				reject(
					new StdioMcpTransportError(
						`MCP server ${this.options.server} ${method} write completion failed${this.safeErrorCode(error)}`,
					),
				);
				this.taintAndStop();
			};
			// Startup/initialize may have consumed the caller's remaining time after
			// it left the manager queue. Recheck at the final write boundary so a
			// mutating tools/call cannot escape its propagated deadline.
			if (deadlineEpochMs !== undefined && Date.now() >= deadlineEpochMs) {
				globalThis.clearTimeout(timer);
				this.pending.delete(id);
				reject(
					new StdioMcpProtocolError(
						`MCP server ${this.options.server} deadline expired before ${method} request write`,
					),
				);
				return;
			}
			try {
				child.stdin.write(request, "utf8", (error?: Error | null) => {
					// A completion callback error can arrive after bytes were accepted by
					// the pipe, so delivery is ambiguous and mutating calls must not retry.
					if (error) rejectAmbiguousWrite(error);
				});
			} catch (error) {
				rejectRequestNotSent(error instanceof Error ? error : undefined);
			}
		});
	}

	private sendNotification(method: string, params: Record<string, unknown>): void {
		const child = this.child;
		if (!child || child.stdin.destroyed) return;
		try {
			child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method, params })}\n`, (error?: Error | null) => {
				if (error) this.handleChildFailure(child, error);
			});
		} catch (error) {
			this.handleChildFailure(child, error instanceof Error ? error : new Error("notification write failed"));
		}
	}

	private appendInput(segment: Buffer, limit: number): void {
		const required = this.inputBufferLength + segment.length;
		if (required > this.inputBuffer.length) {
			let capacity = Math.min(limit, Math.max(64, this.inputBuffer.length || 64));
			while (capacity < required) capacity = Math.min(limit, capacity * 2);
			const grown = Buffer.allocUnsafe(capacity);
			this.inputBuffer.copy(grown, 0, 0, this.inputBufferLength);
			this.inputBuffer = grown;
		}
		segment.copy(this.inputBuffer, this.inputBufferLength);
		this.inputBufferLength = required;
	}

	private handleStdout(chunk: Buffer): void {
		if (this.tainted) return;
		let chunkOffset = 0;
		while (chunkOffset < chunk.length) {
			const newline = chunk.indexOf(0x0a, chunkOffset);
			if (newline < 0) {
				const segment = chunk.subarray(chunkOffset);
				if (this.inputBufferLength + segment.length > this.maxStdoutBufferBytes) {
					this.protocolCorruption(
						`MCP server ${this.options.server} stdout frame exceeded ${this.maxStdoutBufferBytes} bytes without a newline`,
					);
					return;
				}
				this.appendInput(segment, this.maxStdoutBufferBytes);
				return;
			}

			const segment = chunk.subarray(chunkOffset, newline);
			const messageBytes = this.inputBufferLength + segment.length;
			if (messageBytes > this.maxMessageBytes) {
				this.protocolCorruption(
					`MCP server ${this.options.server} JSON-RPC message is ${messageBytes} bytes; limit is ${this.maxMessageBytes}`,
				);
				return;
			}
			this.appendInput(segment, this.maxMessageBytes);
			let line: string;
			try {
				line = FATAL_UTF8_DECODER.decode(this.inputBuffer.subarray(0, this.inputBufferLength)).trim();
			} catch {
				this.protocolCorruption(`MCP server ${this.options.server} returned invalid UTF-8 JSON-RPC output`);
				return;
			}
			this.inputBufferLength = 0;
			chunkOffset = newline + 1;
			if (!line) continue;
			let message: unknown;
			try {
				message = JSON.parse(line);
			} catch {
				this.protocolCorruption(`MCP server ${this.options.server} returned malformed JSON-RPC output`);
				return;
			}
			if (!isRecord(message)) {
				this.protocolCorruption(`MCP server ${this.options.server} returned a non-object JSON-RPC message`);
				return;
			}
			const hasId = Object.hasOwn(message, "id");
			const hasMethod = Object.hasOwn(message, "method");
			const hasResult = Object.hasOwn(message, "result");
			const hasError = Object.hasOwn(message, "error");
			if (message.jsonrpc !== "2.0") {
				this.protocolCorruption(`MCP server ${this.options.server} returned an invalid JSON-RPC version`);
				return;
			}
			if (hasMethod) {
				const validId = !hasId || typeof message.id === "number" || typeof message.id === "string";
				const validParams =
					!Object.hasOwn(message, "params") || isRecord(message.params) || Array.isArray(message.params);
				if (typeof message.method !== "string" || !validId || !validParams || hasResult || hasError) {
					this.protocolCorruption(`MCP server ${this.options.server} returned an invalid JSON-RPC request`);
					return;
				}
				continue;
			}
			const validResponseId =
				hasId && (message.id === null || typeof message.id === "number" || typeof message.id === "string");
			const validError =
				!hasError ||
				(isRecord(message.error) &&
					typeof message.error.code === "number" &&
					typeof message.error.message === "string");
			if (!validResponseId || hasResult === hasError || !validError) {
				this.protocolCorruption(`MCP server ${this.options.server} returned an invalid JSON-RPC response`);
				return;
			}
			const id = message.id;
			if (typeof id !== "number") continue;
			const pending = this.pending.get(id);
			if (!pending) continue;
			this.pending.delete(id);
			globalThis.clearTimeout(pending.timer);
			if (hasError) {
				pending.reject(
					new StdioMcpProtocolError(
						`MCP server ${this.options.server} rejected ${String((message.error as Record<string, unknown>).code ?? "request")}`,
					),
				);
			} else {
				pending.resolve(message.result);
			}
		}
	}

	private handleStderr(chunk: string): void {
		const bytes = Buffer.from(`${this.stderrTail}${chunk}`, "utf8");
		if (bytes.length > this.stderrTailBytes) this.stderrTruncated = true;
		this.stderrTail =
			bytes.length <= this.stderrTailBytes
				? bytes.toString("utf8")
				: bytes
						.subarray(bytes.length - this.stderrTailBytes)
						.toString("utf8")
						.replace(/^\uFFFD+/, "");
	}

	private safeErrorCode(error: Error): string {
		const code = (error as NodeJS.ErrnoException).code;
		return typeof code === "string" && /^[A-Z0-9_]{1,32}$/.test(code) ? ` (${code})` : "";
	}

	private exitDiagnostic(): string {
		if (this.stderrTruncated) return "; stderr truncated and suppressed";
		const bytes = Buffer.byteLength(this.stderrTail, "utf8");
		return bytes > 0 ? `; stderr captured (${bytes} bytes) and suppressed` : "";
	}

	private protocolCorruption(message: string): StdioMcpProtocolError {
		this.inputBuffer = Buffer.alloc(0);
		this.inputBufferLength = 0;
		const error = new StdioMcpProtocolError(message);
		this.failPending(error);
		this.taintAndStop();
		return error;
	}

	private handleChildFailure(child: ChildProcessWithoutNullStreams, error: Error): void {
		if (this.child !== child) return;
		if (child.exitCode !== null || child.signalCode !== null) {
			if (!this.tainted && !this.disposed && !this.stopping) this.invalidateLifecycle();
			this.child = undefined;
			this.initialized = false;
			this.toolsSupported = false;
			this.tainted = true;
			this.taintError = undefined;
			this.failPending(
				new StdioMcpTransportError(`MCP server ${this.options.server} stopped${this.exitDiagnostic()}`),
			);
			return;
		}
		this.failPending(
			new StdioMcpTransportError(
				`MCP server ${this.options.server} transport failed${this.safeErrorCode(error)}${this.exitDiagnostic()}`,
			),
		);
		this.taintAndStop();
	}

	private ensureToolsSupported(): void {
		if (!this.toolsSupported) {
			throw new StdioMcpProtocolError(
				`MCP server ${this.options.server} did not negotiate tool support (initialize capabilities.tools is missing)`,
			);
		}
	}

	private failPending(error: Error): void {
		for (const [id, pending] of this.pending) {
			globalThis.clearTimeout(pending.timer);
			pending.reject(error);
			this.pending.delete(id);
		}
	}

	private toTransportError(error: unknown): StdioMcpTransportError {
		if (error instanceof StdioMcpTransportError) return error;
		const code = error instanceof Error ? this.safeErrorCode(error) : "";
		return new StdioMcpTransportError(`MCP server ${this.options.server} cleanup failed${code}`);
	}

	private invalidateLifecycle(): void {
		if (this.lifecycleInvalidated) return;
		this.lifecycleInvalidated = true;
		this.options.onLifecycleInvalidated?.();
	}

	private taintAndStop(): void {
		this.invalidateLifecycle();
		this.tainted = true;
		const stopping = this.stop();
		void stopping.then(
			() => undefined,
			(error) => {
				this.taintError = this.toTransportError(error);
			},
		);
	}

	private async waitForTaintCleanup(retryOnFailure: boolean): Promise<void> {
		const stopping = this.stopping;
		if (stopping) {
			try {
				await stopping;
			} catch (error) {
				if (!retryOnFailure) throw error;
				if (this.stopping === stopping) this.stopping = undefined;
				this.taintError = undefined;
				await this.stop();
			}
			if (this.stopping === stopping) this.stopping = undefined;
		}
		if (this.taintError) {
			if (!retryOnFailure) throw this.taintError;
			this.taintError = undefined;
			await this.stop();
		}
		this.tainted = false;
		this.taintError = undefined;
	}

	private stop(): Promise<void> {
		if (this.stopping) return this.stopping;
		const stopping = Promise.resolve().then(() => this.stopInternal());
		this.stopping = stopping;
		stopping.then(
			() => {
				if (this.stopping === stopping) this.stopping = undefined;
			},
			() => {
				if (this.stopping === stopping) this.stopping = undefined;
			},
		);
		return stopping;
	}

	private async stopInternal(): Promise<void> {
		const child = this.child;
		this.initialized = false;
		this.toolsSupported = false;
		this.failPending(new StdioMcpTransportError(`MCP server ${this.options.server} stopped`));
		if (!child || child.exitCode !== null || child.signalCode !== null) {
			if (this.child === child) this.child = undefined;
			return;
		}

		// MCP stdio shutdown starts with EOF on stdin. Signals are escalation only.
		try {
			if (!child.stdin.destroyed) child.stdin.end();
		} catch {
			// The child may have exited between the state check and end().
		}
		if (await this.waitForExit(child)) {
			if (this.child === child) this.child = undefined;
			return;
		}
		if (child.exitCode !== null || child.signalCode !== null) {
			if (this.child === child) this.child = undefined;
			return;
		}

		this.killProcessTree(child, "SIGTERM");
		if (await this.waitForExit(child)) {
			if (this.child === child) this.child = undefined;
			return;
		}
		if (child.exitCode !== null || child.signalCode !== null) {
			if (this.child === child) this.child = undefined;
			return;
		}

		this.killProcessTree(child, "SIGKILL");
		// Do not return until the child has actually emitted exit. This gives callers
		// a cleanup guarantee instead of merely confirming that a signal was sent.
		if (await this.waitForExit(child)) {
			if (this.child === child) this.child = undefined;
			return;
		}
		if (child.exitCode !== null || child.signalCode !== null) {
			if (this.child === child) this.child = undefined;
			return;
		}

		// Keep the live child reference so a later dispose() can retry cleanup. Its
		// exit handler will clear the reference if the process exits asynchronously.
		if (this.child === undefined) this.child = child;
		throw new StdioMcpTransportError(`MCP server ${this.options.server} did not exit after SIGKILL`);
	}

	/** Synchronous SIGKILL-only cleanup for process-exit hooks; async waits are impossible. */
	private stopSync(): void {
		const child = this.child;
		this.child = undefined;
		this.initialized = false;
		this.toolsSupported = false;
		this.failPending(new StdioMcpTransportError(`MCP server ${this.options.server} stopped`));
		if (!child || child.exitCode !== null) return;
		this.killProcessTree(child, "SIGKILL");
	}

	private waitForExit(child: ChildProcessWithoutNullStreams): Promise<boolean> {
		if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve(true);
		return new Promise<boolean>((resolve) => {
			let settled = false;
			let timer: ReturnType<typeof globalThis.setTimeout>;
			const onExit = (): void => {
				if (settled) return;
				settled = true;
				globalThis.clearTimeout(timer);
				resolve(true);
			};
			timer = globalThis.setTimeout(() => {
				if (settled) return;
				settled = true;
				child.off("exit", onExit);
				resolve(false);
			}, STOP_TIMEOUT_MS);
			timer.unref?.();
			child.once("exit", onExit);
		});
	}

	private killProcessTree(child: ChildProcessWithoutNullStreams, signal: NodeJS.Signals): void {
		try {
			if (process.platform !== "win32" && child.pid) {
				process.kill(-child.pid, signal);
			} else {
				child.kill(signal);
			}
		} catch {
			try {
				child.kill(signal);
			} catch {
				// Already exited.
			}
		}
	}
}
