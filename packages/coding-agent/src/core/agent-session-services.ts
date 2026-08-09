import { join } from "node:path";
import type { ThinkingLevel } from "@earendil-works/pi-agent-core";
import type { Model, ServiceTier } from "@earendil-works/pi-ai";
import { getAgentDir } from "../config.js";
import type { AgentSessionMessageController } from "./agent-messages.js";
import type { AgentObserveController } from "./agent-observe.js";
import type { AgentExecutionMode } from "./agent-session-config.js";
import { installAgentTraceUpload } from "./agent-traces.js";
import { AuthStorage } from "./auth-storage.js";
import type { AgentAutonomousConfig } from "./autonomous.js";
import type { AgentRlmHeartbeatController } from "./cron-jobs.js";
import { createHerdrAgentStateExtension } from "./extensions/builtin/herdr-agent-state.js";
import type { SessionStartEvent, ToolDefinition } from "./extensions/index.js";
import { McpManager } from "./mcp/mcp-manager.js";
import { ModelRegistry } from "./model-registry.js";
import { DefaultResourceLoader, type DefaultResourceLoaderOptions, type ResourceLoader } from "./resource-loader.js";
import type { RlmAgentTemplateMetadata, SubagentRuntimeHost } from "./rlm-runtime.js";
import { type ResolvedResourceScope, restoreResourceScope, ScopedResourceLoader } from "./scoped-resource-loader.js";
import { type CreateAgentSessionResult, createAgentSession } from "./sdk.js";
import type { SessionManager } from "./session-manager.js";
import { SettingsManager } from "./settings-manager.js";
import { installAgentTelemetry, isTelemetryEnabled } from "./telemetry.js";

/**
 * Non-fatal issues collected while creating services or sessions.
 *
 * Runtime creation returns diagnostics to the caller instead of printing or
 * exiting. The app layer decides whether warnings should be shown and whether
 * errors should abort startup.
 */
export interface AgentSessionRuntimeDiagnostic {
	type: "info" | "warning" | "error";
	message: string;
}

/**
 * Inputs for creating cwd-bound runtime services.
 *
 * These services are recreated whenever the effective session cwd changes.
 * CLI-provided resource paths should be resolved to absolute paths before they
 * reach this function, so later cwd switches do not reinterpret them.
 */
export interface CreateAgentSessionServicesOptions {
	cwd: string;
	agentDir?: string;
	authStorage?: AuthStorage;
	settingsManager?: SettingsManager;
	modelRegistry?: ModelRegistry;
	extensionFlagValues?: Map<string, boolean | string>;
	resourceLoaderOptions?: Omit<DefaultResourceLoaderOptions, "cwd" | "agentDir" | "settingsManager">;
	/**
	 * Skip the built-in Herdr reporter for these services. Set for RLM subagent
	 * runtimes: they inherit the parent's HERDR_* pane identity, so their own
	 * reporter would race the parent's on the same pane and a subagent quit
	 * would release the pane while the parent is still running.
	 */
	noBuiltinHerdrReporter?: boolean;
	/** Explicit daemon-carried opt-out; cannot enable telemetry. */
	telemetryDisabled?: true;
}

export interface AgentSessionCreationOptions {
	model?: Model<any>;
	thinkingLevel?: ThinkingLevel;
	/** Provider service tier. Fast mode uses "priority". */
	serviceTier?: ServiceTier;
	scopedModels?: Array<{ model: Model<any>; thinkingLevel?: ThinkingLevel }>;
	tools?: string[];
	noTools?: "all" | "builtin";
	customTools?: ToolDefinition[];
	initialActiveToolNames?: string[];
	allowedToolNames?: string[];
	/** Immutable child-only skills and supplemental prompt resolved before admission. */
	resourceScope?: ResolvedResourceScope;
	includeGoals?: boolean;
	includeCompactSkill?: boolean;
	agentMessageController?: AgentSessionMessageController;
	agentObserveController?: AgentObserveController;
	rlmDepth?: number;
	rlmMaxDepth?: number;
	rlmSessionDir?: string;
	rlmParentNodeId?: string;
	rlmParentAgent?: string;
	subagentRuntimeHost?: SubagentRuntimeHost;
	rlmHeartbeatController?: AgentRlmHeartbeatController;
	prewarmIpythonKernel?: boolean;
	autonomous?: AgentAutonomousConfig;
	/** Serialized refine mode for print/headless autonomous runs. */
	serializedRefine?: boolean;
	/** User-facing client mode that created the top-level session. */
	executionMode?: AgentExecutionMode;
	/** Explicit daemon-carried opt-out; cannot enable telemetry. */
	telemetryDisabled?: true;
	/** Initial goal to seed at session creation (rlmDepth 0 only, idempotent). */
	initialGoal?: { objective: string; tokenBudget?: number };
}

