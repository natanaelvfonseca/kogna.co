import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
    AlertTriangle,
    BookOpen,
    Bot,
    CalendarClock,
    CheckCircle2,
    ChevronRight,
    ClipboardList,
    GraduationCap,
    KanbanSquare,
    MessageCircle,
    Save,
    Settings,
    Target,
    Users,
    WalletCards,
} from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import {
    Conversation,
    Course,
    CourseOffer,
    OnboardingStatus,
    PaymentData,
    Pipeline,
    PipelineStage,
    Salesperson,
    School,
    SchoolAlert,
    SchoolDashboard,
    SchoolGoal,
    SchoolLead,
    SchoolTask,
    schoolsApi,
} from "../../services/api/schools";

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

function formatMoney(value?: number | null) {
    return money.format(Number(value || 0));
}

function formatDate(value?: string | null) {
    if (!value) return "Sem data";
    return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function normalizeForm(form: HTMLFormElement) {
    return Object.fromEntries(new FormData(form).entries());
}

function Panel({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
    return (
        <section className="rounded-lg border border-border bg-surface p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between gap-3">
                <h2 className="text-base font-bold text-text-primary">{title}</h2>
                {action}
            </div>
            {children}
        </section>
    );
}

function PageHeader({ icon: Icon, title, subtitle }: { icon: React.ElementType; title: string; subtitle: string }) {
    return (
        <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-3">
                <div className="rounded-lg border border-primary/20 bg-primary/10 p-3 text-primary">
                    <Icon size={22} />
                </div>
                <div>
                    <h1 className="text-2xl font-bold text-text-primary">{title}</h1>
                    <p className="text-sm text-text-secondary">{subtitle}</p>
                </div>
            </div>
        </div>
    );
}

function TextField({ name, label, type = "text", placeholder, required = false }: {
    name: string;
    label: string;
    type?: string;
    placeholder?: string;
    required?: boolean;
}) {
    return (
        <label className="grid gap-1.5 text-sm text-text-secondary">
            <span className="font-semibold text-text-primary">{label}</span>
            <input
                name={name}
                type={type}
                placeholder={placeholder}
                required={required}
                className="h-10 rounded-lg border border-border bg-background px-3 text-sm text-text-primary outline-none transition focus:border-primary"
            />
        </label>
    );
}

function SelectField({ name, label, children }: { name: string; label: string; children: React.ReactNode }) {
    return (
        <label className="grid gap-1.5 text-sm text-text-secondary">
            <span className="font-semibold text-text-primary">{label}</span>
            <select name={name} className="h-10 rounded-lg border border-border bg-background px-3 text-sm text-text-primary outline-none transition focus:border-primary">
                {children}
            </select>
        </label>
    );
}

function SubmitButton({ label = "Salvar" }: { label?: string }) {
    return (
        <button className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-bold text-white shadow-sm transition hover:brightness-110">
            <Save size={16} />
            {label}
        </button>
    );
}

function EmptyState({ title, description }: { title: string; description: string }) {
    return (
        <div className="rounded-lg border border-dashed border-border bg-background/60 p-6 text-sm">
            <p className="font-bold text-text-primary">{title}</p>
            <p className="mt-1 text-text-secondary">{description}</p>
        </div>
    );
}

function StatusPill({ value }: { value?: string | null }) {
    const tone = String(value || "").toLowerCase();
    const className = tone.includes("critica") || tone.includes("alta") || tone.includes("quente")
        ? "border-red-500/30 bg-red-500/10 text-red-500"
        : tone.includes("active") || tone.includes("confirmada") || tone.includes("resolvido")
            ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600"
            : "border-border bg-background text-text-secondary";
    return <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-bold ${className}`}>{value || "sem status"}</span>;
}

function useSchoolShell() {
    const { token } = useAuth();
    const [school, setSchool] = useState<School | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async () => {
        if (!token) return;
        setLoading(true);
        try {
            const schools = await schoolsApi.listSchools(token);
            setSchool(schools[0] || null);
            setError(null);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Erro ao carregar escola.");
        } finally {
            setLoading(false);
        }
    }, [token]);

    useEffect(() => {
        load();
    }, [load]);

    return { token, school, loading, error, reloadSchool: load };
}

function useResource<T>(schoolId: string | undefined, resource: string, token: string | null) {
    const [items, setItems] = useState<T[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async () => {
        if (!schoolId || !token) return;
        setLoading(true);
        try {
            setItems(await schoolsApi.list<T>(token, schoolId, resource));
            setError(null);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Erro ao carregar dados.");
        } finally {
            setLoading(false);
        }
    }, [resource, schoolId, token]);

    useEffect(() => {
        load();
    }, [load]);

    const create = async (payload: Record<string, unknown>) => {
        if (!schoolId || !token) return;
        await schoolsApi.create<T>(token, schoolId, resource, payload);
        await load();
    };

    return { items, loading, error, create, reload: load };
}

function ShellState({ loading, error, school, children }: {
    loading: boolean;
    error: string | null;
    school: School | null;
    children: React.ReactNode;
}) {
    if (loading) return <div className="rounded-lg border border-border bg-surface p-6 text-text-secondary">Carregando estrutura da escola...</div>;
    if (error) return <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-6 text-red-600">{error}</div>;
    if (!school) return <EmptyState title="Nenhuma escola encontrada" description="Crie ou vincule uma escola para iniciar a operacao comercial." />;
    return <>{children}</>;
}

function CompactList<T>({ items, emptyTitle, emptyDescription, render }: {
    items: T[];
    emptyTitle: string;
    emptyDescription: string;
    render: (item: T) => React.ReactNode;
}) {
    if (!items.length) return <EmptyState title={emptyTitle} description={emptyDescription} />;
    return <div className="grid gap-3">{items.map(render)}</div>;
}

export function CentralMelPage() {
    const { token, school, loading, error } = useSchoolShell();
    const [dashboard, setDashboard] = useState<SchoolDashboard | null>(null);

    useEffect(() => {
        if (!token || !school?.id) return;
        schoolsApi.getDashboard(token, school.id).then(setDashboard).catch(() => setDashboard(null));
    }, [school?.id, token]);

    const cards = [
        ["Leads hoje", dashboard?.today.leads || 0],
        ["Sem resposta", dashboard?.today.unansweredLeads || 0],
        ["Leads quentes", dashboard?.today.hotLeads || 0],
        ["Follow-ups atrasados", dashboard?.today.overdueFollowups || 0],
        ["Matriculas confirmadas", dashboard?.today.confirmedEnrollments || 0],
        ["Faturamento do mes", formatMoney(dashboard?.revenue.monthToDate)],
        ["Projecao simples", formatMoney(dashboard?.revenue.simpleProjection)],
        ["Gap da meta", formatMoney(dashboard?.revenue.gap)],
    ];

    return (
        <ShellState loading={loading} error={error} school={school}>
            <PageHeader icon={Bot} title="Central da Mel" subtitle="Governanca comercial para escola profissionalizante." />
            <div className="grid gap-5">
                <section className="rounded-lg border border-primary/20 bg-surface p-5 shadow-sm">
                    <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
                        <div>
                            <p className="text-sm font-semibold text-primary">{school?.name}</p>
                            <h2 className="mt-1 text-xl font-bold text-text-primary">Bom trabalho. A Mel esta pronta para organizar o comercial da escola.</h2>
                            <p className="mt-2 max-w-3xl text-sm text-text-secondary">
                                Configure cursos, ofertas, vendedores, metas e WhatsApp para a Mel enxergar gargalos, riscos e proximas acoes.
                            </p>
                        </div>
                        <button className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-border bg-background px-4 text-sm font-bold text-text-primary">
                            <MessageCircle size={17} />
                            Conversar com a Mel
                        </button>
                    </div>
                    <div className="mt-5">
                        <div className="mb-2 flex items-center justify-between text-xs font-bold text-text-secondary">
                            <span>Progresso de configuracao</span>
                            <span>{dashboard?.setupProgress || 0}%</span>
                        </div>
                        <div className="h-2 rounded-full bg-background">
                            <div className="h-2 rounded-full bg-primary" style={{ width: `${dashboard?.setupProgress || 0}%` }} />
                        </div>
                    </div>
                </section>

                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    {cards.map(([label, value]) => (
                        <div key={label} className="rounded-lg border border-border bg-surface p-4">
                            <p className="text-xs font-bold uppercase text-text-muted">{label}</p>
                            <p className="mt-2 text-2xl font-bold text-text-primary">{value}</p>
                        </div>
                    ))}
                </div>

                <div className="grid gap-5 lg:grid-cols-2">
                    <Panel title="Alertas criticos">
                        <CompactList
                            items={dashboard?.alerts || []}
                            emptyTitle="Sem alertas abertos"
                            emptyDescription="Quando houver risco comercial, a Mel destacara aqui."
                            render={(alert) => (
                                <div key={alert.id} className="rounded-lg border border-border bg-background p-3">
                                    <div className="flex items-center justify-between gap-2">
                                        <p className="font-bold text-text-primary">{alert.title}</p>
                                        <StatusPill value={alert.priority} />
                                    </div>
                                    <p className="mt-1 text-sm text-text-secondary">{alert.recommendation || alert.description || "Sem recomendacao."}</p>
                                </div>
                            )}
                        />
                    </Panel>
                    <Panel title="Proximas acoes recomendadas">
                        <CompactList
                            items={dashboard?.recommendedActions || []}
                            emptyTitle="Nada pendente"
                            emptyDescription="As recomendacoes surgem conforme dados comerciais entram."
                            render={(action) => (
                                <div key={action.id} className="flex items-center justify-between rounded-lg border border-border bg-background p-3">
                                    <div>
                                        <p className="font-bold text-text-primary">{action.title}</p>
                                        <p className="text-sm text-text-secondary">{action.description}</p>
                                    </div>
                                    <ChevronRight className="text-text-muted" size={18} />
                                </div>
                            )}
                        />
                    </Panel>
                </div>
            </div>
        </ShellState>
    );
}

export function SchoolOnboardingPage() {
    const { token, school, loading, error } = useSchoolShell();
    const [status, setStatus] = useState<OnboardingStatus | null>(null);

    const load = useCallback(async () => {
        if (!token || !school?.id) return;
        setStatus(await schoolsApi.getOnboarding(token, school.id));
    }, [school?.id, token]);

    useEffect(() => {
        load().catch(() => setStatus(null));
    }, [load]);

    const markWhatsappLater = async () => {
        if (!token || !school?.id) return;
        const result = await schoolsApi.updateOnboarding(token, school.id, { whatsappSetupLater: true });
        setStatus(result.onboarding);
    };

    return (
        <ShellState loading={loading} error={error} school={school}>
            <PageHeader icon={ClipboardList} title="Onboarding da Escola" subtitle="Checklist inicial para colocar a operacao comercial sob governanca." />
            <div className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
                <Panel title={`Configuracao inicial ${status?.progress || 0}%`}>
                    <div className="mb-5 h-2 rounded-full bg-background">
                        <div className="h-2 rounded-full bg-primary" style={{ width: `${status?.progress || 0}%` }} />
                    </div>
                    <div className="grid gap-3">
                        {(status?.checklist || []).map((item) => (
                            <div key={item.key} className="flex items-center justify-between rounded-lg border border-border bg-background p-3">
                                <span className="text-sm font-semibold text-text-primary">{item.label}</span>
                                {item.done ? <CheckCircle2 className="text-emerald-500" size={18} /> : <span className="text-xs font-bold text-text-muted">Pendente</span>}
                            </div>
                        ))}
                    </div>
                </Panel>
                <Panel title="Mel orienta">
                    <div className="rounded-lg border border-primary/20 bg-primary/10 p-4">
                        <p className="font-bold text-text-primary">Priorize os dados que a equipe usa todos os dias.</p>
                        <p className="mt-2 text-sm text-text-secondary">
                            Cursos, ofertas e dados financeiros oficiais permitem validar se vendedores estao seguindo a regra comercial da escola.
                        </p>
                    </div>
                    <button onClick={markWhatsappLater} className="mt-4 inline-flex h-10 items-center gap-2 rounded-lg border border-border bg-background px-4 text-sm font-bold text-text-primary">
                        Marcar WhatsApp para depois
                    </button>
                </Panel>
            </div>
        </ShellState>
    );
}

export function CoursesOffersPage() {
    const { token, school, loading, error } = useSchoolShell();
    const courses = useResource<Course>(school?.id, "courses", token);
    const offers = useResource<CourseOffer>(school?.id, "course-offers", token);

    const createCourse = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        await courses.create(normalizeForm(event.currentTarget));
        event.currentTarget.reset();
    };

    const createOffer = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        await offers.create(normalizeForm(event.currentTarget));
        event.currentTarget.reset();
    };

    return (
        <ShellState loading={loading} error={error} school={school}>
            <PageHeader icon={BookOpen} title="Cursos e Ofertas" subtitle="Cadastre cursos, precos e condicoes comerciais da escola." />
            <div className="grid gap-5 xl:grid-cols-2">
                <Panel title="Novo curso">
                    <form onSubmit={createCourse} className="grid gap-3">
                        <TextField name="name" label="Nome do curso" required />
                        <div className="grid gap-3 md:grid-cols-2">
                            <TextField name="category" label="Categoria" />
                            <TextField name="duration" label="Duracao" />
                            <TextField name="modality" label="Modalidade" />
                            <SelectField name="status" label="Status"><option value="active">Ativo</option><option value="inactive">Inativo</option></SelectField>
                        </div>
                        <TextField name="description" label="Descricao" />
                        <SubmitButton label="Cadastrar curso" />
                    </form>
                </Panel>
                <Panel title="Nova oferta">
                    <form onSubmit={createOffer} className="grid gap-3">
                        <SelectField name="courseId" label="Curso">
                            <option value="">Selecione</option>
                            {courses.items.map((course) => <option key={course.id} value={course.id}>{course.name}</option>)}
                        </SelectField>
                        <TextField name="name" label="Nome da oferta" required />
                        <div className="grid gap-3 md:grid-cols-2">
                            <TextField name="price" label="Preco total" type="number" />
                            <TextField name="enrollmentFee" label="Matricula" type="number" />
                            <TextField name="monthlyFee" label="Mensalidade" type="number" />
                            <TextField name="maxDiscountPercent" label="Desconto maximo (%)" type="number" />
                        </div>
                        <TextField name="paymentTerms" label="Condicoes de pagamento" />
                        <SubmitButton label="Cadastrar oferta" />
                    </form>
                </Panel>
                <Panel title="Cursos cadastrados">
                    <CompactList
                        items={courses.items}
                        emptyTitle="Nenhum curso cadastrado"
                        emptyDescription="Cadastre os cursos principais para a Mel entender a oferta da escola."
                        render={(course) => (
                            <div key={course.id} className="rounded-lg border border-border bg-background p-3">
                                <div className="flex items-center justify-between gap-2">
                                    <p className="font-bold text-text-primary">{course.name}</p>
                                    <StatusPill value={course.status} />
                                </div>
                                <p className="mt-1 text-sm text-text-secondary">{course.category || "Sem categoria"} · {course.modality || "Modalidade nao informada"}</p>
                            </div>
                        )}
                    />
                </Panel>
                <Panel title="Ofertas cadastradas">
                    <CompactList
                        items={offers.items}
                        emptyTitle="Nenhuma oferta cadastrada"
                        emptyDescription="As ofertas viram referencia para validar descontos e condicoes."
                        render={(offer) => (
                            <div key={offer.id} className="rounded-lg border border-border bg-background p-3">
                                <div className="flex items-center justify-between gap-2">
                                    <p className="font-bold text-text-primary">{offer.name}</p>
                                    <p className="font-bold text-primary">{formatMoney(offer.price)}</p>
                                </div>
                                <p className="mt-1 text-sm text-text-secondary">{offer.paymentTerms || "Sem condicao informada"}</p>
                            </div>
                        )}
                    />
                </Panel>
            </div>
        </ShellState>
    );
}

export function PaymentDataPage() {
    const { token, school, loading, error } = useSchoolShell();
    const payment = useResource<PaymentData>(school?.id, "payment-data", token);

    const create = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const raw = normalizeForm(event.currentTarget);
        await payment.create({ ...raw, paymentLinks: String(raw.paymentLinks || "").split("\n").filter(Boolean) });
        event.currentTarget.reset();
    };

    return (
        <ShellState loading={loading} error={error} school={school}>
            <PageHeader icon={WalletCards} title="Dados Financeiros Oficiais" subtitle="Referencia oficial para Pix, conta e links enviados aos futuros alunos." />
            <div className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
                <Panel title="Cadastrar dados oficiais">
                    <form onSubmit={create} className="grid gap-3">
                        <TextField name="pixKey" label="Pix oficial" />
                        <div className="grid gap-3 md:grid-cols-2">
                            <TextField name="bank" label="Banco" />
                            <TextField name="agency" label="Agencia" />
                            <TextField name="account" label="Conta" />
                            <TextField name="holderDocument" label="CNPJ/CPF" />
                        </div>
                        <TextField name="holderName" label="Titular" />
                        <TextField name="paymentLinks" label="Links de pagamento oficiais" />
                        <TextField name="commercialNotes" label="Observacoes comerciais" />
                        <SubmitButton />
                    </form>
                </Panel>
                <Panel title="Dados ativos">
                    <CompactList
                        items={payment.items}
                        emptyTitle="Nenhum dado financeiro oficial"
                        emptyDescription="A Mel usara esses dados para apontar divergencias em conversas comerciais."
                        render={(item) => (
                            <div key={item.id} className="rounded-lg border border-border bg-background p-4">
                                <div className="flex items-center justify-between gap-2">
                                    <p className="font-bold text-text-primary">{item.holderName || "Titular nao informado"}</p>
                                    <StatusPill value={item.status} />
                                </div>
                                <p className="mt-2 text-sm text-text-secondary">Pix: {item.pixKey || "nao informado"}</p>
                                <p className="text-sm text-text-secondary">{item.bank || "Banco nao informado"} · {item.agency || "agencia"} · {item.account || "conta"}</p>
                            </div>
                        )}
                    />
                </Panel>
            </div>
        </ShellState>
    );
}

export function SalesTeamPage() {
    const { token, school, loading, error } = useSchoolShell();
    const sellers = useResource<Salesperson>(school?.id, "salespeople", token);

    const create = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        await sellers.create(normalizeForm(event.currentTarget));
        event.currentTarget.reset();
    };

    return (
        <ShellState loading={loading} error={error} school={school}>
            <PageHeader icon={Users} title="Equipe Comercial" subtitle="Vendedores, metas individuais e vinculo futuro com usuarios da escola." />
            <div className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
                <Panel title="Novo vendedor">
                    <form onSubmit={create} className="grid gap-3">
                        <TextField name="name" label="Nome" required />
                        <div className="grid gap-3 md:grid-cols-2">
                            <TextField name="whatsapp" label="WhatsApp" />
                            <TextField name="email" label="E-mail" type="email" />
                            <TextField name="role" label="Funcao" />
                            <SelectField name="status" label="Status"><option value="active">Ativo</option><option value="inactive">Inativo</option></SelectField>
                            <TextField name="monthlyRevenueGoal" label="Meta individual de faturamento" type="number" />
                            <TextField name="monthlyEnrollmentGoal" label="Meta individual de matriculas" type="number" />
                        </div>
                        <SubmitButton label="Cadastrar vendedor" />
                    </form>
                </Panel>
                <Panel title="Vendedores">
                    <CompactList
                        items={sellers.items}
                        emptyTitle="Nenhum vendedor cadastrado"
                        emptyDescription="Cadastre o time que atende leads e faz matriculas pelo WhatsApp."
                        render={(seller) => (
                            <div key={seller.id} className="rounded-lg border border-border bg-background p-4">
                                <div className="flex items-center justify-between gap-2">
                                    <p className="font-bold text-text-primary">{seller.name}</p>
                                    <StatusPill value={seller.status} />
                                </div>
                                <p className="mt-1 text-sm text-text-secondary">{seller.role || "Vendedor"} · {seller.whatsapp || "WhatsApp nao informado"}</p>
                                <p className="text-sm text-text-secondary">Meta: {formatMoney(seller.monthlyRevenueGoal)} · {seller.monthlyEnrollmentGoal || 0} matriculas</p>
                            </div>
                        )}
                    />
                </Panel>
            </div>
        </ShellState>
    );
}

export function SchoolPipelinePage() {
    const { token, school, loading, error } = useSchoolShell();
    const stages = useResource<PipelineStage>(school?.id, "pipeline-stages", token);
    const leads = useResource<SchoolLead>(school?.id, "leads", token);
    const courses = useResource<Course>(school?.id, "courses", token);
    const sellers = useResource<Salesperson>(school?.id, "salespeople", token);
    const pipelines = useResource<Pipeline>(school?.id, "pipelines", token);
    const [filters, setFilters] = useState({ salespersonId: "", courseId: "", stageId: "", temperature: "" });

    const defaultPipeline = pipelines.items[0];
    const visibleLeads = useMemo(() => leads.items.filter((lead) => (
        (!filters.salespersonId || lead.salespersonId === filters.salespersonId)
        && (!filters.courseId || lead.courseId === filters.courseId)
        && (!filters.stageId || lead.pipelineStageId === filters.stageId)
        && (!filters.temperature || lead.temperature === filters.temperature)
    )), [filters, leads.items]);

    const createLead = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const raw = normalizeForm(event.currentTarget);
        await leads.create({ ...raw, pipelineId: defaultPipeline?.id, pipelineStageId: raw.pipelineStageId || stages.items[0]?.id });
        event.currentTarget.reset();
    };

    const moveLead = async (leadId: string, stageId: string) => {
        if (!token || !school?.id) return;
        await schoolsApi.moveLead(token, school.id, leadId, stageId);
        await leads.reload();
    };

    return (
        <ShellState loading={loading} error={error} school={school}>
            <PageHeader icon={KanbanSquare} title="Pipeline Comercial" subtitle="Kanban de matriculas com etapas padrao para escola profissionalizante." />
            <div className="mb-5 grid gap-3 rounded-lg border border-border bg-surface p-4 md:grid-cols-4">
                <SelectField name="salespersonFilter" label="Vendedor">
                    <option value="">Todos</option>
                    {sellers.items.map((seller) => <option key={seller.id} value={seller.id}>{seller.name}</option>)}
                </SelectField>
                <SelectField name="courseFilter" label="Curso">
                    <option value="">Todos</option>
                    {courses.items.map((course) => <option key={course.id} value={course.id}>{course.name}</option>)}
                </SelectField>
                <SelectField name="stageFilter" label="Etapa">
                    <option value="">Todas</option>
                    {stages.items.map((stage) => <option key={stage.id} value={stage.id}>{stage.name}</option>)}
                </SelectField>
                <SelectField name="tempFilter" label="Temperatura">
                    <option value="">Todas</option><option value="quente">Quente</option><option value="morno">Morno</option><option value="frio">Frio</option>
                </SelectField>
                <button
                    onClick={(event) => {
                        const container = event.currentTarget.parentElement;
                        const selects = container?.querySelectorAll("select");
                        setFilters({
                            salespersonId: selects?.[0]?.value || "",
                            courseId: selects?.[1]?.value || "",
                            stageId: selects?.[2]?.value || "",
                            temperature: selects?.[3]?.value || "",
                        });
                    }}
                    className="h-10 rounded-lg bg-primary px-4 text-sm font-bold text-white md:col-span-4"
                >
                    Aplicar filtros
                </button>
            </div>
            <Panel title="Novo lead no pipeline">
                <form onSubmit={createLead} className="grid gap-3 md:grid-cols-5">
                    <TextField name="name" label="Nome do lead" />
                    <TextField name="phone" label="Telefone" />
                    <SelectField name="courseId" label="Curso">{courses.items.map((course) => <option key={course.id} value={course.id}>{course.name}</option>)}</SelectField>
                    <SelectField name="salespersonId" label="Vendedor">{sellers.items.map((seller) => <option key={seller.id} value={seller.id}>{seller.name}</option>)}</SelectField>
                    <SelectField name="pipelineStageId" label="Etapa">{stages.items.map((stage) => <option key={stage.id} value={stage.id}>{stage.name}</option>)}</SelectField>
                    <SubmitButton label="Adicionar lead" />
                </form>
            </Panel>
            <div className="mt-5 overflow-x-auto pb-2">
                <div className="grid min-w-[1100px] auto-cols-[280px] grid-flow-col gap-4">
                    {stages.items.map((stage) => {
                        const stageLeads = visibleLeads.filter((lead) => lead.pipelineStageId === stage.id);
                        return (
                            <section key={stage.id} className="rounded-lg border border-border bg-surface p-3">
                                <div className="mb-3 flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <span className="h-3 w-3 rounded-full" style={{ background: stage.color || "#f97316" }} />
                                        <p className="text-sm font-bold text-text-primary">{stage.name}</p>
                                    </div>
                                    <span className="text-xs font-bold text-text-muted">{stageLeads.length}</span>
                                </div>
                                <div className="grid gap-3">
                                    {stageLeads.map((lead) => (
                                        <div key={lead.id} className="rounded-lg border border-border bg-background p-3">
                                            <div className="flex items-center justify-between gap-2">
                                                <p className="font-bold text-text-primary">{lead.name}</p>
                                                <StatusPill value={lead.temperature} />
                                            </div>
                                            <p className="mt-1 text-xs text-text-secondary">{courses.items.find((course) => course.id === lead.courseId)?.name || "Curso nao definido"}</p>
                                            <p className="text-xs text-text-secondary">{sellers.items.find((seller) => seller.id === lead.salespersonId)?.name || "Sem vendedor"} · {lead.nextAction || "Sem proxima acao"}</p>
                                            <select
                                                className="mt-3 h-9 w-full rounded-lg border border-border bg-surface px-2 text-xs"
                                                value={lead.pipelineStageId || ""}
                                                onChange={(event) => moveLead(lead.id, event.target.value)}
                                            >
                                                {stages.items.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                                            </select>
                                        </div>
                                    ))}
                                </div>
                            </section>
                        );
                    })}
                </div>
            </div>
        </ShellState>
    );
}

export function SchoolLeadsPage() {
    const { token, school, loading, error } = useSchoolShell();
    const leads = useResource<SchoolLead>(school?.id, "leads", token);
    const courses = useResource<Course>(school?.id, "courses", token);
    const sellers = useResource<Salesperson>(school?.id, "salespeople", token);
    const stages = useResource<PipelineStage>(school?.id, "pipeline-stages", token);

    return (
        <ShellState loading={loading} error={error} school={school}>
            <PageHeader icon={GraduationCap} title="Leads" subtitle="Lista operacional de interessados em cursos e matriculas." />
            <Panel title="Leads da escola">
                <CompactList
                    items={leads.items}
                    emptyTitle="Nenhum lead cadastrado"
                    emptyDescription="Leads vindos do WhatsApp e do pipeline aparecerao aqui."
                    render={(lead) => (
                        <div key={lead.id} className="grid gap-3 rounded-lg border border-border bg-background p-4 lg:grid-cols-[1.2fr_1fr_1fr_0.8fr_0.8fr] lg:items-center">
                            <div><p className="font-bold text-text-primary">{lead.name}</p><p className="text-sm text-text-secondary">{lead.phone || "Sem telefone"}</p></div>
                            <p className="text-sm text-text-secondary">{courses.items.find((course) => course.id === lead.courseId)?.name || "Curso nao definido"}</p>
                            <p className="text-sm text-text-secondary">{sellers.items.find((seller) => seller.id === lead.salespersonId)?.name || "Sem vendedor"}</p>
                            <p className="text-sm text-text-secondary">{stages.items.find((stage) => stage.id === lead.pipelineStageId)?.name || "Sem etapa"}</p>
                            <StatusPill value={lead.temperature || lead.status} />
                        </div>
                    )}
                />
            </Panel>
        </ShellState>
    );
}

export function SchoolConversationsPage() {
    const { token, school, loading, error } = useSchoolShell();
    const conversations = useResource<Conversation>(school?.id, "conversations", token);
    const leads = useResource<SchoolLead>(school?.id, "leads", token);
    const sellers = useResource<Salesperson>(school?.id, "salespeople", token);

    return (
        <ShellState loading={loading} error={error} school={school}>
            <PageHeader icon={MessageCircle} title="Conversas" subtitle="Base preparada para conversas do WhatsApp e analise futura da Mel." />
            <Panel title="Conversas">
                <CompactList
                    items={conversations.items}
                    emptyTitle="Nenhuma conversa sincronizada"
                    emptyDescription="Quando o WhatsApp/Evolution alimentar esta camada, as conversas ficarao prontas para analise."
                    render={(conversation) => (
                        <div key={conversation.id} className="rounded-lg border border-border bg-background p-4">
                            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                                <div>
                                    <p className="font-bold text-text-primary">{leads.items.find((lead) => lead.id === conversation.leadId)?.name || "Lead nao vinculado"}</p>
                                    <p className="text-sm text-text-secondary">{sellers.items.find((seller) => seller.id === conversation.salespersonId)?.name || "Sem vendedor"} · {conversation.origin}</p>
                                </div>
                                <button className="inline-flex h-9 items-center gap-2 rounded-lg border border-border px-3 text-sm font-bold text-text-primary">
                                    <Bot size={16} />
                                    Analisar com Mel
                                </button>
                            </div>
                            <p className="mt-3 text-sm text-text-secondary">{conversation.lastMessage || "Sem ultima mensagem"}</p>
                            <p className="mt-1 text-xs text-text-muted">{formatDate(conversation.lastMessageAt)}</p>
                        </div>
                    )}
                />
            </Panel>
        </ShellState>
    );
}

export function SchoolTasksPage() {
    const { token, school, loading, error } = useSchoolShell();
    const tasks = useResource<SchoolTask>(school?.id, "tasks", token);
    const leads = useResource<SchoolLead>(school?.id, "leads", token);
    const sellers = useResource<Salesperson>(school?.id, "salespeople", token);

    const create = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        await tasks.create(normalizeForm(event.currentTarget));
        event.currentTarget.reset();
    };

    return (
        <ShellState loading={loading} error={error} school={school}>
            <PageHeader icon={CalendarClock} title="Tarefas e Follow-ups" subtitle="Controle manual e base futura para comandos da Mel e da Lou." />
            <div className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
                <Panel title="Nova tarefa">
                    <form onSubmit={create} className="grid gap-3">
                        <TextField name="title" label="Tarefa" required />
                        <div className="grid gap-3 md:grid-cols-2">
                            <SelectField name="leadId" label="Lead"><option value="">Sem lead</option>{leads.items.map((lead) => <option key={lead.id} value={lead.id}>{lead.name}</option>)}</SelectField>
                            <SelectField name="salespersonId" label="Responsavel"><option value="">Sem vendedor</option>{sellers.items.map((seller) => <option key={seller.id} value={seller.id}>{seller.name}</option>)}</SelectField>
                            <TextField name="dueAt" label="Prazo" type="datetime-local" required />
                            <SelectField name="priority" label="Prioridade"><option value="media">Media</option><option value="alta">Alta</option><option value="critica">Critica</option><option value="baixa">Baixa</option></SelectField>
                            <SelectField name="type" label="Tipo"><option value="follow-up">Follow-up</option><option value="ligacao">Ligacao</option><option value="mensagem">Mensagem</option><option value="validacao">Validacao</option><option value="cobranca_interna">Cobranca interna</option></SelectField>
                            <SelectField name="origin" label="Origem"><option value="manual">Manual</option><option value="Mel">Mel</option><option value="Lou">Lou</option><option value="sistema">Sistema</option></SelectField>
                        </div>
                        <TextField name="description" label="Descricao" />
                        <SubmitButton />
                    </form>
                </Panel>
                <Panel title="Agenda de follow-ups">
                    <CompactList
                        items={tasks.items}
                        emptyTitle="Nenhuma tarefa criada"
                        emptyDescription="Crie follow-ups para evitar leads quentes parados."
                        render={(task) => (
                            <div key={task.id} className="rounded-lg border border-border bg-background p-4">
                                <div className="flex items-center justify-between gap-2">
                                    <p className="font-bold text-text-primary">{task.title}</p>
                                    <StatusPill value={task.priority} />
                                </div>
                                <p className="mt-1 text-sm text-text-secondary">{formatDate(task.dueAt)} · {task.type} · origem {task.origin}</p>
                            </div>
                        )}
                    />
                </Panel>
            </div>
        </ShellState>
    );
}

export function SchoolAlertsPage() {
    const { token, school, loading, error } = useSchoolShell();
    const alerts = useResource<SchoolAlert>(school?.id, "alerts", token);

    const create = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        await alerts.create(normalizeForm(event.currentTarget));
        event.currentTarget.reset();
    };

    return (
        <ShellState loading={loading} error={error} school={school}>
            <PageHeader icon={AlertTriangle} title="Alertas" subtitle="Riscos operacionais, comerciais e financeiros monitorados para a escola." />
            <div className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
                <Panel title="Novo alerta">
                    <form onSubmit={create} className="grid gap-3">
                        <TextField name="title" label="Titulo" required />
                        <SelectField name="type" label="Tipo">
                            <option value="lead_sem_resposta">Lead sem resposta</option>
                            <option value="followup_atrasado">Follow-up atrasado</option>
                            <option value="lead_quente_parado">Lead quente parado</option>
                            <option value="dados_bancarios_divergentes">Dados bancarios divergentes</option>
                            <option value="preco_fora_da_regra">Preco fora da regra</option>
                            <option value="vendedor_fora_do_playbook">Vendedor fora do playbook</option>
                            <option value="meta_em_risco">Meta em risco</option>
                            <option value="campanha_com_baixa_entrega">Campanha com baixa entrega</option>
                            <option value="comprovante_recebido">Comprovante recebido</option>
                            <option value="conversa_com_risco_alto">Conversa com risco alto</option>
                        </SelectField>
                        <SelectField name="priority" label="Prioridade"><option value="media">Media</option><option value="alta">Alta</option><option value="critica">Critica</option><option value="baixa">Baixa</option></SelectField>
                        <TextField name="description" label="Descricao" />
                        <TextField name="recommendation" label="Recomendacao" />
                        <SubmitButton />
                    </form>
                </Panel>
                <Panel title="Alertas operacionais">
                    <CompactList
                        items={alerts.items}
                        emptyTitle="Nenhum alerta"
                        emptyDescription="A Mel destacara riscos quando houver dados suficientes."
                        render={(alert) => (
                            <div key={alert.id} className="rounded-lg border border-border bg-background p-4">
                                <div className="flex items-center justify-between gap-2">
                                    <p className="font-bold text-text-primary">{alert.title}</p>
                                    <StatusPill value={alert.priority} />
                                </div>
                                <p className="mt-1 text-sm text-text-secondary">{alert.recommendation || alert.description || alert.type}</p>
                            </div>
                        )}
                    />
                </Panel>
            </div>
        </ShellState>
    );
}

export function SchoolGoalsPage() {
    const { token, school, loading, error } = useSchoolShell();
    const goals = useResource<SchoolGoal>(school?.id, "goals", token);
    const courses = useResource<Course>(school?.id, "courses", token);
    const sellers = useResource<Salesperson>(school?.id, "salespeople", token);

    const create = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        await goals.create(normalizeForm(event.currentTarget));
        event.currentTarget.reset();
    };

    return (
        <ShellState loading={loading} error={error} school={school}>
            <PageHeader icon={Target} title="Metas" subtitle="Faturamento, matriculas, ticket medio, conversao e marketing previsto." />
            <div className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
                <Panel title="Nova meta mensal">
                    <form onSubmit={create} className="grid gap-3">
                        <TextField name="month" label="Mes" type="month" required />
                        <div className="grid gap-3 md:grid-cols-2">
                            <TextField name="revenueGoal" label="Meta de faturamento" type="number" />
                            <TextField name="enrollmentGoal" label="Meta de matriculas" type="number" />
                            <TextField name="averageTicket" label="Ticket medio esperado" type="number" />
                            <TextField name="expectedConversionRate" label="Taxa de conversao esperada (%)" type="number" />
                            <TextField name="marketingInvestment" label="Investimento previsto em marketing" type="number" />
                            <SelectField name="courseId" label="Curso"><option value="">Meta geral</option>{courses.items.map((course) => <option key={course.id} value={course.id}>{course.name}</option>)}</SelectField>
                            <SelectField name="salespersonId" label="Vendedor"><option value="">Time todo</option>{sellers.items.map((seller) => <option key={seller.id} value={seller.id}>{seller.name}</option>)}</SelectField>
                        </div>
                        <SubmitButton />
                    </form>
                </Panel>
                <Panel title="Metas configuradas">
                    <CompactList
                        items={goals.items}
                        emptyTitle="Nenhuma meta configurada"
                        emptyDescription="As metas alimentam os alertas de risco e a Central da Mel."
                        render={(goal) => (
                            <div key={goal.id} className="rounded-lg border border-border bg-background p-4">
                                <div className="flex items-center justify-between gap-2">
                                    <p className="font-bold text-text-primary">{goal.month}</p>
                                    <StatusPill value={goal.status} />
                                </div>
                                <p className="mt-1 text-sm text-text-secondary">{formatMoney(goal.revenueGoal)} · {goal.enrollmentGoal} matriculas · ticket {formatMoney(goal.averageTicket)}</p>
                            </div>
                        )}
                    />
                </Panel>
            </div>
        </ShellState>
    );
}

export function SchoolSettingsPage() {
    const { token, school, loading, error, reloadSchool } = useSchoolShell();

    const saveSchool = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!token || !school?.id) return;
        await schoolsApi.updateSchool(token, school.id, normalizeForm(event.currentTarget));
        await reloadSchool();
    };

    return (
        <ShellState loading={loading} error={error} school={school}>
            <PageHeader icon={Settings} title="Configuracoes da Escola" subtitle="Dados da escola, permissoes, integracoes, pipeline, agentes e preferencias." />
            <div className="grid gap-5 lg:grid-cols-[1fr_0.8fr]">
                <Panel title="Dados da escola">
                    <form onSubmit={saveSchool} className="grid gap-3">
                        <TextField name="name" label="Nome da escola" required />
                        <div className="grid gap-3 md:grid-cols-2">
                            <TextField name="document" label="CNPJ/CPF" />
                            <TextField name="phone" label="Telefone" />
                            <TextField name="email" label="E-mail" type="email" />
                            <TextField name="city" label="Cidade" />
                            <TextField name="state" label="Estado" />
                            <SelectField name="status" label="Status"><option value="active">Ativa</option><option value="inactive">Inativa</option></SelectField>
                        </div>
                        <SubmitButton />
                    </form>
                </Panel>
                <Panel title="Agentes preparados">
                    <div className="grid gap-3">
                        {[
                            ["Mel", "Governanca comercial", "Analisa pipeline, conversas, follow-up, metas e riscos."],
                            ["Lou", "Execucao comercial", "Futura camada para tarefas, notificacoes e sugestoes de mensagem."],
                            ["Liz", "Marketing", "Futura leitura de origens, campanhas, CPL e qualidade dos leads."],
                        ].map(([name, role, description]) => (
                            <div key={name} className="rounded-lg border border-border bg-background p-3">
                                <p className="font-bold text-text-primary">{name}</p>
                                <p className="text-sm font-semibold text-primary">{role}</p>
                                <p className="mt-1 text-sm text-text-secondary">{description}</p>
                            </div>
                        ))}
                    </div>
                </Panel>
            </div>
        </ShellState>
    );
}
