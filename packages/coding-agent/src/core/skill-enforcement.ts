import { createHash } from "node:crypto";
import type { ResolvedSkillEnforcementContractV1, ScopedSkillSnapshot } from "./scoped-resource-loader.js";

export const SKILL_ENFORCEMENT_CONTRACT_CUSTOM_TYPE = "prime.skill-enforcement-contract/v1";
export const SKILL_ACTIVATION_CUSTOM_TYPE = "prime.skill-activation/v1";
export const SKILL_DISPOSITION_CUSTOM_TYPE = "prime.skill-disposition/v1";
export const SKILL_ENFORCEMENT_RESULT_CUSTOM_TYPE = "prime.skill-enforcement-result/v1";

export type SkillDispositionStatus = "applied" | "not_applicable";

export interface SkillEnforcementContractEntryV1 {
	schema: "prime.skill-enforcement-contract/v1";
	sessionId: string;
	templateId: string;
	contractSha256: string;
	methods: Array<{ name: string; filePath: string; sha256: string }>;
	maxRepairTurns: number;
	createdAt: number;
}

export interface SkillActivationEntryV1 {
	schema: "prime.skill-activation/v1";
	sessionId: string;
	templateId: string;
	contractSha256: string;
	methodName: string;
	methodSha256: string;
	activatedAt: number;
	requestId: string;
	intent: string;
}

export interface SkillDispositionEntryV1 {
	schema: "prime.skill-disposition/v1";
	sessionId: string;
	templateId: string;
	contractSha256: string;
	methodName: string;
	methodSha256: string;
	status: SkillDispositionStatus;
	evidence: string[];
	summary: string;
	dispositionedAt: number;
	requestId: string;
}

export interface SkillEnforcementResultV1 {
	schema: "prime.skill-enforcement-result/v1";
	status: "passed" | "failed";
	sessionId: string;
	templateId: string;
	contractSha256: string;
	activatedMethods: string[];
	appliedMethods: string[];
	notApplicableMethods: string[];
	methodCount: number;
	missingMethods: string[];
	invalidRecordCount: number;
	evidenceCount: number;
	completedAt: number;
	attestationSha256: string;
}

export interface SkillEnforcementInvalidRecordV1 {
	kind: "activation" | "disposition" | "contract";
	methodName?: string;
	reason: string;
}

export interface SkillEnforcementStatusV1 {
	schema: "prime.skill-enforcement-status/v1";
	required: boolean;
	templateId: string | null;
	contractSha256: string | null;
	methodCount: number;
	activatedMethods: string[];
	appliedMethods: string[];
	notApplicableMethods: string[];
	missingActivations: string[];
	missingDispositions: string[];
	invalidRecords: SkillEnforcementInvalidRecordV1[];
	evidenceCount: number;
	passed: boolean;
}

export interface SkillEnforcementLedgerEntryLike {
	type?: string;
	customType?: string;
	data?: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
	return typeof value === "string" && value.trim().length > 0;
}

function sameIdentity(
	data: Record<string, unknown>,
	contract: ResolvedSkillEnforcementContractV1,
	sessionId: string,
): boolean {
	return (
		data.sessionId === sessionId &&
		data.templateId === contract.templateId &&
		data.contractSha256 === contract.contractSha256
	);
}

function invalid(
	invalidRecords: SkillEnforcementInvalidRecordV1[],
	kind: SkillEnforcementInvalidRecordV1["kind"],
	reason: string,
	methodName?: string,
): void {
	invalidRecords.push({ kind, ...(methodName ? { methodName } : {}), reason });
}

export function cloneSkillEnforcementContractEntry(
	contract: ResolvedSkillEnforcementContractV1,
	sessionId: string,
	createdAt = Date.now(),
): SkillEnforcementContractEntryV1 {
	return {
		schema: "prime.skill-enforcement-contract/v1",
		sessionId,
		templateId: contract.templateId,
		contractSha256: contract.contractSha256,
		methods: contract.methods.map(({ name, filePath, sha256 }) => ({ name, filePath, sha256 })),
		maxRepairTurns: contract.maxRepairTurns,
		createdAt,
	};
}

