import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { AlertTriangle, ChevronRight, Filter, Flame, Loader2, X } from "lucide-react";
import { mapLead } from "@/adapters/phase2Adapter";
import { Card, Badge, Button, PageHeader, EmptyState } from "@/components/ui/kit";
import { useSchool } from "@/contexts/SchoolContext";
import { coursesApi } from "@/services/api/coursesApi";
import { leadsApi } from "@/services/api/leadsApi";
import { pipelineApi } from "@/services/api/pipelineApi";
import { salesTeamApi } from "@/services/api/salesTeamApi";
import type { ApiPipelineStage } from "@/types/api";
import type { Lead } from "@/types";

export const Route = createFileRoute("/_dashboard/pipeline")({ component: PipelinePage });

const tempTone: Record<Lead["temperatura"], "info" | "warning" | "danger"> = {
  frio: "info",
  morno: "warning",
  quente: "danger",
};

function PipelinePage() {
  const queryClient = useQueryClient();
  const { currentSchoolId } = useSchool();
  const [vendedor, setVendedor] = useState("");
  const [curso, setCurso] = useState("");
  const [temp, setTemp] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

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

  const moveLeadMutation = useMutation({
    mutationFn: ({ leadId, stageId }: { leadId: string; stageId: string }) =>
      pipelineApi.moveLead(currentSchoolId!, leadId, stageId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["school-leads", currentSchoolId] });
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

  const filtered = useMemo(
    () =>
      leads.filter(
        (lead) =>
          (!vendedor || lead.vendedor === vendedor) &&
          (!curso || lead.curso === curso) &&
          (!temp || lead.temperatura === temp),
      ),
    [curso, leads, temp, vendedor],
  );
  const selected = leads.find((lead) => lead.id === selectedId) || null;
  const isLoading =
    leadsQuery.isLoading ||
    coursesQuery.isLoading ||
    sellersQuery.isLoading ||
    stagesQuery.isLoading;
  const hasError =
    leadsQuery.isError || coursesQuery.isError || sellersQuery.isError || stagesQuery.isError;
  const stages = stagesQuery.data || [];

  if (!currentSchoolId) {
    return (
      <EmptyState
        title="Nenhuma escola selecionada"
        description="Selecione uma escola para carregar o pipeline."
      />
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Pipeline Comercial"
        description="Acompanhe leads em cada etapa da venda. Cards mostram score da Mel e risco de perda."
        actions={<Button variant="primary">+ Novo lead</Button>}
      />

      <Card className="p-4 flex flex-wrap gap-2 items-center">
        <Filter className="h-4 w-4 text-muted-foreground" />
        <Select
          v={vendedor}
          setV={setVendedor}
          ph="Todos os vendedores"
          opts={(sellersQuery.data || []).map((item) => item.name)}
        />
        <Select
          v={curso}
          setV={setCurso}
          ph="Todos os cursos"
          opts={(coursesQuery.data || []).map((item) => item.name)}
        />
        <Select
          v={temp}
          setV={setTemp}
          ph="Todas as temperaturas"
          opts={["frio", "morno", "quente"]}
        />
        <div className="ml-auto text-xs text-muted-foreground">
          {filtered.length} leads no pipeline
        </div>
      </Card>

      {isLoading && (
        <Card className="p-6 flex items-center gap-3 text-sm text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
          Carregando pipeline real da escola...
        </Card>
      )}

      {hasError && (
        <EmptyState
          title="Não foi possível carregar o pipeline"
          description="Verifique a conexão com o backend e tente novamente."
          icon={<AlertTriangle className="h-5 w-5" />}
        />
      )}

      {!isLoading && !hasError && !stages.length && (
        <EmptyState
          title="Pipeline ainda não configurado"
          description="Configure as etapas comerciais da escola para visualizar o kanban."
        />
      )}

      {!isLoading && !hasError && stages.length > 0 && (
        <div className="overflow-x-auto -mx-4 md:mx-0 pb-2 scrollbar-thin">
          <div className="flex gap-3 px-4 md:px-0 min-w-max">
            {stages.map((stage) => {
              const items = filtered.filter((lead) => lead.etapa === stage.name);
              return (
                <div key={stage.id} className="w-72 shrink-0">
                  <div className="flex items-center justify-between mb-2 px-1">
                    <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      {stage.name}
                    </div>
                    <Badge tone="muted">{items.length}</Badge>
                  </div>
                  <div className="space-y-2 bg-secondary/40 rounded-xl p-2 min-h-32">
                    {items.map((lead) => (
                      <button
                        key={lead.id}
                        onClick={() => setSelectedId(lead.id)}
                        className="block w-full text-left bg-card border border-border rounded-lg p-3 shadow-soft hover:border-primary/40 transition"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="font-medium text-sm leading-tight">{lead.nome}</div>
                          <Badge tone={tempTone[lead.temperatura]}>
                            {lead.temperatura === "quente" && <Flame className="h-3 w-3" />}
                            {lead.temperatura}
                          </Badge>
                        </div>
                        <div className="text-xs text-muted-foreground mt-1 truncate">
                          {lead.curso}
                        </div>
                        <div className="mt-2 flex items-center justify-between text-[11px]">
                          <span className="text-muted-foreground">
                            {lead.vendedor.split(" ")[0]}
                          </span>
                          <div className="flex items-center gap-2">
                            <span className="text-muted-foreground">{lead.ultimaInteracao}</span>
                            <span className="font-semibold text-primary">{lead.scoreMel}</span>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {selected && (
        <LeadModal
          lead={selected}
          stages={stages}
          moving={moveLeadMutation.isPending}
          onMove={(stageId) => moveLeadMutation.mutate({ leadId: selected.id, stageId })}
          onClose={() => setSelectedId(null)}
        />
      )}
    </div>
  );
}

function Select({
  v,
  setV,
  ph,
  opts,
}: {
  v: string;
  setV: (s: string) => void;
  ph: string;
  opts: string[];
}) {
  return (
    <select
      value={v}
      onChange={(e) => setV(e.target.value)}
      className="rounded-lg border border-input bg-card px-3 h-9 text-sm"
    >
      <option value="">{ph}</option>
      {opts.map((option) => (
        <option key={option} value={option}>
          {option}
        </option>
      ))}
    </select>
  );
}

function LeadModal({
  lead,
  stages,
  moving,
  onMove,
  onClose,
}: {
  lead: Lead;
  stages: ApiPipelineStage[];
  moving: boolean;
  onMove: (stageId: string) => void;
  onClose: () => void;
}) {
  const currentStage = stages.find((stage) => stage.name === lead.etapa);
  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-black/40 p-4" onClick={onClose}>
      <Card className="w-full max-w-lg p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <Badge tone="muted">{lead.etapa}</Badge>
            <h3 className="font-display text-xl font-bold mt-2">{lead.nome}</h3>
            <div className="text-sm text-muted-foreground">{lead.curso}</div>
          </div>
          <button onClick={onClose} className="p-2 rounded-md hover:bg-muted">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="grid grid-cols-2 gap-3 mt-4 text-sm">
          <Info k="Vendedor" v={lead.vendedor} />
          <Info k="Origem" v={lead.origem} />
          <Info k="Telefone" v={lead.telefone} />
          <Info k="Temperatura" v={lead.temperatura} />
          <Info k="Score Mel" v={`${lead.scoreMel}/100`} />
          <Info k="Risco de perda" v={`${lead.riscoPerda}%`} />
          <Info k="Última interação" v={lead.ultimaInteracao} />
          <Info k="Próxima ação" v={lead.proximaAcao} />
        </div>
        <div className="mt-5 rounded-xl border border-border bg-secondary/40 p-3">
          <label className="text-xs text-muted-foreground">Mover lead manualmente</label>
          <select
            value={currentStage?.id || ""}
            onChange={(event) => onMove(event.target.value)}
            disabled={moving}
            className="mt-1 w-full rounded-lg border border-input bg-card px-3 h-9 text-sm"
          >
            {stages.map((stage) => (
              <option key={stage.id} value={stage.id}>
                {stage.name}
              </option>
            ))}
          </select>
        </div>
        <div className="mt-6 flex gap-2 justify-end">
          <Button variant="secondary" size="sm">
            Ver conversa
          </Button>
          <Button variant="mel" size="sm">
            Pedir análise à Mel <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </Card>
    </div>
  );
}

function Info({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{k}</div>
      <div className="font-medium">{v}</div>
    </div>
  );
}
