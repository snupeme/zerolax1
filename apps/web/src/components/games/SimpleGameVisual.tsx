import { GAME_OPERATIONS, type GameQuestion, type Language } from '@zerolax/shared';
import { Apple, Candy } from 'lucide-react';
import { cn } from '../../lib/utils';

function ObjectIcon({ kind, green = false }: { kind: 'apple' | 'balloon' | 'candy'; green?: boolean }) {
  const color = green ? 'text-success' : kind === 'candy' ? 'text-copper' : 'text-burgundy';
  return kind === 'balloon' ? (
    <svg viewBox="0 0 32 44" className={cn('h-11 w-8', color)} fill="none" aria-hidden="true">
      <ellipse cx="16" cy="14" rx="11" ry="13" fill="currentColor" />
      <path d="m16 27-3 4h6l-3-4Zm0 4c-7 4 7 6 0 12" stroke="currentColor" strokeWidth="1.5" />
      <path d="M10 8c0-2 2-3 4-3" stroke="hsl(var(--surface-ink))" strokeWidth="2" strokeLinecap="round" />
    </svg>
  ) : kind === 'apple' ? <Apple aria-hidden className={cn('h-9 w-9 fill-current', color)} /> : <Candy aria-hidden className={cn('h-9 w-9', color)} />;
}
function Pile({ count, kind, green, countAlong, removed = 0, compact = false, startAt = 0 }: {
  count: number; kind: 'apple' | 'balloon' | 'candy'; green?: boolean; countAlong?: boolean; removed?: number; compact?: boolean; startAt?: number;
}) {
  // Never draw thousands of tiny objects: show an explicit quantity with one recognizable icon.
  if (count > 20 || (compact && count > 6)) return <div className="flex min-h-16 flex-wrap items-center justify-center gap-2 rounded-xl bg-background p-3"><ObjectIcon kind={kind} green={green} /><span className="text-2xl font-extrabold">× {count}</span>{removed > 0 && <span className="text-lg text-burgundy">− {removed}</span>}</div>;
  return <div className="flex min-h-14 flex-wrap items-center justify-center gap-2 p-1" aria-hidden="true">
    {count === 0 ? <span className="text-2xl font-bold">0</span> : Array.from({ length: count }, (_, i) => (
      <span key={i} className={cn('simple-object relative inline-flex flex-col items-center', i >= count - removed && 'simple-object-gone')}>
        <ObjectIcon kind={kind} green={green} />
        {countAlong && i < count - removed && <span className="simple-count text-xs font-bold" style={{ animationDelay: `${i * .04}s` }}>{startAt + i + 1}</span>}
      </span>
    ))}
  </div>;
}
export function SimpleGameVisual({ question: q, reveal = false, language }: { question: GameQuestion; reveal?: boolean; language: Language }) {
  const op = GAME_OPERATIONS[q.game];
  const names = { uz: { apple: 'olma', candy: 'konfet', balloon: 'shar', basket: 'savat' }, ru: { apple: 'яблок', candy: 'конфет', balloon: 'шариков', basket: 'корзинка' }, en: { apple: 'apples', candy: 'sweets', balloon: 'balloons', basket: 'basket' } }[language];
  const label = op === 'addition' ? `${q.a} + ${q.b}${q.c ? ` + ${q.c}` : ''} ${names.apple}` : op === 'subtraction' ? `${q.a} ${names.balloon}, − ${q.b + q.c}` : op === 'multiplication' ? `${q.a} × ${q.b} ${names.apple}${q.c ? ` + ${q.c}` : ''}` : `${q.a} ${names.candy}, ${q.b} ${names.basket}`;
  return <div role="img" aria-label={label} className="space-y-3 rounded-2xl border border-border bg-secondary/40 p-3 sm:p-4">
    {op === 'addition' ? <div className="flex flex-wrap items-center justify-center gap-2">
      <div className="min-w-20 flex-1"><Pile count={q.a} kind="apple" countAlong={reveal} /></div>
      <span aria-hidden className="text-2xl font-extrabold text-primary">+</span>
      <div className="min-w-20 flex-1"><Pile count={q.b} kind="apple" green countAlong={reveal} startAt={q.a} /></div>
      {q.c > 0 && <><span className="text-2xl font-extrabold">+</span><Pile count={q.c} kind="apple" countAlong={reveal} startAt={q.a+q.b} /></>}
    </div> : op === 'subtraction' ? <><Pile count={q.a} kind="balloon" removed={q.b + q.c} countAlong={reveal} /><p className="text-center text-base font-bold text-burgundy">− {q.b}{q.c > 0 ? ` − ${q.c}` : ''}</p></> : <>
      {op === 'division' && <div className="space-y-2"><div className="flex flex-wrap items-center justify-center gap-2"><ObjectIcon kind="candy" /><span className="text-lg font-bold">{q.a} {names.candy} → {q.b} {names.basket}</span></div><p className="text-center text-xl text-copper" aria-hidden>↓</p></div>}
      <div className={cn("grid gap-2", (op === "multiplication" ? q.a : q.b) > 4 ? "grid-cols-3" : "grid-cols-2 sm:grid-cols-3")}>
        {Array.from({ length: op === 'multiplication' ? q.a : q.b }, (_, i) => <div key={i} className={cn('rounded-b-2xl rounded-t-lg border-2 border-copper/50 bg-card p-2', op === 'division' && 'simple-distribution')} style={{ animationDelay: `${i * .05}s` }}>
          <p className="mb-1 text-center text-xs font-bold text-muted-foreground">{i + 1}. {names.basket}</p>
          <Pile count={op === 'multiplication' ? q.b : q.a / q.b} kind={op === 'multiplication' ? 'apple' : 'candy'} countAlong={reveal} compact={(op === "multiplication" ? q.a : q.b) > 4} />
        </div>)}
      </div>
      {op === 'multiplication' && <p className="text-center text-lg font-bold">{Array(q.a).fill(q.b).join(' + ')}{q.c ? ` + ${q.c}` : ''} = ?</p>}
      {op === 'multiplication' && q.c > 0 && <Pile count={q.c} kind="apple" green countAlong={reveal} />}
    </>}
  </div>;
}
