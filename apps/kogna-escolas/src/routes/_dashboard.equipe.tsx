import { createFileRoute } from "@tanstack/react-router";
import { TrendingUp, Trophy, Clock } from "lucide-react";
import { Card, Badge, Button, PageHeader, ProgressBar } from "@/components/ui/kit";
import { vendedores } from "@/lib/mock-data";

export const Route = createFileRoute("/_dashboard/equipe")({ component: EquipePage });

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

function EquipePage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Equipe Comercial" description="Performance dos vendedores avaliada pela Mel: conversão, follow-up, aderência ao playbook."
        actions={<Button variant="primary">+ Novo vendedor</Button>}
      />

      <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-4">
        {vendedores.map((v) => (
          <Card key={v.id} className="p-5">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-full bg-gradient-mel text-white grid place-items-center font-bold">{v.iniciais}</div>
              <div className="flex-1 min-w-0">
                <div className="font-display font-semibold truncate">{v.nome}</div>
                <Badge tone={v.status === "ativo" ? "success" : v.status === "ausente" ? "warning" : "muted"}>{v.status}</Badge>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
              <Stat label="Leads" value={v.leadsAtendidos} />
              <Stat label="Matrículas" value={v.matriculasConfirmadas} />
              <Stat label="Conversão" value={`${v.taxaConversao}%`} />
              <Stat label="Tempo médio" value={v.tempoMedioResposta} icon={<Clock className="h-3 w-3" />} />
            </div>

            <div className="mt-4">
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="text-muted-foreground">Score Mel</span>
                <span className="font-bold">{v.scoreMel}/100</span>
              </div>
              <ProgressBar value={v.scoreMel} tone={v.scoreMel > 75 ? "success" : v.scoreMel > 55 ? "primary" : "danger"} />
            </div>

            <div className="mt-4 text-xs text-muted-foreground">Faturamento: <span className="font-semibold text-foreground">{brl(v.faturamentoGerado)}</span></div>

            {v.conquistas.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1">
                {v.conquistas.map((c) => <Badge key={c} tone="mel"><Trophy className="h-3 w-3" />{c}</Badge>)}
              </div>
            )}

            <Button variant="secondary" size="sm" className="w-full mt-4">Ver detalhe <TrendingUp className="h-3 w-3" /></Button>
          </Card>
        ))}
      </div>
    </div>
  );
}

function Stat({ label, value, icon }: { label: string; value: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <div className="rounded-lg bg-secondary/60 p-2">
      <div className="text-[10px] uppercase text-muted-foreground tracking-wider flex items-center gap-1">{icon}{label}</div>
      <div className="font-semibold">{value}</div>
    </div>
  );
}