/**
 * Inputs for creating an AgentSession from already-created services.
 *
 * Use this after services exist and any cwd-bound model/tool/session options
 * have been resolved against those services.
 */
export interface CreateAgentSessionFromServicesOptions extends AgentSessionCreationOptions {
	services: AgentSessionServices;
	sessionManager: SessionManager;
	sessionStartEvent?: SessionStartEvent;
}

/**
 * Coherent cwd-bound runtime services for one effective session cwd.
 *
 * This is infrastructure only. The AgentSession itself is created separately so
 * session options can be resolved against these services first.
 */
export interface AgentSessionServices {
	cwd: string;
	agentDir: string;
	authStorage: AuthStorage;
	settingsManager: SettingsManager;
	modelRegistry: ModelRegistry;
	resourceLoader: ResourceLoader;
	mcpManager: McpManager;
	diagnostics: AgentSessionRuntimeDiagnostic[];
}

function applyExtensionFlagValues(
	resourceLoader: ResourceLoader,
	extensionFlagValues: Map<string, boolean | string> | undefined,
): AgentSessionRuntimeDiagnostic[] {
	if (!extensionFlagValues) {
		return [];
	}

	const diagnostics: AgentSessionRuntimeDiagnostic[] = [];
	const extensionsResult = resourceLoader.getExtensions();
	const registeredFlags = new Map<string, { type: "boolean" | "string" }>();
	for (const extension of extensionsResult.extensions) {
		for (const [name, flag] of extension.flags) {
			registeredFlags.set(name, { type: flag.type });
		}
	}

	const unknownFlags: string[] = [];
	for (const [name, value] of extensionFlagValues) {
		const flag = registeredFlags.get(name);
		if (!flag) {
			unknownFlags.push(name);
			continue;
		}
		if (flag.type === "boolean") {
			extensionsResult.runtime.flagValues.set(name, true);
			continue;
		}
		if (typeof value === "string") {
			extensionsResult.runtime.flagValues.set(name, value);
			continue;
		}
		diagnostics.push({
			type: "error",
			message: `Extension flag "--${name}" requires a value`,
		});
	}

	if (unknownFlags.length > 0) {
		diagnostics.push({
			type: "error",
			message: `Unknown option${unknownFlags.length === 1 ? "" : "s"}: ${unknownFlags.map((name) => `--${name}`).join(", ")}`,
		});
	}

	return diagnostics;
}

/**
 * Create cwd-bound runtime services.
 *
 * Returns services plus diagnostics. It does not create an AgentSession.
 */
