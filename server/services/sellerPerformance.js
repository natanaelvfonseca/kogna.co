const WON_STATUS_KEYWORDS = [
  "cliente",
  "ganho",
  "won",
  "fechado",
  "closed won",
];

const LOST_STATUS_KEYWORDS = [
  "perdido",
  "lost",
  "descartado",
  "unqualified",
  "cancelado",
];

export function normalizeBrazilPhoneDigits(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return "";

  if (digits.startsWith("55")) {
    return `55${normalizeLocalBrazilDigits(digits.slice(2))}`;
  }

  if (digits.length >= 10) {
    return normalizeLocalBrazilDigits(digits);
  }

  return digits;
}

function normalizeLocalBrazilDigits(localDigits) {
  if (localDigits.length === 11 && localDigits[2] === "9") {
    return `${localDigits.slice(0, 2)}${localDigits.slice(3)}`;
  }

  return localDigits;
}

export function buildPhoneCandidates(value) {
  const rawDigits = String(value || "").replace(/\D/g, "");
  if (!rawDigits) return [];

  const candidates = new Set([rawDigits]);
  const normalized = normalizeBrazilPhoneDigits(rawDigits);

  if (normalized) {
    candidates.add(normalized);
  }

  const localDigits = normalized.startsWith("55")
    ? normalized.slice(2)
    : normalized;

  if (localDigits) {
    candidates.add(localDigits);
  }

  if (normalized.startsWith("55") && localDigits.length === 10) {
    candidates.add(`55${localDigits.slice(0, 2)}9${localDigits.slice(2)}`);
  }

  if (!normalized.startsWith("55") && localDigits.length === 10) {
    candidates.add(`55${localDigits}`);
    candidates.add(`${localDigits.slice(0, 2)}9${localDigits.slice(2)}`);
  }

  if (rawDigits.length === 11 && rawDigits[2] === "9") {
    candidates.add(`${rawDigits.slice(0, 2)}${rawDigits.slice(3)}`);
  }

  return Array.from(candidates).filter(Boolean);
}

export function normalizeRemoteJid(remoteJid) {
  const digits = String(remoteJid || "").split("@")[0].replace(/\D/g, "");
  if (!digits) return "";
  return normalizeBrazilPhoneDigits(digits);
}

export function buildLeadPhoneIndex(leads) {
  const phoneToLeadId = new Map();

  for (const lead of leads) {
    const candidates = buildPhoneCandidates(lead.phone);
    for (const candidate of candidates) {
      if (!phoneToLeadId.has(candidate)) {
        phoneToLeadId.set(candidate, lead.id);
      }
    }
  }

  return phoneToLeadId;
}

export function matchLeadIdForRemoteJid(remoteJid, phoneIndex) {
  const normalized = normalizeRemoteJid(remoteJid);
  if (!normalized) return null;

  if (phoneIndex.has(normalized)) {
    return phoneIndex.get(normalized);
  }

  const variants = buildPhoneCandidates(normalized);
  for (const variant of variants) {
    if (phoneIndex.has(variant)) {
      return phoneIndex.get(variant);
    }
  }

  return null;
}

export function isConnectionOnline(status) {
  const normalized = String(status || "").toLowerCase();
  return normalized === "connected" || normalized === "open";
}

export function isWonStatus(status) {
  const normalized = String(status || "").toLowerCase();
  return WON_STATUS_KEYWORDS.some((keyword) => normalized.includes(keyword));
}

export function isLostStatus(status) {
  const normalized = String(status || "").toLowerCase();
  return LOST_STATUS_KEYWORDS.some((keyword) => normalized.includes(keyword));
}

export function isTerminalStatus(status) {
  return isWonStatus(status) || isLostStatus(status);
}

export function minutesBetween(start, end) {
  return Math.max(0, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000));
}

export function hoursBetween(start, end) {
  return Math.max(0, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 3600000));
}

