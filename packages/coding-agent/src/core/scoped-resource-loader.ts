import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import type { ResourceDiagnostic } from "./diagnostics.js";
import type { AgentTemplateDefinitionV1 } from "./extensions/agent-templates.js";
import type { ResourceExtensionPaths, ResourceLoader } from "./resource-loader.js";
import type { Skill } from "./skills.js";

export interface ResourceScope {
	skills?: {
		include: string[];
		exposeSelected?: boolean;
	};
	promptAppend?: string;
	templateId?: string;
}

export interface ScopedSkillSnapshot {
	name: string;
	filePath: string;
	sha256: string;
}

export interface ResolvedResourceScope extends ResourceScope {
	skillSnapshots: ScopedSkillSnapshot[];
}

export interface PersistedResourceScopeIdentity {
	templateId: string;
	templateSha256: string;
	promptSha256: string;
	skillNames: string[];
	skillSnapshots: ScopedSkillSnapshot[];
}

export function agentTemplateDigest(template: Readonly<AgentTemplateDefinitionV1>): string {
	return createHash("sha256").update(JSON.stringify(template)).digest("hex");
}

const SKILL_NAME_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

function skillDigest(skill: Skill): string {
	const hash = createHash("sha256");
	hash.update(skill.name);
	hash.update("\0");
	hash.update(skill.filePath);
	hash.update("\0");
	if (existsSync(skill.filePath)) hash.update(readFileSync(skill.filePath));
	return hash.digest("hex");
}

export function resolveResourceScope(base: ResourceLoader, requested: ResourceScope): ResolvedResourceScope {
	const include = requested.skills?.include ?? [];
	const seen = new Set<string>();
	const baseSkills = base.getSkills();
	const requestedNames = new Set(include);
	const collisions = baseSkills.diagnostics.filter(
		(diagnostic) =>
			diagnostic.type === "collision" &&
			diagnostic.collision?.resourceType === "skill" &&
			requestedNames.has(diagnostic.collision.name),
	);
	if (collisions.length > 0) {
		const names = [...new Set(collisions.map((diagnostic) => diagnostic.collision?.name))].sort();
		throw new Error(`Scoped skill selection is ambiguous because of collisions: ${names.join(", ")}`);
	}
	const byName = new Map<string, Skill>();
	for (const skill of baseSkills.skills) {
		if (byName.has(skill.name) && requestedNames.has(skill.name)) {
			throw new Error(`Scoped skill selection is ambiguous because of duplicate resources: ${skill.name}`);
		}
		byName.set(skill.name, skill);
	}
	const snapshots: ScopedSkillSnapshot[] = [];
	for (const name of include) {
		if (!SKILL_NAME_PATTERN.test(name) || name.includes("*")) {
			throw new Error(`Scoped skill names must be exact and cannot contain wildcards: ${JSON.stringify(name)}`);
		}
		if (seen.has(name)) throw new Error(`Duplicate scoped skill ${JSON.stringify(name)}`);
		seen.add(name);
		const skill = byName.get(name);
		if (!skill) throw new Error(`Unknown scoped skill ${JSON.stringify(name)}`);
		snapshots.push({ name, filePath: skill.filePath, sha256: skillDigest(skill) });
	}
	const promptAppend = requested.promptAppend?.trim();
	if (requested.promptAppend !== undefined && !promptAppend) {
		throw new Error("Scoped promptAppend must be non-empty when provided");
	}
	return Object.freeze({
		...(requested.skills
			? {
					skills: Object.freeze({
						include: Object.freeze([...include]) as unknown as string[],
						...(requested.skills.exposeSelected === undefined
							? {}
							: { exposeSelected: requested.skills.exposeSelected }),
					}),
				}
			: {}),
		...(promptAppend ? { promptAppend } : {}),
		...(requested.templateId ? { templateId: requested.templateId } : {}),
		skillSnapshots: Object.freeze(
			snapshots.map((snapshot) => Object.freeze(snapshot)),
		) as unknown as ScopedSkillSnapshot[],
	});
}

