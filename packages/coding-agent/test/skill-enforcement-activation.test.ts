import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
	readResolvedSkillEnforcementMethodBody,
	readVerifiedScopedSkillBody,
	resolveResourceScope,
	ScopedResourceLoader,
} from "../src/core/scoped-resource-loader.js";
import type { Skill } from "../src/core/skills.js";
import { createSyntheticSourceInfo } from "../src/core/source-info.js";
import { createTestResourceLoader } from "./utilities.js";

describe("verified scoped method activation", () => {
	let root: string | undefined;

	afterEach(() => {
		if (root) rmSync(root, { recursive: true, force: true });
		root = undefined;
	});

	it("returns the admitted body and detects package mutation without returning changed bytes", () => {
		root = mkdtempSync(join(tmpdir(), "prime-skill-activation-"));
		const baseDir = join(root, "method-a");
		const filePath = join(baseDir, "SKILL.md");
		mkdirSync(baseDir, { recursive: true });
		writeFileSync(filePath, "# Original method\n");
		const skill: Skill = {
			name: "method-a",
			description: "test method",
			filePath,
			baseDir,
			sourceInfo: createSyntheticSourceInfo(filePath, { source: "test" }),
			disableModelInvocation: true,
			kind: "markdown",
		};
		const base = createTestResourceLoader({ skills: [skill] });
		const scope = resolveResourceScope(base, {
			templateId: "prime/persona-team/test",
			skills: { include: [skill.name], exposeSelected: true },
			skillEnforcement: {
				schema: "prime.skill-enforcement/v1",
				mode: "required",
				requireActivation: true,
				requireDisposition: true,
				allowedDispositions: ["applied", "not_applicable"],
				maxRepairTurns: 1,
			},
		});
		const loader = new ScopedResourceLoader(base, scope);
		expect(readVerifiedScopedSkillBody(loader, scope.skillSnapshots[0])).toContain("Original method");

		writeFileSync(filePath, "# Mutated method must not escape\n");
		expect(() => readVerifiedScopedSkillBody(loader, scope.skillSnapshots[0])).toThrow(/unavailable|changed/);
		const admittedMethod = scope.skillEnforcementContract?.methods[0];
		if (!admittedMethod) throw new Error("missing admitted method");
		expect(readResolvedSkillEnforcementMethodBody(admittedMethod)).toContain("Original method");
		expect(readResolvedSkillEnforcementMethodBody(admittedMethod)).not.toContain("Mutated method");
	});
});
