# Architecture Recovery Roadmap

> **Status**: MVP Simplification & Core Architecture Recovery Completed (2026-10-20); Task 76 (Production Server Auth) remains pre-production gate  
> **Purpose**: Recover a reliable understanding of the current system, agree on its data rules, then migrate in small verified stages.  
> **Companion record**: [Architecture Recovery Record](../ARCHITECTURE_RECOVERY.md)  
> **Product requirements**: [PRD](../PRD.md)

## 2026-10-20 MVP Simplification Execution Summary

Because the owner confirmed the project is at the **MVP stage with no live production data to preserve**, the legacy migration overhead was replaced with a direct 3-step architectural purification:
1. **Step 1 (Purification & Strict PK Relations)**: Removed `v2` storage migration, `getMembers()` read-time mutation, and all `memberName` / `scheduleId prefix` / `date` guessing heuristics. Preserved `RawAttendanceLog.memberId` on member merge (`MERGE_MEMBERS`) and protected `MERGED` rows from physical deletion. Removed obsolete `gas/Code.gs` and fixed `seedInitialData()` column alignment in `google-apps-script.js`.
2. **Step 2 (Single Pure Domain Engine SSOT)**: Consolidated all 4 divergent attendance/statistics calculators (`sheets.ts`, `MemberPortalModal.tsx`, `MemberProfileModal.tsx`, `AdminMatrixGrid.tsx`) into `src/utils/attendanceStats.ts` (`reconcileSingleMemberAttendance`, `calculateCumulativeAttendanceWithLifecycle`, `resolveMergedMemberIds`), enforcing the owner-confirmed rules:
   - Excused absence (`사유결석`) included in `totalSessions` denominator.
   - Late (`지각`) counted as 100% in `attendanceRate` (`(attended + late) / totalSessions`) while tracked separately in `late`.
   - Non-target members see `[🌿 자율 참여 연습]` badge; excluded from denominator when not attending (`미참`), and counted as `+1` session & `+1` attendance (`guestAttended`) when voluntarily checking in.
3. **Step 3 (Confirmed Sheet Sync & Guardrails)**: Removed `no-cors` false-positive success in `sendToGoogleSheet()`, added `log.id` idempotency in `RECORD_ATTENDANCE`, added lock-protected duplicate check in `REGISTER_MEMBER`, enforced 1-person 1-device lock across all binding paths in `BindingModal.tsx`, and enforced the 1-hour-before-start RSVP cutoff via `isRsvpOpenForSchedule()`.

## Guiding Rules

- This is an architecture recovery effort, not a list of isolated bug fixes.
- First establish what is actually deployed and what the data means. Do not infer live behavior only from a source file in the repository.
- The spreadsheet is the agreed official record for operational data. Browser state is not a second authority.
- Preserve source history. Do not rewrite or delete attendance source records to make a screen easier to calculate.
- Keep Google Sheets communication behind the existing single adapter boundary required by `AGENTS.md`.
- Do not change spreadsheet tabs, headers, or required columns without owner approval.
- Separate facts verified in code, owner-approved decisions, recommendations, and unanswered questions in all handoff material.
- Ask the owner one consequential product question at a time, in plain language, and wait before treating a recommendation as approved.
- Do not start broad code refactoring until the data contracts and current deployment are understood.

## Agreed Decisions

