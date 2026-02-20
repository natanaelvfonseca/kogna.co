import React, { useState, useEffect } from 'react';
import { X, Save, User, Mail, Phone, Building2, DollarSign, Package, FileText } from 'lucide-react';
import { Client } from '../Clients';

// Local Product interface is fine
interface Product {
    id: string;
    name: string;
}

interface EditClientModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (updatedClient: any) => void;
    client: Client;
}

export const EditClientModal: React.FC<EditClientModalProps> = ({ isOpen, onClose, onSave, client }) => {
    const [formData, setFormData] = useState<Client>({ ...client });
    const [products, setProducts] = useState<Product[]>([]);
    const [loading, setLoading] = useState(false);
    const token = localStorage.getItem('token');

    useEffect(() => {
        setFormData({ ...client });
    }, [client]);

    useEffect(() => {
        if (isOpen) {
            fetchProducts();
        }
    }, [isOpen]);

    const fetchProducts = async () => {
        try {
            const apiBase = '';
            const res = await fetch(`${apiBase}/api/products`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setProducts(data);
            }
        } catch (error) {
            console.error('Failed to fetch products:', error);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        try {
            const apiBase = '';
            const res = await fetch(`${apiBase}/api/leads/${client.id}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(formData)
            });

            if (res.ok) {
                const updated = await res.json();
                onSave(updated);
                onClose();
            } else {
                alert('Erro ao atualizar cliente');
            }
        } catch (error) {
            console.error('Update client error:', error);
            alert('Erro de conexão');
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
            <div className="bg-card w-full max-w-lg rounded-2xl border border-border shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
                <div className="p-6 border-b border-border flex items-center justify-between bg-secondary/30">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-primary/10 rounded-lg text-primary">
                            <User size={20} />
                        </div>
                        <h2 className="text-xl font-semibold text-text-primary">Editar Cliente</h2>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-secondary rounded-lg transition-colors text-text-muted">
                        <X size={20} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                            <label className="text-sm font-medium text-text-secondary flex items-center gap-2">
                                <User size={14} /> Nome
                            </label>
                            <input
                                type="text"
                                required
                                value={formData.name}
                                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                className="w-full px-4 py-2 bg-secondary/50 border border-border rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                            />
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-sm font-medium text-text-secondary flex items-center gap-2">
                                <Mail size={14} /> E-mail
                            </label>
                            <input
                                type="email"
                                value={formData.email}
                                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                className="w-full px-4 py-2 bg-secondary/50 border border-border rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                            />
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-sm font-medium text-text-secondary flex items-center gap-2">
                                <Phone size={14} /> WhatsApp
                            </label>
                            <input
                                type="text"
                                value={formData.phone}
                                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                                className="w-full px-4 py-2 bg-secondary/50 border border-border rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                            />
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-sm font-medium text-text-secondary flex items-center gap-2">
                                <Building2 size={14} /> Empresa
                            </label>
                            <input
                                type="text"
                                value={formData.company}
                                onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                                className="w-full px-4 py-2 bg-secondary/50 border border-border rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                            />
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-sm font-medium text-text-secondary flex items-center gap-2">
                                <DollarSign size={14} /> Valor da Venda
                            </label>
                            <input
                                type="number"
                                step="0.01"
                                value={formData.value}
                                onChange={(e) => setFormData({ ...formData, value: parseFloat(e.target.value) })}
                                className="w-full px-4 py-2 bg-secondary/50 border border-border rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                            />
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-sm font-medium text-text-secondary flex items-center gap-2">
                                <Package size={14} /> Produto Vendido
                            </label>
                            <select
                                value={formData.productId || ''}
                                onChange={(e) => setFormData({ ...formData, productId: e.target.value })}
                                className="w-full px-4 py-2 bg-secondary/50 border border-border rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all appearance-none"
                            >
                                <option value="">Selecione um produto</option>
                                {products.map(p => (
                                    <option key={p.id} value={p.id}>{p.name}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div className="space-y-1.5 pt-2">
                        <label className="text-sm font-medium text-text-secondary flex items-center gap-2">
                            <FileText size={14} /> Notas / Observações
                        </label>
                        <textarea
                            value={formData.notes || ''}
                            onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                            rows={4}
                            placeholder="Adicione detalhes sobre a venda, necessidades do cliente, etc..."
                            className="w-full px-4 py-2 bg-secondary/50 border border-border rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all resize-none"
                        />
                    </div>

                    <div className="pt-4 flex gap-3">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 px-4 py-2 bg-secondary hover:bg-secondary/80 text-text-primary rounded-xl transition-all font-medium border border-border"
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            disabled={loading}
                            className="flex-1 px-4 py-2 bg-primary hover:bg-primary-hover text-white rounded-xl transition-all font-medium shadow-lg shadow-primary/20 flex items-center justify-center gap-2 disabled:opacity-50"
                        >
                            {loading ? (
                                <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                            ) : (
                                <Save size={18} />
                            )}
                            Salvar Alterações
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};
