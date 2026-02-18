import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { motion } from 'framer-motion';
import {
    Users,
    CreditCard,
    DollarSign,
    Copy,
    CheckCircle2,
    TrendingUp,
    MousePointer2,
    Share2,
    Wallet
} from 'lucide-react';

interface PartnerData {
    id: string;
    affiliateCode: string;
    commissionPercentage: string;
    status: string;
    walletPending: string;
    walletAvailable: string;
}

interface Metrics {
    totalClicks: number;
    totalLeads: number;
    activeCustomers: number;
}

interface Commission {
    id: string;
    amount: string;
    status: 'pending' | 'available';
    created_at: string;
}

export const PartnerDashboard: React.FC = () => {
    const { token } = useAuth();
    const [loading, setLoading] = useState(true);
    const [isPartner, setIsPartner] = useState(false);
    const [partnerData, setPartnerData] = useState<PartnerData | null>(null);
    const [metrics, setMetrics] = useState<Metrics | null>(null);
    const [commissions, setCommissions] = useState<Commission[]>([]);
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        fetchPartnerData();
    }, []);

    const fetchPartnerData = async () => {
        try {
            const res = await fetch('http://localhost:3000/api/partners/dashboard', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (res.status === 404) {
                setIsPartner(false);
            } else if (res.ok) {
                const data = await res.json();
                setIsPartner(true);
                setPartnerData(data.partner);
                setMetrics(data.metrics);
                setCommissions(data.commissions);
            }
        } catch (error) {
            console.error('Error fetching partner data:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleApply = async () => {
        try {
            const res = await fetch('http://localhost:3000/api/partners/apply', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (res.ok) {
                fetchPartnerData();
            }
        } catch (error) {
            console.error('Error applying for partnership:', error);
        }
    };

    const copyLink = () => {
        if (partnerData) {
            navigator.clipboard.writeText(`https://kogna.co/p/${partnerData.affiliateCode}`);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    };

    if (loading) {
        return (
            <div className="flex h-full items-center justify-center">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
            </div>
        );
    }

    if (!isPartner) {
        return (
            <div className="p-8 max-w-4xl mx-auto">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-surface rounded-2xl shadow-xl overflow-hidden border border-border"
                >
                    <div className="bg-gradient-to-r from-primary to-primary-light p-12 text-center text-white">
                        <Users className="w-16 h-16 mx-auto mb-6 opacity-90" />
                        <h1 className="text-4xl font-display font-bold mb-4">
                            Seja um Parceiro Kogna
                        </h1>
                        <p className="text-lg opacity-90 max-w-2xl mx-auto">
                            Indique a Kogna para outras empresas e ganhe comissões recorrentes por cada venda realizada.
                        </p>
                    </div>

                    <div className="p-8 md:p-12">
                        <div className="grid md:grid-cols-3 gap-8 mb-12">
                            <div className="text-center">
                                <div className="w-12 h-12 bg-primary/10 text-primary rounded-xl flex items-center justify-center mx-auto mb-4">
                                    <DollarSign className="w-6 h-6" />
                                </div>
                                <h3 className="font-bold text-lg mb-2 text-text-primary">Comissões Atrativas</h3>
                                <p className="text-text-secondary">Ganhe até 20% de comissão sobre todas as vendas realizadas através do seu link.</p>
                            </div>
                            <div className="text-center">
                                <div className="w-12 h-12 bg-primary/10 text-primary rounded-xl flex items-center justify-center mx-auto mb-4">
                                    <TrendingUp className="w-6 h-6" />
                                </div>
                                <h3 className="font-bold text-lg mb-2 text-text-primary">Renda Recorrente</h3>
                                <p className="text-text-secondary">Construa uma fonte de renda passiva indicando nossa solução de IA.</p>
                            </div>
                            <div className="text-center">
                                <div className="w-12 h-12 bg-primary/10 text-primary rounded-xl flex items-center justify-center mx-auto mb-4">
                                    <Share2 className="w-6 h-6" />
                                </div>
                                <h3 className="font-bold text-lg mb-2 text-text-primary">Link Exclusivo</h3>
                                <p className="text-text-secondary">Acompanhe cliques, leads e vendas em tempo real através do seu dashboard.</p>
                            </div>
                        </div>

                        <div className="text-center">
                            <button
                                onClick={handleApply}
                                className="px-8 py-4 bg-primary hover:bg-primary-dark text-white rounded-xl font-semibold shadow-lg shadow-primary/30 transition-all transform hover:scale-105"
                            >
                                Tornar-se Parceiro Gratuitamente
                            </button>
                            <p className="mt-4 text-sm text-text-muted">
                                Ao clicar, você concorda com nossos termos de parceria.
                            </p>
                        </div>
                    </div>
                </motion.div>
            </div>
        );
    }

    return (
        <div className="p-8 space-y-8">
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-display font-bold text-text-primary">
                        Parceiro Kogna
                    </h1>
                    <p className="text-text-secondary">
                        Acompanhe seu desempenho e comissões
                    </p>
                </div>

                <div className="bg-surface p-2 rounded-xl border border-border flex items-center shadow-sm">
                    <div className="px-4 py-2 text-sm text-text-secondary border-r border-border bg-background rounded-l-lg">
                        Seu Link:
                    </div>
                    <div className="px-4 font-mono text-primary font-medium">
                        kogna.co/p/{partnerData?.affiliateCode}
                    </div>
                    <button
                        onClick={copyLink}
                        className="p-2 hover:bg-background rounded-lg transition-colors text-text-secondary"
                        title="Copiar Link"
                    >
                        {copied ? <CheckCircle2 className="w-5 h-5 text-emerald-500" /> : <Copy className="w-5 h-5" />}
                    </button>
                </div>
            </div>

            {/* Metrics Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <div className="bg-surface p-6 rounded-2xl shadow-sm border border-border">
                    <div className="flex items-center gap-4 mb-4">
                        <div className="p-3 bg-blue-500/10 text-blue-500 rounded-xl">
                            <MousePointer2 className="w-6 h-6" />
                        </div>
                        <div>
                            <p className="text-sm text-text-muted font-medium">Cliques Totais</p>
                            <h3 className="text-2xl font-bold text-text-primary">{metrics?.totalClicks}</h3>
                        </div>
                    </div>
                </div>

                <div className="bg-surface p-6 rounded-2xl shadow-sm border border-border">
                    <div className="flex items-center gap-4 mb-4">
                        <div className="p-3 bg-primary/10 text-primary rounded-xl">
                            <Users className="w-6 h-6" />
                        </div>
                        <div>
                            <p className="text-sm text-text-muted font-medium">Leads Cadastrados</p>
                            <h3 className="text-2xl font-bold text-text-primary">{metrics?.totalLeads}</h3>
                        </div>
                    </div>
                </div>

                <div className="bg-surface p-6 rounded-2xl shadow-sm border border-border">
                    <div className="flex items-center gap-4 mb-4">
                        <div className="p-3 bg-emerald-500/10 text-emerald-500 rounded-xl">
                            <CreditCard className="w-6 h-6" />
                        </div>
                        <div>
                            <p className="text-sm text-text-muted font-medium">Clientes Ativos</p>
                            <h3 className="text-2xl font-bold text-text-primary">{metrics?.activeCustomers}</h3>
                        </div>
                    </div>
                </div>

                <div className="bg-surface p-6 rounded-2xl shadow-sm border border-border bg-gradient-to-br from-surface to-amber-500/5">
                    <div className="flex items-center gap-4 mb-4">
                        <div className="p-3 bg-amber-500/10 text-amber-500 rounded-xl">
                            <Wallet className="w-6 h-6" />
                        </div>
                        <div>
                            <p className="text-sm text-text-muted font-medium">Comissão Disponível</p>
                            <h3 className="text-2xl font-bold text-text-primary mt-1">
                                R$ {Number(partnerData?.walletAvailable).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                            </h3>
                            <p className="text-xs text-text-muted mt-1">
                                + R$ {Number(partnerData?.walletPending).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} pendente
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Financial Statement */}
            <div className="bg-surface rounded-2xl shadow-sm border border-border overflow-hidden">
                <div className="p-6 border-b border-border">
                    <h3 className="font-bold text-lg text-text-primary">Extrato de Comissões</h3>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead className="bg-muted/50 border-b border-border">
                            <tr>
                                <th className="px-6 py-4 text-left text-xs font-semibold text-text-muted uppercase tracking-wider">Data</th>
                                <th className="px-6 py-4 text-left text-xs font-semibold text-text-muted uppercase tracking-wider">Status</th>
                                <th className="px-6 py-4 text-right text-xs font-semibold text-text-muted uppercase tracking-wider">Valor</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                            {commissions.length === 0 ? (
                                <tr>
                                    <td colSpan={3} className="px-6 py-12 text-center text-text-muted">
                                        Nenhuma comissão registrada ainda. Compartilhe seu link para começar!
                                    </td>
                                </tr>
                            ) : (
                                commissions.map((item) => (
                                    <tr key={item.id} className="hover:bg-muted/30 transition-colors">
                                        <td className="px-6 py-4 text-sm text-text-secondary">
                                            {new Date(item.created_at).toLocaleDateString('pt-BR')}
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${item.status === 'available'
                                                ? 'bg-emerald-500/10 text-emerald-500'
                                                : 'bg-amber-500/10 text-amber-500'
                                                }`}>
                                                {item.status === 'available' ? 'Disponível' : 'Pendente'}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-right text-sm font-medium text-text-primary">
                                            R$ {Number(item.amount).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default PartnerDashboard;
