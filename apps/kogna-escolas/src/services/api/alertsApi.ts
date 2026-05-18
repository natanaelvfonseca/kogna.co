import type { ApiAlert } from "@/types/api";
import { apiRequest } from "./client";

export const alertsApi = {
  getAlerts(schoolId: string) {
    return apiRequest<ApiAlert[]>(`/schools/${schoolId}/alerts`);
  },

  updateAlert(schoolId: string, alert: ApiAlert, status: string) {
    return apiRequest<ApiAlert>(`/schools/${schoolId}/alerts/${alert.id}`, {
      method: "PUT",
      body: {
        type: alert.type,
        priority: alert.priority,
        title: alert.title,
        description: alert.description,
        recommendation: alert.recommendation,
        leadId: alert.leadId,
        salespersonId: alert.salespersonId,
        status,
      },
    });
  },
};
