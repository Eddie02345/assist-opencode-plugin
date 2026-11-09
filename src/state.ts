export const state = {
  childSessions: new Set<string>(),
  sessionAgent: new Map<string, string>(),
  sessionParent: new Map<string, string>(),
  resolved: new Map<string, boolean>(),
  warnings: [] as string[],
}

export function note(message: string) {
  const text = `[assist-plugin] ${message}`
  state.warnings.push(text)
  if (state.warnings.length > 50) state.warnings.shift()
  console.error(text)
}

export async function isSubagent(ctx: any, sessionID: string, agent: string): Promise<boolean> {
  if (state.childSessions.has(sessionID)) return true
  if (state.resolved.has(sessionID)) return state.resolved.get(sessionID) === true
  try {
    const session = await ctx.session.get({ sessionID })
    const parent = session?.parentID ?? session?.data?.parentID
    if (parent) {
      state.childSessions.add(sessionID)
      state.sessionParent.set(sessionID, parent)
    }
    state.resolved.set(sessionID, Boolean(parent))
    return Boolean(parent)
  } catch {
    const known = state.sessionAgent.get(sessionID)
    const child = known !== undefined && known === agent && agent !== "build" && agent !== "plan"
    state.resolved.set(sessionID, child)
    return child
  }
}
