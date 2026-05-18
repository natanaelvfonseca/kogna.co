export interface School {
    id: string;
    organizationId?: string | null;
    name: string;
    document?: string | null;
    phone?: string | null;
    email?: string | null;
    city?: string | null;
    state?: string | null;
    status: string;
    whatsappSetupLater?: boolean;
}

export interface OnboardingChecklistItem {
    key: string;
    label: string;
    done: boolean;
}

export interface OnboardingStatus {
    progress: number;
    completed: boolean;
    checklist: OnboardingChecklistItem[];
}

export interface Course {
    id: string;
    schoolId: string;
    name: string;
    category?: string | null;
    description?: string | null;
    duration?: string | null;
    modality?: string | null;
    status: string;
}

export interface CourseOffer {
    id: string;
    schoolId: string;
    courseId: string;
    name: string;
    price: number;
    enrollmentFee?: number | null;
    monthlyFee?: number | null;
    maxDiscountPercent?: number | null;
    paymentTerms?: string | null;
    status: string;
}

export interface PaymentData {
    id: string;
    schoolId: string;
    pixKey?: string | null;
    bank?: string | null;
    agency?: string | null;
    account?: string | null;
    holderName?: string | null;
    holderDocument?: string | null;
    paymentLinks?: string[] | null;
    commercialNotes?: string | null;
    status: string;
}

export interface Salesperson {
    id: string;
    schoolId: string;
    userId?: string | null;
    name: string;
    whatsapp?: string | null;
    email?: string | null;
    role?: string | null;
    status: string;
    monthlyRevenueGoal?: number | null;
    monthlyEnrollmentGoal?: number | null;
}

export interface Pipeline {
    id: string;
    schoolId: string;
    name: string;
    status: string;
    isDefault: boolean;
}

export interface PipelineStage {
    id: string;
    schoolId: string;
    pipelineId: string;
    name: string;
    orderIndex: number;
    closingProbability: number;
    color?: string | null;
    isFinal: boolean;
    countsAsWon: boolean;
    countsAsLost: boolean;
    status: string;
}

export interface SchoolLead {
    id: string;
    schoolId: string;
    name: string;
    phone?: string | null;
    email?: string | null;
    source?: string | null;
    courseId?: string | null;
    salespersonId?: string | null;
    pipelineId?: string | null;
    pipelineStageId?: string | null;
    temperature?: string | null;
    status?: string | null;
    value?: number | null;
    nextAction?: string | null;
    lastInteractionAt?: string | null;
    createdAt?: string;
}

export interface Conversation {
    id: string;
    schoolId: string;
    leadId?: string | null;
    salespersonId?: string | null;
    origin: string;
    status: string;
    lastMessage?: string | null;
    lastMessageAt?: string | null;
}

export interface SchoolTask {
    id: string;
    schoolId: string;
    leadId?: string | null;
    salespersonId?: string | null;
    title: string;
    description?: string | null;
    dueAt: string;
    priority: string;
    status: string;
    type: string;
    origin: string;
}

export interface SchoolAlert {
    id: string;
    schoolId: string;
    leadId?: string | null;
    salespersonId?: string | null;
    type: string;
    priority: string;
    title: string;
    description?: string | null;
    recommendation?: string | null;
    status: string;
}

export interface SchoolGoal {
    id: string;
    schoolId: string;
    salespersonId?: string | null;
    courseId?: string | null;
    month: string;
    revenueGoal: number;
    enrollmentGoal: number;
    averageTicket?: number | null;
    expectedConversionRate?: number | null;
    marketingInvestment?: number | null;
    status: string;
}

export interface SchoolDashboard {
    school: School;
    setupProgress: number;
    onboarding: OnboardingStatus;
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
    alerts: SchoolAlert[];
    recommendedActions: Array<{ id: string; title: string; description?: string; priority?: string }>;
    pipelineSummary: Array<{ id: string; name: string; orderIndex: number; color?: string | null; leads: number; value: number }>;
    salesTeamSummary: Array<{ id: string; name: string; leads: number; pipelineValue: number }>;
}

type Payload = Record<string, unknown>;

async function request<T>(token: string, path: string, options: RequestInit = {}): Promise<T> {
    const response = await fetch(path, {
        ...options,
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
            ...(options.headers || {}),
        },
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) {
        throw new Error(data?.error || "Nao foi possivel concluir a operacao.");
    }
    return data as T;
}

export const schoolsApi = {
    listSchools: (token: string) => request<School[]>(token, "/api/schools"),
    getSchool: (token: string, schoolId: string) => request<School>(token, `/api/schools/${schoolId}`),
    updateSchool: (token: string, schoolId: string, payload: Payload) => request<School>(token, `/api/schools/${schoolId}`, {
        method: "PUT",
        body: JSON.stringify(payload),
    }),
    getDashboard: (token: string, schoolId: string) => request<SchoolDashboard>(token, `/api/schools/${schoolId}/dashboard`),
    getOnboarding: (token: string, schoolId: string) => request<OnboardingStatus>(token, `/api/schools/${schoolId}/onboarding`),
    updateOnboarding: (token: string, schoolId: string, payload: Payload) => request<{ onboarding: OnboardingStatus }>(token, `/api/schools/${schoolId}/onboarding`, {
        method: "PATCH",
        body: JSON.stringify(payload),
    }),
    list: <T>(token: string, schoolId: string, resource: string) => request<T[]>(token, `/api/schools/${schoolId}/${resource}`),
    create: <T>(token: string, schoolId: string, resource: string, payload: Payload) => request<T>(token, `/api/schools/${schoolId}/${resource}`, {
        method: "POST",
        body: JSON.stringify(payload),
    }),
    update: <T>(token: string, schoolId: string, resource: string, id: string, payload: Payload) => request<T>(token, `/api/schools/${schoolId}/${resource}/${id}`, {
        method: "PUT",
        body: JSON.stringify(payload),
    }),
    moveLead: (token: string, schoolId: string, leadId: string, pipelineStageId: string) => request<SchoolLead>(token, `/api/schools/${schoolId}/leads/${leadId}/stage`, {
        method: "PATCH",
        body: JSON.stringify({ pipelineStageId }),
    }),
};
