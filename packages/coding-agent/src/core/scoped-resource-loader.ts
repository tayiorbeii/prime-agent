import { createHash } from "node:crypto";
import {
	closeSync,
	existsSync,
	fstatSync,
	lstatSync,
	openSync,
	readdirSync,
	readlinkSync,
	readSync,
	realpathSync,
	type Stats,
} from "node:fs";
import { basename, isAbsolute, relative, resolve, sep } from "node:path";
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
const REJECTED_PACKAGE_DIRECTORIES = new Set([".nox", ".tox", ".venv", "node_modules", "venv"]);
const EXCLUDED_PACKAGE_DIRECTORIES = new Set([
	".cache",
	".git",
	".hg",
	".mypy_cache",
	".pytest_cache",
	".ruff_cache",
	".svn",
]);
const EXCLUDED_PACKAGE_FILES = new Set([".coverage", ".DS_Store"]);
const MAX_PACKAGE_FILES = 10_000;
const MAX_PACKAGE_BYTES = 64 * 1024 * 1024;

function isInsideRoot(root: string, candidate: string): boolean {
	const pathFromRoot = relative(root, candidate);
	return (
		pathFromRoot === "" ||
		(!pathFromRoot.startsWith(`..${sep}`) && pathFromRoot !== ".." && !isAbsolute(pathFromRoot))
	);
}

function normalizedRelativePath(path: string): string {
	return path.split(sep).join("/");
}

function updatePackageHash(
	hash: ReturnType<typeof createHash>,
	kind: string,
	path: string,
	content?: Buffer | string,
): void {
	const body = content === undefined ? Buffer.alloc(0) : Buffer.isBuffer(content) ? content : Buffer.from(content);
	hash.update(kind);
	hash.update("\0");
	hash.update(normalizedRelativePath(path));
	hash.update("\0");
	hash.update(String(body.byteLength));
	hash.update("\0");
	hash.update(body);
	hash.update("\0");
}

function sameFileSnapshot(left: Stats, right: Stats): boolean {
	return (
		left.isFile() &&
		right.isFile() &&
		left.dev === right.dev &&
		left.ino === right.ino &&
		left.size === right.size &&
		left.mtimeMs === right.mtimeMs &&
		left.ctimeMs === right.ctimeMs
	);
}

function readStableFile(path: string, expected: Stats, skill: Skill, relativePath: string): Buffer {
	const descriptor = openSync(path, "r");
	try {
		const before = fstatSync(descriptor);
		if (!sameFileSnapshot(expected, before)) {
			throw new Error(
				`Scoped skill ${JSON.stringify(skill.name)} file ${JSON.stringify(relativePath)} changed while snapshotting`,
			);
		}
		const content = Buffer.allocUnsafe(before.size);
		let offset = 0;
		while (offset < before.size) {
			const bytesRead = readSync(descriptor, content, offset, before.size - offset, offset);
			if (bytesRead === 0) break;
			offset += bytesRead;
		}
		const after = fstatSync(descriptor);
		if (offset !== before.size || !sameFileSnapshot(before, after)) {
			throw new Error(
				`Scoped skill ${JSON.stringify(skill.name)} file ${JSON.stringify(relativePath)} changed while snapshotting`,
			);
		}
		return content;
	} finally {
		closeSync(descriptor);
	}
}

