import { useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';

export function AppShell() {
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
    const location = useLocation();
    const isFullScreenPage = location.pathname.includes('/live-chat') || location.pathname.includes('/kanban'); // Future proofing

    return (
        <div className="flex h-screen bg-background overflow-hidden relative">
            <Sidebar collapsed={sidebarCollapsed} setCollapsed={setSidebarCollapsed} />
            <div
                className={`flex-1 flex flex-col min-w-0 transition-all duration-300 ${sidebarCollapsed ? 'ml-20' : 'ml-72'
                    }`}
            >
                <Topbar />
                {/* 
                  If it's a full screen page (like Chat), use overflow-hidden and no padding.
                  Otherwise use standard dashboard layout (scrollable, padded).
                */}
                <main className={`flex-1 ${isFullScreenPage ? 'overflow-hidden p-0' : 'overflow-y-auto p-6 scrollbar-hide'}`}>
                    <div className={`w-full h-full ${isFullScreenPage ? '' : 'max-w-7xl mx-auto'}`}>
                        <Outlet />
                    </div>
                </main>
            </div>

            {/* Background Glow Effect */}
            <div className="absolute inset-0 pointer-events-none z-0">
                <div className="absolute top-[-10%] right-[-5%] w-[500px] h-[500px] bg-primary/5 rounded-full blur-3xl opacity-50"></div>
                <div className="absolute bottom-[-10%] left-[-5%] w-[500px] h-[500px] bg-blue-500/5 rounded-full blur-3xl opacity-30"></div>
            </div>
        </div>
    );
}
