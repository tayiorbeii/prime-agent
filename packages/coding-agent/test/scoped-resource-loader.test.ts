import { createHash } from "node:crypto";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, truncateSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
	agentTemplateDigest,
	resolveResourceScope,
	restoreResourceScope,
	ScopedResourceLoader,
} from "../src/core/scoped-resource-loader.js";
import type { PythonSkill, Skill } from "../src/core/skills.js";
import { createSyntheticSourceInfo } from "../src/core/source-info.js";
import { createTestExtensionsResult, createTestResourceLoader } from "./utilities.js";

function skill(name: string, hidden: boolean): Skill {
	return {
		name,
		description: `${name} description`,
		filePath: `/skills/${name}/SKILL.md`,
		baseDir: `/skills/${name}`,
		sourceInfo: createSyntheticSourceInfo(`/skills/${name}/SKILL.md`, { source: "test" }),
		disableModelInvocation: hidden,
		kind: "markdown",
	};
}

function pythonSkill(root: string, name: string): PythonSkill {
	const baseDir = join(root, name);
	const filePath = join(baseDir, "SKILL.md");
	return {
		name,
		description: `${name} description`,
		filePath,
		baseDir,
		sourceInfo: createSyntheticSourceInfo(filePath, { source: "test" }),
		disableModelInvocation: true,
		kind: "python",
		python: {
			importName: name.replaceAll("-", "_"),
			packagePath: baseDir,
			pyprojectPath: join(baseDir, "pyproject.toml"),
		},
	};
}

function writePythonPackage(root: string, name: string, entries: Array<[string, string]>): PythonSkill {
	const selected = pythonSkill(root, name);
	for (const [relativePath, content] of entries) {
		const path = join(selected.baseDir, relativePath);
		mkdirSync(join(path, ".."), { recursive: true });
		writeFileSync(path, content);
	}
	return selected;
}

