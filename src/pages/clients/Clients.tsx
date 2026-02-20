import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import {
    UserCheck,
    DollarSign,
    TrendingUp,
    Building2,
    Phone,
    Mail,
    Search,
    RefreshCw,
    Trash2,
    Edit2,
    Package
} from 'lucide-react';
import { EditClientModal } from './components/EditClientModal';

export interface Client {
    id: string;
    name: string;
    company?: string;
    phone?: string;
    email?: string;
    value: number;
    status: string;
    tags: string[];
    source?: string;
    lastContact: string;
    createdAt: string;
    productId?: string;
    productName?: string;
    notes?: string;
}

interface ClientsData {
    clients: Client[];
    summary: {
        count: number;
        total_value: number;
    };
}

export function Clients() {
    const { user, token } = useAuth();
    const [data, setData] = useState<ClientsData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [search, setSearch] = useState('');
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [selectedClient, setSelectedClient] = useState<Client | null>(null);

    const formatCurrency = (value: number) => {
        return new Intl.NumberFormat('pt-BR', {
            style: 'currency',
            currency: 'BRL',
            maximumFractionDigits: 0
        }).format(value);
    };

    const fetchClients = async () => {
        if (!token) return;
        try {
            setLoading(true);
            const apiBase = '';
            const res = await fetch(`${apiBase}/api/clients`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                const json = await res.json();
                setData(json);
                setError(null);
            } else {
                const errBody = await res.text().catch(() => '');
                console.error('[Clients] Fetch failed:', res.status, errBody);
                setError(`Falha ao carregar clientes (${res.status}). Reinicie o servidor.`);
            }
        } catch {
            setError('Erro de conexão.');
        } finally {
            setLoading(false);
        }
    };

    const handleDeleteClient = async (clientId: string, clientName: string) => {
        if (!confirm(`Tem certeza que deseja excluir o cliente ${clientName}? Esta ação não pode ser desfeita.`)) return;

        try {
            const apiBase = '';
            const res = await fetch(`${apiBase}/api/leads/${clientId}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (res.ok) {
                if (data) {
                    const newClients = data.clients.filter(c => c.id !== clientId);
                    const newTotalValue = newClients.reduce((sum, c) => sum + Number(c.value), 0);
                    setData({
                        clients: newClients,
                        summary: {
                            count: newClients.length,
                            total_value: newTotalValue
                        }
                    });
                }
            } else {
                alert('Falha ao excluir cliente.');
            }
        } catch (error) {
            console.error('Delete client error:', error);
            alert('Erro de conexão ao excluir cliente.');
        }
    };

    const handleEditClient = (client: Client) => {
        setSelectedClient(client);
        setIsEditModalOpen(true);
    };

    const handleSaveClient = (updatedClient: any) => {
        if (data) {
            const newClients = data.clients.map(c =>
                c.id === updatedClient.id ? { ...c, ...updatedClient } : c
            );
            const newTotalValue = newClients.reduce((sum, c) => sum + Number(c.value), 0);
            setData({
                clients: newClients,
                summary: {
                    count: newClients.length,
                    total_value: newTotalValue
                }
            });
            fetchClients(); // Refresh to get joined product names
        }
    };

    useEffect(() => {
        if (user && token) fetchClients();
    }, [user, token]);

    const filteredClients = data?.clients.filter(c =>
        c.name.toLowerCase().includes(search.toLowerCase()) ||
        (c.company && c.company.toLowerCase().includes(search.toLowerCase())) ||
        (c.email && c.email.toLowerCase().includes(search.toLowerCase()))
    ) || [];

    const avgTicket = data && data.summary.count > 0
        ? data.summary.total_value / data.summary.count
        : 0;

    return (
        <div className="space-y-6 p-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-text-primary">Clientes</h1>
                    <p className="text-text-secondary text-sm">Leads convertidos em clientes</p>
                </div>
                <button
                    onClick={fetchClients}
                    disabled={loading}
                    className="flex items-center gap-2 px-4 py-2 bg-surface border border-border rounded-lg text-text-secondary hover:text-text-primary hover:border-primary/30 transition-all text-sm"
                >
                    <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
                    Atualizar
                </button>
            </div>

            {error && (
                <div className="bg-red-500/10 border border-red-500/20 text-red-500 p-4 rounded-xl">
                    <span className="font-semibold">Erro:</span> {error}
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-surface border border-border rounded-xl p-6 relative overflow-hidden group hover:border-primary/30 transition-colors">
                    <div className="flex justify-between items-start mb-4">
                        <div className="p-2.5 bg-primary/10 rounded-lg text-primary">
                            <UserCheck size={22} />
                        </div>
                    </div>
                    <div className="space-y-1">
                        <h3 className="text-text-secondary text-sm font-medium">Total de Clientes</h3>
                        <p className="text-3xl font-display font-bold text-text-primary">
                            {loading ? '...' : (data?.summary.count || 0)}
                        </p>
                        <p className="text-xs text-text-secondary">Leads convertidos</p>
                    </div>
                </div>

                <div className="bg-surface border border-border rounded-xl p-6 relative overflow-hidden group hover:border-green-500/30 transition-colors">
                    <div className="flex justify-between items-start mb-4">
                        <div className="p-2.5 bg-green-500/10 rounded-lg text-green-500">
                            <DollarSign size={22} />
                        </div>
                    </div>
                    <div className="space-y-1">
                        <h3 className="text-text-secondary text-sm font-medium">Receita Confirmada</h3>
                        <p className="text-3xl font-display font-bold text-text-primary">
                            {loading ? '...' : formatCurrency(data?.summary.total_value || 0)}
                        </p>
                        <p className="text-xs text-text-secondary">Valor total de negócios fechados</p>
                    </div>
                </div>

                <div className="bg-surface border border-border rounded-xl p-6 relative overflow-hidden group hover:border-purple-500/30 transition-colors">
                    <div className="flex justify-between items-start mb-4">
                        <div className="p-2.5 bg-purple-500/10 rounded-lg text-purple-500">
                            <TrendingUp size={22} />
                        </div>
                    </div>
                    <div className="space-y-1">
                        <h3 className="text-text-secondary text-sm font-medium">Ticket Médio</h3>
                        <p className="text-3xl font-display font-bold text-text-primary">
                            {loading ? '...' : formatCurrency(avgTicket)}
                        </p>
                        <p className="text-xs text-text-secondary">Valor médio por cliente</p>
                    </div>
                </div>
            </div>

            <div className="bg-surface border border-border rounded-xl overflow-hidden">
                <div className="p-4 border-b border-border/50">
                    <div className="relative max-w-md">
                        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                        <input
                            type="text"
                            placeholder="Buscar cliente..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="w-full pl-10 pr-4 py-2.5 bg-background border border-border rounded-lg text-text-primary placeholder:text-text-muted text-sm focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-all"
                        />
                    </div>
                </div>

                {loading ? (
                    <div className="flex items-center justify-center py-16">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
                    </div>
                ) : filteredClients.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-text-muted">
                        <UserCheck size={48} className="mb-4 opacity-30" />
                        <p className="text-lg font-medium">
                            {search ? 'Nenhum cliente encontrado' : 'Nenhum cliente ainda'}
                        </p>
                        <p className="text-sm mt-1">
                            {search ? 'Tente ajustar a busca' : 'Marque um lead como "Cliente" no CRM para vê-lo aqui'}
                        </p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="border-b border-border/50 text-left">
                                    <th className="px-6 py-3 text-xs font-semibold text-text-muted uppercase tracking-wider">Nome</th>
                                    <th className="px-6 py-3 text-xs font-semibold text-text-muted uppercase tracking-wider">Empresa</th>
                                    <th className="px-6 py-3 text-xs font-semibold text-text-muted uppercase tracking-wider">Contato</th>
                                    <th className="px-6 py-3 text-xs font-semibold text-text-muted uppercase tracking-wider">Valor</th>
                                    <th className="px-6 py-3 text-xs font-semibold text-text-muted uppercase tracking-wider">Produto</th>
                                    <th className="px-6 py-3 text-xs font-semibold text-text-muted uppercase tracking-wider">Fonte</th>
                                    <th className="px-6 py-3 text-xs font-semibold text-text-muted uppercase tracking-wider text-right">Ações</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border/30">
                                {filteredClients.map((client) => (
                                    <tr key={client.id} className="hover:bg-surfaceHover/50 transition-colors">
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-3">
                                                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-green-500/20 to-emerald-500/20 border border-green-500/20 flex items-center justify-center text-xs font-bold text-green-500">
                                                    {client.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                                                </div>
                                                <div className="flex flex-col">
                                                    <span className="text-sm font-medium text-text-primary">{client.name}</span>
                                                    {client.notes && (
                                                        <span className="text-[10px] text-text-muted truncate max-w-[150px]" title={client.notes}>
                                                            {client.notes}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-1.5 text-sm text-text-secondary">
                                                {client.company ? (
                                                    <>
                                                        <Building2 size={14} className="text-text-muted" />
                                                        {client.company}
                                                    </>
                                                ) : (
                                                    <span className="text-text-muted">—</span>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="space-y-1">
                                                {client.phone && (
                                                    <div className="flex items-center gap-1.5 text-xs text-text-secondary">
                                                        <Phone size={12} className="text-text-muted" />
                                                        {client.phone}
                                                    </div>
                                                )}
                                                {client.email && (
                                                    <div className="flex items-center gap-1.5 text-xs text-text-secondary">
                                                        <Mail size={12} className="text-text-muted" />
                                                        {client.email}
                                                    </div>
                                                )}
                                                {!client.phone && !client.email && (
                                                    <span className="text-xs text-text-muted">—</span>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className="text-sm font-semibold text-green-500">
                                                {formatCurrency(client.value)}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4">
                                            {client.productName ? (
                                                <div className="flex items-center gap-1.5 text-xs text-primary font-medium bg-primary/5 px-2 py-1 rounded-lg w-fit border border-primary/10">
                                                    <Package size={12} />
                                                    {client.productName}
                                                </div>
                                            ) : (
                                                <span className="text-xs text-text-muted">—</span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4">
                                            {client.source ? (
                                                <span className="text-xs bg-primary/10 text-primary px-2 py-1 rounded-full font-medium">
                                                    {client.source}
                                                </span>
                                            ) : (
                                                <span className="text-xs text-text-muted">—</span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <div className="flex items-center justify-end gap-2">
                                                <button
                                                    onClick={() => handleEditClient(client)}
                                                    className="p-2 text-text-muted hover:text-primary hover:bg-primary/10 rounded-lg transition-all"
                                                    title="Editar Cliente"
                                                >
                                                    <Edit2 size={16} />
                                                </button>
                                                <button
                                                    onClick={() => handleDeleteClient(client.id, client.name)}
                                                    className="p-2 text-text-muted hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-all"
                                                    title="Excluir Cliente"
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {selectedClient && (
                <EditClientModal
                    isOpen={isEditModalOpen}
                    onClose={() => setIsEditModalOpen(false)}
                    onSave={handleSaveClient}
                    client={selectedClient}
                />
            )}
        </div>
    );
}
