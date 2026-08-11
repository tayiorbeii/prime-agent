import type { SourceInfo } from "../source-info.js";

export interface AgentTemplateSkillSelectionV1 {
	include: string[];
	exposeSelected?: boolean;
}

export interface AgentTemplateSkillEnforcementV1 {
	schema: "prime.skill-enforcement/v1";
	mode: "required";
	requireActivation: true;
	requireDisposition: true;
	allowedDispositions: Array<"applied" | "not_applicable">;
	maxRepairTurns: number;
}

export interface AgentTemplateDefinitionV1 {
	schema: "prime.agent-template/v1";
	id: string;
	label: string;
	description: string;
	promptAppend: string;
	thinkingLevel?: AgentTemplateThinkingLevel;
	activeToolNames?: string[];
	allowedToolNames?: string[];
	skills?: AgentTemplateSkillSelectionV1;
	skillEnforcement?: AgentTemplateSkillEnforcementV1;
	metadata?: Record<string, unknown>;
}

export interface RegisteredAgentTemplate {
	definition: Readonly<AgentTemplateDefinitionV1>;
	sourceInfo: SourceInfo;
	extensionPath: string;
}

export type AgentTemplateThinkingLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max";

const TEMPLATE_ID_PATTERN = /^[a-z0-9][a-z0-9-]*(?:\/[a-z0-9][a-z0-9-]*)+$/;
const SKILL_NAME_PATTERN = /^[a-z0-9][a-z0-9-]*$/;
const TOOL_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;
const THINKING_LEVELS = new Set<AgentTemplateThinkingLevel>([
	"off",
	"minimal",
	"low",
	"medium",
	"high",
	"xhigh",
	"max",
]);

function requireBoundedString(value: unknown, field: string, maxLength: number): string {
	if (typeof value !== "string" || !value.trim()) {
		throw new Error(`Agent template ${field} must be a non-empty string`);
	}
	const normalized = value.trim();
	if (normalized.length > maxLength) {
		throw new Error(`Agent template ${field} must be at most ${maxLength} characters`);
	}
	return normalized;
}

function normalizeNames(value: unknown, field: string, pattern: RegExp): string[] | undefined {
	if (value === undefined) return undefined;
	if (!Array.isArray(value)) throw new Error(`Agent template ${field} must be an array`);
	const names: string[] = [];
	const seen = new Set<string>();
	for (const entry of value) {
		if (typeof entry !== "string" || !pattern.test(entry) || entry.includes("*")) {
			throw new Error(`Agent template ${field} contains invalid name ${JSON.stringify(entry)}`);
		}
		if (seen.has(entry)) throw new Error(`Agent template ${field} contains duplicate name ${JSON.stringify(entry)}`);
		seen.add(entry);
		names.push(entry);
	}
	return names;
}

function deepFreeze<T>(value: T): T {
	if (value && typeof value === "object" && !Object.isFrozen(value)) {
		Object.freeze(value);
		for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
	}
	return value;
}

function normalizeSkillEnforcement(
	value: AgentTemplateSkillEnforcementV1 | undefined,
	includedSkills: string[] | undefined,
): AgentTemplateSkillEnforcementV1 | undefined {
	if (value === undefined) return undefined;
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		throw new Error("Agent template skillEnforcement must be an object");
	}
	if (value.schema !== "prime.skill-enforcement/v1") {
		throw new Error('Agent template skillEnforcement.schema must be "prime.skill-enforcement/v1"');
	}
	if (value.mode !== "required") {
		throw new Error('Agent template skillEnforcement.mode must be "required"');
	}
	if (value.requireActivation !== true) {
		throw new Error("Agent template skillEnforcement.requireActivation must be true");
	}
	if (value.requireDisposition !== true) {
		throw new Error("Agent template skillEnforcement.requireDisposition must be true");
	}
	if (
		!Array.isArray(value.allowedDispositions) ||
		value.allowedDispositions.length !== 2 ||
		value.allowedDispositions[0] !== "applied" ||
		value.allowedDispositions[1] !== "not_applicable"
	) {
		throw new Error(
			'Agent template skillEnforcement.allowedDispositions must be ["applied", "not_applicable"]',
		);
	}
	if (!Number.isSafeInteger(value.maxRepairTurns) || value.maxRepairTurns < 0) {
		throw new Error("Agent template skillEnforcement.maxRepairTurns must be a non-negative safe integer");
	}
	if (!includedSkills || includedSkills.length === 0) {
		throw new Error("Agent template skillEnforcement requires at least one exact skills.include entry");
	}
	return {
		schema: "prime.skill-enforcement/v1",
		mode: "required",
		requireActivation: true,
		requireDisposition: true,
		allowedDispositions: ["applied", "not_applicable"],
		maxRepairTurns: value.maxRepairTurns,
	};
}

