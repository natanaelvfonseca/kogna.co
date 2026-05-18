export type Temperatura = "frio" | "morno" | "quente";
export type Prioridade = "baixa" | "media" | "alta" | "critica";
export type StatusLead =
  | "Lead novo"
  | "Atendimento iniciado"
  | "Interesse identificado"
  | "Diagnóstico feito"
  | "Curso apresentado"
  | "Condição enviada"
  | "Objeção"
  | "Follow-up"
  | "Dados de matrícula enviados"
  | "Pagamento pendente"
  | "Comprovante recebido"
  | "Matrícula confirmada"
  | "Perdido"
  | "Recuperação";

export interface Lead {
  id: string;
  nome: string;
  telefone: string;
  curso: string;
  origem: string;
  vendedor: string;
  etapa: StatusLead;
  temperatura: Temperatura;
  ultimaInteracao: string;
  proximaAcao: string;
  scoreMel: number;
  riscoPerda: number;
}

export interface Vendedor {
  id: string;
  nome: string;
  iniciais: string;
  leadsAtendidos: number;
  tempoMedioResposta: string;
  followUpsFeitos: number;
  matriculasConfirmadas: number;
  faturamentoGerado: number;
  scoreMel: number;
  taxaConversao: number;
  status: "ativo" | "ausente" | "inativo";
  conquistas: string[];
}

export interface Curso {
  id: string;
  nome: string;
  categoria: string;
  modalidade: "Presencial" | "Online" | "Híbrido";
  duracao: string;
  precoTotal: number;
  matricula: number;
  mensalidade: number;
  descontoPermitido: number;
  status: "ativo" | "encerrado";
  turma: string;
  vagas: number;
}

export interface Conversa {
  id: string;
  lead: string;
  vendedor: string;
  curso: string;
  ultimaMensagem: string;
  etapaDetectada: StatusLead;
  scoreConversa: number;
  risco: Prioridade;
  mensagens: Array<{ autor: "lead" | "vendedor"; texto: string; hora: string }>;
  analiseMel: {
    resumo: string;
    objecoes: string[];
    falhas: string[];
    positivos: string[];
    proximaAcao: string;
    dadosFinanceirosDetectados: string;
    dadosConferem: boolean;
  };
}

export interface Alerta {
  id: string;
  prioridade: Prioridade;
  tipo: string;
  titulo: string;
  descricao: string;
  recomendacao: string;
  responsavel: string;
  status: "aberto" | "em_andamento" | "resolvido";
  criadoEm: string;
}

export interface Tarefa {
  id: string;
  titulo: string;
  leadRelacionado?: string;
  vendedor: string;
  prioridade: Prioridade;
  prazo: string;
  origem: "Manual" | "Mel" | "Lou";
  status: "aberto" | "em_andamento" | "concluido" | "ignorado";
}

export interface Campanha {
  id: string;
  nome: string;
  canal: string;
  curso: string;
  leads: number;
  cpl: number;
  custoPorMatricula: number;
  conversao: number;
  qualidade: "alta" | "media" | "baixa";
}

export interface ComandoLou {
  id: string;
  tipo: string;
  destino: string;
  prioridade: Prioridade;
  mensagemSugerida: string;
  status: "pendente" | "aprovado" | "ignorado";
  criadoEm: string;
}
