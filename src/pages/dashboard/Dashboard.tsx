import {
    Clock, MessageSquare, Calendar, DollarSign, CheckCircle, Users,
    Flame, ArrowRight, AlertTriangle, Target, Zap, Timer, BrainCircuit,
    TrendingUp, BarChart3
} from 'lucide-react';
import {
    AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    BarChart, Bar, Cell
} from 'recharts';
import { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';

// ─── Types ────────────────────────────────────────────────────────────────────

interface DashboardMetrics {
    pipeline: { total_leads: number; total_value: number; won_value: number; won_count: number; appointments: number };
    ai: { active_chats: number; total_messages: number; saved_hours: number; chart: Array<{ name: string; volume: number }> };
}

interface ForecastData {
    projected: number; pipeline_total: number;
    hot_value: number; warm_value: number; cold_value: number;
    by_stage: { stage: string; value: number; count: number }[];
}

interface VelocityStage { stage: string; count: number; avg_hours_idle: number; }

interface UrgencyLead {
    id: string; name: string; phone?: string; status: string; value: number;
    score: number; intentLabel: 'HOT' | 'WARM' | 'COLD'; briefing?: string; hours_idle: number;
}
interface UrgencyData { now: UrgencyLead[]; today: UrgencyLead[]; at_risk: UrgencyLead[]; }

interface RevenueIntelligenceData {
    opportunities: { today: number; week: number; month: number };
    temperatures: { name: string; value: number }[];
    distribution: { range: string; count: number }[];
    conversion_rates: { range: string; rate: number }[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v);
const fmtHours = (h: number) => h >= 24 ? `${Math.round(h / 24)}d` : h >= 1 ? `${Math.round(h)}h` : `${Math.round(h * 60)}min`;

const URGENCY_CONFIG = {
    now: { label: 'Agir Agora', icon: Flame, color: 'text-orange-400', bg: 'bg-orange-500/10', border: 'border-orange-500/30', dot: 'bg-orange-500' },
    today: { label: 'Agir Hoje', icon: AlertTriangle, color: 'text-yellow-400', bg: 'bg-yellow-500/10', border: 'border-yellow-500/30', dot: 'bg-yellow-500' },
    at_risk: { label: 'Em Risco', icon: Timer, color: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/30', dot: 'bg-red-500' },
};

const useAPI = <T,>(url: string, token: string | null, deps: unknown[] = []) => {
    const [data, setData] = useState<T | null>(null);
    const [loading, setLoading] = useState(true);
    useEffect(() => {
        if (!token) return;
        setLoading(true);
        fetch(url, { headers: { Authorization: `Bearer ${token}` } })
            .then(r => r.ok ? r.json() : null)
            .then(d => { setData(d); setLoading(false); })
            .catch(() => setLoading(false));
    }, [token, ...deps]);
    return { data, loading };
};

// ─── Component ────────────────────────────────────────────────────────────────

export function Dashboard() {
    const { user, token } = useAuth();
    const [selectedDays, setSelectedDays] = useState(7);
    const [urgencyTab, setUrgencyTab] = useState<'now' | 'today' | 'at_risk'>('now');
    const [dismissedRecs, setDismissedRecs] = useState<string[]>([]);

    const { data: metrics, loading: metricsLoading } = useAPI<DashboardMetrics>(
        `/api/dashboard/metrics?days=${selectedDays}`, token, [selectedDays]
    );
    const { data: forecast, loading: forecastLoading } = useAPI<ForecastData>('/api/dashboard/forecast', token);
    const { data: velocity, loading: velocityLoading } = useAPI<VelocityStage[]>('/api/dashboard/velocity', token);
    const { data: urgency, loading: urgencyLoading } = useAPI<UrgencyData>('/api/dashboard/urgency', token);
    const { data: revIntel, loading: revIntelLoading } = useAPI<RevenueIntelligenceData>(`/api/dashboard/revenue-intelligence?days=${selectedDays}`, token, [selectedDays]);

    // Chart data — use API data; zero-values get a tiny baseline so the wave renders visibly
    const rawChart = metrics?.ai.chart ?? [];
    const MIN_BASELINE = 0.3; // invisible at scale, but lets recharts draw the curve
    const paddedChartData = rawChart.map(d => ({
        name: d.name,
        real: d.volume,                                             // used in tooltip
        volume: d.volume > 0 ? d.volume : MIN_BASELINE,            // used by Area (never truly 0)
    }));

    const urgencyLeads = urgency ? urgency[urgencyTab] : [];
    const urgencyCounts = urgency ? {
        now: urgency.now.length, today: urgency.today.length, at_risk: urgency.at_risk.length
    } : { now: 0, today: 0, at_risk: 0 };

    const maxVelocityHours = velocity ? Math.max(...velocity.map(s => s.avg_hours_idle), 1) : 1;

    // Generate recommendations based on velocity and forecast data
    const recommendations = (() => {
        const items: Array<{ id: string; title: string; desc: string; type: 'warning' | 'info' | 'success' }> = [];

    if (forecast && forecast.hot_value > 0) {
        items.push({
            id: 'hot-leads',
            type: 'info',
            title: 'Oportunidades Quentes',
            desc: `Você tem ${fmt(forecast.hot_value)} em negócios muito propensos a fechar. Foque em enviar a proposta final para esses clientes.`,
        });
    }

        if (items.length === 0) {
            items.push({
                id: 'all-good',
                type: 'success',
                title: 'Funil Saudável',
                desc: 'O fluxo de leads está fluindo bem. Não há gargalos críticos no momento.',
            });
        }

        return items.filter(r => !dismissedRecs.includes(r.id));
    })();

    return (
        <div className="space-y-6">

            {/* ── Header ── */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-text-primary">Olá {user?.name?.split(' ')[0] || 'Gestor'}!</h1>
                    <p className="text-text-secondary mt-1 text-sm">
                        Centro de Comando de Receita —{' '}
                        <span className="relative inline-block">
                            <span className="absolute inset-0 bg-primary/20 blur-md rounded-full animate-pulse" />
                            <span className="relative font-semibold text-transparent bg-clip-text bg-gradient-to-r from-primary to-purple-500">
                                dinheiro em movimento, em tempo real.
                            </span>
                        </span>
                    </p>
                </div>
                <select
                    value={selectedDays}
                    onChange={e => setSelectedDays(Number(e.target.value))}
                    className="bg-surface border border-border/50 text-text-primary text-sm rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-primary/50 cursor-pointer font-medium shadow-sm hover:border-primary/30 transition-colors"
                >
                    <option value={7}>Últimos 7 dias</option>
                    <option value={15}>Últimos 15 dias</option>
                    <option value={30}>Últimos 30 dias</option>
                    <option value={90}>Últimos 90 dias</option>
                </select>
            </div>

            {/* ── KPI Cards ── */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {[
                    { icon: DollarSign, color: 'primary', label: 'Potenciais Negócios', value: fmt(metrics?.pipeline.total_value || 0), sub: `${metrics?.pipeline.total_leads || 0} leads` },
                    { icon: CheckCircle, color: 'green-500', label: 'Negócios Fechados', value: fmt(metrics?.pipeline.won_value || 0), sub: `${metrics?.pipeline.won_count || 0} fechados` },
                    { icon: Calendar, color: 'purple-500', label: 'Agendamentos', value: String(metrics?.pipeline.appointments || 0), sub: 'Reuniões pela IA' },
                ].map(({ icon: Icon, color, label, value, sub }) => (
                    <div key={label} className="bg-surface border border-border rounded-xl p-6 relative overflow-hidden group hover:border-primary/30 transition-colors">
                        <div className={`p-2 bg-${color}/10 rounded-lg text-${color} w-fit mb-4`}><Icon size={24} /></div>
                        <h3 className="text-text-secondary text-sm font-medium">{label}</h3>
                        <p className="text-3xl font-display font-bold text-text-primary mt-1">{metricsLoading ? '...' : value}</p>
                        <p className="text-xs text-text-secondary mt-1">{sub}</p>
                        <div className={`absolute -bottom-4 -right-4 w-24 h-24 bg-${color}/5 rounded-full blur-2xl group-hover:bg-${color}/10 transition-colors`} />
                    </div>
                ))}
            </div>

            {/* ── REVENUE INTELLIGENCE (OPPORTUNITY SCORING ENGINE) ── */}
            <div>
                <div className="flex items-center gap-3 mb-4">
                    <div className="p-2 bg-indigo-500/10 rounded-lg"><TrendingUp size={24} className="text-indigo-400" /></div>
                    <div>
                        <h2 className="text-lg font-bold text-text-primary">Revenue Intelligence</h2>
                        <p className="text-sm text-text-secondary">Métricas geradas em tempo real pela <i>Opportunity Scoring Engine</i></p>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                    {/* North Star KPI */}
                    <div className="col-span-1 bg-surface border border-indigo-500/30 rounded-2xl p-6 shadow-[0_0_30px_-5px_var(--tw-shadow-color)] shadow-indigo-500/10 flex flex-col justify-between relative overflow-hidden group">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/10 rounded-full blur-2xl -translate-y-1/2 translate-x-1/2" />

                        <div>
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-text-secondary font-medium">Oportunidades Criadas</h3>
                                <span className="bg-indigo-500/20 text-indigo-400 text-xs py-1 px-3 rounded-full font-bold border border-indigo-500/30">
                                    Score &gt; 60
                                </span>
                            </div>

                            <div className="space-y-4">
                                <div>
                                    <p className="text-4xl font-display font-bold text-text-primary">
                                        {revIntelLoading ? '...' : (revIntel?.opportunities.month || 0)}
                                    </p>
                                    <p className="text-xs text-text-secondary mt-1">Este mês</p>
                                </div>
                                <div className="grid grid-cols-2 gap-4 pt-4 border-t border-border/50">
                                    <div>
                                        <p className="text-lg font-bold text-text-primary">{revIntelLoading ? '-' : (revIntel?.opportunities.week || 0)}</p>
                                        <p className="text-[10px] text-text-secondary uppercase">Esta Semana</p>
                                    </div>
                                    <div>
                                        <p className="text-lg font-bold text-text-primary">{revIntelLoading ? '-' : (revIntel?.opportunities.today || 0)}</p>
                                        <p className="text-[10px] text-text-secondary uppercase">Hoje</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Temperaturas & Conversão */}
                    <div className="col-span-1 lg:col-span-1 flex flex-col gap-6">
                        <div className="bg-surface border border-border/50 rounded-2xl p-5 shadow-sm flex-1">
                            <h3 className="text-sm text-text-secondary font-medium mb-4 flex items-center gap-2">
                                <Flame size={16} className="text-orange-400" /> Distribuição de Temperatura
                            </h3>
                            {revIntelLoading ? (
                                <div className="h-32 flex items-center justify-center text-text-secondary text-sm">Carregando...</div>
                            ) : revIntel?.temperatures.length === 0 ? (
                                <EmptyState icon={Target} text="Sem leads classificados ainda" />
                            ) : (
                                <div className="space-y-3 mt-4">
                                    {['quente', 'morno', 'frio'].map(t => {
                                        const count = revIntel?.temperatures.find(x => x.name === t)?.value || 0;
                                        const total = revIntel?.temperatures.reduce((acc, curr) => acc + curr.value, 0) || 1;
                                        const pct = Math.round((count / total) * 100);
                                        const color = t === 'quente' ? 'bg-orange-500' : t === 'morno' ? 'bg-yellow-500' : 'bg-blue-500';
                                        return (
                                            <div key={t} className="flex items-center gap-3">
                                                <div className="w-16 text-xs text-text-secondary capitalize">{t}</div>
                                                <div className="flex-1 h-2 bg-surface-secondary/50 rounded-full overflow-hidden">
                                                    <div className={`h-full ${color} rounded-full`} style={{ width: `${pct}%` }} />
                                                </div>
                                                <div className="w-8 text-right text-xs font-bold text-text-primary">{count}</div>
                                            </div>
                                        )
                                    })}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Distribuição de Score */}
                    <div className="col-span-1 lg:col-span-2 bg-surface border border-border/50 rounded-2xl p-6 shadow-sm">
                        <h3 className="text-sm text-text-secondary font-medium mb-6 flex items-center gap-2">
                            <BarChart3 size={16} className="text-primary" /> Distribuição de Opportunity Score
                        </h3>
                        {revIntelLoading ? (
                            <div className="h-[200px] flex items-center justify-center text-text-secondary text-sm">Carregando gráfico...</div>
                        ) : revIntel?.distribution.length === 0 ? (
                            <div className="h-[200px] flex items-center justify-center text-text-secondary text-sm">Nenhum score calculado na base.</div>
                        ) : (
                            <div className="h-[200px] w-full">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={revIntel?.distribution || []} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
                                        <XAxis dataKey="range" tick={{ fontSize: 11, fill: '#888' }} axisLine={false} tickLine={false} />
                                        <YAxis tick={{ fontSize: 11, fill: '#888' }} axisLine={false} tickLine={false} />
                                        <Tooltip
                                            cursor={{ fill: 'rgba(255,255,255,0.02)' }}
                                            contentStyle={{ backgroundColor: '#111', border: '1px solid #333', borderRadius: '8px' }}
                                        />
                                        <Bar dataKey="count" name="Leads" radius={[4, 4, 0, 0]}>
                                            {(revIntel?.distribution || []).map((entry, index) => {
                                                const max = entry.range ? parseInt(entry.range.split('-')[1]) : 0;
                                                const color = max >= 80 ? '#f97316' : max >= 60 ? '#f59e0b' : max >= 40 ? '#eab308' : '#3b82f6';
                                                return <Cell key={`cell-${index}`} fill={color} />;
                                            })}
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* IA Diretor de Vendas */}
            <div className="bg-surface border border-border/50 rounded-2xl p-6 shadow-xl relative overflow-hidden">
                <div className="absolute top-0 right-0 w-48 h-48 bg-purple-500/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none" />
                <div className="flex items-center gap-3 mb-5">
                    <div className="p-2 bg-purple-500/10 rounded-lg"><BrainCircuit size={20} className="text-purple-400" /></div>
                    <div>
                        <h2 className="text-base font-bold text-text-primary">IA Diretor de Vendas</h2>
                        <p className="text-xs text-text-secondary">Leads que precisam de ação agora e insights práticos do funil.</p>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {recommendations.length > 0 ? recommendations.map(rec => (
                        <div key={rec.id} className="bg-surface-secondary/30 border border-border/40 rounded-xl p-4 flex flex-col justify-between group hover:border-border transition-colors">
                            <div>
                                <div className="flex items-center gap-2 mb-2">
                                    {rec.type === 'warning' && <AlertTriangle size={16} className="text-orange-400" />}
                                    {rec.type === 'info' && <Zap size={16} className="text-blue-400" />}
                                    {rec.type === 'success' && <CheckCircle size={16} className="text-green-400" />}
                                    <h3 className="font-semibold text-sm text-text-primary">{rec.title}</h3>
                                </div>
                                <p className="text-xs text-text-secondary leading-relaxed mb-4">{rec.desc}</p>
                            </div>
                            {rec.type !== 'success' && (
                                <div className="flex gap-2 mt-auto">
                                    <button
                                        onClick={() => setDismissedRecs(prev => [...prev, rec.id])}
                                        className="flex-1 bg-primary/10 hover:bg-primary/20 text-primary text-xs font-semibold py-1.5 rounded-lg transition-colors"
                                    >
                                        Resolvido
                                    </button>
                                    <button
                                        onClick={() => setDismissedRecs(prev => [...prev, rec.id])}
                                        className="flex-1 bg-surfaceHover hover:bg-white/5 text-text-muted hover:text-text-primary text-xs font-semibold py-1.5 rounded-lg transition-colors border border-border/30"
                                    >
                                        Ignorar
                                    </button>
                                </div>
                            )}
                        </div>
                    )) : (
                        <div className="col-span-full">
                            <EmptyState icon={CheckCircle} text="O Diretor de Vendas está em dia — nenhuma ação urgente agora." />
                        </div>
                    )}
                </div>
            </div>

            {/* ── Previsão de Receita + Velocity ── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

                {/* 💰 Previsão de Receita */}
                <div className="bg-surface border border-border/50 rounded-2xl p-6 shadow-xl relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-40 h-40 bg-green-500/5 rounded-full blur-3xl -translate-y-1/4 translate-x-1/4 pointer-events-none" />
                    <div className="flex items-center gap-3 mb-5">
                        <div className="p-2 bg-green-500/10 rounded-lg"><Target size={20} className="text-green-400" /></div>
                        <div>
                            <h2 className="text-base font-bold text-text-primary">Previsão de Receita</h2>
                            <p className="text-xs text-text-secondary">Projeção ponderada por intenção de compra</p>
                        </div>
                    </div>

                    {forecastLoading ? (
                        <div className="space-y-3">{[1, 2, 3].map(i => <div key={i} className="h-8 bg-white/5 rounded animate-pulse" />)}</div>
                    ) : forecast && forecast.pipeline_total > 0 ? (
                        <div className="space-y-4">
                            <div className="bg-green-500/5 border border-green-500/20 rounded-xl p-4">
                                <p className="text-xs text-green-400/70 font-medium uppercase tracking-wide">Projeção do Mês</p>
                                <p className="text-3xl font-display font-bold text-green-400 mt-1">{fmt(forecast.projected)}</p>
                                <p className="text-xs text-text-secondary mt-1">de {fmt(forecast.pipeline_total)} total em pipeline</p>
                            </div>
                            <div className="grid grid-cols-3 gap-2">
                                {[
                                    { label: '🔥 Quente', value: forecast.hot_value, color: 'text-orange-400' },
                                    { label: '🟡 Morno', value: forecast.warm_value, color: 'text-yellow-400' },
                                    { label: '🔵 Frio', value: forecast.cold_value, color: 'text-blue-400' },
                                ].map(({ label, value, color }) => (
                                    <div key={label} className="bg-surface-secondary/30 rounded-xl p-3 border border-border/40">
                                        <p className="text-[10px] text-text-secondary">{label}</p>
                                        <p className={`text-sm font-bold ${color} mt-0.5`}>{fmt(value)}</p>
                                    </div>
                                ))}
                            </div>
                            {forecast.by_stage.length > 0 && (
                                <div className="space-y-1.5">
                                    <p className="text-xs text-text-secondary font-medium mb-2">Por Estágio</p>
                                    {forecast.by_stage.slice(0, 4).map(s => (
                                        <div key={s.stage} className="flex items-center justify-between text-xs">
                                            <span className="text-text-secondary truncate max-w-[140px]">{s.stage}</span>
                                            <div className="flex items-center gap-2">
                                                <div className="w-20 h-1.5 bg-white/5 rounded-full overflow-hidden">
                                                    <div className="h-full bg-primary/60 rounded-full" style={{ width: `${Math.min((s.value / forecast.pipeline_total) * 100, 100)}%` }} />
                                                </div>
                                                <span className="text-text-primary font-medium w-20 text-right">{fmt(s.value)}</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    ) : (
                        <EmptyState icon={Target} text="Adicione valor aos leads para ver a previsão de receita" />
                    )}
                </div>

                {/* ⚡ Velocity Score */}
                <div className="bg-surface border border-border/50 rounded-2xl p-6 shadow-xl relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-40 h-40 bg-blue-500/5 rounded-full blur-3xl -translate-y-1/4 translate-x-1/4 pointer-events-none" />
                    <div className="flex items-center gap-3 mb-5">
                        <div className="p-2 bg-blue-500/10 rounded-lg"><Zap size={20} className="text-blue-400" /></div>
                        <div>
                            <h2 className="text-base font-bold text-text-primary">Velocity Score</h2>
                            <p className="text-xs text-text-secondary">Tempo médio sem contato por estágio</p>
                        </div>
                    </div>

                    {velocityLoading ? (
                        <div className="space-y-3">{[1, 2, 3, 4].map(i => <div key={i} className="h-10 bg-white/5 rounded animate-pulse" />)}</div>
                    ) : velocity && velocity.length > 0 ? (
                        <div className="space-y-3">
                            {velocity.map(s => {
                                const pct = Math.min((s.avg_hours_idle / maxVelocityHours) * 100, 100);
                                const color = s.avg_hours_idle >= 48 ? 'bg-red-500' : s.avg_hours_idle >= 24 ? 'bg-orange-500' : s.avg_hours_idle >= 8 ? 'bg-yellow-500' : 'bg-green-500';
                                const textColor = s.avg_hours_idle >= 48 ? 'text-red-400' : s.avg_hours_idle >= 24 ? 'text-orange-400' : s.avg_hours_idle >= 8 ? 'text-yellow-400' : 'text-green-400';
                                return (
                                    <div key={s.stage} className="space-y-1">
                                        <div className="flex justify-between items-center text-xs">
                                            <span className="text-text-secondary truncate max-w-[160px]">{s.stage} <span className="text-text-muted">({s.count})</span></span>
                                            <span className={`font-bold ${textColor}`}>{fmtHours(s.avg_hours_idle)}</span>
                                        </div>
                                        <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                                            <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${pct}%` }} />
                                        </div>
                                    </div>
                                );
                            })}
                            <p className="text-[10px] text-text-muted pt-1">🟢 &lt;8h ótimo · 🟡 8-24h atenção · 🟠 24-48h urgente · 🔴 48h+ em risco</p>
                        </div>
                    ) : (
                        <EmptyState icon={Zap} text="Dados de velocity disponíveis após a IA conversar com leads no pipeline" />
                    )}
                </div>
            </div>

            {/* ── Lead Heat Map ── */}
            <div className="bg-surface border border-border/50 rounded-2xl p-6 shadow-xl relative overflow-hidden">
                <div className="absolute top-0 right-0 w-48 h-48 bg-orange-500/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none" />
                <div className="flex items-center justify-between mb-5">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-orange-500/10 rounded-lg"><Flame size={20} className="text-orange-400" /></div>
                        <div>
                            <h2 className="text-base font-bold text-text-primary">Lead Heat Map — Ação Necessária</h2>
                            <p className="text-xs text-text-secondary">Leads que precisam de atenção agora</p>
                        </div>
                    </div>
                    <a href="/crm" className="flex items-center gap-1.5 text-xs text-text-secondary hover:text-primary transition-colors font-medium">
                        Ver Pipeline <ArrowRight size={14} />
                    </a>
                </div>

                {/* Urgency Tabs */}
                <div className="flex gap-2 mb-4">
                    {(Object.keys(URGENCY_CONFIG) as Array<keyof typeof URGENCY_CONFIG>).map(key => {
                        const cfg = URGENCY_CONFIG[key];
                        const Icon = cfg.icon;
                        const count = urgencyCounts[key];
                        const active = urgencyTab === key;
                        return (
                            <button
                                key={key}
                                onClick={() => setUrgencyTab(key)}
                                className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold border transition-all flex-1 justify-center ${active ? `${cfg.bg} ${cfg.color} ${cfg.border}` : 'bg-surface-secondary/20 text-text-secondary border-border/30 hover:border-border'
                                    }`}
                            >
                                <Icon size={13} />
                                {cfg.label}
                                {count > 0 && (
                                    <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${active ? 'bg-current/20' : 'bg-white/10'}`}>
                                        {count}
                                    </span>
                                )}
                            </button>
                        );
                    })}
                </div>

                {urgencyLoading ? (
                    <div className="space-y-2">{[1, 2, 3].map(i => <div key={i} className="h-14 bg-white/5 rounded-xl animate-pulse" />)}</div>
                ) : urgencyLeads.length === 0 ? (
                    <div className="text-center py-8">
                        <p className="text-sm text-text-secondary font-medium">
                            {urgencyTab === 'now' ? '✅ Nenhum lead quente aguardando resposta' :
                                urgencyTab === 'today' ? '✅ Todos os leads mornos foram contatados hoje' :
                                    '✅ Nenhum lead em risco de esfriamento'}
                        </p>
                        <p className="text-xs text-text-muted mt-1">Ótimo! Continue monitorando.</p>
                    </div>
                ) : (
                    <div className="space-y-2">
                        {urgencyLeads.map(lead => {
                            const tier = URGENCY_CONFIG[urgencyTab];
                            return (
                                <div key={lead.id} className={`flex items-center gap-3 p-3.5 rounded-xl border ${tier.bg} ${tier.border}`}>
                                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${tier.dot}`} />
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <p className="text-sm font-semibold text-text-primary truncate">{lead.name}</p>
                                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${tier.bg} ${tier.color} border ${tier.border} flex-shrink-0`}>
                                                {lead.score}pts
                                            </span>
                                        </div>
                                        <p className="text-xs text-text-secondary truncate mt-0.5">
                                            {lead.briefing || lead.status}
                                        </p>
                                    </div>
                                    <div className="flex-shrink-0 text-right">
                                        <p className={`text-xs font-bold ${tier.color}`}>{fmtHours(lead.hours_idle)}</p>
                                        <p className="text-[10px] text-text-muted">sem contato</p>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* ── Volume de Atendimentos IA (full width) ── */}
            <div className="bg-surface border border-border/50 rounded-2xl p-6 shadow-xl relative overflow-hidden">
                <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none" />
                <h2 className="text-base font-display font-bold text-text-primary mb-1">Volume de Atendimentos IA</h2>
                <p className="text-xs text-text-secondary mb-4">Interações nos últimos {selectedDays} dias</p>
                <div className="h-[240px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={paddedChartData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                            <defs>
                                <linearGradient id="colorVol" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#F5793B" stopOpacity={0.45} />
                                    <stop offset="95%" stopColor="#F5793B" stopOpacity={0.02} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="#27272A" vertical={false} />
                            <XAxis dataKey="name" stroke="#52525B" fontSize={11} tickLine={false} axisLine={false} dy={8} interval={0} />
                            <YAxis stroke="#52525B" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v: number) => String(Math.round(v))} />
                            <Tooltip
                                contentStyle={{ backgroundColor: '#18181B', borderColor: '#27272A', borderRadius: '12px' }}
                                itemStyle={{ color: '#fff', fontSize: '13px' }}
                                formatter={(_v: number, _n: string, props: { payload?: { real: number } }) => [props.payload?.real ?? 0, 'Volume']}
                                cursor={{ stroke: '#F5793B', strokeWidth: 1, strokeDasharray: '5 5' }}
                            />
                            <Area
                                type="monotone"
                                dataKey="volume"
                                stroke="#F5793B"
                                strokeWidth={2.5}
                                fillOpacity={1}
                                fill="url(#colorVol)"
                                dot={false}
                                activeDot={{ r: 5, strokeWidth: 0, fill: '#fff' }}
                            />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
                <div className="grid grid-cols-3 gap-2 mt-4 pt-4 border-t border-border/40">
                    {[
                        { icon: MessageSquare, label: 'Mensagens', value: (metricsLoading ? '...' : (metrics?.ai.total_messages || 0).toLocaleString()), color: 'text-primary' },
                        { icon: Users, label: 'Chats Ativos', value: metricsLoading ? '...' : (metrics?.ai.active_chats || 0), color: 'text-blue-400' },
                        { icon: Clock, label: 'Horas Salvas', value: metricsLoading ? '...' : (metrics?.ai.saved_hours || 0), color: 'text-purple-400' },
                    ].map(({ icon: Icon, label, value, color }) => (
                        <div key={label} className="text-center">
                            <Icon size={14} className={`${color} mx-auto mb-1`} />
                            <p className="text-sm font-bold text-text-primary">{value}</p>
                            <p className="text-[10px] text-text-muted">{label}</p>
                        </div>
                    ))}
                </div>
            </div>

            {/* Footer */}
            <div className="text-center text-xs text-text-secondary/60 pb-2">
                Última atualização: {new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
            </div>
        </div>
    );
}

function EmptyState({ icon: Icon, text }: { icon: React.ElementType; text: string }) {
    return (
        <div className="flex flex-col items-center gap-3 py-8 text-center">
            <div className="p-3 bg-surface-secondary rounded-xl">
                <Icon size={22} className="text-text-muted" />
            </div>
            <p className="text-xs text-text-muted max-w-xs leading-relaxed">{text}</p>
        </div>
    );
}
