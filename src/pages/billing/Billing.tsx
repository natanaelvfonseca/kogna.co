import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { History, Sparkles, Check, Zap, Gift, Crown, Package, Gem } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

interface BillingHistoryItem {
    id: string;
    amount: number;
    value: string;
    status: 'paid' | 'pending' | 'failed';
    created_at: string;
}

// --- HELPER COMPONENTS ---

function ImpulseCalculator() {
    const [leads, setLeads] = useState(100);
    const KOINS_PER_LEAD = 60;
    const TIME_SAVED_MINUTES = 15;

    const neededKoins = leads * KOINS_PER_LEAD;
    const timeSavedHours = Math.floor((leads * TIME_SAVED_MINUTES) / 60);

    const getImpactMessage = (val: number) => {
        if (val < 500) return { text: "Ideal para começar a tracionar.", color: "text-blue-400" };
        if (val < 2000) return { text: "Sua empresa operando em 24/7 como os grandes.", color: "text-amber-400" };
        return { text: "Potencial de faturamento máximo ativado! 🚀", color: "text-green-400" };
    };

    const impact = getImpactMessage(leads);

    return (
        <div className="bg-surface border border-border rounded-2xl p-6 relative overflow-hidden group">
            <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-purple-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

            <div className="flex items-center gap-2 mb-6">
                <div className="p-2 bg-primary/10 rounded-lg text-primary">
                    <Zap size={20} />
                </div>
                <h3 className="font-bold text-lg text-foreground">Calculadora de Impulso</h3>
            </div>

            <div className="space-y-6 relative z-10">
                <div>
                    <div className="flex justify-between text-sm mb-2">
                        <span className="text-muted-foreground">Quantos leads/mês?</span>
                        <span className="font-bold text-primary">{leads} leads</span>
                    </div>
                    <input
                        type="range"
                        min="50"
                        max="5000"
                        step="50"
                        value={leads}
                        onChange={(e) => setLeads(Number(e.target.value))}
                        className="w-full h-2 bg-yellow-100/20 rounded-lg appearance-none cursor-pointer accent-orange-500 hover:accent-orange-600 transition-all"
                    />
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div className="bg-background/50 p-4 rounded-xl border border-border/50 text-center">
                        <span className="text-xs text-muted-foreground uppercase block mb-1">Energia Necessária</span>
                        <div className="text-xl font-bold text-amber-500 flex items-center justify-center gap-1">
                            {neededKoins.toLocaleString()} <span className="text-xs">Koins</span>
                        </div>
                    </div>
                    <div className="bg-background/50 p-4 rounded-xl border border-border/50 text-center">
                        <span className="text-xs text-muted-foreground uppercase block mb-1">Tempo Humano Salvo</span>
                        <div className="text-xl font-bold text-blue-500 flex items-center justify-center gap-1">
                            {timeSavedHours} <span className="text-xs">Horas</span>
                        </div>
                    </div>
                </div>

                <div className={`text-center font-medium text-sm transition-colors duration-300 ${impact.color}`}>
                    "{impact.text}"
                </div>
            </div>
        </div>
    );
}

