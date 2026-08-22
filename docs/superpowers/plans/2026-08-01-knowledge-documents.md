# Knowledge Documents Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the internal knowledge-document workflow from private draft through autosave, official versions, optional approval, publication, search, version restore, attachments, trash recovery, and the secured Electron teacher-client UI.

**Architecture:** Extend the existing FastAPI/PostgreSQL service with a bounded `knowledge` domain and server-side authorization filters. Keep document content and file transfer inside the Electron main process, expose only validated IPC contracts to React, and preserve the existing offline policy by caching metadata only. Use optimistic revision checks for concurrent editing and immutable official versions for history.

**Tech Stack:** Python 3.12, FastAPI, SQLAlchemy async, Alembic, PostgreSQL, pytest, Ruff, mypy, Node.js 24, Electron, React, TypeScript strict mode, Vitest, Testing Library, Windows Credential Manager/DPAPI security foundation.

## Global Constraints

- Official versions are created only by explicit draft save, publication, approval publication, or version restore; autosave and approval request do not create versions.
- Autosave runs after 5 seconds of inactivity and stores one server-side recovery draft per user and document.
- Visibility is `private`, `departments`, or `school`; all list, search, detail, history, attachment, and mutation APIs apply authorization on the server.
- Authors and assigned editors may edit, explicitly save, request approval, and publish ordinary documents.
- Important documents require `knowledge.approve`; an approval request references an already saved official version.
- Every mutation carries an integer `revision`; stale writes return HTTP 409 without overwriting the latest document.
- Document body uses validated structured JSON plus normalized search text; unsafe nodes, attributes, schemes, and scripts are rejected.
- Direct attachments are document-owned; shared-file links are references and never delete the shared source.
- Trash retention is 30 days, with restoration preserving document ID, official versions, and attachments.
- Offline cache contains only title and minimum metadata; body and attachment bytes are never cached.
- Certificate mismatch blocks all knowledge screens, including cached metadata.
- All UI text is Korean and follows existing teacher-client terminology.

---

## Planned File Structure

### API server

- `services/api-server/src/schoolworkhub/knowledge/models.py`: SQLAlchemy entities and enums for documents, versions, editors, departments, tags, autosaves, approvals, attachments, shared links, pins, and purge metadata.
- `services/api-server/src/schoolworkhub/knowledge/schemas.py`: Pydantic request/response contracts and structured-body validation.
- `services/api-server/src/schoolworkhub/knowledge/permissions.py`: visibility predicates and mutation authorization.
- `services/api-server/src/schoolworkhub/knowledge/repository.py`: focused async persistence and search queries.
- `services/api-server/src/schoolworkhub/knowledge/service.py`: state transitions, revision checks, version creation, approval, restore, trash, and audit orchestration.
- `services/api-server/src/schoolworkhub/knowledge/diff.py`: stable title/body/block/attachment comparison output.
- `services/api-server/src/schoolworkhub/knowledge/files.py`: direct attachment validation/storage abstraction and shared-file reference contract.
- `services/api-server/src/schoolworkhub/api/knowledge.py`: FastAPI routes.
- `services/api-server/src/schoolworkhub/jobs/purge_knowledge.py`: expired trash purge command/service.
- `services/api-server/alembic/versions/*_knowledge_documents.py`: schema, indexes, constraints, and permission seed migration.
- `services/api-server/tests/knowledge/`: domain, HTTP, search, permission, file, purge, and audit tests.

### Teacher client

- `apps/teacher-client/src/shared/knowledgeContracts.ts`: validated IPC and renderer-safe contracts.
- `apps/teacher-client/src/main/knowledge/knowledgeApi.ts`: authenticated API adapter and response validation.
- `apps/teacher-client/src/main/knowledge/knowledgeRuntime.ts`: autosave scheduling, upload/download, conflict mapping, and metadata cache integration.
- `apps/teacher-client/src/main/ipc/registerKnowledgeIpc.ts`: fixed sender-validated knowledge channels.
- `apps/teacher-client/src/preload/index.ts`: narrow knowledge bridge additions.
- `apps/teacher-client/src/renderer/knowledge/`: list, editor, visibility/editor settings, approvals, history/diff, trash, attachment UI, and state hooks.
- `apps/teacher-client/src/renderer/App.tsx`: route/menu integration behind permission codes.
- `apps/teacher-client/src/main/integration/knowledgeHarness.test.ts`: API-to-Electron workflow verification.

