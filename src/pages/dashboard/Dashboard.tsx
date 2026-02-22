import {
    Clock,
    MessageSquare,
    Calendar,
    DollarSign,
    CheckCircle,
    Users
} from 'lucide-react';
import {
    AreaChart,
    Area,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer
} from 'recharts';
import { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';

interface DashboardMetrics {
    pipeline: {
        total_leads: number;
        total_value: number;
        won_value: number;
        won_count: number;
        appointments: number;
    };
    ai: {
        active_chats: number;
        total_messages: number;
        saved_hours: number;
        chart: Array<{ name: string; volume: number }>;
    };
}

export function Dashboard() {
    const { user, token: authToken } = useAuth();
    const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!user) return;

        const fetchMetrics = async () => {
            try {
                setLoading(true);


                if (!authToken) {
                    setError("Erro: Usuário não autenticado (sem token).");
                    return;
                }

                const res = await fetch('/api/dashboard/metrics', {
                    headers: {
                        'Authorization': `Bearer ${authToken}`
                    }
                });



                if (res.ok) {
                    const data = await res.json();
                    setMetrics(data);
                    setError(null);
                } else {
                    const errText = await res.text();
                    console.error("Failed to fetch metrics:", res.status, errText);
                    setError(`Falha ao carregar dados (${res.status}): ${errText}`);
                }
            } catch (error) {
                console.error("Error fetching metrics:", error);
                setError("Erro de conexão.");
            } finally {
                setLoading(false);
            }
        };

        fetchMetrics();
    }, [user, authToken]);

    const formatCurrency = (value: number) => {
        return new Intl.NumberFormat('pt-BR', {
            style: 'currency',
            currency: 'BRL',
            maximumFractionDigits: 0
        }).format(value);
    };

    // Use mock data if loading or no data
    const chartData = metrics?.ai.chart.length ? metrics.ai.chart : [
        { name: 'Seg', volume: 0 },
        { name: 'Ter', volume: 0 },
        { name: 'Qua', volume: 0 },
        { name: 'Qui', volume: 0 },
        { name: 'Sex', volume: 0 },
        { name: 'Sab', volume: 0 },
        { name: 'Dom', volume: 0 },
    ];

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-text-primary">Olá {user?.name || 'Visitante'}!</h1>
                    <p className="text-text-secondary mt-1">
                        Você no comando da sua operação.{' '}
                        <span className="relative inline-block ml-1">
                            {/* Glowing background */}
                            <span className="absolute inset-0 bg-primary/20 blur-md rounded-full animate-pulse"></span>
                            {/* Gradient text */}
                            <span className="relative font-semibold text-transparent bg-clip-text bg-gradient-to-r from-primary to-purple-500 tracking-wide drop-shadow-sm">
                                A IA cuida do resto.
                            </span>
                        </span>
                    </p>
                </div>
                <div className="text-sm text-text-secondary">
                    Última atualização: {new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                </div>
            </div>

            {error && (
                <div className="bg-red-500/10 border border-red-500/20 text-red-500 p-4 rounded-xl flex items-center gap-2">
                    <span className="font-semibold">Erro:</span> {error}
                </div>
            )}

            {/* Metrics Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Metric 1: Pipeline Generado */}
                <div className="bg-surface border border-border rounded-xl p-6 relative overflow-hidden group hover:border-primary/30 transition-colors">
                    <div className="flex justify-between items-start mb-4">
                        <div className="p-2 bg-primary/10 rounded-lg text-primary">
                            <DollarSign size={24} />
                        </div>
                        {/* <span className="text-xs font-medium text-green-500 flex items-center gap-1 bg-green-500/10 px-2 py-1 rounded-full">
                            +12.5% <ArrowUpRight size={12} />
                        </span> */}
                    </div>
                    <div className="space-y-1">
                        <h3 className="text-text-secondary text-sm font-medium">Potenciais Negócios</h3>
                        <p className="text-3xl font-display font-bold text-text-primary">
                            {loading ? '...' : formatCurrency(metrics?.pipeline.total_value || 0)}
                        </p>
                        <p className="text-xs text-text-secondary">
                            Total de pipeline ({metrics?.pipeline.total_leads || 0} leads)
                        </p>
                    </div>
                    <div className="absolute -bottom-4 -right-4 w-24 h-24 bg-primary/5 rounded-full blur-2xl group-hover:bg-primary/10 transition-colors"></div>
                </div>

                {/* Metric 2: Negócios Fechados */}
                <div className="bg-surface border border-border rounded-xl p-6 relative overflow-hidden group hover:border-primary/30 transition-colors">
                    <div className="flex justify-between items-start mb-4">
                        <div className="p-2 bg-green-500/10 rounded-lg text-green-500">
                            <CheckCircle size={24} />
                        </div>
                    </div>
                    <div className="space-y-1">
                        <h3 className="text-text-secondary text-sm font-medium">Negócios Fechados</h3>
                        <p className="text-3xl font-display font-bold text-text-primary">
                            {loading ? '...' : formatCurrency(metrics?.pipeline.won_value || 0)}
                        </p>
                        <p className="text-xs text-text-secondary">
                            {metrics?.pipeline.won_count || 0} negócios fechados
                        </p>
                    </div>
                    <div className="absolute -bottom-4 -right-4 w-24 h-24 bg-green-500/5 rounded-full blur-2xl group-hover:bg-green-500/10 transition-colors"></div>
                </div>

                {/* Metric 3: Agendamentos */}
                <div className="bg-surface border border-border rounded-xl p-6 relative overflow-hidden group hover:border-primary/30 transition-colors">
                    <div className="flex justify-between items-start mb-4">
                        <div className="p-2 bg-purple-500/10 rounded-lg text-purple-500">
                            <Calendar size={24} />
                        </div>
                    </div>
                    <div className="space-y-1">
                        <h3 className="text-text-secondary text-sm font-medium">Agendamentos</h3>
                        <p className="text-3xl font-display font-bold text-text-primary">
                            {loading ? '...' : (metrics?.pipeline.appointments || 0)}
                        </p>
                        <p className="text-xs text-text-secondary">
                            Reuniões agendadas pela IA
                        </p>
                    </div>
                    <div className="absolute -bottom-4 -right-4 w-24 h-24 bg-purple-500/5 rounded-full blur-2xl group-hover:bg-purple-500/10 transition-colors"></div>
                </div>
            </div>

            {/* Main Content Info */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Chart Section */}
                <div className="lg:col-span-2 bg-surface border border-border/50 rounded-2xl p-6 shadow-xl relative overflow-hidden transition-colors duration-300">
                    <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none"></div>

                    <div className="flex items-center justify-between mb-8">
                        <div>
                            <h2 className="text-xl font-display font-bold text-text-primary tracking-tight">Volume de Atendimentos IA</h2>
                            <p className="text-sm text-text-secondary mt-1">Interações nos últimos 7 dias</p>
                        </div>
                        {/* <button className="p-2 hover:bg-white/5 rounded-lg text-text-secondary transition-colors border border-transparent hover:border-white/10">
                            <MoreHorizontal size={20} />
                        </button> */}
                    </div>
                    <div className="h-[320px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                                <defs>
                                    <linearGradient id="colorVolume" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#F5793B" stopOpacity={0.4} />
                                        <stop offset="95%" stopColor="#F5793B" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="#27272A" vertical={false} />
                                <XAxis
                                    dataKey="name"
                                    stroke="#52525B"
                                    fontSize={12}
                                    tickLine={false}
                                    axisLine={false}
                                    dy={10}
                                />
                                <YAxis
                                    stroke="#52525B"
                                    fontSize={12}
                                    tickLine={false}
                                    axisLine={false}
                                    tickFormatter={(value) => `${value}`}
                                    dx={-10}
                                />
                                <Tooltip
                                    contentStyle={{ backgroundColor: '#18181B', borderColor: '#27272A', borderRadius: '12px', boxShadow: '0 10px 30px -10px rgba(0,0,0,0.5)' }}
                                    itemStyle={{ color: '#fff', fontSize: '14px', fontWeight: 500 }}
                                    cursor={{ stroke: '#F5793B', strokeWidth: 1, strokeDasharray: '5 5' }}
                                />
                                <Area
                                    type="monotone"
                                    dataKey="volume"
                                    stroke="#F5793B"
                                    strokeWidth={3}
                                    fillOpacity={1}
                                    fill="url(#colorVolume)"
                                    activeDot={{ r: 6, strokeWidth: 0, fill: '#fff' }}
                                />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Activity / AI Stats Feed */}
                <div className="bg-surface border border-border/50 rounded-2xl p-6 shadow-xl flex flex-col h-full bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-primary/5 via-transparent to-transparent transition-colors duration-300">
                    <div className="flex items-center justify-between mb-6">
                        <h2 className="text-xl font-display font-bold text-text-primary tracking-tight">Performance da IA</h2>
                    </div>

                    <div className="space-y-6 flex-1">
                        <div className="p-4 bg-surface-secondary/50 rounded-xl border border-border/50">
                            <div className="flex items-center gap-3 mb-2">
                                <MessageSquare className="text-primary w-5 h-5" />
                                <h3 className="text-sm font-medium text-text-secondary">Total de Mensagens</h3>
                            </div>
                            <p className="text-2xl font-bold text-text-primary">{loading ? '...' : (metrics?.ai.total_messages || 0).toLocaleString()}</p>
                        </div>

                        <div className="p-4 bg-surface-secondary/50 rounded-xl border border-border/50">
                            <div className="flex items-center gap-3 mb-2">
                                <Users className="text-blue-500 w-5 h-5" />
                                <h3 className="text-sm font-medium text-text-secondary">Chats Ativos</h3>
                            </div>
                            <p className="text-2xl font-bold text-text-primary">{loading ? '...' : (metrics?.ai.active_chats || 0).toLocaleString()}</p>
                        </div>

                        <div className="p-4 bg-surface-secondary/50 rounded-xl border border-border/50">
                            <div className="flex items-center gap-3 mb-2">
                                <Clock className="text-purple-500 w-5 h-5" />
                                <h3 className="text-sm font-medium text-text-secondary">Tempo Economizado</h3>
                            </div>
                            <p className="text-2xl font-bold text-text-primary">{loading ? '...' : (metrics?.ai.saved_hours || 0).toLocaleString()} <span className="text-sm font-normal text-text-secondary">horas</span></p>
                        </div>


                        {/* Live Status */}
                        <div className="mt-auto pt-6 border-t border-border/50">
                            <div className="flex items-center gap-4 bg-background border border-green-500/20 p-4 rounded-xl shadow-lg relative overflow-hidden transition-colors duration-300">
                                <div className="absolute inset-0 bg-green-500/5 pulse-slow"></div>
                                <div className="relative">
                                    <div className="w-3 h-3 bg-green-500 rounded-full shadow-[0_0_10px_rgba(34,197,94,0.5)]"></div>
                                    <div className="absolute inset-0 bg-green-500 rounded-full animate-ping opacity-75"></div>
                                </div>
                                <div className="relative z-10">
                                    <p className="text-sm font-bold text-green-400 tracking-wide">SYSTEM ONLINE</p>
                                    <div className="flex items-center gap-2 mt-0.5">
                                        <MessageSquare size={12} className="text-green-500/70" />
                                        <p className="text-xs text-green-500/70 font-mono">{metrics?.ai.active_chats || 0} threads ativas</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
