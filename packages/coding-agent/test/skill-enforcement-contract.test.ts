import { createHash } from "node:crypto";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { validateAgentTemplateDefinition } from "../src/core/extensions/agent-templates.js";
import {
	agentTemplateDigest,
	resolveResourceScope,
	restoreResourceScope,
} from "../src/core/scoped-resource-loader.js";
import type { Skill } from "../src/core/skills.js";
import { createSyntheticSourceInfo } from "../src/core/source-info.js";
import { createTestExtensionsResult, createTestResourceLoader } from "./utilities.js";

function skill(name: string): Skill {
	const baseDir = mkdtempSync(join(tmpdir(), `prime-skill-enforcement-${name}-`));
	const filePath = join(baseDir, "SKILL.md");
	writeFileSync(filePath, `# ${name}\n\nImmutable method body for ${name}.\n`);
	return {
		name,
		description: `${name} description`,
		filePath,
		baseDir,
		sourceInfo: createSyntheticSourceInfo(filePath, { source: "test" }),
		disableModelInvocation: true,
		kind: "markdown",
	};
}

const enforcement = {
	schema: "prime.skill-enforcement/v1" as const,
	mode: "required" as const,
	requireActivation: true as const,
	requireDisposition: true as const,
	allowedDispositions: ["applied", "not_applicable"] as Array<"applied" | "not_applicable">,
	maxRepairTurns: 2,
};

function definition() {
	return {
		schema: "prime.agent-template/v1" as const,
		id: "prime/template/enforced",
		label: "Enforced",
		description: "Exercises deterministic enforcement contracts.",
		promptAppend: "ENFORCEMENT_SENTINEL",
		skills: { include: ["method-one", "method-two"], exposeSelected: true },
		skillEnforcement: enforcement,
	};
}

describe("skill enforcement contracts", () => {
	it("validates and deeply freezes the typed template policy", () => {
		const validated = validateAgentTemplateDefinition(definition());
		expect(validated.skillEnforcement).toEqual(enforcement);
		expect(Object.isFrozen(validated.skillEnforcement)).toBe(true);
		expect(Object.isFrozen(validated.skillEnforcement?.allowedDispositions)).toBe(true);
		expect(() =>
			validateAgentTemplateDefinition({
				...definition(),
				skillEnforcement: { ...enforcement, allowedDispositions: ["not_applicable", "applied"] },
			}),
		).toThrow('allowedDispositions must be ["applied", "not_applicable"]');
	});

	it("resolves a deterministic immutable contract from ordered skill snapshots", () => {
		const base = createTestResourceLoader({ skills: [skill("method-one"), skill("method-two")] });
		const first = resolveResourceScope(base, {
			templateId: "prime/template/enforced",
			skills: { include: ["method-one", "method-two"] },
			skillEnforcement: enforcement,
		});
		const second = resolveResourceScope(base, {
			templateId: "prime/template/enforced",
			skills: { include: ["method-one", "method-two"] },
			skillEnforcement: enforcement,
		});
		expect(first.skillEnforcementContract).toEqual(second.skillEnforcementContract);
		expect(
			first.skillEnforcementContract?.methods.map(({ name, filePath, sha256 }) => ({ name, filePath, sha256 })),
		).toEqual(first.skillSnapshots);
		expect(first.skillEnforcementContract?.methods[0]?.body).toContain("Immutable method body for method-one");
		expect(first.skillEnforcementContract?.methods[0]?.bodySha256).toHaveLength(64);
		expect(first.skillEnforcementContract?.contractSha256).toHaveLength(64);
		expect(Object.isFrozen(first.skillEnforcementContract)).toBe(true);
		expect(Object.isFrozen(first.skillEnforcementContract?.methods)).toBe(true);
		expect(Object.isFrozen(first.skillEnforcementContract?.methods[0])).toBe(true);
	});

	it("persists, restores, and hash-verifies the exact resolved contract", async () => {
		const template = validateAgentTemplateDefinition(definition());
		const extensions = await createTestExtensionsResult([
			(pi) => pi.registerAgentTemplate(definition()),
		]);
		const base = createTestResourceLoader({
			extensionsResult: extensions,
			skills: [skill("method-one"), skill("method-two")],
		});
		const scope = resolveResourceScope(base, {
			templateId: template.id,
			promptAppend: template.promptAppend,
			skills: template.skills,
			skillEnforcement: template.skillEnforcement,
		});
		const identity = {
			templateId: template.id,
			templateSha256: agentTemplateDigest(template),
			promptSha256: createHash("sha256").update(template.promptAppend).digest("hex"),
			skillNames: [...(template.skills?.include ?? [])],
			skillSnapshots: scope.skillSnapshots.map((snapshot) => ({ ...snapshot })),
			skillEnforcementContract: scope.skillEnforcementContract,
		};
		expect(restoreResourceScope(base, identity).skillEnforcementContract).toEqual(
			scope.skillEnforcementContract,
		);
		const admittedBody = scope.skillEnforcementContract?.methods[0]?.body;
		writeFileSync(identity.skillSnapshots[0]!.filePath, "# changed after admission\n");
		const restoredAfterMutation = restoreResourceScope(base, identity).skillEnforcementContract;
		expect(restoredAfterMutation?.methods[0]?.body).toBe(admittedBody);
		expect(restoredAfterMutation).toEqual(scope.skillEnforcementContract);
		const tampered = structuredClone(identity) as typeof identity & {
			skillEnforcementContract: { contractSha256: string };
		};
		if (!tampered.skillEnforcementContract) throw new Error("missing contract");
		(tampered.skillEnforcementContract as { contractSha256: string }).contractSha256 = "0".repeat(64);
		expect(() => restoreResourceScope(base, tampered)).toThrow("contract hash is invalid");
	});
});
