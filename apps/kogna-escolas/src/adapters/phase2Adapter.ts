import type {
  ApiAlert,
  ApiCourse,
  ApiDashboard,
  ApiLead,
  ApiPipelineStage,
  ApiSalesperson,
  ApiTask,
} from "@/types/api";
import type { Alerta, Lead, Prioridade, StatusLead, Tarefa, Vendedor } from "@/types";
import {
  formatDueDate,
  formatRelativeDate,
  initialsFromName,
  normalizePriority,
  normalizeTemperature,
} from "./format";

const defaultStage = "Lead novo" as StatusLead;

export function mapStageName(stage?: ApiPipelineStage | null): StatusLead {
  return (stage?.name || defaultStage) as StatusLead;
}

export function mapSalesperson(seller: ApiSalesperson): Vendedor {
  const revenueGoal = Number(seller.monthlyRevenueGoal || 0);
  const enrollmentGoal = Number(seller.monthlyEnrollmentGoal || 0);
  return {
    id: seller.id,
    nome: seller.name,
    iniciais: initialsFromName(seller.name),
    leadsAtendidos: 0,
    tempoMedioResposta: "—",
    followUpsFeitos: 0,
    matriculasConfirmadas: 0,
    faturamentoGerado: revenueGoal,
    scoreMel: 0,
    taxaConversao: enrollmentGoal,
    status: seller.status === "inactive" || seller.status === "inativo" ? "inativo" : "ativo",
    conquistas: [],
  };
}

export function mapLead(
  lead: ApiLead,
  context: {
    courses: ApiCourse[];
    salespeople: ApiSalesperson[];
    stages: ApiPipelineStage[];
  },
): Lead {
  const course = context.courses.find((item) => item.id === lead.courseId);
  const salesperson = context.salespeople.find((item) => item.id === lead.salespersonId);
  const stage = context.stages.find((item) => item.id === lead.pipelineStageId);
  const temperature = normalizeTemperature(lead.temperature) as Lead["temperatura"];

  return {
    id: lead.id,
    nome: lead.name || lead.phone || "Lead sem nome",
    telefone: lead.phone || "Sem telefone",
    curso: course?.name || "Curso não informado",
    origem: lead.source || "Origem não informada",
    vendedor: salesperson?.name || "Sem vendedor",
    etapa: mapStageName(stage),
    temperatura: temperature,
    ultimaInteracao: formatRelativeDate(lead.lastInteractionAt || lead.createdAt),
    proximaAcao: lead.nextAction || "Definir próxima ação",
    scoreMel: temperature === "quente" ? 82 : temperature === "morno" ? 61 : 38,
    riscoPerda:
      lead.status === "lost" || lead.status === "perdido" ? 90 : temperature === "quente" ? 22 : 48,
  };
}

export function mapAlert(alert: ApiAlert, salespeople: ApiSalesperson[]): Alerta {
  const salesperson = salespeople.find((item) => item.id === alert.salespersonId);
  return {
    id: alert.id,
    prioridade: normalizePriority(alert.priority) as Prioridade,
    tipo: alert.type || "alerta_operacional",
    titulo: alert.title || "Alerta operacional",
    descricao: alert.description || "A Mel encontrou um ponto de atenção na operação comercial.",
    recomendacao: alert.recommendation || "Revisar o caso e definir responsável.",
    responsavel: salesperson?.name || "Equipe",
    status: (alert.status || "aberto") as Alerta["status"],
    criadoEm: formatRelativeDate(alert.createdAt),
  };
}

export function mapTask(task: ApiTask, leads: Lead[], salespeople: ApiSalesperson[]): Tarefa {
  const lead = leads.find((item) => item.id === task.leadId);
  const salesperson = salespeople.find((item) => item.id === task.salespersonId);
  const origin = (task.origin || "manual").toLowerCase();

  return {
    id: task.id,
    titulo: task.title || "Tarefa sem título",
    leadRelacionado: lead?.nome,
    vendedor: salesperson?.name || "Equipe",
    prioridade: normalizePriority(task.priority) as Prioridade,
    prazo: formatDueDate(task.dueAt),
    origem: origin === "mel" ? "Mel" : origin === "lou" ? "Lou" : "Manual",
    status: normalizeTaskStatus(task.status),
  };
}

export function mapDashboard(dashboard: ApiDashboard, salespeople: ApiSalesperson[]) {
  const schoolName = dashboard.school?.name || "Kogna Escolas";
  const topSalespeople = dashboard.salesTeamSummary.map((seller) => {
    const original = salespeople.find((item) => item.id === seller.id);
    const name = seller.name || original?.name || "Vendedor";
    const leads = Number(seller.leads || 0);
    const pipelineValue = Number(seller.pipelineValue || 0);
    return {
      id: seller.id,
      nome: name,
      iniciais: initialsFromName(name),
      leadsAtendidos: leads,
      tempoMedioResposta: "—",
      followUpsFeitos: 0,
      matriculasConfirmadas: 0,
      faturamentoGerado: pipelineValue,
      scoreMel: Math.min(99, 45 + leads * 4),
      taxaConversao: leads ? Math.round((pipelineValue / Math.max(1, leads) / 100) * 10) / 10 : 0,
      status: "ativo" as const,
      conquistas: [],
    };
  });

  return {
    escola: {
      nome: schoolName,
      unidade: dashboard.school?.city || "Unidade principal",
      responsavel: "gestor",
      nivelOperacao:
        dashboard.setupProgress >= 80 ? "Operação monitorada" : "Configuração em andamento",
      scoreGovernanca: dashboard.setupProgress,
    },
    kpis: {
      leadsHoje: dashboard.today.leads,
      leadsSemResposta: dashboard.today.unansweredLeads,
      leadsQuentes: dashboard.today.hotLeads,
      followUpsAtrasados: dashboard.today.overdueFollowups,
      matriculasConfirmadas: dashboard.today.confirmedEnrollments,
      faturamentoMes: Number(dashboard.revenue.monthToDate || 0),
      projecaoMes: Number(dashboard.revenue.simpleProjection || 0),
      gapMeta: Number(dashboard.revenue.gap || 0),
      metaMes: Number(dashboard.revenue.goal || 0),
    },
    recommendedActions: dashboard.recommendedActions.map((action) => ({
      id: action.id,
      titulo: action.title || "Ação recomendada pela Mel",
      impacto: priorityImpact(action.priority),
      acao: action.description || action.action || "Executar ação comercial recomendada.",
    })),
    pipelineRisk: dashboard.pipelineSummary
      .filter((stage) => Number(stage.leads || 0) > 0)
      .slice(0, 4)
      .map((stage) => ({
        etapa: stage.name,
        leads: Number(stage.leads || 0),
        risco:
          Number(stage.leads || 0) > 8
            ? "critica"
            : Number(stage.leads || 0) > 4
              ? "alta"
              : "media",
      })),
    topSalespeople: topSalespeople.slice(0, 4),
  };
}

function normalizeTaskStatus(value?: string | null): Tarefa["status"] {
  const status = (value || "aberto").toLowerCase();
  if (status === "aberta") return "aberto";
  if (status === "concluida" || status === "concluído" || status === "completed")
    return "concluido";
  if (status === "em andamento") return "em_andamento";
  if (["aberto", "em_andamento", "concluido", "ignorado"].includes(status))
    return status as Tarefa["status"];
  return "aberto";
}

function priorityImpact(priority?: string) {
  const value = normalizePriority(priority);
  if (value === "critica") return "Crítico";
  if (value === "alta") return "Alto";
  if (value === "media") return "Médio";
  return "Baixo";
}
