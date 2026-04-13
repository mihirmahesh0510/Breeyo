# Claude Code Configuration - RuFlo V3

## Behavioral Rules (Always Enforced)

- Do what has been asked; nothing more, nothing less
- NEVER create files unless they're absolutely necessary for achieving your goal
- ALWAYS prefer editing an existing file to creating a new one
- NEVER proactively create documentation files (*.md) or README files unless explicitly requested
- NEVER save working files, text/mds, or tests to the root folder
- Never continuously check status after spawning a swarm — wait for results
- ALWAYS read a file before editing it
- NEVER commit secrets, credentials, or .env files

## File Organization

- NEVER save to root folder — use the directories below
- Use `/src` for source code files
- Use `/tests` for test files
- Use `/docs` for documentation and markdown files
- Use `/config` for configuration files
- Use `/scripts` for utility scripts
- Use `/examples` for example code

## Project Architecture

- Follow Domain-Driven Design with bounded contexts
- Keep files under 500 lines
- Use typed interfaces for all public APIs
- Prefer TDD London School (mock-first) for new code
- Use event sourcing for state changes
- Ensure input validation at system boundaries

### Project Config

- **Topology**: hierarchical-mesh
- **Max Agents**: 15
- **Memory**: hybrid
- **HNSW**: Enabled
- **Neural**: Enabled

## Build & Test

```bash
# Build
npm run build

# Test
npm test

# Lint
npm run lint
```

- ALWAYS run tests after making code changes
- ALWAYS verify build succeeds before committing

## Security Rules

- NEVER hardcode API keys, secrets, or credentials in source files
- NEVER commit .env files or any file containing secrets
- Always validate user input at system boundaries
- Always sanitize file paths to prevent directory traversal
- Run `npx @claude-flow/cli@latest security scan` after security-related changes

## Concurrency: 1 MESSAGE = ALL RELATED OPERATIONS

- All operations MUST be concurrent/parallel in a single message
- Use Claude Code's Agent tool for spawning agents, not just MCP
- ALWAYS spawn ALL agents in ONE message with full instructions via Agent tool
- ALWAYS batch ALL file reads/writes/edits in ONE message
- ALWAYS batch ALL Bash commands in ONE message

## Swarm Orchestration

- MUST initialize the swarm using CLI tools when starting complex tasks
- MUST spawn concurrent agents using Claude Code's Agent tool
- Never use CLI tools alone for execution — Agent tool agents do the actual work
- MUST call CLI tools AND Agent tool in ONE message for complex work

### 3-Tier Model Routing (ADR-026)

| Tier | Handler | Latency | Cost | Use Cases |
|------|---------|---------|------|-----------|
| **1** | Agent Booster (WASM) | <1ms | $0 | Simple transforms (var→const, add types) — Skip LLM |
| **2** | Haiku | ~500ms | $0.0002 | Simple tasks, low complexity (<30%) |
| **3** | Sonnet/Opus | 2-5s | $0.003-0.015 | Complex reasoning, architecture, security (>30%) |

- For Tier 1 simple transforms, use Edit tool directly — no LLM agent needed

## Swarm Configuration & Anti-Drift

- ALWAYS use hierarchical topology for coding swarms
- Keep maxAgents at 6-8 for tight coordination
- Use specialized strategy for clear role boundaries
- Use `raft` consensus for hive-mind (leader maintains authoritative state)
- Run frequent checkpoints via `post-task` hooks
- Keep shared memory namespace for all agents

```bash
npx @claude-flow/cli@latest swarm init --topology hierarchical --max-agents 8 --strategy specialized
```

## Swarm Execution Rules

- ALWAYS use `run_in_background: true` for all Agent tool calls
- ALWAYS put ALL Agent calls in ONE message for parallel execution
- After spawning, STOP — do NOT add more tool calls or check status
- Never poll agent status repeatedly — trust agents to return
- When agent results arrive, review ALL results before proceeding

## V3 CLI Commands

### Core Commands

| Command | Subcommands | Description |
|---------|-------------|-------------|
| `init` | 4 | Project initialization |
| `agent` | 8 | Agent lifecycle management |
| `swarm` | 6 | Multi-agent swarm coordination |
| `memory` | 11 | AgentDB memory with HNSW search |
| `task` | 6 | Task creation and lifecycle |
| `session` | 7 | Session state management |
| `hooks` | 17 | Self-learning hooks + 12 workers |
| `hive-mind` | 6 | Byzantine fault-tolerant consensus |

### Quick CLI Examples