export function validateAgentTemplateDefinition(
	definition: AgentTemplateDefinitionV1,
): Readonly<AgentTemplateDefinitionV1> {
	if (!definition || typeof definition !== "object") throw new Error("Agent template definition must be an object");
	if (definition.schema !== "prime.agent-template/v1") {
		throw new Error('Agent template schema must be "prime.agent-template/v1"');
	}
	const id = requireBoundedString(definition.id, "id", 160);
	if (!TEMPLATE_ID_PATTERN.test(id)) {
		throw new Error("Agent template id must be a namespaced lowercase identifier such as prime/template/reviewer");
	}
	const label = requireBoundedString(definition.label, "label", 120);
	const description = requireBoundedString(definition.description, "description", 1024);
	const promptAppend = requireBoundedString(definition.promptAppend, "promptAppend", 12_000);
	if (definition.thinkingLevel !== undefined && !THINKING_LEVELS.has(definition.thinkingLevel)) {
		throw new Error(`Agent template thinkingLevel is invalid: ${JSON.stringify(definition.thinkingLevel)}`);
	}
	const activeToolNames = normalizeNames(definition.activeToolNames, "activeToolNames", TOOL_NAME_PATTERN);
	const allowedToolNames = normalizeNames(definition.allowedToolNames, "allowedToolNames", TOOL_NAME_PATTERN);
	const includedSkills = normalizeNames(definition.skills?.include, "skills.include", SKILL_NAME_PATTERN);
	if (activeToolNames && allowedToolNames) {
		const allowed = new Set(allowedToolNames);
		const outside = activeToolNames.find((name) => !allowed.has(name));
		if (outside)
			throw new Error(`Agent template activeToolNames contains ${JSON.stringify(outside)} outside allowedToolNames`);
	}
	if (definition.skills && includedSkills === undefined) {
		throw new Error("Agent template skills.include is required when skills is present");
	}
	if (definition.skills?.exposeSelected !== undefined && typeof definition.skills.exposeSelected !== "boolean") {
		throw new Error("Agent template skills.exposeSelected must be boolean");
	}
	const skillEnforcement = normalizeSkillEnforcement(definition.skillEnforcement, includedSkills);
	if (
		definition.metadata !== undefined &&
		(typeof definition.metadata !== "object" || definition.metadata === null || Array.isArray(definition.metadata))
	) {
		throw new Error("Agent template metadata must be an object");
	}
	const normalized: AgentTemplateDefinitionV1 = {
		schema: "prime.agent-template/v1",
		id,
		label,
		description,
		promptAppend,
		...(definition.thinkingLevel === undefined ? {} : { thinkingLevel: definition.thinkingLevel }),
		...(activeToolNames === undefined ? {} : { activeToolNames }),
		...(allowedToolNames === undefined ? {} : { allowedToolNames }),
		...(includedSkills === undefined
			? {}
			: {
					skills: {
						include: includedSkills,
						...(definition.skills?.exposeSelected === undefined
							? {}
							: { exposeSelected: definition.skills.exposeSelected }),
					},
				}),
		...(skillEnforcement === undefined ? {} : { skillEnforcement }),
		...(definition.metadata === undefined ? {} : { metadata: structuredClone(definition.metadata) }),
	};
	return deepFreeze(normalized);
}

export function cloneAgentTemplateDefinition(
	definition: Readonly<AgentTemplateDefinitionV1>,
): Readonly<AgentTemplateDefinitionV1> {
	return deepFreeze(structuredClone(definition) as AgentTemplateDefinitionV1);
}
