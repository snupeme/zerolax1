import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Plus, RefreshCw, Save, Trash2 } from "lucide-react";
import { PageHeader } from "../../components/PageHeader";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { EdtechError, EdtechLoading, EdtechStat } from "../../components/edtech/EdtechBits";
import {
  downloadEdtechCsv,
  edtechAdminRequest,
  useEdtechWords,
  subjectLabel,
  type LeaderboardPeriod,
} from "../../lib/edtech";
import { useI18n } from "../../i18n/I18nProvider";
import { cn } from "../../lib/utils";

type Tab = "overview" | "missions" | "leaderboard" | "decks" | "mistakes" | "achievements" | "reports" | "settings" | "activity";

interface Localized {
  uz: string;
  ru: string;
  en: string;
}

interface AdminMission {
  id: string;
  code: string;
  metric: string;
  target: number;
  reward_coins: number;
  titles: Localized;
  descriptions: Localized;
  active: boolean;
  sort_order: number;
  starts_on: string | null;
  ends_on: string | null;
  completions: number;
}

interface AdminDeck {
  id: string;
  subject: string;
  grade: number | null;
  titles: Localized;
  descriptions: Localized;
  status: "draft" | "published";
  position: number;
  card_count: number;
}

interface AdminCard {
  id: string;
  front: Localized;
  back: Localized;
  explanation: Localized;
  example: Localized;
  difficulty: "easy" | "medium" | "hard";
  position: number;
  status: "draft" | "published";
}

interface AdminAchievement {
  id: string;
  code: string;
  title_uz: string;
  title_ru: string;
  title_en: string;
  description_uz: string;
  description_ru: string;
  description_en: string;
  icon: string;
  coin_reward: number;
  criteria: { type?: string; value?: number };
  active: boolean;
  sort_order: number;
  awarded: number;
}

interface EdtechSettings {
  intervals: Record<"again" | "hard" | "good" | "easy", number>;
  leaderboardWeights: { correct: number; test: number };
  streakRewards: Record<string, number>;
}

const blankLocalized: Localized = { uz: "", ru: "", en: "" };

export function AdminEdtechPage() {
  const w = useEdtechWords();
  const [tab, setTab] = useState<Tab>("overview");
  const tabs: Array<{ value: Tab; label: string }> = [
    { value: "overview", label: w.overview },
    { value: "missions", label: w.missionsShort },
    { value: "leaderboard", label: w.leaderboardShort },
    { value: "decks", label: w.decks },
    { value: "mistakes", label: w.mistakesShort },
    { value: "achievements", label: w.achievementsShort },
    { value: "reports", label: w.reportsShort },
    { value: "settings", label: w.settings },
    { value: "activity", label: w.activity },
  ];

  return (
    <div className="space-y-5">
      <PageHeader title={w.admin} subtitle={w.adminSubtitle} backTo="/admin" />
      <div className="flex flex-wrap gap-1.5">
        {tabs.map((item) => (
          <button
            key={item.value}
            type="button"
            aria-pressed={tab === item.value}
            onClick={() => setTab(item.value)}
            className={cn(
              "rounded-lg border px-3 py-2 text-xs font-bold transition-colors",
              tab === item.value ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-muted-foreground hover:bg-muted",
            )}
          >
            {item.label}
          </button>
        ))}
      </div>
      {tab === "overview" ? <OverviewTab /> : null}
      {tab === "missions" ? <MissionsTab /> : null}
      {tab === "leaderboard" ? <LeaderboardTab /> : null}
      {tab === "decks" ? <DecksTab /> : null}
      {tab === "mistakes" ? <MistakesTab /> : null}
      {tab === "achievements" ? <AchievementsTab /> : null}
      {tab === "reports" ? <ReportsTab /> : null}
      {tab === "settings" ? <SettingsTab /> : null}
      {tab === "activity" ? <ActivityTab /> : null}
    </div>
  );
}

