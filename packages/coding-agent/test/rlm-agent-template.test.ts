import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { Agent, type AgentMessage } from "@earendil-works/pi-agent-core";
import { type Context, createAssistantMessageEventStream, getModel } from "@earendil-works/pi-ai";
import { Type } from "typebox";
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

const model = getModel("openai-codex", "gpt-5.4")!;
const sentinel = "PERSONA_SENTINEL_engineering_manager";
let answerDelayMs = 0;

function answer(context: Context) {
	const stream = createAssistantMessageEventStream();
	const last = context.messages.at(-1) as AgentMessage | undefined;
	setTimeout(
		() =>
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
		answerDelayMs,
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
		answerDelayMs = 0;
		tempDir = join(tmpdir(), `rlm-template-${Date.now()}-${Math.random().toString(36).slice(2)}`);
		mkdirSync(tempDir, { recursive: true });
		for (const name of [
			"persona-team",
			"skill-usage",
			"team-system-design",
			"team-clean-code",
			"persona-team-clean-code",
			"persona-team-refactoring-patterns",
			"persona-team-software-design-philosophy",
			"persona-team-pragmatic-programmer",
			"persona-team-clean-architecture",
			"persona-team-ddia-systems",
			"persona-team-domain-driven-design",
		]) {
			const baseDir = join(tempDir, name);
			mkdirSync(baseDir, { recursive: true });
			writeFileSync(join(baseDir, "SKILL.md"), `# ${name}\n\nDeterministic test method body.\n`);
		}
		extensions = await createTestExtensionsResult(
			[
				(pi) => {
					pi.registerTool({
						name: "passive_tool",
						label: "Passive Tool",
						description: "Available but inactive template test tool.",
						parameters: Type.Object({}),
						execute: async () => ({ content: [{ type: "text", text: "ok" }], details: {} }),
					});
					pi.registerAgentTemplate({
						schema: "prime.agent-template/v1",
						id: "prime/template/engineering-manager",
						label: "Engineering Manager",
						description: "Produces technical plans.",
						promptAppend: sentinel,
						thinkingLevel: "high",
						activeToolNames: ["ipython"],
						allowedToolNames: ["ipython", "passive_tool"],
						skills: { include: ["team-system-design"], exposeSelected: true },
						skillEnforcement: {
							schema: "prime.skill-enforcement/v1",
							mode: "required",
							requireActivation: true,
							requireDisposition: true,
							allowedDispositions: ["applied", "not_applicable"],
							maxRepairTurns: 2,
						},
					});
					for (const [id, label, skills] of [
						[
							"implementation-engineer",
							"Implementation Engineer",
							[
								"persona-team-clean-code",
								"persona-team-refactoring-patterns",
								"persona-team-software-design-philosophy",
								"persona-team-pragmatic-programmer",
							],
						],
						[
							"staff-reviewer",
							"Staff Reviewer",
							[
								"persona-team-clean-code",
								"persona-team-clean-architecture",
								"persona-team-refactoring-patterns",
								"persona-team-software-design-philosophy",
							],
						],
						[
							"security-officer",
							"Security Officer",
							[
								"persona-team-clean-architecture",
								"persona-team-ddia-systems",
								"persona-team-domain-driven-design",
							],
						],
					] as const) {
						pi.registerAgentTemplate({
							schema: "prime.agent-template/v1",
							id: `prime/persona-team/${id}`,
							label,
							description: `Deterministic black-box fixture for ${label}.`,
							promptAppend: `PERSONA_SENTINEL_${id}`,
							activeToolNames: ["ipython"],
							allowedToolNames: ["ipython", "passive_tool"],
							skills: { include: [...skills], exposeSelected: true },
							skillEnforcement: {
								schema: "prime.skill-enforcement/v1",
								mode: "required",
								requireActivation: true,
								requireDisposition: true,
								allowedDispositions: ["applied", "not_applicable"],
								maxRepairTurns: 2,
							},
						});
					}
				},
			],
			tempDir,
		);
	});

	afterEach(() => {
		for (const session of roots) session.dispose();
		rmSync(tempDir, { recursive: true, force: true });
	});

	function createRoot(allowedToolNames?: string[], includeSkillUsage = true, rlmMaxDepth = 1): AgentSession {
		const auth = AuthStorage.create(join(tempDir, "auth.json"));
		auth.setRuntimeApiKey("openai-codex", "test-key");
		const visible = markdownSkill(tempDir, "persona-team", false);
		const skillUsage = markdownSkill(tempDir, "skill-usage", false);
		const selected = markdownSkill(tempDir, "team-system-design", true);
		const excluded = markdownSkill(tempDir, "team-clean-code", true);
		const personaMethods = [
			"persona-team-clean-code",
			"persona-team-refactoring-patterns",
			"persona-team-software-design-philosophy",
			"persona-team-pragmatic-programmer",
			"persona-team-clean-architecture",
			"persona-team-ddia-systems",
			"persona-team-domain-driven-design",
		].map((name) => markdownSkill(tempDir, name, true));
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
				skills: [visible, ...(includeSkillUsage ? [skillUsage] : []), selected, excluded, ...personaMethods],
			}),
			allowedToolNames,
			rlmDepth: 0,
			rlmMaxDepth,
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
		expect(child.getAllTools().map((tool) => tool.name)).toEqual(expect.arrayContaining(["ipython", "passive_tool"]));
		await child.reload();
		expect(child.getActiveToolNames()).toEqual(["ipython"]);
		const metadata = child.sessionManager
			.getEntries()
			.find((entry) => entry.type === "custom" && entry.customType === "prime.agent-template-resolution/v1");
		if (!metadata || metadata.type !== "custom") throw new Error("template metadata missing");
		expect(metadata.data).toMatchObject({
			templateId: "prime/template/engineering-manager",
			skillNames: ["team-system-design"],
			skillSnapshots: [{ name: "team-system-design" }],
			skillEnforcementContract: {
				schema: "prime.skill-enforcement-contract/v1",
				templateId: "prime/template/engineering-manager",
				methods: [{ name: "team-system-design" }],
				maxRepairTurns: 2,
			},
			activeToolNames: ["ipython"],
			allowedToolNames: ["ipython", "passive_tool"],
		});
		expect((metadata.data as { templateSha256?: string }).templateSha256).toHaveLength(64);
		expect(
			(metadata.data as { skillEnforcementContract?: { contractSha256?: string } }).skillEnforcementContract
				?.contractSha256,
		).toHaveLength(64);

		let enforced = (await parent.listRlmSubagents()).subagents.find(
			(entry) => entry.rlm_child_id === handle.rlm_child_id,
		);
		for (let attempt = 0; attempt < 100 && enforced?.status === "running"; attempt += 1) {
			await sleep(5);
			enforced = (await parent.listRlmSubagents()).subagents.find(
				(entry) => entry.rlm_child_id === handle.rlm_child_id,
			);
		}
		expect(enforced?.status).toBe("enforcement_failed");
		expect(enforced?.skill_enforcement_result).toMatchObject({
			status: "failed",
			templateId: "prime/template/engineering-manager",
			methodCount: 1,
			missingMethods: ["team-system-design"],
		});
		// The candidate says "done" on every turn, but prose cannot bypass the host ledger.
		expect(child.messages.filter((message) => message.role === "assistant")).toHaveLength(3);
		expect(
			child.messages.filter((message) =>
				JSON.stringify(message).includes(
					"Use the skill_usage Python API to repair only the following requirements",
				),
			),
		).toHaveLength(2);

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

	it("completes only after host-recorded activation and disposition and exposes a passed attestation", async () => {
		answerDelayMs = 100;
		const parent = createRoot();
		const handle = await parent.runRlmChild("apply the selected method", {
			template: "prime/template/engineering-manager",
		});
		let child = parent.getRlmChildSession(handle.rlm_child_id);
		for (let attempt = 0; !child && attempt < 100; attempt += 1) {
			await sleep(5);
			child = parent.getRlmChildSession(handle.rlm_child_id);
		}
		expect(child).toBeDefined();
		writeFileSync(join(tempDir, "team-system-design", "SKILL.md"), "# changed after admission and must not escape\n");
		const activation = child!.handleSkillUsageHostRequest("skill_usage.activate", {
			name: "team-system-design",
			intent: "apply the admitted design method",
		});
		expect(activation).toMatchObject({
			name: "team-system-design",
			content: expect.stringContaining("Deterministic test method body"),
		});
		child!.handleSkillUsageHostRequest("skill_usage.disposition", {
			name: "team-system-design",
			status: "applied",
			evidence: ["test:rlm-agent-template"],
			summary: "The admitted method shaped the test plan.",
		});
		expect(() =>
			child!.handleSkillUsageHostRequest("skill_usage.disposition", {
				name: "team-system-design",
				status: "not_applicable",
				evidence: [],
				summary: "conflicting final claim",
			}),
		).toThrow(/already has a final disposition/);

		let listed = (await parent.listRlmSubagents()).subagents.find(
			(entry) => entry.rlm_child_id === handle.rlm_child_id,
		);
		for (let attempt = 0; attempt < 100 && listed?.status === "running"; attempt += 1) {
			await sleep(5);
			listed = (await parent.listRlmSubagents()).subagents.find(
				(entry) => entry.rlm_child_id === handle.rlm_child_id,
			);
		}
		expect(listed?.status).toBe("completed");
		expect(listed?.skill_enforcement_result).toMatchObject({
			status: "passed",
			activatedMethods: ["team-system-design"],
			appliedMethods: ["team-system-design"],
			notApplicableMethods: [],
			methodCount: 1,
			missingMethods: [],
			invalidRecordCount: 0,
			evidenceCount: 1,
		});
		expect(listed?.skill_enforcement_result?.sessionId).toBe(child!.sessionId);
		expect(listed?.skill_enforcement_result?.attestationSha256).toHaveLength(64);
		expect(() =>
			child!.handleSkillUsageHostRequest("skill_usage.disposition", {
				name: "team-system-design",
				status: "not_applicable",
				evidence: [],
				summary: "attempted overwrite after attestation",
			}),
		).toThrow(/ledger is sealed/);
	});

	it("runs three enforced persona roles and one omitted-method control concurrently in a clean host matrix", async () => {
		answerDelayMs = 250;
		const parent = createRoot();
		const cases = [
			{
				name: "implementation-positive",
				template: "prime/persona-team/implementation-engineer",
				methods: [
					"persona-team-clean-code",
					"persona-team-refactoring-patterns",
					"persona-team-software-design-philosophy",
					"persona-team-pragmatic-programmer",
				],
				shouldPass: true,
			},
			{
				name: "review-positive",
				template: "prime/persona-team/staff-reviewer",
				methods: [
					"persona-team-clean-code",
					"persona-team-clean-architecture",
					"persona-team-refactoring-patterns",
					"persona-team-software-design-philosophy",
				],
				shouldPass: true,
			},
			{
				name: "security-positive",
				template: "prime/persona-team/security-officer",
				methods: [
					"persona-team-clean-architecture",
					"persona-team-ddia-systems",
					"persona-team-domain-driven-design",
				],
				shouldPass: true,
			},
			{
				name: "omitted-method-negative-control",
				template: "prime/persona-team/implementation-engineer",
				methods: [
					"persona-team-clean-code",
					"persona-team-refactoring-patterns",
					"persona-team-software-design-philosophy",
					"persona-team-pragmatic-programmer",
				],
				shouldPass: false,
			},
		] as const;
		const handles = await Promise.all(
			cases.map((testCase) => parent.runRlmChild(`clean-matrix:${testCase.name}`, { template: testCase.template })),
		);
		const children = [] as AgentSession[];
		for (const handle of handles) {
			let child = parent.getRlmChildSession(handle.rlm_child_id);
			for (let attempt = 0; !child && attempt < 100; attempt += 1) {
				await sleep(5);
				child = parent.getRlmChildSession(handle.rlm_child_id);
			}
			if (!child) throw new Error(`child ${handle.rlm_child_id} was not published`);
			children.push(child);
		}
		for (const [index, testCase] of cases.entries()) {
			if (!testCase.shouldPass) continue;
			for (const method of testCase.methods) {
				const activation = children[index]!.handleSkillUsageHostRequest("skill_usage.activate", {
					name: method,
					intent: `clean matrix activation for ${testCase.name}`,
				});
				expect(activation).toMatchObject({
					name: method,
					content: expect.stringContaining("Deterministic test method body"),
				});
				children[index]!.handleSkillUsageHostRequest("skill_usage.disposition", {
					name: method,
					status: "applied",
					evidence: [`clean-matrix:${testCase.name}:${method}`],
					summary: `Applied ${method} in the deterministic clean-host matrix.`,
				});
			}
		}

		let listed = (await parent.listRlmSubagents()).subagents;
		for (let attempt = 0; attempt < 200 && listed.some((entry) => entry.status === "running"); attempt += 1) {
			await sleep(10);
			listed = (await parent.listRlmSubagents()).subagents;
		}
		for (const [index, testCase] of cases.entries()) {
			const entry = listed.find((candidate) => candidate.rlm_child_id === handles[index]!.rlm_child_id);
			expect(entry).toBeDefined();
			if (testCase.shouldPass) {
				expect(entry?.status).toBe("completed");
				expect(entry?.skill_enforcement_result).toMatchObject({
					status: "passed",
					templateId: testCase.template,
					methodCount: testCase.methods.length,
					activatedMethods: [...testCase.methods],
					appliedMethods: [...testCase.methods],
					missingMethods: [],
					invalidRecordCount: 0,
					evidenceCount: testCase.methods.length,
				});
				expect(entry?.skill_enforcement_result?.sessionId).toBe(children[index]!.sessionId);
				expect(entry?.skill_enforcement_result?.attestationSha256).toHaveLength(64);
			} else {
				expect(entry?.status).toBe("enforcement_failed");
				expect(entry?.skill_enforcement_result).toMatchObject({
					status: "failed",
					templateId: testCase.template,
					methodCount: testCase.methods.length,
					missingMethods: [...testCase.methods],
				});
				expect(entry?.skill_enforcement_result?.status).not.toBe("passed");
			}
		}
	});

	it("never emits a false pass when an enforced child is cancelled before validation", async () => {
		answerDelayMs = 250;
		const parent = createRoot();
		const handle = await parent.runRlmChild("cancel before enforcement", {
			template: "prime/template/engineering-manager",
		});
		let child = parent.getRlmChildSession(handle.rlm_child_id);
		for (let attempt = 0; !child && attempt < 100; attempt += 1) {
			await sleep(5);
			child = parent.getRlmChildSession(handle.rlm_child_id);
		}
		if (!child) throw new Error("child was not published");
		expect(parent.cancelRlmChildRun(handle.rlm_child_id, "test cancellation")).toBe(true);
		await sleep(300);
		expect(child.getSkillEnforcementResult()).toBeUndefined();
		expect(
			child.sessionManager
				.getEntries()
				.filter((entry) => entry.type === "custom" && entry.customType === "prime.skill-enforcement-result/v1"),
		).toHaveLength(0);
		const listed = (await parent.listRlmSubagents()).subagents.find(
			(entry) => entry.rlm_child_id === handle.rlm_child_id,
		);
		expect(listed?.skill_enforcement_result?.status).not.toBe("passed");
	});

	it("never emits a false pass when cancellation interrupts a corrective repair turn", async () => {
		answerDelayMs = 100;
		const parent = createRoot();
		const handle = await parent.runRlmChild("cancel during repair", {
			template: "prime/template/engineering-manager",
		});
		let child = parent.getRlmChildSession(handle.rlm_child_id);
		for (let attempt = 0; !child && attempt < 100; attempt += 1) {
			await sleep(5);
			child = parent.getRlmChildSession(handle.rlm_child_id);
		}
		if (!child) throw new Error("child was not published");
		for (let attempt = 0; attempt < 100; attempt += 1) {
			if (child.messages.filter((message) => message.role === "assistant").length === 1) break;
			await sleep(5);
		}
		expect(child.messages.filter((message) => message.role === "assistant")).toHaveLength(1);
		expect(parent.cancelRlmChildRun(handle.rlm_child_id, "cancel repair")).toBe(true);
		await sleep(150);
		expect(child.getSkillEnforcementResult()).toBeUndefined();
		expect(
			child.sessionManager
				.getEntries()
				.filter((entry) => entry.type === "custom" && entry.customType === "prime.skill-enforcement-result/v1"),
		).toHaveLength(0);
	});

	it("does not attest when deletion races enforced candidate completion", async () => {
		answerDelayMs = 250;
		const parent = createRoot();
		const handle = await parent.runRlmChild("delete during validation", {
			template: "prime/template/engineering-manager",
		});
		let child = parent.getRlmChildSession(handle.rlm_child_id);
		for (let attempt = 0; !child && attempt < 100; attempt += 1) {
			await sleep(5);
			child = parent.getRlmChildSession(handle.rlm_child_id);
		}
		if (!child) throw new Error("child was not published");
		await expect(parent.deleteRlmSubagent(handle.rlm_child_id)).resolves.toBeDefined();
		await sleep(300);
		expect(child.getSkillEnforcementResult()).toBeUndefined();
		expect(
			child.sessionManager
				.getEntries()
				.filter((entry) => entry.type === "custom" && entry.customType === "prime.skill-enforcement-result/v1"),
		).toHaveLength(0);
	});

	it("does not attest when parent shutdown races enforced candidate completion", async () => {
		answerDelayMs = 250;
		const parent = createRoot();
		const handle = await parent.runRlmChild("shutdown during validation", {
			template: "prime/template/engineering-manager",
		});
		let child = parent.getRlmChildSession(handle.rlm_child_id);
		for (let attempt = 0; !child && attempt < 100; attempt += 1) {
			await sleep(5);
			child = parent.getRlmChildSession(handle.rlm_child_id);
		}
		if (!child) throw new Error("child was not published");
		await parent.disposeAsync();
		await sleep(300);
		expect(child.getSkillEnforcementResult()).toBeUndefined();
		expect(
			child.sessionManager
				.getEntries()
				.filter((entry) => entry.type === "custom" && entry.customType === "prime.skill-enforcement-result/v1"),
		).toHaveLength(0);
	});

	it("keeps nested persona enforcement ledgers isolated and requires both attestations", async () => {
		answerDelayMs = 150;
		const parent = createRoot(undefined, true, 2);
		const outerHandle = await parent.runRlmChild("outer enforced role", {
			template: "prime/template/engineering-manager",
		});
		let outer = parent.getRlmChildSession(outerHandle.rlm_child_id);
		for (let attempt = 0; !outer && attempt < 100; attempt += 1) {
			await sleep(5);
			outer = parent.getRlmChildSession(outerHandle.rlm_child_id);
		}
		if (!outer) throw new Error("outer child was not published");
		const nestedHandle = await outer.runRlmChild("nested enforced role", {
			template: "prime/template/engineering-manager",
		});
		let nested = outer.getRlmChildSession(nestedHandle.rlm_child_id);
		for (let attempt = 0; !nested && attempt < 100; attempt += 1) {
			await sleep(5);
			nested = outer.getRlmChildSession(nestedHandle.rlm_child_id);
		}
		if (!nested) throw new Error("nested child was not published");

		for (const child of [outer, nested]) {
			child.handleSkillUsageHostRequest("skill_usage.activate", {
				name: "team-system-design",
				intent: "apply this session's admitted method snapshot",
			});
			child.handleSkillUsageHostRequest("skill_usage.disposition", {
				name: "team-system-design",
				status: "not_applicable",
				evidence: [],
				summary: "Inspected independently; not applicable to this runtime isolation probe.",
			});
		}

		let outerListed = (await parent.listRlmSubagents()).subagents.find(
			(entry) => entry.rlm_child_id === outerHandle.rlm_child_id,
		);
		let nestedListed = (await outer.listRlmSubagents()).subagents.find(
			(entry) => entry.rlm_child_id === nestedHandle.rlm_child_id,
		);
		for (
			let attempt = 0;
			attempt < 100 && (outerListed?.status === "running" || nestedListed?.status === "running");
			attempt += 1
		) {
			await sleep(5);
			outerListed = (await parent.listRlmSubagents()).subagents.find(
				(entry) => entry.rlm_child_id === outerHandle.rlm_child_id,
			);
			nestedListed = (await outer.listRlmSubagents()).subagents.find(
				(entry) => entry.rlm_child_id === nestedHandle.rlm_child_id,
			);
		}
		expect(outerListed?.status).toBe("completed");
		expect(nestedListed?.status).toBe("completed");
		expect(outerListed?.skill_enforcement_result?.status).toBe("passed");
		expect(nestedListed?.skill_enforcement_result?.status).toBe("passed");
		expect(outerListed?.skill_enforcement_result?.sessionId).toBe(outer.sessionId);
		expect(nestedListed?.skill_enforcement_result?.sessionId).toBe(nested.sessionId);
		expect(outer.sessionId).not.toBe(nested.sessionId);
	});

	it("fails admission when the host activation skill is unavailable", async () => {
		const parent = createRoot(undefined, false);
		await expect(
			parent.runRlmChild("cannot enforce", { template: "prime/template/engineering-manager" }),
		).rejects.toThrow(/unavailable skill-usage/);
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
