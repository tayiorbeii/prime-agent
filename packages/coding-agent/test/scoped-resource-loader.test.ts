import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
	agentTemplateDigest,
	resolveResourceScope,
	restoreResourceScope,
	ScopedResourceLoader,
} from "../src/core/scoped-resource-loader.js";
import type { Skill } from "../src/core/skills.js";
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
});
