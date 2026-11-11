import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { GameDefinition, GameLevel } from "@zerolax/shared";
import { gameRequest, useGameWords } from "../../lib/games";
import { control, toast, useUnsaved } from "../../lib/admin-control";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import {
  Field,
  DataTable,
  selectClass,
} from "../../components/admin/ControlUi";
export function AdminGamesPage() {
  const { w, language } = useGameWords();
  const [selected, setSelected] = useState("find-answer");
  const [grade, setGrade] = useState(1);
  const q = useQuery({
    queryKey: ["admin-games"],
    queryFn: () =>
      gameRequest<{
        definitions: GameDefinition[];
        levels: Array<{ game_id: string; grade: number; config: GameLevel }>;
      }>("/", undefined, "GET", true),
  });
  const analytics = useQuery({
    queryKey: ["admin-games-analytics"],
    queryFn: () =>
      gameRequest<{
        games: Record<string, unknown>[];
        grades: Record<string, unknown>[];
      }>("/analytics", undefined, "GET", true),
  });
  const permissions = useQuery({
    queryKey: ["control-permissions"],
    queryFn: () => control<{ permissions: string[] }>("/me"),
  });
  const writable =
    permissions.data?.permissions.includes("games.write") ?? false;
  const game = q.data?.definitions.find((g) => g.id === selected);
  const level = q.data?.levels.find(
    (l) => l.game_id === selected && l.grade === grade,
  )?.config;
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold">{w.admin}</h1>
      {(q.error || analytics.error) && (
        <p role="alert" className="text-destructive">
          {q.error?.message ?? analytics.error?.message}
        </p>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={w.title}>
          <select
            className={selectClass}
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
          >
            {q.data?.definitions.map((g) => (
              <option key={g.id} value={g.id}>
                {g.titles[language]}
              </option>
            ))}
          </select>
        </Field>
        <Field label={w.grade}>
          <select
            className={selectClass}
            value={grade}
            onChange={(e) => setGrade(Number(e.target.value))}
          >
            {q.data?.levels
              .filter((l) => l.game_id === selected)
              .map((l) => (
                <option key={l.grade} value={l.grade}>
                  {l.grade}-{w.grade}
                </option>
              ))}
          </select>
        </Field>
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        {game && (
          <GameForm
            key={game.id + game.questionsPerRound + game.enabled}
            initial={game}
            writable={writable}
            onSave={() => q.refetch()}
          />
        )}
        {game && level && (
          <LevelForm
            key={game.id + "-" + grade}
            gameId={game.id}
            initial={level}
            writable={writable}
            onSave={() => q.refetch()}
          />
        )}
      </div>
      <ArchiveGames />
      <section className="space-y-3">
        <h2 className="text-lg font-bold">{w.analytics}</h2>
        <DataTable rows={analytics.data?.games ?? []} />
        <DataTable rows={analytics.data?.grades ?? []} />
      </section>
    </div>
  );
}
function GameForm({
  initial,
  writable,
  onSave,
}: {
  initial: GameDefinition;
  writable: boolean;
  onSave: () => unknown;
}) {
  const { w } = useGameWords();
  const [g, setG] = useState(initial);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  useUnsaved(dirty);
  function edit(next: GameDefinition) {
    setG(next);
    setDirty(true);
  }
  return (
    <form
      className="space-y-4 rounded-xl border bg-card p-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          await gameRequest("/" + g.id, g, "PUT", true);
          setDirty(false);
          toast(w.saved);
          await onSave();
        } catch (error) {
          toast((error as Error).message, true);
        } finally {
          setBusy(false);
        }
      }}
    >
      <fieldset disabled={!writable || busy} className="space-y-3">
        <label className="flex gap-2">
          <input
            type="checkbox"
            checked={g.enabled}
            onChange={(e) => edit({ ...g, enabled: e.target.checked })}
          />
          {w.enabled}
        </label>
        {(["uz", "ru", "en"] as const).map((lang) => (
          <div key={lang} className="space-y-2">
            <Field
              label={
                lang === "uz"
                  ? w.titleUz
                  : lang === "ru"
                    ? w.titleRu
                    : w.titleEn
              }
            >
              <Input
                required
                maxLength={100}
                value={g.titles[lang]}
                onChange={(e) =>
                  edit({
                    ...g,
                    titles: { ...g.titles, [lang]: e.target.value },
                  })
                }
              />
            </Field>
            <Field label={w.description + " " + lang.toUpperCase()}>
              <textarea
                required
                maxLength={1000}
                className={selectClass + " h-20 py-2"}
                value={g.descriptions[lang]}
                onChange={(e) =>
                  edit({
                    ...g,
                    descriptions: { ...g.descriptions, [lang]: e.target.value },
                  })
                }
              />
            </Field>
          </div>
        ))}
        <Field label={w.questions}>
          <Input
            type="number"
            min={1}
            max={30}
            value={g.questionsPerRound}
            onChange={(e) =>
              edit({ ...g, questionsPerRound: Number(e.target.value) })
            }
          />
        </Field>
        {(
          [
            { key: "correct", label: w.reward },
            { key: "completion", label: w.completion },
            { key: "perfect", label: w.perfect },
            { key: "dailyCap", label: w.dailyCap },
          ] as const
        ).map((f) => (
          <Field key={f.key} label={f.label}>
            <Input
              type="number"
              min={0}
              max={f.key === "dailyCap" ? 10000 : 100}
              value={g.rewards[f.key]}
              onChange={(e) =>
                edit({
                  ...g,
                  rewards: { ...g.rewards, [f.key]: Number(e.target.value) },
                })
              }
            />
          </Field>
        ))}
        <Button disabled={!dirty}>{w.save}</Button>
      </fieldset>
    </form>
  );
}
function LevelForm({
  gameId,
  initial,
  writable,
  onSave,
}: {
  gameId: string;
  initial: GameLevel;
  writable: boolean;
  onSave: () => unknown;
}) {
  const { w } = useGameWords();
  const [level, setLevel] = useState(initial);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  useUnsaved(dirty);
  function edit(next: GameLevel) {
    setLevel(next);
    setDirty(true);
  }
  return (
    <form
      className="space-y-4 rounded-xl border bg-card p-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          await gameRequest(
            `/${gameId}/levels/${level.grade}`,
            level,
            "PUT",
            true,
          );
          setDirty(false);
          toast(w.saved);
          await onSave();
        } catch (error) {
          toast((error as Error).message, true);
        } finally {
          setBusy(false);
        }
      }}
    >
      <h2 className="font-bold">
        {level.grade}-{w.grade} · {w.difficulty}
      </h2>
      <fieldset disabled={!writable || busy} className="space-y-3">
        {(
          [
            { key: "enabled", label: w.enabled },
            ...(gameId !== "share-equally" ? [{ key: "multiStep", label: w.multiStep } as const] : []),
          ] as const
        ).map((f) => (
          <label key={f.key} className="flex gap-2">
            <input
              type="checkbox"
              checked={level[f.key]}
              onChange={(e) => edit({ ...level, [f.key]: e.target.checked })}
            />
            {f.label}
          </label>
        ))}
        {(
          [
            { key: "minValue", label: w.min },
            { key: "maxValue", label: w.max },
            { key: "maxGroups", label: w.maxGroups },
            { key: "maxPerGroup", label: w.maxPerGroup },
          ] as const
        ).map((f) => (
          <Field key={f.key} label={f.label}>
            <Input
              type="number"
              min={f.key === "minValue" ? 0 : 1}
              max={
                f.key === "maxGroups"
                  ? 12
                  : f.key === "maxPerGroup"
                    ? 100
                    : 100000
              }
              value={level[f.key]}
              onChange={(e) =>
                edit({ ...level, [f.key]: Number(e.target.value) })
              }
            />
          </Field>
        ))}
        <Field label={w.difficulty}><select className={selectClass} value={level.difficulty} onChange={e=>edit({...level,difficulty:e.target.value as GameLevel['difficulty']})}>{(['easy','normal','hard'] as const).map(d=><option key={d} value={d}>{w[d]}</option>)}</select></Field>
        <Button disabled={!dirty}>{w.save}</Button>
      </fieldset>
    </form>
  );
}