export function formatMinutesLabel(totalMinutes) {
  const minutes = Number(totalMinutes || 0);
  if (!Number.isFinite(minutes) || minutes <= 0) return "0 min";
  if (minutes < 60) return `${minutes} min`;

  const hours = Math.floor(minutes / 60);
  const restMinutes = minutes % 60;
  if (restMinutes === 0) return `${hours}h`;
  return `${hours}h ${restMinutes}min`;
}

export function formatHoursLabel(totalHours) {
  const hours = Number(totalHours || 0);
  if (!Number.isFinite(hours) || hours <= 0) return "0h";
  if (hours < 24) return `${hours}h`;

  const days = Math.floor(hours / 24);
  const restHours = hours % 24;
  if (restHours === 0) return `${days}d`;
  return `${days}d ${restHours}h`;
}

export function buildSellerScope({
  sellerId,
  sellers,
  connectionsBySeller,
  instancesById,
  leads,
  rawMessages,
  periodStart,
  periodEnd,
  now = new Date(),
}) {
  const seller = sellers.find((item) => item.id === sellerId) || null;
  const sellerConnections = connectionsBySeller.get(sellerId) || [];
  const sellerLeads = leads.filter((lead) => lead.assigned_to === sellerId);
  const phoneIndex = buildLeadPhoneIndex(sellerLeads);
  const messagesByLead = new Map();

  for (const message of rawMessages) {
    const leadId = matchLeadIdForRemoteJid(message.remote_jid, phoneIndex);
    if (!leadId) continue;

    const current = messagesByLead.get(leadId) || [];
    current.push({
      ...message,
      leadId,
      createdAt: new Date(message.created_at),
    });
    messagesByLead.set(leadId, current);
  }

  for (const [, groupedMessages] of messagesByLead) {
    groupedMessages.sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime());
  }

  const metrics = computeSellerMetrics({
    leads: sellerLeads,
    messagesByLead,
    periodStart,
    periodEnd,
    now,
  });

  const funnel = buildSellerFunnel(sellerLeads);
  const conversations = buildSellerConversations({
    leads: sellerLeads,
    messagesByLead,
    instancesById,
    now,
  });
  const leadRows = buildSellerLeadRows({
    leads: sellerLeads,
    messagesByLead,
    now,
  });
  const operationalStatus = inferSellerOperationalStatus({
    seller,
    sellerConnections,
    instancesById,
  });

  return {
    seller,
    connections: sellerConnections,
    metrics,
    funnel,
    conversations,
    leadRows,
    status: operationalStatus,
  };
}