---

### Task K01: Knowledge schema, enums, migration, and permission seeds

**Files:**
- Create: `services/api-server/src/schoolworkhub/knowledge/models.py`
- Create: `services/api-server/src/schoolworkhub/knowledge/__init__.py`
- Create: `services/api-server/alembic/versions/<revision>_knowledge_documents.py`
- Modify: existing SQLAlchemy model registry/import file
- Test: `services/api-server/tests/knowledge/test_migration.py`
- Test: `services/api-server/tests/knowledge/test_models.py`

**Interfaces:**
- Produces enums `KnowledgeStatus`, `KnowledgeVisibility`, `KnowledgeVersionAction`, `ApprovalStatus`.
- Produces entities `KnowledgeDocument`, `KnowledgeDocumentVersion`, `KnowledgeDocumentEditor`, `KnowledgeDocumentDepartment`, `KnowledgeTag`, `KnowledgeDocumentTag`, `KnowledgeAutosaveDraft`, `KnowledgeApprovalRequest`, `KnowledgeAttachment`, `KnowledgeVersionAttachment`, `KnowledgeSharedFileLink`, and `KnowledgePin`.

- [ ] **Step 1: Write migration tests** asserting upgrade creates every table, unique constraints prevent duplicate editors/tags, `revision >= 1`, and downgrade removes the schema.
- [ ] **Step 2: Run** `cd services/api-server && pytest tests/knowledge/test_migration.py -v` and verify failure because the migration does not exist.
- [ ] **Step 3: Add model tests** for enum values, default 30-day `purge_after`, immutable version numbering, and school-scoped foreign keys.
- [ ] **Step 4: Implement models and Alembic migration** with indexes for `(school_id, status, updated_at)`, `(school_id, author_id)`, search vector support, `purge_after`, and permission seeds:
  `knowledge.read`, `knowledge.create`, `knowledge.edit.own`, `knowledge.edit.assigned`, `knowledge.publish`, `knowledge.approve`, `knowledge.delete`, `knowledge.restore`, `knowledge.history.read`, `knowledge.history.restore`, `knowledge.manage.shared_files`.
- [ ] **Step 5: Run** migration round-trip, Ruff, mypy, and model tests.
- [ ] **Step 6: Commit** `feat(api): add knowledge document schema`.

### Task K02: Structured body validation and base document CRUD

**Files:**
- Create: `services/api-server/src/schoolworkhub/knowledge/schemas.py`
- Create: `services/api-server/src/schoolworkhub/knowledge/repository.py`
- Create: `services/api-server/src/schoolworkhub/knowledge/service.py`
- Create: `services/api-server/src/schoolworkhub/api/knowledge.py`
- Modify: API router registration
- Test: `services/api-server/tests/knowledge/test_document_crud.py`
- Test: `services/api-server/tests/knowledge/test_body_validation.py`

**Interfaces:**
- Produces `KnowledgeService.create_document(actor, command)`, `save_draft(actor, document_id, command)`, `get_document(actor, document_id)`, and `list_documents(actor, query)`.
- `SaveDocumentCommand` includes `revision`, title, body JSON, visibility, department IDs, editor IDs, tags, importance flag, and change reason.

- [ ] **Step 1: Write failing body validation tests** rejecting script nodes, event attributes, `javascript:` URLs, unknown block types, invalid UUID references, and oversized payloads while accepting all approved formatting and work blocks.
- [ ] **Step 2: Write failing CRUD HTTP tests** for create, detail, explicit draft save, required permission, school isolation, and incremented revision.
- [ ] **Step 3: Run focused tests** and confirm missing routes/services are the failure.
- [ ] **Step 4: Implement normalized text extraction** from title, paragraphs, checklist labels, assignee display values, and referenced document titles.
- [ ] **Step 5: Implement repository, service, and routes** with a transaction that updates current document state and creates one official version on explicit save.
- [ ] **Step 6: Run** focused tests, full API tests, Ruff, and mypy.
- [ ] **Step 7: Commit** `feat(api): add knowledge document CRUD`.

