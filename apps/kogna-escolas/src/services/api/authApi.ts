import type { LoginResponse, MeResponse } from "@/types/api";
import { apiRequest } from "./client";

export const authApi = {
  login(email: string, password: string) {
    return apiRequest<LoginResponse>("/login", {
      method: "POST",
      body: { email, password },
      timeoutMs: 12000,
    });
  },

  me() {
    return apiRequest<MeResponse>("/me", { timeoutMs: 8000 });
  },
};