export function computeSellerMetrics({
  leads,
  messagesByLead,
  periodStart,
  periodEnd,
  now = new Date(),
  unansweredWindowMinutes = 15,
  followupWindowHours = 24,
}) {
  const metrics = {
    leadsReceived: 0,
    leadsResponded: 0,
    unansweredLeads: 0,
    activeConversations: 0,
    avgResponseTimeMinutes: 0,
    responseRate: 0,
    conversionRate: 0,
    pendingFollowups: 0,
    lostLeads: 0,
    wonLeads: 0,
    responseTimeSamples: 0,
  };

  const responseDiffs = [];

  for (const lead of leads) {
    const createdAt = lead.created_at ? new Date(lead.created_at) : null;
    const anchor = lead.last_interaction_at || lead.last_contact || lead.created_at;
    const anchorDate = anchor ? new Date(anchor) : null;
    const leadMessages = (messagesByLead.get(lead.id) || []).filter(
      (message) => message.createdAt.getTime() <= periodEnd.getTime(),
    );
    const leadMessagesInPeriod = leadMessages.filter(
      (message) => message.createdAt.getTime() >= periodStart.getTime(),
    );
    const latestMessage = leadMessages[leadMessages.length - 1] || null;

    if (createdAt && createdAt >= periodStart && createdAt <= periodEnd) {
      metrics.leadsReceived += 1;
    }

    if (!isTerminalStatus(lead.status) && leadMessagesInPeriod.length > 0) {
      metrics.activeConversations += 1;
    }

    if (
      latestMessage &&
      latestMessage.role === "user" &&
      !isTerminalStatus(lead.status) &&
      minutesBetween(latestMessage.createdAt, now) >= unansweredWindowMinutes
    ) {
      metrics.unansweredLeads += 1;
    }

    if (
      !isTerminalStatus(lead.status) &&
      anchorDate &&
      hoursBetween(anchorDate, now) >= followupWindowHours
    ) {
      metrics.pendingFollowups += 1;
    }

    if (isWonStatus(lead.status) && anchorDate && anchorDate >= periodStart && anchorDate <= periodEnd) {
      metrics.wonLeads += 1;
    }

    if (isLostStatus(lead.status) && anchorDate && anchorDate >= periodStart && anchorDate <= periodEnd) {
      metrics.lostLeads += 1;
    }

    let firstInboundAt = null;
    let hasRespondedLead = false;

    for (const message of leadMessages) {
      if (message.role === "user" && !firstInboundAt) {
        firstInboundAt = message.createdAt;
      }

      if (message.role === "assistant" && firstInboundAt) {
        responseDiffs.push(minutesBetween(firstInboundAt, message.createdAt));
        firstInboundAt = null;
        hasRespondedLead = true;
      }
    }

    if (createdAt && createdAt >= periodStart && createdAt <= periodEnd && hasRespondedLead) {
      metrics.leadsResponded += 1;
    }
  }

  metrics.responseTimeSamples = responseDiffs.length;
  metrics.avgResponseTimeMinutes = responseDiffs.length
    ? Math.round(responseDiffs.reduce((sum, value) => sum + value, 0) / responseDiffs.length)
    : 0;
  metrics.responseRate = metrics.leadsReceived > 0
    ? Number((metrics.leadsResponded / metrics.leadsReceived).toFixed(4))
    : 0;
  metrics.conversionRate = metrics.leadsReceived > 0
    ? Number((metrics.wonLeads / metrics.leadsReceived).toFixed(4))
    : 0;

  return metrics;
}

export function buildSellerFunnel(leads) {
  const stageMap = new Map();

  for (const lead of leads) {
    const stage = lead.status || "Sem etapa";
    stageMap.set(stage, (stageMap.get(stage) || 0) + 1);
  }

  return Array.from(stageMap.entries()).map(([stage, count]) => ({
    stage,
    count,
  }));
}

export function inferSellerOperationalStatus({ seller, sellerConnections, instancesById }) {
  if (!seller) return "offline";

  if (seller.ativo === false || String(seller.status || "").toLowerCase() === "inactive") {
    return "inactive";
  }

  const hasConnectedLine = sellerConnections.some((connection) => {
    const instance = instancesById.get(connection.connection_id);
    return isConnectionOnline(instance?.status);
  });

  return hasConnectedLine ? "online" : "offline";
}

export function buildSellerScore(metrics) {
  const responseRateScore = Math.min(25, Math.round((metrics.responseRate || 0) * 25));
  const conversionScore = Math.min(25, Math.round((metrics.conversionRate || 0) * 50));
  const speedScore = Math.max(0, 25 - Math.round(Math.min(metrics.avgResponseTimeMinutes || 0, 120) / 5));
  const followupScore = Math.max(0, 15 - Math.min(metrics.pendingFollowups * 3, 15));
  const unansweredScore = Math.max(0, 10 - Math.min(metrics.unansweredLeads * 2, 10));

  return Math.max(
    0,
    Math.min(100, responseRateScore + conversionScore + speedScore + followupScore + unansweredScore),
  );
}

