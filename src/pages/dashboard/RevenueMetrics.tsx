import {
    DollarSign, CheckCircle, Target, Flame, AlertTriangle, Timer,
    ArrowRight, TrendingUp, Zap, Clock, MessageSquare, BarChart3,
    Activity, BrainCircuit, Sparkles, X
} from 'lucide-react';
import {
    AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
    BarChart, Bar, Cell, RadialBarChart, RadialBar, PieChart, Pie,
    CartesianGrid
} from 'recharts';
import { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useNavigate } from 'react-router-dom';

// ─── Types ─────────────────────────────────────────────────────────────────────

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
interface SalesProfessorData {
    errors: Array<{ id: string; type: string; title: string; description: string; lead_name?: string | null }>;
    summary: {
        ignored_hot_leads: number;
        avg_response_time_hours: number;
        lost_by_delay: number;
        opportunities_missed: number;
    };
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

const fmt = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v);
const fmtHours = (h: number) => h >= 24 ? `${Math.round(h / 24)}d` : h >= 1 ? `${Math.round(h)}h` : `${Math.round(h * 60)}min`;
const pct = (a: number, total: number) => total === 0 ? 0 : Math.round((a / total) * 100);

const TEMP_COLORS = { quente: '#f97316', morno: '#eab308', frio: '#3b82f6' };
const URGENCY_CONFIG = {
    now: { label: 'Agir Agora', icon: Flame, color: 'text-orange-400', bg: 'bg-orange-500/10', border: 'border-orange-500/30', dot: 'bg-orange-500', glow: 'shadow-orange-500/20' },
    today: { label: 'Agir Hoje', icon: AlertTriangle, color: 'text-yellow-400', bg: 'bg-yellow-500/10', border: 'border-yellow-500/30', dot: 'bg-yellow-500', glow: 'shadow-yellow-500/20' },
    at_risk: { label: 'Em Risco', icon: Timer, color: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/30', dot: 'bg-red-500', glow: 'shadow-red-500/20' },
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
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [token, ...deps]);
    return { data, loading };
};

// ─── Sub-components ────────────────────────────────────────────────────────────

function Skeleton({ className = '' }: { className?: string }) {
    return <div className={`animate-pulse bg-muted/40 rounded-lg ${className}`} />;
}

function SectionHeader({ icon: Icon, title, subtitle, color = 'text-primary' }: {
    icon: React.ElementType; title: string; subtitle: string; color?: string;
}) {
    return (
        <div className="flex items-center gap-3 mb-6">
            <div className="p-2.5 bg-surface border border-border rounded-xl">
                <Icon size={20} className={color} />
            </div>
            <div>
                <h2 className="text-base font-bold text-foreground">{title}</h2>
                <p className="text-xs text-muted-foreground">{subtitle}</p>
            </div>
        </div>
    );
}