### Task K03: Visibility and assigned-editor authorization

**Files:**
- Create: `services/api-server/src/schoolworkhub/knowledge/permissions.py`
- Modify: `knowledge/repository.py`
- Modify: `knowledge/service.py`
- Test: `services/api-server/tests/knowledge/test_permissions.py`

**Interfaces:**
- Produces `build_read_scope(actor)` for SQL filtering and `assert_can_edit(actor, document)` / `assert_can_publish(actor, document)` for mutations.

- [ ] **Step 1: Write matrix tests** for author, assigned editor, same-department reader, different-department reader, same-school reader, different-school user, approver, and administrator across private/department/school visibility.
- [ ] **Step 2: Run tests** and verify unauthorized documents are currently visible or mutable.
- [ ] **Step 3: Implement server-side SQL predicates** so inaccessible rows never enter list, search, detail, history, or attachment responses.
- [ ] **Step 4: Implement editor replacement** as an atomic set update and validate every editor belongs to the same school.
- [ ] **Step 5: Run permission and full API suites.**
- [ ] **Step 6: Commit** `feat(api): enforce knowledge visibility and editor access`.

### Task K04: Autosave recovery and optimistic conflict handling

**Files:**
- Modify: `knowledge/schemas.py`
- Modify: `knowledge/repository.py`
- Modify: `knowledge/service.py`
- Modify: `api/knowledge.py`
- Test: `services/api-server/tests/knowledge/test_autosave_and_conflicts.py`

**Interfaces:**
- Produces `put_autosave(actor, document_id, revision, payload)`, `get_autosave(actor, document_id)`, and `delete_autosave(actor, document_id)`.
- Stale official save returns error code `KNOWLEDGE_REVISION_CONFLICT` with current revision and safe current-version summary.

- [ ] **Step 1: Write failing tests** proving autosave does not create a version, only the current user can read it, it is replaced rather than appended, and an official save clears that user's autosave.
- [ ] **Step 2: Write conflict tests** with two editors saving revision 1; first succeeds to revision 2 and second receives HTTP 409 without data loss.
- [ ] **Step 3: Implement autosave endpoints and revision compare-and-update** inside one transaction.
- [ ] **Step 4: Run focused and full API verification.**
- [ ] **Step 5: Commit** `feat(api): add knowledge autosave and conflict protection`.

### Task K05: Publication, unpublication, approval, rejection, and audit

**Files:**
- Modify: `knowledge/service.py`
- Modify: `knowledge/schemas.py`
- Modify: `api/knowledge.py`
- Test: `services/api-server/tests/knowledge/test_publication.py`
- Test: `services/api-server/tests/knowledge/test_approval.py`
- Test: `services/api-server/tests/knowledge/test_audit.py`

**Interfaces:**
- Produces `publish`, `unpublish`, `request_approval`, `cancel_approval`, `approve`, and `reject` service operations.
- Approval request references `document_version_id`; approval creates a publication version, request creation does not.

- [ ] **Step 1: Write transition-table tests** covering all allowed and forbidden state changes.
- [ ] **Step 2: Write tests** that ordinary documents publish directly, important documents cannot publish without approval, rejection requires a reason, and resubmission requires an explicit saved version newer than the rejected request.
- [ ] **Step 3: Write audit assertions** for save, publish, unpublish, request, cancel, approve, reject, and permission failure without storing body or secrets in audit details.
- [ ] **Step 4: Implement transition methods and routes** using existing audit service patterns.
- [ ] **Step 5: Run focused and full API suites.**
- [ ] **Step 6: Commit** `feat(api): add knowledge publication and approval flow`.

### Task K06: Immutable history, diff, and restore