export function createSkillActivationEntry(input: {
	contract: ResolvedSkillEnforcementContractV1;
	method: Readonly<ScopedSkillSnapshot>;
	sessionId: string;
	intent: string;
	requestId: string;
	activatedAt?: number;
}): SkillActivationEntryV1 {
	return {
		schema: "prime.skill-activation/v1",
		sessionId: input.sessionId,
		templateId: input.contract.templateId,
		contractSha256: input.contract.contractSha256,
		methodName: input.method.name,
		methodSha256: input.method.sha256,
		activatedAt: input.activatedAt ?? Date.now(),
		requestId: input.requestId,
		intent: input.intent,
	};
}

export function createSkillDispositionEntry(input: {
	contract: ResolvedSkillEnforcementContractV1;
	method: Readonly<ScopedSkillSnapshot>;
	sessionId: string;
	status: SkillDispositionStatus;
	evidence: string[];
	summary: string;
	requestId: string;
	dispositionedAt?: number;
}): SkillDispositionEntryV1 {
	return {
		schema: "prime.skill-disposition/v1",
		sessionId: input.sessionId,
		templateId: input.contract.templateId,
		contractSha256: input.contract.contractSha256,
		methodName: input.method.name,
		methodSha256: input.method.sha256,
		status: input.status,
		evidence: [...input.evidence],
		summary: input.summary,
		dispositionedAt: input.dispositionedAt ?? Date.now(),
		requestId: input.requestId,
	};
}

export function foldSkillEnforcementLedger(
	contract: ResolvedSkillEnforcementContractV1 | undefined,
	sessionId: string,
	entries: readonly SkillEnforcementLedgerEntryLike[],
): SkillEnforcementStatusV1 {
	if (!contract) {
		return {
			schema: "prime.skill-enforcement-status/v1",
			required: false,
			templateId: null,
			contractSha256: null,
			methodCount: 0,
			activatedMethods: [],
			appliedMethods: [],
			notApplicableMethods: [],
			missingActivations: [],
			missingDispositions: [],
			invalidRecords: [],
			evidenceCount: 0,
			passed: true,
		};
	}

	const methods = new Map(contract.methods.map((method) => [method.name, method]));
	const activations = new Set<string>();
	const dispositions = new Map<string, SkillDispositionEntryV1>();
	const invalidRecords: SkillEnforcementInvalidRecordV1[] = [];
	let matchingContractEntries = 0;

	for (const entry of entries) {
		if (entry.type !== undefined && entry.type !== "custom") continue;
		if (!isRecord(entry.data)) continue;
		const data = entry.data;
		if (entry.customType === SKILL_ENFORCEMENT_CONTRACT_CUSTOM_TYPE) {
			if (!sameIdentity(data, contract, sessionId)) {
				invalid(invalidRecords, "contract", "contract entry identity does not match this session");
				continue;
			}
			matchingContractEntries += 1;
			continue;
		}
		if (entry.customType !== SKILL_ACTIVATION_CUSTOM_TYPE && entry.customType !== SKILL_DISPOSITION_CUSTOM_TYPE) {
			continue;
		}
		const kind = entry.customType === SKILL_ACTIVATION_CUSTOM_TYPE ? "activation" : "disposition";
		const methodName = typeof data.methodName === "string" ? data.methodName : undefined;
		if (!sameIdentity(data, contract, sessionId)) {
			invalid(invalidRecords, kind, "entry identity does not match this session", methodName);
			continue;
		}
		const method = methodName ? methods.get(methodName) : undefined;
		if (!methodName || !method) {
			invalid(invalidRecords, kind, "method is not present in the resolved contract", methodName);
			continue;
		}
		if (data.methodSha256 !== method.sha256) {
			invalid(invalidRecords, kind, "method snapshot hash does not match the contract", methodName);
			continue;
		}
		if (kind === "activation") {
			if (
				data.schema !== "prime.skill-activation/v1" ||
				!isNonEmptyString(data.intent) ||
				!isNonEmptyString(data.requestId) ||
				!Number.isFinite(data.activatedAt)
			) {
				invalid(invalidRecords, kind, "activation entry schema is invalid", methodName);
				continue;
			}
			activations.add(methodName);
			continue;
		}
		if (
			data.schema !== "prime.skill-disposition/v1" ||
			(data.status !== "applied" && data.status !== "not_applicable") ||
			!Array.isArray(data.evidence) ||
			!data.evidence.every(isNonEmptyString) ||
			!isNonEmptyString(data.summary) ||
			!isNonEmptyString(data.requestId) ||
			!Number.isFinite(data.dispositionedAt)
		) {
			invalid(invalidRecords, kind, "disposition entry schema is invalid", methodName);
			continue;
		}
		if (data.status === "applied" && data.evidence.length === 0) {
			invalid(invalidRecords, kind, "applied disposition requires non-empty evidence", methodName);
			continue;
		}
		if (dispositions.has(methodName)) {
			invalid(invalidRecords, kind, "duplicate final disposition", methodName);
			continue;
		}
		dispositions.set(methodName, data as unknown as SkillDispositionEntryV1);
	}

	if (matchingContractEntries === 0) {
		invalid(invalidRecords, "contract", "resolved contract has not been persisted in the session ledger");
	} else if (matchingContractEntries > 1) {
		invalid(invalidRecords, "contract", "resolved contract was persisted more than once");
	}

	const methodNames = contract.methods.map((method) => method.name);
	const activatedMethods = methodNames.filter((name) => activations.has(name));
	const appliedMethods = methodNames.filter((name) => dispositions.get(name)?.status === "applied");
	const notApplicableMethods = methodNames.filter((name) => dispositions.get(name)?.status === "not_applicable");
	const missingActivations = methodNames.filter((name) => !activations.has(name));
	const missingDispositions = methodNames.filter((name) => !dispositions.has(name));
	const evidenceCount = appliedMethods.reduce(
		(count, name) => count + (dispositions.get(name)?.evidence.length ?? 0),
		0,
	);
	return {
		schema: "prime.skill-enforcement-status/v1",
		required: true,
		templateId: contract.templateId,
		contractSha256: contract.contractSha256,
		methodCount: methodNames.length,
		activatedMethods,
		appliedMethods,
		notApplicableMethods,
		missingActivations,
		missingDispositions,
		invalidRecords,
		evidenceCount,
		passed: missingActivations.length === 0 && missingDispositions.length === 0 && invalidRecords.length === 0,
	};
}