```bash
npx @claude-flow/cli@latest init --wizard
npx @claude-flow/cli@latest agent spawn -t coder --name my-coder
npx @claude-flow/cli@latest swarm init --v3-mode
npx @claude-flow/cli@latest memory search --query "authentication patterns"
npx @claude-flow/cli@latest doctor --fix
```

## Available Agents (16 Roles + Custom)

### Core Development
`coder`, `reviewer`, `tester`, `planner`, `researcher`

### Specialized
`security-architect`, `security-auditor`, `memory-specialist`, `performance-engineer`

### Coordination
`hierarchical-coordinator`, `mesh-coordinator`, `adaptive-coordinator`

### GitHub & Repository
`pr-manager`, `code-review-swarm`, `issue-tracker`, `release-manager`

Any string can be used as a custom agent type — these are the typed roles with specialized behavior.

## Memory & Vector Search

### MCP Tools (use via ToolSearch to discover)

| Tool | Description |
|------|-------------|
| `memory_store` | Store value with ONNX 384-dim vector embedding |
| `memory_search` | Semantic vector search by query |
| `memory_retrieve` | Get entry by key |
| `memory_list` | List entries in namespace |
| `memory_delete` | Delete entry |
| `memory_import_claude` | Import Claude Code memories into AgentDB (allProjects=true for all) |
| `memory_search_unified` | Search across ALL namespaces (Claude + AgentDB + patterns) |
| `memory_bridge_status` | Show bridge health, vectors, SONA, intelligence |

### CLI Commands

```bash
# Store with vector embedding
npx @claude-flow/cli@latest memory store --key "pattern-auth" --value "JWT with refresh" --namespace patterns

# Semantic search
npx @claude-flow/cli@latest memory search --query "authentication patterns"

# Import all Claude Code memories into AgentDB
node .claude/helpers/auto-memory-hook.mjs import-all
```

### Claude Code ↔ AgentDB Bridge

Claude Code auto-memory files (`~/.claude/projects/*/memory/*.md`) are automatically imported into AgentDB with ONNX vector embeddings on session start. Use `memory_search_unified` to search across both stores.

## Key MCP Tools (314 available — use ToolSearch to discover)

### Most Used Tools

| Category | Tools | What They Do |
|----------|-------|-------------|
| **Memory** | `memory_store`, `memory_search`, `memory_search_unified` | Store/search with ONNX vector embeddings |
| **Claude Bridge** | `memory_import_claude`, `memory_bridge_status` | Import Claude memories into AgentDB |
| **Swarm** | `swarm_init`, `swarm_status`, `swarm_health` | Multi-agent coordination |
| **Agents** | `agent_spawn`, `agent_list`, `agent_status` | Agent lifecycle |
| **Hive-Mind** | `hive-mind_init`, `hive-mind_spawn`, `hive-mind_consensus` | Byzantine/Raft consensus |
| **Hooks** | `hooks_route`, `hooks_session-start`, `hooks_post-task` | Task routing + learning |
| **Workers** | `hooks_worker-list`, `hooks_worker-dispatch` | 12 background workers |
| **Security** | `aidefence_scan`, `aidefence_is_safe` | Prompt injection detection |
| **Intelligence** | `hooks_intelligence`, `neural_status` | Pattern learning + SONA |

### Swarm Capabilities

- **Topologies**: hierarchical (anti-drift), mesh, ring, star, adaptive
- **Consensus**: Raft (leader-based), Byzantine (PBFT), Gossip (eventual)
- **Hive-Mind**: Queen-led coordination with spawn, broadcast, consensus voting, shared memory
- **12 Background Workers**: audit, optimize, testgaps, map, deepdive, document, refactor, benchmark, ultralearn, consolidate, predict, preload

### Memory Capabilities

- **ONNX Embeddings**: all-MiniLM-L6-v2, 384 dimensions — real neural vectors
- **DiskANN**: SSD-friendly vector search (8,000x faster insert than HNSW, perfect recall at 1K)
- **sql.js**: Cross-platform SQLite (WASM, no native compilation)
- **Claude Code Bridge**: Auto-imports MEMORY.md files into AgentDB on session start
- **Unified Search**: `memory_search_unified` searches Claude memories + AgentDB + patterns
- **SONA Learning**: Trajectory recording → pattern extraction → file persistence

### How to Discover Tools

Use ToolSearch to find specific tools:
```
ToolSearch("memory search")     → memory_store, memory_search, memory_search_unified
ToolSearch("swarm")             → swarm_init, swarm_status, swarm_health, swarm_shutdown
ToolSearch("hive consensus")    → hive-mind_consensus, hive-mind_status
ToolSearch("+aidefence")        → aidefence_scan, aidefence_is_safe, aidefence_has_pii
```

