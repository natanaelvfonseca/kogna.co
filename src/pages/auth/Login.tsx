import { ArrowRight, Mail, Lock, Loader2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useState } from 'react';

export function Login() {
    const { login } = useAuth();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        const result = await login(email, password);

        if (!result.success) {
            setError(result.error || 'Erro ao fazer login');
            setLoading(false);
        }
        // Success navigates automatically in context
    };

    return (
        <div className="min-h-screen bg-background flex items-center justify-center p-4 relative overflow-hidden">
            {/* Background Decor */}
            <div className="absolute top-[-10%] left-[-10%] w-[600px] h-[600px] bg-primary/5 rounded-full blur-[100px] opacity-40"></div>
            <div className="absolute bottom-[-10%] right-[-10%] w-[600px] h-[600px] bg-blue-500/5 rounded-full blur-[100px] opacity-30"></div>

            <div className="w-full max-w-md relative z-10">
                <div className="text-center mb-8">
                    <div className="inline-flex items-center gap-2 mb-4">
                        <div className="w-10 h-10 bg-gradient-to-br from-primary via-primary-light to-primary-dark rounded-tr-xl rounded-bl-xl flex items-center justify-center shadow-glow-primary">
                            <span className="text-white font-bold text-xl">K</span>
                        </div>
                        <span className="font-display font-bold text-3xl tracking-tight text-text-primary">Kogna<span className="text-primary">.</span></span>
                    </div>
                    <h2 className="text-xl text-text-secondary">Acesse sua plataforma de vendas</h2>
                </div>

                <div className="bg-surface border border-border p-8 rounded-2xl shadow-xl backdrop-blur-sm">
                    <form className="space-y-6" onSubmit={handleSubmit}>
                        {error && (
                            <div className="bg-red-500/10 border border-red-500/50 text-red-500 text-sm p-3 rounded-lg">
                                {error}
                            </div>
                        )}
                        <div>
                            <label className="block text-sm font-medium text-text-secondary mb-2">E-mail</label>
                            <div className="relative group">
                                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted group-focus-within:text-primary transition-colors" size={20} />
                                <input
                                    type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    required
                                    className="w-full bg-background border border-border rounded-lg pl-10 pr-4 py-3 text-text-primary placeholder-text-muted focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
                                    placeholder="seu@email.com"
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-text-secondary mb-2">Senha</label>
                            <div className="relative group">
                                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted group-focus-within:text-primary transition-colors" size={20} />
                                <input
                                    type="password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    required
                                    className="w-full bg-background border border-border rounded-lg pl-10 pr-4 py-3 text-text-primary placeholder-text-muted focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
                                    placeholder="••••••••"
                                />
                            </div>
                            <div className="flex justify-end mt-2">
                                <a href="#" className="text-xs text-primary hover:text-primary-light transition-colors">Esqueceu a senha?</a>
                            </div>
                        </div>

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full bg-gradient-primary hover:brightness-110 text-white font-bold py-3.5 rounded-lg transition-all shadow-glow-primary flex items-center justify-center gap-2 group disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {loading ? <Loader2 className="animate-spin" size={20} /> : 'Entrar na Plataforma'}
                            {!loading && <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" />}
                        </button>
                    </form>

                    <div className="mt-8 text-center">
                        <p className="text-sm text-text-secondary">
                            Ainda não tem conta? <Link to="/register" className="text-primary font-bold hover:text-primary-light transition-colors">Criar conta</Link>
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