export function createSkillEnforcementResult(
	status: SkillEnforcementStatusV1,
	resultStatus: "passed" | "failed",
	sessionId: string,
	completedAt = Date.now(),
): SkillEnforcementResultV1 {
	if (!status.required || !status.templateId || !status.contractSha256) {
		throw new Error("Cannot attest a session without a resolved skill enforcement contract");
	}
	if (resultStatus === "passed" && !status.passed) {
		throw new Error("Cannot emit a passed attestation for an incomplete skill enforcement ledger");
	}
	if (!isNonEmptyString(sessionId)) throw new Error("Cannot attest without a session identity");
	const hashInput = {
		schema: "prime.skill-enforcement-result/v1" as const,
		status: resultStatus,
		sessionId,
		templateId: status.templateId,
		contractSha256: status.contractSha256,
		activatedMethods: [...status.activatedMethods],
		appliedMethods: [...status.appliedMethods],
		notApplicableMethods: [...status.notApplicableMethods],
		methodCount: status.methodCount,
		missingMethods: [...new Set([...status.missingActivations, ...status.missingDispositions])],
		invalidRecordCount: status.invalidRecords.length,
		evidenceCount: status.evidenceCount,
		completedAt,
	};
	return {
		...hashInput,
		attestationSha256: createHash("sha256").update(JSON.stringify(hashInput)).digest("hex"),
	};
}

