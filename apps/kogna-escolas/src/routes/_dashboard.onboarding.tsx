import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Check, ChevronLeft, ChevronRight, Sparkles, Save } from "lucide-react";
import { Card, Badge, Button, ProgressBar, MelAvatar } from "@/components/ui/kit";

export const Route = createFileRoute("/_dashboard/onboarding")({ component: Onboarding });

const steps = [
  { id: 1, t: "Dados da escola", melMsg: "Antes de analisar sua operação, preciso conhecer sua escola." },
  { id: 2, t: "Cursos principais", melMsg: "Agora me diga quais cursos vocês mais vendem." },
  { id: 3, t: "Ofertas e preços", melMsg: "Quanto custa cada curso? Vou usar isso para validar o que o time envia." },
  { id: 4, t: "Dados financeiros oficiais", melMsg: "Esses dados serão usados para eu validar se o time está enviando informações corretas aos alunos." },
  { id: 5, t: "Equipe comercial", melMsg: "Quem são as pessoas que conversam com os leads?" },
  { id: 6, t: "Pipeline comercial", melMsg: "Vamos definir como sua escola conduz uma venda." },
  { id: 7, t: "Metas", melMsg: "Qual o objetivo do mês? Vou calcular o esforço necessário." },
  { id: 8, t: "Conexão WhatsApp", melMsg: "Conecte o WhatsApp para eu analisar as conversas." },
  { id: 9, t: "Revisão final", melMsg: "Tudo certo? Posso ativar o monitoramento da operação." },
];

