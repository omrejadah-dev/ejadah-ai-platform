import { Badge, cn } from "@platform/ui-kit";
import { daysUntil, STATUS_LABEL, statusTone, type Account } from "@/lib/admin";
import { dateOnly } from "@/lib/format";
import { initials, ROLE_LABEL } from "@/lib/ui";

/** Plan colours: a soft background and its text colour, one pair per account type. */
const PLAN_TONE: Record<string, { icon: string; cls: string }> = {
  broker: { icon: "ti-user", cls: "bg-navy-soft text-ink" },
  investor: { icon: "ti-chart-line", cls: "bg-gold-soft text-gold-d" },
  developer: { icon: "ti-building-skyscraper", cls: "bg-success-bg text-success-text" },
};

export function AccountAvatar({ account: a, className }: { account: Account; className?: string }) {
  return (
    <span className={cn("grid size-9 shrink-0 place-items-center rounded-full text-sm font-extrabold", PLAN_TONE[a.role]?.cls ?? "bg-gold-soft text-gold-d", className)} aria-hidden>
      {initials(a.name)}
    </span>
  );
}

export function PlanChip({ account: a }: { account: Account }) {
  const t = PLAN_TONE[a.role];
  return (
    <span className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-extrabold", t?.cls)}>
      <i className={cn("ti", t?.icon)} aria-hidden />{ROLE_LABEL[a.role]}
    </span>
  );
}

/** "فعّال", or the days left when an active account ends within 30 days. */
export function AccountStatusBadge({ account: a }: { account: Account }) {
  const left = daysUntil(a.expiresAt);
  if (a.status === "active" && left <= 30) return <Badge tone="warning">ينتهي خلال {Math.max(0, left)} يوماً</Badge>;
  return <Badge tone={statusTone(a.status)}>{STATUS_LABEL[a.status]}</Badge>;
}

/** How much of a year of subscription is left, as a bar (amber in the last 30 days, red once over). */
export function ExpiryBar({ account: a }: { account: Account }) {
  const left = daysUntil(a.expiresAt);
  const pct = Math.max(0, Math.min(100, (left / 365) * 100));
  return (
    <div className="grid gap-1">
      <div className="h-1.5 overflow-hidden rounded-full bg-border">
        <div className={cn("h-full rounded-full", left <= 0 ? "bg-danger" : left <= 30 ? "bg-amber" : "bg-gold")} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[11px] text-text-3">{left <= 0 ? `انتهى ${dateOnly(a.expiresAt)}` : `حتى ${dateOnly(a.expiresAt)}`}</span>
    </div>
  );
}
