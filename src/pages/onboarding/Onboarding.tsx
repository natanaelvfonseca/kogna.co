
import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, AlertCircle, Loader2, Sparkles, BrainCircuit, Rocket, Zap, Trophy } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useNotifications } from '../../context/NotificationContext';
import { FileUpload } from '../../components/onboarding/FileUpload';
import { agentTemplates, type AgentTemplate } from '../../data/agentTemplates';
import confetti from 'canvas-confetti';
import { DebugModal, DebugLog } from '../../components/DebugModal';

// API Configuration
const API_URL = '/api';

const AI_NAME_SUGGESTIONS = ['Ana', 'Luna', 'Clara', 'Max', 'Leo', 'Lia', 'Nina', 'Iris', 'Nora', 'Sol'];

const formatCurrency = (value: string) => {
    // Remove everything that isn't a digit
    const cleanValue = value.replace(/\D/g, '');

    // Convert to number and format with BRL rules
    const options = { minimumFractionDigits: 2 };
    const result = new Intl.NumberFormat('pt-BR', options).format(
        parseFloat(cleanValue) / 100
    );

    return result === 'NaN' ? '' : result;
};

// Micro-sounds (using reliable CDN or placeholder)
const playSound = (_type: 'click' | 'success' | 'level-up') => {
    // In a real app, host these files. For now we just console log to avoid 404s if files aren't physically there yet.
    // Or we could use small base64 sounds.
    // Let's implement a very simple "silent" handler or rely on browser generic beeps if possible, 
    // but without actual assets, we'll simulate the "effect" visually.

};

// Button option component for visual selectors
function OptionButton({ icon, label, selected, onClick }: { icon: string; label: string; selected: boolean; onClick: () => void }) {
    return (
        <button
            type="button"
            onClick={() => { playSound('click'); onClick(); }}
            className={`
                flex items-center gap-3 px-4 py-3.5 rounded-xl border-2 transition-all duration-200 text-left w-full
                ${selected
                    ? 'border-primary bg-primary/5 shadow-md shadow-primary/10 scale-[1.01]'
                    : 'border-border hover:border-primary/40 hover:bg-muted-secondary/30'
                }
            `}
        >
            <span className="text-xl shrink-0">{icon}</span>
            <span className={`text-sm font-medium ${selected ? 'text-primary' : 'text-foreground'}`}>{label}</span>
            {selected && (
                <div className="ml-auto w-5 h-5 bg-primary rounded-full flex items-center justify-center shrink-0 animate-in zoom-in spin-in-180 duration-300">
                    <Check size={12} className="text-white" />
                </div>
            )}
        </button>
    );
}

function Thermometer({ potential }: { potential: number }) {
    return (
        <div className="hidden lg:block w-64 bg-surface border border-border rounded-2xl p-6 h-fit sticky top-8 transition-all duration-500">
            <div className="flex items-center gap-2 mb-4">
                <div className="p-2 bg-gradient-to-br from-yellow-400 to-orange-500 rounded-lg shadow-lg shadow-orange-500/20">
                    <Zap size={20} className="text-white fill-white" />
                </div>
                <div>
                    <h3 className="font-bold text-sm text-foreground">Potencial da IA</h3>
                    <p className="text-xs text-muted-foreground">Termômetro de Poder</p>
                </div>
            </div>

            <div className="relative h-64 bg-muted-secondary rounded-full w-4 mx-auto mb-4 overflow-hidden border border-border/50">
                <div
                    className="absolute bottom-0 left-0 w-full bg-gradient-to-t from-green-400 via-yellow-400 to-red-500 transition-all duration-1000 ease-out"
                    style={{ height: `${potential}%` }}
                />
            </div>

            <div className="text-center space-y-1">
                <span className="text-3xl font-display font-bold text-transparent bg-clip-text bg-gradient-to-r from-primary to-purple-600 transition-all duration-500">
                    {potential}%
                </span>
                <p className="text-xs text-muted-foreground">
                    {potential < 30 && "Configuração inicial..."}
                    {potential >= 30 && potential < 60 && "Aprendendo padrões..."}
                    {potential >= 60 && potential < 90 && "Otimizando conversão..."}
                    {potential >= 90 && "Pronta para escalar!"}
                </p>
            </div>

            {potential > 0 && (
                <div className="mt-4 pt-4 border-t border-border flex items-center justify-center gap-2 text-green-600 text-xs font-bold animate-pulse">
                    <span className="flex h-2 w-2 rounded-full bg-green-500"></span>
                    Impacto no faturamento
                </div>
            )}
        </div>
    );
}

