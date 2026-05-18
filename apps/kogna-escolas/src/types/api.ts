export type ApiRole = "admin" | "owner" | "manager" | "salesperson" | "marketing" | "user" | string;

export type ApiOrganization = {
  id: string;
  name: string;
  plan_type?: string | null;
  whatsapp_connections_limit?: number | null;
};

export type ApiUser = {
  id: string;
  email: string;
  name?: string | null;
  role: ApiRole;
  organization_id?: string | null;
  koins_balance?: number | null;
  organization?: ApiOrganization | null;
};

export type LoginResponse = {
  token: string;
  role: ApiRole;
  user: ApiUser;
};

export type MeResponse = {
  role: ApiRole;
  user: ApiUser;
};

export type ApiSchool = {
  id: string;
  organizationId?: string | null;
  organization_id?: string | null;
  name: string;
  document?: string | null;
  phone?: string | null;
  email?: string | null;
  city?: string | null;
  state?: string | null;
  status?: string | null;
  createdAt?: string;
  created_at?: string;
  updatedAt?: string;
  updated_at?: string;
};

export type ApiDashboard = {
  school: ApiSchool;
  setupProgress: number;
  today: {
    leads: number;
    unansweredLeads: number;
    hotLeads: number;
    overdueFollowups: number;
    confirmedEnrollments: number;
  };
  revenue: {
    monthToDate: number;
    simpleProjection: number;
    goal: number;
    gap: number;
    futurePipelineProjection?: number | null;
  };
  alerts: ApiAlert[];
  recommendedActions: Array<{
    id: string;
    title?: string;
    description?: string;
    priority?: string;
    action?: string;
  }>;
  pipelineSummary: Array<{
    id: string;
    name: string;
    orderIndex?: number;
    color?: string | null;
    leads?: number;
    value?: number | string;
  }>;
  salesTeamSummary: Array<{
    id: string;
    name: string;
    leads?: number;
    pipelineValue?: number | string;
  }>;
};

export type ApiCourse = {
  id: string;
  name: string;
  category?: string | null;
  description?: string | null;
  duration?: string | null;
  modality?: string | null;
  status?: string | null;
};

export type ApiSalesperson = {
  id: string;
  userId?: string | null;
  name: string;
  whatsapp?: string | null;
  email?: string | null;
  role?: string | null;
  status?: string | null;
  monthlyRevenueGoal?: number | string | null;
  monthlyEnrollmentGoal?: number | string | null;
};

export type ApiPipelineStage = {
  id: string;
  pipelineId: string;
  name: string;
  orderIndex?: number;
  closingProbability?: number;
  color?: string | null;
  isFinal?: boolean;
  countsAsWon?: boolean;
  countsAsLost?: boolean;
  status?: string | null;
};

export type ApiLead = {
  id: string;
  name?: string | null;
  phone?: string | null;
  email?: string | null;
  source?: string | null;
  courseId?: string | null;
  salespersonId?: string | null;
  pipelineId?: string | null;
  pipelineStageId?: string | null;
  temperature?: string | null;
  status?: string | null;
  notes?: string | null;
  value?: number | string | null;
  nextAction?: string | null;
  lastInteractionAt?: string | null;
  createdAt?: string | null;
};

export type ApiAlert = {
  id: string;
  leadId?: string | null;
  salespersonId?: string | null;
  type?: string | null;
  priority?: string | null;
  title?: string | null;
  description?: string | null;
  recommendation?: string | null;
  status?: string | null;
  createdAt?: string | null;
};

export type ApiTask = {
  id: string;
  leadId?: string | null;
  salespersonId?: string | null;
  title?: string | null;
  description?: string | null;
  dueAt?: string | null;
  priority?: string | null;
  status?: string | null;
  type?: string | null;
  origin?: string | null;
  createdAt?: string | null;
};

export type ApiErrorPayload = {
  error?: string;
  message?: string;
  details?: unknown;
};
