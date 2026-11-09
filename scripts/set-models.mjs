#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const routing = JSON.parse(readFileSync(path.join(root, "config", "models.json"), "utf8"))
const agents = JSON.parse(readFileSync(path.join(root, "config", "agents.json"), "utf8"))

for (const [agent, model] of Object.entries(agents)) {
  const file = path.join(root, ".opencode", "agents", `${agent}.md`)
  const text = readFileSync(file, "utf8")
  const next = text.replace(/^model: .*$/m, `model: ${model}`)
  writeFileSync(file, next)
  console.log(`${agent}: ${model}`)
}

const configFile = path.join(root, "opencode.json")
const config = JSON.parse(readFileSync(configFile, "utf8"))
config.model = routing.main
config.agents = { ...(config.agents ?? {}), general: { ...(config.agents?.general ?? {}), model: routing.general } }
writeFileSync(configFile, JSON.stringify(config, null, 2) + "\n")
console.log(`main: ${routing.main}`)
console.log(`general: ${routing.general}`)
