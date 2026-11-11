import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { useI18n } from "../i18n/I18nProvider";
import { cn } from "../lib/utils";

export function PageHeader({
  title,
  subtitle,
  backTo,
  onBack,
  actions,
  className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  backTo?: string;
  onBack?: () => void;
  actions?: ReactNode;
  className?: string;
}) {
  const { t } = useI18n();
  return (
    <div
      className={cn("mb-5 flex items-start justify-between gap-3", className)}
    >
      <div className="flex min-w-0 items-start gap-2">
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            aria-label={t("common.back")}
            className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-border bg-card text-muted-foreground transition-colors hover:bg-muted"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
        ) : backTo ? (
          <Link
            to={backTo}
            aria-label={t("common.back")}
            className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-border bg-card text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
        ) : null}
        <div className="min-w-0">
          <h1 className="text-xl font-bold tracking-tight sm:text-2xl">
            {title}
          </h1>
          {subtitle ? (
            <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
          ) : null}
        </div>
      </div>
      {actions ? (
        <div className="flex shrink-0 items-center gap-2">{actions}</div>
      ) : null}
    </div>
  );
}
