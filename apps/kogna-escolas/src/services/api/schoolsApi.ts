import type { ApiSchool } from "@/types/api";
import { apiRequest } from "./client";

export const schoolsApi = {
  list() {
    return apiRequest<ApiSchool[]>("/schools", { timeoutMs: 8000 });
  },

  get(schoolId: string) {
    return apiRequest<ApiSchool>(`/schools/${schoolId}`, { timeoutMs: 8000 });
  },
};
