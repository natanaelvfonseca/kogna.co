import { useState, useEffect } from 'react';
import { Trash, Plus, Save, Clock, Image as ImageIcon, MessageSquare, AlertCircle, Bug, Pencil } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { DebugModal, DebugLog } from '../../components/DebugModal';

interface FollowupSequence {
    id: string;
    delay_days: number;
    message: string;
    image_url?: string;
    active: boolean;
}

export function FollowupManager() {
    const { user } = useAuth();
    const [sequences, setSequences] = useState<FollowupSequence[]>([]);
    const [loading, setLoading] = useState(true);
    const [newDelay, setNewDelay] = useState(1);
    const [newMessage, setNewMessage] = useState('');
    const [newImage, setNewImage] = useState<File | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [debugOpen, setDebugOpen] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [logs, setLogs] = useState<DebugLog[]>([]);

    const addLog = (type: DebugLog['type'], message: string, details?: any) => {
        const newLog = {
            timestamp: new Date().toLocaleTimeString(),
            type,
            message,
            details
        };
        setLogs(prev => [newLog, ...prev]);
        
    };

    useEffect(() => {
        fetchSequences();
    }, []);

    const fetchSequences = async () => {
        addLog('info', 'Fetching sequences...');
        try {
            const res = await fetch('/api/recovery/sequences', {
                headers: {
                    'Authorization': `Bearer mock-jwt-token-for-${user?.id}`
                }
            });
            addLog('info', `Fetch status: ${res.status}`);
            if (res.ok) {
                const data = await res.json();
                setSequences(data);
                addLog('success', `Loaded ${data.length} sequences`);
            } else {
                const text = await res.text();
                addLog('error', 'Failed to fetch sequences', text);
            }
        } catch (error) {
            console.error('Failed to fetch sequences', error);
            addLog('error', 'Network error fetching sequences', error);
        } finally {
            setLoading(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        addLog('info', `Starting sequence ${editingId ? 'update' : 'creation'}...`);

        const formData = new FormData();
        formData.append('delayDays', newDelay.toString());
        formData.append('message', newMessage);
        if (newImage) {
            formData.append('image', newImage);
            addLog('info', 'Image attached', newImage.name);
        }

        try {
            const url = editingId
                ? `/api/recovery/sequences/${editingId}`
                : '/api/recovery/sequences';

            const method = editingId ? 'PUT' : 'POST';

            addLog('info', `Sending ${method} request to ${url}`);

            const res = await fetch(url, {
                method: method,
                headers: {
                    'Authorization': `Bearer mock-jwt-token-for-${user?.id}`
                },
                body: formData,
            });

            addLog('info', `Response status: ${res.status}`);

            if (res.ok) {
                setNewMessage('');
                setNewDelay(1);
                setNewImage(null);
                setEditingId(null);
                fetchSequences();
                addLog('success', `Sequence ${editingId ? 'updated' : 'created'} successfully`);
            } else {
                const errText = await res.text();
                addLog('error', 'Server error response', errText);
                console.error(`Error ${editingId ? 'updating' : 'creating'} sequence:`, res.status, errText);
                try {
                    const err = JSON.parse(errText);
                    setError(err.error || `Falha ao ${editingId ? 'atualizar' : 'criar'} sequência.`);
                } catch (e) {
                    setError("Erro no servidor: " + errText.substring(0, 50));
                }
            }
        } catch (error) {
            console.error("Connection error in FollowupManager:", error);
            addLog('error', 'Connection/Network Error', error);
            setError("Erro de conexão: " + (error as any).message);
        }
    };

    const handleEdit = (seq: FollowupSequence) => {
        setEditingId(seq.id);
        setNewDelay(seq.delay_days);
        setNewMessage(seq.message);
        setNewImage(null); // Reset image input as we can't pre-fill file inputs
        addLog('info', 'Editing sequence', seq.id);
    };

    const cancelEdit = () => {
        setEditingId(null);
        setNewMessage('');
        setNewDelay(1);
        setNewImage(null);
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Tem certeza que deseja excluir esta sequência?')) return;
        try {
            const res = await fetch(`/api/recovery/sequences/${id}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer mock-jwt-token-for-${user?.id}`
                }
            });
            if (res.ok) {
                setSequences(sequences.filter(s => s.id !== id));
            }
        } catch (error) {
            console.error(error);
        }
    };

    return (
        <div className="space-y-6 animate-in fade-in duration-500 p-6">
            <div>
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-3xl font-bold bg-gradient-to-r from-primary to-purple-600 bg-clip-text text-transparent">
                            Máquina de Recuperação
                        </h1>
                        <p className="text-muted-foreground mt-2">
                            Configure mensagens automáticas para recuperar leads inativos.
                        </p>
                    </div>
                    <button
                        onClick={() => setDebugOpen(true)}
                        className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-muted-foreground bg-muted hover:text-foreground hover:bg-muted/80 rounded-md transition-colors"
                    >
                        <Bug size={14} />
                        Debug Info
                    </button>
                </div>
                <DebugModal
                    isOpen={debugOpen}
                    onClose={() => setDebugOpen(false)}
                    logs={logs}
                    title="Recovery Machine Debug"
                />
            </div>

            {error && (
                <div className="bg-destructive/10 border border-destructive/20 text-destructive p-3 rounded-md flex items-center gap-2">
                    <AlertCircle className="h-4 w-4" />
                    <span className="text-sm">{error}</span>
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Form Section */}
                <div className="lg:col-span-1 h-fit border border-primary/20 shadow-lg bg-card/50 backdrop-blur-sm rounded-xl overflow-hidden">
                    <div className="p-6 border-b border-border/10">
                        <h3 className="text-lg font-semibold flex items-center gap-2">
                            <Plus className="h-5 w-5 text-primary" />
                            {editingId ? 'Editar Mensagem' : 'Nova Mensagem'}
                        </h3>
                        <p className="text-sm text-muted-foreground">
                            {editingId ? 'Atualize os detalhes da sequência.' : 'Adicione um passo na sequência de recuperação.'}
                        </p>
                    </div>
                    <div className="p-6">
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div className="space-y-2">
                                <label htmlFor="delay" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">Dias após última interação</label>
                                <div className="relative">
                                    <Clock className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                                    <input
                                        id="delay"
                                        type="number"
                                        min="1"
                                        value={newDelay}
                                        onChange={(e) => setNewDelay(parseInt(e.target.value))}
                                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 pl-9"
                                        required
                                    />
                                </div>
                                <p className="text-xs text-muted-foreground">Ex: 1 = Enviar 1 dia após o último contato.</p>
                            </div>

                            <div className="space-y-2">
                                <label htmlFor="message" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">Mensagem de Texto</label>
                                <textarea
                                    id="message"
                                    placeholder="Olá! Vi que você se interessou..."
                                    value={newMessage}
                                    onChange={(e) => setNewMessage(e.target.value)}
                                    className="flex min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                    required
                                />
                            </div>

                            <div className="space-y-2">
                                <label htmlFor="image" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">Imagem (Opcional)</label>
                                <div className="flex items-center gap-2">
                                    <input
                                        id="image"
                                        type="file"
                                        accept="image/*"
                                        onChange={(e) => setNewImage(e.target.files?.[0] || null)}
                                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer pt-1.5"
                                    />
                                </div>
                                <p className="text-xs text-muted-foreground">Envie depoimentos ou fotos do produto.</p>
                            </div>

                            <button type="submit" className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2 w-full bg-gradient-to-r from-primary to-purple-600 hover:opacity-90 transition-all">
                                <Save className="mr-2 h-4 w-4" />
                                {editingId ? 'Atualizar Sequência' : 'Salvar Sequência'}
                            </button>
                            {editingId && (
                                <button
                                    type="button"
                                    onClick={cancelEdit}
                                    className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-10 px-4 py-2 w-full"
                                >
                                    Cancelar
                                </button>
                            )}
                        </form>
                    </div>
                </div>

                {/* List Section */}
                <div className="lg:col-span-2 space-y-4">
                    <h2 className="text-xl font-semibold flex items-center gap-2">
                        <MessageSquare className="h-5 w-5" />
                        Sequência Ativa
                    </h2>

                    {loading ? (
                        <div className="flex justify-center p-8">Carregando...</div>
                    ) : sequences.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-border bg-card text-card-foreground shadow-sm">
                            <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground p-6">
                                <MessageSquare className="h-12 w-12 mb-4 opacity-20" />
                                <p>Nenhuma mensagem configurada.</p>
                                <p className="text-sm">Adicione a primeira mensagem ao lado.</p>
                            </div>
                        </div>
                    ) : (
                        <div className="grid gap-4">
                            {sequences.map((seq, index) => (
                                <div key={seq.id} className="relative group hover:shadow-md transition-all border-l-4 border-l-primary/50 rounded-lg border border-border bg-card text-card-foreground shadow-sm">
                                    <div className="p-6 flex gap-4 items-start">
                                        <div className="flex-shrink-0 flex flex-col items-center justify-center bg-primary/10 rounded-lg p-3 w-16 h-16">
                                            <span className="text-2xl font-bold text-primary">{seq.delay_days}</span>
                                            <span className="text-xs uppercase font-bold text-primary/70">Dias</span>
                                        </div>

                                        <div className="flex-1 space-y-2">
                                            <div className="flex items-start justify-between">
                                                <h3 className="font-semibold text-lg">Passo {index + 1}</h3>
                                                <div className="flex gap-2">
                                                    <button
                                                        onClick={() => handleEdit(seq)}
                                                        className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 hover:bg-accent hover:text-accent-foreground h-10 w-10 text-muted-foreground hover:text-primary transition-colors opacity-0 group-hover:opacity-100"
                                                        title="Editar"
                                                    >
                                                        <Pencil className="h-4 w-4" />
                                                    </button>
                                                    <button
                                                        onClick={() => handleDelete(seq.id)}
                                                        className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 hover:bg-accent hover:text-accent-foreground h-10 w-10 text-muted-foreground hover:text-destructive transition-colors opacity-0 group-hover:opacity-100"
                                                        title="Excluir"
                                                    >
                                                        <Trash className="h-4 w-4" />
                                                    </button>
                                                </div>
                                            </div>

                                            <p className="text-sm text-foreground/80 whitespace-pre-wrap bg-muted/30 p-3 rounded-md border">
                                                {seq.message}
                                            </p>

                                            {seq.image_url && (
                                                <div className="mt-2">
                                                    <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                                                        <ImageIcon className="h-3 w-3" />
                                                        Imagem anexa:
                                                    </div>
                                                    <img
                                                        src={seq.image_url}
                                                        alt="Anexo"
                                                        className="h-24 w-auto object-cover rounded-md border hover:scale-105 transition-transform cursor-pointer"
                                                        onClick={() => window.open(seq.image_url, '_blank')}
                                                    />
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Connector Line (visual only, for list) */}
                                    {index < sequences.length - 1 && (
                                        <div className="absolute left-[2.35rem] -bottom-6 w-0.5 h-6 bg-border -z-10"></div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
