import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { getBundledSkillsDir } from "../src/config.js";
import { IpythonKernelProvisioner } from "../src/core/tools/ipython.js";
import type { PythonSkillRuntimeInfo } from "../src/core/skills.js";

function bundledSkillUsage(): PythonSkillRuntimeInfo {
	const packagePath = join(getBundledSkillsDir(), "skill-usage");
	return {
		name: "skill-usage",
		importName: "skill_usage",
		packagePath,
		pyprojectPath: join(packagePath, "pyproject.toml"),
	};
}

describe("skill_usage over the kernel host bridge", { tags: ["kernel-heavy"] }, () => {
	let provisioner: IpythonKernelProvisioner | undefined;
	let tempDir: string | undefined;

	afterEach(async () => {
		await provisioner?.dispose();
		if (tempDir) rmSync(tempDir, { recursive: true, force: true });
		provisioner = undefined;
		tempDir = undefined;
	});

	it("round-trips activation, disposition, and status through a live kernel", async () => {
		tempDir = mkdtempSync(join(tmpdir(), "prime-skill-usage-"));
		const requests: Array<{ type: string; payload: Record<string, unknown> }> = [];
		const hostHandlers = Object.fromEntries(
			["skill_usage.activate", "skill_usage.disposition", "skill_usage.status"].map((type) => [
				type,
				async (payload: Record<string, unknown>) => {
					requests.push({ type, payload });
					if (type === "skill_usage.activate") {
						return { name: payload.name, sha256: "hash", content: "# Method" };
					}
					return { required: true, passed: type === "skill_usage.status" };
				},
			]),
		);
		provisioner = new IpythonKernelProvisioner(tempDir, {
			pythonSkills: [bundledSkillUsage()],
			hostHandlers,
		});
		const manager = await provisioner.ensure();
		const result = await manager.execute(`
import json
_activation = await skill_usage.activate(name="method-a", intent="inspect errors")
_disposition = await skill_usage.disposition(
    name="method-a",
    status="applied",
    evidence=["test:unit"],
    summary="applied checks",
)
_status = await skill_usage.status()
print(json.dumps([_activation, _disposition, _status], sort_keys=True))
`);
		expect(result.status).toBe("ok");
		expect(JSON.parse(result.stdout.trim())).toEqual([
			{ content: "# Method", name: "method-a", sha256: "hash" },
			{ passed: false, required: true },
			{ passed: true, required: true },
		]);
		expect(requests.map(({ type }) => type)).toEqual([
			"skill_usage.activate",
			"skill_usage.disposition",
			"skill_usage.status",
		]);
		expect(requests[0].payload).toMatchObject({ name: "method-a", intent: "inspect errors" });
		expect(requests[1].payload).toMatchObject({
			name: "method-a",
			status: "applied",
			evidence: ["test:unit"],
			summary: "applied checks",
		});
	});
});
