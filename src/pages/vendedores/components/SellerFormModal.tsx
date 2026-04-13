import { useEffect, useState } from 'react';
import { Loader2, Save, Smartphone, User, X } from 'lucide-react';
import { useAuth } from '../../../context/AuthContext';
import { useNotifications } from '../../../context/NotificationContext';
import { API_URL } from '../../../config/api';
import type { SellerSummary, WhatsAppInstance } from '../types';

interface SellerFormModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSaved: (sellerId?: string) => void;
    seller?: SellerSummary | null;
}

function isInstanceConnected(status?: string) {
    const normalized = String(status || '').toLowerCase();
    return normalized === 'connected' || normalized === 'open';
}

export function SellerFormModal({ isOpen, onClose, onSaved, seller }: SellerFormModalProps) {
    const { token } = useAuth();
    const { showToast } = useNotifications();
    const [loading, setLoading] = useState(false);
    const [instances, setInstances] = useState<WhatsAppInstance[]>([]);
    const [formData, setFormData] = useState({
        name: '',
        phoneNumber: '',
        email: '',
        role: '',
        notes: '',
        status: 'offline',
        primaryConnectionId: '',
    });

    const isEditing = Boolean(seller);

    useEffect(() => {
        if (!isOpen || !token) return;

        fetch(`${API_URL}/instances`, {
            headers: { Authorization: `Bearer ${token}` },
        })
            .then((response) => response.ok ? response.json() : [])
            .then((data) => setInstances(Array.isArray(data) ? data : []))
            .catch(() => setInstances([]));
    }, [isOpen, token]);

    useEffect(() => {
        if (!isOpen) return;

        setFormData({
            name: seller?.name || '',
            phoneNumber: seller?.phoneNumber || '',
            email: seller?.email || '',
            role: seller?.role || '',
            notes: seller?.notes || '',
            status: seller?.status || 'offline',
            primaryConnectionId: seller?.primaryConnectionId || '',
        });
    }, [isOpen, seller]);

    if (!isOpen) return null;

    async function submit(forceTransfer = false) {
        if (!token) return;
        if (!formData.name.trim()) {
            showToast('Nome obrigatorio', 'Informe o nome do vendedor antes de salvar.', 'warning');
            return;
        }

        setLoading(true);

        try {
            const response = await fetch(
                isEditing ? `${API_URL}/sellers/${seller?.id}` : `${API_URL}/sellers`,
                {
                    method: isEditing ? 'PUT' : 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${token}`,
                    },
                    body: JSON.stringify({
                        name: formData.name.trim(),
                        phoneNumber: formData.phoneNumber.trim() || null,
                        email: formData.email.trim() || null,
                        role: formData.role.trim() || null,
                        notes: formData.notes.trim() || null,
                        status: formData.status,
                        primaryConnectionId: formData.primaryConnectionId || null,
                        forceTransfer,
                    }),
                },
            );

            if (response.status === 409) {
                const conflict = await response.json().catch(() => ({}));
                const confirmed = window.confirm(
                    `${conflict.currentSellerName || 'Esta conexao'} ja esta vinculada a outro vendedor. Deseja transferir agora?`,
                );

                if (confirmed) {
                    await submit(true);
                }
                return;
            }

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || 'Nao foi possivel salvar o vendedor.');
            }

            const data = await response.json();
            showToast(
                isEditing ? 'Vendedor atualizado' : 'Vendedor criado',
                isEditing ? 'As informacoes foram atualizadas.' : 'O vendedor ja esta pronto para operar.',
                'success',
            );
            onSaved(data?.seller?.id || seller?.id);
            onClose();
        } catch (error) {
            showToast(
                'Erro ao salvar',
                error instanceof Error ? error.message : 'Falha inesperada ao salvar o vendedor.',
                'error',
            );
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 p-4 backdrop-blur-md">
            <div className="relative w-full max-w-3xl overflow-hidden rounded-[30px] border border-black/[0.06] bg-white shadow-[0_24px_80px_rgba(15,23,42,0.24)] dark:border-white/[0.08] dark:bg-[#171717] dark:shadow-[0_24px_90px_rgba(0,0,0,0.55)]">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(245,121,59,0.12),_transparent_36%)] dark:bg-[radial-gradient(circle_at_top_left,_rgba(245,121,59,0.16),_transparent_38%)]" />

                <div className="relative border-b border-black/[0.06] px-6 py-5 dark:border-white/[0.08]">
                    <div className="flex items-start justify-between gap-4">
                        <div className="flex items-start gap-4">
                            <div className="flex h-14 w-14 items-center justify-center rounded-[20px] bg-gradient-primary text-white shadow-[0_16px_34px_rgba(245,121,59,0.28)]">
                                <User size={24} />
                            </div>
                            <div>
                                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-primary">
                                    Time comercial
                                </p>
                                <h2 className="mt-2 text-2xl font-display font-bold tracking-tight text-text-primary sm:text-[30px]">
                                    {isEditing ? 'Editar vendedor' : 'Adicionar vendedor'}
                                </h2>
                                <p className="mt-2 max-w-2xl text-sm leading-6 text-text-secondary">
                                    Centralize os dados do vendedor e vincule a linha certa do WhatsApp sem quebrar a operacao atual.
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

                <div className="relative max-h-[calc(100vh-220px)] overflow-y-auto px-6 py-6">
                    <div className="grid gap-5 lg:grid-cols-[1.4fr,0.9fr]">
                        <section className="rounded-[28px] border border-black/[0.06] bg-white/[0.9] p-5 shadow-[0_16px_40px_rgba(15,23,42,0.05)] dark:border-white/[0.08] dark:bg-white/[0.03]">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-primary">
                                Dados do vendedor
                            </p>

                            <div className="mt-5 grid gap-4 sm:grid-cols-2">
                                <label className="block text-sm">
                                    <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">Nome</span>
                                    <input
                                        value={formData.name}
                                        onChange={(event) => setFormData((current) => ({ ...current, name: event.target.value }))}
                                        className="h-12 w-full rounded-2xl border border-black/[0.07] bg-white px-4 text-sm text-text-primary outline-none transition-all placeholder:text-text-muted focus:border-primary/35 focus:ring-4 focus:ring-primary/10 dark:border-white/[0.08] dark:bg-white/[0.04]"
                                        placeholder="Ex: Marina Costa"
                                    />
                                </label>

                                <label className="block text-sm">
                                    <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">Telefone</span>
                                    <input
                                        value={formData.phoneNumber}
                                        onChange={(event) => setFormData((current) => ({ ...current, phoneNumber: event.target.value }))}
                                        className="h-12 w-full rounded-2xl border border-black/[0.07] bg-white px-4 text-sm text-text-primary outline-none transition-all placeholder:text-text-muted focus:border-primary/35 focus:ring-4 focus:ring-primary/10 dark:border-white/[0.08] dark:bg-white/[0.04]"
                                        placeholder="(11) 99999-9999"
                                    />
                                </label>

                                <label className="block text-sm">
                                    <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">Email</span>
                                    <input
                                        value={formData.email}
                                        onChange={(event) => setFormData((current) => ({ ...current, email: event.target.value }))}
                                        className="h-12 w-full rounded-2xl border border-black/[0.07] bg-white px-4 text-sm text-text-primary outline-none transition-all placeholder:text-text-muted focus:border-primary/35 focus:ring-4 focus:ring-primary/10 dark:border-white/[0.08] dark:bg-white/[0.04]"
                                        placeholder="marina@empresa.com"
                                    />
                                </label>

                                <label className="block text-sm">
                                    <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">Cargo</span>
                                    <input
                                        value={formData.role}
                                        onChange={(event) => setFormData((current) => ({ ...current, role: event.target.value }))}
                                        className="h-12 w-full rounded-2xl border border-black/[0.07] bg-white px-4 text-sm text-text-primary outline-none transition-all placeholder:text-text-muted focus:border-primary/35 focus:ring-4 focus:ring-primary/10 dark:border-white/[0.08] dark:bg-white/[0.04]"
                                        placeholder="Closer, SDR, consultor..."
                                    />
                                </label>
                            </div>

                            <label className="mt-4 block text-sm">
                                <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">Observacoes</span>
                                <textarea
                                    value={formData.notes}
                                    onChange={(event) => setFormData((current) => ({ ...current, notes: event.target.value }))}
                                    rows={5}
                                    className="w-full rounded-[24px] border border-black/[0.07] bg-white px-4 py-3 text-sm text-text-primary outline-none transition-all placeholder:text-text-muted focus:border-primary/35 focus:ring-4 focus:ring-primary/10 dark:border-white/[0.08] dark:bg-white/[0.04]"
                                    placeholder="Notas operacionais, segmento atendido, acordos de escala..."
                                />
                            </label>
                        </section>

                        <section className="rounded-[28px] border border-black/[0.06] bg-white/[0.9] p-5 shadow-[0_16px_40px_rgba(15,23,42,0.05)] dark:border-white/[0.08] dark:bg-white/[0.03]">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-primary">
                                Operacao
                            </p>

                            <div className="mt-5 space-y-4">
                                <label className="block text-sm">
                                    <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">Status operacional</span>
                                    <select
                                        value={formData.status}
                                        onChange={(event) => setFormData((current) => ({ ...current, status: event.target.value }))}
                                        className="h-12 w-full rounded-2xl border border-black/[0.07] bg-white px-4 text-sm text-text-primary outline-none transition-all focus:border-primary/35 focus:ring-4 focus:ring-primary/10 dark:border-white/[0.08] dark:bg-white/[0.04]"
                                    >
                                        <option value="online">Online</option>
                                        <option value="offline">Offline</option>
                                        <option value="inactive">Inativo</option>
                                    </select>
                                </label>

                                <label className="block text-sm">
                                    <span className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">
                                        <Smartphone size={14} />
                                        Conexao principal
                                    </span>
                                    <select
                                        value={formData.primaryConnectionId}
                                        onChange={(event) => setFormData((current) => ({ ...current, primaryConnectionId: event.target.value }))}
                                        className="h-12 w-full rounded-2xl border border-black/[0.07] bg-white px-4 text-sm text-text-primary outline-none transition-all focus:border-primary/35 focus:ring-4 focus:ring-primary/10 dark:border-white/[0.08] dark:bg-white/[0.04]"
                                    >
                                        <option value="">Vincular depois</option>
                                        {instances.map((instance) => {
                                            const currentOwner = instance.connected_seller_id && instance.connected_seller_id !== seller?.id
                                                ? ` • ${instance.connected_seller_name || 'Ja vinculada'}`
                                                : '';

                                            return (
                                                <option key={instance.id} value={instance.id}>
                                                    {instance.instance_name}{isInstanceConnected(instance.status) ? ' • online' : ' • offline'}{currentOwner}
                                                </option>
                                            );
                                        })}
                                    </select>
                                </label>

                                <div className="rounded-[24px] border border-black/[0.06] bg-[#F8F8FA] p-4 dark:border-white/[0.08] dark:bg-[#111214]">
                                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-text-muted">
                                        Regras do fluxo
                                    </p>
                                    <div className="mt-3 space-y-2 text-sm leading-6 text-text-secondary">
                                        <p>O vendedor pode ser criado sem conexao e receber vinculo depois.</p>
                                        <p>Se a linha escolhida ja estiver em outro vendedor, o sistema exige transferencia explicita.</p>
                                        <p>A conexao principal define o contexto padrao do Live Chat filtrado por vendedor.</p>
                                    </div>
                                </div>
                            </div>
                        </section>
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
                        {loading ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                        {isEditing ? 'Salvar vendedor' : 'Criar vendedor'}
                    </button>
                </div>
            </div>
        </div>
    );
}
