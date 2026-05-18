import type {
  Lead, Vendedor, Curso, Conversa, Alerta, Tarefa, Campanha, ComandoLou, StatusLead,
} from "@/types";

export const escola = {
  nome: "Escola Progresso Profissional",
  cidade: "Goiânia — GO",
  unidade: "Unidade Centro",
  responsavel: "Patrícia Mendes",
  nivelOperacao: "Operação Monitorada",
  scoreGovernanca: 72,
};

export const dashboardKPIs = {
  leadsHoje: 48,
  leadsSemResposta: 7,
  leadsQuentes: 12,
  followUpsAtrasados: 9,
  matriculasConfirmadas: 6,
  faturamentoMes: 42800,
  projecaoMes: 96400,
  gapMeta: 23600,
  metaMes: 120000,
};

export const vendedores: Vendedor[] = [
  { id: "v1", nome: "Ana Souza", iniciais: "AS", leadsAtendidos: 86, tempoMedioResposta: "4min", followUpsFeitos: 41, matriculasConfirmadas: 11, faturamentoGerado: 18400, scoreMel: 88, taxaConversao: 12.8, status: "ativo", conquistas: ["Campeã de Follow-up", "Meta Batida"] },
  { id: "v2", nome: "Carlos Lima", iniciais: "CL", leadsAtendidos: 74, tempoMedioResposta: "12min", followUpsFeitos: 18, matriculasConfirmadas: 5, faturamentoGerado: 9200, scoreMel: 54, taxaConversao: 6.7, status: "ativo", conquistas: [] },
  { id: "v3", nome: "Fernanda Alves", iniciais: "FA", leadsAtendidos: 69, tempoMedioResposta: "6min", followUpsFeitos: 33, matriculasConfirmadas: 8, faturamentoGerado: 12800, scoreMel: 79, taxaConversao: 11.5, status: "ativo", conquistas: ["Recuperadora de Leads"] },
  { id: "v4", nome: "Diego Martins", iniciais: "DM", leadsAtendidos: 52, tempoMedioResposta: "9min", followUpsFeitos: 22, matriculasConfirmadas: 4, faturamentoGerado: 7400, scoreMel: 67, taxaConversao: 7.6, status: "ausente", conquistas: ["Evolução da Semana"] },
];

export const cursos: Curso[] = [
  { id: "c1", nome: "Operador de Máquinas Pesadas", categoria: "Industrial", modalidade: "Presencial", duracao: "3 meses", precoTotal: 2400, matricula: 200, mensalidade: 740, descontoPermitido: 10, status: "ativo", turma: "Turma 14 — Noite", vagas: 8 },
  { id: "c2", nome: "Bombeiro Civil", categoria: "Segurança", modalidade: "Presencial", duracao: "4 meses", precoTotal: 1800, matricula: 150, mensalidade: 420, descontoPermitido: 12, status: "ativo", turma: "Turma 22 — Sábado", vagas: 12 },
  { id: "c3", nome: "Auxiliar Administrativo", categoria: "Administração", modalidade: "Híbrido", duracao: "2 meses", precoTotal: 980, matricula: 120, mensalidade: 280, descontoPermitido: 15, status: "ativo", turma: "Turma 31 — Tarde", vagas: 5 },
  { id: "c4", nome: "Estética Profissional", categoria: "Beleza", modalidade: "Presencial", duracao: "6 meses", precoTotal: 3200, matricula: 250, mensalidade: 580, descontoPermitido: 8, status: "ativo", turma: "Turma 09 — Manhã", vagas: 3 },
  { id: "c5", nome: "Segurança do Trabalho", categoria: "Segurança", modalidade: "Online", duracao: "5 meses", precoTotal: 2100, matricula: 180, mensalidade: 460, descontoPermitido: 10, status: "ativo", turma: "Turma 17 — EAD", vagas: 20 },
  { id: "c6", nome: "Cuidador de Idosos", categoria: "Saúde", modalidade: "Híbrido", duracao: "3 meses", precoTotal: 1450, matricula: 130, mensalidade: 380, descontoPermitido: 12, status: "ativo", turma: "Turma 11 — Noite", vagas: 7 },
];

