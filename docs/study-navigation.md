# Algebra and Geometry navigation correction

The homepage previously sent both subjects to the combined `/learning` dashboard, where lessons, exams, history and certificates shared a view. Subject cards now enter separate grade-selection routes. Existing generic learning links and public certificate verification remain supported.

## Student routes added

| Algebra | Geometry | View |
| --- | --- | --- |
| `/algebra` | `/geometry` | Seven database-backed grade cards, grades 5–11 |
| `/algebra/grades/:gradeId` | `/geometry/grades/:gradeId` | Books alias |
| `/algebra/grades/:gradeId/books` | `/geometry/grades/:gradeId/books` | Published books for exactly this subject and grade |
| `/algebra/grades/:gradeId/books/:bookId/topics` | `/geometry/grades/:gradeId/books/:bookId/topics` | Ordered topics, completion/access/test states |
| `/algebra/grades/:gradeId/books/:bookId/topics/:topicId` | `/geometry/grades/:gradeId/books/:bookId/topics/:topicId` | Actual lesson content and topic-test entry |
| `/algebra/grades/:gradeId/books/:bookId/attempts/:attemptId` | `/geometry/grades/:gradeId/books/:bookId/attempts/:attemptId` | Existing server-backed exam attempt and result |

`/certificates` is a separate authenticated module, accessible from Profile and the desktop sidebar. `/certificates/:id` remains the existing public verification route. Subject cards never point to either certificate route. No automatic certificate navigation occurs after a topic test. Qualifying final results may show an explicit link to the certificate module.

Grade/book/topic identity lives in the URL, so refresh and direct links retain context. Browser Back uses normal router history. Telegram Back and the page Back control pop in-app history when present and use the hierarchy parent as a fallback for direct navigation. Telegram button listeners are detached when the page changes.

## API routes added

All subject endpoints are below `/api/learning/user/subjects` and inherit the existing authenticated user guard:

- `GET /:subject/grades`
- `GET /:subject/grades/:gradeId/books`
- `GET /:subject/grades/:gradeId/books/:bookId/topics`
- `GET /:subject/grades/:gradeId/books/:bookId/topics/:topicId`
- `POST /:subject/grades/:gradeId/books/:bookId/exams/:examId/start`
- `GET /:subject/grades/:gradeId/books/:bookId/attempts/:attemptId`
- `PUT /:subject/grades/:gradeId/books/:bookId/attempts/:attemptId/answers`
- `POST /:subject/grades/:gradeId/books/:bookId/attempts/:attemptId/submit`

`GET /api/learning/user/certificates` lists only the current student's certificates with pagination.

The backend checks enabled subject/grade, published book ownership of subject/grade, topic ownership of book, attempt/exam ownership of book and authenticated user, progression locks and active Premium. Invalid identifiers return 404. Topic lists omit lesson bodies. Direct locked lesson access is rejected server-side, not just hidden in the UI. Free-topic access uses each book's configured limit, default three. Existing grading, retakes, timers, snapshots and final-certificate generation are reused.

Topic tests in the new flow require exactly ten questions. An incompatible admin question-count setting or historical active attempt produces an explicit error rather than starting a shorter test. No existing attempts are deleted or rewritten. Administrators should retain the default topic question count of ten for these modules.

No database migration was necessary: subject/grade/book/topic/question/exam/progress relationships already exist. No production books, topics or progress were inserted, deleted or reassigned. Browser fixtures are isolated in-memory test data, not frontend hardcoded courses or production seeds.

## Exact source-file manifest

New:

- `apps/api/src/routes/study.ts`
- `apps/web/src/pages/SubjectLearningPage.tsx`
- `apps/web/src/pages/CertificatesPage.tsx`
- `apps/web/src/lib/study.ts`
- `packages/shared/src/study.ts`
- `apps/api/tests/study-fixture.ts`
- `apps/api/tests/study.test.ts`
- `apps/api/scripts/study-navigation.test.ts`
- `docs/study-navigation.md`

Modified:

- `apps/api/src/routes/learning.ts` — scoped router and certificate listing registration.
- `apps/web/src/App.tsx` — subject/grade/book/topic/attempt routes and the certificate module route.
- `apps/web/src/pages/HomePage.tsx` — whole-card links to `/algebra` and `/geometry`.
- `apps/web/src/pages/ProfilePage.tsx` — independent certificate-module entry, including mobile.
- `apps/web/src/components/Layout.tsx` — desktop certificate-module navigation.
- `apps/web/src/components/PageHeader.tsx` — optional history-aware Back handler, preserving other callers.
- `packages/shared/src/index.ts` — shared study-response type exports.
- `packages/shared/src/i18n/uz.ts` — certificate navigation label.
- `packages/shared/src/i18n/ru.ts` — certificate navigation label.
- `packages/shared/src/i18n/en.ts` — certificate navigation label.
- `vitest.mobile.config.ts` — include the new browser acceptance suite.
- `DEVELOPMENT_STATUS.md` — change and validation record.

## Acceptance coverage

The browser suite starts from the actual homepage and checks all twelve requested scenarios: Algebra/Geometry grade cards, no certificate redirect, grade/subject-filtered books, ordered topics, lesson opening, free/Premium topic-four access, separate progress, certificate-module access, and Telegram Back. It also checks ten questions, real server result calculation, formulas, refresh, browser Back, incorrect subject/book URLs, invalid grades and desktop layout. The Telegram SDK BackButton is stubbed in the isolated browser test; real device appearance still requires a Telegram-client check.

The API suite additionally checks ownership/malformed IDs, unauthorized requests, active/revoked Premium, admin free-limit overrides, exact question counts, separate subject progress, absence of topic certificates and disabled grades.

Validation completed: `npm.cmd test` (79 tests, nine files), workspace type checking, web production build and both browser suites. The navigation suite was also rerun after adding the Profile certificate-module link. Current live-preview books count is zero; empty-grade views reflect the actual database, not missing frontend fixtures.