function LoyaltyBar({ currentRecharge }: { currentRecharge: number }) {
    const milestones = [
        { value: 1000, color: 'text-blue-400', fill: 'fill-blue-400/20', glow: 'shadow-blue-500/50', bg: 'bg-blue-500/20', border: 'border-blue-500/50' },
        { value: 5000, color: 'text-purple-400', fill: 'fill-purple-400/20', glow: 'shadow-purple-500/50', bg: 'bg-purple-500/20', border: 'border-purple-500/50' },
        { value: 10000, color: 'text-amber-400', fill: 'fill-amber-400/20', glow: 'shadow-amber-500/50', bg: 'bg-amber-500/20', border: 'border-amber-500/50' }
    ];

    const nextMilestone = milestones.find(m => m.value > currentRecharge) || milestones[milestones.length - 1];
    // Calculate progress relative to the specific milestone range could be better, but simple 0-100 to next milestone is fine for now
    // Actually, visually standard progress bars usually show total progress. 
    // But sticking to the previous logic: % towards the NEXT immediate goal.
    const progress = Math.min((currentRecharge / nextMilestone.value) * 100, 100);

    return (
        <div className="bg-gradient-to-r from-gray-900 via-indigo-950 to-gray-900 text-white rounded-2xl p-6 shadow-xl relative overflow-hidden border border-white/10">
            {/* Background Effects */}
            <div className="absolute top-0 left-0 w-full h-full bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 brightness-100 contrast-150"></div>
            <div className="absolute -right-20 -top-20 w-64 h-64 bg-primary/30 blur-[100px] rounded-full mix-blend-screen animate-pulse"></div>

            <div className="relative z-10">
                <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                        <Crown className="text-amber-400 fill-amber-400" size={20} />
                        <h3 className="font-bold text-lg">Recompensa por Recarga</h3>
                    </div>
                    <span className="text-xs font-medium text-white/60">
                        {currentRecharge.toLocaleString()} / {nextMilestone.value.toLocaleString()} Koins este mês
                    </span>
                </div>

                {/* Progress Track */}
                <div className="h-4 bg-white/10 rounded-full overflow-hidden relative mb-4 backdrop-blur-sm">
                    <div
                        className="h-full bg-gradient-to-r from-amber-400 to-orange-500 shadow-[0_0_15px_rgba(251,191,36,0.5)] transition-all duration-1000 ease-out relative"
                        style={{ width: `${progress}%` }}
                    >
                        <div className="absolute top-0 right-0 w-full h-full bg-gradient-to-b from-transparent to-black/10"></div>
                        <div className="absolute top-0 right-0 h-full w-2 bg-white/30 animate-pulse"></div>
                    </div>
                </div>

                <div className="flex justify-between items-end">
                    <p className="text-sm text-white/80 max-w-md">
                        Recarregue mais <strong>{(nextMilestone.value - currentRecharge).toLocaleString()}</strong> Koins para desbloquear o próximo Baú de Bônus!
                    </p>
                    <div className="flex gap-2">
                        {milestones.map((m, i) => {
                            const isUnlocked = currentRecharge >= m.value;
                            return (
                                <div key={i} className={`
                                    w-10 h-10 rounded-lg flex items-center justify-center border transition-all duration-500
                                    ${isUnlocked
                                        ? `${m.bg} ${m.border} ${m.color} shadow-[0_0_15px_rgba(255,255,255,0.1)] scale-110`
                                        : 'bg-white/5 border-white/10 opacity-70 hover:opacity-100' // Dimmed but visible
                                    }
                                `}>
                                    <Gift
                                        size={20}
                                        className={`
                                            transition-all duration-300 
                                            ${isUnlocked ? `animate-bounce-slow ${m.fill}` : m.color}
                                        `}
                                    />
                                </div>
                            )
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
}

// --- MAIN COMPONENT ---

export function Billing() {
    const { user } = useAuth();
    const [history, setHistory] = useState<BillingHistoryItem[]>([]);
    const [balance, setBalance] = useState<number | null>(null);
    const [loading, setLoading] = useState(true);
    const [showPaymentModal, setShowPaymentModal] = useState(false);

    // Logic for rewards simulation
    const [monthlyRecharge, setMonthlyRecharge] = useState(0);

    useEffect(() => {
        const fetchData = async () => {
            try {
                const headers = { 'Authorization': `Bearer ${localStorage.getItem('kogna_token')}` };

                // Fetch Credits
                const balanceRes = await fetch('/api/credits', { headers });
                if (balanceRes.ok) {
                    const balanceData = await balanceRes.json();
                    setBalance(balanceData.koins_balance);
                }

                // Fetch History
                const historyRes = await fetch('/api/billing/history', { headers });
                if (historyRes.ok) {
                    const historyData = await historyRes.json();
                    setHistory(historyData);

                    // Calculate "Monthly Recharge" for simulation (sum of paid transactions in current month)
                    const now = new Date();
                    const currentMonthRecharge = historyData
                        .filter((h: any) => {
                            const d = new Date(h.created_at);
                            return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear() && h.status === 'paid';
                        })
                        .reduce((sum: number, h: any) => sum + h.amount, 0);

                    setMonthlyRecharge(currentMonthRecharge);
                }
            } catch (error) {
                console.error('Failed to fetch billing data', error);
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, []);

    const playCoinSound = () => {
        // Placeholder for sound effect logic

    };

    const navigate = useNavigate(); // Hook for navigation

    const handleBuyClick = (productId: string) => {
        playCoinSound();
        navigate(`/checkout?productId=${productId}`);
    };

    const koinPackages = [
        {
            id: 'trial',
            name: 'Trial',
            amount: 1000,
            price: 25,
            bonus: 0,
            tag: 'Teste a Máquina',
            icon: <Package size={40} className="text-gray-400 group-hover:text-white transition-colors" />,
            color: 'from-gray-800 to-gray-900',
            popular: false
        },
        {
            id: 'start',
            name: 'Start',
            amount: 6000,
            base: 5000,
            bonus_amount: 1000,
            price: 97,
            tag: '17% De Bônus',
            icon: <Zap size={48} className="text-blue-500 fill-blue-500/20 drop-shadow-[0_0_8px_rgba(59,130,246,0.6)] group-hover:text-blue-400 transition-all duration-300" />,
            color: 'from-blue-900/50 to-indigo-900/50',
            popular: false
        },
        {
            id: 'growth',
            name: 'Growth',
            amount: 20000,
            base: 15000,
            bonus_amount: 5000,
            price: 297,
            tag: '25% De Bônus',
            icon: <Sparkles size={56} className="text-purple-500 fill-purple-500/20 drop-shadow-[0_0_8px_rgba(168,85,247,0.6)] group-hover:text-purple-400 transition-all duration-300" />,
            color: 'from-purple-900/50 to-pink-900/50',
            popular: true
        },
        {
            id: 'elite',
            name: 'Elite',
            amount: 45000,
            base: 30000,
            bonus_amount: 15000,
            price: 497,
            tag: '33% De Bônus',
            icon: <Crown size={64} className="text-amber-500 fill-amber-500/20 drop-shadow-[0_0_8px_rgba(245,158,11,0.6)] group-hover:text-amber-400 transition-all duration-300" />,
            color: 'from-amber-900/50 to-orange-900/50',
            popular: false
        }
    ];

    return (
        <div className="p-8 max-w-7xl mx-auto space-y-12 animate-fade-in pb-24">
            <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-4xl font-display font-bold text-transparent bg-clip-text bg-gradient-to-r from-primary to-purple-600 mb-2">
                        Loja de Combustível IA
                    </h1>
                    <p className="text-muted-foreground text-lg">Abasteça sua máquina de vendas e desbloqueie recompensas.</p>
                </div>

                {/* Current Balance Display */}
                <div className="bg-surface border border-border px-6 py-3 rounded-2xl shadow-sm flex items-center gap-4 hover:shadow-md transition-all">
                    <div className="text-right">
                        <span className="block text-xs font-bold text-muted-foreground uppercase tracking-wider">Saldo Disponível</span>
                        <span className="text-2xl font-bold font-mono text-primary">
                            {(balance !== null ? balance : user?.koins_balance || 0).toLocaleString()}
                        </span>
                    </div>
                    <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center text-primary animate-pulse-slow">
                        <Sparkles size={24} />
                    </div>
                </div>
            </header>

            {/* Loyalty & Calculator Section */}
            <div className="grid lg:grid-cols-2 gap-8">
                <LoyaltyBar currentRecharge={monthlyRecharge} />
                <ImpulseCalculator />
            </div>

            {/* KOIN PACKAGES GRID */}
            <div>
                <h2 className="text-2xl font-bold text-foreground mb-6 flex items-center gap-2">
                    <Package className="text-primary" /> Pacotes de Recarga
                </h2>
                <div className="grid md:grid-cols-4 gap-6">
                    {koinPackages.map((pkg) => (
                        <div
                            key={pkg.id}
                            className={`
                                relative bg-surface border rounded-2xl p-6 transition-all duration-300 hover:-translate-y-2 group cursor-pointer overflow-hidden flex flex-col justify-between
                                ${pkg.popular
                                    ? 'border-primary/50 shadow-[0_0_30px_rgba(255,76,0,0.1)] scale-105 ring-1 ring-primary/20 z-10 bg-gradient-to-b from-surface to-primary/5'
                                    : 'border-border shadow-lg hover:shadow-xl hover:border-primary/30'}
                            `}
                            onClick={() => handleBuyClick(pkg.id)}
                        >
                            {/* Hover Gradient Background */}
                            <div className={`absolute inset-0 bg-gradient-to-br opacity-0 group-hover:opacity-100 transition-opacity duration-500 ${pkg.color} -z-10`} />

                            {/* Popular/Value Badge */}
                            {pkg.tag && (
                                <div className={`absolute top-0 right-0 ${pkg.popular ? 'z-20' : ''}`}>
                                    <div className={`
                                        text-xs font-bold px-4 py-1 rounded-bl-xl shadow-lg
                                        ${pkg.popular ? 'bg-primary text-white' : 'bg-muted-secondary text-muted-foreground'}
                                    `}>
                                        {pkg.tag}
                                    </div>
                                </div>
                            )}

                            <div className="flex flex-col items-center text-center space-y-4 mb-6 relative z-10 pt-4">
                                <div className={`w-20 h-20 rounded-full bg-gradient-to-br ${pkg.color} flex items-center justify-center shadow-inner group-hover:scale-110 transition-transform duration-500 ring-1 ring-white/10`}>
                                    {pkg.icon}
                                </div>
                                <div className="space-y-1">
                                    <h3 className="font-bold text-xl text-foreground">{pkg.name}</h3>
                                    {pkg.bonus_amount ? (
                                        <div className="flex items-center justify-center gap-2 text-xs">
                                            <span className="text-muted-foreground line-through">{pkg.base.toLocaleString()}</span>
                                            <span className="font-bold text-green-500">+{pkg.bonus_amount.toLocaleString()} Bônus</span>
                                        </div>
                                    ) : (
                                        <div className="h-4"></div> // Spacer
                                    )}
                                </div>
                                <div className="text-primary font-mono text-3xl font-bold flex flex-col leading-tight">
                                    <span>{pkg.amount.toLocaleString()}</span>
                                    <span className="text-xs text-muted-foreground uppercase tracking-wider font-sans">Koins</span>
                                </div>
                            </div>

                            <button className="w-full bg-gradient-to-r from-orange-500 to-yellow-500 hover:from-orange-600 hover:to-yellow-600 text-white font-bold py-4 rounded-xl transition-all shadow-lg hover:shadow-orange-500/25 hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center gap-2 group-hover:animate-pulse-slow">
                                <span>R$ {pkg.price}</span>
                                <Zap size={16} className="fill-white" />
                            </button>
                        </div>
                    ))}
                </div>
            </div>

            {/* PRIME VIP CARD */}
            <div className="relative w-full max-w-4xl mx-auto my-12 group">
                <div className="absolute -inset-1 bg-gradient-to-r from-amber-500 via-purple-500 to-amber-500 rounded-2xl blur opacity-75 group-hover:opacity-100 transition duration-1000 group-hover:duration-200 animate-gradient-xy"></div>
                <div className="relative bg-surface rounded-2xl p-8 md:p-10 shadow-2xl flex flex-col md:flex-row items-center justify-between gap-8 border border-white/10">
                    <div className="flex-1 space-y-4">
                        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 text-amber-500 text-xs font-bold uppercase tracking-wider border border-amber-500/20">
                            <Crown size={12} /> Assinatura VIP
                        </div>
                        <h2 className="text-3xl font-bold text-foreground">Kogna Prime</h2>
                        <ul className="space-y-3">
                            {['Bônus Diário de 50 Koins (Login)', 'Acesso Antecipado a Novas Vozes', 'Recompensa Instantânea de 300 Koins'].map((feat, i) => (
                                <li key={i} className="flex items-center gap-3 text-muted-foreground">
                                    <div className="w-5 h-5 rounded-full bg-green-500/10 flex items-center justify-center">
                                        <Check size={12} className="text-green-500" />
                                    </div>
                                    {feat}
                                </li>
                            ))}
                        </ul>
                    </div>

                    <div className="text-center md:text-right flex flex-col items-center md:items-end gap-4 min-w-[200px]">
                        <div>
                            <span className="text-sm text-muted-foreground line-through block">R$ 59,90</span>
                            <span className="text-4xl font-bold text-foreground">R$ 29,90</span>
                            <span className="text-xs text-muted-foreground block">/mês</span>
                        </div>
                        <button
                            onClick={() => handleBuyClick('prime')}
                            className="bg-gradient-to-r from-orange-500 to-yellow-500 hover:from-orange-600 hover:to-yellow-600 text-white px-8 py-4 rounded-xl font-bold text-lg shadow-lg hover:scale-105 active:scale-95 transition-all w-full md:w-auto flex items-center justify-center gap-2"
                        >
                            Assinar Prime <Zap size={18} className="fill-current" />
                        </button>
                    </div>
                </div>
            </div>

            {/* History Table (Retained but Styled) */}
            <div className="bg-surface rounded-2xl border border-border overflow-hidden mt-12">
                <div className="p-6 border-b border-border flex items-center gap-2">
                    <History className="text-muted-foreground" />
                    <h3 className="font-bold text-foreground">Histórico de Transações</h3>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-muted-secondary text-muted-foreground font-medium">
                            <tr>
                                <th className="px-6 py-4">Data</th>
                                <th className="px-6 py-4">Item</th>
                                <th className="px-6 py-4">Valor</th>
                                <th className="px-6 py-4">Status</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                            {loading ? (
                                <tr><td colSpan={4} className="px-6 py-8 text-center text-muted-foreground">Carregando...</td></tr>
                            ) : history.length === 0 ? (
                                <tr><td colSpan={4} className="px-6 py-8 text-center text-muted-foreground">Nenhuma transação recente.</td></tr>
                            ) : (
                                history.map((item) => (
                                    <tr key={item.id} className="hover:bg-muted-secondary/50 transition-colors">
                                        <td className="px-6 py-4 text-foreground">
                                            {new Date(item.created_at).toLocaleDateString()}
                                        </td>
                                        <td className="px-6 py-4 font-medium text-primary flex items-center gap-2">
                                            <Gem size={14} />
                                            {item.amount.toLocaleString()} Koins
                                        </td>
                                        <td className="px-6 py-4 text-muted-foreground">
                                            R$ {Number(item.value).toFixed(2).replace('.', ',')}
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${item.status === 'paid' ? 'bg-green-500/10 text-green-500' :
                                                item.status === 'pending' ? 'bg-yellow-500/10 text-yellow-500' : 'bg-red-500/10 text-red-500'
                                                }`}>
                                                {item.status === 'paid' ? 'Concluído' : item.status === 'pending' ? 'Pendente' : 'Falhou'}
                                            </span>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Coming Soon Modal */}
            {showPaymentModal && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in">
                    <div className="bg-surface border border-border rounded-2xl p-8 max-w-md w-full shadow-2xl relative text-center">
                        <button onClick={() => setShowPaymentModal(false)} className="absolute top-4 right-4 text-muted-foreground hover:text-foreground">
                            ✕
                        </button>
                        <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-6">
                            <Zap className="w-8 h-8 text-primary" />
                        </div>
                        <h3 className="text-xl font-bold text-foreground mb-2">Checkout em Manutenção</h3>
                        <p className="text-muted-foreground mb-6">
                            Estamos atualizando nosso gateway para aceitar Pix e Cripto.
                            <br />Sua intenção de compra foi registrada!
                        </p>
                        <button onClick={() => setShowPaymentModal(false)} className="w-full btn-primary py-3 rounded-xl font-bold">
                            Voltar para a Loja
                        </button>
                    </div>
                </div>
            )}
        </div>

    );
}

export default Billing;


