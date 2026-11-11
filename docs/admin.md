# Admin control center

Sign in at `/admin/login` using the existing bootstrap administrator configured through `ADMIN_EMAIL` and `ADMIN_PASSWORD`. The application now opens the real analytics dashboard at `/admin`.

## Navigation and roles

The sidebar collapses on desktop and opens as a drawer on mobile. The top bar includes user search, breadcrumbs, language/theme controls and the current staff account. Navigation reflects the account's current role. Permissions are checked again on every backend request, including the older IQ, entrance, user, notification and audit APIs.

**Roles and staff** lets a superadmin create staff accounts, assign or disable accounts, create custom roles and choose explicit permissions. Built-in roles cover content, exams, support, finance, marketing and read-only analysis. The legacy `admin` role has no new broad permissions by default: assign it a suitable role. The existing per-admin learning permissions are retained for compatibility. Superadmins always have full access; self-demotion and removal of the last active superadmin are blocked. Passwords and password hashes are never returned by the staff API or written to audit details.

The user directory supports server-side search, status, Premium, grade, city/district, activity, certificate, score and registration-date filters, sorting and pagination. Phone search and phone fields require `users.private`. Exports obey the same restriction. User profiles include personal details, subject progress, exam answers, certificates, subscription/payment visibility by permission, staff notes and action history. Existing IQ/entrance histories and coin adjustments remain available.

## Analytics and reports

Analytics uses the real database with a date range and daily, weekly, monthly or yearly buckets. Charts support selecting a metric and individual data points. The dashboard includes registered/active/Premium users, active subscriptions, completed exams, certificates, distributed coins, learning scores, subject/grade breakdowns and seven-to-fourteen-day cohort retention. Completed-exam totals include learning, IQ and entrance attempts. Exam diagnostics can switch between learning, IQ and entrance tests. IQ answers and score diagnostics are excluded until the test's release time; no pass threshold is invented for IQ or entrance tests.

Revenue uses only provider-verified successful payments and is grouped by currency; amounts are stored and shown in provider minor units. Different currencies are never silently added together. Revenue is hidden without finance read permission. Recent activity and content-shortage alerts use stored records.

Reports cover users, registrations, learning progress, exams, certificates, subscriptions, payments and coins. CSV requires both `reports.export` and the relevant module read permission. Exported text is escaped against spreadsheet formula injection. Each export is audited. An export contains at most 10,000 records from the requested offset (`X-Export-Limit: 10000`); use smaller date ranges or subsequent offsets for larger datasets.

## Content and exam management

1. **Subjects and grades** manages custom subjects, visibility, ordering, covers and grades 5–11. Disabled subjects or grades cannot be opened through the student book API.
2. **Learning** retains book/topic/question creation, publishing, exam duration, global grading rules, manual Premium and extra-attempt management.
3. **Lesson editor** adds book covers/descriptions, TipTap rich text, KaTeX formulas, images and resource links, draft preview, topic duplication, guarded deletion/reordering and bulk publication. Topic reordering is limited to books without exam history, so existing student prerequisites cannot silently change. Used topics must be unpublished instead of deleted.
4. The question metadata editor sets difficulty, tags and images. Plain question text supports `$inline$` and `$$display$$` formulas on the learning test screen. Active attempts retain their original text, answers and image snapshot.
5. CSV question import first validates every row and reports errors/duplicates. Nothing is committed when any row is invalid. Committed questions start as drafts. Supported headers: `text,option1,option2,option3,option4,correctIndex,explanation`; correct indices are 0–3. Maximum 500 questions per import. Excel files can be exported to this CSV format; native XLSX upload is not provided.
6. Exam rules allow individual topic/intermediate pass scores, individual attempt limits and an exact easy/medium/hard question distribution. Counts must equal the configured exam size. Final-exam progression and certificate thresholds remain centrally managed. Database attempt enforcement uses the individual limit when configured.

Uploads accept PNG/JPEG/WebP up to 5 MB and 4096×4096 pixels. The server decodes/re-encodes them to PNG, removes metadata, rejects SVG/invalid files and returns an immutable media URL. Media is public course/marketing material; private documents must not be uploaded through this endpoint. Rich HTML is sanitized server-side and again when displayed. Mathematical rendering uses KaTeX with untrusted commands disabled.

## Marketing, support and system settings

**Ads and banners** supports title, description, validated image/link, placement, priority, enabled status and start/end times. A preview is available before saving. The public API only returns enabled banners inside their scheduled window. Home and learning placements render in the student application.

**Support** lists real student tickets and saves replies/status changes for the student's support area. **Coins** shows the immutable transaction ledger; adjustments continue through the existing user page. Difficulty reward values and enabling/disabling rewards affect real IQ and entrance scoring. Previously credited rewards are not rewritten.

**Certificates** supports search, grade/date/status filtering, authenticated PDF preview/download, public verification and revocation with a reason. Revocation history is available in the filtered audit log.

**System settings** controls branding, logo/favicon, supported language choices, registration, maintenance, support email and reward rules. Branding and language options reach the student interface. Maintenance blocks normal user APIs while preserving admin recovery, certificate verification and payment webhook processing. Settings changes are audited. Payment providers, pricing, durations and credentials are not invented; the provider-ready integration remains disabled until configured as described in [learning.md](learning.md).

## Verification and deployment limits

Run `npm.cmd test`, `npm.cmd run typecheck`, `npm.cmd run build -w @zerolax/web` and `npm.cmd run test:mobile`. The browser smoke uses an isolated in-memory database and exercises the student test, admin rules, mobile drawer, banners, dark theme, role creation and a formula lesson save/preview.

The managed workspace previously blocked tsup/esbuild from reading an ancestor directory. API/bot production bundling must be verified in a normal permitted build environment. No production database, Telegram bot or payment account has been modified by these tests.


## Telegram identity privacy — 2026-11-11

Ordinary profiles and settings use the public application profile only. Telegram ID, username, first/last name and development-auth metadata are absent from the public Profile type and serializer, login/refresh/me/update responses, and newly issued user JWTs. Profile photos remain an ordinary avatar feature; no Telegram ID/name is used as the display-name fallback. Existing cached profile fields are removed on read/write, and old user JWTs carrying a tg claim are refreshed transparently on app startup.

The admin user profile has a separate Telegram card. Its data comes from GET /api/admin/users/:id/telegram and requires both users.read and users.private. The response contains telegramId, username, firstName, lastName and linked. Superadmins retain access; other roles must explicitly have the existing private-data permission. linked means the stored identity is a real Telegram registration rather than a development identity; it is not a live Telegram account-reachability check.

Admins without users.private do not receive Telegram identity in lists, nested audit/details or delivery logs, and cannot search by hidden Telegram identity. User/registration CSV exports also omit these fields and never use Telegram names as a full-name fallback. Their first/last-name edit fields are omitted; direct attempts to update those fields require the private permission. Raw Telegram delivery-error text is withheld too. Educational names entered in the learning module remain ordinary learner data and retain CSV formula protection.

An API serialization boundary removes identity keys from authenticated student responses and from JSON admin responses without the private permission. The internal bot API keeps its existing server-to-server secret protection and necessary identity fields; no bot secret is exposed to the browser. Signed initData is still validated on the server. Telegram itself provides the SDK's launch data inside its WebView; this change prevents application API/display/storage disclosure and does not claim to suppress metadata supplied by the Telegram client itself.

Admin query caches are cancelled/cleared on logout, login and session expiry, so a less privileged account in the same browser cannot inherit a previous admin's cached identity card. The database and stored Telegram identity were not deleted or migrated.