export function buildRiskBadge(metrics) {
  let points = 0;

  if (metrics.unansweredLeads >= 5) points += 3;
  else if (metrics.unansweredLeads >= 2) points += 1;

  if (metrics.avgResponseTimeMinutes >= 120) points += 3;
  else if (metrics.avgResponseTimeMinutes >= 45) points += 1;

  if (metrics.responseRate <= 0.45) points += 3;
  else if (metrics.responseRate <= 0.7) points += 1;

  if (metrics.pendingFollowups >= 5) points += 2;
  else if (metrics.pendingFollowups >= 2) points += 1;

  if (points >= 6) {
    return {
      level: "high",
      color: "red",
      label: "Risco alto",
    };
  }

  if (points >= 3) {
    return {
      level: "attention",
      color: "amber",
      label: "Atencao",
    };
  }

  return {
    level: "healthy",
    color: "green",
    label: "Saudavel",
  };
}

export function buildSellerStrengthsAndCriticalPoints(metrics, teamAverages = {}) {
  const strengths = [];
  const criticalPoints = [];

  if ((metrics.responseRate || 0) >= Math.max(teamAverages.responseRate || 0, 0.8)) {
    strengths.push("Boa taxa de resposta no periodo");
  } else {
    criticalPoints.push("Taxa de resposta abaixo do esperado");
  }

  if ((metrics.avgResponseTimeMinutes || 0) > 0 && (metrics.avgResponseTimeMinutes || 0) <= Math.min(teamAverages.avgResponseTimeMinutes || 30, 30)) {
    strengths.push("Velocidade de resposta saudavel");
  } else if ((metrics.avgResponseTimeMinutes || 0) > 45) {
    criticalPoints.push("Tempo de resposta acima do ideal");
  }

  if ((metrics.conversionRate || 0) >= Math.max(teamAverages.conversionRate || 0, 0.2)) {
    strengths.push("Conversoes acima da linha de base");
  } else if ((metrics.wonLeads || 0) === 0 && (metrics.leadsReceived || 0) >= 3) {
    criticalPoints.push("Baixa conversao para o volume recebido");
  }

  if ((metrics.pendingFollowups || 0) >= 3) {
    criticalPoints.push("Follow-ups pendentes acumulando");
  }

  if ((metrics.unansweredLeads || 0) >= 2) {
    criticalPoints.push("Leads aguardando retorno");
  }

  return {
    strengths: strengths.slice(0, 3),
    criticalPoints: criticalPoints.slice(0, 3),
  };
}