| Topic | Agreed direction |
| --- | --- |
| Official records | Google Spreadsheet is the official record for operational data. |
| Prototype endpoint access | The owner accepts link-public Apps Script access for the current prototype. This is not approval for production use. |
| Attendance when Sheets is unreachable | Do not queue an offline attendance attempt. Do not show attendance success without confirmation; show a clear failure notice. |
| Attendance retry | Retry the same check-in using the same unique ID. If Sheets confirms the ID is already present, report that it was already saved; otherwise save once. If Sheets cannot confirm, report failure. |
| Attendance corrections | Preserve the original attendance record. Add a separate correction record; exact schema and operator identity remain to be designed. |
| Attendance failure records | Record reachable failures separately from attendance. A failure during total loss of Sheets connectivity cannot be recorded in Sheets. Categories and schema remain open. |
| RSVP | Keep only the current response, not a change history. Members may change/cancel until one hour before the currently saved start time. The deadline moves with schedule changes. Operators may change the response after the deadline. |
| Duplicate member prevention | Compare against the latest sheet roster at the registration boundary. Exact normalized name plus full phone match must not create a new row. Check and registration must be atomic under the server lock. |
| Ambiguous member matches | Name-only, phone-last-four-only, or incomplete legacy data is not proof of identity. Do not auto-merge or silently create; route to operator review. A match does not itself authenticate or bind the person. |
| Member merge | Preserve historical attendance member IDs. Retain the merged member row and explicit `mergedIntoId` relationship. Display/reporting follows that relationship; do not infer identity from names or last-four digits. |

## Decisions Still Needed

| Decision | Why it matters | Needed before |
| --- | --- | --- |
| How will the server identify authorized members/operators and limit data by role before production? | Prototype link-public access is accepted for now, but the supplied code returns sensitive data and has no server-side role checks. | Production use or access to real member data |
| How is a person safely verified when an existing member match is found? | Duplicate detection is not proof that the person owns the account. | Member registration/binding work |
| What happens if both merged member accounts have different current RSVP answers for one schedule? | RSVP stores only one current answer, so merging requires a deterministic choice. | Member merge implementation |
| Which reachable attendance failures are recorded, and what information is retained? | Failure records need useful support details without leaking unnecessary location/contact data. | Failure-log design and schema approval |
| What authentication/authorization should the server enforce for member reads, attendance writes, and administrator actions? | The current public-link endpoint has no server-side role/PIN check, while GET returns roster, logs, and config including sensitive fields. | Any continued public deployment or sensitive-data access |
| What happens to a member's current RSVP after account merge? | Member identity changes while RSVP retains only one current value. | Member merge implementation |
| Which existing sheet columns/tabs are actually present, and which are approved as canonical? | The modern script can add missing headers during a GET; the older script has a different schema. | Schema compatibility work |
| How should legacy rows with missing or malformed identifiers be handled? | Automatic repair based on names/dates can attach records to the wrong person or session. | Data cleanup or fallback removal |

Resolve these with the owner as needed; do not present every item as a single questionnaire. Some are evidence-gathering tasks, not product decisions.

## Phased Plan

### Phase 0 — Establish the Real System

**Goal:** Treat link-public access as an accepted prototype risk, compare the deployed revision with the owner-supplied script, and inspect actual sheet data safely.

**Work:**
- Compare the deployed Web App project/version with the owner-supplied eight-tab script. Keep the currently accepted prototype access posture; do not change deployment settings in this planning phase. Do not share endpoint secrets in chat.
- Inventory actual spreadsheet tabs, headers, row counts, and relevant sample relationships. Back up before any operational change.
- Check whether the live sheet was initialized by the modern `seedInitialData()` path and whether Member values are aligned under the correct headers. Do not repair rows until the impact is known and a backup exists.
- Replace the old five-tab setup instructions with the verified current deployment instructions after owner approval.
- Confirm whether Apps Script GET requests modify headers or create tabs in the deployed version.
- Review whether the live GET response exposes populated full phone numbers, device IDs, or the admin PIN, and whether unauthenticated POST actions can perform administrative changes. The supplied code does expose these fields/actions; actual deployed parity is still to be checked.
- Before production, complete Task 76 in `docs/tasks.md`: server-side authentication/authorization, least-data responses, and tests rejecting unauthorized reads/writes.

**Owner input:** Public-link access is accepted for the prototype. When convenient, confirm deployed-code parity and actual data exposure through the Google UI. Do not paste URLs containing secrets or credentials into chat.

**Exit check:** Deployed script version, actual headers, initialization state, and sensitive data exposure are documented. Public-link access remains explicitly prototype-only. No sheet data or schema has been modified during investigation.

### Phase 1 — Freeze the Domain Rules

**Goal:** Define what each record means before moving responsibilities between files.

