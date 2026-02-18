import { Lightbulb, User } from 'lucide-react';
import { useTheme } from '../theme/ThemeProvider';
import { NotificationDropdown } from '../notification/NotificationDropdown';
import { useAuth } from '../../context/AuthContext';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

export function Topbar() {
    const { theme, toggleTheme } = useTheme();
    const { token } = useAuth();
    const [koins, setKoins] = useState<number | null>(null);
    const navigate = useNavigate();

    useEffect(() => {
        if (!token) return;

        const fetchCredits = async () => {
            try {
                const apiBase = 'http://127.0.0.1:3000'; // Hardcoded as per AuthContext
                const res = await fetch(`${apiBase}/api/credits`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (res.ok) {
                    const data = await res.json();
                    setKoins(data.koins_balance);
                }
            } catch (error) {
                console.error('Failed to fetch credits', error);
            }
        };

        fetchCredits();

        // Polling every 30s to keep it somewhat fresh
        const interval = setInterval(fetchCredits, 30000);
        return () => clearInterval(interval);
    }, [token]);

    return (
        <header className="h-16 bg-background/80 backdrop-blur-md border-b border-border sticky top-0 z-40 px-6 flex items-center justify-between transition-colors duration-300">
            <div className="flex items-center gap-4 flex-1">
                {/* Search removed as requested */}
            </div>

            <div className="flex items-center gap-4">
                {/* Koins Display */}
                <div className="flex items-center gap-2 px-3 py-1.5 bg-yellow-500/10 border border-yellow-500/20 rounded-full">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <circle cx="12" cy="12" r="10" className="fill-yellow-500 text-yellow-600 dark:text-yellow-400" stroke="currentColor" strokeWidth="1.5" />
                        <text x="12" y="16.5" textAnchor="middle" fill="currentColor" fontSize="16" fontWeight="bold" className="text-orange-600">K</text>
                    </svg>
                    <span className="text-sm font-semibold text-yellow-600 dark:text-yellow-400">
                        {koins !== null ? `${koins} Koins` : '...'}
                    </span>
                </div>

                <div className="w-px h-6 bg-border mx-1"></div>

                <button
                    onClick={toggleTheme}
                    className="p-2 transition-all duration-300 hover:scale-105"
                    title={theme === 'dark' ? 'Mudar para Modo Claro' : 'Mudar para Modo Escuro'}
                >
                    <Lightbulb
                        size={22}
                        className={`transition-all duration-300 ${theme === 'dark'
                            ? 'text-primary fill-transparent'
                            : 'text-yellow-500 fill-yellow-500 drop-shadow-[0_0_8px_rgba(234,179,8,0.5)]'
                            }`}
                        strokeWidth={2}
                    />
                </button>
                <div className="w-px h-6 bg-border mx-1"></div>

                <NotificationDropdown />

                <div className="w-px h-6 bg-border mx-1"></div>
                <button
                    onClick={() => navigate('/settings?tab=profile')}
                    className="flex items-center justify-center w-8 h-8 rounded-full bg-gradient-to-r from-primary to-primary-light text-white border border-white/10 hover:scale-110 hover:shadow-lg transition-all active:scale-95"
                    title="Meu Perfil"
                >
                    <User size={18} />
                </button>
            </div>
        </header>
    );
}
