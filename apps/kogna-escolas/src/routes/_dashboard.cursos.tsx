import { createFileRoute } from "@tanstack/react-router";
import { Card, Badge, Button, PageHeader } from "@/components/ui/kit";
import { cursos } from "@/lib/mock-data";

export const Route = createFileRoute("/_dashboard/cursos")({ component: CursosPage });

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

function CursosPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Cursos e Ofertas"
        description="Cursos profissionalizantes oferecidos pela escola, com preço, condições e vagas."
        actions={<Button variant="primary">+ Novo curso</Button>}
      />

      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
        {cursos.map((c) => (
          <Card key={c.id} className="p-5">
            <div className="flex items-start justify-between gap-2">
              <div>
                <Badge tone="muted">{c.categoria}</Badge>
                <div className="font-display font-semibold text-lg mt-2">{c.nome}</div>
                <div className="text-xs text-muted-foreground">{c.modalidade} · {c.duracao}</div>
              </div>
              <Badge tone={c.vagas <= 5 ? "danger" : c.vagas <= 10 ? "warning" : "success"}>{c.vagas} vagas</Badge>
            </div>

            <div className="mt-4 grid grid-cols-3 gap-2 text-sm">
              <Mini k="Total" v={brl(c.precoTotal)} />
              <Mini k="Matrícula" v={brl(c.matricula)} />
              <Mini k="Mensalidade" v={brl(c.mensalidade)} />
            </div>

            <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
              <span>{c.turma}</span>
              <span>Desconto até {c.descontoPermitido}%</span>
            </div>

            <Button variant="secondary" size="sm" className="w-full mt-4">Editar oferta</Button>
          </Card>
        ))}
      </div>
    </div>
  );
}
function Mini({ k, v }: { k: string; v: string }) {
  return <div className="rounded-lg bg-secondary/60 p-2"><div className="text-[10px] uppercase tracking-wider text-muted-foreground">{k}</div><div className="font-semibold text-sm">{v}</div></div>;
}
