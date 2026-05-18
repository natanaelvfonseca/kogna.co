import type { ApiDashboard } from "@/types/api";
import { apiRequest } from "./client";

export const dashboardApi = {
  getDashboard(schoolId: string) {
    return apiRequest<ApiDashboard>(`/schools/${schoolId}/dashboard`);
  },
};
