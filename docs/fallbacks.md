# Fallbacks

OpenCode V2 has no native `fallback` key in the config schema. The table below is
implemented in the `retry` session hook in `src/hooks.ts`.

| From | Fallback |
|---|---|
| `opencode-go/deepseek-v4.1-flash` | `opencode-go/glm-5.3-flash` |
| `opencode-go/glm-5.3-flash` | `opencode-go/deepseek-v4.1-flash` |
| `opencode-go/gpt-6-luna` | `opencode-go/glm-5.3-flash` |

On status 429 or any 5xx, the hook allows two retries with backoff, then switches the
session model to the fallback once. A second fallback in the same session stops the
retry. Iceman Contributor Free is never used.
