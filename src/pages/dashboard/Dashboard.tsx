import {
    Clock,
    MessageSquare,
    Calendar,
    DollarSign,
    CheckCircle,
    Users,
    Flame,
    TrendingUp,
    ArrowRight
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

interface HeatmapLead {
    id: string;
    name: string;
    phone: string;
    company?: string;
    status: string;
    value: number;
    score: number;
    temperature: string;
    intentLabel: 'CRITICAL' | 'HOT' | 'WARM' | 'COLD';
    briefing?: string;
    lastInteraction?: string;
}

const intentConfig = {
    CRITICAL: { label: 'CRÍTICO', color: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/30', dot: 'bg-red-500' },
    HOT: { label: 'QUENTE', color: 'text-orange-400', bg: 'bg-orange-500/10', border: 'border-orange-500/30', dot: 'bg-orange-500' },
    WARM: { label: 'MORNO', color: 'text-yellow-400', bg: 'bg-yellow-500/10', border: 'border-yellow-500/30', dot: 'bg-yellow-500' },
    COLD: { label: 'FRIO', color: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/30', dot: 'bg-blue-500' },
};

export function Dashboard() {
    const { user, token: authToken } = useAuth();
    const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [selectedDays, setSelectedDays] = useState(7);
    const [heatmap, setHeatmap] = useState<HeatmapLead[]>([]);
    const [heatmapLoading, setHeatmapLoading] = useState(true);

    useEffect(() => {
        if (!user) return;

        const fetchMetrics = async () => {
            try {
                setLoading(true);


                if (!authToken) {
                    setError("Erro: Usuário não autenticado (sem token).");
                    return;
                }

                const res = await fetch(`/api/dashboard/metrics?days=${selectedDays}`, {
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
    }, [user, authToken, selectedDays]);

    useEffect(() => {
        if (!authToken) return;
        const fetchHeatmap = async () => {
            setHeatmapLoading(true);
            try {
                const res = await fetch('/api/leads/heatmap', {
                    headers: { 'Authorization': `Bearer ${authToken}` }
                });
                if (res.ok) setHeatmap(await res.json());
            } catch (e) {
                console.error('[Heatmap] fetch error', e);
            } finally {
                setHeatmapLoading(false);
            }
        };
        fetchHeatmap();
    }, [authToken]);

    const formatCurrency = (value: number) => {
        return new Intl.NumberFormat('pt-BR', {
            style: 'currency',
            currency: 'BRL',
            maximumFractionDigits: 0
        }).format(value);
    };

    // Use real data if available, otherwise show a placeholder wave so the chart is always visible
    const hasRealData = metrics?.ai.chart && metrics.ai.chart.length > 0 && metrics.ai.chart.some(d => d.volume > 0);
    const chartData = hasRealData ? metrics!.ai.chart : [
        { name: 'Seg', volume: 3 },
        { name: 'Ter', volume: 7 },
        { name: 'Qua', volume: 5 },
        { name: 'Qui', volume: 10 },
        { name: 'Sex', volume: 6 },
        { name: 'Sab', volume: 4 },
        { name: 'Dom', volume: 2 },
    ];
    const isPlaceholderData = !hasRealData;

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-text-primary">Olá {user?.name || 'Visitante'}!</h1>
                    <p className="text-text-secondary mt-1">
                        Revenue Intelligence em tempo real.{' '}
                        <span className="relative inline-block ml-1">
                            <span className="absolute inset-0 bg-primary/20 blur-md rounded-full animate-pulse"></span>
                            <span className="relative font-semibold text-transparent bg-clip-text bg-gradient-to-r from-primary to-purple-500 tracking-wide drop-shadow-sm">
                                A IA monitora cada oportunidade.
                            </span>
                        </span>
                    </p>
                </div>
                <select
                    value={selectedDays}
                    onChange={(e) => setSelectedDays(Number(e.target.value))}
                    className="bg-surface border border-border/50 text-text-primary text-sm rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-primary/50 cursor-pointer font-medium shadow-sm hover:border-primary/30 transition-colors"
                >
                    <option value={7}>Últimos 7 dias</option>
                    <option value={15}>Últimos 15 dias</option>
                    <option value={30}>Últimos 30 dias</option>
                    <option value={90}>Últimos 90 dias</option>
                </select>
            </div>

            {error && (
                <div className="bg-red-500/10 border border-red-500/20 text-red-500 p-4 rounded-xl flex items-center gap-2">
                    <span className="font-semibold">Erro:</span> {error}
                </div>
            )
            }

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
                        {isPlaceholderData && (
                            <p className="text-xs text-text-muted text-center pt-2 pb-0 italic opacity-60">
                                Nenhuma mensagem nos últimos 7 dias — gráfico ilustrativo
                            </p>
                        )}
                        <ResponsiveContainer width="100%" height={isPlaceholderData ? "92%" : "100%"}>
                            <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                                <defs>
                                    <linearGradient id="colorVolume" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#F5793B" stopOpacity={isPlaceholderData ? 0.15 : 0.4} />
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
                                    formatter={(value: any) => isPlaceholderData ? ['—', 'Volume'] : [value, 'Volume']}
                                />
                                <Area
                                    type="monotone"
                                    dataKey="volume"
                                    stroke="#F5793B"
                                    strokeWidth={isPlaceholderData ? 1.5 : 3}
                                    strokeOpacity={isPlaceholderData ? 0.4 : 1}
                                    fillOpacity={1}
                                    fill="url(#colorVolume)"
                                    activeDot={isPlaceholderData ? false : { r: 6, strokeWidth: 0, fill: '#fff' }}
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

            {/* === LEAD HEAT MAP: Revenue OS === */}
            <div className="bg-surface border border-border/50 rounded-2xl p-6 shadow-xl relative overflow-hidden">
                <div className="absolute top-0 right-0 w-48 h-48 bg-orange-500/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none"></div>
                <div className="flex items-center justify-between mb-5">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-orange-500/10 rounded-lg">
                            <Flame size={20} className="text-orange-400" />
                        </div>
                        <div>
                            <h2 className="text-lg font-display font-bold text-text-primary">Lead Heat Map</h2>
                            <p className="text-xs text-text-secondary">Oportunidades classificadas por intenção de compra em tempo real</p>
                        </div>
                    </div>
                    <a href="/crm" className="flex items-center gap-1.5 text-xs text-text-secondary hover:text-primary transition-colors font-medium">
                        Ver Pipeline <ArrowRight size={14} />
                    </a>
                </div>

                {heatmapLoading ? (
                    <div className="text-center py-8 text-text-muted text-sm">Carregando inteligência...</div>
                ) : heatmap.length === 0 ? (
                    <div className="text-center py-10">
                        <div className="flex flex-col items-center gap-3">
                            <div className="p-3 bg-surface-secondary rounded-xl">
                                <TrendingUp size={24} className="text-text-muted" />
                            </div>
                            <p className="text-sm text-text-secondary font-medium">Nenhum lead com score ainda</p>
                            <p className="text-xs text-text-muted max-w-xs">
                                O Heat Map se preenche automaticamente conforme a IA conversa com seus leads e classifica a intenção de compra.
                            </p>
                        </div>
                    </div>
                ) : (
                    <div className="space-y-2">
                        {heatmap.map((lead) => {
                            const cfg = intentConfig[lead.intentLabel] || intentConfig.COLD;
                            return (
                                <div key={lead.id} className={`flex items-center gap-4 p-3.5 rounded-xl border ${cfg.border} ${cfg.bg} hover:opacity-90 transition-opacity cursor-pointer`}>
                                    {/* Score ring */}
                                    <div className="flex-shrink-0 relative w-10 h-10 flex items-center justify-center">
                                        <svg className="absolute inset-0" viewBox="0 0 36 36">
                                            <circle cx="18" cy="18" r="15" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-white/5" />
                                            <circle
                                                cx="18" cy="18" r="15" fill="none"
                                                stroke={lead.score >= 85 ? '#f87171' : lead.score >= 65 ? '#fb923c' : lead.score >= 35 ? '#facc15' : '#60a5fa'}
                                                strokeWidth="2.5"
                                                strokeDasharray={`${(lead.score / 100) * 94.2} 94.2`}
                                                strokeLinecap="round"
                                                transform="rotate(-90 18 18)"
                                            />
                                        </svg>
                                        <span className="text-xs font-bold text-text-primary">{lead.score}</span>
                                    </div>

                                    {/* Lead info */}
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <p className="text-sm font-semibold text-text-primary truncate">{lead.name}</p>
                                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${cfg.bg} ${cfg.color} border ${cfg.border} flex-shrink-0`}>{cfg.label}</span>
                                        </div>
                                        <p className="text-xs text-text-secondary truncate mt-0.5">
                                            {lead.briefing || lead.temperature}
                                        </p>
                                    </div>

                                    {/* Value */}
                                    {lead.value > 0 && (
                                        <div className="flex-shrink-0 text-right">
                                            <p className="text-xs font-bold text-text-primary">
                                                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(lead.value)}
                                            </p>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Last updated timestamp */}
            <div className="text-center text-xs text-text-secondary/60 pb-2">
                Última atualização: {new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
            </div>
        </div>
    );
}
