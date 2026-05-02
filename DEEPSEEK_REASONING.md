# DeepSeek `reasoning_content` handling — debugging notes

## TL;DR

DeepSeek has **two contradictory rules** for `reasoning_content` on prior
assistant turns, depending on which model you're talking to:

| Model | Rule for prior assistant turns | Symptom on violation |
| --- | --- | --- |
| `deepseek-reasoner` (api.deepseek.com) | **strip** `reasoning_content` | HTTP 400 |
| DeepSeek V4 thinking (e.g. `deepseek-v4-pro`) | **always emit** `reasoning_content`, even empty | "The `reasoning_content` in the thinking mode must be passed back to the API." |

If you blindly do one rule for both models, the other model breaks. The fix
in this fork (commit `498991ece`) splits the logic by model.

## Where the rule is implemented

`packages/opencode/src/provider/transform.ts`, inside `normalizeMessages`:

1. **`deepseek-reasoner` strip path** — early-returns with all `reasoning`
   parts removed from each assistant message's `content`. The AI SDK
   (`@ai-sdk/openai-compatible`) auto-emits `reasoning_content` from
   `reasoning` parts in `content`, so stripping the parts is what actually
   prevents the field from appearing on the wire. We do **not** rely on
   `model.capabilities.interleaved.field` for this — the snapshot has it
   set, but the public docs say not to send it. We override the snapshot.

2. **Other DeepSeek variants (interleaved round-trip)** — collects all
   `reasoning` parts into a string, strips them from `content`, and writes
   the string to `providerOptions.openaiCompatible.reasoning_content`.
   The SDK spreads that into the assistant message body
   (`node_modules/.../@ai-sdk/openai-compatible/dist/index.js`, function
   `convertToOpenAICompatibleChatMessages`, `case "assistant"` block).
   The field is set **even when empty** — V4 thinking mode rejects
   requests that drop it.

## Authoritative reference

- DeepSeek docs (covers `deepseek-reasoner` only):
  https://api-docs.deepseek.com/guides/reasoning_model
  Verbatim:
  > "In the next round of the conversation, the CoT from previous rounds
  > is not concatenated into the context"
  > "if the `reasoning_content` field is included in the sequence of input
  > messages, the API will return a `400` error"

- Upstream patch that established the V4 thinking-mode preservation rule:
  `923af96d2 fix: preserve empty reasoning_content for DeepSeek V4
  thinking mode (#24146)` — sst/anomalyco opencode `dev` branch.

## How to diagnose recurrence

We log every model call's post-transform payload at INFO level so you can
inspect the exact wire shape after a failure.

**Log location:**
`~/.local/share/opencode/log/<timestamp>.log` (XDG_DATA_HOME). The last
~10 files are kept; older rotate out.

**The log line you want:**
Search for `provider request` — emitted from
`packages/opencode/src/session/llm.ts` inside the `transformParams`
middleware, *after* `ProviderTransform.message` has run. Each line
includes `providerID`, `modelID` (the api id, e.g. `deepseek-v4-pro`),
`npm`, `messageCount`, and `prompt` (the full message array, JSON).

```sh
# Most recent log file
LOG=$(ls -t ~/.local/share/opencode/log/*.log | head -1)

# All provider requests in that file
grep "provider request" "$LOG"

# Filter to one session (each line is tagged with session.id=...)
grep "session.id=<sessionID>" "$LOG" | grep "provider request"

# Last call before a failure
grep "provider request" "$LOG" | tail -1
```

**What to look for inside `prompt=[...]`:**
- For each `assistant` message:
  - `content` should NOT contain `{type:"reasoning",...}` parts (we
    strip them before sending — they're round-tripped via
    `providerOptions` for V4, or fully removed for `deepseek-reasoner`).
  - `providerOptions.openaiCompatible.reasoning_content` — for V4
    thinking variants this should be **present on every assistant
    message** (string, possibly empty `""`). If it's missing on any
    assistant message and the model is V4 thinking, that's the bug.
  - For `deepseek-reasoner`: `reasoning_content` should be **absent**
    from every message; if it's present, that's the bug.

## Adjacent failure modes (not strictly this bug, but easy to confuse)

1. **Whole assistant turn dropped from history.** See
   `packages/opencode/src/session/message-v2.ts:833-841` — an assistant
   message with a non-abort error gets skipped on reconstruction, and an
   aborted message that produced only `step-start`/`reasoning` parts
   (no text or tool calls) is also skipped. If your failing run hit
   this, the prior turn's reasoning is gone from history because the
   whole turn is gone, not because reasoning was specifically stripped.

2. **Reasoning streamed but not persisted before crash.** Reasoning is
   written to disk via `processor.ts:222–253` as each `reasoning-delta`
   event arrives (`session.updatePart`). A hard crash mid-delta could in
   theory leave a partial state, but normal abort/escape preserves
   what's already streamed.

## If the docs / model behavior change

The strip rule is keyed off `providerID === "deepseek" && api.id ===
"deepseek-reasoner"`. If DeepSeek introduces another model that follows
the public-docs rule (strip), add it to that branch. If a third-party
host that serves `deepseek-reasoner` has different rules, scope the
check to `model.api.url` instead of `providerID`.

## Related commits in this fork

- `e9db783a3` original transform fix (later superseded)
- `34a3b9910` FORK.md
- `561ec87a3` initial deepseek request log
- `498991ece` model-aware split + widened request log to all providers