export async function createAgentSessionServices(
	options: CreateAgentSessionServicesOptions,
): Promise<AgentSessionServices> {
	const cwd = options.cwd;
	const agentDir = options.agentDir ?? getAgentDir();
	const authStorage = options.authStorage ?? AuthStorage.create(join(agentDir, "auth.json"));
	const settingsManager = options.settingsManager ?? SettingsManager.create(cwd, agentDir);
	const modelRegistry = options.modelRegistry ?? ModelRegistry.create(authStorage, join(agentDir, "models.json"));

	// MCP integrations: registers OAuth providers and gates the built-in
	// integration skills by whether the user is logged in (enable-by-login).
	const mcpManager = new McpManager({
		authStorage,
		cwd,
		getUserServers: () => settingsManager.getMcpServers(),
	});
	// refresh() resets the OAuth registry to built-ins; re-add user MCP providers too.
	modelRegistry.setOnOAuthProvidersReset(() => mcpManager.registerUserProviders());

	const userExtensionFactories = options.resourceLoaderOptions?.extensionFactories ?? [];
	// The built-in Herdr reporter defers to Herdr's own file-based integration
	// when the loader actually loaded it; two reporters would race on the same
	// pane. Deferral is late-bound to the loader's loaded paths (inline
	// factories run after file extensions load), so a file that exists but is
	// disabled or never discovered does not silence the built-in.
	// noExtensions is a full opt-out: it disables the built-in reporter too,
	// not just discovered extension files.
	const skipHerdrReporter = options.noBuiltinHerdrReporter || options.resourceLoaderOptions?.noExtensions;
	const builtinExtensionFactories = skipHerdrReporter
		? []
		: [createHerdrAgentStateExtension(() => resourceLoader.getLoadedExtensionPaths())];
	const resourceLoader: DefaultResourceLoader = new DefaultResourceLoader({
		...(options.resourceLoaderOptions ?? {}),
		extensionFactories: [...builtinExtensionFactories, ...userExtensionFactories],
		cwd,
		agentDir,
		settingsManager,
		extraBuiltinSkillOverrides: () => mcpManager.getDisabledBuiltinSkillOverrides(),
	});
	await resourceLoader.reload();

	const diagnostics: AgentSessionRuntimeDiagnostic[] = [];
	if (
		!options.telemetryDisabled &&
		isTelemetryEnabled(settingsManager) &&
		!settingsManager.getTelemetryNoticeShown()
	) {
		diagnostics.push({
			type: "info",
			message:
				"Prime Agent sends pseudonymous usage and performance metrics without prompts, responses, tool content, file paths, or repository data. Disable this with telemetry.enabled=false, PRIME_AGENT_TELEMETRY=0, DO_NOT_TRACK=1, or offline mode.",
		});
		settingsManager.setTelemetryNoticeShown(true);
	}
	const extensionsResult = resourceLoader.getExtensions();
	for (const { name, config, extensionPath } of extensionsResult.runtime.pendingProviderRegistrations) {
		try {
			modelRegistry.registerProvider(name, config);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			diagnostics.push({
				type: "error",
				message: `Extension "${extensionPath}" error: ${message}`,
			});
		}
	}
	extensionsResult.runtime.pendingProviderRegistrations = [];
	diagnostics.push(...applyExtensionFlagValues(resourceLoader, options.extensionFlagValues));

	return {
		cwd,
		agentDir,
		authStorage,
		settingsManager,
		modelRegistry,
		resourceLoader,
		mcpManager,
		diagnostics,
	};
}

/**
 * Create an AgentSession from previously created services.
 *
 * This keeps session creation separate from service creation so callers can
 * resolve model, thinking, tools, and other session inputs against the target
 * cwd before constructing the session.
 */
function persistedTemplateIdentity(sessionManager: SessionManager): RlmAgentTemplateMetadata | undefined {
	const entry = [...sessionManager.getEntries()]
		.reverse()
		.find(
			(candidate) => candidate.type === "custom" && candidate.customType === "prime.agent-template-resolution/v1",
		);
	if (!entry || entry.type !== "custom") return undefined;
	const data = entry.data as Partial<RlmAgentTemplateMetadata> | undefined;
	if (
		!data ||
		(data as { schema?: unknown }).schema !== "prime.agent-template-resolution/v1" ||
		typeof data.templateId !== "string" ||
		typeof data.templateSha256 !== "string" ||
		typeof data.promptSha256 !== "string" ||
		!Array.isArray(data.skillNames) ||
		!data.skillNames.every((name) => typeof name === "string") ||
		!Array.isArray(data.skillSnapshots) ||
		!data.skillSnapshots.every(
			(snapshot) =>
				typeof snapshot === "object" &&
				snapshot !== null &&
				typeof snapshot.name === "string" &&
				typeof snapshot.filePath === "string" &&
				typeof snapshot.sha256 === "string",
		) ||
		!(["off", "minimal", "low", "medium", "high", "xhigh", "max"] as unknown[]).includes(data.thinkingLevel) ||
		!Array.isArray(data.activeToolNames) ||
		!data.activeToolNames.every((name) => typeof name === "string") ||
		(data.allowedToolNames !== undefined &&
			(!Array.isArray(data.allowedToolNames) || !data.allowedToolNames.every((name) => typeof name === "string")))
	) {
		throw new Error("Persisted agent template resolution metadata is malformed");
	}
	return data as RlmAgentTemplateMetadata;
}

