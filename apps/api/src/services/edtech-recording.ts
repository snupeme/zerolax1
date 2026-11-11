import type { Queryable } from '@zerolax/db';
import { GAME_OPERATIONS, type GameId } from '@zerolax/shared';
import {
  recordActivity,
  recordMistakes,
  type ActivityInput,
  type MistakeInput,
} from './edtech';

/**
 * Bridges the existing exam/game scorers into the EdTech activity log.
 * Every function is called inside the same transaction as the submission that
 * produced the result, so activity and rewards can never drift apart.
 */

function optionList(rows: Array<{ text_uz: string }>): string[] {
  return rows.map((row) => row.text_uz);
}

interface QuestionDetailRow {
  id: string;
  text_uz: string;
  explanation_uz: string | null;
  difficulty: string;
  correct_option_index: number;
  options: Array<{ text_uz: string }>;
  selected_position: number | null;
}

export async function recordIqSubmission(
  tx: Queryable,
  userId: string,
  attemptId: string,
  testId: string,
): Promise<void> {
  const rows = await tx.query<QuestionDetailRow>(
    `select q.id, q.text_uz, q.explanation_uz, q.difficulty, q.correct_option_index,
            coalesce((select json_agg(json_build_object('text_uz', o.text_uz) order by o.position)
                        from iq_question_options o where o.question_id = q.id), '[]'::json) as options,
            sel.position as selected_position
       from iq_questions q
       left join iq_user_answers a on a.attempt_id = $1 and a.question_id = q.id
       left join iq_question_options sel on sel.id = a.selected_option_id
      where q.test_id = $2
      order by q.position`,
    [attemptId, testId],
  );

  const activities: ActivityInput[] = [];
  const mistakes: MistakeInput[] = [];
  let correctCount = 0;
  let answered = 0;

  for (const row of rows) {
    const options = optionList(row.options ?? []);
    const answeredCorrect =
      row.selected_position === null ? null : row.selected_position === row.correct_option_index;
    if (answeredCorrect !== null) {
      answered += 1;
      if (answeredCorrect) correctCount += 1;
      activities.push({
        kind: 'question',
        subject: 'iq',
        topicKey: 'daily-iq',
        topic: 'Daily IQ',
        questionRef: row.id,
        correct: answeredCorrect,
        sourceType: 'iq_attempt',
        sourceId: attemptId,
      });
    }
    if (answeredCorrect === false) {
      mistakes.push({
        source: 'iq',
        sourceQuestionId: row.id,
        subject: 'iq',
        topicKey: 'daily-iq',
        topic: 'Daily IQ',
        question: {
          text: row.text_uz,
          options,
          correctIndex: Number(row.correct_option_index),
        },
        selectedAnswer: options[row.selected_position ?? -1] ?? null,
        correctAnswer: options[row.correct_option_index] ?? null,
        explanation: row.explanation_uz ?? '',
        difficulty: row.difficulty,
      });
    }
  }

  activities.push({
    kind: 'test',
    subject: 'iq',
    topicKey: 'daily-iq',
    topic: 'Daily IQ',
    score: rows.length > 0 ? Math.round((correctCount * 10000) / rows.length) / 100 : 0,
    sourceType: 'iq_attempt',
    sourceId: attemptId,
    metadata: { answered, total: rows.length },
  });

  await recordMistakes(tx, userId, mistakes);
  await recordActivity(tx, userId, activities);
}

export async function recordEntranceSubmission(
  tx: Queryable,
  userId: string,
  attemptId: string,
  testId: string,
): Promise<void> {
  const [test] = await tx.query<{ subject: string; title_uz: string }>(
    'select subject, title_uz from entrance_tests where id=$1',
    [testId],
  );
  const subject = test?.subject ?? 'entrance';
  const topic = test?.title_uz ?? 'Entrance test';

  const rows = await tx.query<QuestionDetailRow>(
    `select q.id, q.text_uz, q.explanation_uz, q.difficulty, q.correct_option_index,
            coalesce((select json_agg(json_build_object('text_uz', o.text_uz) order by o.position)
                        from entrance_question_options o where o.question_id = q.id), '[]'::json) as options,
            sel.position as selected_position
       from entrance_questions q
       left join entrance_user_answers a on a.attempt_id = $1 and a.question_id = q.id
       left join entrance_question_options sel on sel.id = a.selected_option_id
      where q.test_id = $2
      order by q.position`,
    [attemptId, testId],
  );

  const activities: ActivityInput[] = [];
  const mistakes: MistakeInput[] = [];
  let correctCount = 0;
  let answered = 0;

  for (const row of rows) {
    const options = optionList(row.options ?? []);
    const answeredCorrect =
      row.selected_position === null ? null : row.selected_position === row.correct_option_index;
    if (answeredCorrect !== null) {
      answered += 1;
      if (answeredCorrect) correctCount += 1;
      activities.push({
        kind: 'question',
        subject,
        topicKey: `entrance:${testId}`,
        topic,
        questionRef: row.id,
        correct: answeredCorrect,
        sourceType: 'entrance_attempt',
        sourceId: attemptId,
      });
    }
    if (answeredCorrect === false) {
      mistakes.push({
        source: 'entrance',
        sourceQuestionId: row.id,
        subject,
        topicKey: `entrance:${testId}`,
        topic,
        question: {
          text: row.text_uz,
          options,
          correctIndex: Number(row.correct_option_index),
        },
        selectedAnswer: options[row.selected_position ?? -1] ?? null,
        correctAnswer: options[row.correct_option_index] ?? null,
        explanation: row.explanation_uz ?? '',
        difficulty: row.difficulty,
      });
    }
  }

  activities.push({
    kind: 'test',
    subject,
    topicKey: `entrance:${testId}`,
    topic,
    score: rows.length > 0 ? Math.round((correctCount * 10000) / rows.length) / 100 : 0,
    sourceType: 'entrance_attempt',
    sourceId: attemptId,
    metadata: { answered, total: rows.length },
  });

  await recordMistakes(tx, userId, mistakes);
  await recordActivity(tx, userId, activities);
}