**Files:**
- Create: `services/api-server/src/schoolworkhub/knowledge/diff.py`
- Modify: `knowledge/repository.py`
- Modify: `knowledge/service.py`
- Modify: `api/knowledge.py`
- Test: `services/api-server/tests/knowledge/test_history.py`
- Test: `services/api-server/tests/knowledge/test_diff.py`

**Interfaces:**
- Produces `list_versions`, `get_version`, `compare_versions`, and `restore_version`.
- Diff response contains title changes, structured block operations, visibility/department/tag changes, and attachment/shared-link changes; it never returns executable HTML.

- [ ] **Step 1: Write failing tests** for monotonically increasing versions and immutable old snapshots.
- [ ] **Step 2: Write deterministic diff tests** for inserted, removed, moved, and edited blocks plus attachment changes.
- [ ] **Step 3: Write restore test** proving restoration creates a new official version and revision, preserving the source version.
- [ ] **Step 4: Implement diff and history APIs** guarded by history permissions and normal document visibility.
- [ ] **Step 5: Run focused and full API suites.**
- [ ] **Step 6: Commit** `feat(api): add knowledge history diff and restore`.

### Task K07: Direct attachments and shared-file references

**Files:**
- Create: `services/api-server/src/schoolworkhub/knowledge/files.py`
- Modify: `knowledge/models.py`
- Modify: `knowledge/service.py`
- Modify: `api/knowledge.py`
- Test: `services/api-server/tests/knowledge/test_attachments.py`
- Test: `services/api-server/tests/knowledge/test_shared_file_links.py`

**Interfaces:**
- Produces staged upload methods `begin_upload`, `complete_upload`, `delete_attachment`, and `link_shared_file`.
- File storage uses an injected adapter so tests do not write production storage.

- [ ] **Step 1: Write failing tests** for maximum size, extension/MIME mismatch, incomplete upload exclusion, same-school ownership, authorization, and document-trash propagation.
- [ ] **Step 2: Write shared-link tests** proving source bytes are not duplicated/deleted and access loss blocks download while preserving reference metadata.
- [ ] **Step 3: Implement staged direct uploads and snapshot attachment metadata into official versions.**
- [ ] **Step 4: Implement shared-file adapter contract** without building the future shared-file management UI.
- [ ] **Step 5: Run focused and full API suites.**
- [ ] **Step 6: Commit** `feat(api): add knowledge attachments and shared links`.

### Task K08: Search, filters, tags, and pins

**Files:**
- Modify: `knowledge/repository.py`
- Modify: `knowledge/schemas.py`
- Modify: `api/knowledge.py`
- Test: `services/api-server/tests/knowledge/test_search.py`

**Interfaces:**
- Produces paged search supporting query text, tags, departments, author, visibility, state, importance, created/updated ranges, and sorting.
- Produces per-user pin/unpin endpoints.

- [ ] **Step 1: Write failing PostgreSQL integration tests** for Korean title/body search, tag intersection, filters, stable pagination, visibility exclusion, and recent-update ordering.
- [ ] **Step 2: Add search-vector generation/indexing** based only on normalized allowed text.
- [ ] **Step 3: Implement pin persistence** and pinned-first optional ordering without changing document visibility.
- [ ] **Step 4: Run migration, focused integration, and full API verification.**
- [ ] **Step 5: Commit** `feat(api): add knowledge search filters and pins`.

### Task K09: Trash, 30-day recovery, hold, and purge job

**Files:**
- Create: `services/api-server/src/schoolworkhub/jobs/purge_knowledge.py`
- Modify: `knowledge/service.py`
- Modify: `api/knowledge.py`
- Test: `services/api-server/tests/knowledge/test_trash_and_purge.py`

**Interfaces:**
- Produces `trash_document`, `restore_document`, `set_retention_hold`, and `purge_expired(now)`.