export function buildSellerInsights({
  sellerName,
  metrics,
  previousMetrics,
  teamAverages,
  funnel,
}) {
  const insights = [];
  const avgResponse = teamAverages.avgResponseTimeMinutes || 0;
  const teamResponseRate = teamAverages.responseRate || 0;
  const teamConversionRate = teamAverages.conversionRate || 0;
  const currentScore = buildSellerScore(metrics);
  const previousScore = buildSellerScore(previousMetrics || {});

  if (avgResponse > 0 && metrics.avgResponseTimeMinutes > avgResponse * 1.2) {
    const pct = Math.round(((metrics.avgResponseTimeMinutes - avgResponse) / avgResponse) * 100);
    insights.push({
      id: `${sellerName}-response-time`,
      severity: metrics.avgResponseTimeMinutes > avgResponse * 1.5 ? "critical" : "warning",
      title: "Tempo de resposta elevado",
      description: `${sellerName} esta respondendo ${pct}% mais lento que a media do time no periodo selecionado.`,
      related_metric: "avg_response_time",
      suggested_action: "Priorizar conversas com ultima mensagem do cliente e redistribuir picos de demanda nas proximas horas.",
    });
  }

  if (teamResponseRate > 0 && metrics.responseRate < teamResponseRate * 0.8) {
    const pct = Math.round((1 - metrics.responseRate / teamResponseRate) * 100);
    insights.push({
      id: `${sellerName}-response-rate`,
      severity: metrics.responseRate <= 0.45 ? "critical" : "warning",
      title: "Taxa de resposta abaixo da media",
      description: `A taxa de resposta esta ${pct}% abaixo da media do time e precisa de recuperacao nas conversas abertas.`,
      related_metric: "response_rate",
      suggested_action: "Criar fila de retorno para leads com ultima mensagem do cliente e revisar janelas de atendimento do vendedor.",
    });
  }

  if ((previousMetrics.responseRate || 0) > 0 && metrics.responseRate < previousMetrics.responseRate - 0.1) {
    const pct = Math.round((previousMetrics.responseRate - metrics.responseRate) * 100);
    insights.push({
      id: `${sellerName}-response-drop`,
      severity: "warning",
      title: "Queda recente na taxa de resposta",
      description: `A taxa de resposta caiu ${pct} pontos percentuais em relacao ao periodo anterior.`,
      related_metric: "response_rate",
      suggested_action: "Revisar rotina diaria de follow-up e concentrar o primeiro retorno nos leads mais recentes.",
    });
  }

  if (metrics.unansweredLeads >= 3) {
    insights.push({
      id: `${sellerName}-unanswered`,
      severity: metrics.unansweredLeads >= 6 ? "critical" : "warning",
      title: "Leads com ultima mensagem sem retorno",
      description: `Existem ${metrics.unansweredLeads} leads com ultima mensagem do cliente ainda sem resposta do time comercial.`,
      related_metric: "unanswered_leads",
      suggested_action: "Abrir a fila de risco e responder primeiro as conversas com maior tempo sem retorno.",
    });
  }

  if (teamConversionRate > 0 && metrics.conversionRate > teamConversionRate * 1.15 && avgResponse > 0 && metrics.avgResponseTimeMinutes > avgResponse * 1.1) {
    insights.push({
      id: `${sellerName}-slow-but-converts`,
      severity: "info",
      title: "Converte bem, mas demora para iniciar o atendimento",
      description: "O vendedor fecha acima da media, mas ainda perde velocidade no primeiro retorno para novos leads.",
      related_metric: "conversion_rate",
      suggested_action: "Padronizar a primeira resposta e reduzir o tempo de inicio para manter a conversao alta com menos atrito.",
    });
  }

  const proposalStage = funnel.find((stage) => String(stage.stage || "").toLowerCase().includes("proposta"));
  if (proposalStage && proposalStage.count >= 3 && metrics.lostLeads >= 2) {
    insights.push({
      id: `${sellerName}-proposal-bottleneck`,
      severity: "warning",
      title: "Concentracao de perdas na etapa de proposta",
      description: "Ha volume relevante parado ou perdido em etapas ligadas a proposta, indicando friccao na virada para negociacao.",
      related_metric: "lost_leads",
      suggested_action: "Revisar abordagem comercial apos proposta enviada e adicionar follow-up mais curto nas oportunidades mornas.",
    });
  }

  if (currentScore >= previousScore + 8 && currentScore >= 70) {
    insights.push({
      id: `${sellerName}-positive-trend`,
      severity: "info",
      title: "Melhora operacional no periodo",
      description: "O score operacional evoluiu em relacao ao periodo anterior, sinalizando rotina mais consistente no atendimento.",
      related_metric: "quality_score",
      suggested_action: "Manter o mesmo ritmo de retorno e replicar a cadencia atual nas proximas semanas.",
    });
  }

  return insights.slice(0, 6);
}

export function buildSellerExecutiveSummary(score, insights) {
  const hasCritical = insights.some((item) => item.severity === "critical");
  const hasWarning = insights.some((item) => item.severity === "warning");

  if (hasCritical || score < 50) {
    return {
      level: "risk",
      label: "Risco",
      description: "A operacao do vendedor pede acao imediata para reduzir atraso, gargalos e perdas evitaveis.",
    };
  }

  if (hasWarning || score < 72) {
    return {
      level: "attention",
      label: "Atencao",
      description: "O vendedor esta operando, mas existem sinais claros de friccao e oportunidades de ganho rapido.",
    };
  }

  return {
    level: "good",
    label: "Bom desempenho",
    description: "A operacao esta saudavel, com respostas consistentes e risco controlado no periodo analisado.",
  };
}

