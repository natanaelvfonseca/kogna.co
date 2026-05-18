import type { ApiSchool } from "@/types/api";
import { apiRequest } from "./client";

export const schoolsApi = {
  list() {
    return apiRequest<ApiSchool[]>("/schools");
  },

  get(schoolId: string) {
    return apiRequest<ApiSchool>(`/schools/${schoolId}`);
  },
};
