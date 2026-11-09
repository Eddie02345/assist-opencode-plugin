import { createRequire } from "node:module"
import { mkdirSync } from "node:fs"
import { homedir } from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

const here = path.dirname(fileURLToPath(import.meta.url))

export const PLUGIN_ROOT = path.resolve(here, "..", "plugins", "assist-plugin")
export const RULES_ROOT = path.join(PLUGIN_ROOT, "rules")

// Set before any legacy module loads: several modules resolve rule paths at require time.
process.env.CLAUDE_PLUGIN_ROOT = PLUGIN_ROOT
if (!process.env.CLAUDE_PLUGIN_DATA) {
  process.env.CLAUDE_PLUGIN_DATA = path.join(homedir(), ".local", "share", "opencode", "assist-plugin")
}
mkdirSync(process.env.CLAUDE_PLUGIN_DATA, { recursive: true })

const require = createRequire(import.meta.url)

function load(relative: string) {
  return require(path.join(PLUGIN_ROOT, relative))
}

export const legacy = {
  health: load("hooks/lib/health.js"),
  fsaWriteBar: load("hooks/impl/fsa-write-bar.js"),
  proseGate: load("hooks/impl/prose-gate.js"),
  proseAdvisor: load("hooks/impl/prose-advisor.js"),
  commitAttributionGuard: load("hooks/impl/commit-attribution-guard.js"),
  docCliGuard: load("hooks/impl/doc-cli-guard.js"),
  saMermaidOnly: load("hooks/impl/sa-mermaid-only.js"),
  prPostAsk: load("hooks/impl/pr-post-ask.js"),
  prVerdictGuard: load("hooks/impl/pr-verdict-guard.js"),
  phiOutboundGuard: load("hooks/impl/phi-outbound-guard.js"),
  ferpaDisclosureGuard: load("hooks/impl/ferpa-disclosure-guard.js"),
  injectionFilter: load("hooks/impl/injection-filter.js"),
  writingContext: load("hooks/impl/writing-context.js"),
  fsaLog: load("hooks/impl/fsa-log.js"),
  auditLog: load("hooks/impl/audit-log.js"),
  dataAccessLog: load("hooks/impl/data-access-log.js"),
  gateEvidence: load("hooks/impl/gate-evidence.js"),
  goalGuard: load("hooks/impl/goal-guard.js"),
  confirmationRecord: load("hooks/impl/confirmation-record.js"),
  purposeCapture: load("hooks/impl/purpose-capture.js"),
  healthCheck: load("hooks/impl/health-check.js"),
  verifyAuditChain: load("scripts/verify-audit-chain.js"),
}

export function prepareEnvironment(projectDirectory: string) {
  process.env.CLAUDE_PLUGIN_ROOT = PLUGIN_ROOT
  process.env.CLAUDE_PROJECT_DIR = projectDirectory
  if (!process.env.CLAUDE_PLUGIN_DATA) {
    process.env.CLAUDE_PLUGIN_DATA = path.join(homedir(), ".local", "share", "opencode", "assist-plugin")
  }
  mkdirSync(process.env.CLAUDE_PLUGIN_DATA, { recursive: true })
  return {
    pluginRoot: PLUGIN_ROOT,
    dataDirectory: process.env.CLAUDE_PLUGIN_DATA,
    projectDirectory,
  }
}
