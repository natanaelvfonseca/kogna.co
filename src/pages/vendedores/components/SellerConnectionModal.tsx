import { useEffect, useState } from 'react';
import { Link2, Loader2, Plus, X } from 'lucide-react';
import { useAuth } from '../../../context/AuthContext';
import { useNotifications } from '../../../context/NotificationContext';
import { API_URL } from '../../../config/api';
import type { SellerSummary, WhatsAppInstance } from '../types';

interface SellerConnectionModalProps {
    isOpen: boolean;
    onClose: () => void;
    onLinked: () => void;
    sellers: SellerSummary[];
    initialSellerId?: string | null;
}

export function SellerConnectionModal({
    isOpen,
    onClose,
    onLinked,
    sellers,
    initialSellerId = null,
}: SellerConnectionModalProps) {
    const { token } = useAuth();
    const { showToast } = useNotifications();
    const [instances, setInstances] = useState<WhatsAppInstance[]>([]);
    const [loading, setLoading] = useState(false);
    const [sellerId, setSellerId] = useState('');
    const [connectionId, setConnectionId] = useState('');
    const [isPrimary, setIsPrimary] = useState(true);

    useEffect(() => {
        if (!isOpen || !token) return;

        setSellerId(initialSellerId || '');
        setConnectionId('');
        setIsPrimary(true);

        fetch(`${API_URL}/instances`, {
            headers: { Authorization: `Bearer ${token}` },
        })
            .then((response) => response.ok ? response.json() : [])
            .then((data) => setInstances(Array.isArray(data) ? data : []))
            .catch(() => setInstances([]));
    }, [initialSellerId, isOpen, token]);

    if (!isOpen) return null;

    async function submit(forceTransfer = false) {
        if (!token) return;
        if (!sellerId || !connectionId) {
            showToast('Dados obrigatorios', 'Escolha o vendedor e a conexao antes de vincular.', 'warning');
            return;
        }

        setLoading(true);

        try {
            const response = await fetch(`${API_URL}/sellers/${sellerId}/connections`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({
                    connectionId,
                    isPrimary,
                    forceTransfer,
                }),
            });

            if (response.status === 409) {
                const conflict = await response.json().catch(() => ({}));
                const confirmed = window.confirm(
                    `${conflict.currentSellerName || 'Esta conexao'} ja esta vinculada. Deseja transferir para o vendedor selecionado?`,
                );

                if (confirmed) {
                    await submit(true);
                }
                return;
            }

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || 'Nao foi possivel vincular a conexao.');
            }

            showToast('Conexao vinculada', 'A linha selecionada ja esta operando no contexto do vendedor.', 'success');
            onLinked();
            onClose();
        } catch (error) {
            showToast(
                'Erro ao vincular',
                error instanceof Error ? error.message : 'Falha inesperada ao vincular a conexao.',
                'error',
            );
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 p-4 backdrop-blur-md">
            <div className="relative w-full max-w-2xl overflow-hidden rounded-[30px] border border-black/[0.06] bg-white shadow-[0_24px_80px_rgba(15,23,42,0.24)] dark:border-white/[0.08] dark:bg-[#171717] dark:shadow-[0_24px_90px_rgba(0,0,0,0.55)]">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(245,121,59,0.12),_transparent_36%)] dark:bg-[radial-gradient(circle_at_top_left,_rgba(245,121,59,0.16),_transparent_38%)]" />

                <div className="relative border-b border-black/[0.06] px-6 py-5 dark:border-white/[0.08]">
                    <div className="flex items-start justify-between gap-4">
                        <div className="flex items-start gap-4">
                            <div className="flex h-14 w-14 items-center justify-center rounded-[20px] bg-gradient-primary text-white shadow-[0_16px_34px_rgba(245,121,59,0.28)]">
                                <Link2 size={24} />
                            </div>
                            <div>
                                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-primary">
                                    Vinculo operacional
                                </p>
                                <h2 className="mt-2 text-2xl font-display font-bold tracking-tight text-text-primary sm:text-[30px]">
                                    Vincular conexao existente
                                </h2>
                                <p className="mt-2 max-w-xl text-sm leading-6 text-text-secondary">
                                    Use uma linha ja ativa da Evolution API como base operacional do vendedor escolhido.
                                </p>
                            </div>
                        </div>

                        <button
                            onClick={onClose}
                            className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-transparent text-text-muted transition-colors hover:border-black/[0.07] hover:bg-black/[0.03] hover:text-text-primary dark:hover:border-white/[0.08] dark:hover:bg-white/[0.04] dark:hover:text-white"
                        >
                            <X size={20} />
                        </button>
                    </div>
                </div>

                <div className="relative px-6 py-6">
                    <div className="grid gap-5 md:grid-cols-2">
                        <label className="block text-sm">
                            <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">Vendedor</span>
                            <select
                                value={sellerId}
                                onChange={(event) => setSellerId(event.target.value)}
                                className="h-12 w-full rounded-2xl border border-black/[0.07] bg-white px-4 text-sm text-text-primary outline-none transition-all focus:border-primary/35 focus:ring-4 focus:ring-primary/10 dark:border-white/[0.08] dark:bg-white/[0.04]"
                            >
                                <option value="">Selecione um vendedor</option>
                                {sellers.map((seller) => (
                                    <option key={seller.id} value={seller.id}>
                                        {seller.name}
                                    </option>
                                ))}
                            </select>
                        </label>

                        <label className="block text-sm">
                            <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">Conexao</span>
                            <select
                                value={connectionId}
                                onChange={(event) => setConnectionId(event.target.value)}
                                className="h-12 w-full rounded-2xl border border-black/[0.07] bg-white px-4 text-sm text-text-primary outline-none transition-all focus:border-primary/35 focus:ring-4 focus:ring-primary/10 dark:border-white/[0.08] dark:bg-white/[0.04]"
                            >
                                <option value="">Selecione uma linha</option>
                                {instances.map((instance) => {
                                    const ownerLabel = instance.connected_seller_id
                                        ? ` • ${instance.connected_seller_name || 'Ja vinculada'}`
                                        : '';

                                    return (
                                        <option key={instance.id} value={instance.id}>
                                            {instance.instance_name} • {String(instance.status || '').toLowerCase()}{ownerLabel}
                                        </option>
                                    );
                                })}
                            </select>
                        </label>
                    </div>

                    <label className="mt-5 flex items-center gap-3 rounded-[24px] border border-black/[0.06] bg-[#F8F8FA] px-4 py-4 text-sm text-text-secondary dark:border-white/[0.08] dark:bg-[#111214]">
                        <input
                            type="checkbox"
                            checked={isPrimary}
                            onChange={(event) => setIsPrimary(event.target.checked)}
                            className="h-4 w-4 rounded border-border text-primary focus:ring-primary/20"
                        />
                        Definir esta linha como conexao principal do vendedor
                    </label>

                    <div className="mt-5 rounded-[24px] border border-black/[0.06] bg-white/[0.8] p-4 dark:border-white/[0.08] dark:bg-white/[0.04]">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-text-muted">
                            O que acontece depois
                        </p>
                        <div className="mt-3 space-y-2 text-sm leading-6 text-text-secondary">
                            <p>Novas conversas que entrarem por essa linha passam a alimentar o contexto comercial do vendedor.</p>
                            <p>O perfil do vendedor passa a exibir metricas, leads e atalhos do Live Chat baseados nessa conexao.</p>
                            <p>Se a linha ja estiver em outro vendedor, o sistema exige transferencia explicita para evitar conflito operacional.</p>
                        </div>
                    </div>
                </div>

                <div className="relative flex items-center justify-end gap-3 border-t border-black/[0.06] px-6 py-4 dark:border-white/[0.08]">
                    <button
                        onClick={onClose}
                        className="inline-flex h-11 items-center justify-center rounded-2xl border border-black/[0.07] px-5 text-sm font-semibold text-text-secondary transition-colors hover:bg-black/[0.03] hover:text-text-primary dark:border-white/[0.08] dark:hover:bg-white/[0.04] dark:hover:text-white"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={() => submit()}
                        disabled={loading}
                        className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-gradient-primary px-5 text-sm font-semibold text-white shadow-[0_18px_40px_rgba(245,121,59,0.34)] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_22px_45px_rgba(245,121,59,0.4)] disabled:translate-y-0 disabled:opacity-70"
                    >
                        {loading ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                        Vincular conexao
                    </button>
                </div>
            </div>
        </div>
    );
}