describe("ScopedResourceLoader", () => {
	it("promotes selected hidden skills in an immutable child view", () => {
		const visible = skill("persona-team", false);
		const selected = skill("team-system-design", true);
		const excluded = skill("team-clean-code", true);
		const base = createTestResourceLoader({ skills: [visible, selected, excluded] });
		const scope = resolveResourceScope(base, {
			skills: { include: ["team-system-design"], exposeSelected: true },
			promptAppend: "PERSONA_SENTINEL",
			templateId: "prime/template/engineering-manager",
		});
		const child = new ScopedResourceLoader(base, scope);

		expect(child.getSkills().skills.map((entry) => entry.name)).toEqual(["persona-team", "team-system-design"]);
		expect(child.getSkills().skills[1]).not.toBe(selected);
		expect(child.getSkills().skills[1]?.disableModelInvocation).toBe(false);
		expect(selected.disableModelInvocation).toBe(true);
		expect(base.getSkills().skills).toEqual([visible, selected, excluded]);
		expect(child.getAppendSystemPrompt().at(-1)).toContain("PERSONA_SENTINEL");
		expect(child.getPrompts()).toEqual(base.getPrompts());
	});

	it("fails exact unknown and wildcard selections before creating a view", () => {
		const base = createTestResourceLoader({ skills: [skill("team-system-design", true)] });
		expect(() => resolveResourceScope(base, { skills: { include: ["team-missing"], exposeSelected: true } })).toThrow(
			'Unknown scoped skill "team-missing"',
		);
		expect(() => resolveResourceScope(base, { skills: { include: ["team-*"] } })).toThrow("wildcards");
		const colliding = {
			...base,
			getSkills: () => ({
				skills: base.getSkills().skills,
				diagnostics: [
					{
						type: "collision" as const,
						message: "skill collision",
						collision: {
							resourceType: "skill" as const,
							name: "team-system-design",
							winnerPath: "/winner/SKILL.md",
							loserPath: "/loser/SKILL.md",
						},
					},
				],
			}),
		};
		expect(() => resolveResourceScope(colliding, { skills: { include: ["team-system-design"] } })).toThrow(
			"ambiguous",
		);
	});

	it("restores an identical persisted scope and rejects source drift", async () => {
		const selected = skill("team-system-design", true);
		const extensions = await createTestExtensionsResult([
			(pi) =>
				pi.registerAgentTemplate({
					schema: "prime.agent-template/v1",
					id: "prime/template/planner",
					label: "Planner",
					description: "Plans bounded changes.",
					promptAppend: "plan only",
					skills: { include: [selected.name], exposeSelected: true },
				}),
		]);
		const base = createTestResourceLoader({ extensionsResult: extensions, skills: [selected] });
		const template = extensions.runtime.agentTemplates.get("prime/template/planner")?.definition;
		if (!template) throw new Error("template missing");
		const scope = resolveResourceScope(base, {
			templateId: template.id,
			promptAppend: template.promptAppend,
			skills: template.skills,
		});
		const identity = {
			templateId: template.id,
			templateSha256: agentTemplateDigest(template),
			promptSha256: createHash("sha256").update(template.promptAppend).digest("hex"),
			skillNames: [...(template.skills?.include ?? [])],
			skillSnapshots: scope.skillSnapshots.map((snapshot) => ({ ...snapshot })),
		};
		expect(restoreResourceScope(base, identity).skillSnapshots).toEqual(scope.skillSnapshots);
		selected.filePath = "/skills/team-system-design-v2/SKILL.md";
		expect(() => restoreResourceScope(base, identity)).toThrow("skill sources changed");
	});

	it("keeps its admission snapshot across reload without mutating the base", async () => {
		const selected = skill("team-system-design", true);
		const base = createTestResourceLoader({ skills: [selected] });
		const scope = resolveResourceScope(base, { skills: { include: [selected.name], exposeSelected: true } });
		const child = new ScopedResourceLoader(base, scope);
		selected.description = "parent changed after admission";
		await child.reload();
		expect(child.getSkills().skills.map((entry) => entry.filePath)).toEqual([selected.filePath]);
		expect(child.getSkills().skills[0]?.description).toBe("team-system-design description");
		expect(selected.disableModelInvocation).toBe(true);
	});

	it("snapshots complete Python packages while excluding non-executable caches", () => {
		const root = mkdtempSync(join(tmpdir(), "scoped-python-skill-"));
		try {
			const selected = writePythonPackage(root, "python-method", [
				["SKILL.md", "---\nname: python-method\ndescription: test\n---\n"],
				["pyproject.toml", "[project]\nname='python-method'\n"],
				["src/python_method/__init__.py", "VALUE = 1\n"],
				["assets/policy.txt", "policy-v1\n"],
			]);
			const base = createTestResourceLoader({ skills: [selected] });
			const first = resolveResourceScope(base, { skills: { include: [selected.name], exposeSelected: true } });
			const retained = new ScopedResourceLoader(base, first);

			writeFileSync(join(selected.baseDir, "src/python_method/__init__.py"), "VALUE = 2\n");
			expect(retained.getSkills().skills).toEqual([]);
			expect(retained.getSkills().diagnostics.at(-1)?.message).toContain("changed after scope resolution");

			writeFileSync(join(selected.baseDir, "src/python_method/__init__.py"), "VALUE = 1\n");
			const second = resolveResourceScope(base, { skills: { include: [selected.name], exposeSelected: true } });
			const assetRetained = new ScopedResourceLoader(base, second);
			writeFileSync(join(selected.baseDir, "assets/policy.txt"), "policy-v2\n");
			expect(assetRetained.getSkills().skills).toEqual([]);

			writeFileSync(join(selected.baseDir, "assets/policy.txt"), "policy-v1\n");
			const stable = resolveResourceScope(base, { skills: { include: [selected.name], exposeSelected: true } });
			mkdirSync(join(selected.baseDir, ".cache", "tool"), { recursive: true });
			writeFileSync(join(selected.baseDir, ".cache", "tool", "state"), "generated\n");
			expect(
				resolveResourceScope(base, { skills: { include: [selected.name], exposeSelected: true } }).skillSnapshots,
			).toEqual(stable.skillSnapshots);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	it("hashes skill package paths deterministically and rejects external symlinks", () => {
		const root = mkdtempSync(join(tmpdir(), "scoped-python-links-"));
		try {
			const selected = writePythonPackage(root, "linked-method", [
				["SKILL.md", "---\nname: linked-method\ndescription: test\n---\n"],
				["pyproject.toml", "[project]\nname='linked-method'\n"],
				["src/linked_method/__init__.py", "from pathlib import Path\n"],
				["assets/a.txt", "a\n"],
				["assets/z.txt", "z\n"],
			]);
			const external = join(root, "external.txt");
			writeFileSync(external, "outside-v1\n");
			symlinkSync(external, join(selected.baseDir, "external-link.txt"));
			const base = createTestResourceLoader({ skills: [selected] });
			expect(() => resolveResourceScope(base, { skills: { include: [selected.name] } })).toThrow(
				"outside its package root",
			);
			rmSync(join(selected.baseDir, "external-link.txt"));
			const first = resolveResourceScope(base, { skills: { include: [selected.name] } });

			rmSync(join(selected.baseDir, "assets"), { recursive: true, force: true });
			mkdirSync(join(selected.baseDir, "assets"), { recursive: true });
			writeFileSync(join(selected.baseDir, "assets", "z.txt"), "z\n");
			writeFileSync(join(selected.baseDir, "assets", "a.txt"), "a\n");
			expect(resolveResourceScope(base, { skills: { include: [selected.name] } }).skillSnapshots).toEqual(
				first.skillSnapshots,
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	it("includes Markdown skill assets in package identity", () => {
		const root = mkdtempSync(join(tmpdir(), "scoped-markdown-skill-"));
		try {
			const selected = skill("markdown-method", true);
			selected.baseDir = join(root, selected.name);
			selected.filePath = join(selected.baseDir, "SKILL.md");
			mkdirSync(selected.baseDir, { recursive: true });
			writeFileSync(selected.filePath, "markdown-v1\n");
			const base = createTestResourceLoader({ skills: [selected] });
			const first = resolveResourceScope(base, { skills: { include: [selected.name] } });
			writeFileSync(join(selected.baseDir, "notes.txt"), "method asset\n");
			expect(resolveResourceScope(base, { skills: { include: [selected.name] } }).skillSnapshots).not.toEqual(
				first.skillSnapshots,
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	it("hashes sourceless bytecode outside generated cache directories", () => {
		const root = mkdtempSync(join(tmpdir(), "scoped-bytecode-skill-"));
		try {
			const selected = writePythonPackage(root, "bytecode-method", [
				["SKILL.md", "---\nname: bytecode-method\ndescription: test\n---\n"],
				["pyproject.toml", "[project]\nname='bytecode-method'\n"],
				["src/bytecode_method/__init__.pyc", "bytecode-v1\n"],
			]);
			const base = createTestResourceLoader({ skills: [selected] });
			const retained = new ScopedResourceLoader(
				base,
				resolveResourceScope(base, { skills: { include: [selected.name], exposeSelected: true } }),
			);
			writeFileSync(join(selected.baseDir, "src", "bytecode_method", "__init__.pyc"), "bytecode-v2\n");
			expect(retained.getSkills().skills).toEqual([]);
			expect(retained.getSkills().diagnostics.at(-1)?.message).toContain("changed after scope resolution");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	it("hashes generated cache bytecode to prevent executable substitution", () => {
		const root = mkdtempSync(join(tmpdir(), "scoped-cache-bytecode-"));
		try {
			const selected = writePythonPackage(root, "cached-method", [
				["SKILL.md", "---\nname: cached-method\ndescription: test\n---\n"],
				["pyproject.toml", "[project]\nname='cached-method'\n"],
				["src/cached_method/__init__.py", "value = 1\n"],
				["src/cached_method/__pycache__/__init__.pyc", "cached-bytecode-v1\n"],
			]);
			const base = createTestResourceLoader({ skills: [selected] });
			const retained = new ScopedResourceLoader(
				base,
				resolveResourceScope(base, { skills: { include: [selected.name], exposeSelected: true } }),
			);
			writeFileSync(
				join(selected.baseDir, "src", "cached_method", "__pycache__", "__init__.pyc"),
				"cached-bytecode-v2\n",
			);
			expect(retained.getSkills().skills).toEqual([]);
			expect(retained.getSkills().diagnostics.at(-1)?.message).toContain("changed after scope resolution");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	it("rejects executable dependency directories instead of silently excluding them", () => {
		const root = mkdtempSync(join(tmpdir(), "scoped-dependency-dir-"));
		try {
			const selected = writePythonPackage(root, "dependency-method", [
				["SKILL.md", "---\nname: dependency-method\ndescription: test\n---\n"],
				["pyproject.toml", "[project]\nname='dependency-method'\n"],
				["src/dependency_method/__init__.py", "value = 1\n"],
			]);
			const base = createTestResourceLoader({ skills: [selected] });
			for (const directory of [".nox", ".tox", ".venv", "venv", "node_modules"]) {
				const dependencyRoot = join(selected.baseDir, directory);
				mkdirSync(dependencyRoot, { recursive: true });
				expect(() => resolveResourceScope(base, { skills: { include: [selected.name] } })).toThrow(
					"executable dependency directory",
				);
				rmSync(dependencyRoot, { recursive: true, force: true });
			}
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	it("rejects selected skills whose resolved package root is an executable dependency directory", () => {
		const root = mkdtempSync(join(tmpdir(), "scoped-dependency-root-"));
		try {
			for (const directory of [".nox", ".tox", ".venv", "venv", "node_modules"]) {
				const packageRoot = join(root, directory);
				mkdirSync(join(packageRoot, "src", "dependency_method"), { recursive: true });
				writeFileSync(join(packageRoot, "SKILL.md"), "---\nname: dependency-method\ndescription: test\n---\n");
				writeFileSync(join(packageRoot, "pyproject.toml"), "[project]\nname='dependency-method'\n");
				writeFileSync(join(packageRoot, "src", "dependency_method", "__init__.py"), "value = 1\n");
				const selected = pythonSkill(root, "dependency-method");
				selected.baseDir = packageRoot;
				selected.filePath = join(packageRoot, "SKILL.md");
				selected.python.packagePath = packageRoot;
				selected.python.pyprojectPath = join(packageRoot, "pyproject.toml");
				const base = createTestResourceLoader({ skills: [selected] });
				expect(() => resolveResourceScope(base, { skills: { include: [selected.name] } })).toThrow(
					"package root is an executable dependency directory",
				);
				rmSync(packageRoot, { recursive: true, force: true });
			}
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	it("rejects an oversized sparse package file before reading its body", () => {
		const root = mkdtempSync(join(tmpdir(), "scoped-oversized-skill-"));
		try {
			const selected = writePythonPackage(root, "oversized-method", [
				["SKILL.md", "---\nname: oversized-method\ndescription: test\n---\n"],
				["pyproject.toml", "[project]\nname='oversized-method'\n"],
				["src/oversized_method/__init__.py", "value = 1\n"],
			]);
			const oversized = join(selected.baseDir, "assets", "oversized.bin");
			mkdirSync(join(selected.baseDir, "assets"), { recursive: true });
			writeFileSync(oversized, "");
			truncateSync(oversized, 64 * 1024 * 1024 + 1);
			chmodSync(oversized, 0o000);
			const base = createTestResourceLoader({ skills: [selected] });
			expect(() => resolveResourceScope(base, { skills: { include: [selected.name] } })).toThrow(
				"exceeds snapshot limits",
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});
