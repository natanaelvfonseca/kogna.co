import { useState, useEffect } from 'react';
import { Package, BarChart2, ServerCog, ArrowUpRight } from 'lucide-react';
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    Cell
} from 'recharts';
import { useAuth } from '../../../context/AuthContext';

export function ProductsTab({ data }: { data: any }) {
    const { token } = useAuth();
    const [consumptionLogs, setConsumptionLogs] = useState<any[]>([]);
    const [loadingCons, setLoadingCons] = useState(true);

    useEffect(() => {
        const fetchConsumption = async () => {
            try {
                // Using standard vite env import format, fallback to hardcoded if omitted in context
                const apiBase = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';
                const res = await fetch(`${apiBase}/api/admin/consumption`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                const logs = await res.json();
                setConsumptionLogs(Array.isArray(logs) ? logs : []);
            } catch (e) {
                console.error("Failed to fetch consumption logs", e);
            } finally {
                setLoadingCons(false);
            }
        };
        fetchConsumption();
    }, [token]);

    if (!data || !data.products) return (
        <div className="h-[400px] flex items-center justify-center">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-purple-500"></div>
        </div>
    );

    const { list: products, topProducts } = data.products;

    return (
        <div className="space-y-8 animate-in slide-in-from-bottom-4 duration-500">
            {/* Top Cards for Overview of Products */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-card border border-purple-500/20 rounded-xl p-6 shadow-xl flex items-center gap-4">
                    <div className="p-4 bg-purple-500/10 rounded-full">
                        <Package className="w-8 h-8 text-purple-500" />
                    </div>
                    <div>
                        <h3 className="text-sm font-medium text-muted-foreground uppercase">Portfólio Ativo</h3>
                        <p className="text-2xl font-bold font-mono">{products.length} Produtos</p>
                    </div>
                </div>
                <div className="bg-card border border-amber-500/20 rounded-xl p-6 shadow-xl flex items-center gap-4">
                    <div className="p-4 bg-amber-500/10 rounded-full">
                        <BarChart2 className="w-8 h-8 text-amber-500" />
                    </div>
                    <div>
                        <h3 className="text-sm font-medium text-muted-foreground uppercase">Top Seller Atual</h3>
                        <p className="text-2xl font-bold">{topProducts?.[0]?.name || "N/A"}</p>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
                {/* Product Sales Table */}
                <div className="xl:col-span-2 bg-card border border-purple-500/20 rounded-xl overflow-hidden shadow-xl shadow-purple-500/5">
                    <div className="p-6 border-b border-purple-500/10 flex justify-between items-center">
                        <div>
                            <h3 className="text-xl font-semibold flex items-center gap-2">
                                <Package className="w-5 h-5 text-purple-500" />
                                Performance de Vendas
                            </h3>
                            <p className="text-sm text-muted-foreground mt-1">Produtos cadastrados e receita gerada no período filtrado</p>
                        </div>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead className="bg-purple-500/5 text-muted-foreground font-medium text-sm">
                                <tr>
                                    <th className="px-6 py-4">Produto</th>
                                    <th className="px-6 py-4">Tipo</th>
                                    <th className="px-6 py-4">Preço (R$)</th>
                                    <th className="px-6 py-4 text-center">Volume</th>
                                    <th className="px-6 py-4 text-right">Receita Bruta</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-purple-500/10">
                                {products.map((p: any) => (
                                    <tr key={p.id} className="hover:bg-purple-500/5 transition-colors">
                                        <td className="px-6 py-4 font-medium">{p.name}</td>
                                        <td className="px-6 py-4">
                                            <span className={`px-2 py-1 text-xs rounded-full ${p.type === 'KOINS' ? 'bg-amber-500/10 text-amber-500 border border-amber-500/20' : 'bg-blue-500/10 text-blue-500 border border-blue-500/20'}`}>
                                                {p.type}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4">{(p.price || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                                        <td className="px-6 py-4 text-center font-mono font-bold text-purple-400">{p.sales}</td>
                                        <td className="px-6 py-4 text-right font-mono font-bold text-green-400">
                                            R$ {p.revenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Top Products Chart */}
                <div className="bg-card border border-purple-500/20 rounded-xl p-6 shadow-xl shadow-purple-500/5">
                    <h3 className="text-xl font-semibold mb-6">Top 5 Produtos em Receita</h3>
                    <div className="h-[400px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={topProducts} layout="vertical" margin={{ top: 0, right: 30, left: 10, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#333" />
                                <XAxis type="number" hide />
                                <YAxis dataKey="name" type="category" width={100} tick={{ fill: '#888', fontSize: 12 }} axisLine={false} tickLine={false} />
                                <Tooltip
                                    cursor={{ fill: 'rgba(124, 58, 237, 0.1)' }}
                                    contentStyle={{ backgroundColor: '#111', borderColor: '#7C3AED', borderRadius: '8px' }}
                                    formatter={(value: number) => [`R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, 'Receita']}
                                />
                                <Bar dataKey="revenue" radius={[0, 4, 4, 0]} barSize={32}>
                                    {topProducts.map((_: any, index: number) => (
                                        <Cell key={`cell-${index}`} fill={index === 0 ? '#7C3AED' : '#D4AF37'} />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>

            {/* Consumption vs Costs Table */}
            <div className="bg-card border border-purple-500/20 rounded-xl overflow-hidden shadow-xl mt-8 shadow-purple-500/5">
                <div className="p-6 border-b border-purple-500/10">
                    <h3 className="text-xl font-semibold flex items-center gap-2">
                        <ServerCog className="w-5 h-5 text-amber-500" />
                        Análise de Lucratividade: Consumo IA (Koins vs Custo OpenAI)
                    </h3>
                    <p className="text-sm text-muted-foreground mt-1 text-amber-500 font-medium tracking-wide flex items-center gap-1">
                        <ArrowUpRight className="w-4 h-4" /> Margem saudável: Receita Estimada em Koins {'>'} Custo Real de API
                    </p>
                </div>
                {loadingCons ? (
                    <div className="p-8 text-center text-muted-foreground animate-pulse">Buscando rastros de consumo na infraestrutura...</div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead className="bg-amber-500/5 text-muted-foreground font-medium text-sm border-b border-amber-500/10">
                                <tr>
                                    <th className="px-6 py-4">Cliente Associado</th>
                                    <th className="px-6 py-4">Tokens Processados (In/Out)</th>
                                    <th className="px-6 py-4 text-red-400">Custo API Gerado (USD)</th>
                                    <th className="px-6 py-4 text-amber-400">Koins Cobrados</th>
                                    <th className="px-6 py-4">ROE (Retorno s/ Eficiência)</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-purple-500/10">
                                {consumptionLogs.map((log, i) => {
                                    const costUSD = Number(log.total_cost) || 0;
                                    const costBRL = costUSD * 5.0; // Rough peg for BRL
                                    const estimatedKoinRevenue = (Number(log.estimated_koins_spent) / 100); // Ex: 100 Koins = R$1.00 roughly based on packages
                                    const profitRatio = costBRL > 0.001 ? estimatedKoinRevenue / costBRL : 9.9;

                                    return (
                                        <tr key={i} className="hover:bg-purple-500/5 transition-colors">
                                            <td className="px-6 py-4 font-medium flex items-center gap-2">
                                                {log.user_name}
                                            </td>
                                            <td className="px-6 py-4 text-sm font-mono text-muted-foreground">
                                                {log.total_prompt_tokens?.toLocaleString()} / {log.total_completion_tokens?.toLocaleString()}
                                            </td>
                                            <td className="px-6 py-4 text-red-500 font-mono font-bold">
                                                ${costUSD.toFixed(4)}
                                            </td>
                                            <td className="px-6 py-4 text-amber-500 font-bold font-mono">
                                                {log.estimated_koins_spent?.toLocaleString()}
                                            </td>
                                            <td className="px-6 py-4 w-[200px]">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-full h-2 bg-muted/50 rounded-full overflow-hidden shrink-0 shadow-inner">
                                                        <div
                                                            className={`h-full transition-all duration-1000 ${profitRatio > 2.5 ? 'bg-gradient-to-r from-green-600 to-green-400' : profitRatio > 1.2 ? 'bg-gradient-to-r from-amber-600 to-amber-400' : 'bg-gradient-to-r from-red-600 to-red-400'}`}
                                                            style={{ width: `${Math.min(profitRatio * 20, 100)}%` }}
                                                        ></div>
                                                    </div>
                                                    <span className={`text-xs font-bold font-mono shrink-0 ${profitRatio > 2.5 ? 'text-green-500' : profitRatio > 1.2 ? 'text-amber-500' : 'text-red-500'}`}>
                                                        {profitRatio.toFixed(1)}x
                                                    </span>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                        {consumptionLogs.length === 0 && (
                            <div className="p-8 text-center text-muted-foreground border-t border-purple-500/10">
                                Nenhum cliente consumiu recursos da API OpenAI recentemente.
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