const etapas: StatusLead[] = [
  "Lead novo","Atendimento iniciado","Interesse identificado","Diagnóstico feito","Curso apresentado",
  "Condição enviada","Objeção","Follow-up","Dados de matrícula enviados","Pagamento pendente",
  "Comprovante recebido","Matrícula confirmada","Perdido","Recuperação",
];

const nomesLead = [
  "Ana Paula Ribeiro","Marcos Vinícius","João Henrique","Larissa Soares","Bruno Carvalho",
  "Camila Duarte","Rafael Moreira","Juliana Costa","Eduardo Pires","Patrícia Lopes",
  "Felipe Andrade","Mariana Faria","Lucas Teixeira","Beatriz Nunes","Tiago Almeida",
  "Renata Cardoso","Gustavo Rocha","Vanessa Lima","Pedro Henrique","Aline Barbosa",
  "Rodrigo Sales","Isabela Freitas","Daniel Castro","Sabrina Mota","Vitor Hugo",
  "Carolina Pinto","Matheus Reis","Fernanda Brito","André Luiz","Letícia Cunha",
];

const origens = ["Facebook Ads","Instagram Ads","Google Search","Indicação","Orgânico WhatsApp","Site"];
const temperaturas: Array<Lead["temperatura"]> = ["frio","morno","quente"];

export const leads: Lead[] = nomesLead.map((nome, i) => ({
  id: `l${i + 1}`,
  nome,
  telefone: `(62) 9${String(80000000 + i * 137).slice(0, 8)}`,
  curso: cursos[i % cursos.length].nome,
  origem: origens[i % origens.length],
  vendedor: vendedores[i % vendedores.length].nome,
  etapa: etapas[i % etapas.length],
  temperatura: temperaturas[i % 3],
  ultimaInteracao: `${(i % 48) + 1}h atrás`,
  proximaAcao: ["Enviar condição","Validar comprovante","Retomar contato","Apresentar curso","Cobrar pagamento"][i % 5],
  scoreMel: 40 + ((i * 13) % 55),
  riscoPerda: (i * 17) % 90,
}));

export const recomendacoesMel = [
  { id: "r1", titulo: "Acionar 7 leads quentes sem follow-up há mais de 24h", impacto: "Alto", acao: "Distribuir para Ana e Fernanda" },
  { id: "r2", titulo: "Revisar abordagem do vendedor Carlos", impacto: "Crítico", acao: "61% das conversas recebem preço antes do diagnóstico" },
  { id: "r3", titulo: "Validar dados de pagamento enviados em 2 conversas", impacto: "Crítico", acao: "Chave Pix divergente do oficial" },
  { id: "r4", titulo: "Reforçar campanha de Bombeiro Civil", impacto: "Médio", acao: "Maior taxa de conversão da semana" },
];

