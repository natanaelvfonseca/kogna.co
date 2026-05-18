import { type ReactNode } from "react";

export function Card({ className = "", children, ...rest }: React.HTMLAttributes<HTMLDivElement> & { children: ReactNode }) {
  return <div className={`rounded-2xl border border-border bg-card shadow-soft ${className}`} {...rest}>{children}</div>;
}

export function CardHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 p-5 pb-3">
      <div>
        <h3 className="font-display font-semibold text-base">{title}</h3>
        {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function StatCard({
  label, value, hint, trend, accent = "default", icon,
}: {
  label: string; value: string | number; hint?: string;
  trend?: { value: string; positive?: boolean };
  accent?: "default" | "primary" | "success" | "warning" | "danger" | "info";
  icon?: ReactNode;
}) {
  const ring: Record<string, string> = {
    default: "from-secondary to-secondary",
    primary: "from-[var(--mel)]/15 to-[var(--primary)]/10",
    success: "from-[var(--success)]/15 to-[var(--success)]/5",
    warning: "from-[var(--warning)]/20 to-[var(--warning)]/5",
    danger: "from-[var(--destructive)]/15 to-[var(--destructive)]/5",
    info: "from-[var(--info)]/15 to-[var(--info)]/5",
  };
  return (
    <div className={`relative overflow-hidden rounded-2xl border border-border bg-card p-5 shadow-soft`}>
      <div className={`absolute inset-0 bg-gradient-to-br ${ring[accent]} pointer-events-none`} />
      <div className="relative flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</div>
          <div className="mt-2 font-display text-3xl font-bold">{value}</div>
          {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
        </div>
        {icon && <div className="h-10 w-10 rounded-xl bg-background/60 grid place-items-center text-foreground/70">{icon}</div>}
      </div>
      {trend && (
        <div className={`relative mt-3 inline-flex items-center gap-1 text-xs font-medium ${trend.positive ? "text-[var(--success)]" : "text-[var(--destructive)]"}`}>
          {trend.value}
        </div>
      )}
    </div>
  );
}

export function Badge({ children, tone = "muted" }: { children: ReactNode; tone?: "muted" | "primary" | "success" | "warning" | "danger" | "info" | "mel" | "lou" | "liz" }) {
  const tones: Record<string, string> = {
    muted: "bg-secondary text-secondary-foreground",
    primary: "bg-primary/10 text-primary",
    success: "bg-[var(--success)]/12 text-[var(--success)]",
    warning: "bg-[var(--warning)]/20 text-[oklch(0.4_0.1_60)]",
    danger: "bg-[var(--destructive)]/12 text-[var(--destructive)]",
    info: "bg-[var(--info)]/12 text-[var(--info)]",
    mel: "bg-[var(--mel)]/12 text-[var(--mel)]",
    lou: "bg-[var(--lou)]/12 text-[var(--lou)]",
    liz: "bg-[var(--liz)]/12 text-[var(--liz)]",
  };
  return <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${tones[tone]}`}>{children}</span>;
}

export function Button({
  children, variant = "primary", size = "md", className = "", ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" | "mel" | "danger"; size?: "sm" | "md" }) {
  const v: Record<string, string> = {
    primary: "bg-primary text-primary-foreground hover:opacity-90",
    secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
    ghost: "hover:bg-muted text-foreground",
    mel: "bg-gradient-mel text-white shadow-mel hover:opacity-95",
    danger: "bg-[var(--destructive)] text-white hover:opacity-90",
  };
  const s = size === "sm" ? "h-8 px-3 text-xs" : "h-9 px-4 text-sm";
  return <button className={`inline-flex items-center justify-center gap-2 rounded-lg font-medium transition ${v[variant]} ${s} ${className}`} {...rest}>{children}</button>;
}

export function ProgressBar({ value, tone = "primary" }: { value: number; tone?: "primary" | "success" | "warning" | "danger" }) {
  const colors: Record<string, string> = {
    primary: "bg-primary",
    success: "bg-[var(--success)]",
    warning: "bg-[var(--warning)]",
    danger: "bg-[var(--destructive)]",
  };
  return (
    <div className="h-2 w-full rounded-full bg-secondary overflow-hidden">
      <div className={`h-full ${colors[tone]} rounded-full transition-all`} style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
    </div>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-6">
      <div>
        <h2 className="font-display text-2xl md:text-3xl font-bold tracking-tight">{title}</h2>
        {description && <p className="text-sm text-muted-foreground mt-1 max-w-2xl">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

export function EmptyState({ title, description, icon }: { title: string; description?: string; icon?: ReactNode }) {
  return (
    <div className="text-center py-12 px-4">
      {icon && <div className="mx-auto h-12 w-12 rounded-full bg-secondary grid place-items-center text-muted-foreground mb-3">{icon}</div>}
      <div className="font-semibold">{title}</div>
      {description && <div className="text-sm text-muted-foreground mt-1">{description}</div>}
    </div>
  );
}

export function MelAvatar({ size = 40 }: { size?: number }) {
  return (
    <div
      className="rounded-full bg-gradient-mel grid place-items-center text-white font-display font-bold shadow-mel"
      style={{ width: size, height: size, fontSize: size * 0.4 }}
    >
      M
    </div>
  );
}
