import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { AlertTriangle, Flame, Loader2, Search } from "lucide-react";
import { mapLead } from "@/adapters/phase2Adapter";
import { Card, Badge, Button, PageHeader, EmptyState } from "@/components/ui/kit";
import { useSchool } from "@/contexts/SchoolContext";
import { coursesApi } from "@/services/api/coursesApi";
import { leadsApi } from "@/services/api/leadsApi";
import { pipelineApi } from "@/services/api/pipelineApi";
import { salesTeamApi } from "@/services/api/salesTeamApi";

export const Route = createFileRoute("/_dashboard/leads")({ component: LeadsPage });

function LeadsPage() {
  const { currentSchoolId } = useSchool();
  const [q, setQ] = useState("");
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
      leads.filter((lead) =>
        [lead.nome, lead.curso, lead.vendedor, lead.origem, lead.telefone]
          .join(" ")
          .toLowerCase()
          .includes(q.toLowerCase()),
      ),
    [leads, q],
  );
  const isLoading =
    leadsQuery.isLoading ||
    coursesQuery.isLoading ||
    sellersQuery.isLoading ||
    stagesQuery.isLoading;
  const hasError =
    leadsQuery.isError || coursesQuery.isError || sellersQuery.isError || stagesQuery.isError;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Leads"
        description="Todos os leads reais da escola com origem, etapa, temperatura e próxima ação."
        actions={<Button variant="primary">+ Novo lead</Button>}
      />

      <Card className="p-4">
        <div className="flex items-center gap-2 px-3 h-10 rounded-lg bg-secondary/60">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por nome, curso, vendedor ou origem..."
            className="flex-1 bg-transparent text-sm outline-none"
          />
          <span className="text-xs text-muted-foreground">{filtered.length} resultados</span>
        </div>
      </Card>

      {isLoading && (
        <Card className="p-6 flex items-center gap-3 text-sm text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
          Carregando leads reais...
        </Card>
      )}

      {hasError && (
        <EmptyState
          title="Não foi possível carregar os leads"
          description="Verifique a conexão com o backend e tente novamente."
          icon={<AlertTriangle className="h-5 w-5" />}
        />
      )}

      {!isLoading && !hasError && filtered.length === 0 && (
        <EmptyState
          title="Nenhum lead encontrado"
          description="Quando novos leads entrarem pelo WhatsApp ou forem cadastrados, eles aparecerão aqui."
        />
      )}

      {!isLoading && !hasError && filtered.length > 0 && (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-secondary/50 text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  {[
                    "Nome",
                    "Curso",
                    "Origem",
                    "Vendedor",
                    "Etapa",
                    "Temp.",
                    "Última",
                    "Próxima ação",
                  ].map((header) => (
                    <th key={header} className="text-left font-semibold px-4 py-3">
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((lead) => (
                  <tr key={lead.id} className="border-t border-border hover:bg-muted/40">
                    <td className="px-4 py-3">
                      <div className="font-medium">{lead.nome}</div>
                      <div className="text-xs text-muted-foreground">{lead.telefone}</div>
                    </td>
                    <td className="px-4 py-3">{lead.curso}</td>
                    <td className="px-4 py-3 text-muted-foreground">{lead.origem}</td>
                    <td className="px-4 py-3">{lead.vendedor}</td>
                    <td className="px-4 py-3">
                      <Badge tone="muted">{lead.etapa}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <Badge
                        tone={
                          lead.temperatura === "quente"
                            ? "danger"
                            : lead.temperatura === "morno"
                              ? "warning"
                              : "info"
                        }
                      >
                        {lead.temperatura === "quente" && <Flame className="h-3 w-3" />}
                        {lead.temperatura}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{lead.ultimaInteracao}</td>
                    <td className="px-4 py-3">{lead.proximaAcao}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
