import { env } from "@/config/env";
import {
  alertas,
  cursos,
  dashboardKPIs,
  escola,
  leads,
  recomendacoesMel,
  tarefas,
  vendedores,
} from "@/lib/mock-data";
import type {
  ApiAlert,
  ApiCourse,
  ApiDashboard,
  ApiErrorPayload,
  ApiLead,
  ApiPipelineStage,
  ApiSalesperson,
  ApiTask,
} from "@/types/api";
import { getStoredToken } from "./authStorage";

type ApiRequestOptions = Omit<RequestInit, "body"> & {
  body?: unknown;
  timeoutMs?: number;
};

export class ApiError extends Error {
  status: number;
  payload?: ApiErrorPayload;

  constructor(message: string, status: number, payload?: ApiErrorPayload) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.payload = payload;
  }
}

const LOVABLE_FRONTEND_ONLY = true;
const MOCK_SCHOOL_ID = "lovable-school";
const MOCK_ORGANIZATION_ID = "lovable-org";
const MOCK_PIPELINE_ID = "lovable-pipeline";
const MOCK_TOKEN =
  "eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJleHAiOjE4OTM0NTYwMDAsImlkIjoibG92YWJsZS11c2VyIiwiZW1haWwiOiJkZW1vQGtvZ25hLmNvIn0.";

const mockUser = {
  id: "lovable-user",
  email: "demo@kogna.co",
  name: "Gestor Lovable",
  role: "owner",
  organization_id: MOCK_ORGANIZATION_ID,
  koins_balance: 100,
  organization: {
    id: MOCK_ORGANIZATION_ID,
    name: escola.nome,
    plan_type: "demo",
    whatsapp_connections_limit: 3,
  },
};

const mockSchool = {
  id: MOCK_SCHOOL_ID,
  organizationId: MOCK_ORGANIZATION_ID,
  organization_id: MOCK_ORGANIZATION_ID,
  name: escola.nome,
  phone: "(62) 99999-0000",
  email: "demo@kogna.co",
  city: "Goiania",
  state: "GO",
  status: "active",
};

const mockCourses: ApiCourse[] = cursos.map((curso) => ({
  id: curso.id,
  name: curso.nome,
  category: curso.categoria,
  description: `${curso.turma} - ${curso.vagas} vagas`,
  duration: curso.duracao,
  modality: curso.modalidade,
  status: curso.status,
}));

const mockSalespeople: ApiSalesperson[] = vendedores.map((seller) => ({
  id: seller.id,
  name: seller.nome,
  email: `${seller.nome.toLowerCase().replace(/\s+/g, ".")}@kogna.co`,
  role: "salesperson",
  status: seller.status === "inativo" ? "inactive" : "active",
  monthlyRevenueGoal: seller.faturamentoGerado,
  monthlyEnrollmentGoal: seller.matriculasConfirmadas,
}));

const stageNames = Array.from(new Set(leads.map((lead) => lead.etapa)));
const mockStages: ApiPipelineStage[] = stageNames.map((name, index) => ({
  id: `stage-${index + 1}`,
  pipelineId: MOCK_PIPELINE_ID,
  name,
  orderIndex: index,
  closingProbability: Math.min(95, 10 + index * 6),
  color: null,
  isFinal: name === "Matricula confirmada" || name === "Perdido",
  countsAsWon: name === "Matricula confirmada",
  countsAsLost: name === "Perdido",
  status: "active",
}));

const mockLeads: ApiLead[] = leads.map((lead) => {
  const course = mockCourses.find((item) => item.name === lead.curso) || mockCourses[0];
  const salesperson =
    mockSalespeople.find((item) => item.name === lead.vendedor) || mockSalespeople[0];
  const stage = mockStages.find((item) => item.name === lead.etapa) || mockStages[0];

  return {
    id: lead.id,
    name: lead.nome,
    phone: lead.telefone,
    source: lead.origem,
    courseId: course?.id,
    salespersonId: salesperson?.id,
    pipelineId: MOCK_PIPELINE_ID,
    pipelineStageId: stage?.id,
    temperature: lead.temperatura,
    status: "active",
    notes: "",
    value: 0,
    nextAction: lead.proximaAcao,
    createdAt: new Date().toISOString(),
    lastInteractionAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
  };
});

