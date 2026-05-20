import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

export const Route = createFileRoute("/")({
  head: () => ({ meta: [{ title: "Entrar — Kogna Escolas" }] }),
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const { error, isAuthenticated, login } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isAuthenticated) {
      void navigate({ to: "/central" });
    }
  }, [isAuthenticated, navigate]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget as HTMLFormElement);
    const email = String(formData.get("email") || "").trim();
    const senha = String(formData.get("senha") || "");

    setIsSubmitting(true);
    try {
      await login(email, senha);
      await navigate({ to: "/central" });
    } catch {
      setIsSubmitting(false);
      return;
    }
  };

  const isLoading = isSubmitting;

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-background">
      <div className="hidden lg:flex flex-col justify-between p-12 bg-sidebar text-sidebar-foreground relative overflow-hidden">
        <div className="absolute -top-24 -right-24 h-96 w-96 rounded-full bg-gradient-mel opacity-20" />
        <div className="absolute bottom-0 -left-24 h-72 w-72 rounded-full bg-[var(--info)] opacity-10" />

        <div className="relative">
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-xl bg-gradient-mel grid place-items-center shadow-mel">
              <Sparkles className="h-5 w-5 text-white" />
            </div>
            <span className="font-display text-xl font-bold">Kogna</span>
            <span className="text-sm text-sidebar-muted">Escolas</span>
          </div>
        </div>

        <div className="relative space-y-6 max-w-md">
          <h1 className="font-display text-4xl font-bold leading-tight">
            Sua escola, monitorada pela{" "}
            <span className="text-transparent bg-clip-text bg-gradient-mel">Mel</span> 24h por dia.
          </h1>
          <p className="text-sidebar-muted">
            Governança comercial por IA para escolas profissionalizantes que vendem pelo WhatsApp.
            Analise conversas, recupere leads e bata metas.
          </p>

          <div className="grid grid-cols-3 gap-3 pt-4">
            {[
              { l: "Mel", c: "var(--mel)" },
              { l: "Lou", c: "var(--lou)" },
              { l: "Liz", c: "var(--liz)" },
            ].map((a) => (
              <div key={a.l} className="rounded-xl border border-sidebar-border p-3">
                <div className="h-8 w-8 rounded-full mb-2" style={{ background: a.c }} />
                <div className="text-sm font-semibold">{a.l}</div>
                <div className="text-xs text-sidebar-muted">
                  {a.l === "Mel" ? "Governança" : a.l === "Lou" ? "Executora" : "Marketing"}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="relative text-xs text-sidebar-muted">© 2026 Kogna · Frontend oficial</div>
      </div>

      <div className="flex items-center justify-center p-6 lg:p-12">
        <form onSubmit={onSubmit} className="w-full max-w-sm space-y-6">
          <div>
            <h2 className="font-display text-2xl font-bold">Entrar na sua escola</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Acesse o painel de governança comercial com seu login real da Kogna.
            </p>
          </div>

          <div className="space-y-3">
            <label className="block text-sm">
              <span className="text-foreground/80">E-mail</span>
              <input
                name="email"
                type="email"
                autoComplete="email"
                required
                className="mt-1 w-full rounded-lg border border-input bg-card px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring/30"
              />
            </label>
            <label className="block text-sm">
              <span className="text-foreground/80">Senha</span>
              <input
                name="senha"
                type="password"
                autoComplete="current-password"
                required
                className="mt-1 w-full rounded-lg border border-input bg-card px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring/30"
              />
            </label>
            <div className="flex items-center justify-between text-sm">
              <label className="inline-flex items-center gap-2 text-muted-foreground">
                <input type="checkbox" defaultChecked className="rounded border-input" /> Lembrar
                acesso
              </label>
              <a className="text-primary hover:underline" href="#">
                Esqueci a senha
              </a>
            </div>
            {error && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </div>
            )}
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-soft hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isLoading ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" /> Entrando...
              </span>
            ) : (
              "Entrar"
            )}
          </button>

          <div className="text-center text-xs text-muted-foreground">
            Primeira vez?{" "}
            <Link to="/onboarding" className="text-primary font-medium hover:underline">
              Configurar minha escola
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
