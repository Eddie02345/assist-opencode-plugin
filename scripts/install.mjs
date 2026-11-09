#!/usr/bin/env node
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync, copyFileSync } from "node:fs"
import path from "node:path"
import os from "node:os"
import { fileURLToPath } from "node:url"
import { createInterface } from "node:readline/promises"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const args = process.argv.slice(2)
const target = path.resolve(argument("--target", path.join(os.homedir(), ".config", "opencode")))
const force = args.includes("--force")
const dryRun = args.includes("--dry-run")
const assumeYes = args.includes("--yes") || args.includes("--non-interactive")
const allAgentsFlag = args.includes("--all-agents")
const modelFlag = argument("--model", "")
const suggested = [
  "deepseek/deepseek-flash",
  "opencode-go/muse-spark-1.3-contributor",
  "opencode-go/muse-spark-1.2-contributor",
  "opencode-go/iceman-contributor-free",
]

let model = modelFlag
let allAgents = allAgentsFlag

function argument(name, fallback) {
  const index = args.indexOf(name)
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback
}

function readdirSafe(directory) {
  try {
    return readdirSync(directory)
  } catch {
    return []
  }
}

function copy(source, destination) {
  if (!existsSync(source)) {
    console.log(`skip ${source} (missing)`)
    return
  }
  console.log(`${dryRun ? "would copy" : "copy"} ${path.relative(root, source)} -> ${destination}`)
  if (dryRun) return
  mkdirSync(path.dirname(destination), { recursive: true })
  cpSync(source, destination, { recursive: true, force: true })
}

function snapshot(entry, base = entry, files = {}) {
  const stat = statSync(entry)
  if (stat.isDirectory()) {
    for (const child of readdirSync(entry)) snapshot(path.join(entry, child), path.join(base, child), files)
  } else {
    files[path.relative(base, entry) || path.basename(entry)] = readFileSync(entry).toString("base64")
  }
  return files
}

function sameTree(left, right) {
  try {
    const a = snapshot(left)
    const b = snapshot(right)
    const keys = new Set([...Object.keys(a), ...Object.keys(b)])
    for (const key of keys) {
      if (a[key] !== b[key]) return false
    }
    return true
  } catch {
    return false
  }
}

function mergeChildren(source, destination) {
  if (!existsSync(source)) {
    console.log(`skip ${source} (missing)`)
    return
  }
  for (const entry of readdirSync(source)) {
    const from = path.join(source, entry)
    const to = path.join(destination, entry)
    if (existsSync(to) && sameTree(from, to)) {
      console.log(`unchanged ${path.relative(root, from)}`)
      continue
    }
    if (existsSync(to) && !force) {
      const backup = `${to}.bak-${new Date().toISOString().replace(/[:.]/g, "-")}`
      console.log(`${dryRun ? "would back up" : "back up"} ${to} -> ${backup}`)
      if (!dryRun) {
        renameSync(to, backup)
      }
    }
    console.log(`${dryRun ? "would copy" : "copy"} ${path.relative(root, from)} -> ${to}`)
    if (dryRun) continue
    mkdirSync(destination, { recursive: true })
    cpSync(from, to, { recursive: true, force: true })
  }
}

function stripJsonc(text) {
  let out = ""
  let inString = false
  let escape = false
  let lineComment = false
  let blockComment = false
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    const next = text[index + 1]
    if (lineComment) {
      if (char === "\n") {
        lineComment = false
        out += char
      }
      continue
    }
    if (blockComment) {
      if (char === "*" && next === "/") {
        blockComment = false
        index += 1
      }
      continue
    }
    if (inString) {
      out += char
      if (escape) escape = false
      else if (char === "\\") escape = true
      else if (char === '"') inString = false
      continue
    }
    if (char === '"') {
      inString = true
      out += char
      continue
    }
    if (char === "/" && next === "/") {
      lineComment = true
      index += 1
      continue
    }
    if (char === "/" && next === "*") {
      blockComment = true
      index += 1
      continue
    }
    out += char
  }
  return out.replace(/,\s*([}\]])/g, "$1")
}

function readConfig() {
  const json = path.join(target, "opencode.json")
  const jsonc = path.join(target, "opencode.jsonc")
  const file = existsSync(jsonc) ? jsonc : existsSync(json) ? json : null
  if (!file) return { file: json, data: {}, jsonc: false }
  const text = readFileSync(file, "utf8")
  try {
    return { file, data: JSON.parse(file.endsWith(".jsonc") ? stripJsonc(text) : text), jsonc: file.endsWith(".jsonc") }
  } catch (error) {
    console.error(`could not parse ${file}: ${error.message}`)
    process.exitCode = 1
    return { file, data: {}, jsonc: file.endsWith(".jsonc") }
  }
}