## Quick Setup

```bash
claude mcp add claude-flow -- npx -y @claude-flow/cli@latest
npx @claude-flow/cli@latest daemon start
npx @claude-flow/cli@latest doctor --fix
```

## Claude Code vs MCP Tools

- **Claude Code Agent tool** handles execution: agents, file ops, code generation, git
- **MCP tools** (via ToolSearch) handle coordination: swarm, memory, hooks, routing, hive-mind
- **CLI commands** (via Bash) are the same tools with terminal output
- Use `ToolSearch("keyword")` to discover available MCP tools

## Support

- Documentation: https://github.com/ruvnet/ruflo
- Issues: https://github.com/ruvnet/ruflo/issues

<!-- GSD:project-start source:PROJECT.md -->
## Project

**Breeyo**

A mobile-first, cloud-based veterinary practice management platform for Indian vet clinics. Breeyo combines appointment booking, electronic medical records (EMR), inventory management, and invoicing into a single system — with WhatsApp as the primary pet owner communication channel and AI-assisted data capture for vets. The immediate target is solo veterinarians (1-2 staff, 15-25 patients/day) in metro and Tier 1/2 cities.

**Core Value:** Solo vets can manage their entire practice — walk-ins, medical records, inventory, and billing — from their phone without spending time on admin work.

### Constraints

- **WhatsApp API**: Not yet approved — all WhatsApp features built against simulator/mock until Meta Business verification completes
- **Price sensitivity**: Monthly subscription must stay within ₹999-₹3,000 range — architecture must be cost-efficient to operate
- **Data residency**: All data must be stored in India-region data centers (AWS Mumbai / Azure India)
- **Mobile-first**: Must work well on mid-range Android smartphones (Android 8+) — this is the primary device for solo vets
- **Offline support**: Core scanning and data entry must work offline with auto-sync on reconnect
- **GST compliance**: Invoicing must generate GST-compliant invoices with input/output tax tracking
- **Localization**: English and Hindi at launch
- **Digital literacy**: UI must be intuitive enough for semi-urban practitioners with limited software experience
- **Walk-in coexistence**: Appointment system must never conflict with or impede walk-in patient flow
<!-- GSD:project-end -->

<!-- GSD:stack-start source:research/STACK.md -->
## Technology Stack