function OverviewTab() {
  const w = useEdtechWords();
  const overview = useQuery({
    queryKey: ["admin-edtech-overview"],
    queryFn: () =>
      edtechAdminRequest<{
        totals: Record<string, number>;
        kinds: Array<{ kind: string; total: number }>;
        daily: Array<{ date: string; total: number }>;
      }>("/overview"),
  });
  if (overview.isLoading) return <EdtechLoading />;
  if (overview.isError || !overview.data) return <EdtechError onRetry={() => void overview.refetch()} />;
  const { totals, kinds, daily } = overview.data;
  const maxDaily = Math.max(1, ...daily.map((day) => day.total));
  const metrics: Array<[string, number]> = [
    ["today_activity", totals.today_activity],
    ["active_7d", totals.active_7d],
    ["missions_completed_today", totals.missions_completed_today],
    ["open_mistakes", totals.open_mistakes],
    ["cards_reviewed_today", totals.cards_reviewed_today],
    ["active_streaks", totals.active_streaks],
    ["achievements_awarded", totals.achievements_awarded],
    ["decks", totals.decks],
    ["cards", totals.cards],
  ];
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        {metrics.map(([key, value]) => (
          <EdtechStat key={key} label={key.replaceAll("_", " ")} value={Number(value ?? 0)} />
        ))}
      </div>
      <Card className="p-4">
        <p className="mb-3 text-xs font-bold uppercase tracking-widest text-muted-foreground">{w.activity} · 14d</p>
        <div className="flex h-32 items-end gap-1">
          {daily.map((day) => (
            <div key={day.date} className="flex flex-1 flex-col items-center gap-1">
              <span className="text-[9px] text-muted-foreground">{day.total}</span>
              <div className="w-full rounded-t bg-primary" style={{ height: `${Math.max(3, (day.total / maxDaily) * 100)}%` }} />
              <span className="text-[8px] text-muted-foreground">{day.date.slice(5)}</span>
            </div>
          ))}
        </div>
      </Card>
      <Card className="p-4">
        <p className="mb-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">Kinds · 30d</p>
        <div className="flex flex-wrap gap-2">
          {kinds.map((kind) => (
            <Badge key={kind.kind} variant="outline">
              {kind.kind}: {kind.total}
            </Badge>
          ))}
        </div>
      </Card>
    </div>
  );
}

function LocalizedFields({ value, onChange, label }: { value: Localized; onChange: (value: Localized) => void; label: string }) {
  return (
    <div className="space-y-1">
      <p className="text-[11px] font-semibold text-muted-foreground">{label}</p>
      {(["uz", "ru", "en"] as const).map((lang) => (
        <input
          key={lang}
          value={value[lang]}
          onChange={(event) => onChange({ ...value, [lang]: event.target.value })}
          placeholder={lang.toUpperCase()}
          aria-label={`${label} ${lang}`}
          className="h-9 w-full rounded-lg border border-input bg-background px-2.5 text-xs"
        />
      ))}
    </div>
  );
}

function emptyMissionForm() {
  return {
    code: "",
    metric: "questions_answered",
    target: 10,
    rewardCoins: 5,
    titles: { ...blankLocalized },
    descriptions: { ...blankLocalized },
    active: true,
    sortOrder: 0,
    startsOn: "",
    endsOn: "",
  };
}

