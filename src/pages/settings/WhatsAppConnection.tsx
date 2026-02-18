import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, CheckCircle2, AlertCircle, Smartphone, Plus, Trash2, RefreshCw } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

// API Base URL (Backend)
const API_URL = 'http://127.0.0.1:3000/api';

type ConnectionStatus = 'checking' | 'idle' | 'connecting' | 'qrcode' | 'connected' | 'error';

interface WhatsAppInstance {
    id: string;
    instance_name: string;
    status: string;
    created_at: string;
}

export function WhatsAppConnection() {
    const { user } = useAuth();
    const navigate = useNavigate();

    // State
    const [instances, setInstances] = useState<WhatsAppInstance[]>([]);
    const [loading, setLoading] = useState(true);
    const [showNewConnectionModal, setShowNewConnectionModal] = useState(false);
    const [showLimitModal, setShowLimitModal] = useState(false);

    // New Connection State
    const [newLabel, setNewLabel] = useState('');
    const [connectStatus, setConnectStatus] = useState<ConnectionStatus>('idle');
    const [qrCode, setQrCode] = useState<string | null>(null);
    const [connectError, setConnectError] = useState<string | null>(null);
    const [timer, setTimer] = useState(60);

    const pollInterval = useRef<ReturnType<typeof setInterval> | null>(null);

    // Initial Load
    useEffect(() => {
        fetchInstances();
        return () => stopPolling();
    }, [user?.email]);

    // Timer Logic for QR
    useEffect(() => {
        let interval: ReturnType<typeof setInterval>;
        if (connectStatus === 'qrcode' && timer > 0) {
            interval = setInterval(() => setTimer((prev) => prev - 1), 1000);
        } else if (timer === 0 && connectStatus === 'qrcode') {
            handleCreateConnection(true); // silent refresh
        }
        return () => clearInterval(interval);
    }, [connectStatus, timer]);

    const stopPolling = () => {
        if (pollInterval.current) {
            clearInterval(pollInterval.current);
            pollInterval.current = null;
        }
    };

    const fetchInstances = async () => {
        if (!user) return;
        try {
            const res = await fetch(`${API_URL}/instances`, {
                headers: { 'Authorization': `Bearer ${(user as any)?.token || ''}` }
            });
            if (res.ok) {
                const data = await res.json();
                setInstances(data);
            }
        } catch (err) {
            console.error('Error fetching instances:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleCreateConnection = async (isRefresh = false) => {
        if (!user?.email) return;

        if (!isRefresh) {
            setConnectStatus('connecting');
            setConnectError(null);
            setTimer(60);
        }

        try {
            const res = await fetch(`${API_URL}/whatsapp/connect`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${(user as any)?.token || ''}`
                },
                body: JSON.stringify({
                    email: user.email,
                    instanceLabel: newLabel
                })
            });

            const data = await res.json();

            if (!res.ok) {
                if (data.upgradeRequired) {
                    throw new Error('Limite de conexões atingido. Faça upgrade do plano.');
                }
                throw new Error(data.error || 'Erro ao conectar');
            }

            // Connection successful (already connected)
            if (data.instance?.status === 'CONNECTED' || data.instance?.status === 'open') {
                setConnectStatus('connected');
                stopPolling();
                fetchInstances(); // Refresh list
                setTimeout(() => {
                    setShowNewConnectionModal(false);
                    // Reset state
                    setConnectStatus('idle');
                    setNewLabel('');
                }, 2000);
                return;
            }

            // QR Code received
            if (data.qrCode) {
                setQrCode(data.qrCode);

                if (connectStatus !== 'qrcode') {
                    setConnectStatus('qrcode');
                    startPolling(data.instance.instance_name);
                }
            } else {
                if (!isRefresh) {
                    setConnectError('Não foi possível obter o QR Code. Tente novamente.');
                    setConnectStatus('error');
                }
            }

        } catch (err: any) {
            console.error('Connect error:', err);
            if (!isRefresh) {
                setConnectError(err.message || 'Erro ao gerar acesso');
                setConnectStatus('error');
            }
        }
    };

    const startPolling = (instanceName: string) => {
        stopPolling();
        pollInterval.current = setInterval(async () => {
            try {
                // Poll our backend for status updates
                const res = await fetch(`${API_URL}/instances`, {
                    headers: { 'Authorization': `Bearer ${(user as any)?.token || ''}` }
                });
                if (res.ok) {
                    const data = await res.json();
                    const target = data.find((i: any) => i.instance_name === instanceName);

                    if (target && target.status === 'CONNECTED') {
                        setInstances(data);
                        setConnectStatus('connected');
                        setQrCode(null);
                        stopPolling();
                        setTimeout(() => {
                            setShowNewConnectionModal(false);
                            setConnectStatus('idle');
                            setNewLabel('');
                        }, 2000);
                    }
                }
            } catch (e) { /* ignore */ }
        }, 3000);
    };

    const handleDelete = async (id: string, name: string) => {
        if (!confirm(`Tem certeza que deseja desconectar ${name}?`)) return;

        try {
            await fetch(`${API_URL}/instance/${id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${(user as any)?.token || ''}` }
            });
            fetchInstances();
        } catch (err) {
            alert('Erro ao desconectar');
        }
    };

    // --- RENDER ---

    if (loading) {
        return (
            <div className="min-h-[60vh] flex items-center justify-center">
                <Loader2 size={32} className="text-primary animate-spin" />
            </div>
        );
    }

    return (
        <div className="p-6 h-full flex flex-col max-w-7xl mx-auto w-full">
            <div className="flex items-center justify-between mb-8">
                <div>
                    <h1 className="text-2xl font-bold text-text-primary mb-1">Conexões WhatsApp</h1>
                    <p className="text-text-secondary text-sm">Gerencie suas instâncias conectadas e adicione novos números.</p>
                </div>
                <button
                    onClick={() => {
                        if (instances.length >= 1) {
                            setShowLimitModal(true);
                        } else {
                            setShowNewConnectionModal(true);
                            setConnectStatus('idle');
                            setNewLabel('');
                            setConnectError(null);
                            setQrCode(null);
                        }
                    }}
                    className="bg-primary hover:bg-primary-dark text-white px-5 py-2.5 rounded-xl flex items-center gap-2 font-medium transition-all shadow-lg shadow-primary/20 hover:shadow-primary/30"
                >
                    <Plus size={20} />
                    Nova Conexão
                </button>
            </div>

            {/* Instance Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {instances.map((instance) => (
                    <div key={instance.id} className="bg-surface border border-border rounded-xl p-6 shadow-sm hover:shadow-md transition-all group flex flex-col">
                        <div className="flex items-start justify-between mb-4">
                            <div className="w-12 h-12 bg-green-500/10 rounded-full flex items-center justify-center">
                                <Smartphone size={24} className="text-green-500" />
                            </div>
                            <div className={`px-2.5 py-1 rounded-full text-xs font-bold border ${instance.status === 'CONNECTED'
                                ? 'bg-green-500/10 text-green-500 border-green-500/20'
                                : 'bg-red-500/10 text-red-500 border-red-500/20'
                                }`}>
                                {instance.status === 'CONNECTED' ? 'ONLINE' : 'OFFLINE'}
                            </div>
                        </div>

                        <h3 className="font-bold text-text-primary text-lg mb-1 truncate" title={instance.instance_name}>
                            {instance.instance_name.includes('_')
                                ? instance.instance_name.split('_').slice(1).join(' ') // Show label part nicely
                                : instance.instance_name}
                        </h3>
                        <p className="text-xs text-text-muted mb-6 font-mono truncate" title={instance.instance_name}>
                            ID: {instance.instance_name}
                        </p>

                        <div className="mt-auto pt-4 border-t border-border/50">
                            <button
                                onClick={() => handleDelete(instance.id, instance.instance_name)}
                                className="w-full flex items-center justify-center gap-2 text-red-400 hover:text-red-500 hover:bg-red-500/10 py-2.5 rounded-lg text-sm font-medium transition-colors"
                            >
                                <Trash2 size={16} />
                                Desconectar
                            </button>
                        </div>
                    </div>
                ))}

                {instances.length === 0 && (
                    <div className="col-span-full py-20 text-center border-2 border-dashed border-border/50 rounded-2xl bg-surface/30 flex flex-col items-center justify-center">
                        <div className="w-20 h-20 bg-surface border border-border rounded-full flex items-center justify-center mb-6 shadow-sm">
                            <Smartphone size={40} className="text-text-muted" />
                        </div>
                        <h3 className="text-xl font-bold text-text-primary mb-2">Nenhuma conexão ativa</h3>
                        <p className="text-text-secondary max-w-sm mx-auto mb-8">
                            Conecte seu WhatsApp para habilitar as funcionalidades de IA e CRM.
                        </p>
                        <button
                            onClick={() => {
                                if (instances.length >= 1) {
                                    setShowLimitModal(true);
                                } else {
                                    setShowNewConnectionModal(true);
                                }
                            }}
                            className="text-primary hover:text-primary-dark font-semibold border-b-2 border-primary/20 hover:border-primary transition-all pb-0.5"
                        >
                            Conectar agora
                        </button>
                    </div>
                )}
            </div>

            {/* Limit Reached Modal */}
            {
                showLimitModal && (
                    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
                        <div className="bg-surface border border-red-500/20 w-full max-w-md rounded-2xl shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
                            <div className="p-6 text-center">
                                <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-6">
                                    <AlertCircle size={32} className="text-red-500" />
                                </div>

                                <h2 className="text-xl font-bold text-text-primary mb-2">Limite de Conexões Atingido</h2>
                                <p className="text-text-secondary mb-6">
                                    Você atingiu o limite de conexões. Para adicionar mais números de WhatsApp, faça um upgrade.
                                </p>

                                <div className="bg-surface-secondary/50 p-4 rounded-xl mb-6 text-left border border-border">
                                    <div className="flex items-center justify-between mb-1">
                                        <span className="font-medium text-text-primary">Conexão Extra</span>
                                        <span className="font-bold text-primary">R$ 9,90<span className="text-xs text-text-muted font-normal">/mês</span></span>
                                    </div>
                                    <p className="text-xs text-text-muted">Cobrança mensal recorrente para manter a conexão ativa.</p>
                                </div>

                                <div className="flex gap-3">
                                    <button
                                        onClick={() => setShowLimitModal(false)}
                                        className="flex-1 px-4 py-3 bg-surface border border-border rounded-xl text-text-secondary font-medium hover:bg-surface-secondary transition-colors"
                                    >
                                        Cancelar
                                    </button>
                                    <button
                                        onClick={() => navigate('/billing')}
                                        className="flex-1 px-4 py-3 bg-primary text-white rounded-xl font-bold hover:bg-primary-dark transition-colors shadow-lg shadow-primary/20"
                                    >
                                        Ir para Faturamento
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* New Connection Modal */}
            {
                showNewConnectionModal && (
                    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                        <div className="bg-surface border border-border w-full max-w-md rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200" onClick={(e) => e.stopPropagation()}>
                            <div className="p-6">
                                <h2 className="text-xl font-bold text-text-primary mb-4">Nova Conexão</h2>

                                {/* ERROR */}
                                {connectError && (
                                    <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-start gap-3 text-red-500 text-sm">
                                        <AlertCircle size={18} className="shrink-0 mt-0.5" />
                                        <div>{connectError}</div>
                                    </div>
                                )}

                                {/* IDLE FORM */}
                                {connectStatus === 'idle' || connectStatus === 'error' ? (
                                    <div className="space-y-5">
                                        <div>
                                            <label className="block text-sm font-medium text-text-secondary mb-2">
                                                Nome da Identificação (Opcional)
                                            </label>
                                            <input
                                                type="text"
                                                placeholder="Ex: Vendas, Suporte..."
                                                value={newLabel}
                                                onChange={e => setNewLabel(e.target.value)}
                                                className="w-full bg-background border border-border rounded-xl px-4 py-3 text-text-primary focus:ring-2 focus:ring-primary/50 outline-none transition-all placeholder:text-text-muted/50"
                                                autoFocus
                                            />
                                            <p className="text-xs text-text-muted mt-2">
                                                Use um nome para identificar facilmente esta conexão no painel.
                                            </p>
                                        </div>
                                        <button
                                            onClick={() => handleCreateConnection()}
                                            className="w-full bg-primary hover:bg-primary-dark text-white font-bold py-3.5 rounded-xl transition-all shadow-lg shadow-primary/20 flex items-center justify-center gap-2 text-base active:scale-[0.98]"
                                        >
                                            <Smartphone size={20} />
                                            Gerar QRCode
                                        </button>
                                    </div>
                                ) : null}

                                {/* CONNECTING */}
                                {connectStatus === 'connecting' && (
                                    <div className="py-12 flex flex-col items-center">
                                        <Loader2 size={48} className="text-primary animate-spin mb-6" />
                                        <p className="text-text-primary font-medium">Iniciando instância...</p>
                                        <p className="text-text-muted text-sm mt-1">Isso pode levar alguns segundos.</p>
                                    </div>
                                )}

                                {/* QR CODE */}
                                {connectStatus === 'qrcode' && qrCode && (
                                    <div className="flex flex-col items-center">
                                        <div className="relative p-3 bg-white rounded-xl mb-6 shadow-sm border border-border group overflow-hidden">
                                            <img src={qrCode} alt="QR Code" className="w-64 h-64 object-contain mix-blend-multiply" />

                                            <div className="absolute inset-0 bg-black/5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />

                                            <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 bg-background border border-border px-3 py-1 rounded-full text-xs font-mono font-bold text-text-primary shadow-lg flex items-center gap-2">
                                                <RefreshCw size={10} className="animate-spin" />
                                                Atualiza em {timer}s
                                            </div>
                                        </div>

                                        <div className="text-center space-y-2 mb-2">
                                            <p className="text-sm font-medium text-text-primary">
                                                Abra o WhatsApp no seu celular
                                            </p>
                                            <p className="text-sm text-text-secondary">
                                                Toque em <span className="font-bold text-text-primary">Mais opções</span> ou <span className="font-bold text-text-primary">Configurações</span> e selecione <span className="font-bold text-text-primary">Aparelhos Conectados</span> {'>'} <span className="font-bold text-primary">Conectar um aparelho</span>.
                                            </p>
                                        </div>

                                        <div className="mt-6 flex items-center gap-2 text-xs text-text-muted bg-surface-secondary px-3 py-1.5 rounded-full">
                                            <Loader2 size={12} className="animate-spin" />
                                            Aguardando conexão...
                                        </div>
                                    </div>
                                )}

                                {/* CONNECTED SUCCESS */}
                                {connectStatus === 'connected' && (
                                    <div className="py-12 flex flex-col items-center text-center animate-in zoom-in-50 duration-300">
                                        <div className="w-20 h-20 bg-green-500/10 rounded-full flex items-center justify-center mb-6">
                                            <CheckCircle2 size={40} className="text-green-500" />
                                        </div>
                                        <h3 className="text-2xl font-bold text-text-primary mb-2">Conectado!</h3>
                                        <p className="text-text-secondary">Sua nova instância foi configurada com sucesso.</p>
                                    </div>
                                )}
                            </div>

                            {/* Footer (Cancel Button) */}
                            <div className="bg-background-secondary/30 p-4 border-t border-border flex justify-end">
                                <button
                                    onClick={() => {
                                        setShowNewConnectionModal(false);
                                        stopPolling();
                                    }}
                                    className="text-text-secondary hover:text-text-primary font-medium text-sm px-4 py-2 hover:bg-surface rounded-lg transition-colors"
                                >
                                    {connectStatus === 'connected' ? 'Fechar' : 'Cancelar'}
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }
        </div >
    );
}
