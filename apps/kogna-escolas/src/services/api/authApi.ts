import type { LoginResponse, MeResponse } from "@/types/api";
import { apiRequest } from "./client";

export const authApi = {
  login(email: string, password: string) {
    return apiRequest<LoginResponse>("/login", {
      method: "POST",
      body: { email, password },
    });
  },

  me() {
    return apiRequest<MeResponse>("/me");
  },
};