export const alertas: Alerta[] = [
  { id: "a1", prioridade: "critica", tipo: "Dados bancários divergentes", titulo: "Pix divergente enviado por Carlos", descricao: "Vendedor enviou Pix diferente do oficial em conversa com Marcos Vinícius.", recomendacao: "Bloquear envio e treinar vendedor", responsavel: "Carlos Lima", status: "aberto", criadoEm: "há 12min" },
  { id: "a2", prioridade: "critica", tipo: "Meta em risco", titulo: "Gap de R$ 23.600 para meta mensal", descricao: "Projeção atual está 19% abaixo da meta de R$ 120.000.", recomendacao: "Reforçar follow-up de leads quentes", responsavel: "Gestão", status: "em_andamento", criadoEm: "há 1h" },
  { id: "a3", prioridade: "alta", tipo: "Lead quente parado", titulo: "Ana Paula sem retorno há 26h", descricao: "Lead quente do curso de Bombeiro Civil parado em Condição enviada.", recomendacao: "Lou pode disparar follow-up sugerido", responsavel: "Fernanda Alves", status: "aberto", criadoEm: "há 2h" },
  { id: "a4", prioridade: "alta", tipo: "Vendedor fora do playbook", titulo: "Carlos pulou diagnóstico em 8 conversas", descricao: "Padrão de envio de preço antes da etapa correta.", recomendacao: "Treinamento individual", responsavel: "Carlos Lima", status: "aberto", criadoEm: "há 3h" },
  { id: "a5", prioridade: "alta", tipo: "Lead sem resposta", titulo: "7 leads novos sem primeira resposta", descricao: "Tempo médio de resposta acima de 30min.", recomendacao: "Redistribuir para Ana", responsavel: "Equipe", status: "aberto", criadoEm: "há 4h" },
  { id: "a6", prioridade: "media", tipo: "Follow-up atrasado", titulo: "9 follow-ups pendentes hoje", descricao: "Tarefas geradas pela Mel ainda não executadas.", recomendacao: "Lou pode notificar vendedores", responsavel: "Equipe", status: "em_andamento", criadoEm: "há 5h" },
  { id: "a7", prioridade: "media", tipo: "Preço fora da regra", titulo: "Desconto de 18% oferecido", descricao: "Acima do limite de 12% para Bombeiro Civil.", recomendacao: "Reverter oferta", responsavel: "Diego Martins", status: "aberto", criadoEm: "há 6h" },
  { id: "a8", prioridade: "media", tipo: "Campanha com baixa entrega", titulo: "Google Search com CPL alto", descricao: "CPL 42% acima da média semanal.", recomendacao: "Liz sugere pausar e revisar", responsavel: "Marketing", status: "aberto", criadoEm: "há 8h" },
  { id: "a9", prioridade: "baixa", tipo: "Comprovante recebido", titulo: "Comprovante de João Henrique", descricao: "Aguardando validação no financeiro.", recomendacao: "Confirmar matrícula", responsavel: "Financeiro", status: "aberto", criadoEm: "há 9h" },
  { id: "a10", prioridade: "alta", tipo: "Conversa com risco alto", titulo: "Conversa com Larissa em risco", descricao: "Objeção de preço não tratada e silêncio há 18h.", recomendacao: "Acionar gestor", responsavel: "Fernanda Alves", status: "aberto", criadoEm: "há 10h" },
  { id: "a11", prioridade: "baixa", tipo: "Lead recuperado", titulo: "Bruno voltou após 15 dias", descricao: "Lead retornou conversa por iniciativa própria.", recomendacao: "Reabrir oportunidade", responsavel: "Ana Souza", status: "resolvido", criadoEm: "ontem" },
  { id: "a12", prioridade: "media", tipo: "Lead sem resposta", titulo: "3 leads aguardam orçamento", descricao: "Condição prometida mas não enviada.", recomendacao: "Enviar condição padrão", responsavel: "Diego Martins", status: "aberto", criadoEm: "ontem" },
];

export const tarefas: Tarefa[] = [
  { id: "t1", titulo: "Retomar contato com Ana Paula — Bombeiro Civil", leadRelacionado: "Ana Paula Ribeiro", vendedor: "Fernanda Alves", prioridade: "alta", prazo: "Hoje 16h", origem: "Mel", status: "aberto" },
  { id: "t2", titulo: "Validar comprovante enviado por Marcos", leadRelacionado: "Marcos Vinícius", vendedor: "Carlos Lima", prioridade: "critica", prazo: "Hoje 14h", origem: "Mel", status: "aberto" },
  { id: "t3", titulo: "Enviar condição de pagamento para João", leadRelacionado: "João Henrique", vendedor: "Ana Souza", prioridade: "alta", prazo: "Hoje 17h", origem: "Lou", status: "em_andamento" },
  { id: "t4", titulo: "Follow-up com lead quente de Máquinas Pesadas", leadRelacionado: "Bruno Carvalho", vendedor: "Diego Martins", prioridade: "alta", prazo: "Hoje 18h", origem: "Mel", status: "aberto" },
  { id: "t5", titulo: "Apresentar curso para Camila Duarte", leadRelacionado: "Camila Duarte", vendedor: "Ana Souza", prioridade: "media", prazo: "Amanhã 10h", origem: "Manual", status: "aberto" },
  { id: "t6", titulo: "Treinamento individual — Carlos", vendedor: "Carlos Lima", prioridade: "media", prazo: "Amanhã 15h", origem: "Mel", status: "aberto" },
  { id: "t7", titulo: "Confirmar matrícula de Letícia", leadRelacionado: "Letícia Cunha", vendedor: "Fernanda Alves", prioridade: "alta", prazo: "Hoje 19h", origem: "Lou", status: "aberto" },
  { id: "t8", titulo: "Revisar campanha de Administração", vendedor: "Marketing", prioridade: "media", prazo: "Sexta", origem: "Mel", status: "em_andamento" },
];

