import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { AuthStorage } from "../../coding-agent/src/core/auth-storage.js";
import { ExtensionRunner } from "../../coding-agent/src/core/extensions/runner.js";
import { ModelRegistry } from "../../coding-agent/src/core/model-registry.js";
import { DefaultResourceLoader } from "../../coding-agent/src/core/resource-loader.js";
import { SessionManager } from "../../coding-agent/src/core/session-manager.js";
import { SettingsManager } from "../../coding-agent/src/core/settings-manager.js";
import { loadSkillsFromDir } from "../../coding-agent/src/core/skills.js";
import { createTestExtensionsResult } from "../../coding-agent/test/utilities.js";
import personaTeams from "../extensions/persona-teams.js";

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

describe("Prime Persona Teams package visibility", () => {
	it("exposes one control skill and keeps all generated methods hidden", () => {
		const control = loadSkillsFromDir({ dir: join(packageRoot, "skills"), source: "test" });
		const methods = loadSkillsFromDir({ dir: join(packageRoot, "library/generated/methods"), source: "test" });
		expect([...control.diagnostics, ...methods.diagnostics]).toEqual([]);
		const skills = [...control.skills, ...methods.skills];
		expect(skills).toHaveLength(43);
		expect(skills.filter((skill) => !skill.disableModelInvocation).map((skill) => skill.name)).toEqual([
			"persona-team",
		]);
		expect(skills.filter((skill) => skill.name.startsWith("persona-team-") && !skill.disableModelInvocation)).toEqual(
			[],
		);
		expect(skills.map((skill) => skill.description).join("\n")).not.toContain("Engineering Manager");
	});

	it("registers ten exact persona templates whose selected methods exist", async () => {
		const loaded = await createTestExtensionsResult([personaTeams], packageRoot);
		const runner = new ExtensionRunner(
			loaded.extensions,
			loaded.runtime,
			packageRoot,
			SessionManager.inMemory(packageRoot),
			ModelRegistry.create(AuthStorage.inMemory()),
		);
		const methods = new Set(
			loadSkillsFromDir({ dir: join(packageRoot, "library/generated/methods"), source: "test" }).skills.map(
				(skill) => skill.name,
			),
		);
		const templates = runner.getAgentTemplates();
		expect(templates).toHaveLength(10);
		for (const template of templates) {
			expect(template.id).toMatch(/^prime\/persona-team\/[a-z0-9-]+$/);
			expect(template.promptAppend.length).toBeLessThanOrEqual(6_000);
			expect(template.skills?.include.length).toBeGreaterThan(0);
			expect(template.skills?.include.every((name) => methods.has(name))).toBe(true);
			expect(template.promptAppend.toLowerCase()).not.toContain("paperclip");
			expect(template.promptAppend.toLowerCase()).not.toContain("gstack");
		}
	});

	it("loads through the package manifest without exposing hidden methods", async () => {
		const tempRoot = mkdtempSync(join(tmpdir(), "prime-persona-package-"));
		const cwd = join(tempRoot, "project");
		const agentDir = join(tempRoot, "agent");
		mkdirSync(cwd, { recursive: true });
		mkdirSync(agentDir, { recursive: true });
		try {
			const settings = SettingsManager.create(cwd, agentDir);
			settings.setProjectPackages([packageRoot]);
			const loader = new DefaultResourceLoader({ cwd, agentDir, settingsManager: settings, bundledSkillsDir: null });
			await loader.reload();
			const skills = loader.getSkills();
			expect(skills.diagnostics).toEqual([]);
			const packageSkills = skills.skills.filter((skill) => skill.filePath.startsWith(packageRoot));
			expect(packageSkills.filter((skill) => !skill.disableModelInvocation).map((skill) => skill.name)).toEqual([
				"persona-team",
			]);
			expect(packageSkills.filter((skill) => skill.name.startsWith("persona-team-"))).toHaveLength(42);
			const extensionResult = loader.getExtensions();
			expect(extensionResult.errors).toEqual([]);
			const runner = new ExtensionRunner(
				extensionResult.extensions,
				extensionResult.runtime,
				cwd,
				SessionManager.inMemory(cwd),
				ModelRegistry.create(AuthStorage.create(join(agentDir, "auth.json"))),
			);
			expect(runner.getAgentTemplates()).toHaveLength(10);
		} finally {
			rmSync(tempRoot, { recursive: true, force: true });
		}
	});

	it("ships standalone active methods without broken local references", () => {
		const methods = loadSkillsFromDir({ dir: join(packageRoot, "library/generated/methods"), source: "test" });
		expect(methods.diagnostics).toEqual([]);
		for (const method of methods.skills) {
			const text = readFileSync(method.filePath, "utf8");
			expect(text).not.toMatch(/(?:\.\/)?references\/[A-Za-z0-9_./-]+\.md/);
			for (const [, target] of text.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
				const localPath = target?.split("#", 1)[0] ?? "";
				if (!localPath || /^(?:[a-z]+:|#)/i.test(target ?? "")) continue;
				expect(existsSync(resolve(dirname(method.filePath), localPath)), `${method.name}: ${target}`).toBe(true);
			}
		}
	});

	it("classifies the complete source corpus with executable provenance", () => {
		const classification = JSON.parse(
			readFileSync(join(packageRoot, "library/generated/classification.json"), "utf8"),
		) as {
			counts: Record<string, number>;
			records: Array<{ id: string; disposition: string; source: { sha256: string }; license: string }>;
		};
		expect(classification.counts).toEqual({
			activeMethods: 42,
			classified: 96,
			quarantinedWorkflows: 44,
			roles: 10,
			sourceSkills: 86,
		});
		expect(new Set(classification.records.map((record) => record.id)).size).toBe(96);
		expect(classification.records.every((record) => record.source.sha256.length === 64)).toBe(true);
		expect(classification.records.every((record) => record.license === "MIT")).toBe(true);
	});
});
