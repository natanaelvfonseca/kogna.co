import { createFileRoute } from "@tanstack/react-router";
import { Bot, Sparkles, Check, X, Edit3 } from "lucide-react";
import { Card, Badge, Button, PageHeader, MelAvatar } from "@/components/ui/kit";
import { comandosLou } from "@/lib/mock-data";
import { toast } from "sonner";

export const Route = createFileRoute("/_dashboard/lou")({ component: LouPage });

function LouPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Lou · Comandos"
        description="A Lou recebe ordens da Mel e prepara ações comerciais. Você aprova antes de qualquer execução."
      />

      <Card className="p-5 bg-gradient-to-br from-[var(--lou)]/10 to-transparent">
        <div className="flex items-start gap-4">
          <div className="h-12 w-12 rounded-full grid place-items-center text-white font-display font-bold text-xl shadow-soft" style={{ background: "var(--lou)" }}>L</div>
          <div className="flex-1">
            <Badge tone="lou"><Bot className="h-3 w-3" /> Lou · Comercial Executora</Badge>
            <p className="text-sm mt-2 leading-relaxed">
              Tenho <strong>{comandosLou.filter(c => c.status === "pendente").length} comandos pendentes</strong> da Mel.
              Posso notificar vendedores, criar tarefas, sugerir mensagens e cobrar follow-ups. Tudo passa pela sua aprovação.
            </p>
          </div>
        </div>
      </Card>

      <div className="space-y-3">
        {comandosLou.map((c) => (
          <Card key={c.id} className="p-5">
            <div className="flex items-start gap-4">
              <MelAvatar size={36} />
              <div className="text-muted-foreground text-xs pt-2">→</div>
              <div className="h-9 w-9 rounded-full grid place-items-center text-white font-bold text-xs shrink-0" style={{ background: "var(--lou)" }}>Lou</div>
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="mel"><Sparkles className="h-3 w-3" /> Mel solicita</Badge>
                  <Badge tone="muted">{c.tipo}</Badge>
                  <Badge tone={c.prioridade === "critica" ? "danger" : c.prioridade === "alta" ? "warning" : "info"}>{c.prioridade}</Badge>
                  <Badge tone={c.status === "aprovado" ? "success" : c.status === "ignorado" ? "muted" : "primary"}>{c.status}</Badge>
                  <span className="text-xs text-muted-foreground ml-auto">{c.criadoEm}</span>
                </div>
                <div className="mt-3 text-sm">Destino: <strong>{c.destino}</strong></div>
                <div className="mt-2 rounded-xl border border-border bg-secondary/40 p-3 text-sm italic text-foreground/90">
                  "{c.mensagemSugerida}"
                </div>
                {c.status === "pendente" && (
                  <div className="mt-3 flex flex-wrap gap-2 justify-end">
                    <Button variant="ghost" size="sm" onClick={() => toast("Comando ignorado")}><X className="h-3 w-3" /> Ignorar</Button>
                    <Button variant="secondary" size="sm"><Edit3 className="h-3 w-3" /> Editar</Button>
                    <Button variant="primary" size="sm" onClick={() => toast.success("Comando aprovado · Lou irá executar")}><Check className="h-3 w-3" /> Aprovar</Button>
                  </div>
                )}
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
