import { TrendingUp, TrendingDown, DollarSign, Users, Activity, AlertTriangle, Zap, CheckCircle2 } from 'lucide-react';
import {
    AreaChart,
    Area,
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    Cell,
    PieChart,
    Pie
} from 'recharts';

export function OverviewTab({ data }: { data: any }) {
    if (!data || !data.overview) return (
        <div className="h-[400px] flex items-center justify-center">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-purple-500"></div>
        </div>
    );

    const {
        totalRevenue,
        koinsRevenue,
        connectionsRevenue,
        estimatedProfit,
        apiCost,
        activeClients,
        newClients,
        churn,
        ticketMedio,
        growthPercentage,
        revenueChartData
    } = data.overview;
    const { koinsSold, koinsConsumed } = data.products;
    const healthIndex = data.healthIndex || 0;

    const koinsPercent = totalRevenue > 0 ? (koinsRevenue / totalRevenue) * 100 : 0;
    const connPercent = totalRevenue > 0 ? (connectionsRevenue / totalRevenue) * 100 : 0;

    const riskAlerts = [];
    if (koinsConsumed > koinsSold && koinsSold > 0) riskAlerts.push("Consumo de Koins ultrapassando Vendas. Possível gargalo financeiro futuro.");
    if (apiCost > koinsRevenue * 0.3) riskAlerts.push("Custo de API OpenAI acima da margem segura de 30% da receita em Koins.");
    if (growthPercentage < 0) riskAlerts.push("Crescimento em Desaceleração comparado ao período anterior.");
    if (churn > newClients && newClients > 0) riskAlerts.push("Churn (Cancelamentos) maior que a aquisição de novos clientes no período.");

    return (
        <div className="space-y-8 animate-in slide-in-from-bottom-4 duration-500">
            {/* Health & Strategic KPIs */}
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">

                {/* KOGNA BUSINESS HEALTH */}
                <div className="lg:col-span-1 bg-gradient-to-br from-card to-card/50 border border-purple-500/20 rounded-2xl p-6 shadow-lg shadow-purple-500/5 relative overflow-hidden flex flex-col items-center justify-center">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500/10 rounded-full blur-3xl" />
                    <h3 className="text-sm font-semibold text-muted-foreground mb-4 uppercase tracking-wider text-center">Kogna Business Health</h3>

                    <div className="relative w-40 h-40 flex items-center justify-center">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={[
                                        { name: 'Health', value: healthIndex },
                                        { name: 'Gap', value: 100 - healthIndex }
                                    ]}
                                    cx="50%"
                                    cy="50%"
                                    startAngle={180}
                                    endAngle={0}
                                    innerRadius={60}
                                    outerRadius={80}
                                    stroke="none"
                                    dataKey="value"
                                >
                                    <Cell fill={healthIndex > 70 ? '#10B981' : healthIndex > 40 ? '#F59E0B' : '#EF4444'} />
                                    <Cell fill="#333333" />
                                </Pie>
                            </PieChart>
                        </ResponsiveContainer>
                        <div className="absolute text-center flex flex-col items-center mt-8 cursor-default">
                            <span className="text-4xl font-bold font-mono text-foreground">{healthIndex}</span>
                            <span className="text-xs text-muted-foreground">/ 100</span>
                        </div>
                    </div>
                    <div className="mt-2 text-xs text-center text-muted-foreground flex flex-col gap-1 w-full px-4">
                        <div className="flex justify-between border-b border-white/5 pb-1">
                            <span>Status:</span>
                            <span className={\`font-bold \${healthIndex > 70 ? 'text-green-500' : healthIndex > 40 ? 'text-amber-500' : 'text-red-500'}\`}>
                            {healthIndex > 70 ? '🟢 SAUDÁVEL' : healthIndex > 40 ? '🟡 ATENÇÃO' : '🔴 CRÍTICO'}
                        </span>
                    </div>
                    <div className="flex justify-between pt-1">
                        <span>Crescimento:</span>
                        <span className="text-foreground">{growthPercentage > 0 ? '+' : ''}{growthPercentage.toFixed(1)}%</span>
                    </div>
                </div>
            </div>

            {/* Primary Financial KPIs */}
            <div className="lg:col-span-3 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <StatCard
                    title="Receita Total"
                    value={\`R$ \${totalRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}\`}
                icon={<DollarSign className="w-5 h-5 text-purple-500" />}
                trend={\`\${growthPercentage >= 0 ? '+' : ''}\${growthPercentage.toFixed(1)}% vs ant.\`}
                trendPositive={growthPercentage >= 0}
                    />
                <StatCard
                    title="Lucro Estimado"
                    value={\`R$ \${estimatedProfit.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}\`}
                icon={<Activity className="w-5 h-5 text-green-500" />}
                trend="Receita - API - Ads"
                trendPositive={true}
                    />
                <StatCard
                    title="Receita Koins (Motor)"
                    value={\`R$ \${koinsRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}\`}
                icon={<Zap className="w-5 h-5 text-amber-500" />}
                trend={\`\${koinsPercent.toFixed(1)}% da receita\`}
                trendPositive={koinsPercent > 50}
                    />
                <StatCard
                    title="Receita Conexões WPP"
                    value={\`R$ \${connectionsRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}\`}
                icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 text-blue-500"><path d="M3 21l1.65-3.8a9 9 0 1 1 3.4 2.9L3 21" /><path d="M9 10a.5.5 0 0 0 1 0V9a.5.5 0 0 0-1 0v1a5 5 0 0 0 5 5h1a.5.5 0 0 0 0-1h-1a.5.5 0 0 0 0 1" /></svg>}
                trend={\`\${connPercent.toFixed(1)}% da receita (Recorrente)\`}
                trendPositive={true}
                    />
                <StatCard
                    title="Clientes Ativos"
                    value={activeClients.toString()}
                    icon={<Users className="w-5 h-5 text-cyan-500" />}
                    trend={\`+\${newClients} novos | -\${churn} cancelados\`}
                trendPositive={newClients >= churn}
                    />
                <StatCard
                    title="Ticket Médio (ARPU)"
                    value={\`R$ \${ticketMedio.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}\`}
                icon={<TrendingUp className="w-5 h-5 text-rose-500" />}
                trend="Receita / Clientes"
                trendPositive={true}
                    />
            </div>
        </div>

            {/* Risk Management Banner */ }
    {
        riskAlerts.length > 0 ? (
            <div className="bg-red-500/10 border border-red-500/50 rounded-xl p-4 flex flex-col md:flex-row gap-4 items-start md:items-center shadow-lg shadow-red-500/5">
                <div className="p-2 bg-red-500/20 rounded-full shrink-0">
                    <AlertTriangle className="w-6 h-6 text-red-500" />
                </div>
                <div>
                    <h4 className="font-semibold text-red-500">Atenção Estratégica Necessária</h4>
                    <ul className="text-sm text-red-400 mt-1 list-disc pl-4">
                        {riskAlerts.map((alert, i) => <li key={i}>{alert}</li>)}
                    </ul>
                </div>
            </div>
        ) : (
        <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-4 flex items-center gap-3 shadow-lg shadow-green-500/5">
            <CheckCircle2 className="w-5 h-5 text-green-500" />
            <span className="text-green-500 text-sm font-medium">Nenhum risco crítico detectado nos indicadores atuais. Operação saudável.</span>
        </div>
    )
    }

    {/* Secondary KPIs (Koins Usage) & Charts */ }
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Revenue Timeline */}
        <div className="bg-card border border-purple-500/20 rounded-xl p-6 shadow-xl shadow-purple-500/5">
            <div className="mb-6">
                <h3 className="text-lg font-semibold">Crescimento de Receita (Koins vs Conexões)</h3>
                <p className="text-sm text-muted-foreground">Distribuição da receita histórica empilhada</p>
            </div>
            <div className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={revenueChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                        <defs>
                            <linearGradient id="colorKoins" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#D4AF37" stopOpacity={0.3} />
                                <stop offset="95%" stopColor="#D4AF37" stopOpacity={0} />
                            </linearGradient>
                            <linearGradient id="colorConn" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.3} />
                                <stop offset="95%" stopColor="#3B82F6" stopOpacity={0} />
                            </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#333" />
                        <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: '#888', fontSize: 12 }} />
                        <YAxis axisLine={false} tickLine={false} tick={{ fill: '#888', fontSize: 12 }} tickFormatter={(val) => \`R$\${val}\`} />
                        <Tooltip
                            contentStyle={{ backgroundColor: '#111', borderColor: '#7C3AED', borderRadius: '8px' }}
                            formatter={(value: number, name: string) => [\`R$ \${value.toLocaleString()}\`, name === 'koins' ? 'Receita Koins' : 'Receita Conexões']}
                                />
                        <Area type="monotone" dataKey="koins" stackId="1" stroke="#D4AF37" fill="url(#colorKoins)" />
                        <Area type="monotone" dataKey="connections" stackId="1" stroke="#3B82F6" fill="url(#colorConn)" />
                    </AreaChart>
                </ResponsiveContainer>
            </div>
        </div>

        {/* Koins Economy Balance */}
        <div className="bg-card border border-purple-500/20 rounded-xl p-6 shadow-xl shadow-purple-500/5">
            <div className="mb-6">
                <h3 className="text-lg font-semibold">Economia de Koins</h3>
                <p className="text-sm text-muted-foreground">Relação entre Koins Injetados no ecossistema e Queimados</p>
            </div>
            <div className="h-[200px] w-full mb-6">
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={[{ name: 'Economia Global', vendidos: koinsSold, consumidos: koinsConsumed }]} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#333" />
                        <XAxis type="number" hide />
                        <YAxis dataKey="name" type="category" hide />
                        <Tooltip
                            cursor={{ fill: 'transparent' }}
                            contentStyle={{ backgroundColor: '#111', borderColor: '#7C3AED', borderRadius: '8px' }}
                        />
                        <Bar dataKey="vendidos" name="Koins Vendidos" fill="#7C3AED" radius={[0, 4, 4, 0]} barSize={40} />
                        <Bar dataKey="consumidos" name="Koins Consumidos" fill="#D4AF37" radius={[0, 4, 4, 0]} barSize={40} />
                    </BarChart>
                </ResponsiveContainer>
            </div>
            <div className="grid grid-cols-2 gap-4 border-t border-purple-500/10 pt-4">
                <div>
                    <p className="text-sm text-muted-foreground">Vendidos (Injetados)</p>
                    <p className="text-xl font-mono font-bold text-purple-400">{koinsSold.toLocaleString()}</p>
                </div>
                <div>
                    <p className="text-sm text-muted-foreground">Consumidos (Queimados)</p>
                    <p className="text-xl font-mono font-bold text-amber-400">{koinsConsumed.toLocaleString()}</p>
                </div>
            </div>
        </div>
    </div>
        </div >
    );
}

function StatCard({ title, value, icon, trend, trendPositive }: { title: string, value: string | number, icon: React.ReactNode, trend: string, trendPositive: boolean }) {
    return (
        <div className="bg-card border border-purple-500/10 hover:border-purple-500/30 rounded-xl p-5 relative overflow-hidden group shadow-lg transition-all duration-300 shadow-black/20 hover:-translate-y-1">
            <div className="absolute inset-0 bg-gradient-to-br from-purple-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            <div className="flex items-start justify-between relative z-10">
                <div className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{title}</p>
                    <h2 className="text-2xl font-bold font-mono text-foreground">{value}</h2>
                    <p className={\`text-xs flex items-center gap-1 font-semibold mt-2 \${trendPositive ? 'text-green-500' : 'text-amber-500'}\`}>
                    {trendPositive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                    {trend}
                </p>
            </div>
            <div className="p-2.5 bg-background border border-purple-500/10 rounded-lg group-hover:scale-110 group-hover:bg-purple-500/10 transition-all">
                {icon}
            </div>
        </div>
        </div >
    );
}
