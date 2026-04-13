export interface SellerConnection {
    id: string;
    sellerId: string;
    connectionId: string;
    isPrimary: boolean;
    createdAt: string;
    instanceId: string;
    instanceName: string | null;
    connectionStatus: string;
    connectedAgentId: string | null;
    connectedAgentName: string | null;
}

export interface SellerRisk {
    level: 'healthy' | 'attention' | 'high';
    color: 'green' | 'amber' | 'red';
    label: string;
}

export interface SellerQuality {
    strengths: string[];
    criticalPoints: string[];
}

export interface SellerMetrics {
    leadsReceived: number;
    leadsResponded: number;
    unansweredLeads: number;
    activeConversations: number;
    avgResponseTimeMinutes: number;
    avgResponseTimeLabel: string;
    responseRate: number;
    conversionRate: number;
    pendingFollowups: number;
    lostLeads: number;
    wonLeads: number;
    responseTimeSamples: number;
}

export interface SellerSummary {
    id: string;
    organizationId: string;
    name: string;
    email: string | null;
    phoneNumber: string | null;
    avatarUrl: string | null;
    role: string | null;
    notes: string | null;
    status: 'online' | 'offline' | 'inactive';
    active: boolean;
    createdAt: string;
    updatedAt: string;
    primaryConnectionId: string | null;
    primaryConnection: SellerConnection | null;
    connections: SellerConnection[];
    metrics: SellerMetrics;
    risk: SellerRisk;
    qualityScore: number;
    quality: SellerQuality;
    activeConversations: number;
    hasAiConnected: boolean;
    mainConnectionStatus: string;
    leadsCount: number;
}

export interface SellerFunnelStage {
    stage: string;
    count: number;
}

export interface SellerBottleneck {
    id: string;
    label: string;
    count: number;
    action: string;
}

export interface SellerInsight {
    id: string;
    severity: 'info' | 'warning' | 'critical';
    title: string;
    description: string;
    related_metric: string;
    suggested_action: string;
}

export interface SellerExecutiveSummary {
    level: 'good' | 'attention' | 'risk';
    label: string;
    description: string;
}

export interface SellerConversation {
    leadId: string;
    leadName: string;
    leadStatus: string;
    temperature: string;
    phone: string | null;
    remoteJid: string;
    instanceName: string | null;
    connectionId: string | null;
    lastMessage: string;
    lastMessageRole: string;
    lastMessageAt: string;
    waitingForReply: boolean;
    waitingMinutes: number;
    lastCustomerMessageAt: string | null;
}

export interface SellerLeadRow {
    id: string;
    name: string;
    phone: string | null;
    stage: string;
    temperature: string;
    lastInteractionAt: string | null;
    waitingForReply: boolean;
    timeWithoutResponseMinutes: number;
    status: 'won' | 'lost' | 'waiting' | 'active';
    value: number;
}

export interface SellerDetailResponse {
    seller: SellerSummary;
    metrics: SellerMetrics & {
        qualityScore: number;
        quality: SellerQuality;
    };
    funnel: SellerFunnelStage[];
    conversations: SellerConversation[];
    leads: SellerLeadRow[];
    bottlenecks: SellerBottleneck[];
    insights: SellerInsight[];
    executiveSummary: SellerExecutiveSummary;
    period: {
        range: string;
        start: string;
        end: string;
    };
}

export interface SellersListResponse {
    items: SellerSummary[];
    period: {
        range: string;
        start: string;
        end: string;
    };
}

export interface WhatsAppInstance {
    id: string;
    instance_name: string;
    status: string;
    created_at: string;
    connected_agent_id?: string | null;
    connected_agent_name?: string | null;
    connected_seller_id?: string | null;
    connected_seller_name?: string | null;
    seller_is_primary?: boolean;
}