const mockAlerts: ApiAlert[] = alertas.map((alert) => ({
  id: alert.id,
  salespersonId:
    mockSalespeople.find((item) => alert.responsavel.includes(item.name.split(" ")[0]))?.id ||
    null,
  type: alert.tipo,
  priority: alert.prioridade,
  title: alert.titulo,
  description: alert.descricao,
  recommendation: alert.recomendacao,
  status: alert.status,
  createdAt: new Date().toISOString(),
}));

const mockTasks: ApiTask[] = tarefas.map((task, index) => ({
  id: task.id,
  leadId: mockLeads.find((lead) => lead.name === task.leadRelacionado)?.id || null,
  salespersonId:
    mockSalespeople.find((seller) => seller.name === task.vendedor)?.id ||
    mockSalespeople[index % mockSalespeople.length]?.id,
  title: task.titulo,
  description: task.leadRelacionado || "",
  dueAt: new Date(Date.now() + (index + 1) * 60 * 60 * 1000).toISOString(),
  priority: task.prioridade,
  status: task.status,
  type: "followup",
  origin: task.origem,
  createdAt: new Date().toISOString(),
}));

function delay<T>(data: T, ms = 80) {
  return new Promise<T>((resolve) => {
    globalThis.setTimeout(() => resolve(structuredClone(data)), ms);
  });
}

function mockDashboard(): ApiDashboard {
  return {
    school: mockSchool,
    setupProgress: escola.scoreGovernanca,
    today: {
      leads: dashboardKPIs.leadsHoje,
      unansweredLeads: dashboardKPIs.leadsSemResposta,
      hotLeads: dashboardKPIs.leadsQuentes,
      overdueFollowups: dashboardKPIs.followUpsAtrasados,
      confirmedEnrollments: dashboardKPIs.matriculasConfirmadas,
    },
    revenue: {
      monthToDate: dashboardKPIs.faturamentoMes,
      simpleProjection: dashboardKPIs.projecaoMes,
      goal: dashboardKPIs.metaMes,
      gap: dashboardKPIs.gapMeta,
      futurePipelineProjection: dashboardKPIs.projecaoMes,
    },
    alerts: mockAlerts,
    recommendedActions: recomendacoesMel.map((item) => ({
      id: item.id,
      title: item.titulo,
      description: item.acao,
      priority:
        item.impacto === "Critico" || item.impacto === "Crítico"
          ? "critica"
          : item.impacto === "Alto"
            ? "alta"
            : "media",
      action: item.acao,
    })),
    pipelineSummary: mockStages.map((stage) => ({
      id: stage.id,
      name: stage.name,
      orderIndex: stage.orderIndex,
      color: stage.color,
      leads: mockLeads.filter((lead) => lead.pipelineStageId === stage.id).length,
      value: 0,
    })),
    salesTeamSummary: mockSalespeople.map((seller) => ({
      id: seller.id,
      name: seller.name,
      leads: mockLeads.filter((lead) => lead.salespersonId === seller.id).length,
      pipelineValue: seller.monthlyRevenueGoal || 0,
    })),
  };
}

