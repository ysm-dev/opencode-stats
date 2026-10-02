// PROTOTYPE: invented names only. Nothing here comes from a real OpenCode database.

/** USD per million tokens, the way models.dev lists them. */
export interface Price {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

export interface ModelInfo {
  id: string; // provider/modelID
  provider: string;
  name: string; // catalog display name
  price: Price | null; // null: the catalog has no price, so no estimate
  billedPerToken: boolean; // false: subscription, OpenCode records zero cost
  reasoning: boolean;
}

export const PROVIDERS: Record<string, string> = {
  anthropic: "Anthropic",
  openai: "OpenAI",
  "opencode-go": "OpenCode Go",
  opencode: "OpenCode Zen",
  google: "Google",
  ollama: "Ollama",
};

export const MODELS: ModelInfo[] = [
  {
    id: "anthropic/claude-opus-5",
    provider: "anthropic",
    name: "Claude Opus 5",
    price: { input: 15, output: 75, cacheRead: 1.5, cacheWrite: 18.75 },
    billedPerToken: false,
    reasoning: true,
  },
  {
    id: "anthropic/claude-sonnet-5",
    provider: "anthropic",
    name: "Claude Sonnet 5",
    price: { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
    billedPerToken: false,
    reasoning: true,
  },
  {
    id: "anthropic/claude-haiku-5",
    provider: "anthropic",
    name: "Claude Haiku 5",
    price: { input: 1, output: 5, cacheRead: 0.1, cacheWrite: 1.25 },
    billedPerToken: false,
    reasoning: false,
  },
  {
    id: "openai/gpt-6.1-sol",
    provider: "openai",
    name: "GPT-6.1 Sol",
    price: { input: 2.5, output: 15, cacheRead: 0.25, cacheWrite: 0 },
    billedPerToken: true,
    reasoning: true,
  },
  {
    id: "openai/gpt-5.6-luna",
    provider: "openai",
    name: "GPT-5.6 Luna",
    price: { input: 1.25, output: 10, cacheRead: 0.125, cacheWrite: 0 },
    billedPerToken: true,
    reasoning: true,
  },
  {
    id: "opencode-go/gpt-5.6-luna",
    provider: "opencode-go",
    name: "GPT-5.6 Luna",
    price: { input: 1.25, output: 10, cacheRead: 0.125, cacheWrite: 0 },
    billedPerToken: false,
    reasoning: true,
  },
  {
    id: "google/gemini-3-pro",
    provider: "google",
    name: "Gemini 3 Pro",
    price: { input: 2, output: 12, cacheRead: 0.2, cacheWrite: 0 },
    billedPerToken: true,
    reasoning: true,
  },
  {
    id: "opencode/kimi-k3-free",
    provider: "opencode",
    name: "Kimi K3 Free",
    price: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    billedPerToken: true,
    reasoning: false,
  },
  {
    id: "ollama/qwen3-coder",
    provider: "ollama",
    name: "qwen3-coder",
    price: null,
    billedPerToken: false,
    reasoning: false,
  },
];

export const MODEL_BY_ID = new Map(MODELS.map((m) => [m.id, m]));

export interface ProjectInfo {
  id: string;
  label: string; // its name, else its folder's name; parent folder when names collide
}

export const PROJECTS: ProjectInfo[] = [
  { id: "p-storefront", label: "acme-storefront" },
  { id: "p-billing", label: "billing-service" },
  { id: "p-api-work", label: "api · work" },
  { id: "p-api-side", label: "api · side" },
  { id: "p-mobile", label: "field-app" },
  { id: "p-infra", label: "infra" },
  { id: "p-ml", label: "ml-pipeline" },
  { id: "p-docs", label: "docs-site" },
  { id: "p-dotfiles", label: "dotfiles" },
  { id: "global", label: "Global" },
];

export const PROJECT_BY_ID = new Map(PROJECTS.map((p) => [p.id, p]));

export const PRIMARY_AGENTS = ["build", "plan", "review"];
export const SUBAGENTS = ["explore", "general"];
export const AGENTS = [...PRIMARY_AGENTS, ...SUBAGENTS];

export const VARIANTS = ["default", "high", "max", "low"];

/** Tool name, relative weight, typical run time in ms, failure odds. */
export const TOOLS: [string, number, number, number][] = [
  ["read", 30, 40, 0.01],
  ["edit", 16, 60, 0.06],
  ["shell", 15, 4200, 0.09],
  ["grep", 10, 120, 0.01],
  ["glob", 6, 50, 0.005],
  ["write", 4, 50, 0.02],
  ["patch", 4, 80, 0.07],
  ["todowrite", 4, 5, 0],
  ["webfetch", 2, 1800, 0.08],
  ["execute", 2, 2500, 0.05],
  ["subagent", 1.5, 95000, 0.03],
  ["github_search_code", 1, 1400, 0.04],
  ["linear_get_issue", 0.5, 900, 0.03],
];

export const STEP_ERRORS = ["api.overloaded", "api.rate_limit", "context.overflow", "unknown"];

const VERBS = [
  "Fix",
  "Add",
  "Refactor",
  "Investigate",
  "Debug",
  "Write",
  "Plan",
  "Review",
  "Upgrade",
  "Speed up",
  "Document",
  "Clean up",
];
const THINGS = [
  "flaky checkout test",
  "CSV export for invoices",
  "auth middleware",
  "slow report query",
  "webhook retries",
  "migration for user preferences",
  "pricing page layout",
  "CI cache keys",
  "Terraform state drift",
  "onboarding emails",
  "search ranking",
  "image upload limits",
  "feature flag cleanup",
  "rate limiter",
  "dark mode toggle",
  "nightly backup job",
  "API pagination",
  "error boundaries",
  "shell aliases",
  "release notes",
];

export function sessionTitle(pick: (n: number) => number): string {
  if (pick(100) < 4) return "Untitled";
  return `${VERBS[pick(VERBS.length)]} ${THINGS[pick(THINGS.length)]}`;
}

export function modelLabel(id: string): string {
  const m = MODEL_BY_ID.get(id);
  return m ? m.name : id;
}

export function modelProviderLabel(id: string): string {
  const m = MODEL_BY_ID.get(id);
  return m ? (PROVIDERS[m.provider] ?? m.provider) : (id.split("/")[0] ?? id);
}

export function projectLabel(id: string): string {
  return PROJECT_BY_ID.get(id)?.label ?? id;
}
