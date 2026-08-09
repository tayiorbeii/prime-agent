import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { Agent, type AgentMessage } from "@earendil-works/pi-agent-core";
import { type Context, createAssistantMessageEventStream, getModel } from "@earendil-works/pi-ai";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AgentSession } from "../src/core/agent-session.js";
import { AuthStorage } from "../src/core/auth-storage.js";
import type { LoadExtensionsResult } from "../src/core/extensions/index.js";
import { convertToLlm } from "../src/core/messages.js";
import { ModelRegistry } from "../src/core/model-registry.js";
import { SessionManager } from "../src/core/session-manager.js";
import { SettingsManager } from "../src/core/settings-manager.js";
import type { Skill } from "../src/core/skills.js";
import { createSyntheticSourceInfo } from "../src/core/source-info.js";
import { createTestExtensionsResult, createTestResourceLoader } from "./utilities.js";

const model = getModel("anthropic", "claude-sonnet-4-5")!;
const sentinel = "PERSONA_SENTINEL_engineering_manager";

function answer(context: Context) {
	const stream = createAssistantMessageEventStream();
	const last = context.messages.at(-1) as AgentMessage | undefined;
	queueMicrotask(() =>
		stream.push({
			type: "done",
			reason: "stop",
			message: {
				role: "assistant",
				content: [{ type: "text", text: last?.role === "user" ? "done" : "done" }],
				api: model.api,
				provider: model.provider,
				model: model.id,
				usage: {
					input: 1,
					output: 1,
					cacheRead: 0,
					cacheWrite: 0,
					totalTokens: 2,
					cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
				},
				stopReason: "stop",
				timestamp: Date.now(),
			},
		}),
	);
	return stream;
}

function markdownSkill(root: string, name: string, hidden: boolean): Skill {
	return {
		name,
		description: `${name} description sentinel`,
		filePath: join(root, name, "SKILL.md"),
		baseDir: join(root, name),
		sourceInfo: createSyntheticSourceInfo(join(root, name, "SKILL.md"), { source: "test" }),
		disableModelInvocation: hidden,
		kind: "markdown",
	};
}

describe("rlm agent templates", () => {
	let tempDir: string;
	let roots: AgentSession[];
	let extensions: LoadExtensionsResult;

	beforeEach(async () => {
		roots = [];
		tempDir = join(tmpdir(), `rlm-template-${Date.now()}-${Math.random().toString(36).slice(2)}`);
		mkdirSync(tempDir, { recursive: true });
		extensions = await createTestExtensionsResult(
			[
				(pi) =>
					pi.registerAgentTemplate({
						schema: "prime.agent-template/v1",
						id: "prime/template/engineering-manager",
						label: "Engineering Manager",
						description: "Produces technical plans.",
						promptAppend: sentinel,
						thinkingLevel: "high",
						activeToolNames: ["ipython"],
						allowedToolNames: ["ipython"],
						skills: { include: ["team-system-design"], exposeSelected: true },
					}),
			],
			tempDir,
		);
	});

	afterEach(() => {
		for (const session of roots) session.dispose();
		rmSync(tempDir, { recursive: true, force: true });
	});

	function createRoot(allowedToolNames?: string[]): AgentSession {
		const auth = AuthStorage.create(join(tempDir, "auth.json"));
		auth.setRuntimeApiKey("anthropic", "test-key");
		const visible = markdownSkill(tempDir, "persona-team", false);
		const selected = markdownSkill(tempDir, "team-system-design", true);
		const excluded = markdownSkill(tempDir, "team-clean-code", true);
		const agent = new Agent({
			convertToLlm,
			getApiKey: () => "test-key",
			initialState: { model, systemPrompt: "", tools: [], thinkingLevel: "off" },
			streamFn: (_model, context) => answer(context),
		});
		const root = new AgentSession({
			agent,
			sessionManager: SessionManager.create(tempDir, join(tempDir, "sessions")),
			settingsManager: SettingsManager.create(tempDir, tempDir),
			cwd: tempDir,
			modelRegistry: ModelRegistry.create(auth, join(tempDir, "models.json")),
			resourceLoader: createTestResourceLoader({
				extensionsResult: extensions,
				skills: [visible, selected, excluded],
			}),
			allowedToolNames,
			rlmDepth: 0,
			rlmMaxDepth: 1,
		});
		roots.push(root);
		return root;
	}

	it("injects persona and selected hidden skill only into the selected child", async () => {
		const parent = createRoot();
		const handle = await parent.runRlmChild("create a bounded plan", {
			template: "prime/template/engineering-manager",
		});
		let child = parent.getRlmChildSession(handle.rlm_child_id);
		for (let index = 0; !child && index < 100; index++) {
			await sleep(5);
			child = parent.getRlmChildSession(handle.rlm_child_id);
		}
		if (!child) throw new Error("child was not published");

		expect(parent.agent.state.systemPrompt).not.toContain(sentinel);
		expect(child.agent.state.systemPrompt.match(new RegExp(sentinel, "g"))).toHaveLength(1);
		expect(child.agent.state.systemPrompt).toContain("team-system-design description sentinel");
		expect(child.agent.state.systemPrompt).not.toContain("team-clean-code description sentinel");
		expect(child.thinkingLevel).toBe("high");
		expect(child.getActiveToolNames()).toEqual(["ipython"]);
		const metadata = child.sessionManager
			.getEntries()
			.find((entry) => entry.type === "custom" && entry.customType === "prime.agent-template-resolution/v1");
		if (!metadata || metadata.type !== "custom") throw new Error("template metadata missing");
		expect(metadata.data).toMatchObject({
			templateId: "prime/template/engineering-manager",
			skillNames: ["team-system-design"],
			skillSnapshots: [{ name: "team-system-design" }],
		});
		expect((metadata.data as { templateSha256?: string }).templateSha256).toHaveLength(64);

		const siblingHandle = await parent.runRlmChild("ordinary sibling");
		let sibling = parent.getRlmChildSession(siblingHandle.rlm_child_id);
		for (let index = 0; !sibling && index < 100; index++) {
			await sleep(5);
			sibling = parent.getRlmChildSession(siblingHandle.rlm_child_id);
		}
		if (!sibling) throw new Error("sibling was not published");
		expect(sibling.agent.state.systemPrompt).not.toContain(sentinel);
		expect(sibling.agent.state.systemPrompt).not.toContain("team-system-design description sentinel");
	});

	it("rejects unknown and non-string templates before admission while omission remains supported", async () => {
		const parent = createRoot();
		await expect(parent.runRlmChild("unknown", { template: "prime/template/missing" })).rejects.toThrow(
			'Unknown agent template "prime/template/missing"',
		);
		await expect(parent.runRlmChild("invalid", { template: 123 })).rejects.toThrow("template must be a string");
		const restrictedParent = createRoot(["read"]);
		await expect(
			restrictedParent.runRlmChild("forbidden expansion", { template: "prime/template/engineering-manager" }),
		).rejects.toThrow("outside the parent allowlist");
		await expect(parent.runRlmChild("ordinary child")).resolves.toMatchObject({
			model: `${model.provider}/${model.id}`,
		});
	});
});
