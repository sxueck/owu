# Runbook: chat-network-tool-calling-exa-search

- Spec path: `/Users/yshen/GolandProjects/owu/.agents/specs/chat-network-tool-calling-exa-search.md`
- Shared execution status: verified
- Next dispatch decision: none; implementation complete

## Workstreams

### user-chat-preferences
- Status: implemented
- Assigned: implementer
- Depends on: none
- Validation expectation: code review plus targeted schema/helper spot-check
- Retry count: 0

### exa-search-config-admin
- Status: implemented
- Assigned: implementer
- Depends on: none
- Validation expectation: code review of admin route, config persistence, and access control
- Retry count: 0

### chat-tool-calling-service
- Status: verified
- Assigned: implementer
- Depends on: user-chat-preferences, exa-search-config-admin
- Validation expectation: code review of tool registration, fallback path, and SSE contract updates; verify request fallback when `networkEnabled` is omitted, confirm downgrade path sends `notice`, and ensure assistant message still persists after fallback
- Retry count: 0

### chat-network-ui
- Status: implemented
- Assigned: implementer
- Depends on: user-chat-preferences, chat-tool-calling-service
- Validation expectation: code review of toggle persistence, request payload, and notice rendering; confirm request payload includes `networkEnabled` and `notice` rendering does not disrupt pending assistant streaming UI
- Retry count: 0

## Dependency State
- Stable facts: approved scope; OpenAI Chat Completions `tool_calls`; Exa runs through backend adapter; admin config is a new `/admin` module; fallback must be non-blocking.
- Coordination note: the Exa config storage contract must be settled before service work starts (stable `getSearchConfig/saveSearchConfig` required for downstream consumption).
- Unresolved risks: exact OpenAI SDK typing for streamed/non-streamed tool-calling flow; best fit for storing Exa config in existing system config payload; admin navigation insertion point.

## Open Risks
- OpenAI SDK capability and repo typing may require a dual-path completion wrapper.
- Existing config storage may need careful extension to avoid breaking current admin forms.
- UI notice should stay lightweight and not disturb the stream flow.
- Exa live API path was not re-run end-to-end in this review pass (residual risk).

## Blocked Items
- None.

## Latest Meaningful Attempt
- Real native `tool_calls` handling confirmed in code review.
- Admin `enabled` flag now gates Exa availability.
- Review passed after final fix.

## Checks Run
- Planning-only repository reconnaissance completed.
- Repository diff and file spot-checks were reviewed after the partial worker run.
- Review-only verifier pass.
- Observed-not-rerun: `tsc --noEmit` passed.
- Observed-not-rerun: `npm run build` passed.

## Files Touched
- `/Users/yshen/GolandProjects/owu/.agents/specs/chat-network-tool-calling-exa-search.md`
- `/Users/yshen/GolandProjects/owu/.agents/runs/chat-network-tool-calling-exa-search.md`
- `/Users/yshen/GolandProjects/owu/app/lib/server/preferences.server.ts`
- `/Users/yshen/GolandProjects/owu/app/lib/server/exa.server.ts`
- `/Users/yshen/GolandProjects/owu/app/routes/admin/search.tsx`

## Attempt History
- 2026-03-18: Requirements clarified, spec approved, awaiting plan review and first implementation dispatch.
- 2026-03-18 (post-review): Critic-approved dependency ordering established; validation expectations expanded; cleared to dispatch config workstreams (`user-chat-preferences`, `exa-search-config-admin`) first.
- 2026-03-18 (partial implementation): Preferences storage, Exa config storage/admin route, and Exa adapter scaffolding completed; follow-up will avoid unrelated worktree changes.
- 2026-03-18 (review): Review found a spec mismatch in the tool-calling implementation—service layer uses keyword heuristics instead of consuming real OpenAI `tool_calls`. A corrective follow-up is required before completion.
- 2026-03-18: Final review passed after fixing `enabled` gating.
