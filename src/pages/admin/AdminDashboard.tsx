
import { useState, useEffect } from 'react';
import {
    Search,
    Edit2,
    Filter,
    UserPlus,
    X,
    Trash2,
    CalendarDays
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { OverviewTab } from './dashboard/OverviewTab';
import { ProductsTab } from './dashboard/ProductsTab';
import { AdsTab } from './dashboard/AdsTab';



interface AdminUser {
    id: string;
    name: string;
    email: string;
    koins_balance: number;
    created_at: string;
    role: string;
    company_name: string;
    plan_type: string;
}

interface ConsumptionLog {
    user_name: string;
    total_prompt_tokens: number;
    total_completion_tokens: number;
    total_cost: number;
    estimated_koins_spent: number;
}

export function AdminDashboard() {
    const { token } = useAuth();
    const [activeTab, setActiveTab] = useState<'overview' | 'products' | 'ads' | 'users'>('overview');
    const [period, setPeriod] = useState<string>('30d');
    const [strategicData, setStrategicData] = useState<any>(null);
    const [users, setUsers] = useState<AdminUser[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [showAddUserModal, setShowAddUserModal] = useState(false);
    const [newUserForm, setNewUserForm] = useState({ email: '', name: '', role: 'user' });
    const [formError, setFormError] = useState('');
    const [formSuccess, setFormSuccess] = useState('');

    const apiBase = '';

    useEffect(() => {
        fetchData();
    }, [activeTab, period]);

    const fetchData = async () => {
        setLoading(true);
        try {
            const headers = { 'Authorization': `Bearer ${token}` };

            if (activeTab === 'overview' || activeTab === 'products' || activeTab === 'ads') {
                const res = await fetch(`${apiBase}/api/admin/strategic-metrics?period=${period}`, { headers });
                const data = await res.json();
                setStrategicData(data);
            } else if (activeTab === 'users') {
                const res = await fetch(`${apiBase}/api/admin/users`, { headers });
                const data = await res.json();
                setUsers(Array.isArray(data) ? data : []);
            }
        } catch (error) {
            console.error('Error fetching admin data:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleEditKoins = async (userId: string, currentBalance: number) => {
        const amount = prompt(`Ajustar saldo de Koins (atual: ${currentBalance}). Digite o valor para ADICIONAR (ex: 100) ou REMOVER (ex: -50):`);
        if (amount && !isNaN(parseInt(amount))) {
            try {
                const res = await fetch(`${apiBase}/api/admin/users/${userId}/koins`, {
                    method: 'PATCH',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ amount: parseInt(amount) })
                });
                if (res.ok) {
                    fetchData();
                }
            } catch (error) {
                alert('Erro ao atualizar saldo.');
            }
        }
    };

    const handleAddUser = async () => {
        setFormError('');
        setFormSuccess('');

        // Validate form
        if (!newUserForm.email || !newUserForm.name) {
            setFormError('Email e nome são obrigatórios');
            return;
        }

        try {
            const res = await fetch(`${apiBase}/api/admin/users`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(newUserForm)
            });

            const data = await res.json();

            if (!res.ok) {
                setFormError(data.error || 'Erro ao criar usuário');
                return;
            }

            setFormSuccess('Usuário criado com sucesso!');
            setNewUserForm({ email: '', name: '', role: 'user' });
            setTimeout(() => {
                setShowAddUserModal(false);
                setFormSuccess('');
                fetchData(); // Refresh user list
            }, 1500);
        } catch (error) {
            setFormError('Erro de conexão ao criar usuário');
        }
    };

    const handleDeleteUser = async (userId: string, userName: string) => {
        if (!confirm(`Tem certeza que deseja excluir o usuário "${userName}"? Esta ação não pode ser desfeita.`)) {
            return;
        }

        try {
            const res = await fetch(`${apiBase}/api/admin/users/${userId}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (res.ok) {
                fetchData(); // Refresh list
            } else {
                const data = await res.json();
                alert(data.error || 'Erro ao excluir usuário');
            }
        } catch (error) {
            alert('Erro de conexão ao excluir usuário');
        }
    };

    const filteredUsers = users.filter(u =>
        u.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        u.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        u.company_name?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="p-8 space-y-8 animate-in fade-in duration-500">
            {/* Header and Global Controls */}
            <div className="flex flex-col xl:flex-row gap-6 justify-between items-start xl:items-center bg-card/50 border border-purple-500/20 p-5 rounded-2xl shadow-lg shadow-purple-500/5">
                <div>
                    <h1 className="text-3xl font-bold bg-gradient-to-r from-[#7C3AED] via-[#D4AF37] to-[#7C3AED] bg-size-200 animate-gradient-x bg-clip-text text-transparent mb-2">
                        Painel Executivo C-Level
                    </h1>
                    <p className="text-muted-foreground">Monitoramento financeiro, produtos e ecossistema</p>
                </div>

                <div className="flex flex-col md:flex-row gap-4 w-full xl:w-auto">
                    {/* Period Filter */}
                    {(activeTab !== 'users') && (
                        <div className="flex items-center gap-2 bg-background border border-purple-500/20 rounded-lg px-3 py-1 shadow-sm shrink-0">
                            <CalendarDays className="w-4 h-4 text-purple-500" />
                            <select
                                value={period}
                                onChange={(e) => setPeriod(e.target.value)}
                                className="bg-transparent text-sm font-medium border-none outline-none focus:ring-0 cursor-pointer min-w-[140px]"
                            >
                                <option value="today">Hoje</option>
                                <option value="7d">Últimos 7 dias</option>
                                <option value="30d">Últimos 30 dias</option>
                                <option value="this_month">Este Mês</option>
                                <option value="last_month">Mês Anterior</option>
                                <option value="this_year">Este Ano</option>
                                <option value="all">Todo o Tempo</option>
                            </select>
                        </div>
                    )}

                    {/* Navigation Tabs */}
                    <div className="flex bg-background border border-purple-500/20 rounded-lg p-1 overflow-x-auto custom-scrollbar shadow-inner">
                        {(['overview', 'products', 'ads', 'users'] as const).map((tab) => (
                            <button
                                key={tab}
                                onClick={() => setActiveTab(tab)}
                                className={`px-4 py-2 rounded-md capitalize transition-all duration-300 whitespace-nowrap text-sm font-medium ${activeTab === tab
                                    ? 'bg-gradient-to-r from-purple-600 to-amber-600 text-white shadow-lg shadow-purple-500/20'
                                    : 'text-muted-foreground hover:text-foreground hover:bg-purple-500/5'
                                    }`}
                            >
                                {tab === 'overview' ? 'Visão Geral' :
                                    tab === 'products' ? 'Produtos & Consumo' :
                                        tab === 'ads' ? 'Aquisição (Ads)' : 'Gestão de Clientes'}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {loading ? (
                <div className="h-[60vh] flex items-center justify-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-purple-500"></div>
                </div>
            ) : (
                <>
                    {activeTab === 'overview' && <OverviewTab data={strategicData} />}
                    {activeTab === 'products' && <ProductsTab data={strategicData} />}
                    {activeTab === 'ads' && <AdsTab data={strategicData} />}

                    {activeTab === 'users' && (
                        <div className="bg-card border border-purple-500/20 rounded-xl overflow-hidden shadow-xl animate-in slide-in-from-bottom-4 duration-500">
                            <div className="p-6 border-b border-purple-500/20 flex flex-col md:flex-row md:items-center justify-between gap-4">
                                <div className="relative flex-1 max-w-md">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                    <input
                                        type="text"
                                        placeholder="Buscar por cliente, email ou empresa..."
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                        className="w-full bg-card border border-purple-500/20 rounded-lg pl-10 pr-4 py-2 focus:ring-2 focus:ring-purple-500/50 outline-none transition-all"
                                    />
                                </div>
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => setShowAddUserModal(true)}
                                        className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-600 to-amber-600 text-white rounded-lg hover:shadow-lg hover:shadow-purple-500/30 transition-all font-medium"
                                    >
                                        <UserPlus className="w-4 h-4" />
                                        Adicionar Cliente
                                    </button>
                                    <button className="p-2 hover:bg-card/50 rounded-lg border border-purple-500/20 transition-all">
                                        <Filter className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full text-left">
                                    <thead className="bg-muted/50 text-muted-foreground font-medium text-sm">
                                        <tr>
                                            <th className="px-6 py-4">Empresa / Usuário</th>
                                            <th className="px-6 py-4">Saldo Koins</th>
                                            <th className="px-6 py-4">Cadastro</th>
                                            <th className="px-6 py-4 text-right">Ações</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-purple-500/10">
                                        {filteredUsers.map((user) => (
                                            <tr key={user.id} className="hover:bg-purple-500/5 transition-colors group">
                                                <td className="px-6 py-4">
                                                    <div className="flex flex-col">
                                                        <span className="font-semibold">{user.company_name || 'Individual'}</span>
                                                        <span className="text-sm text-muted-foreground">{user.name} ({user.email})</span>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4 text-amber-500 font-mono font-bold">
                                                    {user.koins_balance?.toLocaleString() || '0'}
                                                </td>
                                                <td className="px-6 py-4 text-sm">
                                                    {new Date(user.created_at).toLocaleDateString('pt-BR')}
                                                </td>
                                                <td className="px-6 py-4 text-right">
                                                    <button
                                                        onClick={() => handleEditKoins(user.id, user.koins_balance)}
                                                        className="p-2 hover:bg-amber-500/20 hover:text-amber-500 rounded-lg transition-all"
                                                        title="Editar Saldo"
                                                    >
                                                        <Edit2 className="w-4 h-4" />
                                                    </button>
                                                    <button
                                                        onClick={() => handleDeleteUser(user.id, user.name)}
                                                        className="p-2 hover:bg-red-500/20 hover:text-red-500 rounded-lg transition-all ml-2"
                                                        title="Excluir Usuário"
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {/* Legacy consumption tab replaced entirely by ProductsTab, it's removed cleanly from the renderer */}
                </>
            )}

            {/* Add User Modal */}
            {showAddUserModal && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 animate-in fade-in duration-200">
                    <div className="bg-card border border-purple-500/20 rounded-xl p-6 w-full max-w-md shadow-2xl shadow-purple-500/20 animate-in slide-in-from-bottom-4 duration-300">
                        <div className="flex items-center justify-between mb-6">
                            <h2 className="text-2xl font-bold bg-gradient-to-r from-purple-500 to-amber-500 bg-clip-text text-transparent">
                                Adicionar Novo Cliente
                            </h2>
                            <button
                                onClick={() => {
                                    setShowAddUserModal(false);
                                    setFormError('');
                                    setFormSuccess('');
                                    setNewUserForm({ email: '', name: '', role: 'user' });
                                }}
                                className="p-2 hover:bg-purple-500/10 rounded-lg transition-all"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {formError && (
                            <div className="mb-4 p-3 bg-red-500/10 border border-red-500/50 rounded-lg text-red-500 text-sm">
                                {formError}
                            </div>
                        )}

                        {formSuccess && (
                            <div className="mb-4 p-3 bg-green-500/10 border border-green-500/50 rounded-lg text-green-500 text-sm">
                                {formSuccess}
                            </div>
                        )}

                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium mb-2">Email *</label>
                                <input
                                    type="email"
                                    value={newUserForm.email}
                                    onChange={(e) => setNewUserForm({ ...newUserForm, email: e.target.value })}
                                    placeholder="usuario@exemplo.com"
                                    className="w-full bg-background border border-purple-500/20 rounded-lg px-4 py-2 focus:ring-2 focus:ring-purple-500/50 outline-none transition-all"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium mb-2">Nome *</label>
                                <input
                                    type="text"
                                    value={newUserForm.name}
                                    onChange={(e) => setNewUserForm({ ...newUserForm, name: e.target.value })}
                                    placeholder="Nome completo"
                                    className="w-full bg-background border border-purple-500/20 rounded-lg px-4 py-2 focus:ring-2 focus:ring-purple-500/50 outline-none transition-all"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium mb-2">Função</label>
                                <select
                                    value={newUserForm.role}
                                    onChange={(e) => setNewUserForm({ ...newUserForm, role: e.target.value })}
                                    className="w-full bg-background border border-purple-500/20 rounded-lg px-4 py-2 focus:ring-2 focus:ring-purple-500/50 outline-none transition-all"
                                >
                                    <option value="user">Usuário</option>
                                    <option value="admin">Administrador</option>
                                </select>
                            </div>

                            <div className="flex gap-3 pt-4">
                                <button
                                    onClick={() => {
                                        setShowAddUserModal(false);
                                        setFormError('');
                                        setFormSuccess('');
                                        setNewUserForm({ email: '', name: '', role: 'user' });
                                    }}
                                    className="flex-1 px-4 py-2 border border-purple-500/20 rounded-lg hover:bg-purple-500/10 transition-all"
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={handleAddUser}
                                    className="flex-1 px-4 py-2 bg-gradient-to-r from-purple-600 to-amber-600 text-white rounded-lg hover:shadow-lg hover:shadow-purple-500/30 transition-all font-medium"
                                >
                                    Criar Cliente
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
