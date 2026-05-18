import { createFileRoute } from "@tanstack/react-router";
import { Lock, Plus, ShieldAlert } from "lucide-react";
import { Card, Badge, Button, PageHeader } from "@/components/ui/kit";

export const Route = createFileRoute("/_dashboard/financeiros")({ component: FinanceirosPage });

const dados = [
  { tipo: "Pix", chave: "00.000.000/0001-00", banco: "Banco do Brasil", titular: "Escola Progresso LTDA", status: "ativo" },
  { tipo: "Conta bancária", chave: "Ag 1234 · CC 56789-0", banco: "Banco do Brasil", titular: "Escola Progresso LTDA", status: "ativo" },
  { tipo: "Link de pagamento", chave: "mpago.li/escolaprogresso", banco: "Mercado Pago", titular: "Escola Progresso LTDA", status: "ativo" },
];

function FinanceirosPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Dados Financeiros Oficiais"
        description="Dados oficiais que a Mel usa para validar se o time comercial está enviando informações corretas aos alunos."
        actions={<Button variant="primary"><Plus className="h-4 w-4" /> Cadastrar dado oficial</Button>}
      />

      <Card className="p-4 bg-[var(--warning)]/10 border-[var(--warning)]/30">
        <div className="flex gap-3 items-start">
          <ShieldAlert className="h-5 w-5 text-[oklch(0.45_0.12_60)] mt-0.5" />
          <div className="text-sm">
            <strong>Sensível.</strong> A Mel usará estes dados para identificar divergências nas conversas comerciais. Qualquer chave Pix, banco ou link enviado pelos vendedores será comparado com o que está aqui.
          </div>
        </div>
      </Card>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {dados.map((d) => (
          <Card key={d.chave} className="p-5">
            <div className="flex items-center justify-between">
              <Badge tone="primary">{d.tipo}</Badge>
              <Badge tone="success">{d.status}</Badge>
            </div>
            <div className="mt-3 font-display font-semibold break-words">{d.chave}</div>
            <div className="text-xs text-muted-foreground mt-1">{d.banco}</div>
            <div className="text-xs text-muted-foreground">Titular: {d.titular}</div>
            <div className="mt-4 flex items-center gap-2">
              <Button variant="secondary" size="sm">Editar</Button>
              <Button variant="ghost" size="sm"><Lock className="h-3 w-3" /> Bloquear</Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
