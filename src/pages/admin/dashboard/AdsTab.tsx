import { Filter, MousePointerClick, UserPlus, DollarSign, ArrowUpRight, Megaphone, Target, BarChart4 } from 'lucide-react';
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    Cell,
    PieChart,
    Pie,
    Legend
} from 'recharts';

export function AdsTab({ data }: { data: any }) {
    if (!data || !data.ads) return (
        <div className="h-[400px] flex items-center justify-center">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-purple-500"></div>
        </div>
    );

    const {
        investmentTotal,
        leadsGenerated,
        cpl,
        roas
    } = data.ads;

    // Mocked Funnel Data representing impressions -> clicks -> leads -> sales
    const funnelData = [
        { stage: 'Impressões', count: leadsGenerated * 120, fill: '#8B5CF6' },
        { stage: 'Cliques', count: leadsGenerated * 12, fill: '#A78BFA' },
        { stage: 'Leads', count: leadsGenerated, fill: '#C4B5FD' },
        { stage: 'Vendas', count: Math.max(1, Math.floor(leadsGenerated * 0.15)), fill: '#DDD6FE' }
    ];

    // Mocked Leads Source Data
    const sourcesData = [
        { name: 'Meta Ads (FB/IG)', value: Math.floor(leadsGenerated * 0.55) },
        { name: 'Google Search', value: Math.floor(leadsGenerated * 0.30) },
        { name: 'Tráfego Orgânico', value: Math.floor(leadsGenerated * 0.15) }
    ];
    const COLORS = ['#3B82F6', '#EF4444', '#10B981'];

    return (
        <div className="space-y-8 animate-in slide-in-from-bottom-4 duration-500">
            {/* Disclaimer Banner */}
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 flex items-start gap-4 shadow-lg shadow-amber-500/5">
                <div className="p-2 bg-amber-500/20 rounded-full mt-0.5">
                    <Megaphone className="w-5 h-5 text-amber-500" />
                </div>
                <div>
                    <h4 className="font-semibold text-amber-500">Módulo de Aquisição Beta</h4>
                    <p className="text-sm text-amber-400 mt-1">
                        Os dados exibidos nesta aba atualmente são simulações baseadas na fatia do lucro alocada para marketing (20% da Receita).
                        Em futuras atualizações, integraremos APIs do Facebook Ads e Google Ads para dados em tempo real.
                    </p>
                </div>
            </div>

            {/* Core Ad KPIs */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <AdCard
                    title="Investimento (Spend)"
                    value={\`R$ \${investmentTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}\`}
                icon={<DollarSign className="w-5 h-5 text-red-500" />}
                detail="Custo total de mídias pagas"
                />
                <AdCard
                    title="Leads Captados"
                    value={leadsGenerated.toLocaleString()}
                    icon={<UserPlus className="w-5 h-5 text-blue-500" />}
                    detail="Contatos totais no período"
                />
                <AdCard
                    title="Custo por Lead (CPL)"
                    value={\`R$ \${cpl.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}\`}
                icon={<MousePointerClick className="w-5 h-5 text-purple-500" />}
                detail="Ticket médio de captação"
                />
                <AdCard
                    title="ROAS (Retorno)"
                    value={\`\${roas.toFixed(2)}x\`}
                icon={<ArrowUpRight className="w-5 h-5 text-green-500" />}
                detail="Receita gerada / Investimento"
                />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Funnel Chart */}
                <div className="bg-card border border-purple-500/20 rounded-xl p-6 shadow-xl shadow-purple-500/5">
                    <div className="flex items-center justify-between mb-6">
                        <div>
                            <h3 className="text-lg font-semibold flex items-center gap-2">
                                <Filter className="w-5 h-5 text-purple-500" />
                                Funil de Conversão Médio
                            </h3>
                            <p className="text-sm text-muted-foreground mt-1">Estágios do tráfego à venda (Exemplo Estrutural)</p>
                        </div>
                    </div>
                    <div className="h-[300px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={funnelData} layout="vertical" margin={{ top: 0, right: 30, left: 20, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#333" />
                                <XAxis type="number" hide />
                                <YAxis dataKey="stage" type="category" width={100} tick={{ fill: '#888', fontSize: 13, fontWeight: 500 }} axisLine={false} tickLine={false} />
                                <Tooltip
                                    cursor={{ fill: 'rgba(124, 58, 237, 0.1)' }}
                                    contentStyle={{ backgroundColor: '#111', borderColor: '#7C3AED', borderRadius: '8px' }}
                                />
                                <Bar dataKey="count" radius={[0, 4, 4, 0]} barSize={40}>
                                    {funnelData.map((entry, index) => (
                                        <Cell key={\`cell-\${index}\`} fill={entry.fill} />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Source Distribution Plot */}
                <div className="bg-card border border-purple-500/20 rounded-xl p-6 shadow-xl shadow-purple-500/5">
                    <div className="flex items-center justify-between mb-6">
                        <div>
                            <h3 className="text-lg font-semibold flex items-center gap-2">
                                <Target className="w-5 h-5 text-blue-500" />
                                Origem de Leads
                            </h3>
                            <p className="text-sm text-muted-foreground mt-1">Distribuição simulada de canais</p>
                        </div>
                    </div>
                    <div className="h-[300px] w-full flex items-center justify-center">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={sourcesData}
                                    cx="50%"
                                    cy="45%"
                                    innerRadius={70}
                                    outerRadius={100}
                                    paddingAngle={5}
                                    dataKey="value"
                                    stroke="none"
                                >
                                    {sourcesData.map((entry, index) => (
                                        <Cell key={\`cell-\${index}\`} fill={COLORS[index % COLORS.length]} />
                                    ))}
                                </Pie>
                                <Tooltip contentStyle={{ backgroundColor: '#111', borderColor: '#7C3AED', borderRadius: '8px' }} />
                                <Legend verticalAlign="bottom" height={36} wrapperStyle={{ fontSize: '13px', color: '#888' }} />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>
        </div>
    );
}

function AdCard({ title, value, icon, detail }: { title: string, value: string | number, icon: React.ReactNode, detail: string }) {
    return (
        <div className="bg-card border border-amber-500/10 hover:border-amber-500/30 rounded-xl p-5 relative overflow-hidden group shadow-lg transition-all duration-300 hover:-translate-y-1">
            <div className="absolute inset-0 bg-gradient-to-br from-amber-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            <div className="flex items-start justify-between relative z-10">
                <div className="space-y-2">
                    <p className="text-sm font-medium text-muted-foreground">{title}</p>
                    <h2 className="text-2xl font-bold font-mono text-foreground">{value}</h2>
                    <p className="text-xs text-muted-foreground/70">{detail}</p>
                </div>
                <div className="p-2.5 bg-background border border-amber-500/10 rounded-lg group-hover:scale-110 group-hover:bg-amber-500/10 transition-all">
                    {icon}
                </div>
            </div>
        </div>
    );
}
