import type { ApiCourse } from "@/types/api";
import { apiRequest } from "./client";

export const coursesApi = {
  getCourses(schoolId: string) {
    return apiRequest<ApiCourse[]>(`/schools/${schoolId}/courses`);
  },
};