function writeConfig(config, updates) {
  const merged = { ...config.data, ...updates }
  if (!config.file) return
  if (!dryRun && existsSync(config.file)) {
    const backup = `${config.file}.bak-${new Date().toISOString().replace(/[:.]/g, "-")}`
    console.log(`back up ${config.file} -> ${backup}`)
    copyFileSync(config.file, backup)
  }
  if (!dryRun) {
    mkdirSync(path.dirname(config.file), { recursive: true })
    writeFileSync(config.file, JSON.stringify(merged, null, 2) + "\n")
  }
}

async function chooseModel() {
  if (model || assumeYes || !process.stdin.isTTY) {
    model = model || suggested[0]
    return
  }
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  try {
    console.log("Choose the default model for the main agent:\n")
    suggested.forEach((entry, index) => console.log(`  ${index + 1}) ${entry}`))
    console.log(`  ${suggested.length + 1}) type another model ID`)
    const choice = (await rl.question(`\nChoice [1]: `)).trim() || "1"
    if (choice === String(suggested.length + 1)) {
      model = (await rl.question("Model ID (provider/model): ")).trim()
    } else {
      const index = Number(choice) - 1
      model = suggested[index] ?? suggested[0]
    }
    if (!model) model = suggested[0]

    const useAll = (await rl.question(`\nUse ${model} for all 16 agents too? [y/N]: `)).trim().toLowerCase()
    allAgents = allAgentsFlag || useAll === "y" || useAll === "yes"
  } finally {
    rl.close()
  }
}

await chooseModel()
console.log(`\nDefault model: ${model}`)
console.log(`Agent pins: ${allAgents ? "all agents use the default" : "tiered pins are kept"}\n`)

copy(path.join(root, "src"), path.join(target, "assist", "src"))
copy(path.join(root, "plugins", "assist-plugin"), path.join(target, "assist", "plugins", "assist-plugin"))
copy(path.join(root, "config"), path.join(target, "assist", "config"))

if (allAgents) {
  const sourceAgents = path.join(root, ".opencode", "agents")
  const destinationAgents = path.join(target, "agents")
  for (const entry of readdirSafe(sourceAgents)) {
    if (!entry.endsWith(".md")) continue
    const from = path.join(sourceAgents, entry)
    const to = path.join(destinationAgents, entry)
    console.log(`${dryRun ? "would copy" : "copy"} agent ${entry} with model ${model}`)
    if (dryRun) continue
    mkdirSync(path.dirname(to), { recursive: true })
    writeFileSync(to, readFileSync(from, "utf8").replace(/^model: .*$/m, `model: ${model}`))
  }
  const modelsFile = path.join(target, "assist", "config", "models.json")
  if (!dryRun) {
    mkdirSync(path.dirname(modelsFile), { recursive: true })
    writeFileSync(
      modelsFile,
      JSON.stringify({ tiers: { haiku: model, sonnet: model, opus: model } }, null, 2) + "\n",
    )
  }
} else {
  mergeChildren(path.join(root, ".opencode", "agents"), path.join(target, "agents"))
}

mergeChildren(path.join(root, ".opencode", "skills"), path.join(target, "skills"))
mergeChildren(path.join(root, ".opencode", "commands"), path.join(target, "commands"))

const entry = path.join(target, "plugins", "assist", "index.ts")
const entrySource = 'export { default } from "../../assist/src/index.ts"\n'
console.log(`${dryRun ? "would write" : "write"} ${entry}`)
if (!dryRun) {
  mkdirSync(path.dirname(entry), { recursive: true })
  writeFileSync(entry, entrySource)
}

const config = readConfig()
const plugins = new Set(Array.isArray(config.data.plugins) ? config.data.plugins : [])
plugins.add("./plugins/assist")
const agents = { ...(config.data.agents ?? {}) }
agents.general = { ...(agents.general ?? {}), model }
const existingInstructions = Array.isArray(config.data.instructions)
  ? config.data.instructions
  : typeof config.data.instructions === "string"
    ? [config.data.instructions]
    : []
const instructions = new Set(existingInstructions)
instructions.add(path.join(target, "assist", "plugins", "assist-plugin", "rules", "writing-standard-compact.md"))
const compaction = config.data.compaction ?? { auto: true, keep: { tokens: 120000 }, buffer: "10%" }
writeConfig(config, { model, plugins: [...plugins], agents, instructions: [...instructions], compaction })

console.log(`\nInstalled to ${target}`)
console.log("OpenCode reloads plugins on save. Use /reload if a command does not appear.")
