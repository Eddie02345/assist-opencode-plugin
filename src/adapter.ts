import { createHash } from "node:crypto"

export type AnyRecord = Record<string, any>

const ASSIST_AGENTS = new Set([
  "ask",
  "code-reviewer",
  "developer",
  "developer-tester",
  "devops",
  "explore",
  "general-purpose",
  "intake-reviewer",
  "planner",
  "qa",
  "requirements-gatherer",
  "researcher",
  "reviewer",
  "solutions-architect",
  "task-planner",
  "worker",
])

export const WRITE_CAPABLE_TOOLS = new Set([
  "write",
  "edit",
  "shell",
  "patch",
  "multiedit",
  "apply_patch",
  "notebookedit",
])
export const GUARDED_TOOLS = new Set([...WRITE_CAPABLE_TOOLS, "webfetch", "websearch"])
export const GPT_LUNA_AGENTS = new Set(["reviewer", "solutions-architect"])

const TOOL_NAMES: Record<string, string> = {
  shell: "Bash",
  write: "Write",
  edit: "Edit",
  read: "Read",
  grep: "Grep",
  glob: "Glob",
  webfetch: "WebFetch",
  websearch: "WebSearch",
  subagent: "Agent",
}

function record(value: unknown): AnyRecord {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("tool input is not an object")
  }
  return value as AnyRecord
}

function text(value: unknown, name: string, allowEmpty = false): string {
  if (typeof value !== "string" || (!allowEmpty && value.length === 0)) {
    throw new TypeError(`missing or invalid ${name}`)
  }
  return value
}

function optionalText(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined
}

export function claudeToolName(tool: string): string | null {
  return TOOL_NAMES[tool] ?? null
}

export function claudeToolInput(tool: string, input: unknown): AnyRecord {
  const value = record(input)
  switch (tool) {
    case "shell":
      return { command: text(value.command, "command") }
    case "write":
      return {
        file_path: text(value.path, "path"),
        content: text(value.content, "content", true),
      }
    case "edit":
      return {
        file_path: text(value.path, "path"),
        old_string: text(value.oldString, "oldString", true),
        new_string: text(value.newString, "newString", true),
        replace_all: value.replaceAll === true,
      }
    case "read":
      return { file_path: text(value.path, "path") }
    case "grep":
      return { pattern: text(value.pattern, "pattern"), path: optionalText(value.path) }
    case "glob":
      return { pattern: text(value.pattern, "pattern"), path: optionalText(value.path) }
    case "webfetch":
      return { url: text(value.url, "url"), prompt: optionalText(value.format) }
    case "websearch":
      return { query: text(value.query, "query") }
    case "subagent":
      return {
        prompt: text(value.prompt, "prompt", true),
        subagent_type: text(value.agent, "agent"),
        description: optionalText(value.description),
      }
    default:
      return value
  }
}

export function claudeToolResponse(tool: string, result: AnyRecord | undefined): AnyRecord {
  const output = result?.output
  switch (tool) {
    case "shell":
      return {
        stdout: String(output?.output ?? result?.content?.[0]?.text ?? ""),
        stderr: "",
        interrupted: output?.status === "interrupted",
        exit: output?.exit,
      }
    case "read":
      return {
        type: "text",
        file: {
          filePath: output?.uri,
          content: String(output?.content ?? ""),
        },
      }
    case "webfetch":
      return { stdout: String(output?.output ?? ""), url: output?.url }
    case "websearch":
      return { results: output }
    case "subagent":
      return {
        status: output?.status ?? "completed",
        agentId: output?.sessionID,
        output: output?.output,
      }
    default:
      return result ?? {}
  }
}

export function applyFilteredToolResponse(tool: string, result: AnyRecord, filtered: AnyRecord): AnyRecord {
  const output = (result.output ??= {})
  switch (tool) {
    case "shell":
    case "webfetch":
      if (typeof filtered.stdout === "string") output.output = filtered.stdout
      break
    case "read":
      if (typeof filtered.file?.content === "string") output.content = filtered.file.content
      break
    case "subagent":
      if (typeof filtered.output === "string") output.output = filtered.output
      break
    case "websearch":
      if (filtered.results !== undefined) result.output = filtered.results
      break
  }
  return result
}

export function assistAgentType(agent: string): string {
  return ASSIST_AGENTS.has(agent) ? `assist-plugin:${agent}` : agent
}

export function isAssistAgent(agent: string): boolean {
  return ASSIST_AGENTS.has(agent)
}

export interface HookSource {
  sessionID: string
  agent: string
  messageID?: string
  callID?: string
}

export function makeInput(
  hookEventName: string,
  toolName: string | null,
  toolInput: AnyRecord | null,
  source: HookSource,
  context: { cwd: string; isSubagent: boolean; toolResponse?: AnyRecord },
): AnyRecord {
  if (typeof source.sessionID !== "string" || source.sessionID.length === 0) {
    throw new TypeError("missing session ID")
  }
  if (typeof source.agent !== "string" || source.agent.length === 0) {
    throw new TypeError("missing agent ID")
  }
  const input: AnyRecord = {
    hook_event_name: hookEventName,
    session_id: source.sessionID,
    cwd: context.cwd,
    agent_type: assistAgentType(source.agent),
  }
  if (context.isSubagent) input.agent_id = source.sessionID
  if (source.messageID) input.message_id = source.messageID
  if (source.callID) input.tool_use_id = source.callID
  if (toolName) input.tool_name = toolName
  if (toolInput) input.tool_input = toolInput
  if (context.toolResponse !== undefined) input.tool_response = context.toolResponse
  return input
}