export const conversas: Conversa[] = [
  {
    id: "co1",
    lead: "Marcos Vinícius",
    vendedor: "Carlos Lima",
    curso: "Bombeiro Civil",
    ultimaMensagem: "Mandei o Pix, pode conferir?",
    etapaDetectada: "Pagamento pendente",
    scoreConversa: 42,
    risco: "critica",
    mensagens: [
      { autor: "lead", texto: "Oi, quanto tá o curso de Bombeiro Civil?", hora: "09:12" },
      { autor: "vendedor", texto: "Olá Marcos! São R$ 1.800 no total, posso parcelar.", hora: "09:14" },
      { autor: "lead", texto: "Me passa o Pix", hora: "09:15" },
      { autor: "vendedor", texto: "Pix: 11999998888 (chave divergente)", hora: "09:16" },
      { autor: "lead", texto: "Mandei o Pix, pode conferir?", hora: "11:42" },
    ],
    analiseMel: {
      resumo: "Vendedor enviou preço antes do diagnóstico e utilizou chave Pix divergente da oficial. Risco crítico de fraude ou perda.",
      objecoes: ["Cliente não foi qualificado", "Sem apresentação do curso"],
      falhas: ["Pulou etapa de diagnóstico", "Chave Pix divergente", "Sem confirmação financeira"],
      positivos: ["Resposta rápida"],
      proximaAcao: "Bloquear cobrança e validar Pix com financeiro",
      dadosFinanceirosDetectados: "Pix: 11999998888",
      dadosConferem: false,
    },
  },
  {
    id: "co2",
    lead: "Ana Paula Ribeiro",
    vendedor: "Fernanda Alves",
    curso: "Bombeiro Civil",
    ultimaMensagem: "Vou pensar e te retorno",
    etapaDetectada: "Condição enviada",
    scoreConversa: 68,
    risco: "alta",
    mensagens: [
      { autor: "vendedor", texto: "Oi Ana! Vi que tem interesse em Bombeiro Civil. Posso te apresentar?", hora: "14:01" },
      { autor: "lead", texto: "Sim, quero saber valor e horário", hora: "14:05" },
      { autor: "vendedor", texto: "Turma sábado, R$ 1.800 com matrícula de R$ 150 + 4x R$ 420.", hora: "14:08" },
      { autor: "lead", texto: "Vou pensar e te retorno", hora: "14:10" },
    ],
    analiseMel: {
      resumo: "Lead quente parado há 24h após receber condição. Objeção implícita de preço não tratada.",
      objecoes: ["Preço sem comparação de valor percebido"],
      falhas: ["Sem follow-up agendado", "Sem reforço de benefícios"],
      positivos: ["Diagnóstico inicial feito", "Resposta dentro de SLA"],
      proximaAcao: "Disparar follow-up com case de aluno e ancoragem de valor",
      dadosFinanceirosDetectados: "Valores conferem",
      dadosConferem: true,
    },
  },
  {
    id: "co3",
    lead: "João Henrique",
    vendedor: "Ana Souza",
    curso: "Operador de Máquinas Pesadas",
    ultimaMensagem: "Fechado, manda os dados de matrícula",
    etapaDetectada: "Dados de matrícula enviados",
    scoreConversa: 92,
    risco: "baixa",
    mensagens: [
      { autor: "lead", texto: "Quero o curso de Máquinas Pesadas", hora: "10:00" },
      { autor: "vendedor", texto: "Que ótimo João! Posso te fazer 2 perguntas rápidas?", hora: "10:01" },
      { autor: "vendedor", texto: "Você já tem CNH? Tem disponibilidade à noite?", hora: "10:01" },
      { autor: "lead", texto: "Tenho sim, e noite é melhor pra mim", hora: "10:03" },
      { autor: "vendedor", texto: "Perfeito. Turma 14, R$ 2.400, parcelado em 3x.", hora: "10:05" },
      { autor: "lead", texto: "Fechado, manda os dados de matrícula", hora: "10:08" },
    ],
    analiseMel: {
      resumo: "Conversa exemplar. Diagnóstico antes de preço, fechamento natural.",
      objecoes: [],
      falhas: [],
      positivos: ["Diagnóstico antes de preço", "Tom consultivo", "Fechamento rápido"],
      proximaAcao: "Enviar link de pagamento oficial e confirmar matrícula",
      dadosFinanceirosDetectados: "Valores conferem",
      dadosConferem: true,
    },
  },
  {
    id: "co4",
    lead: "Larissa Soares",
    vendedor: "Fernanda Alves",
    curso: "Estética Profissional",
    ultimaMensagem: "Tá caro",
    etapaDetectada: "Objeção",
    scoreConversa: 55,
    risco: "alta",
    mensagens: [
      { autor: "vendedor", texto: "Oi Larissa! Curso de Estética: R$ 3.200, parcelado.", hora: "16:20" },
      { autor: "lead", texto: "Tá caro", hora: "16:22" },
    ],
    analiseMel: {
      resumo: "Objeção de preço enviada sem tratamento. Necessário ancorar valor e oferecer condição alternativa.",
      objecoes: ["Preço alto sem percepção de valor"],
      falhas: ["Preço sem diagnóstico", "Objeção não tratada"],
      positivos: [],
      proximaAcao: "Aplicar script de objeção: valor x parcelamento x retorno profissional",
      dadosFinanceirosDetectados: "—",
      dadosConferem: true,
    },
  },
  {
    id: "co5",
    lead: "Camila Duarte",
    vendedor: "Diego Martins",
    curso: "Auxiliar Administrativo",
    ultimaMensagem: "Posso fazer no sábado?",
    etapaDetectada: "Diagnóstico feito",
    scoreConversa: 74,
    risco: "media",
    mensagens: [
      { autor: "lead", texto: "Oi, queria info do curso de Administrativo", hora: "08:30" },
      { autor: "vendedor", texto: "Claro Camila! Você trabalha durante o dia?", hora: "08:32" },
      { autor: "lead", texto: "Sim, posso fazer no sábado?", hora: "08:33" },
    ],
    analiseMel: {
      resumo: "Lead qualificado. Diagnóstico inicial bem feito, mas turma de sábado lotada.",
      objecoes: ["Disponibilidade restrita"],
      falhas: ["Sem oferta de alternativa"],
      positivos: ["Diagnóstico antes de preço"],
      proximaAcao: "Oferecer modalidade híbrida ou turma EAD",
      dadosFinanceirosDetectados: "—",
      dadosConferem: true,
    },
  },
  {
    id: "co6",
    lead: "Bruno Carvalho",
    vendedor: "Ana Souza",
    curso: "Operador de Máquinas Pesadas",
    ultimaMensagem: "Show, vou separar os documentos",
    etapaDetectada: "Comprovante recebido",
    scoreConversa: 89,
    risco: "baixa",
    mensagens: [
      { autor: "vendedor", texto: "Bruno, tudo certo com o pagamento, recebi seu comprovante.", hora: "13:10" },
      { autor: "lead", texto: "Show, vou separar os documentos", hora: "13:12" },
    ],
    analiseMel: {
      resumo: "Conversão confirmada. Próximo passo é envio de boas-vindas e ativação na turma.",
      objecoes: [],
      falhas: [],
      positivos: ["Cobrança gentil", "Comprovante validado"],
      proximaAcao: "Disparar mensagem de boas-vindas e onboarding do aluno",
      dadosFinanceirosDetectados: "Comprovante R$ 200 — bate com matrícula",
      dadosConferem: true,
    },
  },
];

