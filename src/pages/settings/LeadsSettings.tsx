import { useState, useEffect } from 'react';
import { Plus, Trash2, GripVertical, Check, X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

interface Column {
    id: string;
    title: string;
    color: string;
    order_index: number;
    is_system: boolean;
}

interface Source {
    id: string;
    name: string;
    active: boolean;
    is_system?: boolean;
}

export function LeadsSettings() {
    const { token } = useAuth();
    const [columns, setColumns] = useState<Column[]>([]);
    const [sources, setSources] = useState<Source[]>([]);
    const [loading, setLoading] = useState(true);

    const [newColumnTitle, setNewColumnTitle] = useState('');
    const [newSourceName, setNewSourceName] = useState('');

    const API_URL = 'http://localhost:3000/api';

    const authHeaders = (): HeadersInit => ({
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
    });

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        setLoading(true);
        try {
            const [colsRes, srcsRes] = await Promise.all([
                fetch(`${API_URL}/settings/columns`, { headers: authHeaders() }),
                fetch(`${API_URL}/settings/sources`, { headers: authHeaders() })
            ]);

            if (colsRes.ok) setColumns(await colsRes.json());
            if (srcsRes.ok) setSources(await srcsRes.json());
        } catch (error) {
            console.error("Failed to load settings data", error);
        } finally {
            setLoading(false);
        }
    };

    const handleAddColumn = async () => {
        if (!newColumnTitle.trim()) return;
        try {
            const res = await fetch(`${API_URL}/settings/columns`, {
                method: 'POST',
                headers: authHeaders(),
                body: JSON.stringify({
                    title: newColumnTitle,
                    orderIndex: columns.length
                })
            });
            if (res.ok) {
                const newCol = await res.json();
                setColumns([...columns, newCol]);
                setNewColumnTitle('');
            }
        } catch (error) {
            console.error("Failed to add column", error);
        }
    };

    const handleDeleteColumn = async (id: string, isSystem: boolean) => {
        if (isSystem) {
            alert("Colunas do sistema não podem ser excluídas.");
            return;
        }
        if (!confirm("Tem certeza? Leads nesta coluna podem ficar inacessíveis.")) return;

        try {
            const res = await fetch(`${API_URL}/settings/columns/${id}`, { method: 'DELETE', headers: authHeaders() });
            if (res.ok) {
                setColumns(columns.filter(c => c.id !== id));
            }
        } catch (error) {
            console.error("Failed to delete column", error);
        }
    };

    const handleAddSource = async () => {
        if (!newSourceName.trim()) return;
        try {
            const res = await fetch(`${API_URL}/settings/sources`, {
                method: 'POST',
                headers: authHeaders(),
                body: JSON.stringify({ name: newSourceName })
            });
            if (res.ok) {
                const newSrc = await res.json();
                setSources([newSrc, ...sources]);
                setNewSourceName('');
            }
        } catch (error) {
            console.error("Failed to add source", error);
        }
    };

    const handleDeleteSource = async (id: string, isSystem?: boolean) => {
        if (isSystem) {
            alert("Fontes do sistema não podem ser excluídas.");
            return;
        }
        if (!confirm("Tem certeza que deseja excluir esta fonte?")) return;
        try {
            const res = await fetch(`${API_URL}/settings/sources/${id}`, { method: 'DELETE', headers: authHeaders() });
            if (res.ok) {
                setSources(sources.filter(s => s.id !== id));
            }
        } catch (error) {
            console.error("Failed to delete source", error);
        }
    };

    if (loading) return <div className="p-8 text-center text-text-muted">Carregando configurações...</div>;

    return (
        <div className="space-y-8 animate-fade-in">
            <div className="bg-surface border border-border/50 rounded-xl p-6">
                <h2 className="text-xl font-bold text-text-primary mb-4 flex items-center gap-2">
                    <GripVertical className="text-primary" /> Colunas do Kanban
                </h2>
                <div className="space-y-4">
                    <div className="flex gap-2">
                        <input
                            type="text"
                            value={newColumnTitle}
                            onChange={(e) => setNewColumnTitle(e.target.value)}
                            placeholder="Nome da nova coluna"
                            className="bg-background/50 border border-border/50 rounded-lg px-4 py-2 text-text-primary flex-1 focus:outline-none focus:border-primary/50"
                        />
                        <button
                            onClick={handleAddColumn}
                            className="bg-primary hover:bg-primary-dark text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors disabled:opacity-50"
                            disabled={!newColumnTitle.trim()}
                        >
                            <Plus size={18} /> Adicionar
                        </button>
                    </div>

                    <div className="space-y-2">
                        {columns.map((col) => (
                            <div key={col.id} className="flex items-center justify-between bg-background/30 p-3 rounded-lg border border-border/20 group hover:border-border/50 transition-colors">
                                <div className="flex items-center gap-3">
                                    <div className={`w-3 h-3 rounded-full`} style={{ backgroundColor: col.color || '#3b82f6' }}></div>
                                    <span className="font-medium text-text-primary">{col.title}</span>
                                    {col.is_system && <span className="text-xs bg-white/5 text-text-muted px-2 py-0.5 rounded">Sistema</span>}
                                </div>
                                {!col.is_system && (
                                    <button
                                        onClick={() => handleDeleteColumn(col.id, col.is_system)}
                                        className="text-text-muted hover:text-red-500 transition-colors p-1"
                                        title="Excluir Coluna"
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            <div className="bg-surface border border-border/50 rounded-xl p-6">
                <h2 className="text-xl font-bold text-text-primary mb-4 flex items-center gap-2">
                    <Check className="text-green-500" /> Fontes de Leads
                </h2>
                <div className="space-y-4">
                    <div className="flex gap-2">
                        <input
                            type="text"
                            value={newSourceName}
                            onChange={(e) => setNewSourceName(e.target.value)}
                            placeholder="Nome da fonte (ex: TikTok, LinkedIn)"
                            className="bg-background/50 border border-border/50 rounded-lg px-4 py-2 text-text-primary flex-1 focus:outline-none focus:border-primary/50"
                        />
                        <button
                            onClick={handleAddSource}
                            className="bg-primary hover:bg-primary-dark text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors disabled:opacity-50"
                            disabled={!newSourceName.trim()}
                        >
                            <Plus size={18} /> Adicionar
                        </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                        {sources.map((src) => (
                            <div key={src.id} className="flex items-center justify-between bg-background/30 p-3 rounded-lg border border-border/20 group hover:border-border/50 transition-colors">
                                <div className="flex items-center gap-2">
                                    <span className="font-medium text-text-primary">{src.name}</span>
                                    {src.is_system && <span className="text-xs bg-white/5 text-text-muted px-2 py-0.5 rounded">Sistema</span>}
                                </div>
                                {!src.is_system && (
                                    <button
                                        onClick={() => handleDeleteSource(src.id, src.is_system)}
                                        className="text-text-muted hover:text-red-500 transition-colors p-1"
                                        title="Excluir Fonte"
                                    >
                                        <X size={16} />
                                    </button>
                                )}
                            </div>
                        ))}
                        {sources.length === 0 && (
                            <div className="col-span-full text-center text-text-muted py-4 text-sm">
                                Nenhuma fonte cadastrada.
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
