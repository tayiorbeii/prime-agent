import { describe, expect, it } from "vitest";
import {
	cloneSkillEnforcementContractEntry,
	createSkillActivationEntry,
	createSkillDispositionEntry,
	createSkillEnforcementResult,
	foldSkillEnforcementLedger,
	SKILL_ACTIVATION_CUSTOM_TYPE,
	SKILL_DISPOSITION_CUSTOM_TYPE,
	SKILL_ENFORCEMENT_CONTRACT_CUSTOM_TYPE,
	skillEnforcementRepairPrompt,
	verifySkillEnforcementResult,
	verifySkillEnforcementResultAgainstLedger,
} from "../src/core/skill-enforcement.js";
import type { ResolvedSkillEnforcementContractV1 } from "../src/core/scoped-resource-loader.js";

const sessionId = "session-1";
const contract: ResolvedSkillEnforcementContractV1 = {
	schema: "prime.skill-enforcement-contract/v1",
	templateId: "prime/persona-team/reviewer",
	contractSha256: "contract-hash",
	methods: [
		{
			name: "method-a",
			filePath: "/skills/a/SKILL.md",
			sha256: "hash-a",
			bodySha256: "ca978112ca1bbdcafac231b39a23dc4da786eff8147c4e72b9807785afee48bb",
			body: "a",
		},
		{
			name: "method-b",
			filePath: "/skills/b/SKILL.md",
			sha256: "hash-b",
			bodySha256: "3e23e8160039594a33894f6564e1b1348bbd7a0088d42c4acb73eeaed59c009d",
			body: "b",
		},
	],
	maxRepairTurns: 2,
};

function custom(customType: string, data: unknown) {
	return { type: "custom", customType, data };
}