function skillPackageDigest(hash: ReturnType<typeof createHash>, skill: Skill): void {
	const packageRoot = realpathSync(skill.baseDir);
	if (REJECTED_PACKAGE_DIRECTORIES.has(basename(packageRoot))) {
		throw new Error(
			`Scoped skill ${JSON.stringify(skill.name)} package root is an executable dependency directory; move it before snapshotting`,
		);
	}
	let entryCount = 0;
	let byteCount = 0;
	const activeDirectories = new Set<string>();

	const checkBytes = (size: number) => {
		if (size < 0 || byteCount + size > MAX_PACKAGE_BYTES) {
			throw new Error(
				`Scoped skill ${JSON.stringify(skill.name)} package exceeds snapshot limits ` +
					`(${MAX_PACKAGE_FILES} entries or ${MAX_PACKAGE_BYTES} bytes)`,
			);
		}
		byteCount += size;
	};
	const checkEntry = (size = 0) => {
		entryCount += 1;
		if (entryCount > MAX_PACKAGE_FILES) {
			throw new Error(
				`Scoped skill ${JSON.stringify(skill.name)} package exceeds snapshot limits ` +
					`(${MAX_PACKAGE_FILES} entries or ${MAX_PACKAGE_BYTES} bytes)`,
			);
		}
		checkBytes(size);
	};

	const walk = (directory: string, relativeDirectory: string): void => {
		const realDirectory = realpathSync(directory);
		if (activeDirectories.has(realDirectory)) {
			updatePackageHash(hash, "cycle", relativeDirectory);
			return;
		}
		activeDirectories.add(realDirectory);
		try {
			const names = readdirSync(directory).sort();
			for (const name of names) {
				const path = resolve(directory, name);
				const relativePath = relativeDirectory ? `${relativeDirectory}/${name}` : name;
				const stat = lstatSync(path);
				if (stat.isDirectory()) {
					if (REJECTED_PACKAGE_DIRECTORIES.has(name)) {
						throw new Error(
							`Scoped skill ${JSON.stringify(skill.name)} contains executable dependency directory ${JSON.stringify(relativePath)}; remove it before snapshotting`,
						);
					}
					if (EXCLUDED_PACKAGE_DIRECTORIES.has(name)) continue;
					checkEntry();
					updatePackageHash(hash, "directory", relativePath);
					walk(path, relativePath);
					continue;
				}
				if (EXCLUDED_PACKAGE_FILES.has(name)) continue;
				if (stat.isSymbolicLink()) {
					const target = readlinkSync(path);
					checkEntry(Buffer.byteLength(target));
					updatePackageHash(hash, "symlink", relativePath, target);
					let resolvedTarget: string;
					try {
						resolvedTarget = realpathSync(path);
					} catch {
						throw new Error(
							`Scoped skill ${JSON.stringify(skill.name)} contains unresolved symlink ${JSON.stringify(relativePath)}`,
						);
					}
					if (!isInsideRoot(packageRoot, resolvedTarget)) {
						throw new Error(
							`Scoped skill ${JSON.stringify(skill.name)} contains symlink ${JSON.stringify(relativePath)} outside its package root`,
						);
					}
					const targetStat = lstatSync(resolvedTarget);
					if (targetStat.isDirectory()) walk(resolvedTarget, relativePath);
					else if (targetStat.isFile()) {
						checkBytes(targetStat.size);
						const content = readStableFile(resolvedTarget, targetStat, skill, relativePath);
						updatePackageHash(hash, "symlink-file", relativePath, content);
					}
					continue;
				}
				if (!stat.isFile()) {
					checkEntry();
					continue;
				}
				checkEntry(stat.size);
				const content = readStableFile(path, stat, skill, relativePath);
				updatePackageHash(hash, "file", relativePath, content);
			}
		} finally {
			activeDirectories.delete(realDirectory);
		}
	};

	walk(packageRoot, "");
}

function skillDigest(skill: Skill): string {
	const hash = createHash("sha256");
	hash.update(skill.name);
	hash.update("\0");
	hash.update(skill.filePath);
	hash.update("\0");
	if (existsSync(skill.baseDir)) skillPackageDigest(hash, skill);
	else if (existsSync(skill.filePath)) {
		const stat = lstatSync(skill.filePath);
		if (!stat.isFile() || stat.size > MAX_PACKAGE_BYTES) {
			throw new Error(
				`Scoped skill ${JSON.stringify(skill.name)} source exceeds snapshot limit (${MAX_PACKAGE_BYTES} bytes)`,
			);
		}
		hash.update(readStableFile(skill.filePath, stat, skill, skill.filePath));
	}
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
			let digest: string;
			try {
				digest = skillDigest(skill);
			} catch (error) {
				diagnostics.push({
					type: "error",
					message: `Scoped skill ${JSON.stringify(name)} could not be verified: ${error instanceof Error ? error.message : String(error)}`,
					path: skill.filePath,
				});
				continue;
			}
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