- [ ] **Step 1: Write failing tests** for previous-state restoration, attachment restoration, exact 30-day boundary, hold exclusion, school isolation, and idempotent purge.
- [ ] **Step 2: Implement trash/restore routes and a transaction-safe purge service** that removes owned attachment bytes only after database eligibility is locked.
- [ ] **Step 3: Add audit records** containing IDs, timestamps, and reason only.
- [ ] **Step 4: Run focused, migration, and full API verification.**
- [ ] **Step 5: Commit** `feat(api): add knowledge trash recovery and purge`.

### Task K10: Shared TypeScript contracts and main-process knowledge API

**Files:**
- Create: `apps/teacher-client/src/shared/knowledgeContracts.ts`
- Create: `apps/teacher-client/src/main/knowledge/knowledgeApi.ts`
- Test: `apps/teacher-client/src/main/knowledge/knowledgeApi.test.ts`

**Interfaces:**
- Produces renderer-safe types and a `KnowledgeApi` class for list, detail, autosave, explicit save, publish, approval, history, diff, restore, attachments, search, trash, and recovery.

- [ ] **Step 1: Write failing validation tests** for every response envelope and error mapping, including revision conflict and permission denial.
- [ ] **Step 2: Implement strict schemas** using the existing runtime-validation approach; never include tokens, policy paths, raw certificates, or filesystem paths.
- [ ] **Step 3: Implement API adapter methods** through the existing authenticated main-process client.
- [ ] **Step 4: Run teacher-client lint, typecheck, and focused tests.**
- [ ] **Step 5: Commit** `feat(teacher): add knowledge API contracts`.

### Task K11: Knowledge runtime, 5-second autosave, files, IPC, and offline metadata

**Files:**
- Create: `apps/teacher-client/src/main/knowledge/knowledgeRuntime.ts`
- Create: `apps/teacher-client/src/main/ipc/registerKnowledgeIpc.ts`
- Modify: `apps/teacher-client/src/preload/index.ts`
- Modify: existing production runtime/bootstrap and metadata cache schema
- Test: `apps/teacher-client/src/main/knowledge/knowledgeRuntime.test.ts`
- Test: `apps/teacher-client/src/main/ipc/registerKnowledgeIpc.test.ts`

**Interfaces:**
- Produces fixed bridge methods `knowledge.list`, `knowledge.get`, `knowledge.autosave`, `knowledge.save`, `knowledge.publish`, `knowledge.requestApproval`, `knowledge.approve`, `knowledge.reject`, `knowledge.history`, `knowledge.compare`, `knowledge.restore`, `knowledge.trash`, `knowledge.recover`, `knowledge.selectAndUploadFile`, and `knowledge.downloadAttachment`.

- [ ] **Step 1: Write failing timer tests** using fake timers: repeated typing schedules one autosave 5 seconds after the final change; explicit save cancels pending autosave.
- [ ] **Step 2: Write IPC security tests** for fixed sender URL, input validation, channel allowlist, sanitized errors, and no token/path exposure.
- [ ] **Step 3: Write offline tests** proving only list metadata is cached/read-only and body/attachment requests fail safely offline.
- [ ] **Step 4: Implement runtime and bridge** with file dialogs and upload/download handled only in main process.
- [ ] **Step 5: Wire runtime into the existing production composition before window creation.**
- [ ] **Step 6: Run lint, strict typecheck, tests, and Electron build.**
- [ ] **Step 7: Commit** `feat(teacher): add secure knowledge runtime and IPC`.

### Task K12: React document list, editor, approval, history, and trash UI

**Files:**
- Create: `apps/teacher-client/src/renderer/knowledge/KnowledgeListPage.tsx`
- Create: `apps/teacher-client/src/renderer/knowledge/KnowledgeEditorPage.tsx`
- Create: `apps/teacher-client/src/renderer/knowledge/KnowledgeViewerPage.tsx`
- Create: `apps/teacher-client/src/renderer/knowledge/KnowledgeHistoryPanel.tsx`
- Create: `apps/teacher-client/src/renderer/knowledge/KnowledgeApprovalPanel.tsx`
- Create: `apps/teacher-client/src/renderer/knowledge/KnowledgeTrashPage.tsx`
- Create: `apps/teacher-client/src/renderer/knowledge/knowledgeState.ts`
- Create: associated CSS modules and tests
- Modify: `apps/teacher-client/src/renderer/App.tsx`

