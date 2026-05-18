import { createFileRoute } from "@tanstack/react-router";
import { Megaphone, TrendingUp, TrendingDown } from "lucide-react";
import { Card, CardHeader, Badge, PageHeader, StatCard } from "@/components/ui/kit";
import { campanhas } from "@/lib/mock-data";

export const Route = createFileRoute("/_dashboard/liz")({ component: LizPage });

const brl = (n: number) => n === 0 ? "—" : n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

function LizPage() {
  const totalLeads = campanhas.reduce((s, c) => s + c.leads, 0);
  const cplMedio = campanhas.filter(c => c.cpl > 0).reduce((s, c) => s + c.cpl, 0) / campanhas.filter(c => c.cpl > 0).length;

  return (
    <div className="space-y-6">
      <PageHeader title="Liz · Marketing"
        description="Liz analisa origens, custo por lead, qualidade e impacto das campanhas em matrículas."
      />

      <Card className="p-5 bg-gradient-to-br from-[var(--liz)]/10 to-transparent">
        <div className="flex items-start gap-4">
          <div className="h-12 w-12 rounded-full grid place-items-center text-white font-display font-bold text-xl shadow-soft" style={{ background: "var(--liz)" }}>L</div>
          <div className="flex-1">
            <Badge tone="liz"><Megaphone className="h-3 w-3" /> Liz · Marketing IA</Badge>
            <p className="text-sm mt-2 leading-relaxed">
              A campanha de <strong>Bombeiro Civil</strong> tem CPL maior, mas gera leads com <strong>2,3x mais chance de matrícula</strong>.
              Recomendo manter ativa e revisar a campanha de Administração — CPL 42% acima da média e baixa conversão.
            </p>
          </div>
        </div>
      </Card>

      <div className="grid sm:grid-cols-4 gap-4">
        <StatCard label="Total de leads" value={totalLeads} accent="info" />
        <StatCard label="CPL médio" value={brl(cplMedio)} accent="primary" />
        <StatCard label="Custo/matrícula" value="R$ 218" accent="warning" />
        <StatCard label="Conversão média" value="11,5%" accent="success" />
      </div>

      <Card>
        <CardHeader title="Campanhas ativas" subtitle="Performance comparada por canal e curso" />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary/50 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                {["Campanha","Canal","Curso","Leads","CPL","Custo/matrícula","Conversão","Qualidade"].map((h) => (
                  <th key={h} className="text-left font-semibold px-4 py-3">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {campanhas.map((c) => (
                <tr key={c.id} className="border-t border-border">
                  <td className="px-4 py-3 font-medium">{c.nome}</td>
                  <td className="px-4 py-3 text-muted-foreground">{c.canal}</td>
                  <td className="px-4 py-3">{c.curso}</td>
                  <td className="px-4 py-3 tabular-nums">{c.leads}</td>
                  <td className="px-4 py-3 tabular-nums">{brl(c.cpl)}</td>
                  <td className="px-4 py-3 tabular-nums">{brl(c.custoPorMatricula)}</td>
                  <td className="px-4 py-3 tabular-nums">
                    <span className="inline-flex items-center gap-1">
                      {c.conversao >= 10 ? <TrendingUp className="h-3 w-3 text-[var(--success)]" /> : <TrendingDown className="h-3 w-3 text-[var(--destructive)]" />}
                      {c.conversao}%
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone={c.qualidade === "alta" ? "success" : c.qualidade === "media" ? "warning" : "danger"}>{c.qualidade}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