export function Onboarding() {
    const { user, token, refreshUser } = useAuth();
    const { fetchNotifications, showToast } = useNotifications();
    const navigate = useNavigate();

    // Steps: 0=Intro, 1=Template, 2=Business (substeps), 3=Files, 4=WhatsApp
    const [step, setStep] = useState(0);
    const [subStep, setSubStep] = useState(0);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [potential, setPotential] = useState(10);
    const [loadingFact, setLoadingFact] = useState<string | null>(null);

    // Template State (Step 1)
    const [selectedTemplate, setSelectedTemplate] = useState<AgentTemplate | null>(null);

    // Business Form State
    const [formData, setFormData] = useState({
        companyName: '',
        aiName: '',
        companyProduct: '',
        productPrice: '',
        desiredRevenue: '',
        targetAudience: [] as string[],
        targetNiche: '',
        unknownBehavior: '',
        voiceTone: '',
        restrictions: ''
    });

    // File State (Step 3)
    const [files, setFiles] = useState<File[]>([]);

    // WhatsApp State (Step 4)
    const [qrCode, setQrCode] = useState<string | null>(null);
    const [wsStatus, setWsStatus] = useState<'idle' | 'connecting' | 'qrcode' | 'connected'>('idle');
    const [timer, setTimer] = useState(60);
    const pollInterval = useRef<ReturnType<typeof setInterval> | null>(null);

    // Debug State
    const [debugOpen, setDebugOpen] = useState(false);
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

    // Initial Confetti
    useEffect(() => {
        const timeout = setTimeout(() => {
            confetti({
                particleCount: 100,
                spread: 70,
                origin: { y: 0.6 },
                colors: ['#4F46E5', '#10B981', '#F59E0B']
            });
            playSound('success');
        }, 500);
        return () => clearTimeout(timeout);
    }, []);

    // Derived values
    const audienceDisplay = formData.targetAudience.includes('nicho')
        ? `Nicho específico: ${formData.targetNiche}`
        : formData.targetAudience.join(' e ');

    // Simulate "Loading Facts"
    const showLoadingScreen = async (nextAction: () => void) => {
        const facts = [
            "Você sabia? Atender um lead em menos de 5 minutos aumenta as chances de conversão em 21x.",
            "IAs bem treinadas podem recuperar até 30% dos clientes inativos.",
            "Personalização no atendimento gera 40% mais receita.",
            "Sua IA trabalhará 24h por dia, sem férias ou pausas."
        ];
        const randomFact = facts[Math.floor(Math.random() * facts.length)];
        setLoadingFact(randomFact);
        setLoading(true);

        await new Promise(resolve => setTimeout(resolve, 2000));

        setLoading(false);
        setLoadingFact(null);
        nextAction();
    };

    // STEP HANDLERS
    const handleStart = () => {
        playSound('click');
        setStep(1);
        setPotential(20);
    };

    const handleTemplateSelect = () => {
        if (!selectedTemplate) {
            setError('Selecione um modelo de agente.');
            return;
        }
        playSound('level-up');
        setError(null);
        showLoadingScreen(() => {
            setStep(2);
            setSubStep(0);
            setPotential(30);
        });
    };

    // STEP 2 SUB-STEP HANDLERS
    const handleIdentidade = () => {
        if (!formData.companyName.trim()) { setError('Informe o nome da empresa.'); return; }
        if (!formData.aiName.trim()) { setError('Dê um nome para sua IA.'); return; }

        playSound('success');
        setError(null);
        setSubStep(1);
        setPotential(45);
    };

    const handleNegocio = () => {
        if (!formData.companyProduct) { setError('Informe o que sua empresa vende.'); return; }
        if (formData.targetAudience.length === 0) { setError('Selecione quem é seu cliente principal.'); return; }
        if (formData.targetAudience.includes('nicho') && !formData.targetNiche) { setError('Informe o nicho específico.'); return; }

        playSound('success');
        setError(null);
        setSubStep(2); // Goes to Revenue Step
        setPotential(60);
    };

    // NEW STEP: Revenue
    const handleRevenue = () => {
        if (!formData.desiredRevenue) { setError('Defina uma meta (mesmo que estimada).'); return; }

        playSound('level-up');
        setError(null);
        setSubStep(3); // Goes to Role Step
        setPotential(75);
    };

    const handlePapel = () => {
        if (!formData.unknownBehavior) { setError('Selecione o comportamento padrão.'); return; }

        playSound('success');
        setError(null);
        setSubStep(4); // Goes to Personality
        setPotential(85);
    };

    const handlePersonalidade = async () => {
        if (!formData.voiceTone) { setError('Selecione o tom de voz.'); return; }

        playSound('click');
        setLoading(true);
        setError(null);

        try {
            const res = await fetch(`${API_URL}/ia-configs`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer mock-jwt-token-for-${user?.id}`
                },
                body: JSON.stringify({
                    companyName: formData.companyName,
                    mainProduct: formData.companyProduct,
                    productPrice: formData.productPrice,
                    desiredRevenue: formData.desiredRevenue,
                    agentObjective: `Atender ${audienceDisplay} com tom ${formData.voiceTone}`
                })
            });

            addLog('info', 'API Response Status', { status: res.status, statusText: res.statusText });

            if (!res.ok) {
                const errorData = await res.json().catch(() => ({}));
                addLog('error', 'API Error Response', errorData);
                throw new Error('Falha ao salvar configurações.');
            }

            const data = await res.json();
            addLog('success', 'Config Saved', data);

            playSound('level-up');
            showLoadingScreen(() => {
                setStep(3);
                setPotential(90);
                playSound('success');
            });
        } catch (err: any) {
            console.error(err);
            addLog('error', 'Save Config Failed', { message: err.message, stack: err.stack });
            setError(err.message || 'Erro ao salvar dados. Tente novamente.');
            setLoading(false);
        }
    };

    // STEP 3: FILE UPLOAD
    const handleFileUpload = async () => {
        if (files.length === 0) {
            setStep(4);
            setPotential(95);
            return;
        }

        playSound('click');
        setLoading(true);
        setError(null);

        const uploadData = new FormData();
        files.forEach(file => { uploadData.append('files', file); });

        try {
            const headers: HeadersInit = {};
            if (user?.id) headers['Authorization'] = `Bearer mock-jwt-token-for-${user.id}`;
            const res = await fetch(`${API_URL}/ia-configs/upload`, {
                method: 'POST',
                headers: headers,
                body: uploadData
            });

            if (!res.ok) throw new Error('Falha no upload.');

            playSound('level-up');
            setStep(4);
            setPotential(95);
        } catch (err) {
            setError('Erro ao enviar arquivos. Tente novamente.');
        } finally {
            setLoading(false);
        }
    };

    // STEP 4: WHATSAPP LOGIC
    useEffect(() => {
        let interval: ReturnType<typeof setInterval>;
        if (wsStatus === 'qrcode' && timer > 0) {
            interval = setInterval(() => setTimer((prev) => prev - 1), 1000);
        } else if (timer === 0 && wsStatus === 'qrcode') {
            generateQrCode(true);
        }
        return () => clearInterval(interval);
    }, [wsStatus, timer]);

    const generateQrCode = async (isRefresh = false) => {
        if (!user?.email) return;

        playSound('click');
        if (!isRefresh) {
            setWsStatus('connecting');
            setError(null);
        }
        setTimer(60);

        try {
            const res = await fetch(`${API_URL}/whatsapp/connect`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ email: user.email })
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Erro ao conectar WhatsApp');

            if (data.instance?.status === 'CONNECTED' || data.instance?.status === 'open') {
                setWsStatus('connected');
                completeOnboarding();
                return;
            }

            if (data.qrCode) {
                setQrCode(data.qrCode);
                setWsStatus('qrcode');
                startPolling();
            } else {
                if (!isRefresh) setError('Erro ao obter QR Code.');
            }

        } catch (err: any) {
            setError(err.message);
            setWsStatus('idle');
        }
    };

    const startPolling = () => {
        if (pollInterval.current) clearInterval(pollInterval.current);
        pollInterval.current = setInterval(async () => {
            try {
                const res = await fetch(`${API_URL}/instances`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (res.ok) {
                    const data = await res.json();
                    const isConnected = Array.isArray(data) && data.some((i: any) => i.status === 'CONNECTED' || i.status === 'open');

                    if (isConnected) {
                        setWsStatus('connected');
                        if (pollInterval.current) clearInterval(pollInterval.current);
                        completeOnboarding();
                    }
                }
            } catch (e) { }
        }, 2000);
    };

    const completeOnboarding = async () => {
        setPotential(100);

        try {
            const res = await fetch(`${API_URL}/onboarding/complete`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (!res.ok) throw new Error('Falha ao registrar conclusão do onboarding');

            // Success effects
            confetti({
                particleCount: 200,
                spread: 100,
                origin: { y: 0.6 }
            });
            playSound('level-up');

            showToast('Onboarding Concluído!', 'Sua IA foi configurada e você ganhou 100 Koins!', 'success');

            await Promise.all([
                fetchNotifications(),
                refreshUser()
            ]);

            // Create Agent if template selected
            if (selectedTemplate) {
                await fetch(`${API_URL}/onboarding/create-agent`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({
                        templateId: selectedTemplate.id,
                        companyName: formData.companyName,
                        aiName: formData.aiName,
                        companyProduct: formData.companyProduct,
                        targetAudience: audienceDisplay,
                        unknownBehavior: formData.unknownBehavior,
                        voiceTone: formData.voiceTone,
                        restrictions: formData.restrictions || 'Nenhuma restrição definida.'
                    })
                });
            }

            return true;
        } catch (e: any) {
            console.error('Failed to complete onboarding', e);
            showToast('Aviso', 'Ocorreu um erro ao finalizar o cadastro, mas seus dados foram salvos.', 'warning');
            return false;
        }
    };

    // CLEANUP
    useEffect(() => {
        return () => {
            if (pollInterval.current) clearInterval(pollInterval.current);
        };
    }, []);

    // Loading Screen UI
    if (loading && loadingFact) {
        return (
            <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4 animate-fade-in relative overflow-hidden">
                <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-primary/10 via-background to-background" />
                <div className="text-center max-w-lg relative z-10">
                    <Loader2 size={64} className="text-primary animate-spin mx-auto mb-8" />
                    <h3 className="text-2xl font-display font-bold text-foreground mb-4">Construindo sua Inteligência...</h3>
                    <div className="bg-surface/50 border border-border p-6 rounded-2xl backdrop-blur-sm">
                        <span className="text-xs font-bold text-primary uppercase tracking-widest mb-2 block">Dica Estratégica</span>
                        <p className="text-lg text-muted-foreground italic">"{loadingFact}"</p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-background flex justify-center py-12 px-4 font-sans relative overflow-x-hidden">

            <div className="flex gap-12 w-full max-w-6xl items-start justify-center">

                {/* Main Content */}
                <div className="w-full max-w-2xl flex flex-col items-center z-10">

                    {/* Header */}
                    <div className="mb-10 text-center relative w-full">
                        <h1 className="text-4xl font-display font-bold text-text-primary bg-clip-text text-transparent bg-gradient-to-r from-primary to-purple-500">
                            Construindo sua Máquina
                        </h1>
                        <p className="text-text-secondary mt-2 text-lg">Jornada de Ativação da Elite Kogna</p>
                    </div>

                    <div className="w-full bg-surface border border-border rounded-2xl p-8 shadow-2xl relative overflow-hidden transition-all duration-500 hover:shadow-primary/5">

                        {/* Progress Header */}
                        <div className="flex items-center justify-between mb-8 px-2">
                            {[0, 1, 2, 3, 4].map((s) => (
                                <div key={s} className="flex flex-col items-center gap-2">
                                    <div className={`
                                        w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-500
                                        ${s <= step ? 'bg-primary text-white scale-110 shadow-lg shadow-primary/30' : 'bg-muted-secondary text-muted-foreground'}
                                     `}>
                                        {s === step ? <div className="w-2 h-2 bg-white rounded-full animate-ping" /> : s < step ? <Check size={14} /> : s + 1}
                                    </div>
                                </div>
                            ))}
                        </div>

                        {error && (
                            <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-3 text-red-500 text-sm animate-fade-in">
                                <AlertCircle size={20} className="shrink-0" />
                                {error}
                            </div>
                        )}

                        {/* STEP 0: PREPARATION */}
                        {step === 0 && (
                            <div className="text-center space-y-8 animate-fade-in">
                                <div className="w-24 h-24 bg-gradient-to-br from-primary/20 to-purple-500/20 rounded-full flex items-center justify-center mx-auto mb-4 animate-bounce-slow">
                                    <Rocket size={48} className="text-primary fill-primary/20" />
                                </div>

                                <div>
                                    <h2 className="text-2xl font-bold text-foreground">Bem-vindo à Nova Era</h2>
                                    <p className="text-muted-foreground mt-2">Você está a poucos passos de automatizar suas vendas.</p>
                                </div>

                                <button
                                    onClick={handleStart}
                                    className="w-full bg-primary hover:bg-primary/90 text-white font-bold py-4 rounded-xl shadow-lg shadow-primary/20 transition-all active:scale-95 text-lg hover:shadow-2xl hover:-translate-y-1"
                                >
                                    Iniciar Ativação
                                </button>
                            </div>
                        )}

                        {/* STEP 1: TEMPLATE SELECTION */}
                        {step === 1 && (
                            <div className="space-y-6 animate-fade-in">
                                <div className="text-center mb-2">
                                    <h3 className="text-xl font-bold text-foreground">Escolha seu Agente de Elite</h3>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    {agentTemplates.map((template) => {
                                        const isSelected = selectedTemplate?.id === template.id;
                                        return (
                                            <button
                                                key={template.id}
                                                onClick={() => { setSelectedTemplate(template); setError(null); playSound('click'); }}
                                                className={`
                                                    relative text-left p-6 rounded-2xl border-2 transition-all duration-300 group
                                                    ${isSelected
                                                        ? 'border-primary bg-primary/5 shadow-xl shadow-primary/10 scale-[1.02] ring-2 ring-primary/20 ring-offset-2 ring-offset-surface'
                                                        : 'border-border hover:border-primary/40 hover:bg-muted-secondary/30 hover:-translate-y-1'
                                                    }
                                                `}
                                            >
                                                {isSelected && (
                                                    <div className="absolute top-3 right-3 w-6 h-6 bg-primary rounded-full flex items-center justify-center animate-in zoom-in">
                                                        <Check size={14} className="text-white" />
                                                    </div>
                                                )}
                                                <div className="text-3xl mb-3 drop-shadow-md">{template.icon}</div>
                                                <h4 className={`font-bold text-lg ${isSelected ? 'text-primary' : 'text-foreground'}`}>
                                                    {template.name}
                                                </h4>
                                                <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
                                                    {template.description}
                                                </p>
                                            </button>
                                        );
                                    })}
                                </div>

                                <button
                                    onClick={handleTemplateSelect}
                                    disabled={!selectedTemplate}
                                    className="w-full mt-4 bg-primary hover:bg-primary/90 disabled:opacity-50 text-white font-bold py-4 rounded-xl shadow-lg shadow-primary/20 transition-all flex items-center justify-center gap-2 text-lg"
                                >
                                    Confirmar Seleção
                                </button>
                            </div>
                        )}

                        {/* STEP 2: BUSINESS & PERSONALITY */}
                        {step === 2 && (
                            <div className="animate-fade-in">

                                {/* Progress dots for sub-steps */}
                                <div className="flex items-center justify-center gap-2 mb-8">
                                    {[0, 1, 2, 3, 4].map(i => (
                                        <div key={i} className={`h-1.5 rounded-full transition-all duration-300 ${i === subStep ? 'w-8 bg-primary shadow-glow' : i < subStep ? 'w-4 bg-primary/50' : 'w-4 bg-border'}`} />
                                    ))}
                                </div>

                                {/* SCENE 0: Identity */}
                                {subStep === 0 && (
                                    <div className="space-y-6 animate-slide-in-right">
                                        <div className="text-center">
                                            <h3 className="text-xl font-bold text-foreground">Identidade do Agente</h3>
                                            <p className="text-sm text-muted-foreground mt-1">Quem representará sua marca?</p>
                                        </div>

                                        <div className="space-y-4">
                                            <div>
                                                <label className="text-sm font-medium text-foreground mb-1.5 block">Nome da Empresa</label>
                                                <input
                                                    type="text"
                                                    className="w-full px-4 py-3.5 bg-background border border-border rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all outline-none capitalize text-lg"
                                                    placeholder="Ex: Clínica Vida+"
                                                    value={formData.companyName}
                                                    onChange={e => setFormData({ ...formData, companyName: e.target.value })}
                                                />
                                            </div>

                                            <div>
                                                <label className="text-sm font-medium text-foreground mb-1.5 block">Nome do Agente (IA)</label>
                                                <input
                                                    type="text"
                                                    className="w-full px-4 py-3.5 bg-background border border-border rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all outline-none text-lg"
                                                    placeholder="Ex: Ana"
                                                    value={formData.aiName}
                                                    onChange={e => setFormData({ ...formData, aiName: e.target.value })}
                                                />
                                                <div className="flex flex-wrap gap-2 mt-3">
                                                    {AI_NAME_SUGGESTIONS.slice(0, 5).map(name => (
                                                        <button
                                                            key={name}
                                                            type="button"
                                                            onClick={() => { setFormData({ ...formData, aiName: name }); playSound('click'); }}
                                                            className="text-xs bg-muted-secondary hover:bg-primary/10 hover:text-primary px-3 py-1.5 rounded-full border border-border transition-all"
                                                        >
                                                            {name}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>

                                        <button onClick={handleIdentidade} className="w-full btn-primary py-4 text-lg font-bold rounded-xl mt-4">
                                            Avançar
                                        </button>
                                    </div>
                                )}

                                {/* SCENE 1: Business Core */}
                                {subStep === 1 && (
                                    <div className="space-y-6 animate-slide-in-right">
                                        <div className="text-center">
                                            <h3 className="text-xl font-bold text-foreground">Núcleo do Negócio</h3>
                                            <p className="text-sm text-muted-foreground mt-1">O que vamos vender hoje?</p>
                                        </div>

                                        <div className="space-y-4">
                                            <div>
                                                <label className="text-sm font-medium text-foreground mb-1.5 block">Produto/Serviço Principal</label>
                                                <input
                                                    type="text"
                                                    className="w-full px-4 py-3.5 bg-background border border-border rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all outline-none"
                                                    placeholder="Ex: Tratamento Odontológico"
                                                    value={formData.companyProduct}
                                                    onChange={e => setFormData({ ...formData, companyProduct: e.target.value })}
                                                />
                                            </div>

                                            <div>
                                                <label className="text-sm font-medium text-foreground mb-1.5 block">Preço / Ticket Médio (Opcional)</label>
                                                <input
                                                    type="text"
                                                    className="w-full px-4 py-3.5 bg-background border border-border rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all outline-none"
                                                    placeholder="Ex: R$ 250,00"
                                                    value={formData.productPrice}
                                                    onChange={e => setFormData({ ...formData, productPrice: e.target.value })}
                                                />
                                            </div>

                                            <div>
                                                <label className="text-sm font-medium text-foreground mb-2 block">Público Alvo (Pode selecionar mais de um)</label>
                                                <div className="grid grid-cols-2 gap-2">
                                                    <OptionButton
                                                        icon="👤"
                                                        label="Pessoas Físicas (B2C)"
                                                        selected={formData.targetAudience.includes('Pessoas físicas')}
                                                        onClick={() => {
                                                            const newAudience = formData.targetAudience.includes('Pessoas físicas')
                                                                ? formData.targetAudience.filter(a => a !== 'Pessoas físicas')
                                                                : [...formData.targetAudience, 'Pessoas físicas'];
                                                            setFormData({ ...formData, targetAudience: newAudience, targetNiche: '' });
                                                        }}
                                                    />
                                                    <OptionButton
                                                        icon="🏢"
                                                        label="Empresas (B2B)"
                                                        selected={formData.targetAudience.includes('Empresas (B2B)')}
                                                        onClick={() => {
                                                            const newAudience = formData.targetAudience.includes('Empresas (B2B)')
                                                                ? formData.targetAudience.filter(a => a !== 'Empresas (B2B)')
                                                                : [...formData.targetAudience, 'Empresas (B2B)'];
                                                            setFormData({ ...formData, targetAudience: newAudience, targetNiche: '' });
                                                        }}
                                                    />
                                                </div>
                                            </div>
                                        </div>

                                        <button onClick={handleNegocio} className="w-full btn-primary py-4 text-lg font-bold rounded-xl mt-4">
                                            Avançar
                                        </button>
                                    </div>
                                )}

                                {/* SCENE 2: REVENUE GOAL (NEW) */}
                                {subStep === 2 && (
                                    <div className="space-y-8 animate-slide-in-right text-center">
                                        <div>
                                            <div className="w-16 h-16 bg-green-500/10 rounded-full flex items-center justify-center mx-auto mb-4 animate-pulse">
                                                <Trophy size={32} className="text-green-500" />
                                            </div>
                                            <h3 className="text-2xl font-bold text-foreground">Qual sua meta mensal?</h3>
                                            <p className="text-muted-foreground mt-2">Isso ajuda a IA a focar em resultados.</p>
                                        </div>

                                        <div className="relative max-w-sm mx-auto">
                                            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground font-bold">R$</span>
                                            <input
                                                type="text"
                                                className="w-full pl-12 pr-4 py-6 bg-background border-2 border-primary/20 rounded-2xl focus:border-primary focus:shadow-lg focus:shadow-primary/20 transition-all outline-none text-3xl font-bold text-center text-primary"
                                                placeholder="50.000"
                                                value={formData.desiredRevenue}
                                                onChange={e => setFormData({ ...formData, desiredRevenue: formatCurrency(e.target.value) })}
                                            />
                                        </div>

                                        <p className="text-xs text-muted-foreground italic">"IAs com meta definida performam 40% melhor."</p>

                                        <button onClick={handleRevenue} className="w-full btn-primary py-4 text-lg font-bold rounded-xl mt-4">
                                            Definir Alvo e Continuar
                                        </button>
                                    </div>
                                )}

                                {/* SCENE 3: Role/Behavior */}
                                {subStep === 3 && (
                                    <div className="space-y-6 animate-slide-in-right">
                                        <div className="text-center">
                                            <h3 className="text-xl font-bold text-foreground">Protocolo de Segurança</h3>
                                            <p className="text-sm text-muted-foreground mt-1">O que fazer se ela não souber a resposta?</p>
                                        </div>

                                        <div className="space-y-3">
                                            <OptionButton icon="👤" label="Transferir para humano (Recomendado)" selected={formData.unknownBehavior === 'Transferir para um atendente humano'} onClick={() => setFormData({ ...formData, unknownBehavior: 'Transferir para um atendente humano' })} />
                                            <OptionButton icon="📝" label="Anotar dúvida e pedir contato" selected={formData.unknownBehavior === 'Pedir mais informações ao cliente'} onClick={() => setFormData({ ...formData, unknownBehavior: 'Pedir mais informações ao cliente' })} />
                                            <OptionButton icon="⏳" label="Dizer que vai verificar" selected={formData.unknownBehavior === 'Avisar que vai verificar e retornar'} onClick={() => setFormData({ ...formData, unknownBehavior: 'Avisar que vai verificar e retornar' })} />
                                        </div>

                                        <button onClick={handlePapel} className="w-full btn-primary py-4 text-lg font-bold rounded-xl mt-4">
                                            Avançar
                                        </button>
                                    </div>
                                )}

                                {/* SCENE 4: Personality */}
                                {subStep === 4 && (
                                    <div className="space-y-6 animate-slide-in-right">
                                        <div className="text-center">
                                            <h3 className="text-xl font-bold text-foreground">Personalidade e Tom</h3>
                                        </div>

                                        <div className="grid grid-cols-2 gap-3">
                                            <OptionButton icon="🤝" label="Amigável" selected={formData.voiceTone === 'Amigável e próxima'} onClick={() => setFormData({ ...formData, voiceTone: 'Amigável e próxima' })} />
                                            <OptionButton icon="💼" label="Formal" selected={formData.voiceTone === 'Profissional e direta'} onClick={() => setFormData({ ...formData, voiceTone: 'Profissional e direta' })} />
                                            <OptionButton icon="🔥" label="Vendedora Agressiva" selected={formData.voiceTone === 'Consultiva com foco em vendas'} onClick={() => setFormData({ ...formData, voiceTone: 'Consultiva com foco em vendas' })} />
                                            <OptionButton icon="🧠" label="Especialista Técnica" selected={formData.voiceTone === 'Técnica e detalhada'} onClick={() => setFormData({ ...formData, voiceTone: 'Técnica e detalhada' })} />
                                        </div>

                                        <div>
                                            <label className="text-sm font-medium text-foreground mb-1.5 block">O que a IA não deve falar (Opcional)</label>
                                            <input
                                                type="text"
                                                className="w-full px-4 py-3 bg-background border border-border rounded-xl outline-none text-sm"
                                                placeholder="Ex: Não dar descontos acima de 10%"
                                                value={formData.restrictions}
                                                onChange={e => setFormData({ ...formData, restrictions: e.target.value })}
                                            />
                                        </div>

                                        <button onClick={handlePersonalidade} disabled={loading} className="w-full btn-primary py-4 text-lg font-bold rounded-xl mt-4 flex justify-center">
                                            {loading ? <Loader2 className="animate-spin" /> : 'Finalizar Configuração'}
                                        </button>
                                    </div>
                                )}

                            </div>
                        )}

                        {/* STEP 3: TRAINING FILES */}
                        {step === 3 && (
                            <div className="space-y-6 animate-fade-in text-center">
                                <div className="w-16 h-16 bg-blue-500/10 rounded-full flex items-center justify-center mx-auto mb-2">
                                    <BrainCircuit size={32} className="text-blue-500" />
                                </div>

                                <div>
                                    <h3 className="text-2xl font-bold text-foreground">Transferindo Sabedoria</h3>
                                    <p className="text-muted-foreground mt-2">Envie PDFs ou manuais para aumentar o QI da sua IA.</p>
                                </div>

                                <FileUpload onFilesChanged={setFiles} accept=".pdf,.txt,.docx,.doc" />

                                <div className="flex gap-4 pt-4">
                                    <button onClick={() => { setStep(4); setPotential(95); playSound('click'); }} className="flex-1 py-3 text-muted-foreground font-medium hover:text-foreground">
                                        Pular (Configurar Depois)
                                    </button>
                                    <button
                                        onClick={handleFileUpload}
                                        disabled={loading}
                                        className="flex-[2] bg-primary hover:bg-primary/90 disabled:opacity-50 text-white font-bold py-3 rounded-xl shadow-lg shadow-primary/20 transition-all flex items-center justify-center gap-2"
                                    >
                                        {loading ? <Loader2 className="animate-spin" /> : 'Processar Conhecimento'}
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* STEP 4: WHATSAPP CONNECT */}
                        {step === 4 && (
                            <div className="text-center animate-fade-in relative z-10">
                                {wsStatus === 'connected' ? (
                                    <div className="py-8 space-y-8">
                                        <div className="relative">
                                            <div className="absolute inset-0 bg-green-500/20 blur-3xl rounded-full" />
                                            <div className="w-32 h-32 bg-green-500 rounded-full flex items-center justify-center mx-auto relative z-10 shadow-2xl shadow-green-500/50 animate-bounce-slow">
                                                <BrainCircuit size={64} className="text-white" />
                                            </div>
                                        </div>

                                        <div>
                                            <h2 className="text-3xl font-display font-bold text-foreground">Sincronização Completa!</h2>
                                            <p className="text-muted-foreground max-w-lg mx-auto mt-2 text-lg">
                                                <strong>{formData.aiName}</strong> está viva e pronta para gerar receita. <br />
                                                <span className="text-primary font-semibold block mt-2">
                                                    Parabéns {user?.name}! Você ganhou <span className="text-yellow-500 font-bold">100 Koins</span> para fazer a <strong>{formData.companyName}</strong> escalar o faturamento melhorando o atendimento.
                                                </span>
                                            </p>
                                        </div>

                                        <button
                                            onClick={() => navigate('/dashboard')}
                                            className="w-full bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white font-bold py-5 rounded-2xl shadow-xl shadow-green-500/20 transition-all active:scale-95 text-xl tracking-wide flex items-center justify-center gap-3"
                                        >
                                            <Rocket size={24} /> Entrar no Centro de Comando
                                        </button>
                                    </div>
                                ) : (
                                    <div className="space-y-8">
                                        <div>
                                            <h3 className="text-2xl font-bold text-foreground">Conexão Neural (WhatsApp)</h3>
                                            <p className="text-muted-foreground mt-2">
                                                O último passo para dar voz à sua IA.
                                            </p>
                                        </div>

                                        {wsStatus === 'idle' && (
                                            <div className="space-y-4">
                                                <button
                                                    onClick={() => generateQrCode()}
                                                    className="w-full bg-primary hover:bg-primary/90 text-white font-bold py-4 rounded-xl shadow-lg shadow-primary/20 transition-all text-lg flex items-center justify-center gap-2"
                                                >
                                                    <Sparkles size={20} /> Gerar Portal de Conexão (QR)
                                                </button>
                                                <button onClick={async () => { await completeOnboarding(); setWsStatus('connected'); }} className="w-full py-3 text-muted-foreground hover:text-foreground">
                                                    Conectar depois
                                                </button>
                                            </div>
                                        )}

                                        {wsStatus === 'connecting' && (
                                            <div className="py-12 flex flex-col items-center">
                                                <Loader2 size={56} className="text-primary animate-spin mb-6" />
                                                <p className="text-lg font-medium text-foreground">Estabelecendo link seguro...</p>
                                            </div>
                                        )}

                                        {wsStatus === 'qrcode' && qrCode && (
                                            <div className="flex flex-col items-center bg-white p-6 rounded-2xl shadow-xl border border-border/50 max-w-sm mx-auto">
                                                <img src={qrCode} alt="QR Code" className="w-64 h-64 object-contain mix-blend-multiply" />
                                                <div className="mt-4 flex items-center gap-2 text-sm font-mono text-muted-foreground bg-secondary/50 px-4 py-2 rounded-full">
                                                    <Loader2 size={12} className="animate-spin" /> Atualiza em {timer}s
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}

                    </div>
                </div>

                {/* VISUAL COMPONENT: Thermometer Sidebar */}
                <Thermometer potential={potential} />

            </div>

            {/* Background Decorations */}
            <div className="absolute top-0 left-0 w-full h-full overflow-hidden -z-10 pointer-events-none">
                <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary/5 rounded-full blur-3xl opacity-50 animate-blob" />
                <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-purple-500/5 rounded-full blur-3xl opacity-50 animate-blob animation-delay-2000" />
            </div>

            <DebugModal
                isOpen={debugOpen}
                onClose={() => setDebugOpen(false)}
                logs={logs}
                title="Onboarding Debug"
            />
        </div>
    );
}
