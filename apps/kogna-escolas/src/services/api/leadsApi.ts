import type { ApiLead } from "@/types/api";
import { apiRequest } from "./client";

export const leadsApi = {
  getLeads(schoolId: string) {
    return apiRequest<ApiLead[]>(`/schools/${schoolId}/leads`);
  },
};
