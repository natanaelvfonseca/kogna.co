import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
    AlertCircle,
    ArrowLeft,
    BarChart3,
    CalendarClock,
    ChevronRight,
    LayoutGrid,
    Link2,
    Loader2,
    MessageSquare,
    PencilLine,
    PhoneCall,
    RefreshCcw,
    ShieldAlert,
    Sparkles,
    Target,
    Unplug,
} from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useNotifications } from '../../context/NotificationContext';
import { API_URL } from '../../config/api';
import { SellerConnectionModal } from './components/SellerConnectionModal';
import { SellerFormModal } from './components/SellerFormModal';
import type { SellerConnection, SellerDetailResponse, SellerLeadRow, SellerSummary } from './types';

type RangeKey = 'today' | '7d' | '30d' | 'custom';
type LeadView = 'all' | 'waiting' | 'risk' | 'stale';

function formatPercent(value: number) {
    return `${Math.round((value || 0) * 100)}%`;
}

function formatMinutes(minutes: number) {
    if (!minutes) return 'Sem base';
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    return rest ? `${hours}h ${rest}min` : `${hours}h`;
}

function formatRelative(dateString: string | null) {
    if (!dateString) return 'Sem historico';
    const date = new Date(dateString);
    const diffMinutes = Math.max(0, Math.round((Date.now() - date.getTime()) / 60000));
    if (diffMinutes < 1) return 'Agora';
    if (diffMinutes < 60) return `${diffMinutes} min atras`;
    const diffHours = Math.round(diffMinutes / 60);
    if (diffHours < 24) return `${diffHours}h atras`;
    return `${Math.round(diffHours / 24)}d atras`;
}

function badgeByStatus(status: SellerSummary['status']) {
    if (status === 'online') return 'border-emerald-200/80 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-200';
    if (status === 'inactive') return 'border-rose-200/80 bg-rose-50 text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-200';
    return 'border-amber-200/80 bg-amber-50 text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-200';
}

function badgeBySeverity(level: 'good' | 'attention' | 'risk' | 'info' | 'warning' | 'critical') {
    if (level === 'risk' || level === 'critical') return 'border-rose-200/80 bg-rose-50 text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-200';
    if (level === 'attention' || level === 'warning') return 'border-amber-200/80 bg-amber-50 text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-200';
    return 'border-emerald-200/80 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-200';
}

function initials(name: string) {
    return name.split(' ').filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('');
}

