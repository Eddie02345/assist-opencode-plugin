import { legacy } from "./legacy.ts"
import {
  applyFilteredToolResponse,
  assistAgentType,
  checkDispatch,
  claudeToolInput,
  claudeToolName,
  claudeToolResponse,
  endDispatch,
  fallbackFor,
  GUARDED_TOOLS,
  isTurnBlocked,
  makeInput,
  recordBlock,
  resetBlocks,
  resetTurn,
  truncateToolResult,
  writeToolsForRemoval,
} from "./adapter.ts"
import { isSubagent, note, state } from "./state.ts"

class GateDenied extends Error {
  readonly rule: string
  readonly reason: string

  constructor(rule: string, reason: string) {
    super(reason)
    this.rule = rule
    this.reason = reason
  }
}

function disabled(name: string): boolean {
  try {
    return Boolean(legacy.health.readDisabled()[name])
  } catch {
    return false
  }
}

function transform(name: string, module: any, input: any, options?: any): any {
  if (disabled(name)) return null
  try {
    return module.evaluate(input, options)
  } catch (error) {
    note(`${name} failed open: ${error instanceof Error ? error.message : String(error)}`)
    return null
  }
}

function runRecord(name: string, module: any, input: any, root: string): void {
  if (disabled(name)) return
  try {
    module.run(input, { root })
  } catch (error) {
    note(`${name} could not write its record: ${error instanceof Error ? error.message : String(error)}`)
  }
}

function gate(
  name: string,
  module: any,
  input: any,
  options: { mode?: "evaluate" | "run"; failClosed?: boolean } = {},
): void {
  if (disabled(name)) return
  const mode = options.mode ?? "evaluate"
  const failClosed = options.failClosed !== false
  try {
    const decision = mode === "run" ? module.run(input, { root: input.cwd }) : module.evaluate(input)
    if (decision && decision.deny === true) {
      throw new GateDenied(name, decision.reason || `assist-plugin ${name} denied this call`)
    }
  } catch (error) {
    if (error instanceof GateDenied) throw error
    let guarded = false
    try {
      guarded = typeof module.guardedClass === "function" && module.guardedClass(input) === true
    } catch {
      guarded = false
    }
    if (guarded || failClosed) {
      throw new GateDenied(
        name,
        `assist-plugin ${name} guard failed closed; this call is denied until the guard works`,
      )
    }
    note(`${name} failed open: ${error instanceof Error ? error.message : String(error)}`)
  }
}


async function handleBlock(
  ctx: any,
  event: any,
  tool: string,
  rule: string,
  reason: string,
): Promise<never> {
  const decision = recordBlock(event.sessionID, tool, rule, event.input, reason)
  if (!decision.stop) throw new GateDenied(rule, decision.message)
  const notice =
    decision.count >= 5
      ? "assist-plugin stopped this turn after 5 blocked calls. Review the blocked actions before continuing."
      : `assist-plugin stopped this turn after an identical block on rule ${rule}. ${reason.slice(0, 240)}`
  try {
    await ctx.session.synthetic({ sessionID: event.sessionID, text: notice })
  } catch {
    // The stop still applies when the notice cannot be sent.
  }
  try {
    await ctx.session.interrupt({ sessionID: event.sessionID, resume: false })
  } catch {
    // The thrown block still stops the call.
  }
  throw new GateDenied(rule, `BLOCKED rule=${rule}. This turn was stopped.`)
}

function writeAdapterFault(cwd: string, event: any, detail: string): void {
  try {
    legacy.health.auditAppend("assist-adapter", cwd, {
      event: "adapter-fault",
      operation: "call",
      data_class: "none",
      agent_type: assistAgentType(String(event.agent ?? "unidentified")),
      authorizer: "none",
      authorizer_reason: "adapter-fault",
    })
  } catch {
    // The audit write is best effort; the deny still stands.
  }
  try {
    legacy.health.logEvent("assist-adapter", "adapter-fault", detail.slice(0, 300))
  } catch {
    // The detail log is best effort.
  }
}

