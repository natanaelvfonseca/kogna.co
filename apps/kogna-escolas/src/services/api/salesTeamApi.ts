import type { ApiSalesperson } from "@/types/api";
import { apiRequest } from "./client";

export const salesTeamApi = {
  getSalespeople(schoolId: string) {
    return apiRequest<ApiSalesperson[]>(`/schools/${schoolId}/salespeople`);
  },
};
