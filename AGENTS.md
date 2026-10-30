# AGENTS.md — OpenSourced Project Directives

> **Scope:** Mandatory guidelines for all AI agents working within the `opensourced` repository.  
> **Core Mandate:** **Strict Minimalism**, **Absolute Grounding Integrity**, and **Zero Deceptive Implementation**.

---

## 1. The Principle of Strict Minimalism

1. **Implement ONLY What Was Explicitly Asked:**
   - Do NOT introduce unrequested features, "nice-to-have" enhancements, or speculative abstractions.
   - Do NOT install extra npm packages or dependencies without explicit user authorization.
   - If the task is to fix a bug in `agent.service.ts`, touch *only* `agent.service.ts`. Do not refactor adjacent modules.
2. **Surgical, Minimal Diffs:**
   - Prefer the smallest complete drop-in edit that achieves the user's objective.
   - Never rewrite an entire file or module when changing 5 lines achieves the outcome.
   - Respect and preserve existing working patterns (NestJS modules, SQLite strategies, SSE controllers).

---

## 2. Zero Deceptive Implementations (Anti-Fake Policy)

1. **Never Simulate Functionality:**
   - **STRICT PROHIBITION:** Never write fake `setTimeout` timers that pretend to process, transcribe, or recognize input (such as the previous simulated voice bar).
   - Never mock successful backend responses on the client to "make the demo look good."
   - If a feature is not implemented, leave it unimplemented or provide an honest, working affordance (e.g., a standard text input field where an external OS dictation tool like Wispr Flow inputs text directly).
2. **No Deceptive UI Indicators:**
   - Do not display animated pulses, fake loading rings, or synthetic progress states unless they reflect real underlying asynchronous operations or streaming SSE events.

---

## 3. Anti-Hallucination & Documentation Integrity

1. **Strict Code-to-Docs Truthfulness:**
   - Never claim an advanced algorithm, compiler API, or tool in documentation (e.g., *"Compiler-grade AST & Matrix Syntax Tree parsing"*) unless the exact parser libraries (Babel, Tree-sitter, etc.) actually exist and execute in the codebase.
   - If a feature uses GitHub Code Search and string path matching, describe it accurately as GitHub Code Search and Git Tree matching.
2. **Runtime Grounding:**
   - Always verify that file paths returned to the user exist in the target repository's Git Tree before rendering them as entrypoints or links.
   - Always defend against undefined model outputs: never assume an LLM JSON response conforms to an interface without defensive property checks.

---

## 4. Mandatory Third-Party & LLM Structured Logging Contract

1. **Third-Party API Tracing & Logging:**
   - **MUST-HAVE CONTRACT:** Every single outbound HTTP request to a third-party service (GitHub REST/GraphQL API, Google OAuth, Google Drive API, etc.) MUST be routed through or wrapped with `ThirdPartyHttpService` so that:
     - Outgoing requests (`THIRD_PARTY_REQUEST_OUTGOING`) and incoming responses (`THIRD_PARTY_RESPONSE_INCOMING`) are recorded as structured JSON in `app.log.json`.
     - Distributed trace IDs (`x-trace-id`) are automatically propagated across outbound headers.
   - **Zero Raw Leaks:** Credentials and secrets (API keys, client secrets, Bearer tokens, GitHub PATs, JWTs) MUST ALWAYS be deeply scrubbed and redacted before writing to log entries.
2. **LLM & Tool Call Structured Logging:**
   - **MUST-HAVE CONTRACT:** All LLM interactions (e.g. Gemini prompt generation, multi-turn reasoning loops, and MCP tool execution) MUST be logged in structured JSON:
     - Outgoing prompts, model configurations, and turn counts (`GEMINI_PROMPT_OUTGOING`).
     - Raw responses from the LLM including token/candidate metrics and function calls (`GEMINI_RESPONSE_INCOMING`).
     - Tool invocations with redacted parameters (`GEMINI_TOOL_CALL`).
     - Tool execution results returned back to the model (`GEMINI_TOOL_RESULT`).
   - Logging full interaction traces ensures complete post-execution auditability, performance profiling, and prompt optimization without sacrificing security.

---

## 5. Execution Protocol & Verification

1. **Inspect Before Modifying:**
   - Always read and understand the target file, component, or controller before making changes.
2. **Verify After Editing:**
   - After modifying code, run `npm run test` or `npm run build` to verify there are zero TypeScript compiler errors or test regressions.
3. **When Unsure, Ask — Never Assume:**
   - If requirements are ambiguous or offer multiple architectural forks, do not guess or unilaterally expand the scope. Ask the user directly.
