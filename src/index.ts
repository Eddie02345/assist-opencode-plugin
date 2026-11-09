import { Plugin } from "@opencode/plugin"
import { prepareEnvironment } from "./legacy.ts"
import { registerHooks } from "./hooks.ts"

export default Plugin.define({
  id: "assist",
  async setup(ctx) {
    prepareEnvironment(ctx.location.directory)
    const registration = await registerHooks(ctx)
    return registration.cleanup
  },
})
