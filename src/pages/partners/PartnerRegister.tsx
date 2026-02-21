import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { API_URL } from '../../config/api';
import { ArrowRight, CheckCircle2, DollarSign, TrendingUp, Share2 } from 'lucide-react';
import { motion } from 'framer-motion';

export const PartnerRegister = () => {
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const { login } = useAuth();
    const navigate = useNavigate();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            const res = await fetch(`${API_URL}/partners/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, email, password }),
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || 'Falha no cadastro');
            }

            // Auto-login logic
            login(data.user, data.token);
            navigate('/partners'); // Redirect directly to Partner Dashboard
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-gray-900 flex flex-col md:flex-row">
            {/* Left Side: Value Proposition */}
            <div className="w-full md:w-1/2 p-12 bg-gray-900 flex flex-col justify-center relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-primary/20 to-transparent"></div>
                <div className="relative z-10 max-w-lg mx-auto md:mx-0">
                    <div className="flex items-center gap-3 mb-8">
                        <div className="w-10 h-10 bg-gradient-to-br from-primary via-primary-light to-primary-dark rounded-xl flex items-center justify-center shadow-glow-primary">
                            <span className="text-white font-bold text-xl">K</span>
                        </div>
                        <span className="font-display font-bold text-2xl text-white tracking-tight">Kogna<span className="text-primary">.</span> Partners</span>
                    </div>

                    <h1 className="text-4xl md:text-5xl font-bold text-white mb-6">
                        Transforme sua influência em <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-amber-500">Renda Recorrente</span>.
                    </h1>
                    <p className="text-xl text-gray-400 mb-12 leading-relaxed">
                        Junte-se ao programa de parceiros da plataforma de IA que mais cresce. Ganhe comissões vitalícias por cada cliente indicado.
                    </p>

                    <div className="space-y-6">
                        <div className="flex items-start gap-4">
                            <div className="p-2 bg-primary/10 rounded-lg text-primary mt-1">
                                <DollarSign className="w-6 h-6" />
                            </div>
                            <div>
                                <h3 className="text-white font-bold text-lg">Comissões Altas</h3>
                                <p className="text-gray-400">Até 20% de comissão em todas as vendas e renovações.</p>
                            </div>
                        </div>
                        <div className="flex items-start gap-4">
                            <div className="p-2 bg-primary/10 rounded-lg text-primary mt-1">
                                <TrendingUp className="w-6 h-6" />
                            </div>
                            <div>
                                <h3 className="text-white font-bold text-lg">Pagamentos Mensais</h3>
                                <p className="text-gray-400">Receba seus ganhos diretamente na sua conta bancária sem burocracia.</p>
                            </div>
                        </div>
                        <div className="flex items-start gap-4">
                            <div className="p-2 bg-primary/10 rounded-lg text-primary mt-1">
                                <Share2 className="w-6 h-6" />
                            </div>
                            <div>
                                <h3 className="text-white font-bold text-lg">Material de Apoio</h3>
                                <p className="text-gray-400">Acesso a banners, copys e materiais de marketing exclusivos.</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Right Side: Registration Form */}
            <div className="w-full md:w-1/2 p-8 md:p-12 bg-gray-950 flex items-center justify-center">
                <div className="w-full max-w-md space-y-8">
                    <div className="text-center md:text-left">
                        <h2 className="text-3xl font-bold text-white">Crie sua conta de Parceiro</h2>
                        <p className="mt-2 text-gray-400">Já tem uma conta Kogna? <Link to="/login" className="text-primary hover:text-primary-light transition-colors font-medium">Faça login e ative sua parceria.</Link></p>
                    </div>

                    <motion.form
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.5 }}
                        onSubmit={handleSubmit}
                        className="space-y-6 bg-gray-900/50 p-8 rounded-2xl border border-gray-800 backdrop-blur-sm"
                    >
                        {error && (
                            <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 text-sm flex items-center gap-2">
                                <CheckCircle2 className="w-4 h-4" /> {/* Actually an alert icon would be better but keeping simple */}
                                {error}
                            </div>
                        )}

                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-2">Nome Completo</label>
                            <input
                                type="text"
                                required
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                className="w-full px-4 py-3 bg-gray-950 border border-gray-800 rounded-xl text-white placeholder-gray-500 focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all"
                                placeholder="Seu nome"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-2">E-mail Profissional</label>
                            <input
                                type="email"
                                required
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className="w-full px-4 py-3 bg-gray-950 border border-gray-800 rounded-xl text-white placeholder-gray-500 focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all"
                                placeholder="seu@email.com"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-2">Senha</label>
                            <input
                                type="password"
                                required
                                minLength={6}
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="w-full px-4 py-3 bg-gray-950 border border-gray-800 rounded-xl text-white placeholder-gray-500 focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all"
                                placeholder="••••••••"
                            />
                            <p className="mt-2 text-xs text-gray-500">Mínimo de 6 caracteres</p>
                        </div>

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full py-4 bg-primary hover:bg-primary-dark text-white rounded-xl font-bold text-lg shadow-lg shadow-primary/25 hover:shadow-primary/40 transition-all transform hover:-translate-y-1 disabled:opacity-70 disabled:hover:translate-y-0"
                        >
                            {loading ? (
                                <span className="flex items-center justify-center gap-2">
                                    <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                                    Processando...
                                </span>
                            ) : (
                                <span className="flex items-center justify-center gap-2">
                                    Quero ser Parceiro <ArrowRight className="w-5 h-5" />
                                </span>
                            )}
                        </button>
                    </motion.form>

                    <p className="text-center text-sm text-gray-500">
                        Ao se cadastrar, você concorda com nossos <a href="#" className="underline hover:text-white">Termos de Parceria</a>.
                    </p>
                </div>
            </div>
        </div>
    );
};
