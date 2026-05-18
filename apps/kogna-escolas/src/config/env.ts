type AppEnv = {
  apiBaseUrl: string;
  appName: string;
  appEnv: string;
};

function normalizeBaseUrl(value: string | undefined) {
  const fallback = "http://localhost:8080/api";
  return (value || fallback).replace(/\/+$/, "");
}

export const env: AppEnv = {
  apiBaseUrl: normalizeBaseUrl(import.meta.env.VITE_API_BASE_URL),
  appName: import.meta.env.VITE_APP_NAME || "Kogna Escolas",
  appEnv: import.meta.env.VITE_APP_ENV || import.meta.env.MODE || "development",
};
