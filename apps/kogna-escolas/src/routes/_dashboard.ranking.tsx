import { createFileRoute } from "@tanstack/react-router";
import { Trophy, Medal, Award, Zap, Crown } from "lucide-react";
import { Card, Badge, PageHeader } from "@/components/ui/kit";
import { vendedores } from "@/lib/mock-data";

export const Route = createFileRoute("/_dashboard/ranking")({ component: RankingPage });

const categorias = [
  { titulo: "Mais matrículas", icon: Crown, key: "matriculasConfirmadas" as const, suffix: "" },
  { titulo: "Melhor conversão", icon: Trophy, key: "taxaConversao" as const, suffix: "%" },
  { titulo: "Mais leads atendidos", icon: Zap, key: "leadsAtendidos" as const, suffix: "" },
  { titulo: "Maior score Mel", icon: Medal, key: "scoreMel" as const, suffix: "" },
];

const conquistas = [
  { nome: "Campeão de Follow-up", icon: "🏆" },
  { nome: "Melhor Atendimento", icon: "🥇" },
  { nome: "Vendedor da Semana", icon: "⭐" },
  { nome: "Recuperador de Leads", icon: "🎯" },
  { nome: "Evolução da Semana", icon: "📈" },
  { nome: "Meta Batida", icon: "✅" },
];

function RankingPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Ranking do Time" description="Reconhecimento e estímulo da performance comercial." />

      <div className="grid md:grid-cols-2 gap-4">
        {categorias.map(({ titulo, icon: Icon, key, suffix }) => {
          const sorted = [...vendedores].sort((a, b) => (b[key] as number) - (a[key] as number));
          return (
            <Card key={titulo} className="p-5">
              <div className="flex items-center gap-2 mb-4">
                <div className="h-9 w-9 rounded-xl bg-gradient-mel grid place-items-center text-white"><Icon className="h-5 w-5" /></div>
                <div className="font-display font-semibold">{titulo}</div>
              </div>
              <ul className="space-y-2">
                {sorted.map((v, i) => (
                  <li key={v.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/40">
                    <div className={`h-7 w-7 rounded-full grid place-items-center text-xs font-bold ${i === 0 ? "bg-[oklch(0.85_0.15_85)] text-foreground" : i === 1 ? "bg-secondary" : i === 2 ? "bg-[oklch(0.78_0.1_30)]/40" : "bg-secondary"}`}>{i + 1}</div>
                    <div className="flex-1 font-medium text-sm">{v.nome}</div>
                    <div className="font-display font-bold tabular-nums">{v[key]}{suffix}</div>
                  </li>
                ))}
              </ul>
            </Card>
          );
        })}
      </div>

      <Card className="p-5">
        <div className="flex items-center gap-2 mb-4">
          <Award className="h-5 w-5 text-primary" />
          <div className="font-display font-semibold">Conquistas disponíveis</div>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {conquistas.map((c) => (
            <div key={c.nome} className="flex items-center gap-3 p-3 rounded-xl border border-border">
              <div className="h-10 w-10 rounded-xl bg-secondary grid place-items-center text-xl">{c.icon}</div>
              <div>
                <div className="font-medium text-sm">{c.nome}</div>
                <Badge tone="muted">Profissional</Badge>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