export const campanhas: Campanha[] = [
  { id: "cp1", nome: "Facebook Ads — Bombeiro Civil", canal: "Facebook", curso: "Bombeiro Civil", leads: 142, cpl: 18.4, custoPorMatricula: 184, conversao: 10.2, qualidade: "alta" },
  { id: "cp2", nome: "Instagram Ads — Máquinas Pesadas", canal: "Instagram", curso: "Operador de Máquinas Pesadas", leads: 98, cpl: 22.1, custoPorMatricula: 245, conversao: 9.1, qualidade: "alta" },
  { id: "cp3", nome: "Google Search — Profissionalizantes", canal: "Google", curso: "Multi", leads: 76, cpl: 31.5, custoPorMatricula: 412, conversao: 6.5, qualidade: "media" },
  { id: "cp4", nome: "Indicação de Alunos", canal: "Indicação", curso: "Multi", leads: 34, cpl: 0, custoPorMatricula: 0, conversao: 24.5, qualidade: "alta" },
  { id: "cp5", nome: "Orgânico WhatsApp", canal: "WhatsApp", curso: "Multi", leads: 52, cpl: 0, custoPorMatricula: 0, conversao: 14.8, qualidade: "alta" },
  { id: "cp6", nome: "Facebook Ads — Administração", canal: "Facebook", curso: "Auxiliar Administrativo", leads: 88, cpl: 16.2, custoPorMatricula: 380, conversao: 4.2, qualidade: "baixa" },
];

