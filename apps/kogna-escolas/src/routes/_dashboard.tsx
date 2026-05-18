import { Outlet, createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2, MessageCircle, X } from "lucide-react";
import { Sidebar } from "@/components/layout/Sidebar";
import { Topbar } from "@/components/layout/Topbar";
import { useAuth } from "@/contexts/AuthContext";

export const Route = createFileRoute("/_dashboard")({ component: DashboardLayout });

function DashboardLayout() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const { status, isAuthenticated } = useAuth();

  useEffect(() => {
    if (status === "unauthenticated") {
      void navigate({ to: "/" });
    }
  }, [navigate, status]);

  if (status === "loading") {
    return (
      <div className="min-h-screen bg-sidebar text-sidebar-foreground grid place-items-center">
        <div className="flex items-center gap-3 text-sm text-sidebar-muted">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
          Validando seu acesso à Kogna Escolas...
        </div>
      </div>
    );
  }

  if (!isAuthenticated) return null;

  return (
    <div className="min-h-screen bg-background flex w-full">
      <div className="hidden lg:block sticky top-0 h-screen">
        <Sidebar />
      </div>

      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-72 shadow-elevated">
            <Sidebar onNavigate={() => setOpen(false)} />
            <button
              onClick={() => setOpen(false)}
              className="absolute top-3 right-3 p-2 rounded-md bg-white/10 text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      <div className="flex-1 min-w-0 flex flex-col">
        <Topbar onOpenSidebar={() => setOpen(true)} />
        <main className="flex-1 p-4 md:p-6 lg:p-8 max-w-[1600px] w-full mx-auto">
          <Outlet />
        </main>
      </div>

      <Link
        to="/chat"
        className="md:hidden fixed bottom-5 right-5 z-30 inline-flex items-center gap-2 rounded-full bg-gradient-mel px-4 py-3 text-white shadow-mel"
      >
        <MessageCircle className="h-5 w-5" />
        <span className="text-sm font-semibold">Mel</span>
      </Link>
    </div>
  );
}
