import type { ApiPipelineStage } from "@/types/api";
import { apiRequest } from "./client";

export const pipelineApi = {
  getStages(schoolId: string) {
    return apiRequest<ApiPipelineStage[]>(`/schools/${schoolId}/pipeline-stages`);
  },

  moveLead(schoolId: string, leadId: string, pipelineStageId: string) {
    return apiRequest(`/schools/${schoolId}/leads/${leadId}/stage`, {
      method: "PATCH",
      body: { pipelineStageId },
    });
  },
};
