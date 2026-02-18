import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import {
    Search,
    CheckCircle2,
    XCircle,
    Edit3,
    MousePointer2,
    UserPlus,
    X,
    DollarSign,
    Users as UsersIcon
} from 'lucide-react';

interface Partner {
    id: string;
    affiliate_code: string;
    user_name: string;
    user_email: string;
    commission_percentage: string;
    status: string;
    total_clicks: string;
    total_leads: string;
    wallet_balance_pending: string;
    wallet_balance_available: string;
    created_at: string;
}

export const AdminPartners: React.FC = () => {
    const { token } = useAuth();
    const [partners, setPartners] = useState<Partner[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [showAddModal, setShowAddModal] = useState(false);
    const [newPartnerForm, setNewPartnerForm] = useState({ email: '', name: '' });
    const [formError, setFormError] = useState('');

    useEffect(() => {
        fetchPartners();
    }, []);

    const fetchPartners = async () => {
        try {
            const res = await fetch('http://localhost:3000/api/admin/partners', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            if (res.ok) {
                const data = await res.json();
                setPartners(data);
            }
        } catch (error) {
            console.error('Error fetching partners:', error);
        } finally {
            setLoading(false);
        }
    };

    const updatePartnerStatus = async (id: string, status: string) => {
        try {
            await fetch(`http://localhost:3000/api/admin/partners/${id}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ status })
            });
            fetchPartners();
        } catch (error) {
            console.error('Error updating partner:', error);
        }
    };

    const updateCommission = async (id: string, percentage: string) => {
        const newPercentage = prompt('Nova porcentagem de comissão:', percentage);
        if (!newPercentage) return;

        try {
            await fetch(`http://localhost:3000/api/admin/partners/${id}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ commissionPercentage: parseFloat(newPercentage) })
            });
            fetchPartners();
        } catch (error) {
            console.error('Error updating commission:', error);
        }
    };

    const handleAddPartner = async () => {
        setFormError('');
        if (!newPartnerForm.email) {
            setFormError('Email é obrigatório');
            return;
        }

        try {
            const res = await fetch('http://localhost:3000/api/admin/partners', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(newPartnerForm)
            });

            const data = await res.json();
            if (res.ok) {
                setShowAddModal(false);
                setNewPartnerForm({ email: '', name: '' });
                fetchPartners();
            } else {
                setFormError(data.error || 'Erro ao criar parceiro');
            }
        } catch (error) {
            setFormError('Erro de conexão');
        }
    };

    const filteredPartners = partners.filter(p =>
        p.user_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.user_email.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.affiliate_code.toLowerCase().includes(searchTerm.toLowerCase())
    );

    if (loading) return <div className="p-8">Carregando...</div>;

    return (
        <div className="p-8 space-y-8 animate-in fade-in duration-500">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold bg-gradient-to-r from-[#7C3AED] via-[#D4AF37] to-[#7C3AED] bg-size-200 animate-gradient-x bg-clip-text text-transparent">
                        Gestão de Parceiros
                    </h1>
                    <p className="text-muted-foreground">Gerencie afiliados, comissões e pagamentos</p>
                </div>
                <button
                    onClick={() => setShowAddModal(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-600 to-amber-600 text-white rounded-lg hover:shadow-lg hover:shadow-purple-500/30 transition-all font-medium"
                >
                    <UserPlus className="w-5 h-5" />
                    Novo Parceiro
                </button>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 animate-in slide-in-from-bottom-4 duration-500 delay-100">
                <StatCard
                    title="Total de Parceiros"
                    value={partners.length}
                    icon={<UsersIcon className="w-6 h-6 text-purple-500" />}
                    trend={`${partners.filter(p => p.status === 'active').length} ativos`}
                    color="from-purple-500/10 to-blue-500/10"
                />
                <StatCard
                    title="Leads Gerados"
                    value={partners.reduce((acc, p) => acc + parseInt(p.total_leads), 0)}
                    icon={<MousePointer2 className="w-6 h-6 text-amber-500" />}
                    trend="Total acumulado"
                    color="from-amber-500/10 to-orange-500/10"
                />
                <StatCard
                    title="Comissões Pendentes"
                    value={`R$ ${partners.reduce((acc, p) => acc + parseFloat(p.wallet_balance_pending), 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
                    icon={<DollarSign className="w-6 h-6 text-emerald-500" />}
                    trend="Aguardando liberação"
                    color="from-emerald-500/10 to-teal-500/10"
                />
            </div>

            {/* Search */}
            <div className="bg-card border border-purple-500/20 rounded-xl overflow-hidden shadow-xl animate-in slide-in-from-bottom-4 duration-500 delay-200">
                <div className="p-6 border-b border-purple-500/20 flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="relative flex-1 max-w-md">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
                        <input
                            type="text"
                            placeholder="Buscar por nome, email ou código..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full bg-card border border-purple-500/20 rounded-lg pl-10 pr-4 py-2 focus:ring-2 focus:ring-purple-500/50 outline-none transition-all"
                        />
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead className="bg-muted/50 text-muted-foreground font-medium text-sm">
                            <tr>
                                <th className="px-6 py-4">Parceiro</th>
                                <th className="px-6 py-4">Código</th>
                                <th className="px-6 py-4 text-center">Status</th>
                                <th className="px-6 py-4 text-center">Comissão</th>
                                <th className="px-6 py-4 text-center">Cliques/Leads</th>
                                <th className="px-6 py-4 text-right">Saldo (Disp/Pend)</th>
                                <th className="px-6 py-4 text-right">Ações</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-purple-500/10">
                            {filteredPartners.map((partner) => (
                                <tr key={partner.id} className="hover:bg-purple-500/5 transition-colors group">
                                    <td className="px-6 py-4">
                                        <div className="flex flex-col">
                                            <span className="font-semibold">{partner.user_name}</span>
                                            <span className="text-sm text-muted-foreground">{partner.user_email}</span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <code className="px-2 py-1 bg-muted/50 rounded text-xs font-mono">{partner.affiliate_code}</code>
                                    </td>
                                    <td className="px-6 py-4 text-center">
                                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${partner.status === 'active'
                                            ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20'
                                            : 'bg-red-500/10 text-red-500 border border-red-500/20'
                                            }`}>
                                            {partner.status === 'active' ? 'Ativo' : 'Inativo'}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-center text-sm font-mono text-amber-500">
                                        {Number(partner.commission_percentage)}%
                                    </td>
                                    <td className="px-6 py-4 text-center text-sm">
                                        <div className="flex justify-center gap-4">
                                            <span title="Cliques" className="flex items-center gap-1 text-muted-foreground">
                                                <MousePointer2 className="w-3 h-3" /> {partner.total_clicks}
                                            </span>
                                            <span title="Leads" className="flex items-center gap-1 text-purple-500 font-medium">
                                                <UsersIcon className="w-3 h-3" /> {partner.total_leads}
                                            </span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-right text-sm">
                                        <div className="text-emerald-500 font-medium font-mono">R$ {Number(partner.wallet_balance_available).toFixed(2)}</div>
                                        <div className="text-amber-500/70 text-xs font-mono">R$ {Number(partner.wallet_balance_pending).toFixed(2)}</div>
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button
                                                onClick={() => updateCommission(partner.id, partner.commission_percentage)}
                                                className="p-2 hover:bg-amber-500/10 hover:text-amber-500 rounded-lg transition-all"
                                                title="Editar Comissão"
                                            >
                                                <Edit3 className="w-4 h-4" />
                                            </button>
                                            {partner.status === 'active' ? (
                                                <button
                                                    onClick={() => updatePartnerStatus(partner.id, 'inactive')}
                                                    className="p-2 hover:bg-red-500/10 hover:text-red-500 rounded-lg transition-all"
                                                    title="Desativar"
                                                >
                                                    <XCircle className="w-4 h-4" />
                                                </button>
                                            ) : (
                                                <button
                                                    onClick={() => updatePartnerStatus(partner.id, 'active')}
                                                    className="p-2 hover:bg-emerald-500/10 hover:text-emerald-500 rounded-lg transition-all"
                                                    title="Ativar"
                                                >
                                                    <CheckCircle2 className="w-4 h-4" />
                                                </button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Add Partner Modal */}
            {showAddModal && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 animate-in fade-in duration-200">
                    <div className="bg-card border border-purple-500/20 rounded-xl p-6 w-full max-w-md shadow-2xl shadow-purple-500/20 animate-in slide-in-from-bottom-4 duration-300">
                        <div className="flex items-center justify-between mb-6">
                            <h2 className="text-2xl font-bold bg-gradient-to-r from-purple-500 to-amber-500 bg-clip-text text-transparent">
                                Novo Parceiro
                            </h2>
                            <button
                                onClick={() => setShowAddModal(false)}
                                className="p-2 hover:bg-muted rounded-lg transition-all"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {formError && (
                            <div className="mb-4 p-3 bg-red-500/10 border border-red-500/50 rounded-lg text-red-500 text-sm">
                                {formError}
                            </div>
                        )}

                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium mb-1 text-muted-foreground">Email do Usuário *</label>
                                <input
                                    type="email"
                                    value={newPartnerForm.email}
                                    onChange={(e) => setNewPartnerForm({ ...newPartnerForm, email: e.target.value })}
                                    placeholder="email@usuario.com"
                                    className="w-full bg-background border border-purple-500/20 rounded-lg px-4 py-2 focus:ring-2 focus:ring-purple-500/50 outline-none transition-all"
                                />
                                <p className="text-xs text-text-muted mt-1">
                                    Se o usuário não existir, ele será criado automaticamente (adicione o nome abaixo).
                                </p>
                            </div>

                            <div>
                                <label className="block text-sm font-medium mb-1 text-muted-foreground">Nome (Opcional se usuário existir)</label>
                                <input
                                    type="text"
                                    value={newPartnerForm.name}
                                    onChange={(e) => setNewPartnerForm({ ...newPartnerForm, name: e.target.value })}
                                    placeholder="Nome do novo usuário"
                                    className="w-full bg-background border border-purple-500/20 rounded-lg px-4 py-2 focus:ring-2 focus:ring-purple-500/50 outline-none transition-all"
                                />
                            </div>

                            <div className="flex gap-3 pt-4">
                                <button
                                    onClick={() => setShowAddModal(false)}
                                    className="flex-1 px-4 py-2 border border-border rounded-lg hover:bg-muted transition-all text-text-secondary"
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={handleAddPartner}
                                    className="flex-1 px-4 py-2 bg-gradient-to-r from-purple-600 to-amber-600 text-white rounded-lg hover:shadow-lg hover:shadow-purple-500/30 transition-all font-medium"
                                >
                                    Adicionar
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

function StatCard({ title, value, icon, trend, color }: { title: string, value: string | number, icon: React.ReactNode, trend: string, color: string }) {
    return (
        <div className={`bg-card border border-purple-500/20 rounded-xl p-6 relative overflow-hidden group shadow-xl transition-all hover:scale-[1.02] duration-300 shadow-purple-500/5`}>
            <div className={`absolute inset-0 bg-gradient-to-br ${color} opacity-20 group-hover:opacity-30 transition-opacity`} />
            <div className="flex items-start justify-between relative z-10">
                <div className="space-y-2">
                    <p className="text-sm font-medium text-muted-foreground">{title}</p>
                    <h2 className="text-3xl font-bold font-mono text-foreground">{value}</h2>
                    <p className="text-xs text-muted-foreground flex items-center gap-1 font-semibold">
                        {trend}
                    </p>
                </div>
                <div className="p-3 bg-card border border-purple-500/10 rounded-lg group-hover:bg-purple-500/10 transition-colors">
                    {icon}
                </div>
            </div>
        </div>
    );
}


