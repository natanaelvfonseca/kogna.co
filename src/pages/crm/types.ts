export type LeadStatus = string;

export interface Lead {
    id: string;
    name: string;
    phone?: string;
    email?: string;
    company?: string; // Keep for backward compatibility or if needed elsewhere
    value: number;
    status: LeadStatus;
    lastContact: string;
    avatar?: string;
    tags?: string[];
    source?: string;
    score?: number;
    temperature?: string;
}

export interface KanbanColumn {
    id: LeadStatus;
    title: string;
    leads: Lead[];
}
