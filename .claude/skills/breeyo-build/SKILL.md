# Breeyo Build Skill

Project-specific phase workflow for the Breeyo veterinary clinic management platform.
Three modes: review phase plans, build phase code, verify phase implementation.

## Workflow Detail

### Mode 1: `breeyo-build --review`

**Step 1:** Load all phase docs

**Step 2:** Superpowers reviews the plan for:
- Product gaps (user flows that aren't specified)
- Edge cases (what happens when X fails?)
- Missing acceptance criteria
- Contradictions between decisions
- Requirements that have no corresponding plan task

**Step 3:** For each gap found, ask the USER a PRODUCT question:
- "When a walk-in arrives but the queue is full, what should the vet see?"
- "If an owner declines data consent, should they still get invoice PDFs?"
- NOT: "Should we use WebSocket or SSE for real-time updates?"

**Step 4:** Record answers as new D-XX decisions in CONTEXT.md

**Step 5:** Report: "Phase N plan review complete. N gaps found, N resolved."

### Mode 2: `breeyo-build --build`

**Step 1:** Load phase docs (CONTEXT.md, RESEARCH.md, UI-SPEC.md, VALIDATION.md, PLAN.md files)

**Step 2:** Extract REQ-IDs mapped to this phase from REQUIREMENTS.md traceability

**Step 3:** Create git worktree (superpowers:using-git-worktrees)
- Branch: `breeyo/phase-NN-brief-name`

**Step 4:** Synthesize design document from phase docs → `.superpowers/designs/phase-NN.md`
- This is the "approved design" that superpowers expects after brainstorming

**Step 5:** Invoke superpowers:writing-plans
- Plans MUST:
  - Start each task with a failing test (RED)
  - Reference the D-XX decision being implemented
  - Reference the REQ-ID being satisfied
  - Use exact file paths in the monorepo
  - Be 2-5 minute tasks maximum

**Step 6:** Invoke superpowers:subagent-driven-development
- Each subagent:
  - Gets task brief + relevant D-XX decisions + REQ-IDs
  - MUST follow TDD iron law (superpowers:test-driven-development)
  - Writes failing test FIRST, then minimal implementation to pass
  - If code is written before a test: DELETE IT and restart

**Step 7:** After each task, invoke superpowers:requesting-code-review
- Review checks:
  - D-XX decision compliance (does code match the locked decision?)
  - REQ-ID satisfaction (does this requirement now pass?)
  - TDD compliance (was test written first? is coverage adequate?)
  - Security (SEC-* requirements applicable to this phase)
  - No scope creep (no features beyond phase boundary)

**Step 8:** After all tasks, invoke superpowers:verification-before-completion
- Verify against VALIDATION.md acceptance criteria
- Verify every REQ-ID for this phase has passing tests

**Step 9:** Push the phase branch through the no-mistakes gate instead of a manual PR
- From the phase worktree: `git push no-mistakes breeyo/phase-NN-brief-name`
- This runs review → test → docs → lint in a disposable worktree (test/lint commands come from `.no-mistakes.yaml` on `main`), then — only once every check is green — forwards the branch to `origin` and opens a clean PR automatically
- Attach with `no-mistakes` (TUI) to watch the run and act on findings: auto-fix ones apply themselves, ask-user ones need your call (approve / fix / skip)
- If a finding needs a real code change, make it in the worktree and re-push through the gate — don't hand-patch around the gate
- Report the PR URL once the gate opens it; fall back to superpowers:finishing-a-development-branch only if the gate itself is unavailable

### Mode 3: `breeyo-build --verify`

**Step 1:** Load phase docs

**Step 2:** Read implemented code for the phase's scope

**Step 3:** Run superpowers:requesting-code-review against CONTEXT.md

**Step 4:** Run superpowers:verification-before-completion against VALIDATION.md

**Step 5:** Report findings without modifying code
