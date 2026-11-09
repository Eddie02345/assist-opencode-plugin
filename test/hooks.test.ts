import test from "node:test"
import assert from "node:assert/strict"
import { mkdtempSync, readFileSync, rmSync, existsSync, mkdirSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import path from "node:path"

const DATA = mkdtempSync(path.join("/tmp/opencode", "assist-data-"))
process.env.CLAUDE_PLUGIN_DATA = DATA
process.env.CLAUDE_PROJECT_DIR = process.cwd()

const { registerHooks } = await import("../src/hooks.ts")
const { state } = await import("../src/state.ts")
const { legacy } = await import("../src/legacy.ts")
const { claudeToolInput, GUARDED_TOOLS, resetRoutingState } = await import("../src/adapter.ts")

function fakeContext(directory: string) {
  const handlers: any = {
    tool: {},
    permission: {},
    session: {},
    commands: {},
    tools: {},
    synthetics: [],
    interrupts: [],
    switches: [],
  }
  const ctx = {
    location: { directory },
    app: { version: "test" },
    event: {
      subscribe: () => ({
        async *[Symbol.asyncIterator]() {},
      }),
    },
    tool: {
      hook: async (name: string, callback: any) => {
        handlers.tool[name] = callback
        return { dispose: async () => {} }
      },
      transform: async (callback: any) => {
        callback({
          namespace: () => {},
          add: (definition: any) => {
            handlers.tools[definition.name] = definition
          },
        })
        return { dispose: async () => {} }
      },
    },
    permission: {
      hook: async (name: string, callback: any) => {
        handlers.permission[name] = callback
        return { dispose: async () => {} }
      },
    },
    session: {
      hook: async (name: string, callback: any) => {
        handlers.session[name] = callback
        return { dispose: async () => {} }
      },
      get: async () => ({}),
      prompt: async () => {},
      synthetic: async (input: any) => {
        handlers.synthetics.push(input)
      },
      interrupt: async (input: any) => {
        handlers.interrupts.push(input)
      },
      switchModel: async (input: any) => {
        handlers.switches.push(input)
      },
    },
    command: {
      transform: async (callback: any) => {
        callback({
          add: (definition: any) => {
            handlers.commands[definition.name] = definition
          },
        })
        return { dispose: async () => {} }
      },
    },
  }
  return { ctx, handlers }
}

function reset() {
  resetRoutingState()
  state.childSessions.clear()
  state.sessionAgent.clear()
  state.sessionParent.clear()
  state.resolved.clear()
  state.warnings.length = 0
}

function projectDir(label: string) {
  // The prose gate exempts the system temp directory. Test dirs must live outside it
  // so the gate judges the writes even when the repository is checked out under /tmp.
  return mkdtempSync(path.join(homedir(), `assist-test-${label}-`))
}

test("adapter maps OpenCode tool input to the Claude shape", () => {
  for (const name of ["write", "edit", "shell", "webfetch", "websearch", "apply_patch", "multiedit", "notebookedit"]) {
    assert.ok(GUARDED_TOOLS.has(name), `${name} is guarded`)
  }
  assert.deepEqual(claudeToolInput("write", { path: "/a.md", content: "x" }), {
    file_path: "/a.md",
    content: "x",
  })
  assert.deepEqual(claudeToolInput("edit", { path: "/a.md", oldString: "a", newString: "b" }), {
    file_path: "/a.md",
    old_string: "a",
    new_string: "b",
    replace_all: false,
  })
  assert.deepEqual(claudeToolInput("shell", { command: "echo hi" }), { command: "echo hi" })
  assert.deepEqual(claudeToolInput("subagent", { agent: "developer", prompt: "do it" }), {
    prompt: "do it",
    subagent_type: "developer",
    description: undefined,
  })
})

test("prose gate denies an em dash added by a write and allows clean text", async () => {
  reset()
  const directory = projectDir("prose")
  const { ctx, handlers } = fakeContext(directory)
  await registerHooks(ctx)
  const before = handlers.tool["execute.before"]

  await assert.rejects(
    before({
      tool: "write",
      sessionID: "ses_main",
      agent: "build",
      messageID: "msg_1",
      id: "call_1",
      input: { path: path.join(directory, "a.md"), content: "Results \u2014 final." },
    }),
    /prose-gate/,
  )

  await before({
    tool: "write",
    sessionID: "ses_main",
    agent: "build",
    messageID: "msg_2",
    id: "call_2",
    input: { path: path.join(directory, "b.md"), content: "Results final." },
  })

  rmSync(directory, { recursive: true, force: true })
})

test("write bar denies a protected path for a subagent and allows a source file", async () => {
  reset()
  const directory = projectDir("writebar")
  const { ctx, handlers } = fakeContext(directory)
  await registerHooks(ctx)
  const before = handlers.tool["execute.before"]
  state.childSessions.add("ses_child")

  await assert.rejects(
    before({
      tool: "write",
      sessionID: "ses_child",
      agent: "developer",
      messageID: "msg_1",
      id: "call_1",
      input: { path: path.join(directory, "DECISIONS.md"), content: "changed" },
    }),
    /DECISIONS|protected|plan/i,
  )

  await before({
    tool: "write",
    sessionID: "ses_child",
    agent: "developer",
    messageID: "msg_2",
    id: "call_2",
    input: { path: path.join(directory, "src", "app.ts"), content: "export const x = 1" },
  })

  rmSync(directory, { recursive: true, force: true })
})

test("permission hook asks before a PR post and denies a blocked documentation CLI", async () => {
  reset()
  const directory = projectDir("permission")
  const { ctx, handlers } = fakeContext(directory)
  await registerHooks(ctx)
  const evaluate = handlers.permission.evaluate

  const askEvent = {
    action: "shell",
    resources: ["gh pr merge 1"],
    sessionID: "ses_main",
    agent: "build",
    effect: "allow",
    message: undefined,
  }
  await evaluate(askEvent)
  assert.equal(askEvent.effect, "ask")

  const denyEvent = {
    action: "shell",
    resources: ["ctx7 login"],
    sessionID: "ses_main",
    agent: "build",
    effect: "allow",
    message: undefined,
  }
  await evaluate(denyEvent)
  assert.equal(denyEvent.effect, "deny")

  rmSync(directory, { recursive: true, force: true })
})

test("injection filter rewrites a subagent prompt before it runs", async () => {
  reset()
  const directory = projectDir("injection")
  const { ctx, handlers } = fakeContext(directory)
  await registerHooks(ctx)
  const before = handlers.tool["execute.before"]
  const sample = legacy.healthCheck.INJECTION_SAMPLES[0][1]
  const event = {
    tool: "subagent",
    sessionID: "ses_main",
    agent: "build",
    messageID: "msg_1",
    id: "call_1",
    input: { agent: "developer", description: "x", prompt: sample },
  }
  await before(event)
  assert.notEqual(event.input.prompt, sample)
  assert.ok(!event.input.prompt.includes(sample))
  rmSync(directory, { recursive: true, force: true })
})

test("audit log records the five attribution fields", async () => {
  reset()
  const directory = projectDir("audit")
  mkdirSync(path.join(directory, "src"), { recursive: true })
  writeFileSync(path.join(directory, "src", "app.js"), "const x = 1\n")
  const { ctx, handlers } = fakeContext(directory)
  await registerHooks(ctx)
  const after = handlers.tool["execute.after"]
  state.childSessions.add("ses_child")

  await after({
    tool: "read",
    sessionID: "ses_child",
    agent: "developer",
    messageID: "msg_1",
    id: "call_1",
    status: "completed",
    input: { path: path.join(directory, "src", "app.js") },
    result: { output: { uri: "file://" + path.join(directory, "src", "app.js"), content: "const x = 1\n" } },
  })

  const logFile = path.join(directory, ".agent", "logs", "governance", "audit.jsonl")
  assert.ok(existsSync(logFile), "audit log should exist")
  const lines = readFileSync(logFile, "utf8").trim().split("\n").filter(Boolean)
  assert.ok(lines.length >= 1)
  const record = JSON.parse(lines[lines.length - 1])
  assert.equal(record.operation, "read")
  assert.equal(record.agent_type, "assist-plugin:developer")
  assert.equal(record.path, "src/app.js")
  assert.equal(typeof record.ts, "string")

  rmSync(directory, { recursive: true, force: true })
})

test("fsa log records a completed subagent report from the tool result", async () => {
  reset()
  const directory = projectDir("fsalog")
  const { ctx, handlers } = fakeContext(directory)
  await registerHooks(ctx)
  const after = handlers.tool["execute.after"]
  state.childSessions.add("ses_child")

  const block = [
    "Report text.",
    "",
    "```fsa",
    "fsa: developer-tester/1",
    "state: Done",
    "trace: Intake > AssembleContext > PlanCoverage > CheckCoverage > WriteTests > SelfCheck > Done",
    "artifact: src/app.test.ts",
    "verdict: covered=7 uncovered=0",
    "skipped: none",
    "out_of_scope: none",
    "error_class: none",
    "questions: none",
    "resume_at: none",
    "```",
    "",
  ].join("\n")

  await after({
    tool: "subagent",
    sessionID: "ses_main",
    agent: "build",
    messageID: "msg_1",
    id: "call_1",
    status: "completed",
    input: { agent: "developer-tester", description: "tests", prompt: "write tests" },
    result: { output: { sessionID: "ses_child", status: "completed", output: block } },
  })

  const logFile = path.join(DATA, "fsa-log.jsonl")
  assert.ok(existsSync(logFile), "fsa log should exist")
  const lines = readFileSync(logFile, "utf8").trim().split("\n").filter(Boolean)
  const record = JSON.parse(lines[lines.length - 1])
  assert.equal(record.event, "agent-result")
  assert.equal(record.agent_type, "assist-plugin:developer-tester")
  assert.equal(record.agent_id, "ses_child")
  assert.equal(record.state, "Done")

  rmSync(directory, { recursive: true, force: true })
})

test("the static writing standard is configured as instructions, not injected per request", async () => {
  reset()
  const directory = projectDir("context")
  const { ctx, handlers } = fakeContext(directory)
  await registerHooks(ctx)
  const event: any = { sessionID: "ses_main", agent: "build", system: [], messages: [], tools: { write: {}, edit: {} } }
  await handlers.session.context(event)
  assert.equal(event.system.length, 0)
  assert.equal(event.messages.length, 0)
  assert.ok(event.tools.write)
  const config = JSON.parse(readFileSync(path.join(process.cwd(), "opencode.json"), "utf8"))
  assert.ok(Array.isArray(config.instructions))
  assert.ok(config.instructions.some((entry: string) => entry.includes("writing-standard-compact.md")))
  rmSync(directory, { recursive: true, force: true })
})


test("commit guard denies a Claude co-author trailer and allows a human one", async () => {
  reset()
  const directory = projectDir("commit")
  const { ctx, handlers } = fakeContext(directory)
  await registerHooks(ctx)
  const evaluate = handlers.permission.evaluate

  const denyEvent = {
    action: "shell",
    resources: [legacy.healthCheck.COMMIT_GUARD_DENY[0].tool_input.command],
    sessionID: "ses_main",
    agent: "build",
    effect: "allow",
    message: undefined,
  }
  await evaluate(denyEvent)
  assert.equal(denyEvent.effect, "deny")

  const allowEvent = {
    action: "shell",
    resources: [legacy.healthCheck.COMMIT_GUARD_ALLOW[0].tool_input.command],
    sessionID: "ses_main",
    agent: "build",
    effect: "allow",
    message: undefined,
  }
  await evaluate(allowEvent)
  assert.equal(allowEvent.effect, "allow")
  rmSync(directory, { recursive: true, force: true })
})


test("plugin registers the health and audit tools", async () => {
  reset()
  const directory = projectDir("tools")
  const { ctx, handlers } = fakeContext(directory)
  await registerHooks(ctx)
  assert.ok(handlers.tools.health, "assist_health tool should be registered")
  assert.ok(handlers.tools.audit, "assist_audit tool should be registered")
  const result = await handlers.tools.health.execute({}, {})
  assert.match(result.content, /assist-plugin health/)
  rmSync(directory, { recursive: true, force: true })
})


test("guarded tools fail closed without leaking the adapter exception", async () => {
  reset()
  const directory = projectDir("closed")
  const { ctx, handlers } = fakeContext(directory)
  await registerHooks(ctx)
  const before = handlers.tool["execute.before"]

  for (const tool of ["write", "shell"]) {
    await assert.rejects(
      before({ tool, sessionID: "ses_main", agent: "build", messageID: "m", id: "c", input: {} }),
      (error: Error) => {
        assert.match(error.message, /BLOCKED rule=assist-adapter/)
        assert.ok(!error.message.includes("missing or invalid"))
        return true
      },
    )
  }
  assert.equal(handlers.interrupts.length, 2)
  rmSync(directory, { recursive: true, force: true })
})

test("an identical policy block twice stops the turn", async () => {
  reset()
  const directory = projectDir("loop")
  const { ctx, handlers } = fakeContext(directory)
  await registerHooks(ctx)
  const before = handlers.tool["execute.before"]
  const event = () => ({
    tool: "write",
    sessionID: "ses_main",
    agent: "build",
    messageID: "m",
    id: "c",
    input: { path: path.join(directory, "a.md"), content: "Results \u2014 final." },
  })

  await assert.rejects(before(event()), /BLOCKED rule=prose-gate/)
  await assert.rejects(before(event()), /This turn was stopped/)
  assert.equal(handlers.interrupts.length, 1)
  assert.equal(handlers.synthetics.length, 1)
  rmSync(directory, { recursive: true, force: true })
})

test("dispatch gate allows two subagents per turn and resets on a new prompt", async () => {
  reset()
  const directory = projectDir("dispatch")
  const { ctx, handlers } = fakeContext(directory)
  await registerHooks(ctx)
  const before = handlers.tool["execute.before"]
  const dispatch = (id: string) => ({
    tool: "subagent",
    sessionID: "ses_main",
    agent: "build",
    messageID: "m",
    id,
    input: { agent: "developer", description: "x", prompt: "do" },
  })

  await before(dispatch("c1"))
  await before(dispatch("c2"))
  await assert.rejects(before(dispatch("c3")), /do this inline/)

  await handlers.session.prompt({ sessionID: "ses_main", prompt: { text: "next" } })
  await before(dispatch("c4"))
  rmSync(directory, { recursive: true, force: true })
})

test("a subagent cannot dispatch another subagent", async () => {
  reset()
  const directory = projectDir("depth")
  const { ctx, handlers } = fakeContext(directory)
  await registerHooks(ctx)
  state.childSessions.add("ses_child")
  await assert.rejects(
    handlers.tool["execute.before"]({
      tool: "subagent",
      sessionID: "ses_child",
      agent: "developer",
      messageID: "m",
      id: "c",
      input: { agent: "worker", description: "x", prompt: "do" },
    }),
    /depth-1|subagents cannot spawn/,
  )
  rmSync(directory, { recursive: true, force: true })
})

test("only one gpt-6-luna subagent runs at a time", async () => {
  reset()
  const directory = projectDir("luna")
  const { ctx, handlers } = fakeContext(directory)
  await registerHooks(ctx)
  const before = handlers.tool["execute.before"]
  const after = handlers.tool["execute.after"]
  const dispatch = (id: string) => ({
    tool: "subagent",
    sessionID: "ses_main",
    agent: "build",
    messageID: "m",
    id,
    input: { agent: "reviewer", description: "x", prompt: "review" },
  })

  await before(dispatch("c1"))
  await assert.rejects(before(dispatch("c2")), /do this inline/)
  await after({
    ...dispatch("c1"),
    status: "completed",
    result: { output: { sessionID: "ses_child", status: "completed", output: "done" } },
  })
  await before(dispatch("c3"))
  rmSync(directory, { recursive: true, force: true })
})

test("oversized tool output is truncated with a note", async () => {
  reset()
  const directory = projectDir("truncate")
  const { ctx, handlers } = fakeContext(directory)
  await registerHooks(ctx)
  const result = { output: { output: Array.from({ length: 300 }, (_, i) => `line ${i}`).join("\n") } }
  await handlers.tool["execute.after"]({
    tool: "webfetch",
    sessionID: "ses_main",
    agent: "build",
    messageID: "m",
    id: "c",
    status: "completed",
    input: { url: "https://example.com" },
    result,
  })
  assert.match(result.output.output, /truncated by assist-plugin at 200 lines/)
  assert.equal(result.output.output.split("\n").length, 201)
  rmSync(directory, { recursive: true, force: true })
})

test("shell permission gate denies an empty command instead of allowing it", async () => {
  reset()
  const directory = projectDir("shellclosed")
  const { ctx, handlers } = fakeContext(directory)
  await registerHooks(ctx)
  const event = {
    action: "shell",
    resources: [],
    sessionID: "ses_main",
    agent: "build",
    effect: "allow",
    message: undefined,
  }
  await handlers.permission.evaluate(event)
  assert.equal(event.effect, "deny")
  rmSync(directory, { recursive: true, force: true })
})

test("agent pins and editing permissions match the config", async () => {
  const routing = JSON.parse(readFileSync(path.join(process.cwd(), "config", "agents.json"), "utf8"))
  for (const [agent, model] of Object.entries(routing)) {
    const text = readFileSync(path.join(process.cwd(), ".opencode", "agents", `${agent}.md`), "utf8")
    assert.match(text, new RegExp(`^model: ${model}$`, "m"), `${agent} model`)
    assert.match(text, /## Handback Rules/, `${agent} handback`)
    assert.ok(!/qwen3\.7-plus|claude-haiku/.test(model), `${agent} forbidden model`)
    if (model.includes("deepseek-v4-pro")) {
      assert.ok(["code-reviewer", "qa"].includes(agent), `${agent} may use deepseek-v4-pro`)
    }
  }
  const config = JSON.parse(readFileSync(path.join(process.cwd(), "opencode.json"), "utf8"))
  assert.equal(config.model, "opencode-go/qwen3.7-plus")
  assert.equal(config.agents.general.model, "opencode-go/deepseek-v4.1-flash")
  for (const action of ["edit", "write"]) {
    assert.ok(
      !(config.permissions ?? []).some(
        (rule: any) => rule.action === action && rule.resource === "*" && rule.effect === "deny",
      ),
      `root ${action} not denied`,
    )
    assert.ok(
      config.agents.build.permissions.some(
        (rule: any) => rule.action === action && rule.resource === "*" && rule.effect === "allow",
      ),
      `build ${action} allow`,
    )
  }
  assert.ok(existsSync(path.join(process.cwd(), ".opencode", "agents", "code-reviewer.md")))
  const general = readFileSync(path.join(process.cwd(), ".opencode", "agents", "general-purpose.md"), "utf8")
  assert.match(general, /^hidden: true$/m)
  for (const agent of ["explore", "ask", "intake-reviewer", "requirements-gatherer", "developer-tester"]) {
    const text = readFileSync(path.join(process.cwd(), ".opencode", "agents", `${agent}.md`), "utf8")
    assert.match(text, /^model: .*#low$/m, `${agent} low effort`)
  }
  for (const agent of ["developer", "worker"]) {
    const text = readFileSync(path.join(process.cwd(), ".opencode", "agents", `${agent}.md`), "utf8")
    for (const action of ["edit", "write", "shell"]) {
      assert.ok(text.includes(`{ action: ${action}, resource: "*", effect: allow }`), `${agent} ${action} allow`)
    }
  }
  const tester = readFileSync(path.join(process.cwd(), ".opencode", "agents", "developer-tester.md"), "utf8")
  assert.ok(tester.includes('{ action: shell, resource: "*", effect: allow }'))
})

test("successful writes leave the tool result unchanged", async () => {
  reset()
  const directory = projectDir("noadvice")
  writeFileSync(path.join(directory, "README.md"), "This is very robust.\n")
  const { ctx, handlers } = fakeContext(directory)
  await registerHooks(ctx)
  const after = handlers.tool["execute.after"]
  const result = { output: { operation: "write", target: path.join(directory, "README.md") } }
  await after({
    tool: "write",
    sessionID: "ses_main",
    agent: "build",
    messageID: "m",
    id: "c",
    status: "completed",
    input: { path: path.join(directory, "README.md"), content: "This is very robust.\n" },
    result,
  })
  assert.deepEqual(result, { output: { operation: "write", target: path.join(directory, "README.md") } })
  rmSync(directory, { recursive: true, force: true })
})


test("retry hook backs off twice, then switches to the fallback once", async () => {
  reset()
  const directory = projectDir("retry")
  const { ctx, handlers } = fakeContext(directory)
  await registerHooks(ctx)
  const retry = handlers.session.retry
  const event = (attempt: number) => ({
    sessionID: "ses_main",
    agent: "reviewer",
    model: { providerID: "opencode-go", id: "deepseek-v4.1-flash" },
    error: { status: 429 },
    attempt,
    decision: { retry: false },
  })

  const first = event(1)
  await retry(first)
  assert.deepEqual(first.decision, { retry: true, delay: 500 })

  const third = event(3)
  await retry(third)
  assert.equal(handlers.switches.length, 1)
  assert.equal(handlers.switches[0].model.id, "glm-5.3-flash")
  assert.deepEqual(third.decision, { retry: true, delay: 0 })

  const fourth = event(4)
  await retry(fourth)
  assert.deepEqual(fourth.decision, { retry: false })
  assert.equal(handlers.switches.length, 1)
  rmSync(directory, { recursive: true, force: true })
})

test("five blocks remove write-capable tools for the rest of the turn", async () => {
  reset()
  const directory = projectDir("fiveblocks")
  const { ctx, handlers } = fakeContext(directory)
  await registerHooks(ctx)
  const before = handlers.tool["execute.before"]
  for (let i = 0; i < 5; i += 1) {
    await assert.rejects(
      before({
        tool: "write",
        sessionID: "ses_main",
        agent: "build",
        messageID: "m",
        id: `c${i}`,
        input: { path: path.join(directory, `a${i}.md`), content: `Results \u2014 final ${i}.` },
      }),
      /BLOCKED|stopped/,
    )
  }
  const event: any = {
    sessionID: "ses_main",
    agent: "build",
    system: [],
    messages: [],
    tools: { write: {}, edit: {}, shell: {}, read: {} },
  }
  await handlers.session.context(event)
  assert.equal(event.tools.write, undefined)
  assert.equal(event.tools.edit, undefined)
  assert.equal(event.tools.shell, undefined)
  assert.ok(event.tools.read)
  rmSync(directory, { recursive: true, force: true })
})
