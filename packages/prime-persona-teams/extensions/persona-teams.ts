import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const roles = [
  {
    id: "founder-ceo",
    label: "Founder & CEO",
    description: "Frame the company or product problem, clarify strategic intent, and make explicit prioritization choices.",
    functionId: "planning",
    skills: ["persona-team-inspired-product", "persona-team-jobs-to-be-done", "persona-team-blue-ocean-strategy", "persona-team-lean-startup"],
  },
  {
    id: "product-designer",
    label: "Product Designer",
    description: "Turn validated intent into a usable, testable product experience and acceptance contract.",
    functionId: "planning",
    skills: ["persona-team-inspired-product", "persona-team-jobs-to-be-done", "persona-team-mom-test", "persona-team-lean-ux", "persona-team-continuous-discovery", "persona-team-design-sprint", "persona-team-ux-heuristics"],
  },
  {
    id: "devex-lead",
    label: "Developer Experience Lead",
    description: "Ensure APIs, CLIs, SDKs, and contributor workflows are coherent, learnable, and operable.",
    functionId: "planning",
    skills: ["persona-team-pragmatic-programmer", "persona-team-system-design", "persona-team-high-perf-browser", "persona-team-web-typography"],
  },
  {
    id: "engineering-manager",
    label: "Engineering Manager",
    description: "Convert approved intent into a bounded, dependency-aware technical plan and build queue.",
    functionId: "planning",
    skills: ["persona-team-domain-driven-design", "persona-team-system-design", "persona-team-ddia-systems", "persona-team-clean-architecture"],
  },
  {
    id: "implementation-engineer",
    label: "Implementation Engineer",
    description: "Produce a bounded candidate change for one approved task with reproducible verification evidence.",
    functionId: "delivery",
    skills: ["persona-team-clean-code", "persona-team-refactoring-patterns", "persona-team-software-design-philosophy", "persona-team-pragmatic-programmer"],
  },
  {
    id: "staff-reviewer",
    label: "Staff Reviewer",
    description: "Independently assess candidate correctness, maintainability, architecture, and test quality.",
    functionId: "assurance",
    skills: ["persona-team-clean-code", "persona-team-clean-architecture", "persona-team-refactoring-patterns", "persona-team-software-design-philosophy"],
  },
  {
    id: "security-officer",
    label: "Security Officer",
    description: "Independently assess trust boundaries, abuse cases, data handling, and operational security.",
    functionId: "assurance",
    skills: ["persona-team-clean-architecture", "persona-team-ddia-systems", "persona-team-domain-driven-design"],
  },
  {
    id: "qa-lead",
    label: "QA Lead",
    description: "Independently verify user-visible acceptance, regressions, failure paths, and reproducibility.",
    functionId: "assurance",
    skills: ["persona-team-pragmatic-programmer", "persona-team-release-it", "persona-team-ux-heuristics"],
  },
  {
    id: "release-engineer",
    label: "Release Engineer",
    description: "Prepare a precise, reversible release plan and verify an explicitly approved release action.",
    functionId: "release-learning",
    skills: ["persona-team-release-it"],
  },
  {
    id: "retro-ops-manager",
    label: "Retro / Ops Manager",
    description: "Turn completed delivery evidence into bounded learning and explicit improvement proposals.",
    functionId: "release-learning",
    skills: ["persona-team-traction-eos", "persona-team-drive-motivation", "persona-team-pragmatic-programmer"],
  },
] as const;

const contextCapabilities: Record<string, string[]> = {
  "founder-ceo": [
    "content.search",
    "output.materialize"
  ],
  "product-designer": [
    "content.search",
    "code.structure",
    "output.materialize"
  ],
  "devex-lead": [
    "content.search",
    "code.structure",
    "output.materialize"
  ],
  "engineering-manager": [
    "code.structure",
    "code.search",
    "output.materialize"
  ],
  "implementation-engineer": [
    "code.structure",
    "code.search",
    "output.materialize"
  ],
  "staff-reviewer": [
    "code.structure",
    "code.search",
    "output.materialize"
  ],
  "security-officer": [
    "code.structure",
    "code.search",
    "output.materialize"
  ],
  "qa-lead": [
    "code.structure",
    "code.search",
    "output.materialize"
  ],
  "release-engineer": [
    "content.search",
    "code.search",
    "output.materialize"
  ],
  "retro-ops-manager": [
    "content.search",
    "output.materialize"
  ]
};

function rolePrompt(roleId: string): string {
  return readFileSync(fileURLToPath(new URL(`../organization/roles/${roleId}.md`, import.meta.url)), "utf8");
}

export default function personaTeams(pi: ExtensionAPI): void {
  for (const role of roles) {
    pi.registerAgentTemplate({
      schema: "prime.agent-template/v1",
      id: `prime/persona-team/${role.id}`,
      label: role.label,
      description: role.description,
      promptAppend: rolePrompt(role.id),
      thinkingLevel: "high",
      activeToolNames: ["ipython"],
      allowedToolNames: ["ipython"],
      skills: { include: [...role.skills], exposeSelected: true },
      metadata: {
        organization: "prime-persona-team",
        function: `prime/function/${role.functionId}`,
        role: `prime/role/${role.id}`,
        contextCapabilities: contextCapabilities[role.id] ?? [],
      },
    });
  }
}