export interface LearningQuestionResult {
  questionId: string;
  snapshot: {
    text: string;
    options: string[];
    correctIndex: number;
    explanation?: string;
    imageUrl?: string | null;
  };
}

export async function recordLearningSubmission(
  tx: Queryable,
  userId: string,
  input: {
    attemptId: string;
    bookId: string;
    topicId: string | null;
    kind: string;
    unlocked: boolean;
    questions: LearningQuestionResult[];
    answers: Record<string, number>;
  },
): Promise<void> {
  const [book] = await tx.query<{ subject: string; title: string; grade: number }>(
    'select subject, title, grade from learning_books where id=$1',
    [input.bookId],
  );
  let topicTitle = '';
  if (input.topicId) {
    const [topic] = await tx.query<{ title: string }>(
      'select title from learning_topics where id=$1',
      [input.topicId],
    );
    topicTitle = topic?.title ?? '';
  }
  const subject = book?.subject ?? 'algebra';
  const topicKey = input.topicId ?? input.bookId;
  const topic = topicTitle || book?.title || 'Learning';

  const activities: ActivityInput[] = [];
  const mistakes: MistakeInput[] = [];
  let correctCount = 0;
  let answered = 0;

  for (const question of input.questions) {
    const selected = input.answers[question.questionId];
    const correct =
      selected === undefined || selected === null
        ? null
        : Number(selected) === Number(question.snapshot.correctIndex);
    if (correct !== null) {
      answered += 1;
      if (correct) correctCount += 1;
      activities.push({
        kind: 'question',
        subject,
        topicKey,
        topic,
        questionRef: question.questionId,
        correct,
        sourceType: 'learning_attempt',
        sourceId: input.attemptId,
      });
    }
    if (correct === false) {
      mistakes.push({
        source: 'learning',
        sourceQuestionId: question.questionId,
        subject,
        topicKey,
        topic,
        question: {
          text: question.snapshot.text,
          options: question.snapshot.options,
          correctIndex: Number(question.snapshot.correctIndex),
          imageUrl: question.snapshot.imageUrl ?? null,
        },
        selectedAnswer: question.snapshot.options[Number(selected)] ?? null,
        correctAnswer: question.snapshot.options[Number(question.snapshot.correctIndex)] ?? null,
        explanation: question.snapshot.explanation ?? '',
        difficulty: 'medium',
      });
    }
  }

  activities.push({
    kind: 'test',
    subject,
    topicKey,
    topic,
    score:
      input.questions.length > 0
        ? Math.round((correctCount * 10000) / input.questions.length) / 100
        : 0,
    sourceType: 'learning_attempt',
    sourceId: input.attemptId,
    metadata: { answered, total: input.questions.length, examKind: input.kind },
  });

  if (input.kind === 'topic') {
    activities.push({
      kind: 'topic',
      subject,
      topicKey,
      topic,
      correct: input.unlocked,
      sourceType: 'learning_attempt',
      sourceId: input.attemptId,
    });
  }

  await recordMistakes(tx, userId, mistakes);
  await recordActivity(tx, userId, activities);
}

function gameExpression(gameId: string, a: number, b: number, c: number): string {
  const operation = GAME_OPERATIONS[gameId as GameId] ?? 'addition';
  if (operation === 'addition') return c ? `${a} + ${b} + ${c}` : `${a} + ${b}`;
  if (operation === 'subtraction') return c ? `${a} − ${b} − ${c}` : `${a} − ${b}`;
  if (operation === 'multiplication') return c ? `${a} × ${b} + ${c}` : `${a} × ${b}`;
  return `${a} ÷ ${b}`;
}

export async function recordGameRound(
  tx: Queryable,
  userId: string,
  sessionId: string,
  gameId: string,
): Promise<void> {
  const rows = await tx.query<{
    id: string;
    payload: { game: GameId; a: number; b: number; c: number; choices: number[] };
    solution: number;
    answer: { value: number } | null;
    correct: boolean | null;
  }>(
    `select id, payload, solution, answer, correct from mini_game_questions
      where session_id=$1 order by position`,
    [sessionId],
  );

  const activities: ActivityInput[] = [];
  const mistakes: MistakeInput[] = [];
  for (const row of rows) {
    if (row.correct === null) continue;
    const text = gameExpression(gameId, row.payload.a, row.payload.b, row.payload.c);
    activities.push({
      kind: 'game',
      subject: 'games',
      topicKey: gameId,
      topic: gameId,
      questionRef: row.id,
      correct: row.correct,
      sourceType: 'mini_game',
      sourceId: sessionId,
    });
    if (!row.correct) {
      const options = (row.payload.choices ?? []).map(String);
      mistakes.push({
        source: 'games',
        sourceQuestionId: row.id,
        subject: 'games',
        topicKey: gameId,
        topic: gameId,
        question: {
          text,
          options,
          correctIndex: Math.max(0, options.indexOf(String(row.solution))),
        },
        selectedAnswer: row.answer ? String(row.answer.value) : null,
        correctAnswer: String(row.solution),
        explanation: '',
        difficulty: 'easy',
      });
    }
  }

  await recordMistakes(tx, userId, mistakes);
  await recordActivity(tx, userId, activities);
}
