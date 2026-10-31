# OpenSourced 🚀

> **Ambient, Context-Aware Open-Source Onboarding & Issue Entrypoint Engine**  
> Built for the WeMakeDevs x Wispr Flow "No Hands" Hackathon Challenge.

---

## 📖 GitHub App Overview & Listing Documentation

Looking for the complete user-facing GitHub App description, feature walkthrough, and permissions guide?  
👉 **Read the official GitHub App documentation in [GITHUB_APP.md](file:///Users/virattripathi/myprojects/opensourced/GITHUB_APP.md).**

---

## 🌟 Highlights

- **Zero-Copy Context:** Automatically reads GitHub issue and PR telemetry from the active browser tab.
- **AST & Matrix Syntax Tree Precision:** Pinpoints exact files, line spans, and exported interfaces without LLM hallucinations.
- **1-Click & Voice Git Clone:** Uses native OS folder dialogs to clone repositories and launches VS Code (`vscode://file/...`) with live SSE progress.
- **Security Checks:** Identifies security risks (injections, credential leaks, unsafe scripts) before any code is modified.
- **Wispr Flow "No Hands" Voice Integration:** Speech-triggered actions and real-time prompt dictation.
- **Strategy Pattern AI Core:** Google Gemini 2.5 Flash with native function calling via HTTPS REST tools.

---

## 🏗️ Repository Architecture

OpenSourced is structured as a Turbo monorepo:

```
opensourced/
├── apps/
│   ├── backend/       # NestJS orchestrator, GitHub App auth, SSE streaming, Gemini strategy
│   └── extension/     # Chrome MV3 Side Panel (React 18 + Tailwind + Wispr Flow)
├── packages/
│   └── common/        # Shared TypeScript contracts, DTOs, and interfaces
├── docs/              # System architecture, PRDs, and API specs
└── GITHUB_APP.md      # Public GitHub App markdown & marketplace profile
```

For developer architecture and setup instructions, see [`docs/internal/architecture.md`](file:///Users/virattripathi/myprojects/opensourced/docs/internal/architecture.md) and [`docs/internal/requirement.md`](file:///Users/virattripathi/myprojects/opensourced/docs/internal/requirement.md).

---

## 🛠️ Quick Start

```bash
# 1. Install dependencies across the monorepo
npm install

# 2. Run test suites
npm run test

# 3. Start development servers
npm run dev
```
