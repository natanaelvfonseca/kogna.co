import React, { useState, useEffect } from 'react';
import { X, Upload, FileText, Trash2, Save, Sparkles, Brain, MessageSquare } from 'lucide-react';

interface Agent {
    id: string;
    name: string;
    type: string;
    system_prompt?: string;
    model_config?: any;
    training_files?: any[];
    whatsapp_instance_id?: string;
}

interface WhatsAppInstance {
    id: string;
    instance_name: string;
    status: string;
    organization_id: string;
    connected_agent_id?: string;
    connected_agent_name?: string;
}

interface AgentEditModalProps {
    agent: Agent;
    isOpen: boolean;
    onClose: () => void;
    onUpdate: () => void;
}

export default function AgentEditModal({ agent, isOpen, onClose, onUpdate }: AgentEditModalProps) {
    const [activeTab, setActiveTab] = useState<'behavior' | 'knowledge' | 'connection'>('behavior');
    const [systemPrompt, setSystemPrompt] = useState(agent.system_prompt || '');
    const [temperature, setTemperature] = useState(agent.model_config?.temperature || 0.7);
    const [files, setFiles] = useState<any[]>(agent.training_files || []);
    const [whatsappInstanceId, setWhatsappInstanceId] = useState(agent.whatsapp_instance_id || '');
    const [instances, setInstances] = useState<WhatsAppInstance[]>([]);
    const [isUploading, setIsUploading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        if (isOpen) {
            setSystemPrompt(agent.system_prompt || '');
            setTemperature(agent.model_config?.temperature || 0.7);
            setFiles(agent.training_files || []);
            setWhatsappInstanceId(agent.whatsapp_instance_id || '');

            // Fetch available instances
            fetch('/api/whatsapp/instances', {
                headers: { 'Authorization': `Bearer ${localStorage.getItem('kogna_token')}` }
            })
                .then(res => res.json())
                .then(data => setInstances(Array.isArray(data) ? data : []))
                .catch(err => console.error('Failed to load instances', err));
        }
    }, [agent, isOpen]);

    if (!isOpen) return null;

    const handleSave = async () => {
        setIsSaving(true);
        try {
            const res = await fetch(`/api/agents/${agent.id}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('kogna_token')}`
                },
                body: JSON.stringify({
                    system_prompt: systemPrompt,
                    model_config: { ...agent.model_config, temperature },
                    whatsapp_instance_id: whatsappInstanceId || null
                })
            });

            if (!res.ok) throw new Error('Failed to update');

            onUpdate();
            onClose();
        } catch (error) {
            alert('Erro ao salvar alterações');
        } finally {
            setIsSaving(false);
        }
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files || e.target.files.length === 0) return;

        setIsUploading(true);
        const formData = new FormData();
        Array.from(e.target.files).forEach(file => {
            formData.append('files', file);
        });

        try {
            const res = await fetch(`/api/agents/${agent.id}/upload`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('kogna_token')}`
                },
                body: formData
            });

            if (!res.ok) throw new Error('Upload failed');

            const data = await res.json();
            setFiles(data.files);
            onUpdate(); // Refresh parent list if needed
        } catch (error) {
            alert('Erro ao fazer upload');
        } finally {
            setIsUploading(false);
        }
    };

    const handleDeleteFile = async (filename: string) => {
        if (!confirm('Deseja excluir este arquivo da base de conhecimento?')) return;

        try {
            const res = await fetch(`/api/agents/${agent.id}/knowledge/${filename}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('kogna_token')}`
                }
            });

            if (!res.ok) throw new Error('Failed to delete');

            setFiles(prev => prev.filter(f => f.filename !== filename));
            onUpdate();
        } catch (error) {
            alert('Erro ao excluir arquivo');
        }
    };

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="bg-[#1A1A1A] w-[900px] h-[600px] rounded-2xl border border-white/10 flex overflow-hidden shadow-2xl">

                {/* Sidebar */}
                <div className="w-64 bg-[#111] border-r border-white/5 p-6 flex flex-col">
                    <h2 className="text-xl font-bold text-white mb-1">{agent.name}</h2>
                    <p className="text-xs text-white/40 uppercase tracking-widest mb-8">{agent.type}</p>

                    <nav className="space-y-2 flex-1">
                        <button
                            onClick={() => setActiveTab('behavior')}
                            className={`w-full text-left px-4 py-3 rounded-lg flex items-center gap-3 transition-colors ${activeTab === 'behavior'
                                ? 'bg-[#FF4C00]/10 text-[#FF4C00] border border-[#FF4C00]/20'
                                : 'text-white/60 hover:bg-white/5'
                                }`}
                        >
                            <Brain size={18} />
                            <span>Comportamento</span>
                        </button>
                        <button
                            onClick={() => setActiveTab('knowledge')}
                            className={`w-full text-left px-4 py-3 rounded-lg flex items-center gap-3 transition-colors ${activeTab === 'knowledge'
                                ? 'bg-[#FF4C00]/10 text-[#FF4C00] border border-[#FF4C00]/20'
                                : 'text-white/60 hover:bg-white/5'
                                }`}
                        >
                            <Sparkles size={18} />
                            <span>Conhecimento</span>
                        </button>
                        <button
                            onClick={() => setActiveTab('connection')}
                            className={`w-full text-left px-4 py-3 rounded-lg flex items-center gap-3 transition-colors ${activeTab === 'connection'
                                ? 'bg-[#FF4C00]/10 text-[#FF4C00] border border-[#FF4C00]/20'
                                : 'text-white/60 hover:bg-white/5'
                                }`}
                        >
                            <MessageSquare size={18} />
                            <span>Conexão</span>
                        </button>
                    </nav>

                    <div className="pt-6 border-t border-white/10">
                        <button
                            onClick={handleSave}
                            disabled={isSaving}
                            className="w-full bg-[#FF4C00] hover:bg-[#FF4C00]/90 text-white py-3 rounded-lg font-medium flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
                        >
                            {isSaving ? 'Salvando...' : <><Save size={18} /> Salvar Alterações</>}
                        </button>
                    </div>
                </div>

                {/* Content Area */}
                <div className="flex-1 bg-[#1A1A1A] flex flex-col relative">
                    <button
                        onClick={onClose}
                        className="absolute top-4 right-4 p-2 text-white/40 hover:text-white bg-black/20 hover:bg-white/10 rounded-full transition-colors"
                    >
                        <X size={20} />
                    </button>

                    <div className="flex-1 overflow-y-auto p-8">
                        {activeTab === 'behavior' && (
                            <div className="space-y-6">
                                <div>
                                    <label className="block text-sm font-medium text-white mb-2">Prompt do Sistema (Personalidade)</label>
                                    <p className="text-xs text-white/40 mb-3">Defina como o agente deve se comportar, tom de voz e regras.</p>
                                    <textarea
                                        value={systemPrompt}
                                        onChange={(e) => setSystemPrompt(e.target.value)}
                                        className="w-full h-96 bg-[#0A0A0A] border border-white/10 rounded-xl p-4 text-sm text-white/80 focus:outline-none focus:border-[#FF4C00]/50 font-mono resize-none leading-relaxed"
                                        placeholder="Você é um assistente útil..."
                                    />
                                </div>

                                <div>
                                    <div className="flex justify-between mb-2">
                                        <label className="text-sm font-medium text-white">Criatividade (Temperatura)</label>
                                        <span className="text-sm text-[#FF4C00] font-mono">{temperature}</span>
                                    </div>
                                    <input
                                        type="range"
                                        min="0"
                                        max="1"
                                        step="0.1"
                                        value={temperature}
                                        onChange={(e) => setTemperature(parseFloat(e.target.value))}
                                        className="w-full h-2 bg-white/10 rounded-lg appearance-none cursor-pointer accent-[#FF4C00]"
                                    />
                                    <div className="flex justify-between text-xs text-white/40 mt-1">
                                        <span>Preciso (0.0)</span>
                                        <span>Criativo (1.0)</span>
                                    </div>
                                </div>
                            </div>
                        )}

                        {activeTab === 'knowledge' && (
                            <div className="space-y-6">
                                <div>
                                    <h3 className="text-lg font-medium text-white mb-1">Base de Conhecimento</h3>
                                    <p className="text-sm text-white/40 mb-6">Carregue documentos PDF, TXT ou DOCX para treinar seu agente.</p>

                                    <div className="border-2 border-dashed border-white/10 rounded-xl p-8 text-center transition-colors hover:border-[#FF4C00]/50 hover:bg-[#FF4C00]/5 group cursor-pointer relative">
                                        <input
                                            type="file"
                                            multiple
                                            accept=".pdf,.txt,.docx,.md"
                                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                            onChange={handleFileUpload}
                                            disabled={isUploading}
                                        />
                                        <div className="w-12 h-12 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform">
                                            <Upload className="text-white/60 group-hover:text-[#FF4C00]" size={24} />
                                        </div>
                                        <h4 className="text-white font-medium mb-1">
                                            {isUploading ? 'Enviando...' : 'Clique ou arraste arquivos aqui'}
                                        </h4>
                                        <p className="text-xs text-white/40">Suporta PDF, TXT, DOCX (Max 10MB)</p>
                                    </div>
                                </div>

                                <div className="space-y-3">
                                    <h4 className="text-sm font-medium text-white/60 uppercase tracking-wider">Arquivos ({files.length})</h4>

                                    {files.length === 0 && (
                                        <div className="text-center py-8 text-white/20 italic text-sm">
                                            Nenhum arquivo na base de conhecimento.
                                        </div>
                                    )}

                                    {files.map((file, idx) => (
                                        <div key={idx} className="flex items-center justify-between p-3 bg-white/5 rounded-lg border border-white/5 hover:border-white/10 transition-colors">
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded bg-[#FF4C00]/10 flex items-center justify-center text-[#FF4C00]">
                                                    <FileText size={16} />
                                                </div>
                                                <div>
                                                    <p className="text-sm text-white font-medium truncate max-w-[200px]">{file.originalName || file.name}</p>
                                                    <p className="text-xs text-white/40">{new Date(file.uploadedAt).toLocaleDateString()}</p>
                                                </div>
                                            </div>
                                            <button
                                                onClick={() => handleDeleteFile(file.filename)}
                                                className="p-2 text-white/40 hover:text-red-500 transition-colors"
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {activeTab === 'connection' && (
                            <div className="space-y-6">
                                <div>
                                    <h3 className="text-lg font-medium text-white mb-1">Conexão com WhatsApp</h3>
                                    <p className="text-sm text-white/40 mb-6">Escolha qual número de WhatsApp este agente deve utilizar.</p>

                                    <div className="space-y-3">
                                        <div
                                            onClick={() => setWhatsappInstanceId('')}
                                            className={`p-4 border rounded-xl cursor-pointer transition-all flex items-center gap-3 ${!whatsappInstanceId
                                                ? 'border-[#FF4C00] bg-[#FF4C00]/10'
                                                : 'border-white/10 bg-white/5 hover:bg-white/10'
                                                }`}
                                        >
                                            <div className={`w-5 h-5 rounded-full border flex items-center justify-center ${!whatsappInstanceId ? 'border-[#FF4C00]' : 'border-white/20'
                                                }`}>
                                                {!whatsappInstanceId && <div className="w-2.5 h-2.5 rounded-full bg-[#FF4C00]" />}
                                            </div>
                                            <span className="text-white font-medium">Nenhum WhatsApp conectado</span>
                                        </div>

                                        {instances.map((inst) => {
                                            const isTaken = inst.connected_agent_id && inst.connected_agent_id !== agent.id;
                                            const isSelected = whatsappInstanceId === inst.id;

                                            return (
                                                <div
                                                    key={inst.id}
                                                    onClick={() => !isTaken && setWhatsappInstanceId(inst.id)}
                                                    className={`p-4 border rounded-xl transition-all relative ${isTaken
                                                        ? 'border-white/5 bg-white/5 opacity-60 cursor-not-allowed'
                                                        : isSelected
                                                            ? 'border-[#FF4C00] bg-[#FF4C00]/10 cursor-pointer'
                                                            : 'border-white/10 bg-white/5 hover:bg-white/10 cursor-pointer'
                                                        }`}
                                                >
                                                    <div className="flex items-center justify-between">
                                                        <div className="flex items-center gap-3">
                                                            <div className={`p-2 rounded-full ${inst.status === 'CONNECTED' ? 'bg-green-500/20 text-green-500' : 'bg-red-500/20 text-red-500'
                                                                }`}>
                                                                <MessageSquare size={18} />
                                                            </div>
                                                            <div>
                                                                <p className="font-medium text-white">{inst.instance_name}</p>
                                                                <div className="flex items-center gap-2 mt-0.5">
                                                                    <span className={`text-[10px] uppercase tracking-wider font-bold ${inst.status === 'CONNECTED' ? 'text-green-500' : 'text-red-500'
                                                                        }`}>
                                                                        {inst.status === 'CONNECTED' ? 'Conectado' : 'Desconectado'}
                                                                    </span>

                                                                    {isTaken && (
                                                                        <span className="text-[10px] text-orange-500 flex items-center gap-1 bg-orange-500/10 px-2 py-0.5 rounded-full">
                                                                            Em uso por: {inst.connected_agent_name}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        </div>

                                                        {!isTaken && (
                                                            <div className={`w-5 h-5 rounded-full border flex items-center justify-center ${isSelected ? 'border-[#FF4C00]' : 'border-white/20'
                                                                }`}>
                                                                {isSelected && <div className="w-2.5 h-2.5 rounded-full bg-[#FF4C00]" />}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>

                                    <div className="mt-4 p-4 bg-blue-500/10 border border-blue-500/20 rounded-xl flex gap-3">
                                        <div className="text-blue-400 mt-0.5">
                                            <Sparkles size={18} />
                                        </div>
                                        <div>
                                            <p className="text-sm text-blue-200 font-medium">Nota Importante</p>
                                            <p className="text-xs text-blue-200/60 mt-1">
                                                Cada conexão de WhatsApp só pode estar vinculada a um único Agente de IA por vez para garantir que não haja conflito nas respostas.
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
