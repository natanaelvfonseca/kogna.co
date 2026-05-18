import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Sparkles, X, CheckCircle2, AlertTriangle } from "lucide-react";
import { Card, Badge, Button, PageHeader, MelAvatar } from "@/components/ui/kit";
import { conversas } from "@/lib/mock-data";
import type { Conversa, Prioridade } from "@/types";

export const Route = createFileRoute("/_dashboard/conversas")({ component: ConversasPage });

const riscoTone: Record<Prioridade, "info" | "warning" | "danger"> = {
  baixa: "info", media: "warning", alta: "warning", critica: "danger",
};

function ConversasPage() {
  const [sel, setSel] = useState<Conversa | null>(null);

  return (
    <div className="space-y-6">
      <PageHeader title="Conversas Analisadas" description="A Mel analisa cada conversa do WhatsApp e identifica risco, etapa e próxima ação." />

      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
        {conversas.map((c) => (
          <Card key={c.id} className="p-5 hover:border-primary/40 transition cursor-pointer" onClick={() => setSel(c)}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="font-display font-semibold">{c.lead}</div>
                <div className="text-xs text-muted-foreground">{c.vendedor} · {c.curso}</div>
              </div>
              <Badge tone={riscoTone[c.risco]}>Risco {c.risco}</Badge>
            </div>
            <div className="mt-3 text-sm text-muted-foreground line-clamp-2">"{c.ultimaMensagem}"</div>
            <div className="mt-4 flex items-center justify-between">
              <Badge tone="muted">{c.etapaDetectada}</Badge>
              <div className="flex items-center gap-2 text-xs">
                <span className="text-muted-foreground">Score</span>
                <span className="font-bold text-primary text-base">{c.scoreConversa}</span>
              </div>
            </div>
            <Button variant="secondary" size="sm" className="w-full mt-4">
              <Sparkles className="h-3 w-3" /> Ver análise da Mel
            </Button>
          </Card>
        ))}
      </div>

      {sel && <ConversaDetail c={sel} onClose={() => setSel(null)} />}
    </div>
  );
}

function ConversaDetail({ c, onClose }: { c: Conversa; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-40 bg-black/40 p-4 grid place-items-center" onClick={onClose}>
      <Card className="w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-border">
          <div>
            <div className="font-display text-lg font-semibold">{c.lead}</div>
            <div className="text-xs text-muted-foreground">{c.vendedor} · {c.curso}</div>
          </div>
          <button onClick={onClose} className="p-2 rounded-md hover:bg-muted"><X className="h-4 w-4" /></button>
        </div>
        <div className="grid md:grid-cols-2 flex-1 overflow-hidden">
          {/* Chat */}
          <div className="bg-[oklch(0.96_0.01_140)] p-5 overflow-y-auto scrollbar-thin space-y-3">
            {c.mensagens.map((m, i) => (
              <div key={i} className={`flex ${m.autor === "vendedor" ? "justify-end" : ""}`}>
                <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm shadow-soft ${m.autor === "vendedor" ? "bg-[oklch(0.85_0.12_150)] text-foreground rounded-tr-sm" : "bg-white rounded-tl-sm"}`}>
                  <div>{m.texto}</div>
                  <div className="text-[10px] text-muted-foreground text-right mt-0.5">{m.hora}</div>
                </div>
              </div>
            ))}
          </div>
          {/* Análise */}
          <div className="overflow-y-auto scrollbar-thin p-5 space-y-4 border-l border-border">
            <div className="flex items-center gap-2"><MelAvatar size={32} /><div className="font-display font-semibold">Análise da Mel</div></div>
            <p className="text-sm leading-relaxed">{c.analiseMel.resumo}</p>

            <div className="grid grid-cols-2 gap-3">
              <Info k="Etapa detectada" v={c.etapaDetectada} />
              <Info k="Score" v={`${c.scoreConversa}/100`} />
              <Info k="Risco" v={c.risco} />
              <Info k="Dados financeiros" v={c.analiseMel.dadosFinanceirosDetectados} />
            </div>

            {!c.analiseMel.dadosConferem && (
              <div className="rounded-lg border border-[var(--destructive)]/40 bg-[var(--destructive)]/10 p-3 text-xs flex gap-2">
                <AlertTriangle className="h-4 w-4 text-[var(--destructive)] shrink-0 mt-0.5" />
                <div><strong>Risco crítico:</strong> o vendedor enviou uma chave Pix diferente da cadastrada como oficial.</div>
              </div>
            )}

            <Section title="Objeções detectadas" items={c.analiseMel.objecoes} tone="warning" />
            <Section title="Falhas do vendedor" items={c.analiseMel.falhas} tone="danger" />
            <Section title="Pontos positivos" items={c.analiseMel.positivos} tone="success" />

            <div className="rounded-lg bg-gradient-mel p-4 text-white">
              <div className="text-xs uppercase tracking-widest opacity-80">Próxima ação recomendada</div>
              <div className="font-semibold mt-1">{c.analiseMel.proximaAcao}</div>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
function Info({ k, v }: { k: string; v: string }) {
  return <div className="rounded-lg bg-secondary/60 p-3"><div className="text-[10px] uppercase text-muted-foreground tracking-wider">{k}</div><div className="font-medium text-sm capitalize">{v}</div></div>;
}
function Section({ title, items, tone }: { title: string; items: string[]; tone: "warning" | "danger" | "success" }) {
  if (!items.length) return null;
  const Icon = tone === "success" ? CheckCircle2 : AlertTriangle;
  const cls = tone === "success" ? "text-[var(--success)]" : tone === "danger" ? "text-[var(--destructive)]" : "text-[oklch(0.4_0.1_60)]";
  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">{title}</div>
      <ul className="space-y-1.5">
        {items.map((t) => (
          <li key={t} className="flex gap-2 text-sm"><Icon className={`h-4 w-4 ${cls} mt-0.5 shrink-0`} /><span>{t}</span></li>
        ))}
      </ul>
    </div>
  );
}
