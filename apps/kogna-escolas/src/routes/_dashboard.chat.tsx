import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState, useEffect } from "react";
import { Send, Sparkles } from "lucide-react";
import { Card, Button, MelAvatar, Badge } from "@/components/ui/kit";

export const Route = createFileRoute("/_dashboard/chat")({ component: ChatMel });

type Msg = { autor: "mel" | "user"; texto: string; hora: string };

const sugestoes = [
  "Como está o comercial hoje?",
  "Quais leads precisam de atenção?",
  "Por que não estamos batendo a meta?",
  "Qual vendedor precisa de correção?",
  "Quais cursos estão vendendo mais?",
  "Quais conversas têm risco?",
];

const respostas: Record<string, string> = {
  "Como está o comercial hoje?":
    "Hoje entraram 48 leads, com 12 quentes e 7 sem resposta. Confirmamos 6 matrículas e o faturamento acumulado do mês está em R$ 42.800. Você está 19% abaixo da meta. Recomendo focar nos 9 follow-ups atrasados antes das 18h.",
  "Quais leads precisam de atenção?":
    "Identifiquei 7 leads quentes parados há mais de 24h: 3 do curso de Máquinas Pesadas, 2 de Bombeiro Civil e 2 de Estética. Ana Paula Ribeiro (Fernanda) e Marcos Vinícius (Carlos) são os mais urgentes — esse último tem risco crítico de fraude por divergência de Pix.",
  "Por que não estamos batendo a meta?":
    "Três motivos principais: (1) tempo médio de resposta acima de 30min em 7 leads novos, (2) Carlos está pulando o diagnóstico em 61% das conversas e enviando preço cedo demais, (3) campanha de Administração com CPL 42% acima da média gerando leads pouco qualificados.",
  "Qual vendedor precisa de correção?":
    "Carlos Lima. Score Mel de 54/100. Padrões detectados: envia preço sem qualificar, não faz follow-up agendado e teve 1 divergência crítica de Pix. Recomendo treinamento individual já agendado pela Lou para amanhã 15h.",
  "Quais cursos estão vendendo mais?":
    "Top 3 do mês: Operador de Máquinas Pesadas (11 matrículas · R$ 26.400), Bombeiro Civil (8 · R$ 14.400) e Estética Profissional (5 · R$ 16.000). Bombeiro tem a maior taxa de conversão (10,2%).",
  "Quais conversas têm risco?":
    "4 conversas com risco alto ou crítico: Marcos Vinícius (Pix divergente · crítico), Ana Paula (silêncio + objeção · alto), Larissa Soares (objeção de preço não tratada · alto) e uma conversa do Diego com desconto fora da regra. Posso pedir para a Lou preparar comandos?",
};

function ChatMel() {
  const [msgs, setMsgs] = useState<Msg[]>([
    { autor: "mel", texto: "Olá! Sou a Mel, sua IA de governança comercial. Analisei sua operação nas últimas 24h. O que você gostaria de saber?", hora: "agora" },
  ]);
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => { scrollRef.current?.scrollTo({ top: 99999, behavior: "smooth" }); }, [msgs]);

  const send = (texto: string) => {
    if (!texto.trim()) return;
    setMsgs((m) => [...m, { autor: "user", texto, hora: "agora" }]);
    setInput("");
    setTimeout(() => {
      const resp = respostas[texto] ??
        "Estou analisando isso com base nos dados da sua operação. Em breve consigo te dar uma resposta mais detalhada. Enquanto isso, posso priorizar uma ação na Central?";
      setMsgs((m) => [...m, { autor: "mel", texto: resp, hora: "agora" }]);
    }, 700);
  };

  return (
    <div className="grid lg:grid-cols-[1fr_320px] gap-6 h-[calc(100vh-9rem)]">
      <Card className="flex flex-col overflow-hidden">
        <div className="p-4 border-b border-border flex items-center gap-3">
          <MelAvatar size={40} />
          <div className="flex-1">
            <div className="font-display font-semibold">Mel</div>
            <div className="text-xs text-muted-foreground flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-[var(--success)]" /> Online · monitorando agora</div>
          </div>
          <Badge tone="mel"><Sparkles className="h-3 w-3" /> Governança IA</Badge>
        </div>

        <div ref={scrollRef} className="flex-1 overflow-y-auto scrollbar-thin p-6 space-y-4">
          {msgs.map((m, i) => (
            <div key={i} className={`flex gap-3 ${m.autor === "user" ? "justify-end" : ""}`}>
              {m.autor === "mel" && <MelAvatar size={32} />}
              <div className={`max-w-[75%] rounded-2xl px-4 py-3 text-sm ${m.autor === "mel" ? "bg-secondary text-secondary-foreground rounded-tl-sm" : "bg-primary text-primary-foreground rounded-tr-sm"}`}>
                <div className="leading-relaxed whitespace-pre-line">{m.texto}</div>
              </div>
              {m.autor === "user" && <div className="h-8 w-8 rounded-full bg-secondary grid place-items-center text-xs font-bold">PM</div>}
            </div>
          ))}
        </div>

        <div className="p-4 border-t border-border">
          <form onSubmit={(e) => { e.preventDefault(); send(input); }} className="flex items-center gap-2">
            <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Pergunte qualquer coisa sobre sua operação…" className="flex-1 rounded-lg border border-input bg-card px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring/30" />
            <Button variant="mel" type="submit"><Send className="h-4 w-4" /> Enviar</Button>
          </form>
        </div>
      </Card>

      <Card className="p-4 hidden lg:flex flex-col">
        <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">Perguntas sugeridas</div>
        <div className="space-y-2 flex-1 overflow-y-auto scrollbar-thin">
          {sugestoes.map((s) => (
            <button key={s} onClick={() => send(s)} className="w-full text-left p-3 rounded-lg border border-border text-sm hover:border-primary/40 hover:bg-primary/5 transition">
              {s}
            </button>
          ))}
        </div>
      </Card>
    </div>
  );
}