async function mockApiRequest<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const normalizedPath = path.replace(/^https?:\/\/[^/]+\/api/i, "").replace(/\/+$/, "") || "/";

  if (normalizedPath === "/login") {
    const body = (options.body || {}) as { email?: string };
    const user = { ...mockUser, email: body.email || mockUser.email };
    return delay({ token: MOCK_TOKEN, role: user.role, user } as T);
  }

  if (normalizedPath === "/me") {
    return delay({ role: mockUser.role, user: mockUser } as T);
  }

  if (normalizedPath === "/schools") {
    return delay([mockSchool] as T);
  }

  if (normalizedPath === `/schools/${MOCK_SCHOOL_ID}`) {
    return delay(mockSchool as T);
  }

  if (normalizedPath === `/schools/${MOCK_SCHOOL_ID}/dashboard`) {
    return delay(mockDashboard() as T);
  }

  if (normalizedPath === `/schools/${MOCK_SCHOOL_ID}/salespeople`) {
    return delay(mockSalespeople as T);
  }

  if (normalizedPath === `/schools/${MOCK_SCHOOL_ID}/courses`) {
    return delay(mockCourses as T);
  }

  if (normalizedPath === `/schools/${MOCK_SCHOOL_ID}/pipeline-stages`) {
    return delay(mockStages as T);
  }

  if (normalizedPath === `/schools/${MOCK_SCHOOL_ID}/leads`) {
    return delay(mockLeads as T);
  }

  if (normalizedPath === `/schools/${MOCK_SCHOOL_ID}/alerts`) {
    return delay(mockAlerts as T);
  }

  if (normalizedPath.startsWith(`/schools/${MOCK_SCHOOL_ID}/alerts/`)) {
    const id = normalizedPath.split("/").pop();
    const status = (options.body as { status?: string } | undefined)?.status;
    const alert = mockAlerts.find((item) => item.id === id);
    if (alert && status) alert.status = status;
    return delay((alert || mockAlerts[0]) as T);
  }

  if (normalizedPath === `/schools/${MOCK_SCHOOL_ID}/tasks`) {
    return delay(mockTasks as T);
  }

  if (normalizedPath.startsWith(`/schools/${MOCK_SCHOOL_ID}/tasks/`)) {
    const id = normalizedPath.split("/").pop();
    const status = (options.body as { status?: string } | undefined)?.status;
    const task = mockTasks.find((item) => item.id === id);
    if (task && status) task.status = status;
    return delay((task || mockTasks[0]) as T);
  }

  if (normalizedPath.includes(`/leads/`) && normalizedPath.endsWith("/stage")) {
    const [, leadId] = normalizedPath.match(/\/leads\/([^/]+)\/stage$/) || [];
    const pipelineStageId = (options.body as { pipelineStageId?: string } | undefined)
      ?.pipelineStageId;
    const lead = mockLeads.find((item) => item.id === leadId);
    if (lead && pipelineStageId) lead.pipelineStageId = pipelineStageId;
    return delay((lead || { ok: true }) as T);
  }

  return delay({ ok: true } as T);
}

function buildUrl(path: string) {
  if (/^https?:\/\//i.test(path)) return path;
  return `${env.apiBaseUrl}${path.startsWith("/") ? path : `/${path}`}`;
}

async function parseResponse(response: Response) {
  const contentType = response.headers.get("content-type") || "";
  if (response.status === 204) return null;
  if (contentType.includes("application/json")) {
    const text = await response.text();
    return text ? JSON.parse(text) : null;
  }
  return response.text();
}

export async function apiRequest<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  if (LOVABLE_FRONTEND_ONLY) {
    return mockApiRequest<T>(path, options);
  }

  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), options.timeoutMs ?? 20000);
  const token = getStoredToken();

  try {
    const response = await fetch(buildUrl(path), {
      ...options,
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    });

    const payload = await parseResponse(response);

    if (!response.ok) {
      const errorPayload =
        typeof payload === "object" && payload !== null ? (payload as ApiErrorPayload) : undefined;
      const message =
        errorPayload?.error || errorPayload?.message || `Erro ${response.status} ao chamar a API`;

      if (response.status === 401 && typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("kogna:unauthorized"));
      }

      throw new ApiError(message, response.status, errorPayload);
    }

    return payload as T;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new ApiError("Tempo limite excedido ao chamar a API", 408);
    }

    throw error;
  } finally {
    globalThis.clearTimeout(timeout);
  }
}
