import type { ApiTask } from "@/types/api";
import { apiRequest } from "./client";

export const tasksApi = {
  getTasks(schoolId: string) {
    return apiRequest<ApiTask[]>(`/schools/${schoolId}/tasks`);
  },

  updateTask(schoolId: string, task: ApiTask, status: string) {
    return apiRequest<ApiTask>(`/schools/${schoolId}/tasks/${task.id}`, {
      method: "PUT",
      body: {
        leadId: task.leadId,
        salespersonId: task.salespersonId,
        title: task.title,
        description: task.description,
        dueAt: task.dueAt,
        priority: task.priority,
        status,
        type: task.type,
        origin: task.origin,
      },
    });
  },
};