// --- Cheap-routing state ----------------------------------------------------

const MAX_DISPATCHES_PER_TURN = 8
const MAX_ACTIVE_PER_SESSION = 8
const turnDispatches = new Map<string, number>()
const activeGptLuna = new Map<string, string>()

export function resetTurn(sessionID: string): void {
  turnDispatches.set(sessionID, 0)
  for (const [callID, owner] of activeGptLuna) {
    if (owner === sessionID) activeGptLuna.delete(callID)
  }
}

export function checkDispatch(sessionID: string, agent: string, callID: string): void {
  const count = turnDispatches.get(sessionID) ?? 0
  if (count >= MAX_DISPATCHES_PER_TURN) throw new Error("do this inline")
  if (GPT_LUNA_AGENTS.has(agent)) {
    let active = 0
    for (const owner of activeGptLuna.values()) {
      if (owner === sessionID) active += 1
    }
    if (active >= MAX_ACTIVE_PER_SESSION) throw new Error("do this inline")
  }
  turnDispatches.set(sessionID, count + 1)
  if (GPT_LUNA_AGENTS.has(agent)) activeGptLuna.set(callID, sessionID)
}

export function endDispatch(callID: string): void {
  activeGptLuna.delete(callID)
}

export function resetRoutingState(): void {
  turnDispatches.clear()
  activeGptLuna.clear()
  blockCounts.clear()
  blockHashes.clear()
  blockedTurns.clear()
}

// --- Block loop breaker -----------------------------------------------------

const blockCounts = new Map<string, number>()
const blockHashes = new Map<string, Set<string>>()
const blockedTurns = new Set<string>()

export function resetBlocks(sessionID: string): void {
  blockCounts.delete(sessionID)
  blockHashes.delete(sessionID)
  blockedTurns.delete(sessionID)
}

function normalize(value: any): any {
  if (Array.isArray(value)) return value.map(normalize)
  if (value && typeof value === "object") {
    const out: AnyRecord = {}
    for (const key of Object.keys(value).sort()) out[key] = normalize(value[key])
    return out
  }
  if (typeof value === "string") return value.replace(/\s+/g, " ").trim()
  return value
}

export function blockHash(tool: string, rule: string, args: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify({ tool, rule, args: normalize(args) }))
    .digest("hex")
}

export interface BlockDecision {
  readonly message: string
  readonly stop: boolean
  readonly count: number
}

export function recordBlock(
  sessionID: string,
  tool: string,
  rule: string,
  args: unknown,
  reason: string,
): BlockDecision {
  const count = (blockCounts.get(sessionID) ?? 0) + 1
  blockCounts.set(sessionID, count)
  const hash = blockHash(tool, rule, args)
  const hashes = blockHashes.get(sessionID) ?? new Set<string>()
  const duplicate = hashes.has(hash)
  hashes.add(hash)
  blockHashes.set(sessionID, hashes)
  if (count >= 5) blockedTurns.add(sessionID)
  const fix = String(reason ?? "").replace(/\s+/g, " ").trim().slice(0, 400)
  return {
    message: `BLOCKED rule=${rule}. Fix: ${fix || "correct the call"}. Do not retry unchanged.`,
    stop: duplicate || count >= 5,
    count,
  }
}

export function isTurnBlocked(sessionID: string): boolean {
  return blockedTurns.has(sessionID)
}

export function writeToolsForRemoval(): string[] {
  return [...WRITE_CAPABLE_TOOLS]
}

// --- Tool output budget -----------------------------------------------------

const MAX_TOOL_LINES = 200
const MAX_TOOL_CHARS = 24000

function truncateText(text: string): string {
  let out = text
  const lines = out.split("\n")
  if (lines.length > MAX_TOOL_LINES) {
    out = lines.slice(0, MAX_TOOL_LINES).join("\n") + `\n[... truncated by assist-plugin at ${MAX_TOOL_LINES} lines]`
  }
  if (out.length > MAX_TOOL_CHARS) {
    out = out.slice(0, MAX_TOOL_CHARS) + `\n[... truncated by assist-plugin at ${MAX_TOOL_CHARS} characters]`
  }
  return out
}

export function truncateToolResult(tool: string, result: AnyRecord): AnyRecord {
  if (!result || typeof result !== "object") return result
  const output = result.output
  if (output && typeof output === "object") {
    for (const key of ["output", "content", "stdout"]) {
      if (typeof output[key] === "string") output[key] = truncateText(output[key])
    }
  }
  if (Array.isArray(result.content)) {
    for (const part of result.content) {
      if (part && part.type === "text" && typeof part.text === "string") part.text = truncateText(part.text)
    }
  }
  return result
}

// --- Provider fallback ------------------------------------------------------

export const FALLBACKS: Record<string, string> = {
  "deepseek-v4.1-flash": "glm-5.3-flash",
  "glm-5.3-flash": "deepseek-v4.1-flash",
  "gpt-6-luna": "glm-5.3-flash",
}

export function fallbackFor(modelID: string): string | undefined {
  return FALLBACKS[modelID]
}
