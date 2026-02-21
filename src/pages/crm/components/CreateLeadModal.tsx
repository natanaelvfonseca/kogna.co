
import { useState, useEffect } from 'react';
import { X, DollarSign, Phone, Mail } from 'lucide-react';
import { useAuth } from '../../../context/AuthContext';
import { API_URL } from '../../../config/api';
import { Lead } from '../types';

interface LeadModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
    leadToEdit?: Lead | null;
}

export function LeadModal({ isOpen, onClose, onSuccess, leadToEdit }: LeadModalProps) {
    const { user, token } = useAuth();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [sources, setSources] = useState<{ id: string; name: string }[]>([]);
    const [firstColumnTitle, setFirstColumnTitle] = useState('Novos Leads');
    const [formData, setFormData] = useState({
        name: '',
        phone: '',
        email: '',
        value: '',
        source: ''
    });

    const isEditing = !!leadToEdit;

    useEffect(() => {
        if (isOpen) {
            fetchSources();
            fetchColumns();
            if (leadToEdit) {
                setFormData({
                    name: leadToEdit.name,
                    phone: leadToEdit.phone || '',
                    email: leadToEdit.email || '',
                    value: leadToEdit.value?.toString() || '',
                    source: leadToEdit.source || ''
                });
            } else {
                setFormData({ name: '', phone: '', email: '', value: '', source: '' });
            }
        }
    }, [isOpen, leadToEdit]);

    const fetchSources = async () => {
        try {
            const res = await fetch(`${API_URL}/settings/sources`, {
                headers: { 'Authorization': `Bearer mock-jwt-token-for-${user?.id}` }
            });
            if (res.ok) {
                setSources(await res.json());
            }
        } catch (e) {
            console.error("Failed to fetch sources", e);
        }
    };

    const fetchColumns = async () => {
        try {
            const res = await fetch(`${API_URL}/settings/columns`, {
                headers: { 'Authorization': `Bearer mock-jwt-token-for-${user?.id}` }
            });
            if (res.ok) {
                const cols = await res.json();
                if (cols && cols.length > 0) {
                    setFirstColumnTitle(cols[0].title);
                }
            }
        } catch (e) {
            console.error("Failed to fetch columns", e);
        }
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        try {
            const url = isEditing ? `${API_URL}/leads/${leadToEdit.id}` : `${API_URL}/leads`;
            const method = isEditing ? 'PUT' : 'POST';

            const payload: any = {
                name: formData.name,
                phone: formData.phone,
                email: formData.email,
                value: Number(formData.value),
                source: formData.source
            };

            if (!isEditing) {
                payload.status = firstColumnTitle;
            }

            const res = await fetch(url, {
                method,
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(payload),
            });

            if (!res.ok) {
                throw new Error(`Falha ao ${isEditing ? 'atualizar' : 'criar'} lead`);
            }

            setFormData({ name: '', phone: '', email: '', value: '', source: '' });
            onSuccess();
            onClose();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Erro desconhecido');
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-fade-in">
            <div className="bg-surface border border-border rounded-xl shadow-2xl w-full max-w-md overflow-hidden relative">
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 text-text-muted hover:text-text-primary transition-colors"
                >
                    <X size={20} />
                </button>

                <div className="p-6">
                    <h2 className="text-xl font-bold text-text-primary mb-1">{isEditing ? 'Editar Lead' : 'Novo Lead'}</h2>
                    <p className="text-sm text-text-muted mb-6">{isEditing ? 'Edite as informações do lead.' : 'Adicione um novo lead ao seu pipeline.'}</p>

                    {error && (
                        <div className="mb-4 bg-red-500/10 border border-red-500/20 text-red-400 text-sm p-3 rounded-lg flex items-center gap-2">
                            <span>⚠️ {error}</span>
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div>
                            <label className="block text-xs font-medium text-text-secondary mb-1.5 uppercase tracking-wide">
                                Nome *
                            </label>
                            <input
                                type="text"
                                name="name"
                                value={formData.name}
                                onChange={handleChange}
                                required
                                className="w-full bg-background/50 border border-border/50 rounded-lg px-4 py-2.5 text-text-primary focus:outline-none focus:border-primary/50 transition-colors placeholder:text-text-muted/50"
                                placeholder="Nome do cliente"
                            />
                        </div>

                        <div>
                            <label className="block text-xs font-medium text-text-secondary mb-1.5 uppercase tracking-wide">
                                Telefone
                            </label>
                            <div className="relative">
                                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" size={16} />
                                <input
                                    type="tel"
                                    name="phone"
                                    value={formData.phone}
                                    onChange={handleChange}
                                    className="w-full bg-background/50 border border-border/50 rounded-lg pl-10 pr-4 py-2.5 text-text-primary focus:outline-none focus:border-primary/50 transition-colors placeholder:text-text-muted/50"
                                    placeholder="(00) 00000-0000"
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-xs font-medium text-text-secondary mb-1.5 uppercase tracking-wide">
                                E-mail
                            </label>
                            <div className="relative">
                                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" size={16} />
                                <input
                                    type="email"
                                    name="email"
                                    value={formData.email}
                                    onChange={handleChange}
                                    className="w-full bg-background/50 border border-border/50 rounded-lg pl-10 pr-4 py-2.5 text-text-primary focus:outline-none focus:border-primary/50 transition-colors placeholder:text-text-muted/50"
                                    placeholder="email@exemplo.com"
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-xs font-medium text-text-secondary mb-1.5 uppercase tracking-wide">
                                Fonte
                            </label>
                            <div className="relative">
                                <select
                                    name="source"
                                    value={formData.source}
                                    onChange={handleChange}
                                    className="w-full bg-background/50 border border-border/50 rounded-lg px-4 py-2.5 text-text-primary focus:outline-none focus:border-primary/50 transition-colors appearance-none cursor-pointer"
                                >
                                    <option value="">Selecione a origem...</option>
                                    {sources.map(src => (
                                        <option key={src.id} value={src.name} className="bg-surface text-text-primary">
                                            {src.name}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        <div>
                            <label className="block text-xs font-medium text-text-secondary mb-1.5 uppercase tracking-wide">
                                Valor Estimado
                            </label>
                            <div className="relative">
                                <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" size={16} />
                                <input
                                    type="number"
                                    name="value"
                                    value={formData.value}
                                    onChange={handleChange}
                                    className="w-full bg-background/50 border border-border/50 rounded-lg pl-10 pr-4 py-2.5 text-text-primary focus:outline-none focus:border-primary/50 transition-colors placeholder:text-text-muted/50"
                                    placeholder="0,00"
                                />
                            </div>
                        </div>

                        <div className="pt-2">
                            <button
                                type="submit"
                                disabled={loading}
                                className="w-full bg-gradient-to-r from-primary to-primary-dark hover:brightness-110 text-white font-semibold py-2.5 rounded-lg shadow-lg shadow-primary/20 transition-all active:scale-[0.98] disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                            >
                                {loading ? (
                                    <>
                                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                                        Salvando...
                                    </>
                                ) : (
                                    isEditing ? 'Salvar Alterações' : 'Criar Lead'
                                )}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
}
