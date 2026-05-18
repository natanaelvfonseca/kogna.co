import { Link, useRouterState } from "@tanstack/react-router";
import { Bell, LogOut, Menu, MessageCircle, Search } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useSchool } from "@/contexts/SchoolContext";

export function Topbar({ onOpenSidebar }: { onOpenSidebar: () => void }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const title = labelFor(pathname);
  const { logout, user } = useAuth();
  const { currentSchool, status: schoolStatus } = useSchool();
  const schoolName =
    currentSchool?.name || (schoolStatus === "loading" ? "Carregando escola..." : "Kogna Escolas");
  const userName = user?.name || user?.email || "Usuário";
  const roleLabel = roleFor(user?.role);
  const initials =
    userName
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "KG";

  return (
    <header className="sticky top-0 z-20 bg-background/80 backdrop-blur border-b border-border">
      <div className="flex items-center gap-3 px-4 md:px-6 h-16">
        <button onClick={onOpenSidebar} className="lg:hidden p-2 -ml-2 rounded-md hover:bg-muted">
          <Menu className="h-5 w-5" />
        </button>

        <div className="flex-1 min-w-0">
          <div className="text-[11px] uppercase tracking-widest text-muted-foreground">
            {schoolName}
          </div>
          <h1 className="font-display text-base md:text-lg font-semibold truncate">{title}</h1>
        </div>

        <div className="hidden md:flex items-center gap-2 px-3 h-9 rounded-lg border border-input bg-card text-sm text-muted-foreground w-72">
          <Search className="h-4 w-4" />
          <input
            placeholder="Buscar leads, cursos, vendedores..."
            className="flex-1 bg-transparent outline-none text-sm"
          />
          <kbd className="text-[10px] border border-border rounded px-1.5 py-0.5">⌘K</kbd>
        </div>

        <Link to="/alertas" className="relative p-2 rounded-lg hover:bg-muted" aria-label="Alertas">
          <Bell className="h-5 w-5" />
          <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-[var(--destructive)]" />
        </Link>

        <Link
          to="/chat"
          className="hidden md:inline-flex items-center gap-2 rounded-lg bg-gradient-mel px-3 h-9 text-white text-sm font-medium shadow-mel hover:opacity-95"
        >
          <MessageCircle className="h-4 w-4" /> Conversar com a Mel
        </Link>

        <button
          onClick={logout}
          className="flex items-center gap-2 pl-2 pr-2 h-9 rounded-lg border border-border hover:bg-muted"
          title="Sair"
        >
          <div className="h-7 w-7 rounded-full bg-secondary text-secondary-foreground text-xs grid place-items-center font-semibold">
            {initials}
          </div>
          <div className="hidden md:block text-left text-xs leading-tight">
            <div className="font-semibold">{userName}</div>
            <div className="text-muted-foreground">{roleLabel}</div>
          </div>
          <LogOut className="h-4 w-4 text-muted-foreground" />
        </button>
      </div>
    </header>
  );
}

function roleFor(role?: string) {
  const labels: Record<string, string> = {
    admin: "Admin Kogna",
    owner: "Owner",
    manager: "Gestor",
    salesperson: "Vendedor",
    marketing: "Marketing",
    user: "Usuário",
  };
  return role ? labels[role] || role : "Usuário";
}

function labelFor(p: string) {
  const m: Record<string, string> = {
    "/central": "Central da Mel",
    "/onboarding": "Onboarding da Escola",
    "/chat": "Chat com Mel",
    "/pipeline": "Pipeline Comercial",
    "/leads": "Leads",
    "/conversas": "Conversas Analisadas",
    "/tarefas": "Tarefas e Follow-ups",
    "/alertas": "Alertas",
    "/equipe": "Equipe Comercial",
    "/ranking": "Ranking do Time",
    "/cursos": "Cursos e Ofertas",
    "/financeiros": "Dados Financeiros Oficiais",
    "/faturamento": "Faturamento e Projeção",
    "/liz": "Liz Marketing",
    "/lou": "Lou Comandos",
    "/metas": "Metas",
    "/playbook": "Playbook Comercial",
    "/configuracoes": "Configurações da Escola",
  };
  return m[p] ?? "Kogna Escolas";
}
