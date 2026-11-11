# Simple mathematics games (replacement)

The active games are **Javobni top**, **Nechta qoldi?**, **Nechta bo‘ldi?**, and **Tenglik taqsimla**. The previous interactive scenes are retired. The rest of ZEROLAX uses its existing routes, authentication, seasonal tokens and coin ledger.

## Child experience

Open Home → Exams → Mini-games, then choose an exercise grade on the existing games catalog. Addition/subtraction are available for grades 1–5, multiplication from grade 2, and exact division from grade 3. Admins can disable more grades but cannot enable multiplication/division below these curriculum minimums. The selected grade is the exercise level; it is not a claim about a child's verified age or school enrollment.

Each game has a short visual practice question. The start button unlocks after the correct practice answer. Practice is local and awards no coins; successful practice can be remembered on the device. Actual rounds contain ten server-generated questions by default. The child taps one of three large (at least 64px high) answer buttons. There is no numeric input, dragging, manual allocation, object merging or basket-filling control.

Apples explain addition and multiplication, balloons demonstrate subtraction, and sweets in equal baskets explain division. Large quantities are explicitly labelled rather than rendering thousands of objects. Addition's guided counting continues across the two piles. Colors, cards and typography use the Autumn theme. Optional sound defaults off; animations are short and respect reduced motion.

The first answer is graded by the server. A wrong answer shows a visual/equation explanation and a guided correction; correcting it does not turn the recorded mistake into a point. Feedback distinguishes learning the correct answer from an initially correct answer. Results show correct/total, score, coins, encouragement, play again and home. Reload restores stored questions/feedback/results. Telegram Back and the in-game back control pause an unfinished round. Starting another round requires explicitly ending or continuing the active one; ending it asks for confirmation.

## Routes

| Route | Current purpose |
| --- | --- |
| `/exams` | Existing exam categories plus the Mini-games entry/count |
| `/exams/games` | Grade selection and available game cards |
| `/exams/games/find-answer` | Addition practice/start |
| `/exams/games/what-remains` | Subtraction practice/start |
| `/exams/games/how-many` | Multiplication practice/start |
| `/exams/games/share-equally` | Division practice/start |
| `/exams/games/round/:sessionId` | Existing round, feedback and results |
| `/exams/games/history` | Paginated completed new-game results |
| `/admin/games` | New game configuration, analytics and old-game archive |

Old game IDs (`addition`, `subtraction`, `multiplication`, `division`) no longer start a game. Their setup URLs and old `/games/play/:sessionId` URLs redirect to `/exams/games`. Valid newer `/games/round/:sessionId` links redirect to `/exams/games/round/:sessionId` and retain saved results. Direct student API access to an old session returns 410. Historical sessions are available to authorized admins through the archive.

## Archive and migration

`0008_simple_games.sql` adds `mini_games.archived_at`, disables the four old definitions and their level settings, and inserts four new definitions/twenty grade configurations. Old unfinished sessions become abandoned, retaining elapsed time, answers and partial scores. Completed sessions, question snapshots, progress and coin transactions are never deleted or rewritten. New game IDs keep new progress separate from the old scores. Existing RLS and permission checks remain in place.

`GameScenes.tsx` was removed, `GamesPage.tsx` and its styles were replaced, and the old visual-progress API and shared drag/allocation payloads were removed. The new visual component is `components/games/SimpleGameVisual.tsx`. Historical JSON stays readable in the archive without retaining old gameplay code.

Admins with `games.read` can view archive definitions, paginated sessions, individual saved questions/answers, progress aggregates and the related mini-game reward entries. `games.write` controls new definitions, translated names/descriptions, grade availability, number ranges, group sizes, difficulty, round size and rewards. Configuration writes are validated and audited. Two-step arithmetic is configurable for grades 4–5; division deliberately remains exact and single-step, and unsupported division settings are rejected.

## API and rewards

Student endpoints under `/api/games/user`:

- `GET /`, `/active`, `/history?limit=20&offset=0`
- `POST /start`: `{ gameId, grade, restartSessionId? }`; difficulty comes from the admin's grade configuration.
- `GET /sessions/:id`
- `POST /sessions/:id/answer`: `{ questionId, answer: { value } }`
- `POST /sessions/:id/{next|pause|resume|abandon|complete}`

Admin endpoints under `/api/games/admin`:

- `GET /`, `/analytics`, `/archive?limit=20&offset=0`, `/archive/sessions/:id`
- `PUT /:gameId`, `/:gameId/levels/:grade`

Three distinct choices are generated and persisted with each question. The API validates ownership, question order, allowed choices and immutable first answers. It rejects frontend score/reward fields. No reward is issued before the valid final answer. Profile/session locks and `mini-game:<sessionId>` ledger idempotency prevent duplicate rewards/progress. Default rewards remain one per correct answer, two for completion and three for a perfect round, subject to the shared Tashkent-day cap and platform reward switch.

A round snapshots settings at start. Later admin changes apply to new rounds; an already started round can still finish even if the game is disabled. Old archived sessions cannot be resumed or rewarded.

## Validation and runtime

API tests cover all available game/grade combinations through complete ten-question rounds, question generation/difficulty, real persisted choices, wrong-answer immutability, permissions, grade restrictions, reward retries/caps, admin settings and migration preservation. The browser test covers all four complete rounds at small Android widths, successful/incorrect practice, guided correction, reload, saved results, sound, reduced motion, Telegram Back, old-URL redirects and admin settings. These are automated tests, not observed sessions with actual children or a physical Telegram client.

The managed Windows environment refused to stop the already running API process (`Access is denied`). Its database was therefore not opened concurrently or migrated by force, and no backup was claimed. The current API must be restarted by its owner before the replacement is active against that database. The normal API startup applies the pending migration once, transactionally. Back up the stopped local `.data/zerolax` directory before restarting; keep any other pending migrations from concurrent work intact. No public tunnel renewal or permanent deployment is included.


## Exams entry and back navigation

Home, Profile and the primary navigation expose Exams rather than a direct mini-game entry. The bot /games command opens /exams. Only the Exams hub exposes the game catalog in ordinary navigation. The catalog is the same module, nested under /exams/games; old URLs remain redirects for bookmarks and saved sessions. Browser routes persist selection/session IDs, and the Telegram/in-app Back controls follow Exams → catalog → setup/round. No question, reward or progress behavior was changed in the move.
