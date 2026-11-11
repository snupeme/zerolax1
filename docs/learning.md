# Learning, Premium and certificates

The learning system extends the existing application. Daily IQ and entrance exams retain their original question counts, schedules and attempt limits.

## Admin workflow

Open `/admin/learning`. The existing bootstrap superadmin has all learning permissions.

1. Create a book under Algebra or Geometry, grade 5–11. Book order is scoped to subject and grade. Set the number of free topics (default 3).
2. Add topics with lesson text and positions starting at 1. Lesson text is rendered as plain text, so pasted HTML cannot execute scripts.
3. Add at least ten published questions per topic. Each question has four choices and one correct answer. The editor supports edits and unpublishing. Existing attempts use their saved snapshots, so later question edits cannot change their scores.
4. Publish the book, topics and their topic exams. Adding topic 10, 20, etc. prepares a draft intermediate exam. A draft final exam is also created. Publish these after the question bank is ready. Exam rows show IDs and editable time limits.
5. Use **Exam rules** to change thresholds, topic question count, attempt limit or allow retakes after passing. The preview shows effects at boundary scores. The 40–49 policy starts as `pending`; the client/admin must choose `repeat` or `review`. No fixed policy is invented.
6. Use **Student details** with a user ID to inspect attempts, progress, certificates and additional-attempt grants. Granting an attempt requires an exam ID and reason. Grants can be revoked. An already passed exam still needs the explicit retake setting enabled.
7. Use **Premium subscriptions** to grant dated access, extend an admin subscription or revoke access. Choose the expiration date and reason before using **Extend**. The same backend access check handles paid and manual subscriptions.
8. The certificate tab provides verification, owner/admin PDF downloads and reasoned revocation. Public verification shows student name, grade, book, score, completion time, exam duration, verification ID and revocation status only.

Sensitive writes are recorded in the existing admin audit log. A superadmin may assign scoped permissions with `PUT /api/learning/admin/permissions/:adminId` and an array drawn from `content`, `settings`, `attempts`, `premium`, `payments`, `certificates`, `students`. Regular admins receive none by default. Permission management currently uses the API; there is no permission editor in the new dashboard.

## Student workflow

Open `/learning` from either subject card on the home page. Enter the full student name and grade before the final exam. The first published book in each subject/grade is available; passing a final exam unlocks the next existing book in that sequence.

Topic tests use ten questions by default, intermediate and final exams always use twenty. Topic question count and maximum attempts are configurable. Intermediate exams cover a block of ten topics; those topic tests must be passed first. The next block requires the preceding intermediate exam. Final exams require all published topic tests and each complete block's intermediate exam.

The server stores question IDs and immutable question snapshots on start, resumes active attempts and calculates scores. Each attempt snapshots its grading settings. Default attempt limit is two; additional grants are counted separately. Database constraints and a trigger protect the limit, sequence and active-attempt uniqueness. Duplicate submissions return the original result.

Answers are saved during the test. Once the server deadline passes, only previously saved answers count. A background tick finalizes expired attempts even if the student closes the app. Expiring Premium removes content access but never deletes progress, answers, subscriptions or results.

## Certificate deployment

Certificates are generated after qualifying final submissions, stored as private `bytea` data in the database and delivered only through authenticated owner/admin endpoints. The worker retries missing PDF generation. PDF and QR generation use `pdfkit` and `qrcode`. Unique user/book and attempt constraints prevent duplicates.

- Configure the real public `WEB_URL`; QR codes point to `${WEB_URL}/certificates/:verificationId`.
- Configure `CERTIFICATE_FONT_PATH` to a Unicode TrueType font for student names. The renderer automatically detects Windows Arial or Linux DejaVu Sans when available. Missing fonts return `CERTIFICATE_FONT_REQUIRED`; the exam result stays recorded and PDF generation can retry after configuration.
- Serve the SPA fallback for `/certificates/*` so public QR links work on direct navigation.
- Existing downloaded PDFs cannot be recalled. The verification page is the current source of revocation status.

## Payment integration pending client selection

No provider, price, currency or duration is assumed. Checkout and webhook requests return HTTP 503 until a real provider adapter and plan are supplied to `buildApp({ paymentPlan })`.

Implement `PaymentProvider` in `apps/api/src/services/learning-payments.ts` using the chosen provider's official checkout and authenticated verification APIs. `verifyWebhook` receives the exact JSON request bytes and headers; it must reject invalid signatures and return only provider-verified events. If the provider uses a different content type, register its scoped raw-body parser as part of that adapter.

The server creates the pending transaction before checkout, stores the provider reference and activates access only after verified provider, payment ID, transaction ID, amount and currency match. Provider event and transaction IDs are unique. Duplicate delivery cannot extend or duplicate subscriptions. Refunds revoke the associated subscription. Browser success messages never activate access. Failed, pending, expired and refunded transactions are retained for admins.

Production adapters, credentials and provider-specific verification tests remain pending. Internal tests use explicit test-adapter events to check the transaction state machine; they do not simulate a real successful charge.

## Verification

```powershell
npm.cmd test
npm.cmd run typecheck
npm.cmd run build
# Requires Chrome/Edge installed, or CHROME_PATH; uses an isolated in-memory DB.
npm.cmd run test:mobile
```

The mobile smoke uses the built web app, a 390×844 viewport, real API calls and a temporary test account. It is a browser check, not an actual Telegram WebView/device test.
