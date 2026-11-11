import { useStudyBack } from '../lib/study';
import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, ChevronLeft, Volume2, VolumeX, X } from 'lucide-react';
import { GAME_IDS, GAME_OPERATIONS, type GameCatalogEntry, type GameId, type GameQuestion, type GameSession } from '@zerolax/shared';
import { gameRequest, useGameWords, gameColors, gameSymbols, expression, questionText, explanation, playGameSound } from '../lib/games';
import { getTelegramWebApp } from '../lib/telegram';
import { SimpleGameVisual } from '../components/games/SimpleGameVisual';
import { PageHeader } from '../components/PageHeader';
import { Button } from '../components/ui/button';
import { cn } from '../lib/utils';
import '../games.css';

const gradeKey = 'zerolax.simple-games.grade';
function storedGrade() { try { const g = Number(localStorage.getItem(gradeKey)); return Number.isInteger(g) && g >= 1 && g <= 5 ? g : 1; } catch { return 1; } }
function readSetting(key: string) { try { return localStorage.getItem(key) === 'true'; } catch { return false; } }
function saveSetting(key: string, value: string) { try { localStorage.setItem(key, value); } catch { /* Storage is optional. */ } }
function useCatalog() { return useQuery({ queryKey: ['games-catalog'], queryFn: () => gameRequest<GameCatalogEntry[]>('/') }); }
function Issue({ message, retry }: { message: string; retry?: () => void }) {
  const { w } = useGameWords();
  return <div role="alert" className="space-y-3 rounded-xl border border-destructive/40 bg-card p-4"><p>{message}</p>{retry && <Button onClick={retry}>{w.retry}</Button>}<Link className="block text-primary underline" to="/exams/games">{w.gamesHome}</Link></div>;
}
export function GamesPage({ view }: { view: 'home' | 'setup' | 'play' | 'history' }) {
  const {gameId,sessionId}=useParams();
  return <div className="simple-game space-y-5">{view === 'home' ? <GamesHome /> : view === 'setup' ? <GameSetup key={gameId} /> : view === 'play' ? <GamePlay key={sessionId} /> : <GamesHistory />}</div>;
}
function GamesHome() {
  const back=useStudyBack('/exams',true);
  const { w, language } = useGameWords();
  const catalog = useCatalog();
  const [grade, setGrade] = useState(storedGrade);
  const active = useQuery({ queryKey: ['games-active'], queryFn: () => gameRequest<GameSession | null>('/active') });
  const available = catalog.data?.filter(g => g.enabled && g.levels.some(l => l.grade === grade && l.enabled));
  return <>
    <PageHeader title={w.title} subtitle={w.subtitle} backTo="/exams" onBack={back} />
    <fieldset className="space-y-2"><legend className="mb-2 text-sm font-bold">{w.chooseGrade}</legend><div className="grid grid-cols-5 gap-2">{[1,2,3,4,5].map(g => <button key={g} type="button" aria-label={`${g}-${w.grade}`} aria-pressed={g === grade} onClick={() => { setGrade(g); saveSetting(gradeKey, String(g)); }} className={cn('min-h-14 rounded-xl border-2 text-lg font-bold', g === grade ? 'border-primary bg-primary text-primary-foreground' : 'border-input bg-card')}>{g}<span className="block text-[10px]">{w.grade}</span></button>)}</div></fieldset>
    {active.data && <Link className="block rounded-xl border border-primary bg-card p-4 font-bold text-primary" to={`/exams/games/round/${active.data.id}`}>{w.activeRound} · {w.continue} →</Link>}
    {catalog.isLoading && <p aria-busy="true">…</p>}
    {catalog.error && <Issue message={w.error} retry={() => void catalog.refetch()} />}
    {available?.length === 0 && <p>{w.unavailable}</p>}
    <div className="grid gap-4 sm:grid-cols-2">{available?.map(g => <Link key={g.id} to={`/exams/games/${g.id}`} className="pressable overflow-hidden rounded-2xl border bg-card shadow-soft">
      <div className={cn('flex h-24 items-center justify-center gap-5 bg-gradient-to-br text-surface-ink', gameColors[g.id])} aria-hidden><span className="text-4xl">{g.id === 'what-remains' ? '🎈' : g.id === 'share-equally' ? '🍬' : '🍎'}</span><span className="text-4xl font-bold">{gameSymbols[g.id]}</span><span className="text-4xl">{g.id === 'share-equally' ? '🧺' : '🍏'}</span></div>
      <div className="space-y-2 p-4"><h2 className="font-display text-xl font-extrabold">{g.titles[language]}</h2><p className="text-sm text-muted-foreground">{g.descriptions[language]}</p><span className="inline-block pt-2 font-bold text-primary">{w.play} →</span></div>
    </Link>)}</div>
    <Link className="block rounded-xl border bg-card p-4 text-center font-semibold text-primary" to="/exams/games/history">{w.history}</Link>
  </>;
}
function practiceQuestion(game: GameId): GameQuestion {
  return { id: 'practice', position: 0, game, a: game === 'what-remains' ? 5 : game === 'share-equally' ? 6 : game === 'how-many' ? 2 : 3, b: game === 'how-many' ? 3 : 2, c: 0, choices: game === 'share-equally' ? [2,3,4] : game === 'how-many' ? [5,6,7] : game === 'what-remains' ? [2,3,4] : [4,5,6] };
}
function GameSetup() {
  const back=useStudyBack('/exams/games',true);
  const { gameId } = useParams();
  const { w, language } = useGameWords();
  const catalog = useCatalog();
  const navigate = useNavigate();
  const client = useQueryClient();
  const [grade] = useState(storedGrade);
  const [practiceAnswer, setPracticeAnswer] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [activeId, setActiveId] = useState('');
  const game = catalog.data?.find(g => g.id === gameId);
  if (!GAME_IDS.includes(gameId as GameId)) return <Navigate to="/exams/games" replace />;
  if (catalog.isLoading) return <p aria-busy="true">…</p>;
  if (catalog.error) return <Issue message={w.error} retry={() => void catalog.refetch()} />;
  if (!game?.enabled || !game.levels.some(l => l.grade === grade && l.enabled)) return <Issue message={w.unavailable} />;
  const q = practiceQuestion(game.id);
  const correct = q.game === 'find-answer' ? q.a + q.b : q.game === 'what-remains' ? q.a - q.b : q.game === 'how-many' ? q.a * q.b : q.a / q.b;
  const practiceKey = `zerolax.simple-games.practice.${game.id}`;
  const trained = readSetting(practiceKey);
  const ready = trained || practiceAnswer === correct;
  async function start() {
    if (busy || !ready) return;
    setBusy(true); setError('');
    try {
      const session = await gameRequest<GameSession>('/start', { gameId: game!.id, grade });
      saveSetting(practiceKey, 'true');
      void client.invalidateQueries({ queryKey: ['games-active'] });
      navigate(`/exams/games/round/${session.id}`, { replace: true });
    } catch (e) {
      const err = e as { code?: string; details?: { sessionId?: string } };
      if (err.code === 'GAME_ACTIVE') setActiveId(err.details?.sessionId ?? '');
      setError(err.code === 'GAME_UNAVAILABLE' ? w.unavailable : w.error);
    } finally { setBusy(false); }
  }
  return <>
    <PageHeader title={game.titles[language]} subtitle={trained ? game.descriptions[language] : w.practice} backTo="/exams/games" onBack={back} />
    {!trained && <section className="space-y-4 rounded-2xl border bg-card p-4">
      <p className="text-center font-semibold">{w.practiceHint}</p><h2 className="text-center text-xl font-extrabold">{questionText(q, language)}</h2>
      <SimpleGameVisual question={q} language={language} reveal={practiceAnswer !== null} />
      <AnswerButtons question={q} chosen={practiceAnswer} solution={practiceAnswer === null ? undefined : correct} disabled={practiceAnswer === correct} onChoose={setPracticeAnswer} />
      {practiceAnswer !== null && <p role="status" className="text-center font-bold">{practiceAnswer === correct ? w.practiceDone : w.wrong}</p>}
    </section>}
    <Button fullWidth size="lg" disabled={!ready || busy} loading={busy} onClick={() => void start()}>{trained ? w.play : w.start}</Button>
    {error && <Issue message={error} retry={() => void start()} />}
    {activeId && <div className="space-y-3"><Link className="block rounded-xl bg-primary p-4 text-center font-bold text-primary-foreground" to={`/exams/games/round/${activeId}`}>{w.continue}</Link><Button variant="outline" fullWidth onClick={async () => { if (!window.confirm(w.abandonConfirm)) return; try { await gameRequest(`/sessions/${activeId}/abandon`, {}); setActiveId(''); setError(''); void client.invalidateQueries({queryKey:['games-active']}); } catch { setError(w.error); } }}>{w.exit}</Button></div>}
  </>;
}
function AnswerButtons({ question, chosen, solution, disabled, onChoose }: { question: GameQuestion; chosen: number | null; solution?: number; disabled: boolean; onChoose: (n: number) => void }) {
  return <div className="grid grid-cols-3 gap-2" role="group" aria-label={expression(question)}>{question.choices.map(n => <button key={n} type="button" className="simple-answer" disabled={disabled} aria-pressed={chosen === n} data-state={solution === n ? 'correct' : chosen === n && solution !== undefined ? 'wrong' : undefined} onClick={() => onChoose(n)}><span>{n}</span>{solution === n && <Check className="mx-auto h-4 w-4" aria-hidden />}{chosen === n && solution !== undefined && solution !== n && <X className="mx-auto h-4 w-4" aria-hidden />}</button>)}</div>;
}
function GamePlay() {
  const { sessionId } = useParams();
  const { w } = useGameWords();
  const navigate = useNavigate();
  const client = useQueryClient();
  const query = useQuery({ queryKey: ['game-session', sessionId], queryFn: () => gameRequest<GameSession>(`/sessions/${sessionId}`), retry: false });
  const [sound, setSound] = useState(() => readSetting('zerolax.simple-games.sound'));
  const [lastFeedback, setLastFeedback] = useState(false);
  const [error, setError] = useState('');
  const leaving = useRef(false);
  const current = useRef(query.data); current.current = query.data;
  useEffect(() => {
    const back = async () => {
      if (leaving.current) return;
      leaving.current = true;
      try {
        if (current.current?.status === 'playing') await gameRequest(`/sessions/${sessionId}/pause`, {});
        void client.invalidateQueries({ queryKey: ['games-active'] });
        navigate('/exams/games');
      } catch { setError(w.error); leaving.current = false; }
    };
    const tg = getTelegramWebApp()?.BackButton;
    tg?.onClick(back); tg?.show();
    const handler = () => void back();
    window.addEventListener('simple-game-back', handler);
    return () => { tg?.offClick(back); tg?.hide(); window.removeEventListener('simple-game-back', handler); };
  }, [sessionId, navigate, client, w.error]);
  if (query.isLoading) return <p aria-busy="true">…</p>;
  if (query.error) return <Issue message={(query.error as { code?: string }).code === 'GAME_ARCHIVED' ? w.archived : w.error} retry={() => void query.refetch()} />;
  const s = query.data!;
  if (s.status === 'abandoned') return <Issue message={w.ended} />;
  if (s.status === 'completed' && !lastFeedback) return <GameResult session={s} />;
  return <>
    <div className="flex items-center justify-between gap-3"><button type="button" aria-label={w.back} className="grid h-12 w-12 place-items-center rounded-xl border border-input bg-card" onClick={() => window.dispatchEvent(new Event('simple-game-back'))}><ChevronLeft /></button><SoundButton sound={sound} setSound={setSound} /></div>
    {error && <Issue message={error} />}
    {s.status === 'paused' ? <div className="space-y-4 rounded-2xl border bg-card p-5"><h1 className="text-xl font-bold">{w.activeRound}</h1><Button fullWidth size="lg" onClick={async () => { try { const next = await gameRequest<GameSession>(`/sessions/${s.id}/resume`, {}); client.setQueryData(['game-session',sessionId], next); } catch { setError(w.error); } }}>{w.continue}</Button></div> : <QuestionRound key={s.question!.id} session={s} sound={sound} onSession={next => { client.setQueryData(['game-session',sessionId],next); if (next.status === 'completed') for (const key of ['games-active','games-catalog','games-history','me']) void client.invalidateQueries({queryKey:[key]}); }} onFinalAnswer={() => setLastFeedback(true)} onResults={() => setLastFeedback(false)} />}
  </>;
}
function SoundButton({ sound, setSound }: { sound: boolean; setSound: (value: boolean) => void }) {
  const { w } = useGameWords();
  return <button type="button" aria-label={w.sound} aria-pressed={sound} className="grid h-12 w-12 place-items-center rounded-xl border border-input bg-card" onClick={() => { setSound(!sound); saveSetting('zerolax.simple-games.sound', String(!sound)); }}>{sound ? <Volume2 /> : <VolumeX />}</button>;
}
function QuestionRound({ session: s, sound, onSession, onFinalAnswer, onResults }: { session: GameSession; sound: boolean; onSession: (s: GameSession) => void; onFinalAnswer: () => void; onResults: () => void }) {
  const { w, language } = useGameWords();
  const catalog = useCatalog();
  const q = s.question!;
  const [chosen, setChosen] = useState<number | null>(s.feedback?.answer.value ?? null);
  const [corrected, setCorrected] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const lock = useRef(false);
  const feedback = s.feedback;
  async function choose(value: number) {
    if (feedback) { setChosen(value); if (value === feedback.solution) { setCorrected(true); if (sound) playGameSound(true); } return; }
    if (lock.current) return;
    lock.current = true; setBusy(true); setError('');
    try {
      const next = await gameRequest<GameSession>(`/sessions/${s.id}/answer`, { questionId: q.id, answer: { value } });
      setChosen(value);
      if (next.status === 'completed') onFinalAnswer();
      if (sound) playGameSound(!!next.feedback?.correct);
      onSession(next);
    } catch { setError(w.error); } finally { lock.current = false; setBusy(false); }
  }
  return <section className="space-y-4" aria-busy={busy}>
    <div className="flex items-center justify-between gap-3 text-sm font-bold"><h1>{catalog.data?.find(g => g.id === s.gameId)?.titles[language] ?? w.title}</h1><span>{w.score}: {s.score}%</span></div>
    <div className="space-y-1"><div className="h-2 overflow-hidden rounded-full bg-secondary" role="progressbar" aria-label={w.question} aria-valuemin={0} aria-valuemax={s.total} aria-valuenow={s.answered}><div className="h-full bg-primary transition-[width]" style={{width:`${s.answered / s.total * 100}%`}} /></div><p className="text-center text-xs text-muted-foreground">{w.question} {q.position + 1} / {s.total}</p></div>
    <h2 className="text-center text-xl font-extrabold leading-snug">{questionText(q, language)}</h2>
    <SimpleGameVisual question={q} language={language} reveal={!!feedback} />
    <p className="text-center text-2xl font-extrabold">{expression(q)} = ?</p>
    <AnswerButtons question={q} chosen={chosen} solution={feedback?.solution} disabled={busy || !!feedback?.correct || corrected} onChoose={value => void choose(value)} />
    {error && <p role="alert" className="text-destructive">{error}</p>}
    {feedback && <div role="status" className={cn('space-y-2 rounded-xl border p-4', feedback.correct || corrected ? 'simple-success border-success/50 bg-success/10' : 'border-copper/50 bg-gold/10')}><h3 className="font-bold">{feedback.correct ? w.correct : corrected ? w.corrected : w.wrong}</h3><p className="text-sm leading-relaxed">{explanation(q, feedback, language)}</p>{!feedback.correct && !corrected && <p className="text-sm">{w.correctHint}</p>}</div>}
    {feedback && <Button fullWidth size="lg" disabled={busy || (!feedback.correct && !corrected)} onClick={async () => { if (s.status === 'completed') { onResults(); return; } setBusy(true); try { onSession(await gameRequest<GameSession>(`/sessions/${s.id}/next`, {})); } catch { setError(w.error); } finally { setBusy(false); } }}>{s.status === 'completed' ? w.results : w.next}</Button>}
  </section>;
}
function GameResult({ session: s }: { session: GameSession }) {
  const { w } = useGameWords();
  return <section className="space-y-5 rounded-2xl border bg-card p-5 text-center"><span aria-hidden className="text-5xl">🏅</span><Link to="/exams/games" className="block text-sm font-semibold text-primary">← {w.gamesHome}</Link><h1 className="font-display text-2xl font-extrabold">{w.resultTitle}</h1><p className="text-muted-foreground">{w.encourage}</p><div className="grid grid-cols-3 gap-2"><div className="rounded-xl bg-secondary p-3"><p className="text-2xl font-extrabold">{s.correct}/{s.total}</p><p className="text-xs">{w.correctCount}</p></div><div className="rounded-xl bg-primary/10 p-3"><p className="text-2xl font-extrabold">{s.score}%</p><p className="text-xs">{w.score}</p></div><div className="rounded-xl bg-gold/15 p-3"><p className="text-2xl font-extrabold text-gold-deep">+{s.coins}</p><p className="text-xs">{w.coins}</p></div></div><Link className="block rounded-xl bg-primary p-4 font-bold text-primary-foreground" onClick={() => saveSetting(gradeKey,String(s.grade))} to={`/exams/games/${s.gameId}`}>{w.newRound}</Link><Link className="block rounded-xl border border-input p-4 font-bold" to="/">{w.home}</Link></section>;
}
function GamesHistory() {
  const back=useStudyBack('/exams/games',true);
  const { w, language } = useGameWords();
  const catalog = useCatalog();
  const [offset,setOffset] = useState(0);
  const q = useQuery({queryKey:['games-history',offset],queryFn:()=>gameRequest<Array<{id:string;game_id:GameId;grade:number;status:string;score:number;correct_count:number;total:number}>>(`/history?limit=20&offset=${offset}`)});
  return <><PageHeader title={w.history} backTo="/exams/games" onBack={back} />{q.error && <Issue message={w.error} retry={()=>void q.refetch()} />}{q.isLoading && <p>…</p>}{q.data?.length===0 && <p>{w.noHistory}</p>}<div className="space-y-3">{q.data?.map(s=><Link key={s.id} className="flex items-center justify-between gap-3 rounded-xl border bg-card p-4" to={`/exams/games/round/${s.id}`}><span className="font-bold">{catalog.data?.find(g=>g.id===s.game_id)?.titles[language]}<span className="block text-xs text-muted-foreground">{s.grade}-{w.grade} · {s.correct_count}/{s.total}</span></span><span className="font-extrabold">{s.score}%</span></Link>)}</div><div className="flex justify-between"><Button variant="outline" disabled={offset===0} onClick={()=>setOffset(Math.max(0,offset-20))}>{w.previous}</Button><Button variant="outline" disabled={(q.data?.length??0)<20} onClick={()=>setOffset(offset+20)}>{w.more}</Button></div></>;
}