describe("skill enforcement ledger", () => {
	it("requires a persisted contract plus activation and disposition for every method", () => {
		const entries = [
			custom(SKILL_ENFORCEMENT_CONTRACT_CUSTOM_TYPE, cloneSkillEnforcementContractEntry(contract, sessionId, 1)),
			custom(
				SKILL_ACTIVATION_CUSTOM_TYPE,
				createSkillActivationEntry({
					contract,
					method: contract.methods[0],
					sessionId,
					intent: "inspect a",
					requestId: "activate-a",
					activatedAt: 2,
				}),
			),
			custom(
				SKILL_DISPOSITION_CUSTOM_TYPE,
				createSkillDispositionEntry({
					contract,
					method: contract.methods[0],
					sessionId,
					status: "applied",
					evidence: ["test:a"],
					summary: "applied a",
					requestId: "disposition-a",
					dispositionedAt: 3,
				}),
			),
			custom("child.forged-enforcement-artifact/v1", {
				status: "passed",
				activatedMethods: ["method-a", "method-b"],
			}),
		];
		const status = foldSkillEnforcementLedger(contract, sessionId, entries);
		expect(status.passed).toBe(false);
		expect(status.activatedMethods).toEqual(["method-a"]);
		expect(status.appliedMethods).toEqual(["method-a"]);
		expect(status.missingActivations).toEqual(["method-b"]);
		expect(status.missingDispositions).toEqual(["method-b"]);
		expect(skillEnforcementRepairPrompt(status)).toContain("Missing activations: method-b");
	});

	it("folds one valid final disposition per method and emits a session-bound attestation", () => {
		const entries: Array<{ type: string; customType: string; data: unknown }> = [
			custom(SKILL_ENFORCEMENT_CONTRACT_CUSTOM_TYPE, cloneSkillEnforcementContractEntry(contract, sessionId, 1)),
		];
		for (const [index, method] of contract.methods.entries()) {
			entries.push(
				custom(
					SKILL_ACTIVATION_CUSTOM_TYPE,
					createSkillActivationEntry({
						contract,
						method,
						sessionId,
						intent: `inspect ${method.name}`,
						requestId: `activate-${index}`,
						activatedAt: index + 2,
					}),
				),
				custom(
					SKILL_DISPOSITION_CUSTOM_TYPE,
					createSkillDispositionEntry({
						contract,
						method,
						sessionId,
						status: index === 0 ? "applied" : "not_applicable",
						evidence: index === 0 ? ["artifact:a"] : [],
						summary: index === 0 ? "applied" : "not relevant after inspection",
						requestId: `disposition-${index}`,
						dispositionedAt: index + 4,
					}),
				),
			);
		}
		const status = foldSkillEnforcementLedger(contract, sessionId, entries);
		expect(status).toMatchObject({
			passed: true,
			activatedMethods: ["method-a", "method-b"],
			appliedMethods: ["method-a"],
			notApplicableMethods: ["method-b"],
			evidenceCount: 1,
		});
		const result = createSkillEnforcementResult(status, "passed", sessionId, 10);
		expect(result.status).toBe("passed");
		expect(result.sessionId).toBe(sessionId);
		expect(result.attestationSha256).toMatch(/^[a-f0-9]{64}$/);
		expect(verifySkillEnforcementResult(result, contract, sessionId)).toEqual(result);
		expect(verifySkillEnforcementResult(result, contract, "other-session")).toBeUndefined();
		expect(verifySkillEnforcementResultAgainstLedger(result, contract, sessionId, entries)).toEqual(result);
		expect(
			verifySkillEnforcementResultAgainstLedger(result, contract, sessionId, entries.slice(0, -1)),
		).toBeUndefined();
	});

	it("rejects forged identity, unknown methods, hashes, and applied dispositions without evidence", () => {
		const method = contract.methods[0];
		const base = createSkillActivationEntry({
			contract,
			method,
			sessionId,
			intent: "inspect",
			requestId: "request",
			activatedAt: 2,
		});
		const badDisposition = createSkillDispositionEntry({
			contract,
			method,
			sessionId,
			status: "applied",
			evidence: [],
			summary: "claim",
			requestId: "disposition",
			dispositionedAt: 3,
		});
		const status = foldSkillEnforcementLedger(contract, sessionId, [
			custom(SKILL_ENFORCEMENT_CONTRACT_CUSTOM_TYPE, cloneSkillEnforcementContractEntry(contract, sessionId, 1)),
			custom(SKILL_ACTIVATION_CUSTOM_TYPE, { ...base, sessionId: "forged" }),
			custom(SKILL_ACTIVATION_CUSTOM_TYPE, { ...base, methodName: "unknown" }),
			custom(SKILL_ACTIVATION_CUSTOM_TYPE, { ...base, methodSha256: "forged" }),
			custom(SKILL_DISPOSITION_CUSTOM_TYPE, badDisposition),
		]);
		expect(status.passed).toBe(false);
		expect(status.invalidRecords.map((record) => record.reason)).toEqual([
			"entry identity does not match this session",
			"method is not present in the resolved contract",
			"method snapshot hash does not match the contract",
			"applied disposition requires non-empty evidence",
		]);
	});

	it("rejects duplicate final dispositions instead of accepting the latest child claim", () => {
		const method = contract.methods[0];
		const activation = createSkillActivationEntry({
			contract,
			method,
			sessionId,
			intent: "inspect",
			requestId: "activation",
			activatedAt: 2,
		});
		const disposition = createSkillDispositionEntry({
			contract,
			method,
			sessionId,
			status: "not_applicable",
			evidence: [],
			summary: "inspected and not relevant",
			requestId: "disposition-1",
			dispositionedAt: 3,
		});
		const status = foldSkillEnforcementLedger(contract, sessionId, [
			custom(SKILL_ENFORCEMENT_CONTRACT_CUSTOM_TYPE, cloneSkillEnforcementContractEntry(contract, sessionId, 1)),
			custom(SKILL_ACTIVATION_CUSTOM_TYPE, activation),
			custom(SKILL_DISPOSITION_CUSTOM_TYPE, disposition),
			custom(SKILL_DISPOSITION_CUSTOM_TYPE, { ...disposition, requestId: "disposition-2", dispositionedAt: 4 }),
		]);
		expect(status.passed).toBe(false);
		expect(status.invalidRecords).toContainEqual(
			expect.objectContaining({ kind: "disposition", methodName: method.name, reason: "duplicate final disposition" }),
		);
	});

	it("treats non-enforced sessions as passed without an attestation", () => {
		const status = foldSkillEnforcementLedger(undefined, sessionId, []);
		expect(status).toMatchObject({ required: false, passed: true, methodCount: 0 });
		expect(() => createSkillEnforcementResult(status, "passed", 1)).toThrow(/without a resolved/);
	});
});
