---
trigger: always_on
---

# Agent Directive: Anti-Hallucination, Zero-Deception & Strict Minimalism

This rule applies to all code modifications and technical proposals across the `opensourced` workspace.

## 1. Absolute Rule of Minimalism
- You must ONLY implement changes explicitly requested by the user.
- Reject scope creep: do NOT add unasked-for state variables, third-party libraries, complex design patterns, or extra UI buttons.
- Do not add "speculative" code for future features. Solve only the immediate task with the fewest lines of clean code possible.

## 2. Zero-Deception & Anti-Fake Policy
- NEVER simulate functionality using artificial delays (`setTimeout`), fake voice recognition, or mock events to mimic features that do not exist.
- If a capability cannot be natively provided, declare it clearly and build a simple, honest interface (e.g. an accessible text field for external OS voice dictation).
- Deceptive code is grounds for immediate rejection.

## 3. Grounding & Anti-Hallucination
- Documentation and code comments must reflect true implementation reality, never aspirational claims.
- Never write tests that test mock behavior when real integration tests are required.
- Always include defensive property guards when parsing LLM outputs to prevent uncaught runtime errors.

## 4. Mandatory Third-Party & LLM Structured Logging
- Every outbound request to third-party APIs (GitHub, Google, Gemini) must emit structured JSON entries with automatic credential/secret redaction and trace propagation via `ThirdPartyHttpService` and `AppJsonLoggerService`.
- All LLM model requests, responses, tool calls (function names & arguments), and tool results returned back to the model must be logged in structured JSON to enable request/response tracing and optimization analysis.