function KPICard({
    icon: Icon, label, value, sub, loading, accent = 'orange', trend
}: {
    icon: React.ElementType; label: string; value: string; sub: string;
    loading: boolean; accent?: string; trend?: { value: number; label: string };
}) {
    const accentMap: Record<string, { ring: string; bg: string; text: string; glow: string }> = {
        orange: { ring: 'border-orange-500/20', bg: 'bg-orange-500/5', text: 'text-orange-400', glow: 'shadow-orange-500/10' },
        green: { ring: 'border-emerald-500/20', bg: 'bg-emerald-500/5', text: 'text-emerald-400', glow: 'shadow-emerald-500/10' },
        indigo: { ring: 'border-indigo-500/20', bg: 'bg-indigo-500/5', text: 'text-indigo-400', glow: 'shadow-indigo-500/10' },
        purple: { ring: 'border-purple-500/20', bg: 'bg-purple-500/5', text: 'text-purple-400', glow: 'shadow-purple-500/10' },
    };
    const c = accentMap[accent] || accentMap.orange;
    return (
        <div className={`relative group bg-background border ${c.ring} rounded-2xl p-5 shadow-lg ${c.glow} hover:shadow-xl transition-all duration-300 overflow-hidden`}>
            <div className={`absolute inset-0 ${c.bg} opacity-0 group-hover:opacity-100 transition-opacity duration-300`} />
            <div className="relative">
                <div className="flex items-start justify-between mb-4">
                    <div className={`p-2 ${c.bg} rounded-xl border ${c.ring}`}>
                        <Icon size={18} className={c.text} />
                    </div>
                    {trend && (
                        <span className={`text-xs font-bold flex items-center gap-1 ${trend.value >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                            <TrendingUp size={12} className={trend.value < 0 ? 'rotate-180' : ''} />
                            {Math.abs(trend.value)}%
                        </span>
                    )}
                </div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">{label}</p>
                {loading
                    ? <Skeleton className="h-8 w-24 mt-1" />
                    : <p className="text-3xl font-bold text-foreground tracking-tight">{value}</p>
                }
                <p className="text-xs text-muted-foreground mt-2">{sub}</p>
            </div>
        </div>
    );
}

const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: { value: number }[]; label?: string }) => {
    if (!active || !payload?.length) return null;
    return (
        <div className="bg-background border border-border rounded-xl px-3 py-2 shadow-2xl text-xs">
            <p className="font-semibold text-foreground">{label}</p>
            <p className="text-muted-foreground">{payload[0].value} atendimentos</p>
        </div>
    );
};

// ─── Main Component ────────────────────────────────────────────────────────────

export function RevenueMetrics() {
    const { user, token } = useAuth();
    const navigate = useNavigate();
    const [selectedDays, setSelectedDays] = useState(7);
    const [urgencyTab, setUrgencyTab] = useState<'now' | 'today' | 'at_risk'>('now');
    const [dismissedRecs, setDismissedRecs] = useState<string[]>([]);

    const { data: metrics, loading: metricsLoading } = useAPI<DashboardMetrics>(
        `/api/dashboard/metrics?days=${selectedDays}`, token, [selectedDays]
    );
    const { data: forecast, loading: forecastLoading } = useAPI<ForecastData>('/api/dashboard/forecast', token);
    const { data: velocity, loading: velocityLoading } = useAPI<VelocityStage[]>('/api/dashboard/velocity', token);
    const { data: urgency, loading: urgencyLoading } = useAPI<UrgencyData>('/api/dashboard/urgency', token);
    const { data: revIntel, loading: revIntelLoading } = useAPI<RevenueIntelligenceData>(
        `/api/dashboard/revenue-intelligence?days=${selectedDays}`, token, [selectedDays]
    );
    const { data: salesProfessor } = useAPI<SalesProfessorData>('/api/dashboard/sales-professor', token, [selectedDays]);

    const urgencyLeads = urgency ? urgency[urgencyTab] : [];
    const urgencyCounts = urgency ? { now: urgency.now.length, today: urgency.today.length, at_risk: urgency.at_risk.length } : { now: 0, today: 0, at_risk: 0 };

    const chartData = (metrics?.ai.chart ?? []).map(d => ({
        name: d.name, volume: d.volume > 0 ? d.volume : 0.1,
    }));

    const tempData = ['quente', 'morno', 'frio'].map(t => ({
        name: t === 'quente' ? 'Quente' : t === 'morno' ? 'Morno' : 'Frio',
        value: revIntel?.temperatures.find(x => x.name === t)?.value || 0,
        fill: TEMP_COLORS[t as keyof typeof TEMP_COLORS],
    }));
    const tempTotal = tempData.reduce((a, b) => a + b.value, 0);



    const recommendations = (() => {
        const items: Array<{ id: string; title: string; desc: string; type: 'warning' | 'info' | 'success' }> = [];
        const professorErrors = salesProfessor?.errors || [];
        const professorSummary = salesProfessor?.summary;

        if (professorSummary?.ignored_hot_leads) {
            items.push({
                id: 'prof-hot-ignored',
                type: 'warning',
                title: 'Leads quentes ignorados',
                desc: `${professorSummary.ignored_hot_leads} lead(s) quente(s) sem contato recente. Priorize retorno agora.`,
            });
        }
        if (professorSummary?.avg_response_time_hours && professorSummary.avg_response_time_hours > 1) {
            items.push({
                id: 'prof-response-time',
                type: 'warning',
                title: 'Tempo médio de resposta elevado',
                desc: `A equipe está levando ${fmtHours(professorSummary.avg_response_time_hours)} em média após handoff humano.`,
            });
        }
        professorErrors.slice(0, 2).forEach((e) => {
            items.push({
                id: `prof-${e.id}`,
                type: 'info',
                title: e.title,
                desc: e.description,
            });
        });

        if (velocity) {
            const bottleneck = velocity.reduce((prev, curr) =>
                (curr.count > prev.count && curr.avg_hours_idle > 24) ? curr : prev, velocity[0]);
            if (bottleneck?.count > 0 && bottleneck?.avg_hours_idle > 24) {
                items.push({
                    id: `bot-${bottleneck.stage}`, type: 'warning',
                    title: `Gargalo em "${bottleneck.stage}"`,
                    desc: `${bottleneck.count} leads parados por ${fmtHours(bottleneck.avg_hours_idle)}. Priorize contato hoje.`,
                });
            }
        }
        if (forecast?.hot_value && forecast.hot_value > 0) {
            items.push({
                id: 'hot-leads', type: 'info',
                title: 'Oportunidades Quentes',
                desc: `${fmt(forecast.hot_value)} em negócios quase prontos para fechar. Envie a proposta final.`,
            });
        }
        if (items.length === 0) {
            items.push({ id: 'all-good', type: 'success', title: 'Funil Saudável', desc: 'Nenhum gargalo crítico detectado no momento.' });
        }
        return items.filter(r => !dismissedRecs.includes(r.id));
    })();

    const recColors = { warning: { bg: 'bg-amber-500/5 border-amber-500/20', icon: 'text-amber-400', dot: 'bg-amber-400' }, info: { bg: 'bg-indigo-500/5 border-indigo-500/20', icon: 'text-indigo-400', dot: 'bg-indigo-400' }, success: { bg: 'bg-emerald-500/5 border-emerald-500/20', icon: 'text-emerald-400', dot: 'bg-emerald-400' } };

    // Score distribution for radial display
    const scoreRanges = revIntel?.distribution || [];

    return (
        <div className="min-h-screen">
            <div className="max-w-screen-2xl mx-auto px-6 py-8 space-y-10">

                {/* ══ HEADER ═══════════════════════════════════════════════════ */}
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <div>
                        <div className="flex items-center gap-2 mb-1">
                            <div className="w-2 h-2 bg-primary rounded-full animate-pulse" />
                            <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Ao vivo</span>
                        </div>
                        <h1 className="text-2xl font-bold text-foreground">Métricas de Receita</h1>
                        <p className="text-sm text-muted-foreground mt-0.5">
                            Olá, <span className="font-semibold text-foreground">{user?.name?.split(' ')[0] || 'Gestor'}</span> — aqui está o seu centro de inteligência comercial.
                        </p>
                    </div>
                    <select
                        value={selectedDays}
                        onChange={e => setSelectedDays(Number(e.target.value))}
                        className="bg-background border border-border text-foreground text-sm rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-primary/40 cursor-pointer font-medium shadow-sm hover:border-primary/40 transition-colors min-w-[160px]"
                    >
                        <option value={7}>Últimos 7 dias</option>
                        <option value={15}>Últimos 15 dias</option>
                        <option value={30}>Últimos 30 dias</option>
                        <option value={90}>Últimos 90 dias</option>
                    </select>
                </div>

                {/* ══ SECTION 1 — REVENUE OVERVIEW ═════════════════════════════ */}
                <section>
                    <SectionHeader
                        icon={DollarSign}
                        title="Visão Geral da Receita"
                        subtitle="Potencial financeiro do seu pipeline em tempo real"
                        color="text-orange-400"
                    />
                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                        <KPICard
                            icon={Target} label="Potenciais Negócios" accent="orange"
                            value={fmt(metrics?.pipeline.total_value || 0)}
                            sub={`${metrics?.pipeline.total_leads || 0} leads no funil`}
                            loading={metricsLoading}
                        />
                        <KPICard
                            icon={CheckCircle} label="Negócios Fechados" accent="green"
                            value={fmt(metrics?.pipeline.won_value || 0)}
                            sub={`${metrics?.pipeline.won_count || 0} oportunidades ganhas`}
                            loading={metricsLoading}
                        />
                        <KPICard
                            icon={Zap} label="Oportunidades Criadas" accent="indigo"
                            value={String(revIntel?.opportunities.month || 0)}
                            sub={`${revIntel?.opportunities.week || 0} esta semana · ${revIntel?.opportunities.today || 0} hoje`}
                            loading={revIntelLoading}
                        />
                        <KPICard
                            icon={TrendingUp} label="Previsão de Receita" accent="purple"
                            value={fmt(forecast?.projected || 0)}
                            sub={`Pipeline: ${fmt(forecast?.pipeline_total || 0)}`}
                            loading={forecastLoading}
                        />
                    </div>
                </section>

                {/* ══ SECTION 2 — PIPELINE HEALTH ══════════════════════════════ */}
                <section>
                    <SectionHeader
                        icon={BarChart3}
                        title="Saúde do Funil de Vendas"
                        subtitle="Qualidade e distribuição das oportunidades por temperatura e score"
                        color="text-indigo-400"
                    />
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">

                        {/* Temperature Distribution */}
                        <div className="bg-background border border-border rounded-2xl p-5 col-span-1">
                            <div className="flex items-center gap-2 mb-5">
                                <Flame size={15} className="text-orange-400" />
                                <span className="text-sm font-semibold text-foreground">Temperatura dos Leads</span>
                            </div>
                            {revIntelLoading ? <Skeleton className="h-48" /> : tempTotal === 0 ? (
                                <div className="h-48 flex items-center justify-center text-xs text-muted-foreground">Sem dados ainda</div>
                            ) : (
                                <div className="space-y-4">
                                    <div className="h-36 flex items-center justify-center">
                                        <PieChart width={140} height={140}>
                                            <Pie
                                                data={tempData} cx={65} cy={65}
                                                innerRadius={40} outerRadius={65}
                                                paddingAngle={3} dataKey="value"
                                                animationBegin={0} animationDuration={800}
                                            >
                                                {tempData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                                            </Pie>
                                            <Tooltip
                                                content={({ active, payload }) => active && payload?.[0] ? (
                                                    <div className="bg-background border border-border rounded-xl px-3 py-2 text-xs shadow-xl">
                                                        <p className="font-bold text-foreground">{payload[0].name}</p>
                                                        <p className="text-muted-foreground">{payload[0].value} leads · {pct(payload[0].value as number, tempTotal)}%</p>
                                                    </div>
                                                ) : null}
                                            />
                                        </PieChart>
                                    </div>
                                    <div className="space-y-2">
                                        {tempData.map(t => (
                                            <div key={t.name} className="flex items-center gap-3">
                                                <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: t.fill }} />
                                                <span className="text-xs text-muted-foreground w-14">{t.name}</span>
                                                <div className="flex-1 h-1.5 bg-muted/30 rounded-full overflow-hidden">
                                                    <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct(t.value, tempTotal)}%`, backgroundColor: t.fill }} />
                                                </div>
                                                <span className="text-xs font-bold text-foreground w-8 text-right">{pct(t.value, tempTotal)}%</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Score Distribution */}
                        <div className="bg-background border border-border rounded-2xl p-5 col-span-1">
                            <div className="flex items-center gap-2 mb-5">
                                <Activity size={15} className="text-indigo-400" />
                                <span className="text-sm font-semibold text-foreground">Distribuição de Score</span>
                            </div>
                            {revIntelLoading ? <Skeleton className="h-48" /> : scoreRanges.length === 0 ? (
                                <div className="h-48 flex items-center justify-center text-xs text-muted-foreground">Sem dados ainda</div>
                            ) : (
                                <ResponsiveContainer width="100%" height={180}>
                                    <BarChart data={scoreRanges} barSize={24} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-border/30" vertical={false} />
                                        <XAxis dataKey="range" tick={{ fontSize: 10, fill: 'currentColor' }} className="text-muted-foreground" tickLine={false} axisLine={false} />
                                        <YAxis tick={{ fontSize: 10, fill: 'currentColor' }} className="text-muted-foreground" tickLine={false} axisLine={false} />
                                        <Tooltip content={({ active, payload }) => active && payload?.[0] ? (
                                            <div className="bg-background border border-border rounded-xl px-3 py-2 text-xs shadow-xl">
                                                <p className="font-bold text-foreground">Score {payload[0].payload?.range}</p>
                                                <p className="text-muted-foreground">{payload[0].value} leads</p>
                                            </div>
                                        ) : null} />
                                        <Bar dataKey="count" radius={[6, 6, 0, 0]} animationBegin={0} animationDuration={800}>
                                            {scoreRanges.map((_, i) => {
                                                const colors = ['#6366f1', '#818cf8', '#a5b4fc', '#c7d2fe', '#e0e7ff'];
                                                return <Cell key={i} fill={colors[i % colors.length]} />;
                                            })}
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                            )}
                        </div>

                        {/* Funnel Conversion by Stage */}
                        <div className="bg-background border border-border rounded-2xl p-5 col-span-1">
                            <div className="flex items-center gap-2 mb-5">
                                <Target size={15} className="text-emerald-400" />
                                <span className="text-sm font-semibold text-foreground">Conversão por Etapa</span>
                            </div>
                            {forecastLoading ? <Skeleton className="h-48" /> : !forecast?.by_stage?.length ? (
                                <div className="h-48 flex items-center justify-center text-xs text-muted-foreground">Sem dados ainda</div>
                            ) : (
                                <div className="space-y-2.5">
                                    {forecast.by_stage.slice(0, 5).map((s, i) => {
                                        const total = forecast.by_stage.reduce((a, b) => a + b.count, 0) || 1;
                                        const w = pct(s.count, total);
                                        const hue = 160 - i * 20;
                                        return (
                                            <div key={s.stage} className="group">
                                                <div className="flex justify-between text-xs mb-1">
                                                    <span className="text-muted-foreground truncate max-w-[120px]" title={s.stage}>{s.stage}</span>
                                                    <span className="font-bold text-foreground">{s.count}</span>
                                                </div>
                                                <div className="h-2 bg-muted/30 rounded-full overflow-hidden">
                                                    <div
                                                        className="h-full rounded-full transition-all duration-700"
                                                        style={{ width: `${w}%`, backgroundColor: `hsl(${hue}, 65%, 55%)` }}
                                                    />
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        {/* Conversion by Temperature */}
                        <div className="bg-background border border-border rounded-2xl p-5 col-span-1">
                            <div className="flex items-center gap-2 mb-5">
                                <Flame size={15} className="text-yellow-400" />
                                <span className="text-sm font-semibold text-foreground">Conversão por Temperatura</span>
                            </div>
                            {revIntelLoading ? <Skeleton className="h-48" /> : !revIntel?.conversion_rates?.length ? (
                                <div className="h-48 flex items-center justify-center text-xs text-muted-foreground">Sem dados ainda</div>
                            ) : (
                                <div>
                                    <ResponsiveContainer width="100%" height={160}>
                                        <RadialBarChart cx="50%" cy="50%" innerRadius="25%" outerRadius="100%"
                                            data={revIntel.conversion_rates.map((c, i) => ({
                                                name: c.range, value: c.rate,
                                                fill: ['#f97316', '#eab308', '#3b82f6', '#10b981'][i % 4]
                                            }))}
                                            startAngle={180} endAngle={0}>
                                            <RadialBar dataKey="value" background={{ fill: 'transparent' }} animationBegin={0} />
                                            <Tooltip content={({ active, payload }) => active && payload?.[0] ? (
                                                <div className="bg-background border border-border rounded-xl px-3 py-2 text-xs shadow-xl">
                                                    <p className="font-bold text-foreground">{payload[0].payload?.name}</p>
                                                    <p className="text-muted-foreground">{payload[0].value}% conversão</p>
                                                </div>
                                            ) : null} />
                                        </RadialBarChart>
                                    </ResponsiveContainer>
                                    <div className="flex flex-wrap gap-2 mt-2 justify-center">
                                        {revIntel.conversion_rates.slice(0, 4).map((c, i) => {
                                            const clrs = ['text-orange-400', 'text-yellow-400', 'text-blue-400', 'text-emerald-400'];
                                            return (
                                                <span key={i} className={`text-[10px] font-bold ${clrs[i % 4]}`}>
                                                    {c.range}: {c.rate}%
                                                </span>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </section>

                {/* ══ SECTION 3 — SALES PERFORMANCE ════════════════════════════ */}
                <section>
                    <SectionHeader
                        icon={Activity}
                        title="Desempenho de Vendas"
                        subtitle="Eficiência operacional do processo de vendas"
                        color="text-emerald-400"
                    />
                    <div className="grid grid-cols-1 xl:grid-cols-5 gap-4">

                        {/* AI Volume Chart — spans all cols */}
                        <div className="xl:col-span-5 bg-background border border-border rounded-2xl p-5">
                            <div className="flex items-center justify-between mb-5">
                                <div className="flex items-center gap-2">
                                    <MessageSquare size={15} className="text-emerald-400" />
                                    <span className="text-sm font-semibold text-foreground">Volume de Atendimentos da IA</span>
                                </div>
                                <span className="text-xs text-muted-foreground">Últimos {selectedDays} dias</span>
                            </div>
                            {metricsLoading ? <Skeleton className="h-52" /> : chartData.length === 0 ? (
                                <div className="h-52 flex items-center justify-center text-xs text-muted-foreground">Sem dados ainda</div>
                            ) : (
                                <ResponsiveContainer width="100%" height={200}>
                                    <AreaChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                                        <defs>
                                            <linearGradient id="aiGrad" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="#10b981" stopOpacity={0.25} />
                                                <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                                            </linearGradient>
                                        </defs>
                                        <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-border/20" vertical={false} />
                                        <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'currentColor' }} className="text-muted-foreground" tickLine={false} axisLine={false} />
                                        <YAxis tick={{ fontSize: 10, fill: 'currentColor' }} className="text-muted-foreground" tickLine={false} axisLine={false} />
                                        <Tooltip content={<CustomTooltip />} />
                                        <Area type="monotone" dataKey="volume" stroke="#10b981" strokeWidth={2} fill="url(#aiGrad)" dot={false} activeDot={{ r: 4, fill: '#10b981' }} animationDuration={800} />
                                    </AreaChart>
                                </ResponsiveContainer>
                            )}
                            {!metricsLoading && (
                                <div className="mt-4 grid grid-cols-3 gap-3 pt-4 border-t border-border/40">
                                    {[
                                        { label: 'Total Mensagens', value: metrics?.ai.total_messages || 0, icon: MessageSquare },
                                        { label: 'Chats Ativos', value: metrics?.ai.active_chats || 0, icon: Activity },
                                        { label: 'Horas Economizadas', value: `${metrics?.ai.saved_hours || 0}h`, icon: Clock },
                                    ].map(({ label, value, icon: Ic }) => (
                                        <div key={label} className="text-center">
                                            <div className="flex justify-center mb-1">
                                                <Ic size={14} className="text-muted-foreground/60" />
                                            </div>
                                            <p className="text-base font-bold text-foreground">{value}</p>
                                            <p className="text-[10px] text-muted-foreground uppercase tracking-wide mt-0.5">{label}</p>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </section>

                {/* ══ SECTION 4 — ACTIONABLE INTELLIGENCE ══════════════════════ */}
                <section>
                    <SectionHeader
                        icon={BrainCircuit}
                        title="Inteligência Do Negócio"
                        subtitle="Leads que precisam de ação agora e insights gerados pela IA"
                        color="text-orange-400"
                    />
                    <div className="grid grid-cols-1 xl:grid-cols-5 gap-4">

                        {/* Lead Heat Map — spans 3 cols */}
                        <div className="xl:col-span-3 bg-background border border-border rounded-2xl p-5">
                            <div className="flex items-center justify-between mb-4">
                                <div className="flex items-center gap-2">
                                    <Flame size={15} className="text-orange-400" />
                                    <span className="text-sm font-semibold text-foreground">Ações Necessárias</span>
                                </div>
                            </div>

                            {/* Tabs */}
                            <div className="flex gap-2 mb-4">
                                {(['now', 'today', 'at_risk'] as const).map(tab => {
                                    const cfg = URGENCY_CONFIG[tab];
                                    const Icon = cfg.icon;
                                    const count = urgencyCounts[tab];
                                    return (
                                        <button
                                            key={tab}
                                            onClick={() => setUrgencyTab(tab)}
                                            className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold transition-all border ${urgencyTab === tab ? `${cfg.bg} ${cfg.border} ${cfg.color}` : 'border-transparent text-muted-foreground hover:text-foreground'}`}
                                        >
                                            <Icon size={12} />
                                            {cfg.label}
                                            {count > 0 && <span className={`w-4 h-4 rounded-full ${cfg.dot} flex items-center justify-center text-[9px] text-white font-black`}>{count}</span>}
                                        </button>
                                    );
                                })}
                            </div>

                            {/* Lead List */}
                            {urgencyLoading ? <Skeleton className="h-64" /> : urgencyLeads.length === 0 ? (
                                <div className="h-48 flex flex-col items-center justify-center gap-2 text-center">
                                    <div className="w-10 h-10 bg-muted/20 rounded-full flex items-center justify-center">
                                        <CheckCircle size={20} className="text-emerald-400" />
                                    </div>
                                    <p className="text-sm font-medium text-foreground">Nenhum lead nesta categoria</p>
                                    <p className="text-xs text-muted-foreground">Ótimo! Não há leads exigindo ação urgente aqui.</p>
                                </div>
                            ) : (
                                <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                                    {urgencyLeads.map(lead => {
                                        const cfg = URGENCY_CONFIG[urgencyTab];
                                        const tempColor = lead.intentLabel === 'HOT' ? 'text-orange-400 bg-orange-500/10' : lead.intentLabel === 'WARM' ? 'text-yellow-400 bg-yellow-500/10' : 'text-blue-400 bg-blue-500/10';
                                        return (
                                            <div key={lead.id} className="flex items-center gap-3 p-3 bg-muted/10 hover:bg-muted/20 rounded-xl border border-border/30 hover:border-border/60 transition-all group cursor-pointer">
                                                <div className={`w-2 h-2 rounded-full shrink-0 ${cfg.dot} animate-pulse`} />
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2">
                                                        <p className="text-sm font-semibold text-foreground truncate">{lead.name}</p>
                                                        <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-full ${tempColor}`}>{lead.intentLabel}</span>
                                                    </div>
                                                    <p className="text-[10px] text-muted-foreground mt-0.5">
                                                        {fmtHours(lead.hours_idle)} sem contato · Score {lead.score}
                                                    </p>
                                                </div>
                                                <div className="text-right shrink-0">
                                                    <p className="text-xs font-bold text-foreground">{fmt(lead.value)}</p>
                                                </div>
                                                <button
                                                    onClick={() => navigate('/crm')}
                                                    className="opacity-0 group-hover:opacity-100 transition-opacity ml-1"
                                                >
                                                    <ArrowRight size={14} className="text-primary" />
                                                </button>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}

                            {/* Action Buttons */}
                            <div className="flex gap-2 mt-4 pt-4 border-t border-border/40">
                                <button
                                    onClick={() => navigate('/crm')}
                                    className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-primary/10 hover:bg-primary/20 text-primary border border-primary/30 rounded-xl text-xs font-bold transition-all"
                                >
                                    <BarChart3 size={13} /> Ver Pipeline
                                </button>
                                <button
                                    onClick={() => setUrgencyTab('now')}
                                    className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-orange-500 hover:bg-orange-600 text-white rounded-xl text-xs font-bold transition-all shadow-lg shadow-orange-500/20"
                                >
                                    <Flame size={13} /> Agir Agora
                                </button>
                                <button
                                    onClick={() => setUrgencyTab('today')}
                                    className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-yellow-500/10 hover:bg-yellow-500/20 text-yellow-500 border border-yellow-500/30 rounded-xl text-xs font-bold transition-all"
                                >
                                    <AlertTriangle size={13} /> Agir Hoje
                                </button>
                            </div>
                        </div>

                        {/* AI Recommendations + Bottleneck — spans 2 cols */}
                        <div className="xl:col-span-2 space-y-4">
                            {/* Recommendations */}
                            <div className="bg-background border border-border rounded-2xl p-5 h-fit">
                                <div className="flex items-center gap-2 mb-4">
                                    <Sparkles size={15} className="text-indigo-400" />
                                    <span className="text-sm font-semibold text-foreground">IA Professor de Vendas</span>
                                </div>
                                <div className="space-y-3">
                                    {recommendations.map(r => {
                                        const rc = recColors[r.type];
                                        return (
                                            <div key={r.id} className={`relative p-3.5 border rounded-xl ${rc.bg}`}>
                                                <button
                                                    onClick={() => setDismissedRecs(prev => [...prev, r.id])}
                                                    className="absolute top-2.5 right-2.5 text-muted-foreground hover:text-foreground transition-colors"
                                                >
                                                    <X size={12} />
                                                </button>
                                                <div className="flex items-start gap-2 pr-4">
                                                    <div className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${rc.dot}`} />
                                                    <div>
                                                        <p className="text-xs font-bold text-foreground">{r.title}</p>
                                                        <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">{r.desc}</p>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Bottleneck Detection */}
                            <div className="bg-background border border-border rounded-2xl p-5">
                                <div className="flex items-center gap-2 mb-4">
                                    <AlertTriangle size={15} className="text-amber-400" />
                                    <span className="text-sm font-semibold text-foreground">Detecção de Gargalos</span>
                                </div>
                                {velocityLoading ? <Skeleton className="h-32" /> : !velocity?.length ? (
                                    <div className="h-24 flex items-center justify-center text-xs text-muted-foreground">Sem dados</div>
                                ) : (
                                    <div className="space-y-2">
                                        {velocity
                                            .filter(s => s.avg_hours_idle > 24)
                                            .sort((a, b) => b.avg_hours_idle - a.avg_hours_idle)
                                            .slice(0, 4)
                                            .map(s => {
                                                const severity = s.avg_hours_idle > 72 ? 'text-red-400 bg-red-500/10 border-red-500/20' : 'text-amber-400 bg-amber-500/10 border-amber-500/20';
                                                return (
                                                    <div key={s.stage} className={`flex items-center justify-between p-2.5 rounded-xl border ${severity}`}>
                                                        <div className="flex items-center gap-2 min-w-0">
                                                            <Timer size={12} />
                                                            <span className="text-xs font-medium truncate">{s.stage}</span>
                                                        </div>
                                                        <div className="text-right shrink-0 ml-2">
                                                            <p className="text-xs font-bold">{fmtHours(s.avg_hours_idle)}</p>
                                                            <p className="text-[9px] opacity-70">{s.count} leads</p>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        {velocity.filter(s => s.avg_hours_idle > 24).length === 0 && (
                                            <div className="flex items-center gap-2 p-3 bg-emerald-500/5 border border-emerald-500/20 rounded-xl">
                                                <CheckCircle size={14} className="text-emerald-400" />
                                                <span className="text-xs text-emerald-400 font-medium">Nenhum gargalo detectado</span>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </section>
            </div>
        </div>
    );
}