function Onboarding() {
  const [step, setStep] = useState(1);
  const navigate = useNavigate();
  const progresso = Math.round((step / steps.length) * 100);
  const current = steps[step - 1];

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="grid md:grid-cols-[1fr_2fr] gap-6">
        {/* Mel guide */}
        <Card className="p-6 bg-gradient-to-br from-[var(--mel)]/10 to-primary/5">
          <div className="flex items-center gap-3 mb-4">
            <MelAvatar size={48} />
            <div>
              <Badge tone="mel"><Sparkles className="h-3 w-3" /> Mel</Badge>
              <div className="font-display font-semibold mt-1">Sua copilota</div>
            </div>
          </div>
          <p className="text-sm leading-relaxed">{current.melMsg}</p>
          <div className="mt-6 text-xs uppercase tracking-widest text-muted-foreground">Progresso da configuração</div>
          <div className="mt-2"><ProgressBar value={progresso} tone="primary" /></div>
          <div className="mt-1 text-xs text-muted-foreground">{progresso}% concluído · etapa {step} de {steps.length}</div>

          <ul className="mt-6 space-y-2">
            {steps.map((s) => (
              <li key={s.id} className="flex items-center gap-2 text-sm">
                <span className={`h-5 w-5 rounded-full grid place-items-center text-[10px] font-bold ${s.id < step ? "bg-[var(--success)] text-white" : s.id === step ? "bg-primary text-white" : "bg-secondary text-muted-foreground"}`}>
                  {s.id < step ? <Check className="h-3 w-3" /> : s.id}
                </span>
                <span className={s.id === step ? "font-semibold" : "text-muted-foreground"}>{s.t}</span>
              </li>
            ))}
          </ul>
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-display text-xl font-semibold">{current.t}</h3>
            <Badge tone="muted">Etapa {step}/{steps.length}</Badge>
          </div>

          <StepContent step={step} />

          <div className="mt-8 flex items-center justify-between">
            <Button variant="ghost" size="sm" onClick={() => setStep((s) => Math.max(1, s - 1))} disabled={step === 1}>
              <ChevronLeft className="h-4 w-4" /> Voltar
            </Button>
            <div className="flex gap-2">
              <Button variant="secondary" size="sm"><Save className="h-4 w-4" /> Salvar e continuar depois</Button>
              {step < steps.length ? (
                <Button variant="primary" size="sm" onClick={() => setStep((s) => s + 1)}>Próximo <ChevronRight className="h-4 w-4" /></Button>
              ) : (
                <Button variant="mel" size="sm" onClick={() => navigate({ to: "/central" })}>Ativar monitoramento da Mel <Sparkles className="h-4 w-4" /></Button>
              )}
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

function Field({ label, ph, type = "text" }: { label: string; ph?: string; type?: string }) {
  return (
    <label className="block text-sm">
      <span className="text-foreground/80">{label}</span>
      <input type={type} placeholder={ph} className="mt-1 w-full rounded-lg border border-input bg-card px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring/30" />
    </label>
  );
}

function StepContent({ step }: { step: number }) {
  switch (step) {
    case 1: return (
      <div className="grid sm:grid-cols-2 gap-4">
        <Field label="Nome da escola" ph="Escola Progresso Profissional" />
        <Field label="Cidade" ph="Goiânia — GO" />
        <Field label="Unidade" ph="Unidade Centro" />
        <Field label="Telefone" ph="(62) 9 9999-9999" />
        <Field label="Site" ph="www.escolaprogresso.com.br" />
        <Field label="Responsável" ph="Patrícia Mendes" />
      </div>
    );
    case 2: return (
      <div className="space-y-3">
        {["Operador de Máquinas Pesadas","Bombeiro Civil","Auxiliar Administrativo"].map((c) => (
          <div key={c} className="grid sm:grid-cols-5 gap-2 p-3 rounded-lg border border-border">
            <div className="sm:col-span-2 text-sm font-medium self-center">{c}</div>
            <input defaultValue="Profissionalizante" className="rounded-md border border-input bg-card px-2 py-1.5 text-xs" />
            <input defaultValue="Presencial" className="rounded-md border border-input bg-card px-2 py-1.5 text-xs" />
            <input defaultValue="3 meses" className="rounded-md border border-input bg-card px-2 py-1.5 text-xs" />
          </div>
        ))}
        <Button variant="secondary" size="sm">+ Adicionar curso</Button>
      </div>
    );
    case 3: return (
      <div className="grid sm:grid-cols-2 gap-4">
        <Field label="Curso" ph="Bombeiro Civil" />
        <Field label="Preço total" ph="R$ 1.800" />
        <Field label="Taxa de matrícula" ph="R$ 150" />
        <Field label="Mensalidade" ph="R$ 420" />
        <Field label="Desconto permitido" ph="12%" />
        <Field label="Condição especial" ph="3% à vista" />
      </div>
    );
    case 4: return (
      <div className="space-y-4">
        <div className="rounded-lg border border-[var(--warning)]/40 bg-[var(--warning)]/10 p-3 text-xs">
          <strong>Importante:</strong> A Mel usará estes dados para identificar divergências nas conversas comerciais.
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Chave Pix oficial" ph="cnpj@escola.com.br" />
          <Field label="Banco" ph="Banco do Brasil" />
          <Field label="Agência" ph="1234" />
          <Field label="Conta" ph="56789-0" />
          <Field label="Titular" ph="Escola Progresso LTDA" />
          <Field label="CNPJ" ph="00.000.000/0001-00" />
          <Field label="Link de pagamento oficial" ph="https://mpago.li/..." />
        </div>
      </div>
    );
    case 5: return (
      <div className="space-y-3">
        {["Ana Souza","Carlos Lima","Fernanda Alves","Diego Martins"].map((v) => (
          <div key={v} className="grid sm:grid-cols-5 gap-2 p-3 rounded-lg border border-border items-center">
            <div className="text-sm font-medium">{v}</div>
            <input placeholder="WhatsApp" className="rounded-md border border-input bg-card px-2 py-1.5 text-xs" />
            <input placeholder="E-mail" className="rounded-md border border-input bg-card px-2 py-1.5 text-xs" />
            <input placeholder="Meta R$" className="rounded-md border border-input bg-card px-2 py-1.5 text-xs" />
            <Badge tone="success">Ativo</Badge>
          </div>
        ))}
      </div>
    );
    case 6: return (
      <div className="space-y-3">
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium">Usar pipeline padrão da Kogna</div>
              <div className="text-xs text-muted-foreground">14 etapas validadas em centenas de escolas profissionalizantes</div>
            </div>
            <Badge tone="success">Recomendado</Badge>
          </div>
        </Card>
        <Card className="p-4">
          <div className="font-medium">Personalizar etapas</div>
          <div className="text-xs text-muted-foreground">Defina seu próprio fluxo comercial.</div>
        </Card>
      </div>
    );
    case 7: return (
      <div className="grid sm:grid-cols-2 gap-4">
        <Field label="Meta mensal de matrículas" ph="100" />
        <Field label="Meta mensal de faturamento" ph="R$ 120.000" />
        <Field label="Ticket médio esperado" ph="R$ 1.200" />
        <Field label="Taxa de conversão esperada" ph="8%" />
      </div>
    );
    case 8: return (
      <Card className="p-6 text-center bg-gradient-to-br from-[var(--success)]/10 to-transparent">
        <div className="mx-auto h-14 w-14 rounded-2xl bg-[var(--success)]/15 grid place-items-center mb-3">
          <span className="text-2xl">💬</span>
        </div>
        <div className="font-display font-semibold">Conectar WhatsApp via Evolution API</div>
        <div className="text-sm text-muted-foreground mt-1">Status: <span className="font-medium text-foreground">Pronto para conectar</span></div>
        <div className="mt-4 flex justify-center gap-2">
          <Button variant="primary">Conectar agora</Button>
          <Button variant="secondary">Conectar depois</Button>
        </div>
      </Card>
    );
    default: return (
      <div className="space-y-3">
        <div className="text-sm text-muted-foreground">Revise rapidamente a configuração:</div>
        {[
          ["Escola","Escola Progresso Profissional"],
          ["Cursos cadastrados","6"],
          ["Equipe comercial","4 vendedores"],
          ["Pipeline","Padrão Kogna (14 etapas)"],
          ["Meta mensal","R$ 120.000 · 100 matrículas"],
          ["WhatsApp","Conectar depois"],
        ].map(([k, v]) => (
          <div key={k} className="flex items-center justify-between border-b border-border pb-2 text-sm">
            <span className="text-muted-foreground">{k}</span>
            <span className="font-medium">{v}</span>
          </div>
        ))}
      </div>
    );
  }
}