export const comandosLou: ComandoLou[] = [
  { id: "co_l1", tipo: "Notificar vendedor", destino: "Carlos Lima", prioridade: "critica", mensagemSugerida: "Carlos, identifiquei que você enviou um Pix divergente do oficial. Por favor, retire a mensagem e aguarde orientação.", status: "pendente", criadoEm: "há 10min" },
  { id: "co_l2", tipo: "Cobrar follow-up", destino: "Fernanda Alves", prioridade: "alta", mensagemSugerida: "Fernanda, Ana Paula está há 24h sem retorno na etapa Condição enviada. Posso disparar follow-up sugerido?", status: "pendente", criadoEm: "há 30min" },
  { id: "co_l3", tipo: "Sugerir mensagem", destino: "Diego Martins", prioridade: "media", mensagemSugerida: "Olá Camila! Temos turma híbrida que cabe perfeitamente na sua rotina aos sábados. Posso te enviar os horários?", status: "pendente", criadoEm: "há 1h" },
  { id: "co_l4", tipo: "Criar tarefa", destino: "Ana Souza", prioridade: "alta", mensagemSugerida: "Criar tarefa: validar comprovante de Bruno Carvalho e enviar boas-vindas.", status: "aprovado", criadoEm: "há 2h" },
  { id: "co_l5", tipo: "Enviar resumo para gestor", destino: "Patrícia Mendes", prioridade: "media", mensagemSugerida: "Resumo do dia: 48 leads, 6 matrículas, 9 follow-ups atrasados, 4 alertas críticos.", status: "pendente", criadoEm: "há 3h" },
];

export const missoes = [
  { id: "m1", titulo: "Cadastrar 5 cursos principais", progresso: 100, concluida: true },
  { id: "m2", titulo: "Conectar WhatsApp via Evolution", progresso: 0, concluida: false },
  { id: "m3", titulo: "Cadastrar equipe comercial", progresso: 100, concluida: true },
  { id: "m4", titulo: "Definir metas mensais", progresso: 80, concluida: false },
  { id: "m5", titulo: "Validar dados financeiros oficiais", progresso: 60, concluida: false },
  { id: "m6", titulo: "Analisar 10 conversas comerciais", progresso: 60, concluida: false },
  { id: "m7", titulo: "Resolver 5 alertas críticos", progresso: 40, concluida: false },
  { id: "m8", titulo: "Configurar playbook comercial", progresso: 30, concluida: false },
];

export const conquistas = [
  { id: "q1", titulo: "Primeiro lead recuperado", desbloqueada: true },
  { id: "q2", titulo: "Primeira matrícula monitorada", desbloqueada: true },
  { id: "q3", titulo: "7 dias sem lead esquecido", desbloqueada: false },
  { id: "q4", titulo: "100 follow-ups realizados", desbloqueada: false },
  { id: "q5", titulo: "Meta semanal batida", desbloqueada: true },
];