function MissionsTab() {
  const w = useEdtechWords();
  const client = useQueryClient();
  const missions = useQuery({
    queryKey: ["admin-edtech-missions"],
    queryFn: () => edtechAdminRequest<{ missions: AdminMission[] }>("/missions"),
  });
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyMissionForm);
  const refresh = () => {
    void client.invalidateQueries({ queryKey: ["admin-edtech-missions"] });
    void client.invalidateQueries({ queryKey: ["admin-edtech-overview"] });
  };
  const save = useMutation({
    mutationFn: () => {
      const body = {
        ...form,
        startsOn: form.startsOn || null,
        endsOn: form.endsOn || null,
      };
      return editingId
        ? edtechAdminRequest(`/missions/${editingId}`, { method: "PATCH", body })
        : edtechAdminRequest("/missions", { method: "POST", body });
    },
    onSuccess: () => {
      setOpen(false);
      setEditingId(null);
      setForm(emptyMissionForm());
      refresh();
    },
  });
  const update = useMutation({
    mutationFn: ({ id, body }: { id: string; body: object }) =>
      edtechAdminRequest(`/missions/${id}`, { method: "PATCH", body }),
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationFn: (id: string) => edtechAdminRequest(`/missions/${id}`, { method: "DELETE" }),
    onSuccess: refresh,
  });
  const startCreate = () => {
    setEditingId(null);
    setForm(emptyMissionForm());
    setOpen((value) => !value);
  };
  const startEdit = (mission: AdminMission) => {
    setEditingId(mission.id);
    setOpen(true);
    setForm({
      code: mission.code,
      metric: mission.metric,
      target: mission.target,
      rewardCoins: mission.reward_coins,
      titles: { ...blankLocalized, ...mission.titles },
      descriptions: { ...blankLocalized, ...mission.descriptions },
      active: mission.active,
      sortOrder: mission.sort_order,
      startsOn: mission.starts_on ?? "",
      endsOn: mission.ends_on ?? "",
    });
  };

  if (missions.isLoading) return <EdtechLoading />;
  if (missions.isError || !missions.data) return <EdtechError onRetry={() => void missions.refetch()} />;

  return (
    <div className="space-y-3">
      <Button leftIcon={<Plus className="h-4 w-4" />} onClick={startCreate}>
        {w.create}
      </Button>
      {open ? (
        <Card className="space-y-3 p-4">
          <div className="grid gap-2 sm:grid-cols-2">
            <input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder={w.code} aria-label={w.code} className="h-9 rounded-lg border border-input bg-background px-2.5 text-xs" />
            <select value={form.metric} onChange={(e) => setForm({ ...form, metric: e.target.value })} aria-label={w.metric} className="h-9 rounded-lg border border-input bg-background px-2.5 text-xs">
              {["questions_answered", "algebra_topic", "geometry_practice", "flashcards_reviewed", "mistakes_reviewed", "daily_test"].map((metric) => (
                <option key={metric} value={metric}>{metric}</option>
              ))}
            </select>
            <input type="number" min={1} value={form.target} onChange={(e) => setForm({ ...form, target: Number(e.target.value) })} placeholder={w.target} aria-label={w.target} className="h-9 rounded-lg border border-input bg-background px-2.5 text-xs" />
            <input type="number" min={0} value={form.rewardCoins} onChange={(e) => setForm({ ...form, rewardCoins: Number(e.target.value) })} placeholder={w.rewardCoins} aria-label={w.rewardCoins} className="h-9 rounded-lg border border-input bg-background px-2.5 text-xs" />
            <label className="space-y-1 text-[11px] font-semibold text-muted-foreground">
              <span className="block">{w.startDate}</span>
              <input type="date" value={form.startsOn} onChange={(e) => setForm({ ...form, startsOn: e.target.value })} aria-label={w.startDate} className="h-9 w-full rounded-lg border border-input bg-background px-2.5 text-xs" />
            </label>
            <label className="space-y-1 text-[11px] font-semibold text-muted-foreground">
              <span className="block">{w.endDate}</span>
              <input type="date" value={form.endsOn} onChange={(e) => setForm({ ...form, endsOn: e.target.value })} aria-label={w.endDate} className="h-9 w-full rounded-lg border border-input bg-background px-2.5 text-xs" />
            </label>
          </div>
          <LocalizedFields label={w.titles} value={form.titles} onChange={(titles) => setForm({ ...form, titles })} />
          <LocalizedFields label={w.descriptions} value={form.descriptions} onChange={(descriptions) => setForm({ ...form, descriptions })} />
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-xs font-semibold">
              <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} /> {w.active}
            </label>
            <Button loading={save.isPending} onClick={() => save.mutate()}>{w.save}</Button>
            <Button variant="ghost" onClick={() => { setOpen(false); setEditingId(null); }}>{w.cancel}</Button>
          </div>
          {save.isError ? <p className="text-xs text-destructive">{w.error}</p> : null}
        </Card>
      ) : null}
      <div className="space-y-2">
        {missions.data.missions.map((mission) => (
          <Card key={mission.id} className="flex flex-wrap items-center gap-3 p-3.5">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{mission.titles?.uz || mission.code}</p>
              <p className="text-[11px] text-muted-foreground">
                {mission.code} · {mission.metric} · {mission.target} · +{mission.reward_coins} coin · {w.completions}: {mission.completions}
              </p>
              {mission.starts_on || mission.ends_on ? (
                <p className="text-[10px] text-muted-foreground">
                  {w.startDate}: {mission.starts_on ?? "—"} · {w.endDate}: {mission.ends_on ?? "—"}
                </p>
              ) : null}
            </div>
            <Badge variant={mission.active ? "success" : "default"}>{mission.active ? w.active : w.draft}</Badge>
            <Button size="sm" variant="outline" onClick={() => startEdit(mission)}>
              {w.edit}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => update.mutate({ id: mission.id, body: { active: !mission.active } })}
            >
              {mission.active ? w.locked : w.active}
            </Button>
            <Button
              size="sm"
              variant="destructive"
              leftIcon={<Trash2 className="h-3.5 w-3.5" />}
              onClick={() => {
                if (window.confirm(w.confirmDelete)) remove.mutate(mission.id);
              }}
            >
              {w.delete}
            </Button>
          </Card>
        ))}
      </div>
    </div>
  );
}