export function buildSellerConversations({ leads, messagesByLead, instancesById, now = new Date() }) {
  const conversations = [];

  for (const lead of leads) {
    const leadMessages = messagesByLead.get(lead.id) || [];
    if (leadMessages.length === 0) continue;

    const latestMessage = leadMessages[leadMessages.length - 1];
    const instance = latestMessage.connection_id ? instancesById.get(latestMessage.connection_id) : null;
    const latestCustomerMessage = [...leadMessages].reverse().find((item) => item.role === "user") || null;

    conversations.push({
      leadId: lead.id,
      leadName: lead.name,
      leadStatus: lead.status,
      temperature: lead.temperature || "frio",
      phone: lead.phone || null,
      remoteJid: latestMessage.remote_jid,
      instanceName: latestMessage.instance_name || instance?.instance_name || null,
      connectionId: latestMessage.connection_id || instance?.id || null,
      lastMessage: latestMessage.content || "",
      lastMessageRole: latestMessage.role,
      lastMessageAt: latestMessage.createdAt.toISOString(),
      waitingForReply: latestMessage.role === "user",
      waitingMinutes: latestMessage.role === "user" ? minutesBetween(latestMessage.createdAt, now) : 0,
      lastCustomerMessageAt: latestCustomerMessage ? latestCustomerMessage.createdAt.toISOString() : null,
    });
  }

  return conversations.sort(
    (left, right) => new Date(right.lastMessageAt).getTime() - new Date(left.lastMessageAt).getTime(),
  );
}

export function buildSellerLeadRows({ leads, messagesByLead, now = new Date() }) {
  return leads
    .map((lead) => {
      const leadMessages = messagesByLead.get(lead.id) || [];
      const latestMessage = leadMessages[leadMessages.length - 1] || null;
      const waitingForReply = latestMessage?.role === "user";
      const lastInteractionAt = latestMessage?.createdAt
        || (lead.last_interaction_at ? new Date(lead.last_interaction_at) : null)
        || (lead.last_contact ? new Date(lead.last_contact) : null)
        || (lead.created_at ? new Date(lead.created_at) : null);

      return {
        id: lead.id,
        name: lead.name,
        phone: lead.phone,
        stage: lead.status,
        temperature: lead.temperature || "frio",
        lastInteractionAt: lastInteractionAt ? lastInteractionAt.toISOString() : null,
        waitingForReply,
        timeWithoutResponseMinutes: waitingForReply && lastInteractionAt
          ? minutesBetween(lastInteractionAt, now)
          : 0,
        status: isTerminalStatus(lead.status)
          ? (isWonStatus(lead.status) ? "won" : "lost")
          : waitingForReply
            ? "waiting"
            : "active",
        value: Number(lead.value || 0),
      };
    })
    .sort((left, right) => {
      const leftTime = left.lastInteractionAt ? new Date(left.lastInteractionAt).getTime() : 0;
      const rightTime = right.lastInteractionAt ? new Date(right.lastInteractionAt).getTime() : 0;
      return rightTime - leftTime;
    });
}

export function buildTeamAverages(scopes) {
  const base = {
    responseRate: 0,
    avgResponseTimeMinutes: 0,
    conversionRate: 0,
  };

  if (!scopes.length) {
    return base;
  }

  const responseRateValues = scopes.map((scope) => scope.metrics.responseRate || 0);
  const responseTimeValues = scopes
    .map((scope) => scope.metrics.avgResponseTimeMinutes || 0)
    .filter((value) => value > 0);
  const conversionValues = scopes.map((scope) => scope.metrics.conversionRate || 0);

  return {
    responseRate: average(responseRateValues),
    avgResponseTimeMinutes: average(responseTimeValues),
    conversionRate: average(conversionValues),
  };
}

export function average(values) {
  if (!values.length) return 0;
  return Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(4));
}
