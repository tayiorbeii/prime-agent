import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { AuthStorage } from "../src/core/auth-storage.js";
import { createEventBus } from "../src/core/event-bus.js";
import { createExtensionRuntime, loadExtensionFromFactory } from "../src/core/extensions/loader.js";
import { ExtensionRunner } from "../src/core/extensions/runner.js";
import type { ExtensionAPI } from "../src/core/extensions/types.js";
import { ModelRegistry } from "../src/core/model-registry.js";
import { SessionManager } from "../src/core/session-manager.js";
import { createTestExtensionsResult } from "./utilities.js";

const sentinel = "PERSONA_SENTINEL_engineering_manager";

describe("agent template registry", () => {
	const roots: string[] = [];
	afterEach(() => {
		for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
	});

	function createRunner(extensionsResult: Awaited<ReturnType<typeof createTestExtensionsResult>>) {
		const cwd = mkdtempSync(join(tmpdir(), "agent-template-registry-"));
		roots.push(cwd);
		return new ExtensionRunner(
			extensionsResult.extensions,
			extensionsResult.runtime,
			cwd,
			SessionManager.inMemory(cwd),
			ModelRegistry.create(AuthStorage.create(join(cwd, "auth.json"))),
		);
	}

	it("registers and returns an immutable validated template without prompt catalog injection", async () => {
		const extensions = await createTestExtensionsResult([
			(pi) => {
				pi.registerAgentTemplate({
					schema: "prime.agent-template/v1",
					id: "prime/template/engineering-manager",
					label: "Engineering Manager",
					description: "Produces bounded technical plans.",
					promptAppend: sentinel,
					thinkingLevel: "high",
					activeToolNames: ["ipython", "agent_message"],
					allowedToolNames: ["ipython", "agent_message"],
					skills: { include: ["team-system-design"], exposeSelected: true },
					metadata: { role: "engineering-manager" },
				});
			},
		]);
		const runner = createRunner(extensions);
		const template = runner.getAgentTemplate("prime/template/engineering-manager");

		expect(template).toMatchObject({ id: "prime/template/engineering-manager", promptAppend: sentinel });
		expect(runner.getAgentTemplates()).toHaveLength(1);
		expect(() => template?.skills?.include.push("other")).toThrow();
	});

	it("rejects duplicate IDs without load-order resolution", async () => {
		const register = (pi: ExtensionAPI) =>
			pi.registerAgentTemplate({
				schema: "prime.agent-template/v1",
				id: "prime/template/reviewer",
				label: "Reviewer",
				description: "Reviews candidate changes.",
				promptAppend: "review only",
			});

		await expect(
			createTestExtensionsResult([
				{ factory: register, path: "/extensions/first.ts" },
				{ factory: register, path: "/extensions/second.ts" },
			]),
		).rejects.toThrow(
			'Duplicate agent template "prime/template/reviewer" registered by /extensions/second.ts; already registered by /extensions/first.ts',
		);
	});

	it("rolls back registrations when an extension fails to load", async () => {
		const runtime = createExtensionRuntime();
		const eventBus = createEventBus();
		const register = (pi: ExtensionAPI) =>
			pi.registerAgentTemplate({
				schema: "prime.agent-template/v1",
				id: "prime/template/reviewer",
				label: "Reviewer",
				description: "Reviews candidate changes.",
				promptAppend: "review only",
			});
		await expect(
			loadExtensionFromFactory(
				(pi) => {
					register(pi);
					throw new Error("factory failed");
				},
				process.cwd(),
				eventBus,
				runtime,
				"/extensions/failing.ts",
			),
		).rejects.toThrow("factory failed");
		expect(runtime.agentTemplates.size).toBe(0);
		await expect(
			loadExtensionFromFactory(register, process.cwd(), eventBus, runtime, "/extensions/retry.ts"),
		).resolves.toBeDefined();
	});

	it.each([
		[
			{
				schema: "prime.agent-template/v2",
				id: "prime/template/test",
				label: "Test",
				description: "x",
				promptAppend: "x",
			},
			"schema",
		],
		[{ schema: "prime.agent-template/v1", id: "all", label: "Test", description: "x", promptAppend: "x" }, "id"],
		[
			{
				schema: "prime.agent-template/v1",
				id: "prime/template/test",
				label: "Test",
				description: "x",
				promptAppend: "",
			},
			"promptAppend",
		],
		[
			{
				schema: "prime.agent-template/v1",
				id: "prime/template/test",
				label: "Test",
				description: "x",
				promptAppend: "x",
				activeToolNames: ["*"],
			},
			"activeToolNames",
		],
		[
			{
				schema: "prime.agent-template/v1",
				id: "prime/template/test",
				label: "Test",
				description: "x",
				promptAppend: "x",
				activeToolNames: ["ipython"],
				allowedToolNames: ["read"],
			},
			"outside allowedToolNames",
		],
	])("rejects invalid template %j", async (definition, field) => {
		await expect(createTestExtensionsResult([(pi) => pi.registerAgentTemplate(definition as never)])).rejects.toThrow(
			field,
		);
	});
});
