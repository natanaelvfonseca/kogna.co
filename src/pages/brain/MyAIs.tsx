import { useState, useEffect } from 'react';
import { Plus, Bot, MoreVertical, Cpu, X, Loader2, Smartphone, Play, Pause, Building2, Wand2, ChevronLeft } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import AgentEditModal from '../../components/agents/AgentEditModal';
import { agentTemplates } from '../../data/agentTemplates';

interface Agent {
    id: string;
    type: string;
    name: string;
    status: 'active' | 'inactive' | 'paused';
    created_at: string;
    whatsapp_instance_name?: string;
    whatsapp_instance_status?: string;
}

interface CompanyData {
    companyName: string;
    companyProduct: string;
    targetAudience: string;
    voiceTone: string;
    unknownBehavior: string;
    restrictions: string;
}

function buildPromptFromTemplate(templateId: string, data: CompanyData): string {
    const template = agentTemplates.find(t => t.id === templateId);
    if (!template) return `You are a ${templateId} agent.`;
    return template.basePrompt
        .replace(/\{\{companyProduct\}\}/g, data.companyProduct || '')
        .replace(/\{\{targetAudience\}\}/g, data.targetAudience || '')
        .replace(/\{\{voiceTone\}\}/g, data.voiceTone || '')
        .replace(/\{\{unknownBehavior\}\}/g, data.unknownBehavior || '')
        .replace(/\{\{restrictions\}\}/g, data.restrictions || '');
}

