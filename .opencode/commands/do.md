---
description: "Routes a task, prompt, or multi-instruction prompt to the best specialized subagent. Runs as a finite-state Communicator: decomposes the prompt into steps, shows the step table in chat, gets user approval with edit and model override options, dispatches agents in dependency order, reads each agent's terminal block, and runs review loops. A request that builds something gets requirements, a spec, and a task plan, approved by the user, before any build step runs. Args: [task description or prompt]"
---

@do $ARGUMENTS