export function SellerProfile() {
    const { id } = useParams();
    const navigate = useNavigate();
    const { token } = useAuth();
    const { showToast } = useNotifications();
    const leadsRef = useRef<HTMLDivElement | null>(null);
    const [loading, setLoading] = useState(true);
    const [detail, setDetail] = useState<SellerDetailResponse | null>(null);
    const [range, setRange] = useState<RangeKey>('7d');
    const [customFrom, setCustomFrom] = useState('');
    const [customTo, setCustomTo] = useState('');
    const [leadView, setLeadView] = useState<LeadView>('all');
    const [columnOrder, setColumnOrder] = useState<string[]>([]);
    const [showEditModal, setShowEditModal] = useState(false);
    const [showLinkModal, setShowLinkModal] = useState(false);

    useEffect(() => {
        if (!token) return;
        fetch(`${API_URL}/settings/columns`, { headers: { Authorization: `Bearer ${token}` } })
            .then((response) => response.ok ? response.json() : [])
            .then((data) => setColumnOrder(Array.isArray(data) ? data.map((column) => column.title) : []))
            .catch(() => setColumnOrder([]));
    }, [token]);

    useEffect(() => {
        fetchDetail();
    }, [id, token, range]);

    async function fetchDetail() {
        if (!id || !token) return;
        setLoading(true);
        try {
            const params = new URLSearchParams({ range });
            if (range === 'custom' && customFrom && customTo) {
                params.set('from', customFrom);
                params.set('to', customTo);
            }
            const response = await fetch(`${API_URL}/sellers/${id}?${params.toString()}`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (!response.ok) throw new Error('Nao foi possivel carregar o perfil do vendedor.');
            setDetail(await response.json());
        } catch (error) {
            showToast('Erro ao carregar vendedor', error instanceof Error ? error.message : 'Falha inesperada.', 'error');
        } finally {
            setLoading(false);
        }
    }

    function openConversations() {
        if (!detail) return;
        const targetConnection = detail?.seller.primaryConnection || detail?.seller.connections[0];
        if (!targetConnection?.instanceName) {
            showToast('Sem conexao principal', 'Defina uma linha principal para abrir o Live Chat filtrado por vendedor.', 'warning');
            return;
        }
        navigate(`/live-chat?sellerId=${detail.seller.id}&instance=${encodeURIComponent(targetConnection.instanceName)}`);
    }

    function openConversation(instanceName: string | null, remoteJid: string) {
        if (!instanceName) {
            showToast('Conversa sem linha', 'Nao foi possivel identificar a linha desta conversa.', 'warning');
            return;
        }
        navigate(`/live-chat?sellerId=${detail?.seller.id || ''}&instance=${encodeURIComponent(instanceName)}&jid=${encodeURIComponent(remoteJid)}`);
    }

    async function makePrimary(connectionId: string) {
        if (!id || !token) return;
        const response = await fetch(`${API_URL}/sellers/${id}/connections`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ connectionId, isPrimary: true }),
        });
        if (!response.ok) {
            showToast('Erro ao atualizar conexao', 'Nao foi possivel definir a conexao principal.', 'error');
            return;
        }
        showToast('Conexao principal atualizada', 'A linha selecionada agora lidera o contexto operacional.', 'success');
        fetchDetail();
    }

    async function unlinkConnection(connection: SellerConnection) {
        if (!id || !token) return;
        if (!window.confirm(`Desvincular ${connection.instanceName || 'esta conexao'} deste vendedor?`)) return;
        const response = await fetch(`${API_URL}/sellers/${id}/connections/${connection.connectionId}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok) {
            showToast('Erro ao desvincular', 'Nao foi possivel remover a conexao.', 'error');
            return;
        }
        showToast('Conexao removida', 'A linha foi desvinculada do vendedor.', 'success');
        fetchDetail();
    }

    function applyLeadView(next: LeadView) {
        setLeadView(next);
        leadsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    if (loading || !detail) {
        return (
            <div className="flex min-h-[60vh] items-center justify-center px-4">
                <div className="flex w-full max-w-sm flex-col items-center rounded-[28px] border border-black/[0.06] bg-white/80 px-6 py-10 text-center shadow-[0_18px_60px_rgba(15,23,42,0.08)] dark:border-white/[0.08] dark:bg-[#111111] dark:shadow-[0_24px_80px_rgba(0,0,0,0.45)]">
                    <div className="flex h-16 w-16 items-center justify-center rounded-[22px] bg-gradient-primary text-white shadow-[0_18px_40px_rgba(245,121,59,0.28)]">
                        <Loader2 size={28} className="animate-spin" />
                    </div>
                    <h2 className="mt-6 text-2xl font-display font-bold tracking-tight text-text-primary">Carregando perfil comercial</h2>
                    <p className="mt-2 text-sm leading-7 text-text-secondary">Estamos reunindo metricas, gargalos e conversas do vendedor.</p>
                </div>
            </div>
        );
    }

    const orderedFunnel = orderFunnel(detail.funnel, columnOrder);
    const leadRows = filterLeadRows(detail.leads, leadView);

    return (
        <>
            <div className="relative mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
                <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[360px] overflow-hidden">
                    <div className="absolute left-[-8%] top-12 h-56 w-56 rounded-full bg-primary/[0.16] blur-3xl dark:bg-primary/[0.12]" />
                    <div className="absolute right-[6%] top-0 h-64 w-64 rounded-full bg-orange-300/20 blur-3xl dark:bg-orange-500/10" />
                </div>

                <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                    <button onClick={() => navigate('/vendedores')} className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-black/[0.07] bg-white px-4 text-sm font-semibold text-text-primary shadow-[0_10px_24px_rgba(15,23,42,0.06)] transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/30 hover:text-primary dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-white">
                        <ArrowLeft size={16} /> Voltar para o time
                    </button>
                    <div className="flex flex-wrap gap-2">
                        {(['today', '7d', '30d', 'custom'] as RangeKey[]).map((item) => (
                            <button key={item} onClick={() => setRange(item)} className={`inline-flex h-11 items-center justify-center rounded-2xl border px-4 text-sm font-semibold transition-all ${range === item ? 'border-primary/20 bg-primary/10 text-primary' : 'border-black/[0.07] bg-white text-text-secondary hover:border-primary/20 hover:text-text-primary dark:border-white/[0.08] dark:bg-white/[0.04]'}`}>
                                {item === 'today' ? 'Hoje' : item === '7d' ? '7 dias' : item === '30d' ? '30 dias' : 'Personalizado'}
                            </button>
                        ))}
                    </div>
                </div>

                {range === 'custom' && (
                    <div className="mb-6 flex flex-wrap items-end gap-3 rounded-[28px] border border-black/[0.06] bg-white/[0.88] p-5 shadow-[0_16px_40px_rgba(15,23,42,0.05)] dark:border-white/[0.08] dark:bg-[#111111]">
                        <label className="text-sm">
                            <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">De</span>
                            <input type="date" value={customFrom} onChange={(event) => setCustomFrom(event.target.value)} className="h-11 rounded-2xl border border-black/[0.07] bg-white px-4 text-sm text-text-primary outline-none transition-all focus:border-primary/35 focus:ring-4 focus:ring-primary/10 dark:border-white/[0.08] dark:bg-white/[0.04]" />
                        </label>
                        <label className="text-sm">
                            <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">Ate</span>
                            <input type="date" value={customTo} onChange={(event) => setCustomTo(event.target.value)} className="h-11 rounded-2xl border border-black/[0.07] bg-white px-4 text-sm text-text-primary outline-none transition-all focus:border-primary/35 focus:ring-4 focus:ring-primary/10 dark:border-white/[0.08] dark:bg-white/[0.04]" />
                        </label>
                        <button onClick={() => fetchDetail()} className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-gradient-primary px-5 text-sm font-semibold text-white shadow-[0_18px_40px_rgba(245,121,59,0.34)] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_22px_45px_rgba(245,121,59,0.4)]">
                            <RefreshCcw size={16} /> Aplicar periodo
                        </button>
                    </div>
                )}

                <section className="overflow-hidden rounded-[32px] border border-black/[0.06] bg-white/[0.88] p-6 shadow-[0_18px_60px_rgba(15,23,42,0.08)] backdrop-blur-xl dark:border-white/[0.08] dark:bg-[#111111] dark:shadow-[0_24px_80px_rgba(0,0,0,0.45)] sm:p-8">
                    <div className="flex flex-col gap-8 xl:flex-row xl:items-start xl:justify-between">
                        <div className="flex min-w-0 items-start gap-5">
                            {detail.seller.avatarUrl ? (
                                <img
                                    src={detail.seller.avatarUrl}
                                    alt={detail.seller.name}
                                    className="h-20 w-20 shrink-0 rounded-[28px] object-cover shadow-[0_16px_40px_rgba(15,23,42,0.14)]"
                                />
                            ) : (
                                <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-[28px] bg-primary/10 text-3xl font-bold text-primary">
                                    {initials(detail.seller.name)}
                                </div>
                            )}
                            <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                    <span className="inline-flex rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-primary">Perfil comercial</span>
                                    <span className={`inline-flex rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] ${badgeByStatus(detail.seller.status)}`}>{detail.seller.status}</span>
                                    <span className={`inline-flex rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] ${badgeBySeverity(detail.executiveSummary.level)}`}>{detail.executiveSummary.label}</span>
                                </div>
                                <h1 className="mt-4 text-4xl font-display font-bold tracking-[-0.04em] text-text-primary sm:text-5xl">{detail.seller.name}</h1>
                                <p className="mt-3 max-w-2xl text-base leading-7 text-text-secondary sm:text-lg">{detail.executiveSummary.description}</p>
                                <div className="mt-5 flex flex-wrap gap-3 text-sm text-text-secondary">
                                    <span>{detail.seller.role || 'Cargo nao definido'}</span>
                                    <span>{detail.seller.phoneNumber || 'Telefone nao informado'}</span>
                                    <span>{detail.seller.email || 'Email nao informado'}</span>
                                    <span>{detail.seller.primaryConnection?.instanceName || 'Sem conexao principal'}</span>
                                </div>
                            </div>
                        </div>

                        <div className="flex flex-wrap gap-3">
                            <button onClick={() => setShowEditModal(true)} className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl border border-black/[0.08] bg-white px-4 text-sm font-semibold text-text-primary shadow-[0_10px_24px_rgba(15,23,42,0.06)] transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/30 hover:text-primary dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-white">
                                <PencilLine size={16} /> Editar
                            </button>
                            <button onClick={openConversations} className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl border border-black/[0.08] bg-white px-4 text-sm font-semibold text-text-primary shadow-[0_10px_24px_rgba(15,23,42,0.06)] transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/30 hover:text-primary dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-white">
                                <MessageSquare size={16} /> Abrir conversas
                            </button>
                            <button onClick={() => applyLeadView('risk')} className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-gradient-primary px-5 text-sm font-semibold text-white shadow-[0_18px_40px_rgba(245,121,59,0.34)] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_22px_45px_rgba(245,121,59,0.4)]">
                                <ShieldAlert size={16} /> Ver leads em risco
                            </button>
                        </div>
                    </div>

                    <div className="mt-8 grid gap-4 xl:grid-cols-[1.5fr,1fr]">
                        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                            <KpiCard label="Leads recebidos" value={detail.metrics.leadsReceived} icon={<BarChart3 size={16} />} />
                            <KpiCard label="Leads respondidos" value={detail.metrics.leadsResponded} icon={<PhoneCall size={16} />} />
                            <KpiCard label="Sem resposta" value={detail.metrics.unansweredLeads} highlight={detail.metrics.unansweredLeads > 0} icon={<AlertCircle size={16} />} />
                            <KpiCard label="Tempo medio" value={formatMinutes(detail.metrics.avgResponseTimeMinutes)} icon={<CalendarClock size={16} />} />
                            <KpiCard label="Taxa de resposta" value={formatPercent(detail.metrics.responseRate)} icon={<Target size={16} />} />
                            <KpiCard label="Taxa de conversao" value={formatPercent(detail.metrics.conversionRate)} icon={<Sparkles size={16} />} />
                            <KpiCard label="Follow-ups pendentes" value={detail.metrics.pendingFollowups} highlight={detail.metrics.pendingFollowups > 0} icon={<RefreshCcw size={16} />} />
                            <KpiCard label="Conversas ativas" value={detail.metrics.activeConversations} icon={<MessageSquare size={16} />} />
                        </div>

                        <div className="rounded-[28px] border border-black/[0.06] bg-[#F8F8FA] p-5 dark:border-white/[0.08] dark:bg-[#111214]">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-primary">Qualidade operacional</p>
                            <div className="mt-4 flex items-center justify-between gap-4">
                                <div>
                                    <p className="text-5xl font-display font-bold tracking-tight text-text-primary">{detail.metrics.qualityScore}</p>
                                    <p className="mt-1 text-sm text-text-secondary">Score de 0 a 100 baseado em resposta, follow-up, abandono e conversao.</p>
                                </div>
                                <div className="flex h-20 w-20 items-center justify-center rounded-full border-8 border-primary/15 bg-white text-xl font-bold text-primary dark:bg-[#171719]">{detail.metrics.qualityScore}</div>
                            </div>

                            <div className="mt-5 grid gap-4 sm:grid-cols-2">
                                <div>
                                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-text-muted">Pontos fortes</p>
                                    <div className="mt-3 space-y-2 text-sm leading-6 text-text-secondary">
                                        {detail.metrics.quality.strengths.length > 0 ? detail.metrics.quality.strengths.map((item) => (
                                            <div key={item} className="rounded-2xl border border-emerald-200/80 bg-emerald-50 px-3 py-2 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-200">{item}</div>
                                        )) : <p>Sem destaques positivos suficientes neste recorte.</p>}
                                    </div>
                                </div>
                                <div>
                                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-text-muted">Pontos criticos</p>
                                    <div className="mt-3 space-y-2 text-sm leading-6 text-text-secondary">
                                        {detail.metrics.quality.criticalPoints.length > 0 ? detail.metrics.quality.criticalPoints.map((item) => (
                                            <div key={item} className="rounded-2xl border border-rose-200/80 bg-rose-50 px-3 py-2 text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-200">{item}</div>
                                        )) : <p>Sem alertas criticos relevantes no periodo.</p>}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                <div className="mt-6 grid gap-6 xl:grid-cols-[1.2fr,0.8fr]">
                    <section className="rounded-[32px] border border-black/[0.06] bg-white/[0.9] p-6 shadow-[0_18px_60px_rgba(15,23,42,0.08)] dark:border-white/[0.08] dark:bg-[#111111]">
                        <div className="flex items-center justify-between gap-3">
                            <div>
                                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-primary">Funil individual</p>
                                <h2 className="mt-2 text-2xl font-display font-bold tracking-tight text-text-primary">Estagios do vendedor</h2>
                            </div>
                            <div className="rounded-2xl border border-primary/15 bg-primary/[0.08] p-2 text-primary"><LayoutGrid size={18} /></div>
                        </div>
                        <div className="mt-5 grid gap-4 md:grid-cols-3 xl:grid-cols-6">
                            {orderedFunnel.map((stage) => (
                                <div key={stage.stage} className="rounded-[24px] border border-black/[0.06] bg-[#F8F8FA] p-4 dark:border-white/[0.08] dark:bg-[#111214]">
                                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-text-muted">{stage.stage}</p>
                                    <p className="mt-2 text-3xl font-display font-bold tracking-tight text-text-primary">{stage.count}</p>
                                </div>
                            ))}
                        </div>
                    </section>

                    <section className="rounded-[32px] border border-black/[0.06] bg-white/[0.9] p-6 shadow-[0_18px_60px_rgba(15,23,42,0.08)] dark:border-white/[0.08] dark:bg-[#111111]">
                        <div className="flex items-center justify-between gap-3">
                            <div>
                                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-primary">Gargalos</p>
                                <h2 className="mt-2 text-2xl font-display font-bold tracking-tight text-text-primary">Itens acionaveis</h2>
                            </div>
                            <div className="rounded-2xl border border-primary/15 bg-primary/[0.08] p-2 text-primary"><ShieldAlert size={18} /></div>
                        </div>
                        <div className="mt-5 space-y-3">
                            {detail.bottlenecks.length > 0 ? detail.bottlenecks.map((item) => (
                                <button key={item.id} onClick={() => applyLeadView(item.action.includes('stale') ? 'stale' : item.action.includes('waiting') || item.action.includes('unanswered') ? 'waiting' : 'risk')} className="flex w-full items-center justify-between rounded-[24px] border border-black/[0.06] bg-[#F8F8FA] px-4 py-4 text-left transition-all hover:border-primary/20 hover:bg-primary/[0.04] dark:border-white/[0.08] dark:bg-[#111214]">
                                    <div>
                                        <p className="text-sm font-semibold text-text-primary">{item.label}</p>
                                        <p className="mt-1 text-sm text-text-secondary">Clique para abrir a lista filtrada correspondente.</p>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <span className="rounded-full border border-black/[0.06] bg-white px-3 py-1 text-sm font-semibold text-text-primary dark:border-white/[0.08] dark:bg-white/[0.04]">{item.count}</span>
                                        <ChevronRight size={18} className="text-text-muted" />
                                    </div>
                                </button>
                            )) : <div className="rounded-[24px] border border-dashed border-black/[0.08] bg-[#F8F8FA] px-4 py-6 text-sm text-text-secondary dark:border-white/[0.10] dark:bg-[#111214]">Sem gargalos relevantes no periodo atual.</div>}
                        </div>
                    </section>
                </div>

                <div className="mt-6 grid gap-6 xl:grid-cols-[1.2fr,0.8fr]">
                    <section className="rounded-[32px] border border-black/[0.06] bg-white/[0.9] p-6 shadow-[0_18px_60px_rgba(15,23,42,0.08)] dark:border-white/[0.08] dark:bg-[#111111]">
                        <div className="flex items-center justify-between gap-3">
                            <div>
                                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-primary">Insights operacionais</p>
                                <h2 className="mt-2 text-2xl font-display font-bold tracking-tight text-text-primary">Leitura automatica do vendedor</h2>
                            </div>
                            <span className={`inline-flex rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] ${badgeBySeverity(detail.executiveSummary.level)}`}>{detail.executiveSummary.label}</span>
                        </div>
                        <div className="mt-5 space-y-3">
                            {detail.insights.length > 0 ? detail.insights.map((insight) => (
                                <div key={insight.id} className="rounded-[24px] border border-black/[0.06] bg-[#F8F8FA] p-4 dark:border-white/[0.08] dark:bg-[#111214]">
                                    <div className="flex items-center justify-between gap-3">
                                        <p className="text-sm font-semibold text-text-primary">{insight.title}</p>
                                        <span className={`inline-flex rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] ${badgeBySeverity(insight.severity)}`}>{insight.severity}</span>
                                    </div>
                                    <p className="mt-2 text-sm leading-7 text-text-secondary">{insight.description}</p>
                                    <div className="mt-3 rounded-2xl border border-black/[0.06] bg-white/80 px-4 py-3 text-sm text-text-secondary dark:border-white/[0.08] dark:bg-white/[0.04]"><span className="font-semibold text-text-primary">Acao sugerida:</span> {insight.suggested_action}</div>
                                </div>
                            )) : <div className="rounded-[24px] border border-dashed border-black/[0.08] bg-[#F8F8FA] px-4 py-6 text-sm text-text-secondary dark:border-white/[0.10] dark:bg-[#111214]">Ainda nao houve volume suficiente para gerar insights consistentes.</div>}
                        </div>
                    </section>

                    <section className="rounded-[32px] border border-black/[0.06] bg-white/[0.9] p-6 shadow-[0_18px_60px_rgba(15,23,42,0.08)] dark:border-white/[0.08] dark:bg-[#111111]">
                        <div className="flex items-center justify-between gap-3">
                            <div>
                                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-primary">Conexoes do vendedor</p>
                                <h2 className="mt-2 text-2xl font-display font-bold tracking-tight text-text-primary">Linhas em operacao</h2>
                            </div>
                            <button onClick={() => setShowLinkModal(true)} className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-black/[0.08] bg-white px-4 text-sm font-semibold text-text-primary shadow-[0_10px_24px_rgba(15,23,42,0.06)] transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/30 hover:text-primary dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-white">
                                <Link2 size={16} /> Vincular linha
                            </button>
                        </div>
                        <div className="mt-5 space-y-3">
                            {detail.seller.connections.length > 0 ? detail.seller.connections.map((connection) => (
                                <div key={connection.id} className="rounded-[24px] border border-black/[0.06] bg-[#F8F8FA] p-4 dark:border-white/[0.08] dark:bg-[#111214]">
                                    <div className="flex items-start justify-between gap-3">
                                        <div>
                                            <div className="flex flex-wrap items-center gap-2">
                                                <p className="text-sm font-semibold text-text-primary">{connection.instanceName || 'Conexao sem nome'}</p>
                                                <span className={`inline-flex rounded-full border border-black/[0.06] bg-white px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] dark:border-white/[0.08] dark:bg-white/[0.04] ${String(connection.connectionStatus || '').toLowerCase() === 'connected' || String(connection.connectionStatus || '').toLowerCase() === 'open' ? 'text-emerald-600 dark:text-emerald-300' : 'text-amber-600 dark:text-amber-300'}`}>{connection.connectionStatus}</span>
                                                {connection.isPrimary && <span className="inline-flex rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-primary">Principal</span>}
                                            </div>
                                            <p className="mt-2 text-sm text-text-secondary">{connection.connectedAgentName ? `IA: ${connection.connectedAgentName}` : 'Sem IA vinculada'}</p>
                                        </div>
                                        <div className="flex flex-wrap gap-2">
                                            {!connection.isPrimary && <button onClick={() => makePrimary(connection.connectionId)} className="inline-flex h-10 items-center justify-center rounded-2xl border border-black/[0.07] px-4 text-sm font-semibold text-text-secondary transition-colors hover:bg-black/[0.03] hover:text-text-primary dark:border-white/[0.08] dark:hover:bg-white/[0.04] dark:hover:text-white">Tornar principal</button>}
                                            <button onClick={() => unlinkConnection(connection)} className="inline-flex h-10 items-center justify-center gap-2 rounded-2xl border border-rose-200/80 bg-rose-50 px-4 text-sm font-semibold text-rose-700 transition-colors hover:bg-rose-100 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-200">
                                                <Unplug size={14} /> Desvincular
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )) : <div className="rounded-[24px] border border-dashed border-black/[0.08] bg-[#F8F8FA] px-4 py-6 text-sm text-text-secondary dark:border-white/[0.10] dark:bg-[#111214]">Vincule a primeira linha do WhatsApp para transformar este vendedor em uma operacao monitorada pela Kogna.</div>}
                        </div>
                    </section>
                </div>

                <section className="mt-6 rounded-[32px] border border-black/[0.06] bg-white/[0.9] p-6 shadow-[0_18px_60px_rgba(15,23,42,0.08)] dark:border-white/[0.08] dark:bg-[#111111]">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-primary">Conversas do vendedor</p>
                            <h2 className="mt-2 text-2xl font-display font-bold tracking-tight text-text-primary">Fila comercial por conversa</h2>
                        </div>
                        <button onClick={openConversations} className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-black/[0.08] bg-white px-4 text-sm font-semibold text-text-primary shadow-[0_10px_24px_rgba(15,23,42,0.06)] transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/30 hover:text-primary dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-white">
                            <MessageSquare size={16} /> Abrir no Live Chat
                        </button>
                    </div>
                    <div className="mt-5 overflow-hidden rounded-[28px] border border-black/[0.06] dark:border-white/[0.08]">
                        {detail.conversations.length > 0 ? (
                            <div className="overflow-x-auto">
                                <table className="min-w-full divide-y divide-black/[0.06] text-sm dark:divide-white/[0.08]">
                                    <thead className="bg-[#F8F8FA] dark:bg-[#111214]">
                                        <tr className="text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-text-muted">
                                            <th className="px-4 py-3">Lead</th>
                                            <th className="px-4 py-3">Linha</th>
                                            <th className="px-4 py-3">Ultima mensagem</th>
                                            <th className="px-4 py-3">Espera</th>
                                            <th className="px-4 py-3 text-right">Acao</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-black/[0.06] bg-white dark:divide-white/[0.08] dark:bg-[#171719]">
                                        {detail.conversations.map((conversation) => (
                                            <tr key={`${conversation.instanceName}-${conversation.remoteJid}`}>
                                                <td className="px-4 py-4"><p className="font-semibold text-text-primary">{conversation.leadName}</p><p className="mt-1 text-text-secondary">{conversation.leadStatus}</p></td>
                                                <td className="px-4 py-4 text-text-secondary">{conversation.instanceName || 'Sem linha'}</td>
                                                <td className="px-4 py-4"><p className="max-w-[360px] truncate text-text-primary">{conversation.lastMessage || 'Sem conteudo textual'}</p><p className="mt-1 text-text-secondary">{formatRelative(conversation.lastMessageAt)}</p></td>
                                                <td className="px-4 py-4"><span className={`inline-flex rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] ${conversation.waitingForReply ? 'border-amber-200/80 bg-amber-50 text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-200' : 'border-emerald-200/80 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-200'}`}>{conversation.waitingForReply ? `${conversation.waitingMinutes} min` : 'Em dia'}</span></td>
                                                <td className="px-4 py-4 text-right"><button onClick={() => openConversation(conversation.instanceName, conversation.remoteJid)} className="inline-flex h-10 items-center justify-center rounded-2xl border border-black/[0.07] px-4 text-sm font-semibold text-text-secondary transition-colors hover:bg-black/[0.03] hover:text-text-primary dark:border-white/[0.08] dark:hover:bg-white/[0.04] dark:hover:text-white">Abrir conversa</button></td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        ) : <div className="px-4 py-8 text-sm text-text-secondary">Nenhuma conversa atribuida ao vendedor neste recorte.</div>}
                    </div>
                </section>

                <section ref={leadsRef} className="mt-6 rounded-[32px] border border-black/[0.06] bg-white/[0.9] p-6 shadow-[0_18px_60px_rgba(15,23,42,0.08)] dark:border-white/[0.08] dark:bg-[#111111]">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-primary">Leads do vendedor</p>
                            <h2 className="mt-2 text-2xl font-display font-bold tracking-tight text-text-primary">Lista operacional de leads</h2>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {([{ key: 'all', label: 'Todos' }, { key: 'waiting', label: 'Sem resposta' }, { key: 'risk', label: 'Em risco' }, { key: 'stale', label: 'Parados' }] as { key: LeadView; label: string }[]).map((item) => (
                                <button key={item.key} onClick={() => setLeadView(item.key)} className={`inline-flex h-11 items-center justify-center rounded-2xl border px-4 text-sm font-semibold transition-all ${leadView === item.key ? 'border-primary/20 bg-primary/10 text-primary' : 'border-black/[0.07] bg-white text-text-secondary hover:border-primary/20 hover:text-text-primary dark:border-white/[0.08] dark:bg-white/[0.04]'}`}>{item.label}</button>
                            ))}
                        </div>
                    </div>
                    <div className="mt-5 overflow-hidden rounded-[28px] border border-black/[0.06] dark:border-white/[0.08]">
                        {leadRows.length > 0 ? (
                            <div className="overflow-x-auto">
                                <table className="min-w-full divide-y divide-black/[0.06] text-sm dark:divide-white/[0.08]">
                                    <thead className="bg-[#F8F8FA] dark:bg-[#111214]">
                                        <tr className="text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-text-muted">
                                            <th className="px-4 py-3">Nome</th><th className="px-4 py-3">Telefone</th><th className="px-4 py-3">Etapa</th><th className="px-4 py-3">Temperatura</th><th className="px-4 py-3">Ultima interacao</th><th className="px-4 py-3">Tempo sem resposta</th><th className="px-4 py-3">Status</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-black/[0.06] bg-white dark:divide-white/[0.08] dark:bg-[#171719]">
                                        {leadRows.map((lead) => (
                                            <tr key={lead.id}>
                                                <td className="px-4 py-4"><p className="font-semibold text-text-primary">{lead.name}</p><p className="mt-1 text-text-secondary">R$ {Number(lead.value || 0).toLocaleString('pt-BR')}</p></td>
                                                <td className="px-4 py-4 text-text-secondary">{lead.phone || 'Nao informado'}</td>
                                                <td className="px-4 py-4 text-text-secondary">{lead.stage}</td>
                                                <td className="px-4 py-4 text-text-secondary">{lead.temperature}</td>
                                                <td className="px-4 py-4 text-text-secondary">{formatRelative(lead.lastInteractionAt)}</td>
                                                <td className="px-4 py-4 text-text-secondary">{lead.waitingForReply ? `${lead.timeWithoutResponseMinutes} min` : 'Sem pendencia'}</td>
                                                <td className="px-4 py-4"><span className={`inline-flex rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] ${lead.status === 'waiting' ? 'border-amber-200/80 bg-amber-50 text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-200' : lead.status === 'won' ? 'border-emerald-200/80 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-200' : lead.status === 'lost' ? 'border-rose-200/80 bg-rose-50 text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-200' : 'border-sky-200/80 bg-sky-50 text-sky-700 dark:border-sky-500/20 dark:bg-sky-500/10 dark:text-sky-200'}`}>{lead.status}</span></td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        ) : <div className="px-4 py-8 text-sm text-text-secondary">Nenhum lead encontrado para o filtro selecionado.</div>}
                    </div>
                </section>
            </div>

            <SellerFormModal isOpen={showEditModal} onClose={() => setShowEditModal(false)} onSaved={() => fetchDetail()} seller={detail.seller} />
            <SellerConnectionModal isOpen={showLinkModal} onClose={() => setShowLinkModal(false)} onLinked={() => fetchDetail()} sellers={[detail.seller]} initialSellerId={detail.seller.id} />
        </>
    );
}

function KpiCard({ label, value, icon, highlight = false }: { label: string; value: string | number; icon: ReactNode; highlight?: boolean; }) {
    return (
        <div className="rounded-[24px] border border-black/[0.06] bg-[#F8F8FA] p-4 dark:border-white/[0.08] dark:bg-[#111214]">
            <div className="flex items-center justify-between gap-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-text-muted">{label}</p>
                <div className={`rounded-2xl border p-2 ${highlight ? 'border-amber-200/80 bg-amber-50 text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-200' : 'border-primary/15 bg-primary/[0.08] text-primary'}`}>{icon}</div>
            </div>
            <p className={`mt-3 text-2xl font-display font-bold tracking-tight ${highlight ? 'text-amber-700 dark:text-amber-200' : 'text-text-primary'}`}>{value}</p>
        </div>
    );
}

function orderFunnel(funnel: SellerDetailResponse['funnel'], columns: string[]) {
    const counts = new Map(funnel.map((stage) => [stage.stage, stage.count]));
    const ordered = columns.map((stage) => ({ stage, count: counts.get(stage) || 0 }));
    return [...ordered, ...funnel.filter((stage) => !columns.includes(stage.stage))];
}

function filterLeadRows(leads: SellerLeadRow[], view: LeadView) {
    if (view === 'waiting') return leads.filter((lead) => lead.waitingForReply);
    if (view === 'risk') return leads.filter((lead) => lead.waitingForReply || lead.timeWithoutResponseMinutes >= 60);
    if (view === 'stale') return leads.filter((lead) => lead.lastInteractionAt && (Date.now() - new Date(lead.lastInteractionAt).getTime()) / 3600000 >= 48);
    return leads;
}
