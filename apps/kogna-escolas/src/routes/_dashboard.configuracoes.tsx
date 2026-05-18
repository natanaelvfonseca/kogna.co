import { createFileRoute } from "@tanstack/react-router";
import { MessageSquare, CreditCard, Brain, Webhook, Shield, Bell, Users, Crown } from "lucide-react";
import { Card, Badge, Button, PageHeader } from "@/components/ui/kit";

export const Route = createFileRoute("/_dashboard/configuracoes")({ component: ConfiguracoesPage });

const integracoes = [
  { nome: "WhatsApp · Evolution API", desc: "Recebe e envia mensagens da operação comercial.", status: "Pronto para conectar", icon: MessageSquare },
  { nome: "Mercado Pago", desc: "Validação de comprovantes e geração de links de pagamento.", status: "Pronto para conectar", icon: CreditCard },
  { nome: "OpenAI", desc: "Modelos de linguagem usados pela Mel, Lou e Liz.", status: "Em breve", icon: Brain },
  { nome: "Webhooks personalizados", desc: "Disparos para CRMs e ERPs externos.", status: "Em breve", icon: Webhook },
];

function ConfiguracoesPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Configurações da Escola" description="Dados, integrações, usuários, agentes de IA e plano." />

      <div className="grid lg:grid-cols-3 gap-6">
        <Card className="p-5 lg:col-span-2">
          <div className="font-display font-semibold mb-4">Dados da escola</div>
          <div className="grid sm:grid-cols-2 gap-4 text-sm">
            <F l="Nome" v="Escola Progresso Profissional" />
            <F l="CNPJ" v="00.000.000/0001-00" />
            <F l="Cidade" v="Goiânia — GO" />
            <F l="Unidade" v="Unidade Centro" />
            <F l="E-mail" v="contato@escolaprogresso.com.br" />
            <F l="Responsável" v="Patrícia Mendes" />
          </div>
        </Card>

        <Card className="p-5 bg-gradient-to-br from-primary/10 to-transparent">
          <div className="flex items-center gap-2"><Crown className="h-4 w-4 text-primary" /><div className="font-display font-semibold">Plano</div></div>
          <div className="mt-3 font-display text-2xl font-bold">Kogna Pro</div>
          <div className="text-xs text-muted-foreground">3 agentes · até 5.000 conversas/mês</div>
          <div className="mt-4 text-sm">Próxima cobrança: <strong>12 jun 2026</strong></div>
          <Button variant="primary" size="sm" className="mt-4 w-full">Gerenciar plano</Button>
        </Card>
      </div>

      <Card className="p-5">
        <div className="font-display font-semibold mb-4">Integrações</div>
        <div className="grid md:grid-cols-2 gap-3">
          {integracoes.map((i) => (
            <div key={i.nome} className="flex items-center gap-3 p-3 rounded-xl border border-border">
              <div className="h-10 w-10 rounded-xl bg-secondary grid place-items-center"><i.icon className="h-5 w-5 text-foreground/70" /></div>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm">{i.nome}</div>
                <div className="text-xs text-muted-foreground">{i.desc}</div>
              </div>
              <Badge tone={i.status === "Em breve" ? "muted" : "info"}>{i.status}</Badge>
            </div>
          ))}
        </div>
      </Card>

      <div className="grid md:grid-cols-3 gap-6">
        <Card className="p-5">
          <div className="flex items-center gap-2 mb-3"><Users className="h-4 w-4" /><div className="font-display font-semibold">Usuários e permissões</div></div>
          <div className="text-sm text-muted-foreground">5 usuários ativos. Gestores, vendedores e financeiro.</div>
          <Button variant="secondary" size="sm" className="mt-3">Gerenciar</Button>
        </Card>
        <Card className="p-5">
          <div className="flex items-center gap-2 mb-3"><Bell className="h-4 w-4" /><div className="font-display font-semibold">Notificações</div></div>
          <div className="text-sm text-muted-foreground">Alertas por e-mail, push e WhatsApp.</div>
          <Button variant="secondary" size="sm" className="mt-3">Configurar</Button>
        </Card>
        <Card className="p-5">
          <div className="flex items-center gap-2 mb-3"><Shield className="h-4 w-4" /><div className="font-display font-semibold">Segurança</div></div>
          <div className="text-sm text-muted-foreground">Autenticação em 2 fatores recomendada.</div>
          <Button variant="secondary" size="sm" className="mt-3">Ativar 2FA</Button>
        </Card>
      </div>
    </div>
  );
}

function F({ l, v }: { l: string; v: string }) {
  return (
    <label className="block">
      <span className="text-foreground/80">{l}</span>
      <input defaultValue={v} className="mt-1 w-full rounded-lg border border-input bg-card px-3 py-2 outline-none focus:ring-2 focus:ring-ring/30" />
    </label>
  );
}