async function failClosedAdapter(ctx: any, event: any, tool: string, error: unknown, cwd: string): Promise<never> {
  const detail = error instanceof Error ? error.message : String(error)
  writeAdapterFault(cwd, event, detail)
  recordBlock(event.sessionID, tool, "assist-adapter", event.input, "internal guard error")
  try {
    await ctx.session.synthetic({
      sessionID: event.sessionID,
      text: "assist-plugin stopped this turn after an internal guard error. No action was taken.",
    })
  } catch {
    // The stop still applies.
  }
  try {
    await ctx.session.interrupt({ sessionID: event.sessionID, resume: false })
  } catch {
    // The thrown block still stops the call.
  }
  throw new GateDenied("assist-adapter", "BLOCKED rule=assist-adapter. This turn was stopped. No action was taken.")
}

function systemMessage(name: string, result: any) {
  const message = result?.stdout?.systemMessage
  if (typeof message === "string" && message.length > 0) note(`${name}: ${message}`)
  return typeof message === "string" ? message : ""
}

function isDoPlanDispatch(input: any): boolean {
  const prompt = String(input?.prompt ?? "")
  const description = String(input?.description ?? "")
  return prompt.includes("/do") || description.includes("/do") || description.includes("do-plan")
}

export interface HookRegistration {
  cleanup: () => void
}

