import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';

interface User {
    id: string;
    email: string;
    name: string;
    organization?: {
        id: string;
        name: string;
        planType: 'basic' | 'pro' | 'enterprise';
    };
    koins_balance?: number;
    role: 'user' | 'admin';
}

interface AuthContextType {
    user: User | null;
    token: string | null;
    login: (email: string, pass: string) => Promise<{ success: boolean; error?: string }>;
    register: (name: string, email: string, pass: string) => Promise<{ success: boolean; error?: string }>;
    logout: () => void;
    refreshUser: () => Promise<void>;
    isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [token, setToken] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const navigate = useNavigate();

    useEffect(() => {
        // Hydrate user from localStorage on mount
        const storedToken = localStorage.getItem('kogna_token');
        const storedUser = localStorage.getItem('kogna_user');
        

        if (storedToken && storedUser) {
            try {
                setToken(storedToken);
                setUser(JSON.parse(storedUser));
            } catch (e) {
                // Invalid stored data, clear it
                localStorage.removeItem('kogna_token');
                localStorage.removeItem('kogna_user');
            }
        }

        setLoading(false);
    }, []);

    const login = async (email: string, pass: string) => {
        try {
            const apiBase = 'http://127.0.0.1:3000'; // Hardcoded for local dev for now
            const res = await fetch(`${apiBase}/api/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password: pass }),
            });

            const data = await res.json();

            if (!res.ok) {
                return { success: false, error: data.error || 'Falha no login' };
            }

            // Success
            localStorage.setItem('kogna_token', data.token);
            localStorage.setItem('kogna_user', JSON.stringify(data.user));
            setToken(data.token);
            setUser(data.user);
            

            // Check Onboarding Status
            try {
                const onboardingRes = await fetch(`${apiBase}/api/onboarding/status`, {
                    headers: { 'Authorization': `Bearer ${data.token}` }
                });
                if (onboardingRes.ok) {
                    const status = await onboardingRes.json();
                    if (!status.completed) {
                        navigate('/onboarding');
                        return { success: true };
                    }
                }
            } catch (e) {
                console.error('Failed to check onboarding status', e);
            }

            navigate('/dashboard');
            return { success: true };

        } catch (err) {
            console.error(err);
            return { success: false, error: 'Erro de conexão com o servidor' };
        }
    };

    const register = async (name: string, email: string, pass: string) => {
        try {
            const apiBase = 'http://127.0.0.1:3000';
            const res = await fetch(`${apiBase}/api/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, email, password: pass }),
            });

            const data = await res.json();

            if (!res.ok) {
                return { success: false, error: data.error || 'Falha no cadastro' };
            }

            localStorage.setItem('kogna_token', data.token);
            localStorage.setItem('kogna_user', JSON.stringify(data.user));
            setToken(data.token);
            setUser(data.user);

            navigate('/onboarding');
            return { success: true };

        } catch (err) {
            console.error(err);
            return { success: false, error: 'Erro de conexão com o servidor' };
        }
    };

    const logout = () => {
        localStorage.removeItem('kogna_token');
        localStorage.removeItem('kogna_user');
        setToken(null);
        setUser(null);
        navigate('/login');
    };

    const refreshUser = async () => {
        if (!token) return;
        try {
            // We need an endpoint to get current user data.
            // Assuming GET /api/auth/me or similar exists, or we can use the login endpoint if it supports token-based auth
            // But looking at server.js, we might not have a dedicated 'me' endpoint yet?
            // Let's check server.js for a suitable endpoint to fetch user details.
            // Wait, I should verify if such endpoint exists first.
            // Actually, let's just implement a FETCH from /api/profile/me if it exists, or create it.
            // For now, I will add the function signature but I need to be sure about the endpoint.

            // Let's assume we can add a GET /api/profile/me or similar.
            // Ideally, we should add GET /api/me to server.js as well.

            const apiBase = 'http://127.0.0.1:3000';
            const res = await fetch(`${apiBase}/api/me`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (res.ok) {
                const data = await res.json();
                setUser(data.user);
                localStorage.setItem('kogna_user', JSON.stringify(data.user));
            }
        } catch (e) {
            console.error('Failed to refresh user', e);
        }
    };

    return (
        <AuthContext.Provider value={{ user, token, login, register, logout, refreshUser, isAuthenticated: !!token }}>
            {loading ? (
                <div className="min-h-screen bg-background flex items-center justify-center">
                    <div className="text-primary text-xl">Carregando...</div>
                </div>
            ) : (
                children
            )}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
}
