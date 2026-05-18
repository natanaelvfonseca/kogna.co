import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  ChevronRight,
  Clock,
  Flame,
  Loader2,
  Sparkles,
  Target,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";
import { mapAlert, mapDashboard } from "@/adapters/phase2Adapter";
import {
  Card,
  CardHeader,
  StatCard,
  Badge,
  Button,
  ProgressBar,
  MelAvatar,
  EmptyState,
} from "@/components/ui/kit";
import { useSchool } from "@/contexts/SchoolContext";
import { dashboardApi } from "@/services/api/dashboardApi";
import { salesTeamApi } from "@/services/api/salesTeamApi";

export const Route = createFileRoute("/_dashboard/central")({ component: CentralDaMel });

const brl = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

function CentralDaMel() {
  const { currentSchoolId } = useSchool();
  const dashboardQuery = useQuery({
    queryKey: ["school-dashboard", currentSchoolId],
    enabled: Boolean(currentSchoolId),
    queryFn: () => dashboardApi.getDashboard(currentSchoolId!),
  });
  const salesTeamQuery = useQuery({
    queryKey: ["school-salespeople", currentSchoolId],
    enabled: Boolean(currentSchoolId),
    queryFn: () => salesTeamApi.getSalespeople(currentSchoolId!),
  });

  if (!currentSchoolId) {
    return (
      <EmptyState
        title="Nenhuma escola selecionada"
        description="Entre com um usuário vinculado a uma escola para carregar a Central da Mel."
        icon={<Sparkles className="h-5 w-5" />}
      />
    );
  }

  if (dashboardQuery.isLoading || salesTeamQuery.isLoading) {
    return (
      <Card className="p-8">
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
          Mel está lendo os dados reais da escola...
        </div>
      </Card>
    );
  }

  if (dashboardQuery.isError || !dashboardQuery.data) {
    return (
      <EmptyState
        title="Não foi possível carregar a Central da Mel"
        description={
          dashboardQuery.error instanceof Error
            ? dashboardQuery.error.message
            : "Verifique se o backend está ativo."
        }
        icon={<AlertTriangle className="h-5 w-5" />}
      />
    );
  }

  const dashboard = mapDashboard(dashboardQuery.data, salesTeamQuery.data || []);
  const criticos = dashboardQuery.data.alerts
    .map((alert) => mapAlert(alert, salesTeamQuery.data || []))
    .filter((alert) => alert.prioridade === "critica" || alert.prioridade === "alta")
    .slice(0, 4);

  return (
    <div className="space-y-6">
      <Card className="relative overflow-hidden">
        <div className="absolute -top-20 -right-20 h-72 w-72 rounded-full bg-gradient-mel opacity-20 blur-3xl" />
        <div className="relative p-6 md:p-8 grid md:grid-cols-[auto_1fr_auto] gap-6 items-center">
          <MelAvatar size={64} />
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="mel">
                <Sparkles className="h-3 w-3" /> Mel · Governança IA
              </Badge>
              <Badge tone="success">{dashboard.escola.nivelOperacao}</Badge>
            </div>
            <h2 className="mt-2 font-display text-2xl md:text-3xl font-bold">
              Bom dia. Sua operação comercial está sob meu olhar.
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              {dashboard.escola.nome} · {dashboard.escola.unidade}. Acompanhei{" "}
              {dashboard.kpis.leadsHoje} leads hoje e encontrei{" "}
              {dashboard.recommendedActions.length} ações recomendadas.
            </p>
          </div>
          <div className="flex flex-col items-center md:items-end gap-3">
            <div className="text-center">
              <div className="text-[11px] uppercase tracking-widest text-muted-foreground">
                Score de Governança
              </div>
              <div className="font-display text-4xl font-bold text-primary">
                {dashboard.escola.scoreGovernanca}
                <span className="text-base text-muted-foreground">/100</span>
              </div>
            </div>
            <Link to="/chat">
              <Button variant="mel">
                Conversar com a Mel <ChevronRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Leads hoje"
          value={dashboard.kpis.leadsHoje}
          hint="Entraram hoje"
          accent="info"
          icon={<Users className="h-5 w-5" />}
        />
        <StatCard
          label="Leads quentes"
          value={dashboard.kpis.leadsQuentes}
          hint="Precisam de ação"
          accent="danger"
          icon={<Flame className="h-5 w-5" />}
        />
        <StatCard
          label="Sem resposta"
          value={dashboard.kpis.leadsSemResposta}
          hint="Sem interação recente"
          accent="warning"
          icon={<Clock className="h-5 w-5" />}
        />
        <StatCard
          label="Follow-ups atrasados"
          value={dashboard.kpis.followUpsAtrasados}
          hint="Tarefas vencidas"
          accent="warning"
          icon={<AlertTriangle className="h-5 w-5" />}
        />
        <StatCard
          label="Matrículas confirmadas"
          value={dashboard.kpis.matriculasConfirmadas}
          hint="No funil atual"
          accent="success"
          icon={<CheckCircle2 className="h-5 w-5" />}
        />
        <StatCard
          label="Faturamento do mês"
          value={brl(dashboard.kpis.faturamentoMes)}
          hint={`Meta: ${brl(dashboard.kpis.metaMes)}`}
          accent="primary"
          icon={<Wallet className="h-5 w-5" />}
        />
        <StatCard
          label="Projeção do mês"
          value={brl(dashboard.kpis.projecaoMes)}
          hint="Média diária simples"
          accent="primary"
          icon={<TrendingUp className="h-5 w-5" />}
        />
        <StatCard
          label="Gap para meta"
          value={brl(dashboard.kpis.gapMeta)}
          hint="Diferença para meta"
          accent="danger"
          icon={<Target className="h-5 w-5" />}
        />
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader
            title="A Mel recomenda agora"
            subtitle="Ações priorizadas com base nos dados reais"
            action={<Badge tone="mel">{dashboard.recommendedActions.length} recomendações</Badge>}
          />
          <div className="px-5 pb-5 space-y-3">
            {dashboard.recommendedActions.map((recommendation, index) => (
              <div
                key={recommendation.id}
                className="group flex gap-3 p-4 rounded-xl border border-border hover:border-primary/40 hover:bg-primary/5 transition"
              >
                <div className="h-9 w-9 rounded-lg bg-gradient-mel grid place-items-center text-white text-xs font-bold shrink-0">
                  {index + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm">{recommendation.titulo}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{recommendation.acao}</div>
                </div>
                <Badge
                  tone={
                    recommendation.impacto === "Crítico"
                      ? "danger"
                      : recommendation.impacto === "Alto"
                        ? "warning"
                        : "info"
                  }
                >
                  {recommendation.impacto}
                </Badge>
                <ArrowUpRight className="h-4 w-4 text-muted-foreground group-hover:text-primary" />
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Alertas críticos"
            subtitle="Atenção imediata"
            action={
              <Link to="/alertas" className="text-xs text-primary hover:underline">
                Ver todos
              </Link>
            }
          />
          <div className="px-5 pb-5 space-y-2">
            {criticos.length ? (
              criticos.map((alert) => (
                <div key={alert.id} className="p-3 rounded-lg border border-border">
                  <div className="flex items-start gap-2">
                    <span
                      className={`mt-1 h-2 w-2 rounded-full ${alert.prioridade === "critica" ? "bg-[var(--destructive)]" : "bg-[var(--warning)]"}`}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium leading-tight">{alert.titulo}</div>
                      <div className="text-xs text-muted-foreground mt-0.5 truncate">
                        {alert.descricao}
                      </div>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <EmptyState
                title="Sem alertas críticos"
                description="A operação não possui alertas de alta prioridade agora."
              />
            )}
          </div>
        </Card>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader
            title="Pipeline em risco"
            subtitle="Etapas com mais leads parados"
            action={
              <Link to="/pipeline" className="text-xs text-primary hover:underline">
                Abrir pipeline
              </Link>
            }
          />
          <div className="px-5 pb-5 space-y-3">
            {dashboard.pipelineRisk.length ? (
              dashboard.pipelineRisk.map((stage) => (
                <div key={stage.etapa} className="flex items-center gap-4">
                  <div className="w-44 shrink-0 text-sm font-medium">{stage.etapa}</div>
                  <div className="flex-1">
                    <ProgressBar
                      value={(stage.leads / 10) * 100}
                      tone={
                        stage.risco === "critica"
                          ? "danger"
                          : stage.risco === "alta"
                            ? "warning"
                            : "primary"
                      }
                    />
                  </div>
                  <div className="w-28 text-right text-sm tabular-nums">
                    <span className="font-semibold">{stage.leads}</span>{" "}
                    <span className="text-muted-foreground text-xs">leads</span>
                  </div>
                </div>
              ))
            ) : (
              <EmptyState
                title="Pipeline sem risco"
                description="Nenhuma etapa possui acúmulo relevante de leads."
              />
            )}
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Resumo do time"
            subtitle="Ranking por atividade"
            action={
              <Link to="/ranking" className="text-xs text-primary hover:underline">
                Ver ranking
              </Link>
            }
          />
          <div className="px-5 pb-5 space-y-2">
            {dashboard.topSalespeople.length ? (
              dashboard.topSalespeople.map((seller, index) => (
                <div
                  key={seller.id}
                  className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50"
                >
                  <div className="text-xs text-muted-foreground w-4">{index + 1}</div>
                  <div className="h-8 w-8 rounded-full bg-secondary grid place-items-center text-xs font-semibold">
                    {seller.iniciais}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{seller.nome}</div>
                    <div className="text-xs text-muted-foreground">
                      {seller.leadsAtendidos} leads · {brl(seller.faturamentoGerado)}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-bold tabular-nums">{seller.scoreMel}</div>
                    <div className="text-[10px] text-muted-foreground">Mel</div>
                  </div>
                </div>
              ))
            ) : (
              <EmptyState
                title="Equipe ainda sem dados"
                description="Cadastre vendedores para acompanhar performance."
              />
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