## Recommended Stack
### Core Technologies
| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| React Native (Expo) | SDK 52+ | Mobile app (iOS + Android) | Single codebase for both platforms; Expo simplifies OTA updates, push notifications, and camera/barcode access. Large ecosystem for India-market apps. Solo vets need Android-first — React Native handles mid-range Android 8+ well |
| Next.js | 15+ | Web dashboard (admin/analytics) | SSR for fast load on Indian networks; App Router for file-based routing; shared React component library with mobile. Vercel or self-hosted on AWS Mumbai |
| Node.js + Express/Fastify | 22 LTS | API server | JavaScript across full stack reduces context-switching; excellent async I/O for real-time queue updates; large talent pool in India |
| PostgreSQL | 16+ | Primary database | ACID compliance critical for medical records and billing; JSONB for flexible clinical data schemas; proven at scale for multi-tenant SaaS |
| Redis | 7+ | Caching + real-time | Walk-in queue real-time updates; session storage; appointment slot locking; pub/sub for multi-device sync |
| TypeScript | 5.5+ | Type safety across stack | Shared types between API, web, and mobile; catches errors early in medical/billing domain where correctness matters |
### Supporting Libraries
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Prisma | 6+ | ORM / database client | Type-safe queries for PostgreSQL; migration management; works well with TypeScript |
| React Query (TanStack) | 5+ | Server state management | API data fetching/caching for both web and mobile; offline support with persistence |
| Zustand | 5+ | Client state management | Lightweight, performant state for walk-in queue UI, form state; simpler than Redux for this scale |
| Socket.IO | 4+ | Real-time communication | Walk-in queue live updates; multi-device calendar sync; appointment status changes |
| react-native-camera / expo-camera | Latest | Barcode scanning | Inventory barcode scanning on mobile; offline-capable |
| i18next | 24+ | Internationalization | English + Hindi localization from launch; RTL-ready for future languages |
| date-fns | 4+ | Date/time handling | IST timezone handling; appointment scheduling; expiry date calculations |
| zod | 3+ | Schema validation | Shared validation between client and server; API input validation; form validation |
| Bull/BullMQ | 5+ | Job queues | WhatsApp message scheduling; reminder cron jobs; invoice generation; background processing |
| Razorpay SDK | Latest | Payment gateway | India-native; supports UPI, cards, wallets; webhook-based confirmation |
### Development Tools
| Tool | Purpose | Notes |
|------|---------|-------|
| Expo EAS | Build & deploy mobile | Cloud builds for iOS/Android; OTA updates for bug fixes without app store review |
| Docker + Docker Compose | Local development | Consistent dev environment; PostgreSQL + Redis containers |
| Vitest | Unit/integration testing | Fast, TypeScript-native; compatible with React Testing Library |
| Detox or Maestro | Mobile E2E testing | Test critical flows: walk-in checkin, barcode scan, invoice generation |
| ESLint + Prettier | Code quality | Consistent formatting; catch common errors |
| GitHub Actions | CI/CD | Auto-test, build, deploy on push; mobile builds via EAS |
## Installation
# Monorepo setup (Turborepo)
# Mobile (Expo)
# Web (Next.js)
# API (Node.js)
# Shared packages
# Dev dependencies
## Alternatives Considered
| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| React Native (Expo) | Flutter | If team has Dart experience; slightly better Android perf on very low-end devices; less JS ecosystem integration |
| PostgreSQL | MongoDB | If clinical data schema is highly unpredictable; NOT recommended — medical records need ACID and relational integrity |
| Next.js | Remix | If streaming SSR is critical; Next.js has larger ecosystem and better Vercel deployment |
| Fastify | Express | If team prefers Express familiarity; Fastify is faster out of the box with schema validation |
| Prisma | Drizzle | If raw SQL performance is critical; Drizzle is lighter but less mature migration tooling |
| Turborepo | Nx | If project grows to 20+ packages; Nx has more features but steeper learning curve |
| Redis | Upstash | If serverless deployment; Upstash provides HTTP-based Redis for edge functions |
## What NOT to Use
| Avoid | Why | Use Instead |
|-------|-----|-------------|
| Firebase/Firestore | Data residency concerns (no India region guarantee); vendor lock-in; poor for relational medical data | PostgreSQL on AWS Mumbai |
| GraphQL (for initial build) | Over-engineering for a Beta with 20 clinics; adds complexity without clear benefit at this scale | REST API with well-typed endpoints; add GraphQL in v2 if needed |
| Electron for desktop | Solo vets don't use desktops; web dashboard sufficient for admin | Next.js web app |
| Native iOS/Android | Two codebases doubles dev cost and time; vet market is Android-dominant in India | React Native with Expo |
| MySQL | PostgreSQL's JSONB is critical for flexible clinical data; better support for complex queries | PostgreSQL |
| Tailwind UI for mobile | React Native doesn't support Tailwind natively (NativeWind exists but adds complexity) | React Native Paper or Tamagui for mobile; Tailwind for web |
| Microservices | Over-engineering for Beta; monolith is faster to build and debug at 20-clinic scale | Modular monolith with clear bounded contexts |
## Stack Patterns by Variant
- Use WatermelonDB for local SQLite on mobile
- Sync via background jobs when connectivity returns
- Conflict resolution: last-write-wins for most fields; merge for appointment queues
- Use official WhatsApp Business API via cloud provider (Gupshup, Twilio, or direct Meta)
- Webhook-based inbound message handling
- Template messages for reminders/invoices (pre-approved by Meta)
- Move to multi-tenant PostgreSQL with row-level security (RLS)
- Add connection pooling (PgBouncer)
- Consider read replicas for analytics queries
## Version Compatibility
| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| Expo SDK 52 | React Native 0.76+ | Use Expo's managed workflow for simplest setup |
| Prisma 6 | PostgreSQL 14-16 | Use PostgreSQL 16 for latest performance improvements |
| Next.js 15 | React 19 | Use React 19 for concurrent features |
| React Native 0.76+ | React 19 | New Architecture enabled by default |
| Socket.IO 4 | Node.js 18+ | Use with Redis adapter for horizontal scaling |
| BullMQ 5 | Redis 6.2+ | Requires Redis Streams support |
## Sources
- Domain knowledge: veterinary PMS architecture patterns
- India SaaS deployment patterns (AWS Mumbai region)
- React Native/Expo ecosystem experience
- Razorpay integration patterns for Indian payments
- Confidence: MEDIUM — no live web verification of latest versions performed
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions

Conventions not yet established. Will populate as patterns emerge during development.
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
## Architecture

Architecture not yet mapped. Follow existing patterns found in the codebase.
<!-- GSD:architecture-end -->

<!-- GSD:workflow-start source:GSD defaults -->
## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd:quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd:debug` for investigation and bug fixing
- `/gsd:execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->

<!-- GSD:profile-start -->
## Developer Profile

> Profile not yet configured. Run `/gsd:profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
