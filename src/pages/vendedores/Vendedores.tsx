import { useEffect, useState } from 'react';
import { Link2, Loader2, MessageSquare, Plus, Search, ShieldAlert, Sparkles, User } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { API_URL } from '../../config/api';
import { SellerConnectionModal } from './components/SellerConnectionModal';
import { SellerFormModal } from './components/SellerFormModal';
import type { SellerSummary, SellersListResponse } from './types';

function formatPercent(value: number) {
    return `${Math.round((value || 0) * 100)}%`;
}

function statusBadge(status: SellerSummary['status']) {
    if (status === 'online') {
        return 'border-emerald-200/80 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-200';
    }

    if (status === 'inactive') {
        return 'border-rose-200/80 bg-rose-50 text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-200';
    }

    return 'border-amber-200/80 bg-amber-50 text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-200';
}

function riskBadge(level: SellerSummary['risk']['level']) {
    if (level === 'high') {
        return 'border-rose-200/80 bg-rose-50 text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-200';
    }

    if (level === 'attention') {
        return 'border-amber-200/80 bg-amber-50 text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-200';
    }

    return 'border-emerald-200/80 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-200';
}

function connectionBadge(status: string) {
    const normalized = String(status || '').toLowerCase();
    if (normalized === 'connected' || normalized === 'open') {
        return 'text-emerald-600 dark:text-emerald-300';
    }
    return 'text-amber-600 dark:text-amber-300';
}

function initials(name: string) {
    return name
        .split(' ')
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase())
        .join('');
}