export function MyAIs() {
    const { user, token } = useAuth();
    const [agents, setAgents] = useState<Agent[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [editingAgent, setEditingAgent] = useState<Agent | null>(null);

    const [newName, setNewName] = useState('');
    const [newType, setNewType] = useState('sdr');
    const [isCreating, setIsCreating] = useState(false);
    const [openMenuId, setOpenMenuId] = useState<string | null>(null);

    // New create flow state
    const [createStep, setCreateStep] = useState<'choose' | 'form'>('choose');
    const [createMode, setCreateMode] = useState<'scratch' | 'company' | null>(null);
    const [companyData, setCompanyData] = useState<CompanyData | null>(null);
    const [isLoadingCompanyData, setIsLoadingCompanyData] = useState(false);
    const [hasCompanyData, setHasCompanyData] = useState<boolean | null>(null);

    // Initial Fetch
    useEffect(() => {
        if (user) {
            fetchAgents();
        }
    }, [user]); // Re-fetch if user changes

    const fetchAgents = async () => {
        try {
            const res = await fetch('/api/agents', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            if (res.ok) {
                const data = await res.json();
                setAgents(data);
            }
        } catch (error) {
            console.error('Failed to fetch agents', error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleTogglePause = async (agent: Agent) => {
        try {
            const res = await fetch(`/api/agents/${agent.id}/toggle-pause`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (res.ok) {
                const data = await res.json();
                setAgents(prev => prev.map(a =>
                    a.id === agent.id ? { ...a, status: data.status } : a
                ));
            } else {
                alert('Erro ao alterar status da IA.');
            }
        } catch (error) {
            console.error('Toggle pause error:', error);
            alert('Erro de conexão.');
        } finally {
            setOpenMenuId(null);
        }
    };

    const handleDeleteAgent = async (agentId: string) => {
        if (!window.confirm('Tem certeza que deseja excluir esta IA? Esta ação não pode ser desfeita.')) return;

        try {
            const res = await fetch(`/api/agents/${agentId}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (res.ok) {
                await fetchAgents();
            } else {
                let errorMsg = 'Erro desconhecido';
                try {
                    const errorData = await res.json();
                    errorMsg = errorData.error || errorData.details || errorMsg;
                } catch (e) {
                    errorMsg = `Status ${res.status}: ${res.statusText}`;
                }
                alert(`Erro ao excluir agente: ${errorMsg}`);
            }
        } catch (error) {
            console.error('Delete error:', error);
            alert(`Erro de conexão ao excluir: ${error instanceof Error ? error.message : String(error)}`);
        } finally {
            setOpenMenuId(null);
        }
    };

    const handleCreateAgent = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsCreating(true);

        try {
            // Build system_prompt based on mode
            let systemPrompt = `You are a ${newType} agent.`;
            if (createMode === 'company' && companyData) {
                systemPrompt = buildPromptFromTemplate(newType, companyData);
            }

            const res = await fetch('/api/agents', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    name: newName,
                    type: newType,
                    system_prompt: systemPrompt,
                    model_config: {}
                })
            });

            if (res.ok) {
                await fetchAgents();
                setShowCreateModal(false);
                setNewName('');
                setNewType('sdr');
                setCreateStep('choose');
                setCreateMode(null);
                setCompanyData(null);
            } else {
                const errorData = await res.json();
                alert(`Erro ao criar agente: ${errorData.error} - ${errorData.details || ''}`);
            }
        } catch (error) {
            console.error(error);
            alert('Erro de conexão ou erro inesperado');
        } finally {
            setIsCreating(false);
        }
    };

    return (
        <div className="p-8 max-w-7xl mx-auto relative">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
                <div>
                    <h1 className="text-3xl font-display font-bold text-gray-900 dark:text-white mb-2">
                        Minhas IAs
                    </h1>
                    <p className="text-gray-500 dark:text-gray-400">
                        Gerencie os agentes inteligentes da sua organização.
                    </p>
                </div>

                <button
                    onClick={() => setShowCreateModal(true)}
                    className="flex items-center gap-2 bg-[#FF4C00] hover:bg-[#ff6a2b] text-white px-5 py-2.5 rounded-xl font-medium transition-all shadow-lg shadow-orange-500/20 active:scale-95"
                >
                    <Plus size={20} />
                    Criar Nova IA
                </button>
            </div>

            {/* List Content */}
            {isLoading ? (
                <div className="flex justify-center py-20">
                    <Loader2 className="animate-spin text-orange-500" size={40} />
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {agents.map((agent) => {
                        const typeStyles: Record<string, { gradient: string, badge: string, icon: string }> = {
                            sdr: {
                                gradient: 'from-orange-500 to-red-600 shadow-orange-500/20',
                                badge: 'bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400 border-orange-100 dark:border-orange-800',
                                icon: 'text-white'
                            },
                            suporte: {
                                gradient: 'from-emerald-500 to-teal-600 shadow-emerald-500/20',
                                badge: 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 border-emerald-100 dark:border-emerald-800',
                                icon: 'text-white'
                            },
                            onboarding: {
                                gradient: 'from-blue-500 to-indigo-600 shadow-blue-500/20',
                                badge: 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 border-blue-100 dark:border-blue-800',
                                icon: 'text-white'
                            },
                            custom: {
                                gradient: 'from-violet-500 to-purple-600 shadow-violet-500/20',
                                badge: 'bg-violet-50 dark:bg-violet-900/20 text-violet-600 dark:text-violet-400 border-violet-100 dark:border-violet-800',
                                icon: 'text-white'
                            }
                        };

                        const style = typeStyles[agent.type] || typeStyles.custom;

                        return (
                            <div key={agent.id} className="bg-white dark:bg-[#121212] border border-gray-100 dark:border-[#2A2A2A] rounded-2xl p-6 shadow-sm hover:shadow-md transition-shadow relative group flex flex-col h-full">

                                <div className="absolute top-4 right-4">
                                    <div className="relative">
                                        <button
                                            onClick={() => setOpenMenuId(openMenuId === agent.id ? null : agent.id)}
                                            className="p-2 hover:bg-gray-100 dark:hover:bg-[#1F1F1F] rounded-lg text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
                                        >
                                            <MoreVertical size={18} />
                                        </button>

                                        {openMenuId === agent.id && (
                                            <>
                                                <div
                                                    className="fixed inset-0 z-10"
                                                    onClick={() => setOpenMenuId(null)}
                                                />
                                                <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-[#1E1E1E] rounded-xl shadow-xl border border-gray-100 dark:border-[#2A2A2A] py-2 z-20 animate-in fade-in slide-in-from-top-1">
                                                    <button
                                                        onClick={() => handleTogglePause(agent)}
                                                        className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-[#2A2A2A] flex items-center gap-2 transition-colors"
                                                    >
                                                        {agent.status === 'paused' ? <Play size={14} /> : <Pause size={14} />}
                                                        {agent.status === 'paused' ? 'Retomar IA' : 'Pausar IA'}
                                                    </button>
                                                    <button
                                                        onClick={() => handleDeleteAgent(agent.id)}
                                                        className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/10 flex items-center gap-2 transition-colors"
                                                    >
                                                        <X size={14} />
                                                        Excluir Agente
                                                    </button>
                                                </div>
                                            </>
                                        )}
                                    </div>
                                </div>

                                <div className={`w-14 h-14 bg-gradient-to-br ${style.gradient} rounded-xl flex items-center justify-center text-white mb-4 shadow-lg`}>
                                    <Bot size={28} />
                                </div>

                                <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-1">
                                    {agent.name}
                                </h3>

                                <div className="flex items-center gap-2 mb-4">
                                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wide border ${style.badge}`}>
                                        {agent.type.toUpperCase()}
                                    </span>
                                    {agent.status === 'active' ? (
                                        <span className="flex items-center gap-1.5 text-xs text-emerald-500 font-medium px-2 py-1 bg-emerald-50 dark:bg-emerald-900/10 rounded-full border border-emerald-100 dark:border-emerald-900/20">
                                            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></div>
                                            Ativo
                                        </span>
                                    ) : agent.status === 'paused' ? (
                                        <span className="flex items-center gap-1.5 text-xs text-amber-500 font-medium px-2 py-1 bg-amber-50 dark:bg-amber-900/10 rounded-full border border-amber-100 dark:border-amber-900/20 shadow-sm">
                                            <div className="w-1.5 h-1.5 rounded-full bg-amber-500"></div>
                                            Pausado
                                        </span>
                                    ) : (
                                        <span className="flex items-center gap-1.5 text-xs text-red-500 font-medium px-2 py-1 bg-red-50 dark:bg-red-900/10 rounded-full border border-red-100 dark:border-red-900/20">
                                            <div className="w-1.5 h-1.5 rounded-full bg-red-500"></div>
                                            Inativo
                                        </span>
                                    )}
                                </div>

                                {agent.whatsapp_instance_name && (
                                    <div className="flex items-center gap-1.5 mb-4 text-xs bg-[#25D366]/10 px-2.5 py-1.5 rounded-lg border border-[#25D366]/20 w-fit">
                                        <Smartphone size={12} className="text-[#25D366]" />
                                        <span className="text-[#25D366] font-medium font-mono">{agent.whatsapp_instance_name}</span>
                                        <span className="text-[10px] text-[#25D366]/60 uppercase ml-1">({agent.whatsapp_instance_status})</span>
                                    </div>
                                )}

                                <p className="text-sm text-gray-500 dark:text-gray-400 mb-6 line-clamp-2 min-h-[40px]">
                                    Agente especializado ({agent.type}).
                                </p>

                                <div className="flex items-center gap-2 pt-4 border-t border-gray-100 dark:border-[#1F1F1F] mt-auto">
                                    <button
                                        onClick={() => setEditingAgent(agent)}
                                        className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg hover:bg-gray-50 dark:hover:bg-[#1F1F1F] text-sm font-medium text-gray-600 dark:text-gray-300 transition-colors"
                                    >
                                        <Cpu size={16} />
                                        Configurar
                                    </button>
                                </div>
                            </div>
                        );
                    })}


                    {/* Empty State */}
                    {agents.length === 0 && (
                        <div className="col-span-full py-20 text-center flex flex-col items-center">
                            <div className="w-20 h-20 bg-gray-50 dark:bg-[#121212] rounded-full flex items-center justify-center mb-4 text-gray-300 dark:text-gray-700">
                                <Bot size={40} />
                            </div>
                            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">Nenhuma IA criada</h3>
                            <p className="text-gray-500 max-w-sm mx-auto mb-6">
                                Você ainda não possui agentes inteligentes. Crie sua primeira IA para começar a automatizar.
                            </p>
                            <button
                                onClick={() => setShowCreateModal(true)}
                                className="bg-[#FF4C00] text-white px-6 py-3 rounded-xl font-bold"
                            >
                                Criar minha primeira IA
                            </button>
                        </div>
                    )}
                </div>
            )}

            {/* CREATE MODAL */}
            {showCreateModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                    <div className="bg-white dark:bg-[#1E1E1E] rounded-2xl w-full max-w-md shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
                        <div className="flex items-center justify-between p-6 border-b border-gray-100 dark:border-[#2A2A2A]">
                            <div className="flex items-center gap-2">
                                {createStep === 'form' && (
                                    <button onClick={() => { setCreateStep('choose'); setCreateMode(null); }} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-[#2A2A2A] transition-colors">
                                        <ChevronLeft size={20} />
                                    </button>
                                )}
                                <h2 className="text-xl font-bold text-gray-900 dark:text-white">Nova Inteligência Artificial</h2>
                            </div>
                            <button onClick={() => { setShowCreateModal(false); setCreateStep('choose'); setCreateMode(null); }} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                                <X size={24} />
                            </button>
                        </div>

                        {/* STEP 1: CHOOSE MODE */}
                        {createStep === 'choose' && (
                            <div className="p-6 space-y-4">
                                <p className="text-sm text-gray-500 dark:text-gray-400">Como deseja criar sua nova IA?</p>

                                <button
                                    onClick={() => {
                                        setCreateMode('scratch');
                                        setCreateStep('form');
                                    }}
                                    className="w-full p-5 rounded-xl border-2 border-gray-200 dark:border-[#333] hover:border-[#FF4C00]/50 hover:bg-orange-50/50 dark:hover:bg-[#FF4C00]/5 transition-all text-left group"
                                >
                                    <div className="flex items-start gap-4">
                                        <div className="w-11 h-11 bg-gray-100 dark:bg-[#2A2A2A] rounded-xl flex items-center justify-center shrink-0 group-hover:bg-[#FF4C00]/10 transition-colors">
                                            <Plus size={22} className="text-gray-500 dark:text-gray-400 group-hover:text-[#FF4C00]" />
                                        </div>
                                        <div>
                                            <h3 className="font-bold text-gray-900 dark:text-white">Criar do Zero</h3>
                                            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Configure manualmente nome, tipo e prompt do agente.</p>
                                        </div>
                                    </div>
                                </button>

                                <button
                                    onClick={async () => {
                                        setIsLoadingCompanyData(true);
                                        try {
                                            const res = await fetch('/api/company-data', {
                                                headers: { 'Authorization': `Bearer ${token}` }
                                            });
                                            const data = await res.json();
                                            if (data) {
                                                setCompanyData(data);
                                                setCreateMode('company');
                                                setCreateStep('form');
                                            } else {
                                                setHasCompanyData(false);
                                            }
                                        } catch (e) {
                                            setHasCompanyData(false);
                                        } finally {
                                            setIsLoadingCompanyData(false);
                                        }
                                    }}
                                    disabled={isLoadingCompanyData}
                                    className="w-full p-5 rounded-xl border-2 border-[#FF4C00]/30 bg-gradient-to-r from-[#FF4C00]/5 to-orange-500/5 hover:border-[#FF4C00] hover:from-[#FF4C00]/10 hover:to-orange-500/10 transition-all text-left group relative overflow-hidden disabled:opacity-70"
                                >
                                    <div className="absolute top-2 right-3">
                                        <span className="text-[10px] font-bold text-[#FF4C00] uppercase tracking-widest bg-[#FF4C00]/10 px-2 py-0.5 rounded-full">⚡ Rápido</span>
                                    </div>
                                    <div className="flex items-start gap-4">
                                        <div className="w-11 h-11 bg-[#FF4C00]/10 rounded-xl flex items-center justify-center shrink-0">
                                            {isLoadingCompanyData ? <Loader2 size={22} className="text-[#FF4C00] animate-spin" /> : <Wand2 size={22} className="text-[#FF4C00]" />}
                                        </div>
                                        <div>
                                            <h3 className="font-bold text-gray-900 dark:text-white">Puxar Dados da Empresa</h3>
                                            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Use os dados do seu onboarding e crie uma IA com 1 clique.</p>
                                        </div>
                                    </div>
                                </button>

                                {hasCompanyData === false && (
                                    <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800/30 text-sm text-amber-700 dark:text-amber-400">
                                        Nenhum dado da empresa encontrado. Complete o onboarding primeiro ou crie do zero.
                                    </div>
                                )}
                            </div>
                        )}

                        {/* STEP 2: FORM */}
                        {createStep === 'form' && (
                            <form onSubmit={handleCreateAgent} className="p-6 space-y-4">
                                {createMode === 'company' && companyData && (
                                    <div className="p-3 rounded-xl bg-[#FF4C00]/5 border border-[#FF4C00]/20 mb-2">
                                        <div className="flex items-center gap-2 mb-2">
                                            <Building2 size={16} className="text-[#FF4C00]" />
                                            <span className="text-sm font-bold text-[#FF4C00]">{companyData.companyName}</span>
                                        </div>
                                        <p className="text-xs text-gray-500 dark:text-gray-400">Vende: {companyData.companyProduct}</p>
                                        <p className="text-xs text-gray-500 dark:text-gray-400">Público: {companyData.targetAudience}</p>
                                    </div>
                                )}

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                        Nome do Agente
                                    </label>
                                    <input
                                        type="text"
                                        required
                                        value={newName}
                                        onChange={e => setNewName(e.target.value)}
                                        placeholder="Ex: Vendedor Sênior"
                                        className="w-full px-4 py-2 rounded-xl border border-gray-200 dark:border-[#333] bg-white dark:bg-[#121212] text-gray-900 dark:text-white focus:ring-2 focus:ring-orange-500 outline-none transition-all"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                        Tipo de Função
                                    </label>
                                    <div className="grid grid-cols-2 gap-2">
                                        {agentTemplates.map(t => (
                                            <button
                                                key={t.id}
                                                type="button"
                                                onClick={() => setNewType(t.id)}
                                                className={`p-3 rounded-xl border-2 text-left transition-all ${newType === t.id
                                                    ? 'border-[#FF4C00] bg-[#FF4C00]/5'
                                                    : 'border-gray-200 dark:border-[#333] hover:border-[#FF4C00]/40'
                                                    }`}
                                            >
                                                <span className="text-lg">{t.icon}</span>
                                                <p className={`text-sm font-bold mt-1 ${newType === t.id ? 'text-[#FF4C00]' : 'text-gray-900 dark:text-white'}`}>{t.name}</p>
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {createMode === 'company' && companyData && (
                                    <div className="p-3 rounded-lg bg-green-50 dark:bg-green-900/10 border border-green-200 dark:border-green-800/30 text-sm text-green-700 dark:text-green-400 flex items-center gap-2">
                                        <Wand2 size={14} />
                                        O prompt será gerado automaticamente com os dados da sua empresa.
                                    </div>
                                )}

                                <div className="pt-4 flex gap-3">
                                    <button
                                        type="button"
                                        onClick={() => { setShowCreateModal(false); setCreateStep('choose'); setCreateMode(null); }}
                                        className="flex-1 py-2.5 rounded-xl border border-gray-200 dark:border-[#333] text-gray-700 dark:text-gray-300 font-medium hover:bg-gray-50 dark:hover:bg-[#2A2A2A] transition-colors"
                                    >
                                        Cancelar
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={isCreating}
                                        className="flex-1 py-2.5 rounded-xl bg-[#FF4C00] hover:bg-[#ff6a2b] text-white font-bold transition-all shadow-lg shadow-orange-500/20 disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                    >
                                        {isCreating && <Loader2 className="animate-spin" size={18} />}
                                        Criar IA
                                    </button>
                                </div>
                            </form>
                        )}
                    </div>
                </div>
            )}

            {/* EDIT MODAL */}
            {editingAgent && (
                <AgentEditModal
                    agent={editingAgent}
                    isOpen={!!editingAgent}
                    onClose={() => setEditingAgent(null)}
                    onUpdate={fetchAgents}
                />
            )}
        </div>
    );
}
