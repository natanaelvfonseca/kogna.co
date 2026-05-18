import { createFileRoute } from "@tanstack/react-router";
import { BookOpen, Sparkles } from "lucide-react";
import { Card, Badge, Button, PageHeader, MelAvatar } from "@/components/ui/kit";

export const Route = createFileRoute("/_dashboard/playbook")({ component: PlaybookPage });

const secoes = [
  { t: "Saudação padrão", d: "Como o vendedor deve abrir uma conversa.", v: "Olá! Aqui é da Escola Progresso. Vi que você se interessou pelo curso. Posso te ajudar com algumas dúvidas?" },
  { t: "Perguntas de diagnóstico", d: "Mínimo de 2 antes de qualquer apresentação de preço.", v: "Qual sua disponibilidade de horário? Você já tem experiência na área?" },
  { t: "Quando apresentar o curso", d: "Somente após diagnóstico completo.", v: "Após confirmar disponibilidade e objetivo do aluno." },
  { t: "Quando enviar preço", d: "Após apresentação do curso e ancoragem de valor.", v: "Nunca antes do diagnóstico." },
  { t: "Tratamento de objeção de preço", d: "Use valor x parcelamento x retorno profissional.", v: "Ressalte parcelamento, certificado e mercado." },
  { t: "Tratamento de objeção de tempo", d: "Ofereça modalidades alternativas.", v: "EAD, híbrido ou turma sábado." },
  { t: "Cadência de follow-up", d: "Sequência padrão Kogna.", v: "+24h · +72h · +7 dias · +15 dias" },
  { t: "Regras de desconto", d: "Limites por curso.", v: "Máximo 12% sem aprovação." },
  { t: "Informações proibidas", d: "Nunca enviar.", v: "Pix pessoal, banco não oficial, valores promocionais não vigentes." },
];

function PlaybookPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Playbook Comercial"
        description="Metodologia de venda da escola. A Mel usa este documento para avaliar se o vendedor está seguindo o processo."
        actions={<Button variant="primary">Salvar playbook</Button>}
      />

      <Card className="p-5 bg-gradient-to-br from-[var(--mel)]/10 to-primary/5">
        <div className="flex items-start gap-3">
          <MelAvatar size={36} />
          <div className="text-sm leading-relaxed">
            <Badge tone="mel"><Sparkles className="h-3 w-3" /> Mel</Badge>
            <p className="mt-2">A Mel usará este playbook para avaliar se o vendedor está seguindo o processo comercial e gerará alertas quando detectar desvios.</p>
          </div>
        </div>
      </Card>

      <div className="grid md:grid-cols-2 gap-4">
        {secoes.map((s) => (
          <Card key={s.t} className="p-5">
            <div className="flex items-center gap-2"><BookOpen className="h-4 w-4 text-primary" /><div className="font-display font-semibold">{s.t}</div></div>
            <div className="text-xs text-muted-foreground mt-1">{s.d}</div>
            <textarea defaultValue={s.v} rows={3} className="mt-3 w-full rounded-lg border border-input bg-card px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring/30 resize-none" />
          </Card>
        ))}
      </div>
    </div>
  );
}
