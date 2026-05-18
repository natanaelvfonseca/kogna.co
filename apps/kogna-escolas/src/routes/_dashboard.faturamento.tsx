import { createFileRoute } from "@tanstack/react-router";
import { Wallet, Target, TrendingUp, Receipt, Clock } from "lucide-react";
import { Card, CardHeader, StatCard, PageHeader, MelAvatar, Badge, ProgressBar } from "@/components/ui/kit";
import { dashboardKPIs, vendedores, cursos } from "@/lib/mock-data";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, BarChart, Bar } from "recharts";

export const Route = createFileRoute("/_dashboard/faturamento")({ component: FaturamentoPage });

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

const serieProj = [
  { d: "Sem 1", real: 9800, proj: 9800 },
  { d: "Sem 2", real: 19400, proj: 22000 },
  { d: "Sem 3", real: 32100, proj: 38500 },
  { d: "Sem 4", real: 42800, proj: 58000 },
  { d: "Sem 5", real: null, proj: 78000 },
  { d: "Sem 6", real: null, proj: 96400 },
];

function FaturamentoPage() {
  const porCurso = cursos.slice(0, 5).map((c, i) => ({ curso: c.nome.split(" ")[0], valor: [12400, 9800, 8200, 6400, 6000][i] }));

  return (
    <div className="space-y-6">
      <PageHeader title="Faturamento e Projeção"
        description="Visão financeira comercial em tempo real, com projeção baseada no pipeline atual."
      />

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Faturamento realizado" value={brl(dashboardKPIs.faturamentoMes)} accent="success" icon={<Wallet className="h-5 w-5" />} hint="Mês atual" />
        <StatCard label="Meta mensal" value={brl(dashboardKPIs.metaMes)} accent="primary" icon={<Target className="h-5 w-5" />} hint="Definida nas metas" />
        <StatCard label="Projeção" value={brl(dashboardKPIs.projecaoMes)} accent="info" icon={<TrendingUp className="h-5 w-5" />} hint="Com pipeline atual" />
        <StatCard label="Gap para meta" value={brl(dashboardKPIs.gapMeta)} accent="danger" icon={<Receipt className="h-5 w-5" />} hint="19% abaixo" />
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader title="Realizado vs projeção" subtitle="Acúmulo semanal · mês corrente" />
          <div className="p-2 h-72">
            <ResponsiveContainer>
              <AreaChart data={serieProj}>
                <defs>
                  <linearGradient id="gReal" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="oklch(0.46 0.18 275)" stopOpacity={0.5} />
                    <stop offset="100%" stopColor="oklch(0.46 0.18 275)" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gProj" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="oklch(0.55 0.2 290)" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="oklch(0.55 0.2 290)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.92 0.008 270)" />
                <XAxis dataKey="d" stroke="oklch(0.52 0.02 265)" fontSize={12} />
                <YAxis stroke="oklch(0.52 0.02 265)" fontSize={12} tickFormatter={(v) => `${v / 1000}k`} />
                <Tooltip formatter={(v: number) => brl(v)} contentStyle={{ borderRadius: 12, border: "1px solid oklch(0.92 0.008 270)" }} />
                <Area type="monotone" dataKey="proj" stroke="oklch(0.55 0.2 290)" fill="url(#gProj)" strokeDasharray="5 5" />
                <Area type="monotone" dataKey="real" stroke="oklch(0.46 0.18 275)" fill="url(#gReal)" strokeWidth={2.5} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="p-5 bg-gradient-to-br from-[var(--mel)]/8 to-primary/5">
          <div className="flex items-center gap-2 mb-3"><MelAvatar size={32} /><div className="font-display font-semibold">Análise da Mel</div></div>
          <p className="text-sm leading-relaxed">
            Com base no volume atual de leads, taxa de conversão de 8,7% e R$ 18.400 em pagamentos pendentes,
            a projeção é fechar <strong>{brl(dashboardKPIs.projecaoMes)}</strong> este mês. Para bater a meta,
            é necessário recuperar 12 leads quentes parados no pipeline.
          </p>
          <Badge tone="mel" >Confiança: alta</Badge>
        </Card>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader title="Receita por curso" subtitle="Mês corrente" />
          <div className="p-2 h-72">
            <ResponsiveContainer>
              <BarChart data={porCurso}>
                <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.92 0.008 270)" />
                <XAxis dataKey="curso" stroke="oklch(0.52 0.02 265)" fontSize={12} />
                <YAxis stroke="oklch(0.52 0.02 265)" fontSize={12} tickFormatter={(v) => `${v / 1000}k`} />
                <Tooltip formatter={(v: number) => brl(v)} contentStyle={{ borderRadius: 12 }} />
                <Bar dataKey="valor" fill="oklch(0.46 0.18 275)" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <CardHeader title="Receita por vendedor" subtitle="Mês corrente" />
          <div className="p-5 space-y-3">
            {[...vendedores].sort((a, b) => b.faturamentoGerado - a.faturamentoGerado).map((v) => (
              <div key={v.id}>
                <div className="flex items-center justify-between text-sm mb-1">
                  <span className="font-medium">{v.nome}</span>
                  <span className="font-bold tabular-nums">{brl(v.faturamentoGerado)}</span>
                </div>
                <ProgressBar value={(v.faturamentoGerado / 20000) * 100} tone="primary" />
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card className="p-5">
        <div className="flex items-center gap-2 mb-3"><Clock className="h-4 w-4 text-muted-foreground" /><div className="font-display font-semibold">Previsão por etapa do pipeline</div></div>
        <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          {[
            ["Condição enviada", brl(28000), "62% prob."],
            ["Pagamento pendente", brl(14200), "84% prob."],
            ["Comprovante recebido", brl(8200), "96% prob."],
            ["Matrícula confirmada", brl(42800), "100%"],
          ].map(([e, v, p]) => (
            <div key={e as string} className="rounded-xl border border-border p-3">
              <div className="text-xs text-muted-foreground">{e}</div>
              <div className="font-display text-xl font-bold mt-1">{v}</div>
              <div className="text-xs text-primary">{p}</div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
