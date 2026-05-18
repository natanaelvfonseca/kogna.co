import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { AlertTriangle, Filter, Loader2 } from "lucide-react";
import { mapAlert } from "@/adapters/phase2Adapter";
import { Card, Badge, Button, PageHeader, EmptyState } from "@/components/ui/kit";
import { useSchool } from "@/contexts/SchoolContext";
import { alertsApi } from "@/services/api/alertsApi";
import { salesTeamApi } from "@/services/api/salesTeamApi";
import type { ApiAlert } from "@/types/api";
import type { Prioridade } from "@/types";

export const Route = createFileRoute("/_dashboard/alertas")({ component: AlertasPage });

const prioTone: Record<Prioridade, "info" | "warning" | "danger" | "muted"> = {
  baixa: "muted",
  media: "info",
  alta: "warning",
  critica: "danger",
};

function AlertasPage() {
  const queryClient = useQueryClient();
  const { currentSchoolId } = useSchool();
  const [prio, setPrio] = useState("");
  const [status, setStatus] = useState("");

  const alertsQuery = useQuery({
    queryKey: ["school-alerts", currentSchoolId],
    enabled: Boolean(currentSchoolId),
    queryFn: () => alertsApi.getAlerts(currentSchoolId!),
  });
  const sellersQuery = useQuery({
    queryKey: ["school-salespeople", currentSchoolId],
    enabled: Boolean(currentSchoolId),
    queryFn: () => salesTeamApi.getSalespeople(currentSchoolId!),
  });
  const updateMutation = useMutation({
    mutationFn: ({ alert, nextStatus }: { alert: ApiAlert; nextStatus: string }) =>
      alertsApi.updateAlert(currentSchoolId!, alert, nextStatus),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["school-alerts", currentSchoolId] });
      await queryClient.invalidateQueries({ queryKey: ["school-dashboard", currentSchoolId] });
    },
  });

  const mapped = useMemo(
    () =>
      (alertsQuery.data || []).map((alert) => ({
        raw: alert,
        view: mapAlert(alert, sellersQuery.data || []),
      })),
    [alertsQuery.data, sellersQuery.data],
  );
  const filtered = useMemo(
    () =>
      mapped.filter(
        ({ view }) => (!prio || view.prioridade === prio) && (!status || view.status === status),
      ),
    [mapped, prio, status],
  );
  const isLoading = alertsQuery.isLoading || sellersQuery.isLoading;
  const hasError = alertsQuery.isError || sellersQuery.isError;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Alertas"
        description="Central de alertas da Mel. Priorize riscos críticos e mantenha a operação sob controle."
      />

      <Card className="p-4 flex flex-wrap gap-2 items-center">
        <Filter className="h-4 w-4 text-muted-foreground" />
        <select
          value={prio}
          onChange={(e) => setPrio(e.target.value)}
          className="rounded-lg border border-input bg-card px-3 h-9 text-sm"
        >
          <option value="">Todas prioridades</option>
          {["critica", "alta", "media", "baixa"].map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="rounded-lg border border-input bg-card px-3 h-9 text-sm"
        >
          <option value="">Todos status</option>
          {["aberto", "em_andamento", "resolvido", "ignorado"].map((option) => (
            <option key={option} value={option}>
              {option.replace("_", " ")}
            </option>
          ))}
        </select>
        <div className="ml-auto text-xs text-muted-foreground">{filtered.length} alertas</div>
      </Card>

      {isLoading && (
        <Card className="p-6 flex items-center gap-3 text-sm text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
          Carregando alertas reais...
        </Card>
      )}

      {hasError && (
        <EmptyState
          title="Não foi possível carregar os alertas"
          description="Verifique a conexão com o backend e tente novamente."
          icon={<AlertTriangle className="h-5 w-5" />}
        />
      )}

      {!isLoading && !hasError && filtered.length === 0 && (
        <EmptyState
          title="Nenhum alerta encontrado"
          description="A Mel ainda não encontrou alertas para os filtros selecionados."
        />
      )}

      {!isLoading && !hasError && filtered.length > 0 && (
        <div className="space-y-3">
          {filtered.map(({ raw, view }) => (
            <Card key={view.id} className="p-5">
              <div className="flex items-start gap-4">
                <div
                  className={`h-10 w-10 rounded-xl grid place-items-center shrink-0 ${view.prioridade === "critica" ? "bg-[var(--destructive)]/15 text-[var(--destructive)]" : view.prioridade === "alta" ? "bg-[var(--warning)]/20 text-[oklch(0.4_0.1_60)]" : "bg-secondary text-muted-foreground"}`}
                >
                  <AlertTriangle className="h-5 w-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={prioTone[view.prioridade]}>{view.prioridade}</Badge>
                    <Badge tone="muted">{view.tipo}</Badge>
                    <span className="text-xs text-muted-foreground">{view.criadoEm}</span>
                  </div>
                  <div className="font-display font-semibold mt-2">{view.titulo}</div>
                  <div className="text-sm text-muted-foreground mt-1">{view.descricao}</div>
                  <div className="mt-3 rounded-lg bg-primary/5 border border-primary/15 p-3 text-sm">
                    <span className="text-primary font-semibold">Recomendação: </span>
                    {view.recomendacao}
                  </div>
                  <div className="mt-3 flex items-center justify-between flex-wrap gap-2">
                    <div className="text-xs text-muted-foreground">
                      Responsável:{" "}
                      <span className="font-medium text-foreground">{view.responsavel}</span>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={updateMutation.isPending}
                        onClick={() =>
                          updateMutation.mutate({ alert: raw, nextStatus: "ignorado" })
                        }
                      >
                        Ignorar
                      </Button>
                      <Button
                        variant="primary"
                        size="sm"
                        disabled={updateMutation.isPending}
                        onClick={() =>
                          updateMutation.mutate({ alert: raw, nextStatus: "resolvido" })
                        }
                      >
                        Resolver
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