export async function createAgentSessionFromServices(
	options: CreateAgentSessionFromServicesOptions,
): Promise<CreateAgentSessionResult> {
	const identity = persistedTemplateIdentity(options.sessionManager);
	const resourceScope =
		options.resourceScope ?? (identity ? restoreResourceScope(options.services.resourceLoader, identity) : undefined);
	installAgentTraceUpload(options.sessionManager, {
		authStorage: options.services.authStorage,
		settingsManager: options.services.settingsManager,
	});
	const result = await createAgentSession({
		cwd: options.services.cwd,
		agentDir: options.services.agentDir,
		authStorage: options.services.authStorage,
		settingsManager: options.services.settingsManager,
		modelRegistry: options.services.modelRegistry,
		resourceLoader: resourceScope
			? new ScopedResourceLoader(options.services.resourceLoader, resourceScope)
			: options.services.resourceLoader,
		mcpManager: options.services.mcpManager,
		sessionManager: options.sessionManager,
		model: options.model,
		thinkingLevel: options.thinkingLevel ?? identity?.thinkingLevel,
		serviceTier: options.serviceTier,
		scopedModels: options.scopedModels,
		tools: options.tools,
		noTools: options.noTools,
		customTools: options.customTools,
		initialActiveToolNames: options.initialActiveToolNames ?? identity?.activeToolNames,
		allowedToolNames: options.allowedToolNames ?? identity?.allowedToolNames,
		includeGoals: options.includeGoals,
		includeCompactSkill: options.includeCompactSkill,
		agentMessageController: options.agentMessageController,
		agentObserveController: options.agentObserveController,
		rlmDepth: options.rlmDepth,
		rlmMaxDepth: options.rlmMaxDepth,
		rlmSessionDir: options.rlmSessionDir,
		rlmParentNodeId: options.rlmParentNodeId,
		rlmParentAgent: options.rlmParentAgent,
		subagentRuntimeHost: options.subagentRuntimeHost,
		rlmHeartbeatController: options.rlmHeartbeatController,
		sessionStartEvent: options.sessionStartEvent,
		prewarmIpythonKernel: options.prewarmIpythonKernel,
		autonomous: options.autonomous,
		serializedRefine: options.serializedRefine,
		initialGoal: options.initialGoal,
	});
	if (identity) {
		const availableTools = new Set(result.session.getAllTools().map((tool) => tool.name));
		const requiredTools = [...identity.activeToolNames, ...(identity.allowedToolNames ?? [])];
		const missingTools = [...new Set(requiredTools)].filter((name) => !availableTools.has(name));
		const actualActiveTools = new Set(result.session.getActiveToolNames());
		const activeToolsChanged =
			actualActiveTools.size !== identity.activeToolNames.length ||
			identity.activeToolNames.some((name) => !actualActiveTools.has(name));
		if (missingTools.length > 0 || activeToolsChanged || result.session.thinkingLevel !== identity.thinkingLevel) {
			result.session.dispose();
			throw new Error(
				`Persisted agent template ${JSON.stringify(identity.templateId)} runtime policy is incompatible; start a fresh child`,
			);
		}
	}
	if (result.session.rlmDepth === 0 && !options.telemetryDisabled) {
		installAgentTelemetry(result.session, {
			agentDir: options.services.agentDir,
			settingsManager: options.services.settingsManager,
			executionMode: options.executionMode,
		});
	}
	return result;
}
