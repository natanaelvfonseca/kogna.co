import { useState, useEffect } from 'react';
import {
    Plus,
    Search,
    Edit2,
    Trash2,
    Copy,
    Package,
    Loader2
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useNotifications } from '../../context/NotificationContext';
import { DebugModal, DebugLog } from '../../components/DebugModal';

interface Product {
    id: string;
    name: string;
    description: string;
    price: string | number;
    active: boolean;
    koins_bonus?: number;
    created_at: string;
}

export function AdminProducts() {
    const { token } = useAuth();
    const { showToast } = useNotifications();
    const [products, setProducts] = useState<Product[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');

    // Modal & Form States
    const [showModal, setShowModal] = useState(false);
    const [editingProduct, setEditingProduct] = useState<Product | null>(null);
    const [formData, setFormData] = useState({ name: '', description: '', price: '', koins_bonus: '' });
    const [formLoading, setFormLoading] = useState(false);

    // Debug State
    const [showDebugModal, setShowDebugModal] = useState(false);
    const [debugLogs, setDebugLogs] = useState<DebugLog[]>([]);

    const apiBase = 'http://127.0.0.1:3000';

    useEffect(() => {
        fetchProducts();
    }, []);

    const fetchProducts = async () => {
        setLoading(true);
        try {
            const res = await fetch(`${apiBase}/api/products`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setProducts(data);
            } else {
                showToast('Erro', 'Falha ao carregar produtos', 'error');
            }
        } catch (error) {
            showToast('Erro', 'Erro de conexão', 'error');
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        if (!formData.name || !formData.price) {
            showToast('Atenção', 'Nome e Preço são obrigatórios', 'warning');
            return;
        }

        setDebugLogs(prev => [...prev, {
            timestamp: new Date().toLocaleTimeString(),
            type: 'info',
            message: `Iniciando ${editingProduct ? 'edição' : 'criação'} de produto...`,
            details: { editingId: editingProduct?.id } // Avoid circular refs or huge objects
        }]);

        setFormLoading(true);
        try {
            const url = editingProduct
                ? `${apiBase}/api/products/${editingProduct.id}`
                : `${apiBase}/api/products`;

            const method = editingProduct ? 'PUT' : 'POST';

            const payload = {
                ...formData,
                price: parseFloat(formData.price.toString().replace(',', '.')),
                koins_bonus: formData.koins_bonus ? parseInt(formData.koins_bonus.toString()) : 0
            };

            setDebugLogs(prev => [...prev, {
                timestamp: new Date().toLocaleTimeString(),
                type: 'info',
                message: 'Preparando payload e enviando requisição...',
                details: { url, method, payload }
            }]);

            const res = await fetch(url, {
                method,
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });

            setDebugLogs(prev => [...prev, {
                timestamp: new Date().toLocaleTimeString(),
                type: 'info',
                message: `Resposta recebida: Status ${res.status}`,
                details: { status: res.status, statusText: res.statusText }
            }]);

            if (res.ok) {
                const data = await res.json();
                setDebugLogs(prev => [...prev, {
                    timestamp: new Date().toLocaleTimeString(),
                    type: 'success',
                    message: 'Operação realizada com sucesso!',
                    details: data
                }]);
                showToast('Sucesso', `Produto ${editingProduct ? 'atualizado' : 'criado'} com sucesso`, 'success');
                setShowModal(false);
                fetchProducts();
            } else {
                const err = await res.json();
                setDebugLogs(prev => [...prev, {
                    timestamp: new Date().toLocaleTimeString(),
                    type: 'error',
                    message: 'Erro retornado pela API',
                    details: err
                }]);
                showToast('Erro', err.error || 'Falha ao salvar produto', 'error');
                setShowDebugModal(true); // Auto-open on error
            }
        } catch (error: any) {
            setDebugLogs(prev => [...prev, {
                timestamp: new Date().toLocaleTimeString(),
                type: 'error',
                message: 'Erro de conexão ou execução',
                details: { message: error.message, stack: error.stack }
            }]);
            showToast('Erro', 'Erro de conexão', 'error');
            setShowDebugModal(true); // Auto-open on error
        } finally {
            setFormLoading(false);
        }
    };

    const handleDelete = async (id: string, name: string) => {
        if (!confirm(`Tem certeza que deseja excluir "${name}"?`)) return;

        try {
            const res = await fetch(`${apiBase}/api/products/${id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (res.ok) {
                showToast('Sucesso', 'Produto excluído', 'success');
                setProducts(products.filter(p => p.id !== id));
            } else {
                showToast('Erro', 'Falha ao excluir produto', 'error');
            }
        } catch (error) {
            showToast('Erro', 'Erro de conexão', 'error');
        }
    };

    const copyLink = (id: string) => {
        const link = `${window.location.origin}/checkout?productId=${id}`;
        navigator.clipboard.writeText(link);
        showToast('Sucesso', 'Link copiado para a área de transferência', 'success');
    };

    const openModal = (product?: Product) => {
        if (product) {
            setEditingProduct(product);
            setFormData({
                name: product.name,
                description: product.description || '',
                price: product.price.toString(),
                koins_bonus: product.koins_bonus ? product.koins_bonus.toString() : ''
            });
        } else {
            setEditingProduct(null);
            setFormData({ name: '', description: '', price: '', koins_bonus: '' });
        }
        setDebugLogs([]); // Clear logs on open
        setShowModal(true);
    };

    const filteredProducts = products.filter(p =>
        p.name.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="p-8 space-y-8 animate-in fade-in duration-500">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold bg-gradient-to-r from-purple-600 to-amber-600 bg-clip-text text-transparent">
                        Gerenciar Produtos
                    </h1>
                    <p className="text-muted-foreground">Crie planos e gere links de checkout</p>
                </div>
                <button
                    onClick={() => openModal()}
                    className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-600 to-amber-600 text-white rounded-lg hover:shadow-lg transition-all"
                >
                    <Plus size={18} />
                    Novo Produto
                </button>
            </div>

            {/* Content */}
            <div className="bg-card border border-border/50 rounded-xl overflow-hidden shadow-sm">
                {/* Toolbar */}
                <div className="p-4 border-b border-border/50">
                    <div className="relative max-w-md">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
                        <input
                            type="text"
                            placeholder="Buscar produto..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 bg-background border border-border rounded-lg text-sm focus:ring-2 focus:ring-purple-500/20 outline-none"
                        />
                    </div>
                </div>

                {/* Table */}
                {loading ? (
                    <div className="flex justify-center p-12">
                        <Loader2 className="animate-spin text-primary w-8 h-8" />
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead className="bg-muted/50 text-muted-foreground text-xs uppercase font-semibold">
                                <tr>
                                    <th className="px-6 py-3">Produto</th>
                                    <th className="px-6 py-3">Preço</th>
                                    <th className="px-6 py-3">Bônus (Koins)</th> {/* Added new header */}
                                    <th className="px-6 py-3">Link Checkout</th>
                                    <th className="px-6 py-3 text-right">Ações</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border/50">
                                {filteredProducts.map((product) => (
                                    <tr key={product.id} className="hover:bg-muted/30 transition-colors">
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-3">
                                                <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg text-purple-600">
                                                    <Package size={20} />
                                                </div>
                                                <div>
                                                    <div className="font-medium text-text-primary">{product.name}</div>
                                                    <div className="text-xs text-text-secondary truncate max-w-[200px]">
                                                        {product.description}
                                                    </div>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 font-mono font-medium text-text-primary">
                                            R$ {parseFloat(product.price.toString()).toFixed(2)}
                                        </td>
                                        <td className="px-6 py-4 font-mono text-text-primary"> {/* Added new data cell */}
                                            {product.koins_bonus || 0}
                                        </td>
                                        <td className="px-6 py-4">
                                            <button
                                                onClick={() => copyLink(product.id)}
                                                className="flex items-center gap-2 text-xs font-medium text-primary hover:text-primary/80 bg-primary/10 px-3 py-1.5 rounded-full transition-colors"
                                            >
                                                <Copy size={12} />
                                                Copiar Link
                                            </button>
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <div className="flex justify-end gap-2">
                                                <button
                                                    onClick={() => openModal(product)}
                                                    className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                                    title="Editar"
                                                >
                                                    <Edit2 size={18} />
                                                </button>
                                                <button
                                                    onClick={() => handleDelete(product.id, product.name)}
                                                    className="p-2 text-text-secondary hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-colors"
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                                {filteredProducts.length === 0 && (
                                    <tr>
                                        <td colSpan={5} className="p-8 text-center text-text-secondary"> {/* Updated colspan */}
                                            Nenhum produto encontrado.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Modal */}
            {showModal && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 animate-in fade-in duration-200">
                    <div className="bg-surface border border-border rounded-xl p-6 w-full max-w-md shadow-2xl animate-in slide-in-from-bottom-4 duration-300">
                        <h2 className="text-xl font-bold mb-4">
                            {editingProduct ? 'Editar Produto' : 'Novo Produto'}
                        </h2>

                        <div className="space-y-4">
                            <div>
                                <label className="text-sm font-medium mb-1 block">Nome do Produto</label>
                                <input
                                    type="text"
                                    value={formData.name}
                                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                                    className="w-full bg-background border border-border rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-primary/20"
                                    placeholder="Ex: Plano Pro"
                                />
                            </div>

                            <div>
                                <label className="text-sm font-medium mb-1 block">Preço (R$)</label>
                                <input
                                    type="number"
                                    step="0.01"
                                    value={formData.price}
                                    onChange={e => setFormData({ ...formData, price: e.target.value })}
                                    className="w-full bg-background border border-border rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-primary/20"
                                    placeholder="0.00"
                                />
                            </div>

                            {/* New Koins Bonus Input */}
                            <div>
                                <label className="text-sm font-medium mb-1 block">Bônus de Koins (Opcional)</label>
                                <input
                                    type="number"
                                    step="1"
                                    value={formData.koins_bonus}
                                    onChange={e => setFormData({ ...formData, koins_bonus: e.target.value })}
                                    className="w-full bg-background border border-border rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-primary/20"
                                    placeholder="Ex: 100"
                                />
                                <p className="text-xs text-muted-foreground mt-1">
                                    Se preenchido, o usuário receberá esta quantidade exata de Koins ao comprar este produto, ignorando a regra padrão de 10x o valor.
                                </p>
                            </div>

                            <div>
                                <label className="text-sm font-medium mb-1 block">Descrição (Opcional)</label>
                                <textarea
                                    value={formData.description}
                                    onChange={e => setFormData({ ...formData, description: e.target.value })}
                                    className="w-full bg-background border border-border rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-primary/20 min-h-[80px]"
                                    placeholder="Detalhes do produto..."
                                />
                            </div>

                            <div className="flex justify-end gap-3 mt-6">
                                <button
                                    onClick={() => setShowModal(false)}
                                    className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={handleSave}
                                    disabled={formLoading}
                                    className="px-4 py-2 bg-gradient-to-r from-purple-600 to-amber-600 text-white rounded-lg hover:shadow-lg transition-all disabled:opacity-50"
                                >
                                    {formLoading ? <Loader2 className="animate-spin" /> : 'Salvar'}
                                </button>
                            </div>

                            {/* Debug Button (Manual Trigger) */}
                            <div className="mt-4 flex justify-center">
                                <button
                                    onClick={() => setShowDebugModal(true)}
                                    className="text-xs text-blue-500 hover:underline flex items-center gap-1"
                                >
                                    <span role="img" aria-label="bug">🐛</span> Ver Logs de Debug
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <DebugModal
                isOpen={showDebugModal}
                onClose={() => setShowDebugModal(false)}
                logs={debugLogs}
                title="Debug de Produtos"
            />
        </div>
    );
}
