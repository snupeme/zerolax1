import { useEffect, useState, type ReactNode } from "react";
import {
  Link,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  defaultPlatformSettings,
  type PlatformSettings,
  type LearningBook,
  type LearningTopic,
  type LearningCertificate,
  type LearningExam,
} from "@zerolax/shared";
import {
  control,
  useControlWords,
  toast,
  useUnsaved,
  downloadReport,
} from "../../lib/admin-control";
import {
  learningRequest,
  downloadCertificate,
  fetchCertificatePdf,
} from "../../lib/learning";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import {
  Field,
  DataTable,
  Pager,
  ImageUpload,
  MiniChart,
  selectClass,
} from "../../components/admin/ControlUi";
import { RichLessonEditor } from "../../components/admin/RichLessonEditor";
import { ExamRuleEditor } from "../../components/admin/ExamRuleEditor";
import { QuestionMetadataEditor } from "../../components/admin/QuestionMetadataEditor";
function Panel({ children }: { children: ReactNode }) {
  return (
    <section className="space-y-4 rounded-xl border bg-card p-4 sm:p-5">
      {children}
    </section>
  );
}
function useTask() {
  const w = useControlWords();
  const [busy, setBusy] = useState(false);
  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    try {
      await fn();
      toast(w.saved);
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }
  return { busy, run };
}
function ErrorText({ error }: { error: Error | null }) {
  return error ? (
    <p className="text-destructive" role="alert">
      {error.message}
    </p>
  ) : null;
}
function useRange() {
  const [from, setFrom] = useState(
    new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10),
  );
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));
  return {
    from,
    to,
    setFrom,
    setTo,
    query: new URLSearchParams({ from, to }).toString(),
  };
}
function RangeFields({ range }: { range: ReturnType<typeof useRange> }) {
  const w = useControlWords();
  return (
    <>
      <Field label={w.from}>
        <Input
          type="date"
          value={range.from}
          onChange={(e) => range.setFrom(e.target.value)}
        />
      </Field>
      <Field label={w.to}>
        <Input
          type="date"
          value={range.to}
          onChange={(e) => range.setTo(e.target.value)}
        />
      </Field>
    </>
  );
}
export function AdminControlPage() {
  const { section = "analytics" } = useParams();
  const w = useControlWords();
  const titles: Record<string, string> = {
    analytics: w.analytics,
    users: w.users,
    roles: w.roles,
    settings: w.settings,
    banners: w.banners,
    catalog: w.catalog,
    content: w.content,
    reports: w.reports,
    audit: w.audit,
    support: w.support,
    coins: w.coins,
    exams: w.exams,
    certificates: w.certificates,
    finance: w.finance,
  };
  return (
    <div className="space-y-5">
      <header>
        <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-primary">
          ZEROLAX
        </p>
        <h1 className="text-2xl font-bold">{titles[section] ?? w.dashboard}</h1>
      </header>
      {section === "analytics" ? (
        <Dashboard />
      ) : section === "users" ? (
        <UserDirectory />
      ) : section === "roles" ? (
        <Roles />
      ) : section === "settings" ? (
        <Settings />
      ) : section === "banners" ? (
        <Banners />
      ) : section === "catalog" ? (
        <Catalog />
      ) : section === "content" ? (
        <Content />
      ) : section === "reports" ? (
        <Reports />
      ) : section === "exams" ? (
        <ExamAnalytics />
      ) : section === "certificates" || section === "finance" ? (
        <FinanceCertificates kind={section} />
      ) : (
        <Records kind={section} />
      )}
    </div>
  );
}
function Dashboard() {
  const w = useControlWords();
  const range = useRange();
  const [bucket, setBucket] = useState("day");
  const q = useQuery({
    queryKey: ["control-analytics", range.query, bucket],
    queryFn: () =>
      control<{
        counts: Record<string, number>;
        series: Record<string, unknown>[];
        subjects: Record<string, unknown>[];
        grades: Record<string, unknown>[];
        retention: { cohort: number; returned_after_7_days: number };
        revenue: Array<{ currency: string; amount_minor: string }> | null;
        revenueSeries: Record<string, unknown>[] | null;
        recentUsers: Record<string, unknown>[];
        recentExams: Record<string, unknown>[];
        recentCertificates: Record<string, unknown>[];
        expiredPremium: Record<string, unknown>[];
        alerts: Record<string, unknown>[];
      }>(`/analytics?${range.query}&bucket=${bucket}`),
  });
  const metrics: Record<string, string> = {
    users: w.totalUsers,
    registrations: w.registrations,
    active_today: w.activeToday,
    premium: w.premium,
    active_subscriptions: w.subscriptions,
    completed: w.completed,
    average_score: w.average,
    certificates: w.certificates,
    coins: w.coins,
  };
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-3">
        <RangeFields range={range} />
        <Field label={w.analytics}>
          <select
            className={selectClass}
            value={bucket}
            onChange={(e) => setBucket(e.target.value)}
          >
            {(["day", "week", "month", "year"] as const).map((v) => (
              <option key={v} value={v}>
                {w[v]}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <ErrorText error={q.error} />
      {q.isLoading && (
        <div className="h-52 animate-pulse rounded-xl bg-muted" />
      )}
      {q.data && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
            {Object.entries(metrics).map(([k, title]) => (
              <div key={k} className="rounded-xl border bg-card p-4">
                <p className="text-xs font-medium text-muted-foreground">
                  {title}
                </p>
                <p className="mt-2 text-2xl font-bold tabular-nums">
                  {q.data!.counts[k] ?? "—"}
                </p>
              </div>
            ))}
          </div>
          <MiniChart
            rows={q.data.series}
            series={[
              { key: "registrations", label: w.registrations },
              { key: "active", label: w.activeToday },
              { key: "exams", label: w.completed },
              { key: "subscriptions", label: w.subscriptions },
              { key: "score", label: w.average },
            ]}
          />
          <div className="grid gap-4 lg:grid-cols-2">
            <Panel>
              <h2 className="font-semibold">{w.subjects}</h2>
              <DataTable rows={q.data.subjects} />
            </Panel>
            <Panel>
              <h2 className="font-semibold">{w.grade}</h2>
              <DataTable rows={q.data.grades} />
              <p>
                {w.retention}: {q.data.retention.returned_after_7_days}/
                {q.data.retention.cohort}
              </p>
              <MiniChart
                rows={[
                  {
                    date: range.from,
                    cohort: q.data.retention.cohort,
                    returned: q.data.retention.returned_after_7_days,
                  },
                ]}
                series={[
                  { key: "cohort", label: w.totalUsers },
                  { key: "returned", label: w.retention },
                ]}
              />
            </Panel>
          </div>
          {q.data.revenue && (
            <Panel>
              <h2 className="font-semibold">{w.revenue}</h2>
              <DataTable rows={q.data.revenue} />
              <DataTable rows={q.data.revenueSeries ?? []} />
              {q.data.revenue.map((currency) => (
                <MiniChart
                  key={currency.currency}
                  rows={(q.data!.revenueSeries ?? []).filter(
                    (r) => r.currency === currency.currency,
                  )}
                  series={[
                    {
                      key: "amount_minor",
                      label: w.revenue + " · " + currency.currency,
                    },
                  ]}
                />
              ))}
            </Panel>
          )}
          <div className="grid gap-4 lg:grid-cols-2">
            {[
              { title: w.registrations, rows: q.data.recentUsers },
              { title: w.completed, rows: q.data.recentExams },
              { title: w.certificates, rows: q.data.recentCertificates },
              { title: w.premium, rows: q.data.expiredPremium },
              { title: w.notification, rows: q.data.alerts },
            ].map((s, i) => (
              <Panel key={i}>
                <h2 className="font-semibold">{s.title}</h2>
                <DataTable rows={s.rows} />
              </Panel>
            ))}
          </div>
        </>
      )}
    </>
  );
}
function UserDirectory() {
  const w = useControlWords();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const urlSearch = searchParams.get("search") ?? "";
  const [offset, setOffset] = useState(0);
  const [filters, setFilters] = useState<Record<string, string>>({
    search: "",
    status: "",
    premium: "",
    grade: "",
    city: "",
    district: "",
    certificate: "",
    active: "",
    minScore: "",
    from: "",
    to: "",
    sort: "registered_at",
    direction: "desc",
  });
  useEffect(() => {
    setFilters((f) => ({ ...f, search: urlSearch }));
    setOffset(0);
  }, [urlSearch]);
  const query = new URLSearchParams(
    Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== "")),
  );
  query.set("offset", String(offset));
  const q = useQuery({
    queryKey: ["control-users", query.toString()],
    queryFn: () =>
      control<{ rows: Record<string, unknown>[]; total: number }>(
        `/users?${query}`,
      ),
  });
  function change(k: string, value: string) {
    setFilters({ ...filters, [k]: value });
    setOffset(0);
  }
  return (
    <>
      <Panel>
        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {(
            [
              "search",
              "city",
              "district",
              "grade",
              "minScore",
              "from",
              "to",
            ] as const
          ).map((k) => (
            <Field key={k} label={w[k]}>
              <Input
                type={
                  k === "from" || k === "to"
                    ? "date"
                    : k === "grade" || k === "minScore"
                      ? "number"
                      : "text"
                }
                value={filters[k]}
                onChange={(e) => change(k, e.target.value)}
              />
            </Field>
          ))}
          {(["premium", "certificate", "active"] as const).map((k) => (
            <Field key={k} label={w[k]}>
              <select
                className={selectClass}
                value={filters[k]}
                onChange={(e) => change(k, e.target.value)}
              >
                <option value="">{w.all}</option>
                <option value="true">✓</option>
                <option value="false">—</option>
              </select>
            </Field>
          ))}
          <Field label={w.status}>
            <select
              className={selectClass}
              value={filters.status}
              onChange={(e) => change("status", e.target.value)}
            >
              <option value="">{w.all}</option>
              <option value="active">{w.active}</option>
              <option value="blocked">{w.blocked}</option>
            </select>
          </Field>
          <Field label={w.sort}>
            <select
              className={selectClass}
              value={filters.sort}
              onChange={(e) => change("sort", e.target.value)}
            >
              <option value="registered_at">{w.registered}</option>
              <option value="nickname">{w.name}</option>
              <option value="coins_balance">{w.balance}</option>
            </select>
          </Field>
          <Field label={w.sort}>
            <select
              className={selectClass}
              value={filters.direction}
              onChange={(e) => change("direction", e.target.value)}
            >
              <option value="desc">↓</option>
              <option value="asc">↑</option>
            </select>
          </Field>
        </div>
      </Panel>
      <ErrorText error={q.error} />
      <p className="text-sm text-muted-foreground">
        {q.data?.total ?? 0} · {w.users}
      </p>
      {q.isFetching && <p aria-live="polite">…</p>}
      <DataTable
        rows={q.data?.rows ?? []}
        onSelect={(r) => navigate(`/admin/users/${r.id}`)}
      />
      <Pager
        offset={offset}
        setOffset={setOffset}
        hasMore={offset + 20 < (q.data?.total ?? 0)}
      />
    </>
  );
}
function Roles() {
  const w = useControlWords();
  const task = useTask();
  const [dirty, setDirty] = useState(false);
  useUnsaved(dirty);
  const [role, setRole] = useState({
    key: "",
    name: "",
    permissions: [] as string[],
  });
  const [admin, setAdmin] = useState({
    email: "",
    name: "",
    password: "",
    role: "content_manager",
  });
  const q = useQuery({
    queryKey: ["control-roles"],
    queryFn: () =>
      control<{
        roles: Array<{ key: string; name: string; permissions: string[] }>;
        admins: Array<{
          id: string;
          email: string;
          name: string;
          role: string;
          status: string;
        }>;
        permissions: string[];
      }>("/roles"),
  });
  return (
    <>
      <ErrorText error={q.error} />
      <div className="grid gap-5 lg:grid-cols-2">
        <Panel>
          <h2 className="font-semibold">{w.roles}</h2>
          {q.data?.roles.map((r) => (
            <Button
              key={r.key}
              variant="outline"
              onClick={() => {
                if (!dirty || window.confirm(w.unsaved)) {
                  setRole(r);
                  setDirty(false);
                }
              }}
            >
              {r.name}
            </Button>
          ))}
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              void task.run(async () => {
                await control("/roles", role, "PUT");
                setDirty(false);
                await q.refetch();
              });
            }}
          >
            <Field label={w.role}>
              <Input
                required
                pattern="[a-z][a-z0-9_]+"
                value={role.key}
                onChange={(e) => {
                  setRole({ ...role, key: e.target.value });
                  setDirty(true);
                }}
              />
            </Field>
            <Field label={w.name}>
              <Input
                required
                value={role.name}
                onChange={(e) => {
                  setRole({ ...role, name: e.target.value });
                  setDirty(true);
                }}
              />
            </Field>
            <div className="grid gap-2 sm:grid-cols-2">
              {q.data?.permissions.map((p) => (
                <label className="flex items-center gap-2 text-xs" key={p}>
                  <input
                    type="checkbox"
                    checked={role.permissions.includes(p)}
                    onChange={(e) => {
                      setRole({
                        ...role,
                        permissions: e.target.checked
                          ? [...role.permissions, p]
                          : role.permissions.filter((v) => v !== p),
                      });
                      setDirty(true);
                    }}
                  />
                  {p}
                </label>
              ))}
            </div>
            <Button disabled={task.busy || role.key === "superadmin"}>
              {w.save}
            </Button>
          </form>
        </Panel>
        <Panel>
          <h2 className="font-semibold">{w.create}</h2>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              void task.run(async () => {
                await control("/admins", admin);
                setAdmin({ ...admin, password: "" });
                await q.refetch();
              });
            }}
          >
            {(["name", "email", "password"] as const).map((k) => (
              <Field key={k} label={w[k]}>
                <Input
                  required
                  type={
                    k === "password"
                      ? "password"
                      : k === "email"
                        ? "email"
                        : "text"
                  }
                  minLength={k === "password" ? 12 : 2}
                  value={admin[k]}
                  onChange={(e) => setAdmin({ ...admin, [k]: e.target.value })}
                />
              </Field>
            ))}
            <Field label={w.role}>
              <select
                className={selectClass}
                value={admin.role}
                onChange={(e) => setAdmin({ ...admin, role: e.target.value })}
              >
                {q.data?.roles.map((r) => (
                  <option key={r.key} value={r.key}>
                    {r.name}
                  </option>
                ))}
              </select>
            </Field>
            <Button disabled={task.busy}>{w.create}</Button>
          </form>
          {q.data?.admins.map((a) => (
            <StaffRow
              key={a.id}
              admin={a}
              roles={q.data!.roles}
              onSave={(role, status) =>
                void task.run(async () => {
                  await control(`/admins/${a.id}`, { role, status }, "PATCH");
                  await q.refetch();
                })
              }
            />
          ))}
        </Panel>
      </div>
    </>
  );
}
function StaffRow({
  admin,
  roles,
  onSave,
}: {
  admin: { name: string; email: string; role: string; status: string };
  roles: Array<{ key: string; name: string }>;
  onSave: (role: string, status: string) => void;
}) {
  const w = useControlWords();
  const [role, setRole] = useState(admin.role);
  const [status, setStatus] = useState(admin.status);
  return (
    <form
      className="space-y-2 rounded-lg border p-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (window.confirm(w.confirm)) onSave(role, status);
      }}
    >
      <p className="font-medium">{admin.name}</p>
      <p className="break-all text-xs">{admin.email}</p>
      <select
        aria-label={w.role}
        className={selectClass}
        value={role}
        onChange={(e) => setRole(e.target.value)}
      >
        {roles.map((r) => (
          <option key={r.key} value={r.key}>
            {r.name}
          </option>
        ))}
      </select>
      <select
        aria-label={w.status}
        className={selectClass}
        value={status}
        onChange={(e) => setStatus(e.target.value)}
      >
        <option value="active">{w.active}</option>
        <option value="disabled">{w.blocked}</option>
      </select>
      <Button size="sm" variant="outline">
        {w.save}
      </Button>
    </form>
  );
}
function Settings() {
  const w = useControlWords();
  const task = useTask();
  const [draft, setDraft] = useState<PlatformSettings | null>(null);
  useUnsaved(!!draft);
  const q = useQuery({
    queryKey: ["control-settings"],
    queryFn: () => control<PlatformSettings>("/settings"),
  });
  const s = draft ?? q.data ?? defaultPlatformSettings;
  return (
    <>
      <ErrorText error={q.error} />
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (window.confirm(w.confirm))
            void task.run(async () => {
              await control("/settings", s, "PUT");
              setDraft(null);
              await q.refetch();
            });
        }}
      >
        <Panel>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={w.name}>
              <Input
                required
                value={s.name}
                onChange={(e) => setDraft({ ...s, name: e.target.value })}
              />
            </Field>
            <Field label={w.email}>
              <Input
                required
                type="email"
                value={s.supportEmail}
                onChange={(e) =>
                  setDraft({ ...s, supportEmail: e.target.value })
                }
              />
            </Field>
            <Field label={w.logo}>
              <ImageUpload
                value={s.logoUrl}
                onChange={(logoUrl) => setDraft({ ...s, logoUrl })}
              />
            </Field>
            <Field label={w.favicon}>
              <ImageUpload
                value={s.faviconUrl}
                onChange={(faviconUrl) => setDraft({ ...s, faviconUrl })}
              />
            </Field>
          </div>
          {(["maintenance", "registrationEnabled"] as const).map((k) => (
            <label className="flex gap-2" key={k}>
              <input
                type="checkbox"
                checked={s[k]}
                onChange={(e) => setDraft({ ...s, [k]: e.target.checked })}
              />
              {w[k]}
            </label>
          ))}
          <Field label={w.timezone}>
            <Input readOnly value={s.timezone} />
          </Field>
          <div className="flex gap-4">
            {(["uz", "ru", "en"] as const).map((lang) => (
              <label className="flex gap-2" key={lang}>
                <input
                  type="checkbox"
                  checked={s.languages.includes(lang)}
                  onChange={(e) =>
                    setDraft({
                      ...s,
                      languages: e.target.checked
                        ? [...s.languages, lang]
                        : s.languages.filter((l) => l !== lang),
                    })
                  }
                />
                {lang.toUpperCase()}
              </label>
            ))}
          </div>
        </Panel>
        <Panel>
          <h2 className="font-semibold">{w.rewards}</h2>
          <label className="flex gap-2">
            <input
              type="checkbox"
              checked={s.rewards.enabled}
              onChange={(e) =>
                setDraft({
                  ...s,
                  rewards: { ...s.rewards, enabled: e.target.checked },
                })
              }
            />
            {w.enabled}
          </label>
          <label className="flex gap-2">
            <input
              type="checkbox"
              checked={s.applyDifficultyRewards}
              onChange={(e) =>
                setDraft({ ...s, applyDifficultyRewards: e.target.checked })
              }
            />
            {w.applyRewards}
          </label>
          <div className="grid gap-3 sm:grid-cols-3">
            {(["easy", "medium", "hard"] as const).map((k) => (
              <Field key={k} label={w[k]}>
                <Input
                  type="number"
                  min={0}
                  max={1000}
                  value={s.rewards[k]}
                  onChange={(e) =>
                    setDraft({
                      ...s,
                      rewards: { ...s.rewards, [k]: Number(e.target.value) },
                    })
                  }
                />
              </Field>
            ))}
          </div>
        </Panel>
        <div className="flex gap-2">
          <Button disabled={task.busy}>{w.save}</Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => setDraft(null)}
          >
            {w.cancel}
          </Button>
        </div>
      </form>
    </>
  );
}
interface Banner {
  id: string;
  title: string;
  description: string;
  image_url: string;
  destination: string;
  placement: string;
  starts_at: string;
  ends_at: string;
  priority: number;
  enabled: boolean;
}
function Banners() {
  const w = useControlWords();
  const task = useTask();
  const [offset, setOffset] = useState(0);
  const [edit, setEdit] = useState("");
  const initial = {
    title: "",
    description: "",
    imageUrl: "",
    destination: "/learning",
    placement: "home",
    startsAt: "",
    endsAt: "",
    priority: 0,
    enabled: false,
  };
  const [b, setB] = useState(initial);
  const [dirty, setDirty] = useState(false);
  useUnsaved(dirty);
  const q = useQuery({
    queryKey: ["control-banners", offset],
    queryFn: () => control<Banner[]>(`/banners?offset=${offset}`),
  });
  const change = (patch: Partial<typeof initial>) => {
    setB({ ...b, ...patch });
    setDirty(true);
  };
  return (
    <>
      <ErrorText error={q.error} />
      <div className="grid gap-5 lg:grid-cols-2">
        <Panel>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              void task.run(async () => {
                await control(
                  edit ? `/banners/${edit}` : "/banners",
                  {
                    ...b,
                    startsAt: new Date(b.startsAt).toISOString(),
                    endsAt: new Date(b.endsAt).toISOString(),
                  },
                  edit ? "PUT" : "POST",
                );
                setDirty(false);
                await q.refetch();
              });
            }}
          >
            {(
              [
                "title",
                "description",
                "destination",
                "startsAt",
                "endsAt",
                "priority",
              ] as const
            ).map((k) => (
              <Field
                key={k}
                label={
                  k === "startsAt"
                    ? w.starts
                    : k === "endsAt"
                      ? w.ends
                      : k === "priority"
                        ? w.priority
                        : w[k]
                }
              >
                <Input
                  required={k !== "description"}
                  type={
                    k === "startsAt" || k === "endsAt"
                      ? "datetime-local"
                      : k === "priority"
                        ? "number"
                        : "text"
                  }
                  value={b[k]}
                  onChange={(e) =>
                    change({
                      [k]:
                        k === "priority"
                          ? Number(e.target.value)
                          : e.target.value,
                    })
                  }
                />
              </Field>
            ))}
            <Field label={w.placement}>
              <select
                className={selectClass}
                value={b.placement}
                onChange={(e) => change({ placement: e.target.value })}
              >
                {(["home", "learning", "premium"] as const).map((v) => (
                  <option key={v} value={v}>
                    {w[v]}
                  </option>
                ))}
              </select>
            </Field>
            <ImageUpload
              value={b.imageUrl}
              onChange={(imageUrl) => change({ imageUrl })}
            />
            <label className="flex gap-2">
              <input
                type="checkbox"
                checked={b.enabled}
                onChange={(e) => change({ enabled: e.target.checked })}
              />
              {w.enabled}
            </label>
            <div className="flex gap-2">
              <Button disabled={task.busy}>{w.save}</Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setB(initial);
                  setEdit("");
                  setDirty(false);
                }}
              >
                {w.create}
              </Button>
            </div>
          </form>
        </Panel>
        <section className="space-y-3">
          <Panel>
            <h2 className="font-semibold">{w.preview}</h2>
            {b.imageUrl && (
              <img
                className="w-full rounded-xl"
                src={b.imageUrl}
                alt={b.title}
              />
            )}
            <h3 className="text-lg font-bold">{b.title}</h3>
            <p>{b.description}</p>
          </Panel>
          {q.data?.map((row) => (
            <Panel key={row.id}>
              <h3 className="font-semibold">{row.title}</h3>
              <p>
                {new Date(row.starts_at).toLocaleString()} —{" "}
                {new Date(row.ends_at).toLocaleString()}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    if (dirty && !window.confirm(w.unsaved)) return;
                    setEdit(row.id);
                    setB({
                      title: row.title,
                      description: row.description,
                      imageUrl: row.image_url,
                      destination: row.destination,
                      placement: row.placement,
                      startsAt: new Date(
                        new Date(row.starts_at).getTime() -
                          new Date().getTimezoneOffset() * 60000,
                      )
                        .toISOString()
                        .slice(0, 16),
                      endsAt: new Date(
                        new Date(row.ends_at).getTime() -
                          new Date().getTimezoneOffset() * 60000,
                      )
                        .toISOString()
                        .slice(0, 16),
                      priority: row.priority,
                      enabled: row.enabled,
                    });
                    setDirty(false);
                  }}
                >
                  {w.edit}
                </Button>
                <Button
                  variant="destructive"
                  disabled={task.busy}
                  onClick={() => {
                    if (window.confirm(w.confirm))
                      void task.run(async () => {
                        await control(
                          `/banners/${row.id}`,
                          undefined,
                          "DELETE",
                        );
                        await q.refetch();
                      });
                  }}
                >
                  {w.delete}
                </Button>
              </div>
            </Panel>
          ))}
        </section>
      </div>
      <Pager
        offset={offset}
        setOffset={setOffset}
        hasMore={q.data?.length === 20}
      />
    </>
  );
}
interface Subject {
  slug: string;
  title: string;
  description: string;
  cover_url: string;
  position: number;
  enabled: boolean;
  visible: boolean;
}
function Catalog() {
  const w = useControlWords();
  const task = useTask();
  const [s, setS] = useState({
    slug: "",
    title: "",
    description: "",
    coverUrl: "",
    position: 1,
    enabled: true,
    visible: true,
  });
  const q = useQuery({
    queryKey: ["control-catalog"],
    queryFn: () =>
      control<{
        subjects: Subject[];
        grades: Array<{ grade: number; enabled: boolean }>;
      }>("/catalog"),
  });
  return (
    <>
      <ErrorText error={q.error} />
      <div className="grid gap-5 lg:grid-cols-2">
        <Panel>
          <DataTable
            rows={
              (q.data?.subjects ?? []) as unknown as Record<string, unknown>[]
            }
            onSelect={(r) => {
              const row = r as unknown as Subject;
              setS({
                slug: row.slug,
                title: row.title,
                description: row.description,
                coverUrl: row.cover_url,
                position: row.position,
                enabled: row.enabled,
                visible: row.visible,
              });
            }}
          />
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              void task.run(async () => {
                await control("/subjects", s, "PUT");
                await q.refetch();
              });
            }}
          >
            <Field label={w.subjects}>
              <Input
                required
                pattern="[a-z][a-z0-9-]+"
                value={s.slug}
                onChange={(e) => setS({ ...s, slug: e.target.value })}
              />
            </Field>
            {(["title", "description", "position"] as const).map((k) => (
              <Field key={k} label={w[k]}>
                <Input
                  required
                  type={k === "position" ? "number" : "text"}
                  value={s[k]}
                  onChange={(e) =>
                    setS({
                      ...s,
                      [k]:
                        k === "position"
                          ? Number(e.target.value)
                          : e.target.value,
                    })
                  }
                />
              </Field>
            ))}
            <ImageUpload
              value={s.coverUrl}
              onChange={(coverUrl) => setS({ ...s, coverUrl })}
            />
            {(["enabled", "visible"] as const).map((k) => (
              <label key={k} className="flex gap-2">
                <input
                  type="checkbox"
                  checked={s[k]}
                  onChange={(e) => setS({ ...s, [k]: e.target.checked })}
                />
                {w[k]}
              </label>
            ))}
            <Button disabled={task.busy}>{w.save}</Button>
          </form>
        </Panel>
        <Panel>
          <h2 className="font-semibold">{w.grade}</h2>
          {q.data?.grades.map((g) => (
            <label
              key={g.grade}
              className="flex items-center gap-3 rounded border p-3"
            >
              <input
                type="checkbox"
                checked={g.enabled}
                onChange={(e) =>
                  void task.run(async () => {
                    await control(
                      `/grades/${g.grade}`,
                      { enabled: e.target.checked },
                      "PUT",
                    );
                    await q.refetch();
                  })
                }
              />
              {g.grade}
            </label>
          ))}
        </Panel>
      </div>
    </>
  );
}
function Content() {
  const w = useControlWords();
  const task = useTask();
  const [bookId, setBookId] = useState("");
  const [topic, setTopic] = useState<LearningTopic | null>(null);
  const [lessonDirty, setLessonDirty] = useState(false);
  const [csv, setCsv] = useState("");
  const [report, setReport] = useState<{
    committed: boolean;
    valid: number;
    errors: Array<{ row: number; message: string }>;
  } | null>(null);
  const [meta, setMeta] = useState({ description: "", coverUrl: "" });
  const books = useQuery({
    queryKey: ["admin-learning-books"],
    queryFn: () =>
      learningRequest<LearningBook[]>("/books", undefined, "GET", true),
  });
  const detail = useQuery({
    queryKey: ["control-book", bookId],
    queryFn: () =>
      learningRequest<{ topics: LearningTopic[]; exams: LearningExam[] }>(
        `/books/${bookId}`,
        undefined,
        "GET",
        true,
      ),
    enabled: !!bookId,
  });
  return (
    <>
      <ErrorText error={books.error ?? detail.error} />
      <Field label={w.catalog}>
        <select
          className={selectClass}
          value={bookId}
          onChange={(e) => {
            if (lessonDirty && !window.confirm(w.unsaved)) return;
            setBookId(e.target.value);
            setTopic(null);
            const b = books.data?.find(
              (b) => b.id === e.target.value,
            ) as LearningBook & { description?: string; cover_url?: string };
            setMeta({
              description: b?.description ?? "",
              coverUrl: b?.cover_url ?? "",
            });
          }}
        >
          <option value="">{w.all}</option>
          {books.data?.map((b) => (
            <option key={b.id} value={b.id}>
              {b.title}
            </option>
          ))}
        </select>
      </Field>
      {bookId && (
        <Panel>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              void task.run(async () => {
                await control(`/books/${bookId}/metadata`, meta, "PUT");
                await books.refetch();
              });
            }}
          >
            <Field label={w.description}>
              <Input
                value={meta.description}
                onChange={(e) =>
                  setMeta({ ...meta, description: e.target.value })
                }
              />
            </Field>
            <ImageUpload
              value={meta.coverUrl}
              onChange={(coverUrl) => setMeta({ ...meta, coverUrl })}
            />
            <Button disabled={task.busy}>{w.save}</Button>
          </form>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() =>
                void task.run(async () => {
                  await control("/topics/bulk", {
                    ids: detail.data?.topics.map((t) => t.id) ?? [],
                    published: true,
                  });
                  await detail.refetch();
                })
              }
            >
              {w.publish}
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                if (window.confirm(w.confirm))
                  void task.run(async () => {
                    await control("/topics/bulk", {
                      ids: detail.data?.topics.map((t) => t.id) ?? [],
                      published: false,
                    });
                    await detail.refetch();
                  });
              }}
            >
              {w.unpublish}
            </Button>
            <Link className="text-primary underline" to="/admin/learning">
              {w.create}
            </Link>
          </div>
        </Panel>
      )}
      <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
        <aside className="space-y-2">
          {detail.data?.topics.map((t, i) => (
            <div key={t.id} className="flex gap-1">
              <Button
                key={t.id}
                variant={topic?.id === t.id ? "primary" : "outline"}
                className="min-w-0 flex-1 justify-start truncate"
                onClick={() => {
                  if (lessonDirty && !window.confirm(w.unsaved)) return;
                  setTopic(t);
                  setReport(null);
                }}
              >
                {t.position}. {t.title}
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={task.busy || i === 0}
                aria-label={w.position + " " + t.title}
                onClick={() =>
                  void task.run(async () => {
                    const ids = detail.data!.topics.map((t) => t.id);
                    [ids[i - 1], ids[i]] = [ids[i], ids[i - 1]];
                    await control(`/books/${bookId}/order`, ids, "PUT");
                    await detail.refetch();
                  })
                }
              >
                ↑
              </Button>
            </div>
          ))}
        </aside>
        {topic && (
          <div className="min-w-0 space-y-4">
            <RichLessonEditor
              key={topic.id}
              topic={topic}
              onSaved={() => detail.refetch()}
              onDirty={setLessonDirty}
            />
            <QuestionMetadataEditor
              key={"meta-" + topic.id}
              topicId={topic.id}
            />
            <Panel>
              <h2 className="font-semibold">{w.import}</h2>
              <p className="text-xs text-muted-foreground">
                CSV:
                text,option1,option2,option3,option4,correctIndex,explanation ·
                correctIndex: 0–3
              </p>
              <input
                aria-label={w.import}
                type="file"
                accept=".csv,text/csv"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (f) {
                    setCsv(await f.text());
                    setReport(null);
                  }
                }}
              />
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  disabled={task.busy || !csv}
                  onClick={() =>
                    void task.run(async () =>
                      setReport(
                        await control(`/topics/${topic.id}/import`, {
                          csv,
                          commit: false,
                        }),
                      ),
                    )
                  }
                >
                  {w.validate}
                </Button>
                <Button
                  disabled={
                    task.busy ||
                    !report ||
                    !!report.errors.length ||
                    report.committed
                  }
                  onClick={() =>
                    void task.run(async () =>
                      setReport(
                        await control(`/topics/${topic.id}/import`, {
                          csv,
                          commit: true,
                        }),
                      ),
                    )
                  }
                >
                  {w.commit}
                </Button>
              </div>
              {report && (
                <>
                  <p>
                    {report.valid} · {report.committed ? "✓" : ""}
                  </p>
                  <DataTable rows={report.errors} />
                </>
              )}
            </Panel>
            <div className="flex gap-2">
              <Button
                variant="outline"
                disabled={task.busy}
                onClick={() => {
                  const position = window.prompt(w.position);
                  const title = window.prompt(w.title, topic.title);
                  if (position && title)
                    void task.run(async () => {
                      await control(`/topics/${topic.id}/duplicate`, {
                        position: Number(position),
                        title,
                      });
                      await detail.refetch();
                    });
                }}
              >
                {w.duplicate}
              </Button>
              <Button
                variant="destructive"
                disabled={task.busy}
                onClick={() => {
                  if (window.confirm(w.confirm))
                    void task.run(async () => {
                      await control(`/topics/${topic.id}`, undefined, "DELETE");
                      setTopic(null);
                      await detail.refetch();
                    });
                }}
              >
                {w.delete}
              </Button>
            </div>
          </div>
        )}
      </div>
      {detail.data?.exams.map((exam) => (
        <ExamRuleEditor key={exam.id} exam={exam} />
      ))}
    </>
  );
}
function Reports() {
  const w = useControlWords();
  const task = useTask();
  const range = useRange();
  const [kind, setKind] = useState("users");
  const [offset, setOffset] = useState(0);
  const q = useQuery({
    queryKey: ["control-reports", kind, range.query, offset],
    queryFn: () =>
      control<{ rows: Record<string, unknown>[] }>(
        `/reports/${kind}?${range.query}&offset=${offset}`,
      ),
  });
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-3">
        <RangeFields range={range} />
        <Field label={w.reports}>
          <select
            className={selectClass}
            value={kind}
            onChange={(e) => {
              setKind(e.target.value);
              setOffset(0);
            }}
          >
            {(
              [
                "users",
                "registrations",
                "progress",
                "exams",
                "certificates",
                "subscriptions",
                "payments",
                "coins",
              ] as const
            ).map((v) => (
              <option key={v} value={v}>
                {v === "subscriptions" ? w.subscriptions : w[v]}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Button
        disabled={task.busy}
        onClick={() => void task.run(() => downloadReport(kind, range.query))}
      >
        {w.export}
      </Button>
      <ErrorText error={q.error} />
      <DataTable rows={q.data?.rows ?? []} />
      <Pager
        offset={offset}
        setOffset={setOffset}
        hasMore={q.data?.rows.length === 20}
      />
    </>
  );
}
function ExamAnalytics() {
  const w = useControlWords();
  const range = useRange();
  const [kind, setKind] = useState("learning");
  const q = useQuery({
    queryKey: ["control-exam-analytics", range.query, kind],
    queryFn: () =>
      control<{
        summary: Record<string, unknown>;
        distribution: Record<string, unknown>[];
        questions: Record<string, unknown>[];
      }>(`/exam-analytics?${range.query}&kind=${kind}`),
  });
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        <RangeFields range={range} />
        <Field label={w.exams}>
          <select
            className={selectClass}
            value={kind}
            onChange={(e) => setKind(e.target.value)}
          >
            <option value="learning">{w.learning}</option>
            <option value="iq">IQ</option>
            <option value="entrance">Abituriyent</option>
          </select>
        </Field>
      </div>
      <ErrorText error={q.error} />
      <DataTable rows={q.data ? [q.data.summary] : []} />
      <DataTable rows={q.data?.distribution ?? []} />
      <DataTable rows={q.data?.questions ?? []} />
    </>
  );
}
function Records({ kind }: { kind: string }) {
  const w = useControlWords();
  const task = useTask();
  const range = useRange();
  const [search, setSearch] = useState("");
  const [target, setTarget] = useState("");
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState<Record<string, unknown> | null>(
    null,
  );
  const [reply, setReply] = useState("");
  const [status, setStatus] = useState("closed");
  const q = useQuery({
    queryKey: ["control-records", kind, search, target, range.query, offset],
    queryFn: () =>
      control<Record<string, unknown>[]>(
        `/${kind}?search=${encodeURIComponent(search)}&target=${encodeURIComponent(target)}&${range.query}&offset=${offset}`,
      ),
  });
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label={w.search}>
          <Input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setOffset(0);
            }}
          />
        </Field>
        <Field label={w.users}>
          <Input
            value={target}
            onChange={(e) => {
              setTarget(e.target.value);
              setOffset(0);
            }}
          />
        </Field>
        <RangeFields range={range} />
      </div>
      <ErrorText error={q.error} />
      <DataTable
        rows={q.data ?? []}
        onSelect={(r) => {
          setSelected(r);
          setReply(String(r.admin_reply ?? ""));
        }}
      />
      {selected && (
        <Panel>
          <DataTable rows={[selected]} />
          {kind === "support" && (
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                void task.run(async () => {
                  await control(`/support/${selected.id}/reply`, {
                    reply,
                    status,
                  });
                  await q.refetch();
                  setSelected(null);
                });
              }}
            >
              <Field label={w.reply}>
                <textarea
                  className={selectClass + " h-28"}
                  required
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                />
              </Field>
              <select
                className={selectClass}
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                <option value="open">{w.open}</option>
                <option value="in_progress">{w.inProgress}</option>
                <option value="closed">{w.closed}</option>
              </select>
              <Button disabled={task.busy}>{w.save}</Button>
            </form>
          )}
          <Button variant="outline" onClick={() => setSelected(null)}>
            {w.cancel}
          </Button>
        </Panel>
      )}
      <Pager
        offset={offset}
        setOffset={setOffset}
        hasMore={q.data?.length === 20}
      />
    </>
  );
}
function FinanceCertificates({ kind }: { kind: string }) {
  const [previewId, setPreviewId] = useState<string | null>(null);
  const w = useControlWords();
  const task = useTask();
  const range = useRange();
  const [tab, setTab] = useState(
    kind === "certificates" ? "certificates" : "subscriptions",
  );
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [grade, setGrade] = useState("");
  const [offset, setOffset] = useState(0);
  const [reason, setReason] = useState("");
  const q = useQuery({
    queryKey: [
      "control-finance",
      tab,
      search,
      status,
      grade,
      range.query,
      offset,
    ],
    queryFn: () =>
      control<Record<string, unknown>[]>(
        `/records/${tab}?search=${encodeURIComponent(search)}&status=${status}&grade=${grade}&${range.query}&offset=${offset}`,
      ),
  });
  return (
    <>
      {kind !== "certificates" && (
        <div className="flex gap-3">
          <Button
            variant={tab === "subscriptions" ? "primary" : "outline"}
            onClick={() => {
              setTab("subscriptions");
              setOffset(0);
            }}
          >
            {w.subscriptions}
          </Button>
          <Button
            variant={tab === "payments" ? "primary" : "outline"}
            onClick={() => {
              setTab("payments");
              setOffset(0);
            }}
          >
            {w.payments}
          </Button>
          <Link className="text-primary underline" to="/admin/learning">
            {w.edit}
          </Link>
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label={w.search}>
          <Input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setOffset(0);
            }}
          />
        </Field>
        <Field label={w.status}>
          <Input
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setOffset(0);
            }}
          />
        </Field>
        {tab === "certificates" && (
          <Field label={w.grade}>
            <Input
              type="number"
              min={5}
              max={11}
              value={grade}
              onChange={(e) => setGrade(e.target.value)}
            />
          </Field>
        )}
        <RangeFields range={range} />
      </div>
      <ErrorText error={q.error} />
      <DataTable
        rows={q.data ?? []}
        onSelect={
          tab === "certificates"
            ? (r) => setPreviewId(String(r.verification_id))
            : undefined
        }
      />
      {previewId && (
        <PdfPreview id={previewId} onClose={() => setPreviewId(null)} />
      )}
      {tab === "certificates" && (
        <Panel>
          <Field label={w.note}>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
          {q.data?.map((c) => (
            <div
              key={String(c.verification_id)}
              className="flex flex-wrap items-center gap-3"
            >
              <Link
                className="text-primary underline"
                to={`/certificates/${c.verification_id}`}
              >
                {String(c.student_name)}
              </Link>
              <Button
                size="sm"
                variant="destructive"
                disabled={task.busy || reason.length < 3 || !!c.revoked_at}
                onClick={() => {
                  if (window.confirm(w.confirm))
                    void task.run(async () => {
                      await learningRequest(
                        `/certificates/${c.verification_id}/revoke`,
                        { reason },
                        "POST",
                        true,
                      );
                      await q.refetch();
                    });
                }}
              >
                {w.delete}
              </Button>
            </div>
          ))}
        </Panel>
      )}
      <Pager
        offset={offset}
        setOffset={setOffset}
        hasMore={q.data?.length === 20}
      />
    </>
  );
}
function PdfPreview({ id, onClose }: { id: string; onClose: () => void }) {
  const w = useControlWords();
  const task = useTask();
  const [url, setUrl] = useState("");
  const q = useQuery({
    queryKey: ["admin-pdf-preview", id],
    queryFn: () => fetchCertificatePdf(id, true),
  });
  useEffect(() => {
    if (!q.data) return;
    const localUrl = URL.createObjectURL(q.data);
    setUrl(localUrl);
    return () => URL.revokeObjectURL(localUrl);
  }, [q.data]);
  return (
    <Panel>
      <h2 className="font-semibold">{w.preview}</h2>
      <ErrorText error={q.error} />
      {url && (
        <iframe
          title={w.certificates}
          src={url}
          className="h-[70vh] w-full rounded border"
        />
      )}
      <div className="flex gap-2">
        <Button
          disabled={task.busy}
          onClick={() => void task.run(() => downloadCertificate(id, true))}
        >
          {w.export}
        </Button>
        <Button variant="outline" onClick={onClose}>
          {w.cancel}
        </Button>
      </div>
    </Panel>
  );
}