export function Vendedores() {
    const { token } = useAuth();
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [items, setItems] = useState<SellerSummary[]>([]);
    const [periodLabel, setPeriodLabel] = useState('Ultimos 7 dias');
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [showLinkModal, setShowLinkModal] = useState(false);

    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('');
    const [connectionStatusFilter, setConnectionStatusFilter] = useState('');
    const [unansweredOnly, setUnansweredOnly] = useState(false);
    const [highRiskOnly, setHighRiskOnly] = useState(false);
    const [aiConnectedFilter, setAiConnectedFilter] = useState<'all' | 'yes' | 'no'>('all');

    async function fetchSellers() {
        if (!token) return;

        setLoading(true);
        try {
            const params = new URLSearchParams();
            params.set('days', '7');
            if (search.trim()) params.set('search', search.trim());
            if (statusFilter) params.set('status', statusFilter);
            if (connectionStatusFilter) params.set('connection_status', connectionStatusFilter);
            if (unansweredOnly) params.set('unanswered_only', 'true');
            if (highRiskOnly) params.set('high_risk_only', 'true');
            if (aiConnectedFilter === 'yes') params.set('ai_connected', 'true');
            if (aiConnectedFilter === 'no') params.set('ai_connected', 'false');

            const response = await fetch(`${API_URL}/sellers?${params.toString()}`, {
                headers: { Authorization: `Bearer ${token}` },
            });

            if (!response.ok) {
                throw new Error('Nao foi possivel carregar o time comercial.');
            }

            const data = await response.json() as SellersListResponse;
            setItems(Array.isArray(data.items) ? data.items : []);

            const start = data.period?.start ? new Date(data.period.start) : null;
            const end = data.period?.end ? new Date(data.period.end) : null;
            if (start && end) {
                setPeriodLabel(
                    `${start.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })} - ${end.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}`,
                );
            }
        } catch (error) {
            console.error(error);
            setItems([]);
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        fetchSellers();
    }, [token, search, statusFilter, connectionStatusFilter, unansweredOnly, highRiskOnly, aiConnectedFilter]);

    return (
        <>
            <div className="relative mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
                <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[360px] overflow-hidden">
                    <div className="absolute left-[-8%] top-12 h-56 w-56 rounded-full bg-primary/[0.16] blur-3xl dark:bg-primary/[0.12]" />
                    <div className="absolute right-[6%] top-0 h-64 w-64 rounded-full bg-orange-300/20 blur-3xl dark:bg-orange-500/10" />
                </div>

                <section className="relative overflow-hidden rounded-[32px] border border-black/[0.06] bg-white/[0.85] p-6 shadow-[0_18px_60px_rgba(15,23,42,0.08)] backdrop-blur-xl dark:border-white/[0.08] dark:bg-[#111111] dark:shadow-[0_24px_80px_rgba(0,0,0,0.45)] sm:p-8">
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(245,121,59,0.13),_transparent_36%),radial-gradient(circle_at_bottom_right,_rgba(15,23,42,0.05),_transparent_34%)] dark:bg-[radial-gradient(circle_at_top_left,_rgba(245,121,59,0.18),_transparent_38%),radial-gradient(circle_at_bottom_right,_rgba(255,255,255,0.05),_transparent_32%)]" />

                    <div className="relative flex flex-col gap-8 xl:flex-row xl:items-end xl:justify-between">
                        <div className="max-w-3xl">
                            <div className="inline-flex items-center gap-2 rounded-full border border-primary/[0.15] bg-primary/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-primary dark:border-primary/20 dark:bg-primary/[0.12]">
                                <Sparkles size={14} />
                                Time comercial
                            </div>

                            <h1 className="mt-4 text-4xl font-display font-bold tracking-[-0.04em] text-text-primary sm:text-5xl">
                                Central de vendedores
                            </h1>
                            <p className="mt-3 max-w-2xl text-base leading-7 text-text-secondary sm:text-lg">
                                Veja o time pelo vendedor, conecte linhas reais da operacao e entre direto nas conversas que exigem acao.
                            </p>

                            <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-4">
                                <div className="rounded-2xl border border-black/[0.05] bg-white/[0.68] px-4 py-3 shadow-[0_6px_18px_rgba(15,23,42,0.04)] backdrop-blur dark:border-white/[0.06] dark:bg-white/[0.04]">
                                    <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-text-muted">Vendedores</p>
                                    <p className="mt-1 text-lg font-semibold tracking-tight text-text-primary">{items.length}</p>
                                </div>
                                <div className="rounded-2xl border border-black/[0.05] bg-white/[0.68] px-4 py-3 shadow-[0_6px_18px_rgba(15,23,42,0.04)] backdrop-blur dark:border-white/[0.06] dark:bg-white/[0.04]">
                                    <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-text-muted">Com risco alto</p>
                                    <p className="mt-1 text-lg font-semibold tracking-tight text-text-primary">{items.filter((item) => item.risk.level === 'high').length}</p>
                                </div>
                                <div className="rounded-2xl border border-black/[0.05] bg-white/[0.68] px-4 py-3 shadow-[0_6px_18px_rgba(15,23,42,0.04)] backdrop-blur dark:border-white/[0.06] dark:bg-white/[0.04]">
                                    <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-text-muted">Linhas com IA</p>
                                    <p className="mt-1 text-lg font-semibold tracking-tight text-text-primary">{items.filter((item) => item.hasAiConnected).length}</p>
                                </div>
                                <div className="rounded-2xl border border-black/[0.05] bg-white/[0.68] px-4 py-3 shadow-[0_6px_18px_rgba(15,23,42,0.04)] backdrop-blur dark:border-white/[0.06] dark:bg-white/[0.04]">
                                    <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-text-muted">Janela</p>
                                    <p className="mt-1 text-lg font-semibold tracking-tight text-text-primary">{periodLabel}</p>
                                </div>
                            </div>
                        </div>

                        <div className="w-full max-w-2xl">
                            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-end">
                                <div className="relative flex-1">
                                    <Search size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-text-muted" />
                                    <input
                                        value={search}
                                        onChange={(event) => setSearch(event.target.value)}
                                        placeholder="Buscar por vendedor, telefone, conexao ou ID"
                                        className="h-12 w-full rounded-2xl border border-black/[0.07] bg-white/80 pl-11 pr-4 text-sm text-text-primary shadow-[0_8px_24px_rgba(15,23,42,0.05)] outline-none transition-all duration-300 placeholder:text-text-muted focus:border-primary/40 focus:ring-4 focus:ring-primary/10 dark:border-white/[0.08] dark:bg-white/[0.04] dark:focus:border-primary/40 dark:focus:ring-primary/10"
                                    />
                                </div>

                                <div className="flex gap-3">
                                    <button
                                        onClick={() => setShowLinkModal(true)}
                                        className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl border border-black/[0.08] bg-white px-4 text-sm font-semibold text-text-primary shadow-[0_10px_24px_rgba(15,23,42,0.06)] transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/30 hover:text-primary dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-white dark:hover:border-primary/30 dark:hover:text-primary-light"
                                    >
                                        <Link2 size={16} />
                                        Vincular conexao
                                    </button>
                                    <button
                                        onClick={() => setShowCreateModal(true)}
                                        className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-gradient-primary px-5 text-sm font-semibold text-white shadow-[0_18px_40px_rgba(245,121,59,0.34)] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_22px_45px_rgba(245,121,59,0.4)] active:translate-y-0"
                                    >
                                        <Plus size={18} />
                                        Adicionar vendedor
                                    </button>
                                </div>
                            </div>

                            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                                <select
                                    value={statusFilter}
                                    onChange={(event) => setStatusFilter(event.target.value)}
                                    className="h-11 rounded-2xl border border-black/[0.07] bg-white px-4 text-sm text-text-primary outline-none transition-all focus:border-primary/40 focus:ring-4 focus:ring-primary/10 dark:border-white/[0.08] dark:bg-white/[0.04]"
                                >
                                    <option value="">Status do vendedor</option>
                                    <option value="online">Online</option>
                                    <option value="offline">Offline</option>
                                    <option value="inactive">Inativo</option>
                                </select>

                                <select
                                    value={connectionStatusFilter}
                                    onChange={(event) => setConnectionStatusFilter(event.target.value)}
                                    className="h-11 rounded-2xl border border-black/[0.07] bg-white px-4 text-sm text-text-primary outline-none transition-all focus:border-primary/40 focus:ring-4 focus:ring-primary/10 dark:border-white/[0.08] dark:bg-white/[0.04]"
                                >
                                    <option value="">Status da conexao</option>
                                    <option value="connected">Conectada</option>
                                    <option value="open">Aberta</option>
                                    <option value="disconnected">Desconectada</option>
                                </select>

                                <button
                                    onClick={() => setUnansweredOnly((current) => !current)}
                                    className={`inline-flex h-11 items-center justify-center rounded-2xl border px-4 text-sm font-semibold transition-all ${unansweredOnly
                                        ? 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-200'
                                        : 'border-black/[0.07] bg-white text-text-secondary hover:border-primary/20 hover:text-text-primary dark:border-white/[0.08] dark:bg-white/[0.04]'
                                        }`}
                                >
                                    Leads sem resposta
                                </button>

                                <button
                                    onClick={() => setHighRiskOnly((current) => !current)}
                                    className={`inline-flex h-11 items-center justify-center gap-2 rounded-2xl border px-4 text-sm font-semibold transition-all ${highRiskOnly
                                        ? 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-200'
                                        : 'border-black/[0.07] bg-white text-text-secondary hover:border-primary/20 hover:text-text-primary dark:border-white/[0.08] dark:bg-white/[0.04]'
                                        }`}
                                >
                                    <ShieldAlert size={15} />
                                    Risco alto
                                </button>

                                <select
                                    value={aiConnectedFilter}
                                    onChange={(event) => setAiConnectedFilter(event.target.value as 'all' | 'yes' | 'no')}
                                    className="h-11 rounded-2xl border border-black/[0.07] bg-white px-4 text-sm text-text-primary outline-none transition-all focus:border-primary/40 focus:ring-4 focus:ring-primary/10 dark:border-white/[0.08] dark:bg-white/[0.04]"
                                >
                                    <option value="all">IA conectada</option>
                                    <option value="yes">Com IA</option>
                                    <option value="no">Sem IA</option>
                                </select>
                            </div>
                        </div>
                    </div>
                </section>

                <div className="mt-8">
                    {loading ? (
                        <div className="flex min-h-[320px] items-center justify-center rounded-[32px] border border-black/[0.06] bg-white/[0.9] shadow-[0_18px_60px_rgba(15,23,42,0.08)] dark:border-white/[0.08] dark:bg-[#111111]">
                            <div className="flex items-center gap-3 text-text-secondary">
                                <Loader2 size={20} className="animate-spin text-primary" />
                                Carregando vendedores...
                            </div>
                        </div>
                    ) : items.length === 0 ? (
                        <div className="rounded-[32px] border border-dashed border-black/[0.08] bg-white/[0.92] px-6 py-16 text-center shadow-[0_18px_60px_rgba(15,23,42,0.08)] dark:border-white/[0.10] dark:bg-[#111111]">
                            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-[28px] bg-primary/10 text-primary">
                                <User size={34} />
                            </div>
                            <h2 className="mt-6 text-2xl font-display font-bold tracking-tight text-text-primary">
                                Conecte o primeiro vendedor para acompanhar a operacao
                            </h2>
                            <p className="mx-auto mt-3 max-w-2xl text-sm leading-7 text-text-secondary sm:text-base">
                                Vincule uma linha real do WhatsApp e comece a acompanhar desempenho individual, risco operacional e conversas do time comercial sem alternar entre telas soltas.
                            </p>
                            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
                                <button
                                    onClick={() => setShowCreateModal(true)}
                                    className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-gradient-primary px-5 text-sm font-semibold text-white shadow-[0_18px_40px_rgba(245,121,59,0.34)] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_22px_45px_rgba(245,121,59,0.4)]"
                                >
                                    <Plus size={18} />
                                    Adicionar vendedor
                                </button>
                                <button
                                    onClick={() => setShowLinkModal(true)}
                                    className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl border border-black/[0.08] bg-white px-5 text-sm font-semibold text-text-primary shadow-[0_10px_24px_rgba(15,23,42,0.06)] transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/30 hover:text-primary dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-white"
                                >
                                    <Link2 size={18} />
                                    Vincular conexao
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className="grid gap-5 xl:grid-cols-2">
                            {items.map((seller) => (
                                <button
                                    key={seller.id}
                                    type="button"
                                    onClick={() => navigate(`/vendedores/${seller.id}`)}
                                    className="group relative overflow-hidden rounded-[32px] border border-black/[0.06] bg-white/[0.92] p-6 text-left shadow-[0_18px_60px_rgba(15,23,42,0.08)] transition-all duration-300 hover:-translate-y-1 hover:border-primary/20 hover:shadow-[0_24px_70px_rgba(15,23,42,0.12)] dark:border-white/[0.08] dark:bg-[#111111]"
                                >
                                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(245,121,59,0.10),_transparent_36%)] opacity-0 transition-opacity duration-300 group-hover:opacity-100" />

                                    <div className="relative">
                                        <div className="flex items-start justify-between gap-4">
                                            <div className="flex min-w-0 items-start gap-4">
                                                {seller.avatarUrl ? (
                                                    <img
                                                        src={seller.avatarUrl}
                                                        alt={seller.name}
                                                        className="h-14 w-14 shrink-0 rounded-[20px] object-cover shadow-[0_10px_26px_rgba(15,23,42,0.12)]"
                                                    />
                                                ) : (
                                                    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[20px] bg-primary/10 text-lg font-bold text-primary">
                                                        {initials(seller.name)}
                                                    </div>
                                                )}

                                                <div className="min-w-0">
                                                    <div className="flex flex-wrap items-center gap-2">
                                                        <h3 className="truncate text-xl font-display font-bold tracking-tight text-text-primary">
                                                            {seller.name}
                                                        </h3>
                                                        <span className={`inline-flex rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] ${statusBadge(seller.status)}`}>
                                                            {seller.status}
                                                        </span>
                                                        <span className={`inline-flex rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] ${riskBadge(seller.risk.level)}`}>
                                                            {seller.risk.label}
                                                        </span>
                                                    </div>

                                                    <p className="mt-1 text-sm text-text-secondary">
                                                        {seller.role || 'Sem cargo definido'}{seller.phoneNumber ? ` - ${seller.phoneNumber}` : ''}
                                                    </p>

                                                    <div className="mt-3 flex flex-wrap gap-2 text-xs text-text-secondary">
                                                        <span className={`inline-flex items-center gap-2 rounded-full border border-black/[0.06] bg-white/80 px-3 py-1 dark:border-white/[0.08] dark:bg-white/[0.04] ${connectionBadge(seller.primaryConnection?.connectionStatus || '')}`}>
                                                            <span className="h-2 w-2 rounded-full bg-current" />
                                                            {seller.primaryConnection?.instanceName || 'Sem conexao principal'}
                                                        </span>
                                                        <span className="inline-flex items-center gap-2 rounded-full border border-black/[0.06] bg-white/80 px-3 py-1 dark:border-white/[0.08] dark:bg-white/[0.04]">
                                                            {seller.hasAiConnected ? 'IA conectada' : 'Sem IA vinculada'}
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="rounded-[20px] border border-black/[0.06] bg-[#F8F8FA] px-4 py-3 text-right dark:border-white/[0.08] dark:bg-[#111214]">
                                                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-text-muted">Score operacional</p>
                                                <p className="mt-1 text-2xl font-display font-bold tracking-tight text-text-primary">{seller.qualityScore}</p>
                                            </div>
                                        </div>

                                        <div className="mt-6 grid gap-3 sm:grid-cols-4">
                                            <MetricBlock label="Conversas ativas" value={seller.metrics.activeConversations} />
                                            <MetricBlock label="Sem resposta" value={seller.metrics.unansweredLeads} muted={seller.metrics.unansweredLeads > 0} />
                                            <MetricBlock label="Tempo medio" value={seller.metrics.avgResponseTimeLabel} />
                                            <MetricBlock label="Taxa de resposta" value={formatPercent(seller.metrics.responseRate)} />
                                        </div>

                                        <div className="mt-4 grid gap-3 sm:grid-cols-3">
                                            <SecondaryMetric label="Leads recebidos" value={seller.metrics.leadsReceived} />
                                            <SecondaryMetric label="Conversao" value={formatPercent(seller.metrics.conversionRate)} />
                                            <SecondaryMetric label="Follow-ups pendentes" value={seller.metrics.pendingFollowups} />
                                        </div>

                                        <div className="mt-5 rounded-[24px] border border-black/[0.06] bg-[#F8F8FA] p-4 dark:border-white/[0.08] dark:bg-[#111214]">
                                            <div className="flex items-start justify-between gap-3">
                                                <div>
                                                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-text-muted">Leitura rapida</p>
                                                    <p className="mt-2 text-sm font-semibold text-text-primary">
                                                        {seller.quality.criticalPoints[0] || seller.quality.strengths[0] || 'Operacao estavel no periodo'}
                                                    </p>
                                                    <p className="mt-1 text-sm leading-6 text-text-secondary">
                                                        {seller.quality.criticalPoints.length > 0
                                                            ? 'Abra o perfil para revisar gargalos, leads em risco e abrir as conversas desse vendedor.'
                                                            : 'O vendedor esta operando com boa leitura de resposta, follow-up e controle das linhas conectadas.'}
                                                    </p>
                                                </div>
                                                <div className="rounded-2xl border border-primary/15 bg-primary/[0.08] p-2 text-primary">
                                                    <MessageSquare size={16} />
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            <SellerFormModal
                isOpen={showCreateModal}
                onClose={() => setShowCreateModal(false)}
                onSaved={() => fetchSellers()}
            />

            <SellerConnectionModal
                isOpen={showLinkModal}
                onClose={() => setShowLinkModal(false)}
                onLinked={() => fetchSellers()}
                sellers={items}
            />
        </>
    );
}

function MetricBlock({
    label,
    value,
    muted = false,
}: {
    label: string;
    value: string | number;
    muted?: boolean;
}) {
    return (
        <div className="rounded-[24px] border border-black/[0.06] bg-[#F8F8FA] p-4 dark:border-white/[0.08] dark:bg-[#111214]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-text-muted">{label}</p>
            <p className={`mt-2 text-2xl font-display font-bold tracking-tight ${muted ? 'text-amber-600 dark:text-amber-300' : 'text-text-primary'}`}>
                {value}
            </p>
        </div>
    );
}

function SecondaryMetric({
    label,
    value,
}: {
    label: string;
    value: string | number;
}) {
    return (
        <div className="rounded-[22px] border border-black/[0.06] bg-white/[0.82] px-4 py-3 dark:border-white/[0.08] dark:bg-white/[0.04]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-text-muted">{label}</p>
            <p className="mt-2 text-base font-semibold text-text-primary">{value}</p>
        </div>
    );
}