**Work:**
- Confirm entity IDs and relationships for Member, MemberStatusHistory, Schedule, AttendanceLog, RSVP, Location, ProgramCard, and Config.
- Separate original facts from current calculated views. For example, attendance logs are source events; attendance status and statistics are calculated views.
- Define each entity's create/update/cancel/delete/merge behavior, including which operations preserve history.
- Record timestamp rules, schedule identity rules, membership eligibility dates, and treatment of missing legacy fields.
- Resolve the open decisions listed above only when the relevant phase needs them.

**Exit check:** An owner-reviewed domain glossary, relationship diagram, and lifecycle table exist. Each rule is marked agreed, proposed, or open.

### Phase 2 — Define Storage and Request Contracts

**Goal:** Make it unambiguous when a screen may say a change was saved.

**Work:**
- Define a shared request/response meaning: confirmed success, confirmed rejection, or unknown outcome.
- Ensure reads are reads and do not create, repair, or upload records as a side effect.
- Define which data is authoritative in Sheets, which browser data is only a cache, and what a stale/offline screen must communicate.
- Define server-side authorization and the minimum data returned to each kind of user.
- Confirm stable IDs and retry behavior for operations where a response may be lost.
- Keep any new sheet field/tab proposals separate for owner approval.

**Exit check:** Each operation has a plain-language outcome and data contract. A client cannot treat a local update or unreadable response as confirmed storage.

### Phase 3 — Restore Member Identity Integrity

**Goal:** Prevent new duplicate accounts and repair old duplicates without changing historical attendance.

**Work:**
- Apply the agreed exact match rule at the server-side registration boundary while holding the existing lock.
- Treat the screen's cached-list check as an early warning only.
- Route incomplete or partial matches to an explicit review path; never auto-merge from name or phone-last-four alone.
- Agree how a person is verified before binding to an existing account.
- Preserve merged member rows and `mergedIntoId` links. Prevent deletion of a row still needed to resolve historical member IDs.
- Make reporting follow explicit merge relationships, not guessed identity.
- Decide how conflicting current RSVP values are resolved before migrating existing merges.

**Exit check:** Concurrent registrations cannot create duplicate rows under the approved match rule; a merge preserves raw log IDs; merged identities remain resolvable after reload.

### Phase 4 — Make Attendance Reliable and Auditable

**Goal:** Only confirmed check-ins count, retries do not duplicate records, and corrections preserve the original event.

**Work:**
- Distinguish location/GPS rejection from spreadsheet write failure in the user experience.
- Wait for a readable server outcome before showing attendance success.
- On retry, reuse the same unique ID; the server confirms an existing row or appends once.
- Do not queue attendance offline. If the server cannot confirm, show the agreed short failure notice and retry guidance.
- Design separate records for operator corrections and reachable failure reports. Confirm data minimization, operator identity, sheet schema, and access rules before adding fields/tabs.
- Ensure attendance projections consume original events plus explicit corrections, without rewriting raw events.

**Exit check:** Tests cover success, server rejection, lost response then same-ID retry, repeated retry, correction, and no-offline-queue behavior. UI reports success only after server confirmation.

### Phase 5 — Stabilize Schedule and Related Data

**Goal:** A schedule edit has one confirmed value across all screens and preserves linked history.

**Work:**
- Define canonical Schedule ID behavior and how recurrence/series edits affect individual occurrences.
- Define edit, cancel, restore, archive, and deletion semantics for schedules with linked attendance or RSVP.
- Define how `locationId` and `programId` behave when a referenced location/card is changed or removed.
- Ensure a schedule edit is confirmed before all views refresh from the confirmed record.
- Verify RSVP deadline recalculation from the current saved schedule start, including schedule changes after the previous cutoff.

**Exit check:** Admin, Home, Calendar, QR, and member portal display the same confirmed schedule state; existing attendance links remain intact.

### Phase 6 — Enforce RSVP Rules

**Goal:** Keep one current intention per member/schedule and apply the agreed deadline.

