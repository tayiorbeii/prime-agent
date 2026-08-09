import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const ai = fileURLToPath(new URL("../ai/src/index.ts", import.meta.url));
const aiOauth = fileURLToPath(new URL("../ai/src/oauth.ts", import.meta.url));
const aiMcp = fileURLToPath(new URL("../ai/src/mcp.ts", import.meta.url));
const agent = fileURLToPath(new URL("../agent/src/index.ts", import.meta.url));
const codingAgent = fileURLToPath(new URL("../coding-agent/src/index.ts", import.meta.url));
const tui = fileURLToPath(new URL("../tui/src/index.ts", import.meta.url));

export default defineConfig({
  test: { environment: "node", testTimeout: 30_000 },
  resolve: {
    alias: [
      { find: /^@earendil-works\/pi-ai$/, replacement: ai },
      { find: /^@earendil-works\/pi-ai\/oauth$/, replacement: aiOauth },
      { find: /^@earendil-works\/pi-ai\/mcp$/, replacement: aiMcp },
      { find: /^@earendil-works\/pi-agent-core$/, replacement: agent },
      { find: /^@earendil-works\/pi-coding-agent$/, replacement: codingAgent },
      { find: /^@earendil-works\/pi-tui$/, replacement: tui },
    ],
  },
});