export function verifySkillEnforcementResult(
	value: unknown,
	contract: ResolvedSkillEnforcementContractV1,
	sessionId: string,
): SkillEnforcementResultV1 | undefined {
	if (!isRecord(value)) return undefined;
	if (
		value.schema !== "prime.skill-enforcement-result/v1" ||
		(value.status !== "passed" && value.status !== "failed") ||
		value.sessionId !== sessionId ||
		value.templateId !== contract.templateId ||
		value.contractSha256 !== contract.contractSha256 ||
		!Array.isArray(value.activatedMethods) ||
		!value.activatedMethods.every((name) => typeof name === "string") ||
		!Array.isArray(value.appliedMethods) ||
		!value.appliedMethods.every((name) => typeof name === "string") ||
		!Array.isArray(value.notApplicableMethods) ||
		!value.notApplicableMethods.every((name) => typeof name === "string") ||
		typeof value.methodCount !== "number" ||
		!Number.isSafeInteger(value.methodCount) ||
		value.methodCount !== contract.methods.length ||
		!Array.isArray(value.missingMethods) ||
		!value.missingMethods.every((name) => typeof name === "string") ||
		typeof value.invalidRecordCount !== "number" ||
		!Number.isSafeInteger(value.invalidRecordCount) ||
		value.invalidRecordCount < 0 ||
		typeof value.evidenceCount !== "number" ||
		!Number.isSafeInteger(value.evidenceCount) ||
		value.evidenceCount < 0 ||
		typeof value.completedAt !== "number" ||
		!Number.isFinite(value.completedAt) ||
		typeof value.attestationSha256 !== "string"
	) {
		return undefined;
	}
	const methodNames = contract.methods.map((method) => method.name);
	const allowed = new Set(methodNames);
	const activatedMethods = [...value.activatedMethods] as string[];
	const appliedMethods = [...value.appliedMethods] as string[];
	const notApplicableMethods = [...value.notApplicableMethods] as string[];
	const missingMethods = [...value.missingMethods] as string[];
	if (
		![...activatedMethods, ...appliedMethods, ...notApplicableMethods, ...missingMethods].every((name) =>
			allowed.has(name),
		) ||
		new Set(activatedMethods).size !== activatedMethods.length ||
		new Set(appliedMethods).size !== appliedMethods.length ||
		new Set(notApplicableMethods).size !== notApplicableMethods.length ||
		new Set(missingMethods).size !== missingMethods.length ||
		appliedMethods.some((name) => notApplicableMethods.includes(name))
	) {
		return undefined;
	}
	if (
		value.status === "passed" &&
		(missingMethods.length > 0 ||
			value.invalidRecordCount !== 0 ||
			methodNames.some((name) => !activatedMethods.includes(name)) ||
			methodNames.some((name) => !appliedMethods.includes(name) && !notApplicableMethods.includes(name)))
	) {
		return undefined;
	}
	const resultStatus = value.status as "passed" | "failed";
	const hashInput = {
		schema: "prime.skill-enforcement-result/v1" as const,
		status: resultStatus,
		sessionId,
		templateId: value.templateId,
		contractSha256: value.contractSha256,
		activatedMethods,
		appliedMethods,
		notApplicableMethods,
		methodCount: value.methodCount,
		missingMethods,
		invalidRecordCount: value.invalidRecordCount,
		evidenceCount: value.evidenceCount,
		completedAt: value.completedAt,
	};
	const expected = createHash("sha256").update(JSON.stringify(hashInput)).digest("hex");
	if (value.attestationSha256 !== expected) return undefined;
	return { ...hashInput, attestationSha256: expected };
}

export function verifySkillEnforcementResultAgainstLedger(
	value: unknown,
	contract: ResolvedSkillEnforcementContractV1,
	sessionId: string,
	entries: readonly SkillEnforcementLedgerEntryLike[],
): SkillEnforcementResultV1 | undefined {
	const restored = verifySkillEnforcementResult(value, contract, sessionId);
	if (!restored) return undefined;
	let recomputed: SkillEnforcementResultV1;
	try {
		recomputed = createSkillEnforcementResult(
			foldSkillEnforcementLedger(contract, sessionId, entries),
			restored.status,
			sessionId,
			restored.completedAt,
		);
	} catch {
		return undefined;
	}
	return JSON.stringify(restored) === JSON.stringify(recomputed) ? restored : undefined;
}

export function skillEnforcementRepairPrompt(status: SkillEnforcementStatusV1): string {
	const lines = [
		"Your template requires host-verified method usage before successful completion.",
		"Use the skill_usage Python API to repair only the following requirements:",
	];
	if (status.missingActivations.length > 0) {
		lines.push(`- Missing activations: ${status.missingActivations.join(", ")}`);
	}
	if (status.missingDispositions.length > 0) {
		lines.push(`- Missing dispositions: ${status.missingDispositions.join(", ")}`);
	}
	for (const record of status.invalidRecords) {
		lines.push(`- Invalid ${record.kind}${record.methodName ? ` for ${record.methodName}` : ""}: ${record.reason}`);
	}
	lines.push("Do not repeat completed work. Record the missing host evidence, then finish this corrective turn.");
	return lines.join("\n");
}
