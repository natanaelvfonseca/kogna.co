import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import {
    Plus, Trash2, UserPlus, Clock, Ban, CalendarDays, Edit2,
    ChevronLeft, ChevronRight, Loader2, Users, Calendar, Settings2, X, Check
} from 'lucide-react';

import { useNotifications } from '../../context/NotificationContext';

import { API_URL } from '../../config/api';
const DIAS_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const DIAS_SEMANA_FULL = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

type Tab = 'agenda' | 'vendedores' | 'config';

interface Vendedor {
    id: string;
    nome: string;
    email: string;
    whatsapp?: string;
    porcentagem: number;
    ativo: boolean;
    leads_recebidos_ciclo: number;
}

interface Disponibilidade {
    id: string;
    vendedor_id: string;
    dia_semana: number;
    hora_inicio: string;
    hora_fim: string;
    intervalo: number;
}

interface Bloqueio {
    id: string;
    vendedor_id: string;
    data_inicio: string;
    data_fim: string;
    motivo?: string;
}

interface Agendamento {
    id: string;
    vendedor_id: string;
    lead_id?: string;
    data_hora: string;
    duracao: number;
    status: string;
    notas?: string;
    vendedor_nome?: string;
    lead_nome?: string;
}

export function Agenda() {
    const { token } = useAuth();
    const { showToast } = useNotifications();
    const [tab, setTab] = useState<Tab>('agenda');
    const [loading, setLoading] = useState(false);

    // Vendedores state
    const [vendedores, setVendedores] = useState<Vendedor[]>([]);
    const [showAddVendedor, setShowAddVendedor] = useState(false);
    const [newVendedor, setNewVendedor] = useState({ nome: '', email: '', whatsapp: '', porcentagem: 50 });

    // Config state (selected vendedor for disponibilidade/bloqueios)
    const [selectedVendedor, setSelectedVendedor] = useState<string | null>(null);
    const [disponibilidades, setDisponibilidades] = useState<Disponibilidade[]>([]);
    const [bloqueios, setBloqueios] = useState<Bloqueio[]>([]);
    const [showAddDisp, setShowAddDisp] = useState(false);
    const [newDisp, setNewDisp] = useState({ diaSemana: 1, horaInicio: '09:00', horaFim: '18:00', intervalo: 30 });
    const [showAddBloqueio, setShowAddBloqueio] = useState(false);
    const [newBloqueio, setNewBloqueio] = useState({ dataInicio: '', dataFim: '', motivo: '' });

    // Agenda/Calendar state
    const [agendamentos, setAgendamentos] = useState<Agendamento[]>([]);
    const [selectedDate, setSelectedDate] = useState(new Date());
    const [calendarMonth, setCalendarMonth] = useState(new Date());

    // Edit logic
    const [editingAgendamento, setEditingAgendamento] = useState<Agendamento | null>(null);
    const [editForm, setEditForm] = useState({ date: '', time: '', notas: '' });



    const authHeaders = (): HeadersInit => ({
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
    });

    // ── Fetch Functions ──────────────────────────────────

    const fetchVendedores = async () => {
        try {
            const res = await fetch(`${API_URL}/vendedores`, { headers: authHeaders() });
            if (res.ok) {
                const data = await res.json();
                setVendedores(data);
            }
        } catch (e) {
            console.error('Fetch vendedores error', e);
        }
    };

    const fetchAgendamentos = async (date?: string) => {
        const d = date || selectedDate.toISOString().split('T')[0];
        try {
            const res = await fetch(`${API_URL}/agendamentos?data=${d}`, { headers: authHeaders() });
            if (res.ok) {
                const data = await res.json();
                setAgendamentos(data);
            }
        } catch (e) {
            console.error('Fetch agendamentos error', e);
        }
    };

    const fetchDisponibilidades = async (vendedorId: string) => {
        try {
            const res = await fetch(`${API_URL}/vendedores/${vendedorId}/disponibilidade`, { headers: authHeaders() });
            if (res.ok) {
                const data = await res.json();
                setDisponibilidades(data);
            }
        } catch (e) {
            console.error('Fetch disponibilidade error', e);
        }
    };

    const fetchBloqueios = async (vendedorId: string) => {
        try {
            const res = await fetch(`${API_URL}/vendedores/${vendedorId}/bloqueios`, { headers: authHeaders() });
            if (res.ok) {
                const data = await res.json();
                setBloqueios(data);
            }
        } catch (e) {
            console.error('Fetch bloqueios error', e);
        }
    };

    useEffect(() => { fetchVendedores(); fetchAgendamentos(); }, []);
    useEffect(() => { fetchAgendamentos(selectedDate.toISOString().split('T')[0]); }, [selectedDate]);
    useEffect(() => {
        if (selectedVendedor) {
            fetchDisponibilidades(selectedVendedor);
            fetchBloqueios(selectedVendedor);
        }
    }, [selectedVendedor]);

    // ── Action Handlers ──────────────────────────────────

    const addVendedor = async () => {
        if (!newVendedor.nome || !newVendedor.email) return;
        setLoading(true);
        try {
            const res = await fetch(`${API_URL}/vendedores`, {
                method: 'POST', headers: authHeaders(),
                body: JSON.stringify(newVendedor)
            });
            if (res.ok) {
                await fetchVendedores();
                setNewVendedor({ nome: '', email: '', whatsapp: '', porcentagem: 50 });
                setShowAddVendedor(false);
            }
        } catch (e) {
            console.error(e);
        }
        setLoading(false);
    };

    const deleteVendedor = async (id: string) => {
        if (!confirm('Remover este vendedor?')) return;
        try {
            const res = await fetch(`${API_URL}/vendedores/${id}`, { method: 'DELETE', headers: authHeaders() });
            if (res.ok) {
                await fetchVendedores();
                if (selectedVendedor === id) setSelectedVendedor(null);
            }
        } catch (e) {
            console.error(e);
        }
    };

    const addDisponibilidade = async () => {
        if (!selectedVendedor) return;
        setLoading(true);
        try {
            const res = await fetch(`${API_URL}/vendedores/${selectedVendedor}/disponibilidade`, {
                method: 'POST', headers: authHeaders(),
                body: JSON.stringify(newDisp)
            });
            if (res.ok) {
                await fetchDisponibilidades(selectedVendedor);
                setShowAddDisp(false);
            }
        } catch (e) {
            console.error(e);
        }
        setLoading(false);
    };

    const deleteDisponibilidade = async (id: string) => {
        try {
            const res = await fetch(`${API_URL}/disponibilidade/${id}`, { method: 'DELETE', headers: authHeaders() });
            if (res.ok) {
                if (selectedVendedor) await fetchDisponibilidades(selectedVendedor);
            }
        } catch (e) {
            console.error(e);
        }
    };

    const addBloqueio = async () => {
        if (!selectedVendedor || !newBloqueio.dataInicio || !newBloqueio.dataFim) return;
        setLoading(true);
        try {
            const res = await fetch(`${API_URL}/vendedores/${selectedVendedor}/bloqueios`, {
                method: 'POST', headers: authHeaders(),
                body: JSON.stringify(newBloqueio)
            });
            if (res.ok) {
                await fetchBloqueios(selectedVendedor);
                setShowAddBloqueio(false);
                setNewBloqueio({ dataInicio: '', dataFim: '', motivo: '' });
            }
        } catch (e) {
            console.error(e);
        }
        setLoading(false);
    };

    const deleteBloqueio = async (id: string) => {
        try {
            const res = await fetch(`${API_URL}/bloqueios/${id}`, { method: 'DELETE', headers: authHeaders() });
            if (res.ok) {
                if (selectedVendedor) await fetchBloqueios(selectedVendedor);
            }
        } catch (e) {
            console.error(e);
        }
    };

    const deleteAgendamento = async (id: string) => {
        if (!confirm('Excluir este agendamento?')) return;
        try {
            const res = await fetch(`${API_URL}/agendamentos/${id}`, { method: 'DELETE', headers: authHeaders() });
            if (res.ok) {
                await fetchAgendamentos();
            }
        } catch (e) {
            console.error(e);
        }
    };

    const startEditAgendamento = (a: Agendamento) => {
        const d = new Date(a.data_hora);
        setEditingAgendamento(a);
        setEditForm({
            date: d.toISOString().split('T')[0],
            time: d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
            notas: a.notas || ''
        });
    };

    const updateAgendamento = async () => {
        if (!editingAgendamento) return;
        setLoading(true);
        try {
            const dataHora = `${editForm.date}T${editForm.time}:00`;
            const res = await fetch(`${API_URL}/agendamentos/${editingAgendamento.id}`, {
                method: 'PATCH',
                headers: authHeaders(),
                body: JSON.stringify({ dataHora, notas: editForm.notas })
            });
            if (res.ok) {
                await fetchAgendamentos();
                setEditingAgendamento(null);
                showToast('Sucesso', 'Agendamento atualizado com sucesso', 'success');
            } else {
                let errorMessage = 'Erro desconhecido';
                try {
                    const errorData = await res.json();
                    errorMessage = errorData.error || 'Erro desconhecido';
                } catch (e) {
                    errorMessage = await res.text();
                }
                if (res.status === 409) {
                    showToast('Aviso', errorMessage, 'warning');
                } else {
                    showToast('Erro ao atualizar', errorMessage, 'error');
                }
            }
        } catch (e) {
            console.error(e);
            showToast('Erro', 'Falha na conexão com o servidor', 'error');
        }
        setLoading(false);
    };

    // ── Calendar Helpers ─────────────────────────────────

    const getDaysInMonth = (date: Date) => {
        const year = date.getFullYear();
        const month = date.getMonth();
        const firstDay = new Date(year, month, 1).getDay();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        return { firstDay, daysInMonth };
    };

    const isSameDay = (d1: Date, d2: Date) =>
        d1.getFullYear() === d2.getFullYear() && d1.getMonth() === d2.getMonth() && d1.getDate() === d2.getDate();

    const isToday = (date: Date) => isSameDay(date, new Date());

    const renderCalendar = () => {
        const { firstDay, daysInMonth } = getDaysInMonth(calendarMonth);
        const cells = [];

        for (let i = 0; i < firstDay; i++) cells.push(<div key={`e-${i}`} />);

        for (let day = 1; day <= daysInMonth; day++) {
            const date = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), day);
            const isSelected = isSameDay(date, selectedDate);
            const today = isToday(date);

            cells.push(
                <button
                    key={day}
                    onClick={() => setSelectedDate(date)}
                    className={`
                        relative h-10 w-full rounded-lg text-sm font-medium transition-all duration-150
                        ${isSelected
                            ? 'bg-primary text-white shadow-md shadow-primary/20'
                            : today
                                ? 'bg-primary/10 text-primary font-bold'
                                : 'text-text-primary hover:bg-muted-secondary/60'
                        }
                    `}
                >
                    {day}
                </button>
            );
        }

        return cells;
    };

    const prevMonth = () => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1));
    const nextMonth = () => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1));

    const statusColors: Record<string, string> = {
        agendado: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
        confirmado: 'bg-green-500/10 text-green-600 border-green-500/20',
        cancelado: 'bg-red-500/10 text-red-500 border-red-500/20',
        concluido: 'bg-gray-500/10 text-gray-500 border-gray-500/20',
    };

    const totalPorcentagem = vendedores.filter(v => v.ativo).reduce((s, v) => s + v.porcentagem, 0);

    // ── Tab Content ──────────────────────────────────────

    const tabs = [
        { id: 'agenda' as Tab, label: 'Agenda', icon: Calendar },
        { id: 'vendedores' as Tab, label: 'Vendedores', icon: Users },
        { id: 'config' as Tab, label: 'Horários', icon: Settings2 },
    ];

    return (
        <div className="h-full flex flex-col p-6 space-y-5">
            {/* Header */}
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold text-text-primary">Agenda</h1>
                    <p className="text-text-secondary text-sm">Gerencie vendedores, horários e agendamentos</p>
                </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 bg-muted-secondary/50 p-1 rounded-xl w-fit">
                {tabs.map(t => (
                    <button
                        key={t.id}
                        onClick={() => setTab(t.id)}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${tab === t.id
                            ? 'bg-white text-primary shadow-sm'
                            : 'text-text-muted hover:text-text-primary'
                            }`}
                    >
                        <t.icon size={16} />
                        {t.label}
                    </button>
                ))}
            </div>

            {/* ═══ TAB: AGENDA ═══ */}
            {tab === 'agenda' && (
                <div className="flex-1 flex gap-6 min-h-0">
                    {/* Left: Mini Calendar */}
                    <div className="w-80 shrink-0 bg-surface border border-border rounded-xl p-5 space-y-4 self-start">
                        <div className="flex items-center justify-between">
                            <button onClick={prevMonth} className="p-1.5 hover:bg-muted-secondary rounded-lg transition-colors">
                                <ChevronLeft size={16} className="text-text-muted" />
                            </button>
                            <h3 className="text-sm font-bold text-text-primary capitalize">
                                {calendarMonth.toLocaleString('pt-BR', { month: 'long', year: 'numeric' })}
                            </h3>
                            <button onClick={nextMonth} className="p-1.5 hover:bg-muted-secondary rounded-lg transition-colors">
                                <ChevronRight size={16} className="text-text-muted" />
                            </button>
                        </div>

                        <div className="grid grid-cols-7 gap-1 text-center">
                            {DIAS_SEMANA.map(d => (
                                <div key={d} className="text-xs font-medium text-text-muted py-1">{d}</div>
                            ))}
                            {renderCalendar()}
                        </div>

                        <div className="pt-2 border-t border-border">
                            <p className="text-xs text-text-muted">
                                Selecionado: <strong className="text-text-primary">
                                    {selectedDate.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}
                                </strong>
                            </p>
                        </div>
                    </div>

                    {/* Right: Day's Appointments */}
                    <div className="flex-1 bg-surface border border-border rounded-xl p-5 space-y-4 overflow-y-auto">
                        <div className="flex items-center justify-between">
                            <h3 className="text-lg font-bold text-text-primary flex items-center gap-2">
                                <CalendarDays size={20} className="text-primary" />
                                {selectedDate.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}
                            </h3>
                            <span className="text-xs bg-primary/10 text-primary px-3 py-1 rounded-full font-medium">
                                {agendamentos.length} agendamento{agendamentos.length !== 1 ? 's' : ''}
                            </span>
                        </div>

                        {agendamentos.length === 0 ? (
                            <div className="flex-1 flex flex-col items-center justify-center py-16 text-center">
                                <CalendarDays size={48} className="text-text-muted/30 mb-3" />
                                <p className="text-text-muted text-sm">Nenhum agendamento para este dia.</p>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {agendamentos.map(a => (
                                    <div key={a.id} className="flex items-start gap-4 p-4 rounded-xl border border-border hover:border-primary/20 transition-colors bg-white">
                                        <div className="text-center shrink-0">
                                            <div className="text-lg font-bold text-primary">
                                                {new Date(a.data_hora).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                                            </div>
                                            <div className="text-xs text-text-muted">{a.duracao}min</div>
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2">
                                                <span className="font-semibold text-sm text-text-primary">{a.vendedor_nome || 'Vendedor'}</span>
                                                <span className={`text-xs px-2 py-0.5 rounded-full border ${statusColors[a.status] || 'bg-gray-100 text-gray-500'}`}>
                                                    {a.status}
                                                </span>
                                            </div>
                                            {a.lead_nome && <p className="text-xs text-text-muted mt-0.5">Lead: {a.lead_nome}</p>}
                                            {a.notas && <p className="text-xs text-text-secondary mt-1">{a.notas}</p>}
                                        </div>
                                        <div className="flex gap-2 self-center">
                                            <button
                                                onClick={() => startEditAgendamento(a)}
                                                className="p-2 text-text-muted hover:text-primary hover:bg-primary/10 rounded-lg transition-colors"
                                                title="Editar"
                                            >
                                                <Edit2 size={16} />
                                            </button>
                                            <button
                                                onClick={() => deleteAgendamento(a.id)}
                                                className="p-2 text-text-muted hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-colors"
                                                title="Excluir"
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Edit Appointment Modal */}
            {editingAgendamento && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
                    <div className="bg-surface border border-border rounded-2xl w-full max-w-md p-6 space-y-4 shadow-2xl animate-fade-in shadow-black/20">
                        <div className="flex items-center justify-between">
                            <h3 className="text-lg font-bold text-text-primary">Editar Agendamento</h3>
                            <button onClick={() => setEditingAgendamento(null)} className="text-text-muted hover:text-text-primary">
                                <X size={20} />
                            </button>
                        </div>

                        <div className="space-y-3">
                            <div>
                                <label className="text-xs font-medium text-text-muted block mb-1 uppercase tracking-wider">Data</label>
                                <input
                                    type="date"
                                    className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm outline-none focus:border-primary/50 transition-colors"
                                    value={editForm.date}
                                    onChange={e => setEditForm({ ...editForm, date: e.target.value })}
                                />
                            </div>
                            <div>
                                <label className="text-xs font-medium text-text-muted block mb-1 uppercase tracking-wider">Hora</label>
                                <input
                                    type="time"
                                    className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm outline-none focus:border-primary/50 transition-colors"
                                    value={editForm.time}
                                    onChange={e => setEditForm({ ...editForm, time: e.target.value })}
                                />
                            </div>
                            <div>
                                <label className="text-xs font-medium text-text-muted block mb-1 uppercase tracking-wider">Notas</label>
                                <textarea
                                    className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm outline-none focus:border-primary/50 transition-colors min-h-[100px] resize-none"
                                    placeholder="Notas sobre o agendamento..."
                                    value={editForm.notas}
                                    onChange={e => setEditForm({ ...editForm, notas: e.target.value })}
                                />
                            </div>
                        </div>

                        <div className="flex gap-2 pt-2">
                            <button
                                onClick={updateAgendamento}
                                disabled={loading}
                                className="flex-1 bg-primary hover:bg-primary/90 text-white font-bold py-2.5 rounded-xl transition-all shadow-lg shadow-primary/20 flex items-center justify-center gap-2"
                            >
                                {loading && <Loader2 size={16} className="animate-spin" />}
                                Salvar Alterações
                            </button>
                            <button
                                onClick={() => setEditingAgendamento(null)}
                                className="flex-1 bg-muted-secondary/50 hover:bg-muted-secondary text-text-primary font-bold py-2.5 rounded-xl transition-all"
                            >
                                Cancelar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ═══ TAB: VENDEDORES ═══ */}
            {tab === 'vendedores' && (
                <div className="flex-1 space-y-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm text-text-muted">
                                Total distribuição: <strong className={totalPorcentagem === 100 ? 'text-green-600' : 'text-amber-600'}>{totalPorcentagem}%</strong>
                                {totalPorcentagem !== 100 && <span className="text-amber-500 ml-2 text-xs">(ideal: 100%)</span>}
                            </p>
                        </div>
                        <button
                            onClick={() => setShowAddVendedor(true)}
                            className="flex items-center gap-2 bg-primary hover:bg-primary/90 text-white font-medium px-4 py-2 rounded-lg transition-colors text-sm shadow-lg shadow-primary/20"
                        >
                            <UserPlus size={16} /> Novo Vendedor
                        </button>
                    </div>

                    {/* Add Vendedor Form */}
                    {showAddVendedor && (
                        <div className="bg-surface border border-primary/20 rounded-xl p-5 space-y-4 animate-fade-in">
                            <div className="flex items-center justify-between">
                                <h4 className="font-bold text-sm text-text-primary">Novo Vendedor</h4>
                                <button onClick={() => setShowAddVendedor(false)} className="text-text-muted hover:text-text-primary">
                                    <X size={16} />
                                </button>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <input
                                    className="px-3 py-2.5 bg-background/50 border border-border rounded-lg text-sm text-text-primary focus:outline-none focus:border-primary/50 transition-colors"
                                    placeholder="Nome"
                                    value={newVendedor.nome}
                                    onChange={e => setNewVendedor({ ...newVendedor, nome: e.target.value })}
                                />
                                <input
                                    className="px-3 py-2.5 bg-background/50 border border-border rounded-lg text-sm text-text-primary focus:outline-none focus:border-primary/50 transition-colors"
                                    placeholder="Email"
                                    value={newVendedor.email}
                                    onChange={e => setNewVendedor({ ...newVendedor, email: e.target.value })}
                                />
                                <input
                                    className="px-3 py-2.5 bg-background/50 border border-border rounded-lg text-sm text-text-primary focus:outline-none focus:border-primary/50 transition-colors"
                                    placeholder="WhatsApp (opcional)"
                                    value={newVendedor.whatsapp}
                                    onChange={e => setNewVendedor({ ...newVendedor, whatsapp: e.target.value })}
                                />
                                <div className="flex items-center gap-2">
                                    <input
                                        type="number"
                                        className="w-24 px-3 py-2.5 bg-background/50 border border-border rounded-lg text-sm text-text-primary focus:outline-none focus:border-primary/50 transition-colors"
                                        placeholder="%"
                                        value={newVendedor.porcentagem}
                                        onChange={e => setNewVendedor({ ...newVendedor, porcentagem: Number(e.target.value) })}
                                    />
                                    <span className="text-xs text-text-muted">% de leads</span>
                                </div>
                            </div>
                            <button
                                onClick={addVendedor}
                                disabled={loading || !newVendedor.nome || !newVendedor.email}
                                className="bg-primary hover:bg-primary/90 disabled:opacity-50 text-white font-medium px-5 py-2 rounded-lg text-sm transition-colors flex items-center gap-2"
                            >
                                {loading ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                                Salvar
                            </button>
                        </div>
                    )}

                    {/* Vendedores List */}
                    <div className="space-y-2">
                        {vendedores.length === 0 ? (
                            <div className="text-center py-16">
                                <Users size={48} className="text-text-muted/30 mx-auto mb-3" />
                                <p className="text-text-muted text-sm">Nenhum vendedor cadastrado.</p>
                                <p className="text-text-muted text-xs mt-1">Adicione vendedores para usar o Round Robin.</p>
                            </div>
                        ) : (
                            vendedores.map(v => (
                                <div key={v.id} className="flex items-center gap-4 p-4 bg-surface border border-border rounded-xl hover:border-primary/20 transition-colors">
                                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                                        <span className="text-sm font-bold text-primary">
                                            {v.nome.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()}
                                        </span>
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <span className="font-semibold text-sm text-text-primary">{v.nome}</span>
                                            {!v.ativo && <span className="text-xs bg-red-500/10 text-red-500 px-2 py-0.5 rounded-full">Inativo</span>}
                                        </div>
                                        <p className="text-xs text-text-muted">{v.email}</p>
                                    </div>
                                    <div className="text-center shrink-0">
                                        <div className="text-lg font-bold text-primary">{v.porcentagem}%</div>
                                        <div className="text-xs text-text-muted">distribuição</div>
                                    </div>
                                    <div className="text-center shrink-0 px-3">
                                        <div className="text-lg font-bold text-text-primary">{v.leads_recebidos_ciclo}</div>
                                        <div className="text-xs text-text-muted">leads ciclo</div>
                                    </div>
                                    <button
                                        onClick={() => deleteVendedor(v.id)}
                                        className="p-2 text-text-muted hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-colors shrink-0"
                                        title="Remover"
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            )}

            {/* ═══ TAB: HORÁRIOS & BLOQUEIOS ═══ */}
            {tab === 'config' && (
                <div className="flex-1 flex gap-6 min-h-0">
                    {/* Left: Vendedor Selector */}
                    <div className="w-64 shrink-0 space-y-2 self-start">
                        <p className="text-xs font-medium text-text-muted uppercase tracking-wide mb-2">Selecione o vendedor</p>
                        {vendedores.map(v => (
                            <button
                                key={v.id}
                                onClick={() => setSelectedVendedor(v.id)}
                                className={`w-full text-left px-4 py-3 rounded-xl border transition-all text-sm ${selectedVendedor === v.id
                                    ? 'border-primary bg-primary/5 text-primary font-semibold'
                                    : 'border-border text-text-primary hover:border-primary/30'
                                    }`}
                            >
                                {v.nome}
                            </button>
                        ))}
                        {vendedores.length === 0 && (
                            <p className="text-xs text-text-muted text-center py-8">Cadastre vendedores primeiro.</p>
                        )}
                    </div>

                    {/* Right: Config panels */}
                    {selectedVendedor ? (
                        <div className="flex-1 space-y-6 overflow-y-auto">
                            {/* Disponibilidade */}
                            <div className="bg-surface border border-border rounded-xl p-5 space-y-4">
                                <div className="flex items-center justify-between">
                                    <h4 className="font-bold text-sm text-text-primary flex items-center gap-2">
                                        <Clock size={16} className="text-primary" /> Horários de Atendimento
                                    </h4>
                                    <button
                                        onClick={() => setShowAddDisp(true)}
                                        className="flex items-center gap-1.5 text-xs text-primary font-medium hover:text-primary/80 transition-colors"
                                    >
                                        <Plus size={14} /> Adicionar
                                    </button>
                                </div>

                                {showAddDisp && (
                                    <div className="bg-muted-secondary/30 border border-border rounded-lg p-4 space-y-3 animate-fade-in">
                                        <div className="grid grid-cols-4 gap-2">
                                            <select
                                                className="px-3 py-2 bg-white border border-border rounded-lg text-sm"
                                                value={newDisp.diaSemana}
                                                onChange={e => setNewDisp({ ...newDisp, diaSemana: Number(e.target.value) })}
                                            >
                                                {DIAS_SEMANA_FULL.map((d, i) => (
                                                    <option key={i} value={i}>{d}</option>
                                                ))}
                                            </select>
                                            <input
                                                type="time"
                                                className="px-3 py-2 bg-white border border-border rounded-lg text-sm"
                                                value={newDisp.horaInicio}
                                                onChange={e => setNewDisp({ ...newDisp, horaInicio: e.target.value })}
                                            />
                                            <input
                                                type="time"
                                                className="px-3 py-2 bg-white border border-border rounded-lg text-sm"
                                                value={newDisp.horaFim}
                                                onChange={e => setNewDisp({ ...newDisp, horaFim: e.target.value })}
                                            />
                                            <select
                                                className="px-3 py-2 bg-white border border-border rounded-lg text-sm"
                                                value={newDisp.intervalo}
                                                onChange={e => setNewDisp({ ...newDisp, intervalo: Number(e.target.value) })}
                                            >
                                                <option value={15}>15 min</option>
                                                <option value={30}>30 min</option>
                                                <option value={60}>60 min</option>
                                            </select>
                                        </div>
                                        <div className="flex gap-2">
                                            <button onClick={addDisponibilidade} disabled={loading}
                                                className="bg-primary text-white text-xs px-4 py-1.5 rounded-lg font-medium">
                                                Salvar
                                            </button>
                                            <button onClick={() => setShowAddDisp(false)}
                                                className="text-text-muted text-xs px-4 py-1.5 rounded-lg hover:bg-muted-secondary">
                                                Cancelar
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {disponibilidades.length === 0 ? (
                                    <p className="text-xs text-text-muted py-4 text-center">Nenhum horário definido.</p>
                                ) : (
                                    <div className="space-y-1">
                                        {disponibilidades.map(d => (
                                            <div key={d.id} className="flex items-center justify-between py-2.5 px-3 rounded-lg hover:bg-muted-secondary/30 group transition-colors">
                                                <div className="flex items-center gap-3">
                                                    <span className="text-xs font-bold text-primary bg-primary/10 px-2 py-1 rounded-md w-12 text-center">
                                                        {DIAS_SEMANA[d.dia_semana]}
                                                    </span>
                                                    <span className="text-sm text-text-primary font-medium">
                                                        {d.hora_inicio} – {d.hora_fim}
                                                    </span>
                                                    <span className="text-xs text-text-muted">({d.intervalo}min)</span>
                                                </div>
                                                <button
                                                    onClick={() => deleteDisponibilidade(d.id)}
                                                    className="opacity-0 group-hover:opacity-100 text-text-muted hover:text-red-500 transition-all"
                                                >
                                                    <Trash2 size={14} />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Bloqueios */}
                            <div className="bg-surface border border-border rounded-xl p-5 space-y-4">
                                <div className="flex items-center justify-between">
                                    <h4 className="font-bold text-sm text-text-primary flex items-center gap-2">
                                        <Ban size={16} className="text-red-500" /> Bloqueios de Agenda
                                    </h4>
                                    <button
                                        onClick={() => setShowAddBloqueio(true)}
                                        className="flex items-center gap-1.5 text-xs text-primary font-medium hover:text-primary/80 transition-colors"
                                    >
                                        <Plus size={14} /> Bloquear Horário
                                    </button>
                                </div>

                                {showAddBloqueio && (
                                    <div className="bg-red-500/5 border border-red-500/10 rounded-lg p-4 space-y-3 animate-fade-in">
                                        <div className="grid grid-cols-2 gap-2">
                                            <div>
                                                <label className="text-xs text-text-muted block mb-1">Início</label>
                                                <input
                                                    type="datetime-local"
                                                    className="w-full px-3 py-2 bg-white border border-border rounded-lg text-sm"
                                                    value={newBloqueio.dataInicio}
                                                    onChange={e => setNewBloqueio({ ...newBloqueio, dataInicio: e.target.value })}
                                                />
                                            </div>
                                            <div>
                                                <label className="text-xs text-text-muted block mb-1">Fim</label>
                                                <input
                                                    type="datetime-local"
                                                    className="w-full px-3 py-2 bg-white border border-border rounded-lg text-sm"
                                                    value={newBloqueio.dataFim}
                                                    onChange={e => setNewBloqueio({ ...newBloqueio, dataFim: e.target.value })}
                                                />
                                            </div>
                                        </div>
                                        <input
                                            className="w-full px-3 py-2 bg-white border border-border rounded-lg text-sm"
                                            placeholder="Motivo (opcional)"
                                            value={newBloqueio.motivo}
                                            onChange={e => setNewBloqueio({ ...newBloqueio, motivo: e.target.value })}
                                        />
                                        <div className="flex gap-2">
                                            <button onClick={addBloqueio} disabled={loading}
                                                className="bg-red-500 text-white text-xs px-4 py-1.5 rounded-lg font-medium">
                                                Bloquear
                                            </button>
                                            <button onClick={() => setShowAddBloqueio(false)}
                                                className="text-text-muted text-xs px-4 py-1.5 rounded-lg hover:bg-muted-secondary">
                                                Cancelar
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {bloqueios.length === 0 ? (
                                    <p className="text-xs text-text-muted py-4 text-center">Nenhum bloqueio ativo.</p>
                                ) : (
                                    <div className="space-y-1">
                                        {bloqueios.map(b => (
                                            <div key={b.id} className="flex items-center justify-between py-2.5 px-3 rounded-lg hover:bg-red-500/5 group transition-colors">
                                                <div>
                                                    <p className="text-sm text-text-primary font-medium">
                                                        {new Date(b.data_inicio).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                                                        {' → '}
                                                        {new Date(b.data_fim).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                                                    </p>
                                                    {b.motivo && <p className="text-xs text-text-muted">{b.motivo}</p>}
                                                </div>
                                                <button
                                                    onClick={() => deleteBloqueio(b.id)}
                                                    className="opacity-0 group-hover:opacity-100 text-text-muted hover:text-red-500 transition-all"
                                                >
                                                    <Trash2 size={14} />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    ) : (
                        <div className="flex-1 flex items-center justify-center">
                            <div className="text-center">
                                <Settings2 size={48} className="text-text-muted/20 mx-auto mb-3" />
                                <p className="text-sm text-text-muted">Selecione um vendedor para configurar horários</p>
                            </div>
                        </div>
                    )}
                </div>
            )}

        </div>
    );
}
