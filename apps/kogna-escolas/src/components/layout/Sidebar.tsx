import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard, Sparkles, MessageSquare, KanbanSquare, Users, MessagesSquare,
  CheckSquare, BellRing, UserCog, Trophy, GraduationCap, Landmark, LineChart,
  Megaphone, Bot, Target, BookOpen, Settings, Rocket,
} from "lucide-react";

const items = [
  { to: "/central", label: "Central da Mel", icon: LayoutDashboard, group: "Visão" },
  { to: "/chat", label: "Chat com Mel", icon: MessageSquare, group: "Visão" },
  { to: "/alertas", label: "Alertas", icon: BellRing, group: "Visão", badge: 4 },

  { to: "/pipeline", label: "Pipeline Comercial", icon: KanbanSquare, group: "Comercial" },
  { to: "/leads", label: "Leads", icon: Users, group: "Comercial" },
  { to: "/conversas", label: "Conversas Analisadas", icon: MessagesSquare, group: "Comercial" },
  { to: "/tarefas", label: "Tarefas e Follow-ups", icon: CheckSquare, group: "Comercial" },

  { to: "/equipe", label: "Equipe Comercial", icon: UserCog, group: "Time" },
  { to: "/ranking", label: "Ranking do Time", icon: Trophy, group: "Time" },

  { to: "/cursos", label: "Cursos e Ofertas", icon: GraduationCap, group: "Operação" },
  { to: "/financeiros", label: "Dados Financeiros", icon: Landmark, group: "Operação" },
  { to: "/faturamento", label: "Faturamento e Projeção", icon: LineChart, group: "Operação" },

  { to: "/liz", label: "Liz Marketing", icon: Megaphone, group: "Agentes IA" },
  { to: "/lou", label: "Lou Comandos", icon: Bot, group: "Agentes IA" },

  { to: "/metas", label: "Metas", icon: Target, group: "Configuração" },
  { to: "/playbook", label: "Playbook Comercial", icon: BookOpen, group: "Configuração" },
  { to: "/onboarding", label: "Onboarding", icon: Rocket, group: "Configuração" },
  { to: "/configuracoes", label: "Configurações", icon: Settings, group: "Configuração" },
] as const;

const groups = ["Visão", "Comercial", "Time", "Operação", "Agentes IA", "Configuração"] as const;

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <aside className="flex h-full w-72 flex-col bg-sidebar text-sidebar-foreground">
      <div className="flex items-center gap-2 px-5 py-5 border-b border-sidebar-border">
        <div className="h-9 w-9 rounded-xl bg-gradient-mel grid place-items-center shadow-mel">
          <Sparkles className="h-5 w-5 text-white" />
        </div>
        <div className="leading-tight">
          <div className="font-display font-bold text-base">Kogna</div>
          <div className="text-[11px] text-sidebar-muted">Escolas · Governança IA</div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto scrollbar-thin px-3 py-4 space-y-5">
        {groups.map((g) => (
          <div key={g}>
            <div className="px-2 mb-2 text-[10px] uppercase tracking-widest text-sidebar-muted font-semibold">{g}</div>
            <ul className="space-y-0.5">
              {items.filter((i) => i.group === g).map((item) => {
                const active = pathname === item.to;
                const Icon = item.icon;
                return (
                  <li key={item.to}>
                    <Link
                      to={item.to}
                      onClick={onNavigate}
                      className={[
                        "group flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition",
                        active
                          ? "bg-sidebar-accent text-white shadow-soft"
                          : "text-sidebar-foreground/80 hover:bg-white/5 hover:text-white",
                      ].join(" ")}
                    >
                      <Icon className={["h-4 w-4", active ? "text-white" : "text-sidebar-muted group-hover:text-white"].join(" ")} />
                      <span className="flex-1">{item.label}</span>
                      {"badge" in item && item.badge ? (
                        <span className="rounded-full bg-[var(--destructive)] text-white text-[10px] px-1.5 py-0.5 font-semibold">{item.badge}</span>
                      ) : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="border-t border-sidebar-border p-4">
        <div className="rounded-xl bg-gradient-mel p-4 text-white shadow-mel">
          <div className="text-xs uppercase tracking-widest opacity-80">Operação</div>
          <div className="text-sm font-semibold mt-1">Monitorada pela Mel</div>
          <div className="mt-3 flex items-center gap-2">
            <div className="text-3xl font-display font-bold">72</div>
            <div className="text-xs opacity-80 leading-tight">Score de<br/>Governança</div>
          </div>
        </div>
      </div>
    </aside>
  );
}