export function restoreResourceScope(
	base: ResourceLoader,
	identity: PersistedResourceScopeIdentity,
): ResolvedResourceScope {
	const registered = base.getExtensions().runtime.agentTemplates.get(identity.templateId);
	if (!registered) throw new Error(`Persisted agent template ${JSON.stringify(identity.templateId)} is unavailable`);
	const template = registered.definition;
	if (agentTemplateDigest(template) !== identity.templateSha256) {
		throw new Error(`Persisted agent template ${JSON.stringify(identity.templateId)} changed; start a fresh child`);
	}
	const promptSha256 = createHash("sha256").update(template.promptAppend).digest("hex");
	if (promptSha256 !== identity.promptSha256) {
		throw new Error(
			`Persisted agent template ${JSON.stringify(identity.templateId)} prompt changed; start a fresh child`,
		);
	}
	const scope = resolveResourceScope(base, {
		templateId: template.id,
		promptAppend: template.promptAppend,
		...(template.skills ? { skills: template.skills } : {}),
	});
	if (JSON.stringify(scope.skills?.include ?? []) !== JSON.stringify(identity.skillNames)) {
		throw new Error(
			`Persisted agent template ${JSON.stringify(identity.templateId)} skill selection changed; start a fresh child`,
		);
	}
	if (JSON.stringify(scope.skillSnapshots) !== JSON.stringify(identity.skillSnapshots)) {
		throw new Error(
			`Persisted agent template ${JSON.stringify(identity.templateId)} skill sources changed; start a fresh child`,
		);
	}
	return scope;
}

function cloneSelectedSkill(skill: Skill, exposeSelected: boolean): Skill {
	if (!exposeSelected || !skill.disableModelInvocation) return { ...skill };
	return { ...skill, disableModelInvocation: false };
}

export class ScopedResourceLoader implements ResourceLoader {
	private readonly extensions;
	private readonly baseSkills;
	private readonly prompts;
	private readonly themes;
	private readonly agentsFiles;
	private readonly systemPrompt;
	private readonly appendSystemPrompt;

	constructor(
		base: ResourceLoader,
		private readonly scope: ResolvedResourceScope,
	) {
		this.extensions = base.getExtensions();
		const baseSkills = base.getSkills();
		this.baseSkills = {
			skills: baseSkills.skills.map((skill) => ({ ...skill })),
			diagnostics: [...baseSkills.diagnostics],
		};
		this.prompts = base.getPrompts();
		this.themes = base.getThemes();
		this.agentsFiles = base.getAgentsFiles();
		this.systemPrompt = base.getSystemPrompt();
		this.appendSystemPrompt = [...base.getAppendSystemPrompt()];
	}

	getExtensions() {
		return this.extensions;
	}

	getSkills(): { skills: Skill[]; diagnostics: ResourceDiagnostic[] } {
		const baseResult = this.baseSkills;
		const selectedNames = new Set(this.scope.skills?.include ?? []);
		const snapshots = new Map(this.scope.skillSnapshots.map((snapshot) => [snapshot.name, snapshot]));
		const currentByName = new Map(baseResult.skills.map((skill) => [skill.name, skill]));
		const diagnostics = [...baseResult.diagnostics];
		const selected: Skill[] = [];
		for (const name of selectedNames) {
			const skill = currentByName.get(name);
			const snapshot = snapshots.get(name);
			if (!skill || !snapshot) {
				diagnostics.push({ type: "error", message: `Scoped skill ${JSON.stringify(name)} is no longer available` });
				continue;
			}
			const digest = skillDigest(skill);
			if (skill.filePath !== snapshot.filePath || digest !== snapshot.sha256) {
				diagnostics.push({
					type: "error",
					message: `Scoped skill ${JSON.stringify(name)} changed after scope resolution; create a fresh child scope`,
					path: skill.filePath,
				});
				continue;
			}
			selected.push(cloneSelectedSkill(skill, this.scope.skills?.exposeSelected === true));
		}
		const visibleBase = baseResult.skills.filter(
			(skill) => !skill.disableModelInvocation && !selectedNames.has(skill.name),
		);
		return { skills: [...visibleBase, ...selected], diagnostics };
	}

	getPrompts() {
		return this.prompts;
	}

	getThemes() {
		return this.themes;
	}

	getAgentsFiles() {
		return this.agentsFiles;
	}

	getSystemPrompt(): string | undefined {
		return this.systemPrompt;
	}

	getAppendSystemPrompt(): string[] {
		const base = this.appendSystemPrompt;
		if (!this.scope.promptAppend) return [...base];
		const id = this.scope.templateId ?? "scoped-child";
		return [
			...base,
			`<prime-agent-template id="${id}">
${this.scope.promptAppend}
</prime-agent-template>`,
		];
	}

	extendResources(_paths: ResourceExtensionPaths): void {
		throw new Error("Scoped child resource views cannot extend their parent loader");
	}

	async reload(): Promise<void> {
		// Child scopes are admission-time snapshots. Parent reloads must not mutate them.
	}
}