export async function registerHooks(ctx: any): Promise<HookRegistration> {
  const cwd: string = ctx.location.directory
  const controller = new AbortController()
  void (async () => {
    try {
      for await (const event of ctx.event.subscribe({
        types: ["session.created", "session.agent.selected", "session.deleted"],
        signal: controller.signal,
      })) {
        const data: any = event.data
        if (event.type === "session.created") {
          if (typeof data.parentID === "string" && data.parentID.length > 0) {
            state.childSessions.add(data.sessionID)
            state.sessionParent.set(data.sessionID, data.parentID)
          }
          if (typeof data.agent === "string") state.sessionAgent.set(data.sessionID, data.agent)
        }
        if (event.type === "session.agent.selected" && typeof data.agent === "string") {
          state.sessionAgent.set(data.sessionID, data.agent)
        }
        if (event.type === "session.deleted") {
          state.childSessions.delete(data.sessionID)
          state.sessionAgent.delete(data.sessionID)
          state.resolved.delete(data.sessionID)
        }
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        note(`session event stream stopped: ${error instanceof Error ? error.message : String(error)}`)
      }
    }
  })()

  await ctx.tool.hook("execute.before", async (event: any) => {
    const tool = claudeToolName(event.tool)
    if (!tool) return
    const guarded = GUARDED_TOOLS.has(event.tool)
    let input: any
    let subagent = false
    try {
      subagent = await isSubagent(ctx, event.sessionID, event.agent)
      input = makeInput(
        "PreToolUse",
        tool,
        claudeToolInput(event.tool, event.input),
        {
          sessionID: event.sessionID,
          agent: event.agent,
          messageID: event.messageID,
          callID: event.id,
        },
        { cwd, isSubagent: subagent },
      )
    } catch (error) {
      if (guarded) await failClosedAdapter(ctx, event, event.tool, error, cwd)
      note(`skipping ${event.tool}: ${error instanceof Error ? error.message : String(error)}`)
      return
    }

    if (event.tool === "subagent") {
      if (subagent) {
        await handleBlock(ctx, event, "subagent", "depth-1", "subagents cannot spawn subagents")
      }
      // The per-turn budget applies to the orchestrator's explicit dispatches.
      // Child sessions bypass this gate entirely (depth-1 above is the only
      // recursion guard). Explicitly dispatched subagents, including waves
      // initiated under /do plans, are allowed through up to the ceilings
      // enforced by checkDispatch. No heuristic task-size limit is applied.
      if (!subagent) {
        const agent = String((event.input as any).agent ?? "")
        try {
          // /do waves share the same hard ceilings but are never forced
          // inline for size reasons: the marker only documents the bypass
          // of any task-size heuristic, the ceiling check still applies.
          if (isDoPlanDispatch(event.input)) {
            checkDispatch(event.sessionID, agent, event.id)
          } else {
            checkDispatch(event.sessionID, agent, event.id)
          }
        } catch {
          throw new GateDenied("dispatch-gate", "do this inline")
        }
      }
    }

    runRecord("data-access-log", legacy.dataAccessLog, input, cwd)

    const injection = transform("injection-filter", legacy.injectionFilter, input)
    const updatedInput = injection?.stdout?.hookSpecificOutput?.updatedInput
    if (updatedInput && tool === "Agent" && typeof updatedInput.prompt === "string") {
      ;(event.input as any).prompt = updatedInput.prompt
    }
    systemMessage("injection-filter", injection)

    try {
      gate("fsa-write-bar", legacy.fsaWriteBar, input, { failClosed: guarded })
      gate("prose-gate", legacy.proseGate, input, { failClosed: guarded })
      gate("phi-outbound-guard", legacy.phiOutboundGuard, input, { failClosed: guarded })
      gate("ferpa-disclosure-guard", legacy.ferpaDisclosureGuard, input, { mode: "run", failClosed: guarded })
    } catch (error) {
      if (event.tool === "subagent") endDispatch(event.id)
      if (error instanceof GateDenied) {
        await handleBlock(ctx, event, event.tool, error.rule, error.reason)
      }
      throw error
    }
  })

  await ctx.tool.hook("execute.after", async (event: any) => {
    const tool = claudeToolName(event.tool)
    if (!tool) return
    let input: any
    let response: any
    try {
      const subagent = await isSubagent(ctx, event.sessionID, event.agent)
      const hookEvent = event.status === "completed" ? "PostToolUse" : "PostToolUseFailure"
      response =
        event.status === "completed"
          ? claudeToolResponse(event.tool, event.result)
          : { error: String(event.error?.message ?? event.error) }
      input = makeInput(
        hookEvent,
        tool,
        claudeToolInput(event.tool, event.input),
        {
          sessionID: event.sessionID,
          agent: event.agent,
          messageID: event.messageID,
          callID: event.id,
        },
        { cwd, isSubagent: subagent, toolResponse: response },
      )
    } catch (error) {
      note(`skipping post-tool handling for ${event.tool}: ${error instanceof Error ? error.message : String(error)}`)
      if (event.tool === "subagent") endDispatch(event.id)
      return
    }

    if (event.tool === "subagent") endDispatch(event.id)
    if (event.status === "completed" && event.result) truncateToolResult(event.tool, event.result)

    if (event.status === "completed") {
      runRecord("audit-log", legacy.auditLog, input, cwd)

      const advisor = transform("prose-advisor", legacy.proseAdvisor, input)
      systemMessage("prose-advisor", advisor)

      const goal = transform("goal-guard", legacy.goalGuard, input)
      systemMessage("goal-guard", goal)

      const injection = transform("injection-filter", legacy.injectionFilter, input)
      const updated = injection?.stdout?.hookSpecificOutput?.updatedToolOutput
      if (updated && event.result) {
        applyFilteredToolResponse(event.tool, event.result, updated)
        const extra = injection?.stdout?.hookSpecificOutput?.additionalContext
        if (typeof extra === "string") note(`injection-filter: ${extra}`)
      }
      systemMessage("injection-filter", injection)

      if (event.tool === "subagent") {
        const fsaInput = {
          ...input,
          tool_name: "Agent",
          tool_input: {
            subagent_type: assistAgentType(String((event.input as any).agent ?? "")),
            message: "",
          },
          tool_response: response,
        }
        const report = transform("fsa-log", legacy.fsaLog, fsaInput)
        systemMessage("fsa-log", report)
      }

      if (event.tool === "shell") runRecord("gate-evidence", legacy.gateEvidence, input, cwd)
    } else if (event.tool === "shell") {
      runRecord("gate-evidence", legacy.gateEvidence, input, cwd)
    }
  })

  await ctx.permission.hook("evaluate", async (event: any) => {
    if (event.action !== "shell") return
    const command = typeof event.resources?.[0] === "string" ? event.resources[0] : ""
    if (command.length === 0) {
      event.effect = "deny"
      event.message = "assist-plugin shell gate denied this command: unrecognized shell payload"
      return
    }
    const sessionID = event.sessionID
    const agent = event.agent ?? "build"
    let input: any
    try {
      const subagent = await isSubagent(ctx, sessionID, agent)
      input = makeInput("PreToolUse", "Bash", { command }, { sessionID, agent }, { cwd, isSubagent: subagent })
    } catch (error) {
      event.effect = "deny"
      event.message = `assist-plugin shell gate denied this command: ${error instanceof Error ? error.message : String(error)}`
      return
    }

    const guards: Array<[string, any, any?]> = [
      ["commit-attribution-guard", legacy.commitAttributionGuard],
      ["doc-cli-guard", legacy.docCliGuard],
      ["sa-mermaid-only", legacy.saMermaidOnly],
      ["pr-post-ask", legacy.prPostAsk],
      ["pr-verdict-guard", legacy.prVerdictGuard, { log: note }],
    ]

    for (const [name, module, options] of guards) {
      if (disabled(name)) continue
      let decision: any
      try {
        decision = module.evaluate(input, options)
      } catch (error) {
        event.effect = "deny"
        event.message = `assist-plugin ${name} guard failed closed: ${error instanceof Error ? error.message : String(error)}`
        return
      }
      if (!decision) continue
      if (decision.deny === true) {
        event.effect = "deny"
        event.message = decision.reason || `assist-plugin ${name} denied this command`
        return
      }
      if (decision.ask === true) {
        event.effect = "ask"
        event.message = decision.reason || `assist-plugin ${name} asks before this command runs`
      }
    }
  })

  await ctx.session.hook("prompt", async (event: any) => {
    resetTurn(event.sessionID)
    resetBlocks(event.sessionID)
    const text = String(event.prompt?.text ?? "")
    const input = {
      hook_event_name: "UserPromptSubmit",
      prompt: text,
      session_id: event.sessionID,
      cwd,
      agent_type: "main-session",
    }

    const injection = transform("injection-filter", legacy.injectionFilter, input)
    const extra = injection?.stdout?.hookSpecificOutput?.additionalContext
    if (typeof extra === "string") note(`injection-filter: ${extra}`)
    systemMessage("injection-filter", injection)

    systemMessage("confirmation-record", transform("confirmation-record", legacy.confirmationRecord, input))
    systemMessage("purpose-capture", transform("purpose-capture", legacy.purposeCapture, input))
  })

  await ctx.session.hook("context", async (event: any) => {
    if (!isTurnBlocked(event.sessionID)) return
    const tools = event.tools
    if (!tools || typeof tools !== "object") return
    for (const name of writeToolsForRemoval()) delete tools[name]
  })

  const fallbackUsed = new Set<string>()
  await ctx.session.hook("retry", async (event: any) => {
    const status = event.error?.status
    if (status !== 429 && !(typeof status === "number" && status >= 500)) return
    if (event.attempt <= 2) {
      event.decision = { retry: true, delay: 500 * event.attempt }
      return
    }
    if (fallbackUsed.has(event.sessionID)) {
      event.decision = { retry: false }
      return
    }
    const fallback = fallbackFor(String(event.model?.id ?? ""))
    if (!fallback) {
      event.decision = { retry: false }
      return
    }
    try {
      await ctx.session.switchModel({
        sessionID: event.sessionID,
        model: { providerID: event.model?.providerID ?? "opencode-go", id: fallback },
      })
      fallbackUsed.add(event.sessionID)
      event.decision = { retry: true, delay: 0 }
    } catch {
      event.decision = { retry: false }
    }
  })

  if (ctx.tool && typeof ctx.tool.transform === "function") {
    await ctx.tool.transform((editor: any) => {
      editor.namespace({ name: "assist", description: "assist-plugin governance" })

      editor.add({
        name: "health",
        description: "Run every assist-plugin guard self-test and report failures.",
        input: { type: "object", properties: {}, additionalProperties: false },
        options: { namespace: "assist" },
        execute: async () => {
          const results = legacy.healthCheck.GUARDS.map((guard: any) => legacy.healthCheck.selfTest(guard))
          const failed = results.filter((result: any) => result.ok !== true)
          const cases = results.reduce(
            (sum: number, result: any) => sum + (result.allowCount ?? 0) + (result.denyCount ?? 0),
            0,
          )
          if (failed.length === 0) {
            return { content: `assist-plugin health: ${results.length} guards passed, ${cases} cases checked.` }
          }
          const lines = [
            `assist-plugin health: ${failed.length} of ${results.length} guards failed.`,
            ...failed.map(
              (result: any) =>
                `- ${result.name}: ${result.errors.length} error(s), ${result.falseAllow.length} false allow, ${result.falseDeny.length} false deny`,
            ),
          ]
          return { content: lines.join("\n") }
        },
      })

      editor.add({
        name: "audit",
        description: "Verify the governance audit hash chain in the current project.",
        input: { type: "object", properties: {}, additionalProperties: false },
        options: { namespace: "assist" },
        execute: async () => {
          const outcome = legacy.verifyAuditChain.check(ctx.location.directory)
          return { content: `assist-plugin audit:\n${outcome.lines.join("\n")}` }
        },
      })
    })
  }

  return { cleanup: () => controller.abort() }
}
