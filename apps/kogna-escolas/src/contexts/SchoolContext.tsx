import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { schoolsApi } from "@/services/api/schoolsApi";
import type { ApiSchool } from "@/types/api";
import { useAuth } from "./AuthContext";

const SCHOOL_KEY = "kogna_current_school_id";

type SchoolContextValue = {
  status: "idle" | "loading" | "ready" | "empty" | "error";
  schools: ApiSchool[];
  currentSchool: ApiSchool | null;
  currentSchoolId: string | null;
  error: string | null;
  setCurrentSchoolId: (schoolId: string) => void;
  refreshSchools: () => Promise<void>;
};

const SchoolContext = createContext<SchoolContextValue | null>(null);

function getStoredSchoolId() {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(SCHOOL_KEY);
}

function setStoredSchoolId(schoolId: string) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(SCHOOL_KEY, schoolId);
}

function clearStoredSchoolId() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(SCHOOL_KEY);
}

export function SchoolProvider({ children }: { children: React.ReactNode }) {
  const { status: authStatus, user } = useAuth();
  const [schools, setSchools] = useState<ApiSchool[]>([]);
  const [currentSchoolId, setCurrentSchoolIdState] = useState<string | null>(() =>
    getStoredSchoolId(),
  );
  const [status, setStatus] = useState<SchoolContextValue["status"]>("idle");
  const [error, setError] = useState<string | null>(null);

  const setCurrentSchoolId = useCallback((schoolId: string) => {
    setCurrentSchoolIdState(schoolId);
    setStoredSchoolId(schoolId);
  }, []);

  const refreshSchools = useCallback(async () => {
    if (authStatus !== "authenticated") return;

    setStatus("loading");
    setError(null);

    try {
      const response = await schoolsApi.list();
      setSchools(response);

      if (!response.length) {
        clearStoredSchoolId();
        setCurrentSchoolIdState(null);
        setStatus("empty");
        return;
      }

      const storedId = getStoredSchoolId();
      const orgSchool = response.find((school) => {
        const organizationId = school.organizationId || school.organization_id;
        return organizationId && organizationId === user?.organization_id;
      });
      const selected =
        response.find((school) => school.id === storedId) || orgSchool || response[0];

      setCurrentSchoolId(selected.id);
      setStatus("ready");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível carregar as escolas.");
      setStatus("error");
    }
  }, [authStatus, setCurrentSchoolId, user?.organization_id]);

  useEffect(() => {
    if (authStatus === "authenticated") {
      void refreshSchools();
      return;
    }

    if (authStatus === "unauthenticated") {
      clearStoredSchoolId();
      setSchools([]);
      setCurrentSchoolIdState(null);
      setStatus("idle");
    }
  }, [authStatus, refreshSchools]);

  const currentSchool = useMemo(
    () => schools.find((school) => school.id === currentSchoolId) || null,
    [currentSchoolId, schools],
  );

  const value = useMemo<SchoolContextValue>(
    () => ({
      status,
      schools,
      currentSchool,
      currentSchoolId,
      error,
      setCurrentSchoolId,
      refreshSchools,
    }),
    [currentSchool, currentSchoolId, error, refreshSchools, schools, setCurrentSchoolId, status],
  );

  return <SchoolContext.Provider value={value}>{children}</SchoolContext.Provider>;
}

export function useSchool() {
  const context = useContext(SchoolContext);
  if (!context) throw new Error("useSchool deve ser usado dentro de SchoolProvider");
  return context;
}