**Work:**
- Enforce member cutoff at one hour before the current saved start; permit operator changes after the cutoff.
- Keep current-answer-only behavior; make cancellation mean “no current response,” not a resurrectable old response.
- Apply the agreed member-merge conflict rule before merging RSVP rows.
- Ensure the server validates the cutoff and current identity; a browser-only cutoff is not authoritative.

**Exit check:** Boundary tests cover just before, exactly at, and after cutoff; moving a schedule later/earlier; operator override; and merged accounts.

### Phase 7 — Make Views and Statistics Consistent

**Goal:** All screens calculate from the same confirmed inputs and use the same relationship rules.

**Work:**
- Define one consistent attendance projection from Members, Schedules, RSVP, and immutable attendance events.
- Remove name/date/prefix identity guesses only after affected legacy records are inventoried and mapped.
- Define explicit behavior for canceled schedules, non-required members, historical membership periods, and missing data.
- Ensure Home, Calendar, Admin matrix, Profile, Portal, and cumulative statistics use the same projection contract.
- Make cache refresh/stale status consistent across screens and devices.

**Exit check:** Cross-screen contract tests produce the same attendance/RSVP state for the same inputs; historical data is neither silently dropped nor attached to the wrong identity.

### Phase 8 — Decompose Responsibilities Gradually

**Goal:** Reduce the cost of future changes without changing agreed behavior.

**Work:**
- Separate domain responsibilities for Member, Schedule, Attendance, RSVP, Config, Location, and ProgramCard.
- Keep all Google Sheets transport behind `src/services/sheets.ts` as required by `AGENTS.md`.
- Move UI components to domain-facing hooks/use-cases instead of importing the all-purpose singleton directly.
- Separate storage parsing/migration, repository behavior, and pure calculations.
- Decompose large screens only around stable user workflows and data contracts.

**Exit check:** Domain modules can be tested independently; transport remains centralized; no change in approved behavior or sheet data.

### Phase 9 — Retire Legacy Paths and Operationalize

**Goal:** Remove fallback complexity only after its data is accounted for.

**Work:**
- Use an inventory to decide which v2 keys, mock defaults, local pending-member behavior, prefix/date fallbacks, and duplicate GAS copies are still needed.
- Migrate or retain each legacy record explicitly; never filter it merely because it is old or incomplete.
- Add deployment/version identification and a documented backup/restore procedure.
- Run the repository's required checks: `npm run typecheck`, `npm run lint`, and `npm test`; add build/deployment checks when a release is prepared.
- Compare production sheet counts and sampled projections before and after each rollout; keep a rollback plan.

**Exit check:** Only verified, documented compatibility paths remain; owners can identify the live script version and recover from a failed rollout.

## Owner Decision Gates

| Gate | Owner input | Default recommendation |
| --- | --- | --- |
| G0: Prototype endpoint review | Public-link access is accepted for the prototype; compare deployed code and inspect data exposure. | Before production, complete Task 76; the link itself does not protect roster data or admin actions. |
| G1: Existing-account verification | Decide how a member proves ownership when a matching roster record exists. | Do not equate matching name/phone with authentication; route weak/legacy matches to operator review. |
| G2: Merge RSVP conflict | Decide which current RSVP to keep when both IDs have one. | Prefer explicit operator resolution over silently choosing by timestamp; no history is retained. |
| G3: Failure-log details | Approve failure categories and fields/tabs for reachable failures. | Minimize personal/GPS data and never count a failure as attendance. |
| G4: Server access | Confirm who may read private roster/log data and perform admin writes. | Require server-enforced authorization and return only necessary data. |
| G5: Schema changes | Approve any new required tabs/headers. | Preserve existing headers and rows; add only after compatibility and migration review. |

These are decision points, not a request to answer all at once. The next discussion should begin at G0, then proceed only as each phase needs the next decision.

## Current Scope Boundary

This roadmap authorizes investigation, planning, and documentation only. It does not authorize application code changes, live spreadsheet edits, Apps Script deployment changes, data deletion, or schema changes. Each implementation phase needs its own explicit go-ahead after its decision gate and acceptance checks are agreed.
