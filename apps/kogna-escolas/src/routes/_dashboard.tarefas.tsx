import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bot, Clock, Loader2, Sparkles, User, AlertTriangle } from "lucide-react";
import { useMemo } from "react";
import { mapLead, mapTask } from "@/adapters/phase2Adapter";
import { Card, Badge, Button, PageHeader, EmptyState } from "@/components/ui/kit";
import { useSchool } from "@/contexts/SchoolContext";
import { coursesApi } from "@/services/api/coursesApi";
import { leadsApi } from "@/services/api/leadsApi";
import { pipelineApi } from "@/services/api/pipelineApi";
import { salesTeamApi } from "@/services/api/salesTeamApi";
import { tasksApi } from "@/services/api/tasksApi";
import type { ApiTask } from "@/types/api";

export const Route = createFileRoute("/_dashboard/tarefas")({ component: TarefasPage });

function TarefasPage() {
  const queryClient = useQueryClient();
  const { currentSchoolId } = useSchool();
  const tasksQuery = useQuery({
    queryKey: ["school-tasks", currentSchoolId],
    enabled: Boolean(currentSchoolId),
    queryFn: () => tasksApi.getTasks(currentSchoolId!),
  });
  const leadsQuery = useQuery({
    queryKey: ["school-leads", currentSchoolId],
    enabled: Boolean(currentSchoolId),
    queryFn: () => leadsApi.getLeads(currentSchoolId!),
  });
  const coursesQuery = useQuery({
    queryKey: ["school-courses", currentSchoolId],
    enabled: Boolean(currentSchoolId),
    queryFn: () => coursesApi.getCourses(currentSchoolId!),
  });
  const sellersQuery = useQuery({
    queryKey: ["school-salespeople", currentSchoolId],
    enabled: Boolean(currentSchoolId),
    queryFn: () => salesTeamApi.getSalespeople(currentSchoolId!),
  });
  const stagesQuery = useQuery({
    queryKey: ["school-pipeline-stages", currentSchoolId],
    enabled: Boolean(currentSchoolId),
    queryFn: () => pipelineApi.getStages(currentSchoolId!),
  });
  const updateMutation = useMutation({
    mutationFn: ({ task, status }: { task: ApiTask; status: string }) =>
      tasksApi.updateTask(currentSchoolId!, task, status),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["school-tasks", currentSchoolId] });
      await queryClient.invalidateQueries({ queryKey: ["school-dashboard", currentSchoolId] });
    },
  });

  const leads = useMemo(
    () =>
      (leadsQuery.data || []).map((lead) =>
        mapLead(lead, {
          courses: coursesQuery.data || [],
          salespeople: sellersQuery.data || [],
          stages: stagesQuery.data || [],
        }),
      ),
    [coursesQuery.data, leadsQuery.data, sellersQuery.data, stagesQuery.data],
  );
  const tasks = useMemo(
    () =>
      (tasksQuery.data || []).map((task) => ({
        raw: task,
        view: mapTask(task, leads, sellersQuery.data || []),
      })),
    [leads, sellersQuery.data, tasksQuery.data],
  );
  const hoje = tasks.filter(({ view }) => view.prazo.includes("Hoje"));
  const atrasadas = tasks.filter(
    ({ view }) => view.status === "aberto" && view.prioridade === "critica",
  );
  const outras = tasks.filter(({ view }) => !view.prazo.includes("Hoje"));
  const isLoading =
    tasksQuery.isLoading ||
    leadsQuery.isLoading ||
    coursesQuery.isLoading ||
    sellersQuery.isLoading ||
    stagesQuery.isLoading;
  const hasError =
    tasksQuery.isError ||
    leadsQuery.isError ||
    coursesQuery.isError ||
    sellersQuery.isError ||
    stagesQuery.isError;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tarefas e Follow-ups"
        description="Tarefas reais geradas pela Mel, pela Lou ou criadas manualmente. Mantenha o ritmo da operação."
        actions={<Button variant="primary">+ Nova tarefa</Button>}
      />

      <div className="grid sm:grid-cols-3 gap-4">
        {[
          { l: "Tarefas hoje", v: hoje.length, t: "info" as const },
          { l: "Follow-ups atrasados", v: atrasadas.length, t: "danger" as const },
          {
            l: "Geradas pela Mel/Lou",
            v: tasks.filter(({ view }) => view.origem !== "Manual").length,
            t: "mel" as const,
          },
        ].map((summary) => (
          <Card key={summary.l} className="p-5">
            <div className="text-xs uppercase text-muted-foreground tracking-wider">
              {summary.l}
            </div>
            <div className="font-display text-3xl font-bold mt-1">{summary.v}</div>
            <Badge tone={summary.t}>
              {summary.t === "mel" ? "IA" : summary.t === "danger" ? "Crítico" : "Hoje"}
            </Badge>
          </Card>
        ))}
      </div>

      {isLoading && (
        <Card className="p-6 flex items-center gap-3 text-sm text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
          Carregando tarefas reais...
        </Card>
      )}

      {hasError && (
        <EmptyState
          title="Não foi possível carregar as tarefas"
          description="Verifique a conexão com o backend e tente novamente."
          icon={<AlertTriangle className="h-5 w-5" />}
        />
      )}

      {!isLoading && !hasError && tasks.length === 0 && (
        <EmptyState
          title="Nenhuma tarefa criada"
          description="Follow-ups, validações e ações da Mel aparecerão aqui."
        />
      )}

      {!isLoading && !hasError && tasks.length > 0 && (
        <Card>
          <div className="p-5 border-b border-border font-display font-semibold">
            Tarefas de hoje
          </div>
          <ul className="divide-y divide-border">
            {hoje.concat(outras).map(({ raw, view }) => (
              <li key={view.id} className="p-4 flex items-center gap-4 hover:bg-muted/30">
                <input
                  type="checkbox"
                  checked={view.status === "concluido"}
                  onChange={(event) =>
                    updateMutation.mutate({
                      task: raw,
                      status: event.target.checked ? "concluida" : "aberta",
                    })
                  }
                  className="rounded border-input h-4 w-4 mt-0.5"
                />
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm">{view.titulo}</div>
                  <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2">
                    <User className="h-3 w-3" /> {view.vendedor}
                    {view.leadRelacionado && (
                      <>
                        {" "}
                        · <span>{view.leadRelacionado}</span>
                      </>
                    )}
                    · <Clock className="h-3 w-3" /> {view.prazo}
                  </div>
                </div>
                <Badge
                  tone={view.origem === "Mel" ? "mel" : view.origem === "Lou" ? "lou" : "muted"}
                >
                  {view.origem === "Mel" ? (
                    <Sparkles className="h-3 w-3" />
                  ) : view.origem === "Lou" ? (
                    <Bot className="h-3 w-3" />
                  ) : null}
                  {view.origem}
                </Badge>
                <Badge
                  tone={
                    view.prioridade === "critica"
                      ? "danger"
                      : view.prioridade === "alta"
                        ? "warning"
                        : view.prioridade === "media"
                          ? "info"
                          : "muted"
                  }
                >
                  {view.prioridade}
                </Badge>
                <Badge
                  tone={
                    view.status === "concluido"
                      ? "success"
                      : view.status === "em_andamento"
                        ? "info"
                        : "muted"
                  }
                >
                  {view.status.replace("_", " ")}
                </Badge>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
