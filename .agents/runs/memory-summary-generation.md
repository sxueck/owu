# Runbook: memory-summary-generation

- Spec path: `.agents/specs/memory-summary-generation.md`
- Shared status: completed
- Next dispatch decision: none; implementation and review complete.

## Common Summary
- Add a user-triggered memory summary flow inside long-term memory settings.
- Preserve original memories and save generated summaries as new memory records.
- Extend memory data with a source field: `manual | ai_summary`.
- Keep existing chat-context injection behavior unchanged.

## Workstreams

### `memory-summary-data-contract`
- Status: implemented
- Assigned: completed
- Depends on: none
- Review expectation: code review of schema, memory service mappings, ownership validation, model fallback, and summary creation path.
- Acceptance slice:
  - memory records expose `source`
  - manual create defaults to `manual`
  - summary endpoint validates selected IDs and ownership
  - successful generation returns a created `ai_summary` memory
- Notes: Schema extended with `source` field; migration created; helper `createMemoryFromSelection` added; new `/api/user/memories/summary` POST route implemented. Review passed after route typegen and typecheck validation.

### `memory-summary-ui-flow`
- Status: implemented
- Assigned: completed
- Depends on: `memory-summary-data-contract`
- Review expectation: code review of selection state, submit gating, loading/error UX, and source badge rendering.
- Acceptance slice:
  - users can select memories and trigger summary generation
  - submit disabled with no selection
  - successful generation inserts the new AI summary memory and keeps originals intact
- Notes: Multi-select UI implemented with summary action area; source badges (`manual`, `ai_summary`) rendered; route registered; edit/selection conflict handled by disabling selection during editing.

## Dependency State
- Both `memory-summary-data-contract` and `memory-summary-ui-flow` are complete.

## Attempt History
- 2026-03-19: Spec approved and persisted.
- 2026-03-19: Backend/data-contract wave completed; schema migration, memory service helpers, and `/api/user/memories/summary` endpoint implemented.
- 2026-03-19: UI work completed; multi-select, summary generation flow, and source badges implemented.
- 2026-03-19: Final review and typecheck validation completed.

## Open Risks
- None.

## Blocked Items
- None.

## Checks Run
- Backend implementation spot-checked; Prisma-related type issues expected until client regeneration.
- `npm run typecheck` passed (`react-router typegen && tsc`).
- Orchestrator spot-check confirmed route registration and generated route types include `/api/user/memories/summary`.

## Files Touched
- `.agents/specs/memory-summary-generation.md`
- `.agents/runs/memory-summary-generation.md`
- `prisma/schema.prisma`
- `prisma/migrations/20260319161515_add_memory_source/migration.sql`
- `app/lib/server/user-memory.server.ts`
- `app/lib/server/index.server.ts`
- `app/routes/api/user.memories.summary.ts`
- `app/routes.ts`
- `app/routes/chat/layout.tsx`

## Retry History
- None.

## Latest Meaningful State
- Memory summary generation is implemented end-to-end and reviewed.
