import { createFileRoute } from "@tanstack/react-router";
import { Card, CardHeader, Button, PageHeader, MelAvatar, Badge } from "@/components/ui/kit";

export const Route = createFileRoute("/_dashboard/metas")({ component: MetasPage });

function MetasPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Metas" description="Defina metas mensais por escola, curso e vendedor. A Mel calcula o esforço necessário."
        actions={<Button variant="primary">Salvar metas</Button>}
      />

      <div className="grid lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader title="Metas mensais" />
          <div className="p-5 grid sm:grid-cols-2 gap-4">
            <Field l="Meta de faturamento" v="R$ 120.000" />
            <Field l="Meta de matrículas" v="100" />
            <Field l="Ticket médio esperado" v="R$ 1.200" />
            <Field l="Taxa de conversão esperada" v="8%" />
            <Field l="Volume de leads necessário" v="1.250" />
            <Field l="Investimento previsto em marketing" v="R$ 8.000" />
          </div>
        </Card>

        <Card className="p-5 bg-gradient-to-br from-[var(--mel)]/10 to-primary/5">
          <div className="flex items-center gap-2 mb-3"><MelAvatar size={32} /><div className="font-display font-semibold">A Mel calculou</div></div>
          <p className="text-sm leading-relaxed">
            Para bater a meta de <strong>R$ 120.000</strong>, com ticket médio de <strong>R$ 1.200</strong> e conversão de <strong>8%</strong>,
            a escola precisa gerar aproximadamente <strong>1.250 leads no mês</strong>.
          </p>
          <Badge tone="mel">Ritmo necessário: ~42 leads/dia</Badge>
        </Card>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <CardHeader title="Metas por curso" />
          <div className="p-5 space-y-2">
            {["Operador de Máquinas Pesadas","Bombeiro Civil","Auxiliar Administrativo","Estética Profissional","Segurança do Trabalho","Cuidador de Idosos"].map((c, i) => (
              <div key={c} className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/40">
                <div className="text-sm">{c}</div>
                <input defaultValue={String(20 - i * 2)} className="w-20 rounded-md border border-input bg-card px-2 py-1 text-sm text-right" />
              </div>
            ))}
          </div>
        </Card>
        <Card>
          <CardHeader title="Metas por vendedor" />
          <div className="p-5 space-y-2">
            {["Ana Souza","Carlos Lima","Fernanda Alves","Diego Martins"].map((v, i) => (
              <div key={v} className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/40">
                <div className="text-sm">{v}</div>
                <input defaultValue={`R$ ${(25 - i * 4) * 1000}`} className="w-32 rounded-md border border-input bg-card px-2 py-1 text-sm text-right" />
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

function Field({ l, v }: { l: string; v: string }) {
  return (
    <label className="block text-sm">
      <span className="text-foreground/80">{l}</span>
      <input defaultValue={v} className="mt-1 w-full rounded-lg border border-input bg-card px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring/30" />
    </label>
  );
}