function DecksTab() {
  const w = useEdtechWords();
  const { language } = useI18n();
  const client = useQueryClient();
  const [selected, setSelected] = useState<AdminDeck | null>(null);
  const [form, setForm] = useState({
    subject: "algebra",
    grade: 5,
    titles: { ...blankLocalized },
    descriptions: { ...blankLocalized },
    status: "draft" as "draft" | "published",
    position: 0,
  });
  const decks = useQuery({
    queryKey: ["admin-edtech-decks"],
    queryFn: () => edtechAdminRequest<{ decks: AdminDeck[] }>("/decks"),
  });
  const refresh = () => {
    void client.invalidateQueries({ queryKey: ["admin-edtech-decks"] });
    void client.invalidateQueries({ queryKey: ["admin-edtech-overview"] });
  };
  const create = useMutation({
    mutationFn: () => edtechAdminRequest("/decks", { method: "POST", body: form }),
    onSuccess: () => {
      setForm({ ...form, titles: { ...blankLocalized }, descriptions: { ...blankLocalized } });
      refresh();
    },
  });
  const update = useMutation({
    mutationFn: ({ id, body }: { id: string; body: object }) => edtechAdminRequest(`/decks/${id}`, { method: "PATCH", body }),
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationFn: (id: string) => edtechAdminRequest(`/decks/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      setSelected(null);
      refresh();
    },
  });

  if (decks.isLoading) return <EdtechLoading />;
  if (decks.isError || !decks.data) return <EdtechError onRetry={() => void decks.refetch()} />;

  return (
    <div className="space-y-3">
      <Card className="space-y-3 p-4">
        <div className="grid gap-2 sm:grid-cols-4">
          <select value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} aria-label={w.subject} className="h-9 rounded-lg border border-input bg-background px-2.5 text-xs">
            {["algebra", "geometry", "dtm", "sat", "english"].map((subject) => (
              <option key={subject} value={subject}>{subjectLabel(subject, language)}</option>
            ))}
          </select>
          <input type="number" min={1} max={11} value={form.grade} onChange={(e) => setForm({ ...form, grade: Number(e.target.value) })} aria-label={w.subject} className="h-9 rounded-lg border border-input bg-background px-2.5 text-xs" />
          <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as "draft" | "published" })} aria-label={w.status} className="h-9 rounded-lg border border-input bg-background px-2.5 text-xs">
            <option value="draft">{w.draft}</option>
            <option value="published">{w.published}</option>
          </select>
          <Button loading={create.isPending} onClick={() => create.mutate()}>{w.create}</Button>
        </div>
        <LocalizedFields label={w.titles} value={form.titles} onChange={(titles) => setForm({ ...form, titles })} />
        <LocalizedFields label={w.descriptions} value={form.descriptions} onChange={(descriptions) => setForm({ ...form, descriptions })} />
      </Card>
      <div className="grid gap-2 md:grid-cols-2">
        {decks.data.decks.map((deck) => (
          <Card key={deck.id} className={cn("space-y-2 p-3.5", selected?.id === deck.id && "border-primary/40")}>
            <div className="flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{deck.titles?.uz || deck.id}</p>
                <p className="text-[11px] text-muted-foreground">
                  {subjectLabel(deck.subject, language)} · {deck.grade ?? "—"} · {deck.card_count} {w.cards}
                </p>
              </div>
              <Badge variant={deck.status === "published" ? "success" : "default"}>{deck.status === "published" ? w.published : w.draft}</Badge>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <Button size="sm" variant="outline" onClick={() => setSelected(selected?.id === deck.id ? null : deck)}>
                {w.cards}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => update.mutate({ id: deck.id, body: { status: deck.status === "published" ? "draft" : "published" } })}
              >
                {deck.status === "published" ? w.draft : w.published}
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={() => {
                  if (window.confirm(w.confirmDelete)) remove.mutate(deck.id);
                }}
              >
                {w.delete}
              </Button>
            </div>
            {selected?.id === deck.id ? <DeckCards deck={deck} /> : null}
          </Card>
        ))}
      </div>
    </div>
  );
}

function DeckCards({ deck }: { deck: AdminDeck }) {
  const w = useEdtechWords();
  const client = useQueryClient();
  const [form, setForm] = useState({
    front: { ...blankLocalized },
    back: { ...blankLocalized },
    explanation: { ...blankLocalized },
    example: { ...blankLocalized },
    difficulty: "medium" as "easy" | "medium" | "hard",
    status: "published" as "draft" | "published",
    position: 0,
  });
  const cards = useQuery({
    queryKey: ["admin-edtech-cards", deck.id],
    queryFn: () => edtechAdminRequest<{ cards: AdminCard[] }>(`/decks/${deck.id}/cards`),
  });
  const refresh = () => {
    void client.invalidateQueries({ queryKey: ["admin-edtech-cards", deck.id] });
    void client.invalidateQueries({ queryKey: ["admin-edtech-decks"] });
  };
  const create = useMutation({
    mutationFn: () => edtechAdminRequest(`/decks/${deck.id}/cards`, { method: "POST", body: form }),
    onSuccess: () => {
      setForm({ ...form, front: { ...blankLocalized }, back: { ...blankLocalized }, explanation: { ...blankLocalized }, example: { ...blankLocalized } });
      refresh();
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => edtechAdminRequest(`/cards/${id}`, { method: "DELETE" }),
    onSuccess: refresh,
  });

  return (
    <div className="space-y-2 rounded-xl border border-border bg-muted/30 p-3">
      <LocalizedFields label={w.front} value={form.front} onChange={(front) => setForm({ ...form, front })} />
      <LocalizedFields label={w.backSide} value={form.back} onChange={(back) => setForm({ ...form, back })} />
      <LocalizedFields label={w.explanation} value={form.explanation} onChange={(explanation) => setForm({ ...form, explanation })} />
      <LocalizedFields label={w.example} value={form.example} onChange={(example) => setForm({ ...form, example })} />
      <div className="flex flex-wrap items-center gap-2">
        <select value={form.difficulty} onChange={(e) => setForm({ ...form, difficulty: e.target.value as "easy" | "medium" | "hard" })} aria-label={w.difficulty} className="h-9 rounded-lg border border-input bg-background px-2.5 text-xs">
          <option value="easy">{w.easy}</option>
          <option value="medium">{w.medium}</option>
          <option value="hard">{w.hard}</option>
        </select>
        <Button size="sm" loading={create.isPending} onClick={() => create.mutate()}>{w.create}</Button>
      </div>
      {cards.isLoading ? <EdtechLoading /> : null}
      {cards.data?.cards.map((card) => (
        <div key={card.id} className="flex items-center gap-2 rounded-lg border border-border bg-card px-2.5 py-2">
          <span className="min-w-0 flex-1 truncate text-xs">{card.front?.uz || card.id}</span>
          <Badge variant="outline">{card.difficulty}</Badge>
          <button type="button" aria-label={w.delete} onClick={() => remove.mutate(card.id)} className="text-destructive">
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  );
}

function AchievementsTab() {
  const w = useEdtechWords();
  const client = useQueryClient();
  const [form, setForm] = useState({
    code: "",
    titleUz: "",
    titleRu: "",
    titleEn: "",
    descriptionUz: "",
    descriptionRu: "",
    descriptionEn: "",
    icon: "award",
    coinReward: 0,
    criteriaType: "questions",
    criteriaValue: 10,
    active: true,
    sortOrder: 0,
  });
  const achievements = useQuery({
    queryKey: ["admin-edtech-achievements"],
    queryFn: () => edtechAdminRequest<{ achievements: AdminAchievement[] }>("/achievements"),
  });
  const refresh = () => {
    void client.invalidateQueries({ queryKey: ["admin-edtech-achievements"] });
    void client.invalidateQueries({ queryKey: ["admin-edtech-overview"] });
  };
  const create = useMutation({
    mutationFn: () => edtechAdminRequest("/achievements", { method: "POST", body: form }),
    onSuccess: () => {
      setForm({ ...form, code: "", titleUz: "", titleRu: "", titleEn: "" });
      refresh();
    },
  });
  const update = useMutation({
    mutationFn: ({ id, body }: { id: string; body: object }) => edtechAdminRequest(`/achievements/${id}`, { method: "PATCH", body }),
    onSuccess: refresh,
  });
  if (achievements.isLoading) return <EdtechLoading />;
  if (achievements.isError || !achievements.data) return <EdtechError onRetry={() => void achievements.refetch()} />;
  return (
    <div className="space-y-3">
      <Card className="space-y-2 p-4">
        <div className="grid gap-2 sm:grid-cols-4">
          <input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder={w.code} aria-label={w.code} className="h-9 rounded-lg border border-input bg-background px-2.5 text-xs" />
          <input type="number" min={0} value={form.coinReward} onChange={(e) => setForm({ ...form, coinReward: Number(e.target.value) })} aria-label={w.rewardCoins} className="h-9 rounded-lg border border-input bg-background px-2.5 text-xs" />
          <select value={form.criteriaType} onChange={(e) => setForm({ ...form, criteriaType: e.target.value })} aria-label={w.metric} className="h-9 rounded-lg border border-input bg-background px-2.5 text-xs">
            {["questions", "streak", "topics", "mistake_reviews", "flashcards", "missions", "rank"].map((type) => (
              <option key={type} value={type}>{type}</option>
            ))}
          </select>
          <input type="number" min={0} value={form.criteriaValue} onChange={(e) => setForm({ ...form, criteriaValue: Number(e.target.value) })} aria-label={w.target} className="h-9 rounded-lg border border-input bg-background px-2.5 text-xs" />
        </div>
        <div className="grid gap-2 sm:grid-cols-3">
          {(["Uz", "Ru", "En"] as const).map((lang) => (
            <input key={lang} value={form[`title${lang}` as "titleUz"]} onChange={(e) => setForm({ ...form, [`title${lang}`]: e.target.value })} placeholder={`${w.titles} ${lang}`} aria-label={`${w.titles} ${lang}`} className="h-9 rounded-lg border border-input bg-background px-2.5 text-xs" />
          ))}
        </div>
        <div className="grid gap-2 sm:grid-cols-3">
          {(["Uz", "Ru", "En"] as const).map((lang) => (
            <input key={lang} value={form[`description${lang}` as "descriptionUz"]} onChange={(e) => setForm({ ...form, [`description${lang}`]: e.target.value })} placeholder={`${w.descriptions} ${lang}`} aria-label={`${w.descriptions} ${lang}`} className="h-9 rounded-lg border border-input bg-background px-2.5 text-xs" />
          ))}
        </div>
        <Button loading={create.isPending} onClick={() => create.mutate()}>{w.create}</Button>
      </Card>
      <div className="space-y-2">
        {achievements.data.achievements.map((achievement) => (
          <Card key={achievement.id} className="flex flex-wrap items-center gap-3 p-3.5">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{achievement.title_uz}</p>
              <p className="text-[11px] text-muted-foreground">
                {achievement.code} · {achievement.criteria?.type}: {achievement.criteria?.value} · +{achievement.coin_reward} · {w.awarded}: {achievement.awarded}
              </p>
            </div>
            <Badge variant={achievement.active ? "success" : "default"}>{achievement.active ? w.active : w.draft}</Badge>
            <Button size="sm" variant="outline" onClick={() => update.mutate({ id: achievement.id, body: { active: !achievement.active } })}>
              {achievement.active ? w.locked : w.active}
            </Button>
          </Card>
        ))}
      </div>
    </div>
  );
}

function SettingsTab() {
  const w = useEdtechWords();
  const client = useQueryClient();
  const settings = useQuery({ queryKey: ["admin-edtech-settings"], queryFn: () => edtechAdminRequest<EdtechSettings>("/settings") });
  const [draft, setDraft] = useState<EdtechSettings | null>(null);
  const current = draft ?? settings.data ?? null;
  const save = useMutation({
    mutationFn: (body: EdtechSettings) => edtechAdminRequest("/settings", { method: "PUT", body }),
    onSuccess: () => {
      setDraft(null);
      void client.invalidateQueries({ queryKey: ["admin-edtech-settings"] });
    },
  });
  const snapshot = useMutation({
    mutationFn: (period: LeaderboardPeriod) => edtechAdminRequest<{ saved: number }>("/leaderboard/snapshot", { method: "POST", body: { period, subject: "all" } }),
  });
  if (settings.isLoading || !current) return <EdtechLoading />;
  if (settings.isError) return <EdtechError onRetry={() => void settings.refetch()} />;

  const numberField = (label: string, value: number, onChange: (value: number) => void) => (
    <label className="space-y-1 text-xs font-semibold">
      <span className="block text-muted-foreground">{label}</span>
      <input
        type="number"
        min={0}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="h-9 w-full rounded-lg border border-input bg-background px-2.5"
      />
    </label>
  );

  return (
    <div className="space-y-3">
      <Card className="space-y-3 p-4">
        <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">{w.interval}</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {(["again", "hard", "good", "easy"] as const).map((rating) =>
            numberField(rating, current.intervals[rating], (value) =>
              setDraft({ ...current, intervals: { ...current.intervals, [rating]: value } }),
            ),
          )}
        </div>
        <p className="pt-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">{w.weight}</p>
        <div className="grid grid-cols-2 gap-2">
          {numberField("correct", current.leaderboardWeights.correct, (value) =>
            setDraft({ ...current, leaderboardWeights: { ...current.leaderboardWeights, correct: value } }),
          )}
          {numberField("test", current.leaderboardWeights.test, (value) =>
            setDraft({ ...current, leaderboardWeights: { ...current.leaderboardWeights, test: value } }),
          )}
        </div>
        <p className="pt-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">{w.reward} (streak)</p>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
          {["3", "7", "14", "30", "60"].map((day) =>
            numberField(`${day} ${w.streakDays}`, Number(current.streakRewards[day] ?? 0), (value) =>
              setDraft({ ...current, streakRewards: { ...current.streakRewards, [day]: value } }),
            ),
          )}
        </div>
        <div className="flex flex-wrap gap-2 pt-2">
          <Button leftIcon={<Save className="h-4 w-4" />} loading={save.isPending} onClick={() => save.mutate(current)}>
            {w.save}
          </Button>
          <Button
            variant="outline"
            leftIcon={<RefreshCw className="h-4 w-4" />}
            loading={snapshot.isPending}
            onClick={() => snapshot.mutate("weekly")}
          >
            {w.snapshot}
          </Button>
          <Button
            variant="outline"
            leftIcon={<Download className="h-4 w-4" />}
            onClick={() => void downloadEdtechCsv("/api/admin/edtech/reports/export", "zerolax-weekly-reports.csv", "admin")}
          >
            {w.export}
          </Button>
        </div>
        {snapshot.data ? <p className="text-xs text-success">{w.saved}: {snapshot.data.saved}</p> : null}
      </Card>
    </div>
  );
}

function ActivityTab() {
  const w = useEdtechWords();
  const [kind, setKind] = useState("");
  const activity = useQuery({
    queryKey: ["admin-edtech-activity", kind],
    queryFn: () =>
      edtechAdminRequest<{
        activity: Array<{
          id: string;
          user_id: string;
          nickname: string;
          kind: string;
          subject: string;
          topic: string;
          correct: boolean | null;
          score: number | null;
          activity_date: string;
          occurred_at: string;
          source_type: string;
        }>;
        total: number;
      }>(`/activity?limit=100${kind ? `&kind=${kind}` : ""}`),
  });
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {["", "question", "test", "topic", "flashcard", "mistake_review", "game"].map((value) => (
          <button
            key={value || "all"}
            type="button"
            aria-pressed={kind === value}
            onClick={() => setKind(value)}
            className={cn(
              "rounded-full border px-3 py-1.5 text-xs font-semibold",
              kind === value ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-muted-foreground",
            )}
          >
            {value || w.allMistakes}
          </button>
        ))}
      </div>
      {activity.isLoading ? <EdtechLoading /> : null}
      {activity.isError ? <EdtechError onRetry={() => void activity.refetch()} /> : null}
      <Card className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="border-b border-border text-[10px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="p-2.5">{w.user ?? "User"}</th>
              <th className="p-2.5">{w.metric}</th>
              <th className="p-2.5">{w.subject}</th>
              <th className="p-2.5">{w.score}</th>
              <th className="p-2.5">{w.status}</th>
              <th className="p-2.5">{w.today}</th>
            </tr>
          </thead>
          <tbody>
            {activity.data?.activity.map((row) => (
              <tr key={row.id} className="border-b border-border/60 last:border-0">
                <td className="p-2.5 font-semibold">{row.nickname}</td>
                <td className="p-2.5">{row.kind}</td>
                <td className="p-2.5">{subjectLabel(row.subject, "uz")}</td>
                <td className="p-2.5">{row.score ?? "—"}</td>
                <td className="p-2.5">
                  {row.correct === null ? "—" : row.correct ? w.correct : w.incorrect}
                </td>
                <td className="p-2.5 text-muted-foreground">{row.activity_date}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {activity.data && activity.data.activity.length === 0 ? <p className="p-4 text-center text-xs text-muted-foreground">{w.noRows}</p> : null}
      </Card>
      <p className="text-[11px] text-muted-foreground">{w.total}: {activity.data?.total ?? 0}</p>
    </div>
  );
}
