import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import personaTeams from "../extensions/persona-teams.js";

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const methodsRoot = join(packageRoot, "library/generated/methods");

function methodSkillFiles(): string[] {
	return readdirSync(methodsRoot, { withFileTypes: true })
		.filter((entry) => entry.isDirectory())
		.map((entry) => join(methodsRoot, entry.name, "SKILL.md"))
		.sort();
}

function frontmatterValue(text: string, key: string): string | undefined {
	const frontmatter = text.match(/^---\n([\s\S]*?)\n---/)?.[1];
	if (!frontmatter) return undefined;
	const value = frontmatter
		.split("\n")
		.find((line) => line.startsWith(`${key}:`))
		?.slice(key.length + 1)
		.trim();
	if (!value) return value;
	if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
		return value.slice(1, -1);
	}
	return value;
}

describe("Prime Persona Teams standalone package", () => {
	it("exposes one control skill and keeps all generated methods hidden", () => {
		const controlText = readFileSync(join(packageRoot, "skills/persona-team/SKILL.md"), "utf8");
		const methods = methodSkillFiles().map((filePath) => ({
			filePath,
			text: readFileSync(filePath, "utf8"),
		}));

		expect(frontmatterValue(controlText, "name")).toBe("persona-team");
		expect(frontmatterValue(controlText, "disable-model-invocation")).not.toBe("true");
		expect(methods).toHaveLength(42);
		for (const method of methods) {
			expect(frontmatterValue(method.text, "name")).toMatch(/^persona-team-/);
			expect(frontmatterValue(method.text, "disable-model-invocation"), method.filePath).toBe("true");
		}
		expect(methods.map((method) => frontmatterValue(method.text, "description")).join("\n")).not.toContain(
			"Engineering Manager",
		);
	});

	it("registers ten exact persona templates whose selected methods exist", () => {
		const templates: Array<Record<string, unknown>> = [];
		const api = {
			registerAgentTemplate(template: Record<string, unknown>) {
				templates.push(template);
			},
		} as unknown as Parameters<typeof personaTeams>[0];
		personaTeams(api);

		const methods = new Set(
			methodSkillFiles().map((filePath) => frontmatterValue(readFileSync(filePath, "utf8"), "name")),
		);
		expect(templates).toHaveLength(10);
		for (const template of templates) {
			expect(template.id).toMatch(/^prime\/persona-team\/[a-z0-9-]+$/);
			expect(String(template.promptAppend).length).toBeLessThanOrEqual(6_000);
			const skills = template.skills as { include: string[]; exposeSelected: boolean };
			expect(skills.include.length).toBeGreaterThan(0);
			expect(skills.include.every((name) => methods.has(name))).toBe(true);
			expect(String(template.promptAppend).toLowerCase()).not.toContain("paperclip");
			expect(String(template.promptAppend).toLowerCase()).not.toContain("gstack");
		}
	});

	it("declares Bun and references only package-local resources", () => {
		const manifest = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8")) as {
			packageManager: string;
			scripts: Record<string, string>;
			pi: { extensions: string[]; skills: string[] };
		};
		expect(manifest.packageManager).toMatch(/^bun@/);
		expect(manifest.scripts.test).toContain("bun run");
		for (const resource of [...manifest.pi.extensions, ...manifest.pi.skills]) {
			expect(existsSync(resolve(packageRoot, resource)), resource).toBe(true);
		}
	});

	it("ships standalone active methods without broken local references", () => {
		for (const filePath of methodSkillFiles()) {
			const text = readFileSync(filePath, "utf8");
			const name = frontmatterValue(text, "name") ?? filePath;
			expect(text).not.toMatch(/(?:\.\/)?references\/[A-Za-z0-9_./-]+\.md/);
			for (const [, target] of text.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
				const localPath = target?.split("#", 1)[0] ?? "";
				if (!localPath || /^(?:[a-z]+:|#)/i.test(target ?? "")) continue;
				expect(existsSync(resolve(dirname(filePath), localPath)), `${name}: ${target}`).toBe(true);
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