**Interfaces:**
- Consumes only the preload `window.schoolWorkHub.knowledge` bridge and existing connection/session events.

- [ ] **Step 1: Write failing list tests** for Korean filters, permission-based actions, department/private/school labels, pins, pagination, offline banner, and security-blocked replacement.
- [ ] **Step 2: Write failing editor tests** for structured blocks, 5-second autosave status, explicit save, assigned editors, visibility, validation, conflict dialog, and disabled mutations offline.
- [ ] **Step 3: Write failing workflow tests** for ordinary publish, approval request, approve/reject, history compare/restore, direct upload/shared link, trash/recovery, and logout reset.
- [ ] **Step 4: Implement state and focused components**; keep each component responsible for one screen or panel and reuse existing dashboard visual tokens.
- [ ] **Step 5: Integrate navigation** only when the corresponding permission code exists.
- [ ] **Step 6: Run Testing Library tests, lint, typecheck, and production builds.**
- [ ] **Step 7: Commit** `feat(teacher): add knowledge document user interface`.

### Task K13: End-to-end verification, Windows gates, documentation, and PR update

**Files:**
- Create: `apps/teacher-client/src/main/integration/knowledgeHarness.test.ts`
- Modify: `.github/workflows/api-ci.yml`
- Modify: `.github/workflows/teacher-client-ci.yml`
- Modify: `apps/teacher-client/scripts/verify-foundation.ps1` or add a focused knowledge verifier
- Modify: `README.md`
- Modify: `apps/teacher-client/README.md`

**Interfaces:**
- Produces a machine-readable verification artifact with named scenarios and no password/token/body/file-byte fields.

- [ ] **Step 1: Write the failing integration harness** for: private autosave recovery, explicit draft version, assigned-editor publish, department/school visibility, important approval/rejection/resubmission, search, direct/shared attachments, revision conflict, diff/restore, trash/recovery, unauthorized API denial, offline metadata-only mode, certificate block, and audit records.
- [ ] **Step 2: Run the harness on Ubuntu and Windows** and fix only product defects, not assertions that contradict the approved specification.
- [ ] **Step 3: Add CI gates** for API migration round-trip, PostgreSQL search tests, teacher lint/type/test/build, Windows native rebuild, sandboxed preload/IPC smoke, and knowledge verification artifact.
- [ ] **Step 4: Document administrator permission assignment, file limits, purge scheduling, user workflows, offline limits, and recovery procedures.**
- [ ] **Step 5: Run all three repository workflows on one commit** and record run IDs and test counts.
- [ ] **Step 6: Review the full branch for secret leakage, client-side-only authorization, unsafe body rendering, direct renderer filesystem/network access, and missing audit events.**
- [ ] **Step 7: Update the draft PR description** with implemented scope, verification evidence, known dependency audit findings, and explicitly deferred features.
- [ ] **Step 8: Commit** `test: verify knowledge document workflow`.

---

## Final Acceptance Checklist

- [ ] All 13 tasks have independently passing tests and commits.
- [ ] API migration upgrades and downgrades cleanly.
- [ ] Ruff, strict mypy, pytest, coverage, ESLint, all TypeScript projects, Vitest, Electron build, preload verification, and React build pass.
- [ ] Every list/detail/search/history/file response is filtered server-side.
- [ ] Autosave creates no official version and official actions follow the approved version rule.
- [ ] Stale revisions never overwrite newer work.
- [ ] Body rendering and links remain inside the allowed structured schema.
- [ ] Renderer cannot access tokens, native paths, raw file bytes beyond approved download flow, certificate policy, or unrestricted IPC.
- [ ] Offline mode exposes metadata only and disables every mutation.
- [ ] Certificate mismatch hides both live and cached knowledge data.
- [ ] Trash recovery works for 30 days and held records are not purged.
- [ ] Audit logs cover all important state changes without storing document body or secrets.
- [ ] Machine-readable verification contains all named scenarios and no sensitive fields.