function ArchiveGames() {
  const {w}=useGameWords();
  const [offset,setOffset]=useState(0);
  const [selected,setSelected]=useState('');
  const archive=useQuery({queryKey:['admin-games-archive',offset],queryFn:()=>gameRequest<{definitions:Record<string,unknown>[];sessions:Array<Record<string,unknown>&{id:string}>;total:number}>(`/archive?limit=20&offset=${offset}`,undefined,'GET',true)});
  const details=useQuery({queryKey:['admin-games-archive-session',selected],queryFn:()=>gameRequest<{session:Record<string,unknown>;questions:Record<string,unknown>[];progress:Record<string,unknown>[];rewards:Record<string,unknown>[]}>(`/archive/sessions/${selected}`,undefined,'GET',true),enabled:!!selected});
  return <section className="space-y-3 rounded-xl border bg-card p-4"><h2 className="text-lg font-bold">{w.archive}</h2>
    {archive.error && <p role="alert">{archive.error.message}</p>}
    <DataTable rows={archive.data?.definitions.map(g=>({id:g.id,enabled:g.enabled,archived_at:g.archived_at}))??[]} />
    <DataTable rows={archive.data?.sessions??[]} />
    <div className="flex flex-wrap gap-2">{archive.data?.sessions.map(s=><Button key={s.id} variant="outline" onClick={()=>setSelected(s.id)}>{w.details}: {s.id.slice(0,8)}</Button>)}</div>
    {details.error&&<p role="alert">{details.error.message}</p>}
    {details.data&&<div className="min-w-0 overflow-x-auto"><DataTable rows={details.data.progress} /><DataTable rows={details.data.rewards} /><DataTable rows={details.data.questions.map(q=>({position:q.position,payload:JSON.stringify(q.payload),answer:JSON.stringify(q.answer),correct:q.correct,solution:q.solution}))} /></div>}
    <div className="flex justify-between"><Button variant="outline" disabled={offset===0} onClick={()=>setOffset(Math.max(0,offset-20))}>{w.previous}</Button><Button variant="outline" disabled={offset+20>=(archive.data?.total??0)} onClick={()=>setOffset(offset+20)}>{w.more}</Button></div>
  </section>;
}
