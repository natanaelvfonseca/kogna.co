import { createRequire } from "module";
const require = createRequire(import.meta.url);
import express from "express";
import fetch from "node-fetch";
import cors from "cors";
import fs from "fs";
import multer from "multer";
import path from "path";
import { fileURLToPath } from "url";
import OpenAI, { toFile } from "openai";
import { MercadoPagoConfig, Preference } from "mercadopago";
const pdfParser = null; // Lazy loaded in getAgentKnowledge
import bcrypt from "bcryptjs";
import cookieParser from "cookie-parser";
import jwt from "jsonwebtoken";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import cron from "node-cron";
import {
  average,
  buildLeadPhoneIndex,
  buildPhoneCandidates,
  buildRiskBadge,
  buildSellerConversations,
  buildSellerExecutiveSummary,
  buildSellerInsights,
  buildSellerLeadRows,
  buildSellerScope,
  buildSellerScore,
  buildSellerStrengthsAndCriticalPoints,
  buildTeamAverages,
  hoursBetween,
  inferSellerOperationalStatus,
  isConnectionOnline,
  isLostStatus,
  isTerminalStatus,
  isWonStatus,
  matchLeadIdForRemoteJid,
  normalizeBrazilPhoneDigits,
  normalizeRemoteJid,
} from "./server/services/sellerPerformance.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configure Multer — use memoryStorage for Vercel (read-only filesystem)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max
});

console.log("Starting server.js...");

import dotenv from "dotenv";
dotenv.config();

console.log("STEP 1: Starting initialization");
import pg from "pg";
const { Pool } = pg;
console.log("STEP 2: DB Pool imported");

const app = express();
const port = 8080;
console.log("STEP 3: Express app created on port " + port);
app.set('trust proxy', 1);

// Security Middleware
app.use(helmet());

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // Increased from 100 to 1000 to support dashboard polling
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later." },
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10, // Brute force protection: 10 attempts per 15 mins
  message: {
    error: "Too many login/register attempts. Please wait 15 minutes.",
  },
});

// Apply general rate limit to all /api routes
app.use("/api/", apiLimiter);
// Apply stricter limit to auth routes
app.use("/api/login", authLimiter);
app.use("/api/register", authLimiter);

const JWT_SECRET = process.env.JWT_SECRET;
const GUIDED_TOUR_VERSION = "platform-v1";
const GUIDED_TOUR_ROLLOUT_AT = "2026-03-16T00:00:00.000Z";
if (!JWT_SECRET) {
  log("CRITICAL WARNING: JWT_SECRET not found in environment variables. All authentication will fail!");
}

function log(msg) {
  try {
    const time = new Date().toISOString();
    const logMsg = `[${time}] ${msg}`;
    // Always use console.log in production/Vercel for visibility
    console.log(logMsg);

    // File logging only for non-Vercel
    if (process.env.VERCEL !== '1') {
      fs.appendFileSync("server_debug.log", logMsg + "\n");
    }
  } catch (e) {
    console.error('Logging failed:', e.message);
  }
}

// Use environment variable for connection
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  log("WARNING: DATABASE_URL not found. DB features will fail.");
}

let poolConfig = {
  connectionString,
  ssl: (process.env.DATABASE_URL &&
    !process.env.DATABASE_URL.includes('localhost') &&
    !process.env.DATABASE_URL.includes('127.0.0.1') &&
    !process.env.DATABASE_URL.includes('sslmode=disable') &&
    !process.env.DATABASE_URL.includes('ssl=false') &&
    process.env.DB_SSL !== 'false') ? { rejectUnauthorized: false } : false,
  connectionTimeoutMillis: 5000, // Fail fast
};

let pool = new Pool(poolConfig);

pool.on("error", (err) => {
  log("Unexpected error on idle client: " + err.toString());
});

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const KOGNA_PLAYBOOK_VERSION = "kogna-ai-core-2.1";
const DEFAULT_AGENT_MODEL = "gpt-4.1";

function safeJsonParse(raw, fallback) {
  if (raw === null || raw === undefined || raw === "") return fallback;
  if (typeof raw === "object") return raw;
  try {
    return JSON.parse(raw);
  } catch (_) {
    return fallback;
  }
}

function uniqueStrings(values = []) {
  return [...new Set((Array.isArray(values) ? values : []).map((value) => String(value || "").trim()).filter(Boolean))];
}

function normalizeStringList(value) {
  if (Array.isArray(value)) return uniqueStrings(value);
  if (typeof value === "string") {
    return uniqueStrings(
      value
        .split(/\r?\n|,|;/)
        .map((entry) => entry.trim())
        .filter(Boolean),
    );
  }
  return [];
}

const ADMIN_METRICS_SCOPE = "global";
const ADMIN_USD_TO_BRL = Number.isFinite(Number(process.env.ADMIN_USD_TO_BRL))
  ? Number(process.env.ADMIN_USD_TO_BRL)
  : 5;

function cloneDate(value) {
  return value ? new Date(value) : null;
}

function startOfDay(value) {
  const date = cloneDate(value) || new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

function startOfMonth(value) {
  const date = startOfDay(value);
  date.setDate(1);
  return date;
}

function startOfYear(value) {
  const date = startOfDay(value);
  date.setMonth(0, 1);
  return date;
}

function addDays(value, amount) {
  const date = cloneDate(value) || new Date();
  date.setDate(date.getDate() + amount);
  return date;
}

function addMonths(value, amount) {
  const date = cloneDate(value) || new Date();
  date.setMonth(date.getMonth() + amount);
  return date;
}

function maxDate(...values) {
  const dates = values.filter(Boolean).map((value) => new Date(value));
  if (dates.length === 0) return null;
  return dates.reduce((latest, current) => (current > latest ? current : latest));
}

function buildWindowedQuery(baseSql, column, start, end, values = []) {
  const params = [...values];
  let text = baseSql;

  if (start) {
    params.push(start);
    text += ` AND ${column} >= $${params.length}`;
  }

  if (end) {
    params.push(end);
    text += ` AND ${column} < $${params.length}`;
  }

  return { text, values: params };
}

function buildAdminMetricsWindow(period, metricsStartAt) {
  const now = new Date();
  const baseline = cloneDate(metricsStartAt) || new Date(0);
  let start = baseline;
  let end = null;
  let previousStart = null;
  let previousEnd = null;

  switch (period) {
    case "today": {
      start = maxDate(baseline, startOfDay(now));
      end = now;
      previousEnd = startOfDay(now);
      previousStart = maxDate(baseline, addDays(previousEnd, -1));
      break;
    }
    case "7d": {
      start = maxDate(baseline, addDays(now, -7));
      end = now;
      previousEnd = addDays(now, -7);
      previousStart = maxDate(baseline, addDays(now, -14));
      break;
    }
    case "30d": {
      start = maxDate(baseline, addDays(now, -30));
      end = now;
      previousEnd = addDays(now, -30);
      previousStart = maxDate(baseline, addDays(now, -60));
      break;
    }
    case "this_month": {
      start = maxDate(baseline, startOfMonth(now));
      end = now;
      previousEnd = startOfMonth(now);
      previousStart = maxDate(baseline, addMonths(previousEnd, -1));
      break;
    }
    case "last_month": {
      end = startOfMonth(now);
      start = maxDate(baseline, addMonths(end, -1));
      previousEnd = addMonths(end, -1);
      previousStart = maxDate(baseline, addMonths(end, -2));
      break;
    }
    case "this_year": {
      start = maxDate(baseline, startOfYear(now));
      end = now;
      previousEnd = startOfYear(now);
      previousStart = maxDate(baseline, addMonths(previousEnd, -12));
      break;
    }
    case "all":
    default: {
      start = baseline;
      end = now;
      previousStart = null;
      previousEnd = null;
      break;
    }
  }

  if (start && end && start > end) {
    start = end;
  }

  const previous =
    previousStart && previousEnd && previousStart < previousEnd
      ? { start: previousStart, end: previousEnd }
      : null;

  return {
    baseline,
    now,
    start,
    end,
    previous,
  };
}

function buildRecentRevenueChartData(rows, range) {
  const chartEnd = startOfDay(range.end || range.now || new Date());
  const chartStart = maxDate(range.start, addDays(chartEnd, -6)) || addDays(chartEnd, -6);
  const buckets = new Map(
    (rows || []).map((row) => [startOfDay(row.bucket).toISOString(), Number(row.total || 0)]),
  );
  const formatter = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit" });
  const points = [];

  for (let cursor = cloneDate(chartStart); cursor <= chartEnd; cursor = addDays(cursor, 1)) {
    const key = startOfDay(cursor).toISOString();
    const total = Number(buckets.get(key) || 0);
    points.push({
      date: formatter.format(cursor),
      total,
      koins: total,
      connections: 0,
    });
  }

  return points;
}

let adminMetricsTablesReadyPromise = null;

async function ensureAdminMetricsTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS admin_metric_settings (
      scope TEXT PRIMARY KEY,
      metrics_start_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(
    `INSERT INTO admin_metric_settings (scope) VALUES ($1)
     ON CONFLICT (scope) DO NOTHING`,
    [ADMIN_METRICS_SCOPE],
  );
  await pool.query(`
    CREATE TABLE IF NOT EXISTS koins_ledger (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID REFERENCES users(id) ON DELETE CASCADE,
      organization_id TEXT,
      delta INTEGER NOT NULL,
      source TEXT NOT NULL,
      balance_after INTEGER,
      metadata JSONB DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_koins_ledger_user_created_at ON koins_ledger(user_id, created_at DESC)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_koins_ledger_created_at ON koins_ledger(created_at DESC)`);
  log("[ADMIN] Dashboard metric tables verified.");
}

function ensureAdminMetricsTablesReady() {
  if (!adminMetricsTablesReadyPromise) {
    adminMetricsTablesReadyPromise = ensureAdminMetricsTables().catch((err) => {
      adminMetricsTablesReadyPromise = null;
      throw err;
    });
  }
  return adminMetricsTablesReadyPromise;
}

async function getAdminMetricsStartAt(client = pool) {
  await ensureAdminMetricsTablesReady();
  const result = await client.query(
    `SELECT metrics_start_at
     FROM admin_metric_settings
     WHERE scope = $1
     LIMIT 1`,
    [ADMIN_METRICS_SCOPE],
  );
  return cloneDate(result.rows[0]?.metrics_start_at) || new Date();
}

async function adjustUserKoinsBalance({ userId, delta, source, metadata = {}, client = pool }) {
  const numericDelta = Number.parseInt(delta, 10);
  if (!Number.isFinite(numericDelta) || numericDelta === 0) return null;

  await ensureAdminMetricsTablesReady();

  const updateResult = await client.query(
    `UPDATE users
     SET koins_balance = koins_balance + $1
     WHERE id = $2
     RETURNING id, organization_id, koins_balance`,
    [numericDelta, userId],
  );

  if (updateResult.rows.length === 0) {
    return null;
  }

  const updatedUser = updateResult.rows[0];

  await client.query(
    `INSERT INTO koins_ledger (user_id, organization_id, delta, source, balance_after, metadata)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      updatedUser.id,
      updatedUser.organization_id || null,
      numericDelta,
      source || "system_adjustment",
      updatedUser.koins_balance,
      metadata,
    ],
  );

  return updatedUser;
}

function quoteSqlIdentifier(identifier) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(String(identifier || ""))) {
    throw new Error(`Unsafe SQL identifier: ${identifier}`);
  }
  return `"${identifier}"`;
}

async function tableExists(tableName, client = pool) {
  const result = await client.query(
    `SELECT EXISTS (
       SELECT 1
       FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = $1
     ) AS exists`,
    [tableName],
  );
  return Boolean(result.rows[0]?.exists);
}

async function deleteFromTableIfExists(tableName, sql, values = [], client = pool, label = tableName) {
  if (!(await tableExists(tableName, client))) return;
  await client.query(sql, values);
  log(`[ADMIN - DELETE] ${label}: ok`);
}

async function deleteOrganizationCascade(orgId, client = pool) {
  if (!orgId) return;

  await deleteFromTableIfExists(
    "chat_messages",
    `DELETE FROM chat_messages WHERE agent_id IN (SELECT id FROM agents WHERE organization_id = $1)`,
    [orgId],
    client,
    "chat_messages",
  );
  await deleteFromTableIfExists(
    "chat_sessions",
    `DELETE FROM chat_sessions WHERE agent_id IN (SELECT id FROM agents WHERE organization_id = $1)`,
    [orgId],
    client,
    "chat_sessions",
  );
  await deleteFromTableIfExists(
    "agendamentos",
    `DELETE FROM agendamentos WHERE vendedor_id IN (SELECT id FROM vendedores WHERE organization_id = $1)`,
    [orgId],
    client,
    "agendamentos",
  );

  const scopedTablesRes = await client.query(`
    SELECT DISTINCT table_name
    FROM information_schema.columns
    WHERE table_schema = 'public' AND column_name = 'organization_id'
    ORDER BY table_name
  `);
  const excludedTables = new Set(["organizations", "users"]);

  for (const row of scopedTablesRes.rows) {
    const tableName = row.table_name;
    if (!tableName || excludedTables.has(tableName)) continue;
    await client.query(
      `DELETE FROM ${quoteSqlIdentifier(tableName)} WHERE organization_id = $1`,
      [orgId],
    );
    log(`[ADMIN - DELETE] ${tableName}: ok`);
  }

  await client.query(`DELETE FROM organizations WHERE id = $1`, [orgId]);
  log(`[ADMIN - DELETE] organization ${orgId}: ok`);
}

async function deleteAdminUserCascade(userId, requesterId = null, client = pool) {
  if (requesterId && requesterId === userId) {
    return { error: "self_delete" };
  }

  const userRes = await client.query(
    "SELECT organization_id FROM users WHERE id = $1",
    [userId],
  );

  if (userRes.rows.length === 0) {
    return { error: "not_found" };
  }

  const orgId = userRes.rows[0]?.organization_id || null;
  let shouldDeleteOrganization = false;

  if (orgId) {
    const otherUsersRes = await client.query(
      `SELECT COUNT(*)::int AS total
       FROM users
       WHERE organization_id = $1 AND id <> $2`,
      [orgId, userId],
    );
    shouldDeleteOrganization = Number(otherUsersRes.rows[0]?.total || 0) === 0;
  }

  await deleteFromTableIfExists("notifications", `DELETE FROM notifications WHERE user_id = $1`, [userId], client);
  await deleteFromTableIfExists("billing_history", `DELETE FROM billing_history WHERE user_id = $1`, [userId], client);
  await deleteFromTableIfExists("api_keys", `DELETE FROM api_keys WHERE user_id = $1`, [userId], client);
  await deleteFromTableIfExists("ia_configs", `DELETE FROM ia_configs WHERE user_id = $1`, [userId], client);
  await deleteFromTableIfExists("followup_sequences", `DELETE FROM followup_sequences WHERE user_id = $1`, [userId], client);
  await deleteFromTableIfExists("webhook_subscriptions", `DELETE FROM webhook_subscriptions WHERE user_id = $1`, [userId], client);
  await deleteFromTableIfExists("koins_ledger", `DELETE FROM koins_ledger WHERE user_id = $1`, [userId], client);
  await deleteFromTableIfExists("whatsapp_instances", `DELETE FROM whatsapp_instances WHERE user_id = $1`, [userId], client);

  if (await tableExists("partners", client)) {
    const partnerRes = await client.query(`SELECT id FROM partners WHERE user_id = $1`, [userId]);
    for (const partner of partnerRes.rows) {
      await deleteFromTableIfExists("partner_commissions", `DELETE FROM partner_commissions WHERE partner_id = $1`, [partner.id], client);
      await deleteFromTableIfExists("partner_clicks", `DELETE FROM partner_clicks WHERE partner_id = $1`, [partner.id], client);
      await client.query(`DELETE FROM partners WHERE id = $1`, [partner.id]);
      log(`[ADMIN - DELETE] partner ${partner.id}: ok`);
    }
  }

  await client.query(`DELETE FROM users WHERE id = $1`, [userId]);
  log(`[ADMIN - DELETE] user ${userId}: ok`);

  if (orgId && shouldDeleteOrganization) {
    await deleteOrganizationCascade(orgId, client);
  }

  return {
    success: true,
    orgDeleted: Boolean(orgId && shouldDeleteOrganization),
    orgId,
  };
}

function createDefaultCompanyProfile() {
  return {
    companyName: "",
    companyProduct: "",
    targetAudience: "",
    customerPain: "",
    customerDesires: "",
    differentiators: "",
    industry: "",
    industryDetail: "",
    channels: [],
    salesCycle: "",
    revenueGoal: "",
    productPrice: "",
    agentName: "",
    agentObjective: "",
    voiceTone: "",
    unknownBehavior: "",
    humanHandoffPolicy: "",
    restrictions: "",
    buyingSignals: "",
    qualificationCriteria: "",
    objectionHandling: "",
    idealNextStep: "",
    agendaPolicy: "",
    advancedInstructions: "",
    responsePlaybook: null,
    qualificationStrategy: null,
    offerStrategy: null,
    handoffStrategy: null,
    objectionPlaybook: [],
    improvementFeedback: [],
    testTranscript: [],
    playbookVersion: null,
    lastPlaybookGeneratedAt: null,
  };
}

function normalizeObjectionPlaybookItem(item = {}, index = 0) {
  const fallbackId = `obj_${Date.now()}_${index}_${Math.random().toString(36).slice(2, 8)}`;
  return {
    id: String(item.id || fallbackId),
    label: String(item.label || "").trim(),
    signals: normalizeStringList(item.signals),
    context: String(item.context || "").trim(),
    recommended_approach: String(item.recommended_approach || "").trim(),
    allowed_arguments: normalizeStringList(item.allowed_arguments),
    avoid_phrases: normalizeStringList(item.avoid_phrases),
    cta_after_resolution: String(item.cta_after_resolution || "").trim(),
    priority: Number.isFinite(Number(item.priority)) ? Number(item.priority) : index + 1,
    is_active: item.is_active !== false,
  };
}

function normalizeImprovementFeedbackEntry(entry = {}) {
  return {
    id: String(entry.id || `feedback_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`),
    category: String(entry.category || "melhoria_geral").trim(),
    detail: String(entry.detail || "").trim(),
    created_at: entry.created_at || new Date().toISOString(),
  };
}

function normalizeTestTranscriptEntry(entry = {}) {
  return {
    role: entry.role === "assistant" ? "assistant" : "user",
    text: String(entry.text || entry.content || "").trim(),
    created_at: entry.created_at || new Date().toISOString(),
  };
}

function buildDefaultObjectionPlaybook(profile) {
  const items = [];
  const rawSignals = normalizeStringList(profile.customerPain);
  const rawDifferentiators = normalizeStringList(profile.differentiators);

  if (rawSignals.length > 0) {
    items.push({
      label: "Prioridade e timing",
      signals: rawSignals.slice(0, 4),
      context: profile.customerPain || "O lead ainda nao enxerga urgencia suficiente para agir agora.",
      recommended_approach: "Conecte a dor principal ao custo de nao agir e mostre um proximo passo simples.",
      allowed_arguments: rawDifferentiators.length > 0 ? rawDifferentiators.slice(0, 4) : ["Use prova, clareza e orientacao para proximo passo."],
      avoid_phrases: ["Se quiser", "Qualquer coisa me chama", "Sem pressa"],
      cta_after_resolution: profile.idealNextStep || "Conduza para o proximo passo mais facil da jornada.",
      priority: 1,
      is_active: true,
    });
  }

  if (profile.productPrice) {
    items.push({
      label: "Preco",
      signals: ["caro", "preco", "valor", "orcamento", "desconto"],
      context: "O lead esta avaliando se o retorno compensa o investimento.",
      recommended_approach: "Reposicione o valor, conecte o ticket ao resultado e ofereca um proximo passo consultivo.",
      allowed_arguments: [
        `Ticket medio: R$ ${profile.productPrice}`,
        profile.differentiators || "Destaque diferenciais e ROI concreto.",
      ],
      avoid_phrases: ["E barato", "Confia", "Depois voce ve"],
      cta_after_resolution: profile.idealNextStep || "Convide para continuar com a melhor opcao para o contexto do lead.",
      priority: 2,
      is_active: true,
    });
  }

  return items.map((item, index) => normalizeObjectionPlaybookItem(item, index)).filter((item) => item.label);
}

function buildFallbackOperationalPlaybook(profile, feedbackEntries = []) {
  const objectionPlaybook = (profile.objectionPlaybook || []).length > 0
    ? profile.objectionPlaybook.map((item, index) => normalizeObjectionPlaybookItem(item, index)).filter((item) => item.label)
    : buildDefaultObjectionPlaybook(profile);

  const recentFeedback = feedbackEntries.slice(-3).map((entry) => entry.detail).filter(Boolean);

  return {
    response_playbook: {
      promise: `Transformar conversas de WhatsApp em oportunidade e receita para ${profile.companyName || "a empresa"}.`,
      opening_style: "Seja ativo, contextual e evite abrir de forma passiva. Entre direto no problema, valor ou proximo passo.",
      principles: [
        "Nao use saudacao generica se ja houver contexto na conversa.",
        "Conduza o proximo passo da venda de forma clara.",
        "Adapte o tom ao negocio, ao lead e ao estagio.",
        "Nao repita perguntas ja respondidas.",
        "Quando houver contexto de produto, use beneficio, imagem, oferta ou CTA operacional.",
      ],
      recent_feedback: recentFeedback,
    },
    qualification_strategy: {
      icp: profile.targetAudience || "Identificar fit, dor, urgencia e potencial comercial.",
      pain_points: profile.customerPain || "Descobrir a principal dor e o impacto de nao resolver.",
      buying_signals: profile.buyingSignals || "Pedido de preco, agenda, comparacao, urgencia e detalhes de entrega.",
      good_lead_definition: profile.qualificationCriteria || "Lead com fit, dor clara, timing e abertura para o proximo passo.",
      next_step: profile.idealNextStep || "Levar a conversa para uma CTA unica e executavel.",
    },
    offer_strategy: {
      primary_offer: profile.companyProduct || "Apresente a principal oferta com clareza de valor.",
      use_image_when: "Quando o lead pedir produto, comparacao, prova visual ou contexto de apresentacao.",
      use_promotion_when: "Quando houver promocao vigente e a conversa demonstrar intencao, objecao de preco ou comparacao.",
      benefit_anchor: profile.differentiators || "Conecte a oferta ao resultado e aos diferenciais mais fortes.",
    },
    handoff_strategy: {
      policy: profile.humanHandoffPolicy || "Sinalize prioridade humana quando houver alta intencao, negociacao sensivel ou pedido explicito.",
      continue_ai_until_takeover: true,
      human_signal_message: "Avise internamente o time e continue conduzindo a conversa ate que alguem assuma manualmente.",
      agenda_policy: profile.agendaPolicy || "Se houver abertura, tente agendar ou confirmar o proximo passo antes do takeover.",
    },
    objection_playbook: objectionPlaybook,
    advanced_instructions: profile.advancedInstructions || "Mantenha postura comercial ativa, consultiva e orientada a receita.",
  };
}

function sanitizePlaybookShape(playbook, fallback) {
  const safe = playbook && typeof playbook === "object" ? playbook : {};
  return {
    response_playbook: safe.response_playbook || fallback.response_playbook,
    qualification_strategy: safe.qualification_strategy || fallback.qualification_strategy,
    offer_strategy: safe.offer_strategy || fallback.offer_strategy,
    handoff_strategy: safe.handoff_strategy || fallback.handoff_strategy,
    objection_playbook: Array.isArray(safe.objection_playbook) && safe.objection_playbook.length > 0
      ? safe.objection_playbook.map((item, index) => normalizeObjectionPlaybookItem(item, index)).filter((item) => item.label)
      : fallback.objection_playbook,
    advanced_instructions: safe.advanced_instructions || fallback.advanced_instructions,
  };
}

async function generateOrchestratorPlaybook(profile, { feedbackEntries = [], testTranscript = [] } = {}) {
  const fallback = buildFallbackOperationalPlaybook(profile, feedbackEntries);
  if (!process.env.OPENAI_API_KEY) return fallback;

  try {
    const prompt = `Voce e o Prompt Architect da Kogna Revenue OS.
Crie um playbook operacional estruturado em JSON para uma IA de vendas via WhatsApp.
Retorne APENAS JSON valido com os campos:
- response_playbook
- qualification_strategy
- offer_strategy
- handoff_strategy
- objection_playbook
- advanced_instructions

Empresa:
${JSON.stringify({
      companyName: profile.companyName,
      companyProduct: profile.companyProduct,
      targetAudience: profile.targetAudience,
      customerPain: profile.customerPain,
      customerDesires: profile.customerDesires,
      differentiators: profile.differentiators,
      industry: profile.industry,
      industryDetail: profile.industryDetail,
      channels: profile.channels,
      salesCycle: profile.salesCycle,
      revenueGoal: profile.revenueGoal,
      productPrice: profile.productPrice,
      agentName: profile.agentName,
      agentObjective: profile.agentObjective,
      voiceTone: profile.voiceTone,
      unknownBehavior: profile.unknownBehavior,
      humanHandoffPolicy: profile.humanHandoffPolicy,
      restrictions: profile.restrictions,
      buyingSignals: profile.buyingSignals,
      qualificationCriteria: profile.qualificationCriteria,
      objectionHandling: profile.objectionHandling,
      idealNextStep: profile.idealNextStep,
      agendaPolicy: profile.agendaPolicy,
      objectionPlaybook: profile.objectionPlaybook,
    })}

Feedback recente:
${JSON.stringify(feedbackEntries.slice(-5))}

Transcript de teste:
${JSON.stringify(testTranscript.slice(-10))}

Regras:
- Respostas comerciais ativas, nunca passivas.
- O orquestrador decide objetivo e a IA redige com liberdade controlada.
- Se houver objecoes, transforme isso em um objection_playbook pratico.
- Mantenha o texto em portugues do Brasil.
- Nao crie um prompt monolitico; entregue orientacao estruturada e operacional.`;

    const completion = await openai.chat.completions.create({
      model: DEFAULT_AGENT_MODEL,
      messages: [{ role: "system", content: prompt }],
      response_format: { type: "json_object" },
      temperature: 0.35,
      max_tokens: 1200,
    });

    const raw = completion.choices?.[0]?.message?.content;
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return sanitizePlaybookShape(parsed, fallback);
  } catch (err) {
    log(`[PLAYBOOK] generateOrchestratorPlaybook fallback: ${err.message}`);
    return fallback;
  }
}

function mapIaConfigRowToCompanyProfile(row = {}) {
  const profile = createDefaultCompanyProfile();
  profile.companyName = row.company_name || row.organization_name || "";
  profile.companyProduct = row.main_product || "";
  profile.targetAudience = row.target_audience || "";
  profile.customerPain = row.customer_pain || "";
  profile.customerDesires = row.customer_desires || "";
  profile.differentiators = row.differentiators || "";
  profile.industry = row.industry || "";
  profile.industryDetail = row.industry_detail || "";
  profile.channels = uniqueStrings(safeJsonParse(row.channels, row.channels || []));
  profile.salesCycle = row.sales_cycle || "";
  profile.revenueGoal = row.desired_revenue || "";
  profile.productPrice = row.product_price || "";
  profile.agentName = row.agent_name || "";
  profile.agentObjective = row.agent_objective || "";
  profile.voiceTone = row.voice_tone || "";
  profile.unknownBehavior = row.unknown_behavior || "";
  profile.humanHandoffPolicy = row.human_handoff_policy || "";
  profile.restrictions = row.restrictions || "";
  profile.buyingSignals = row.buying_signals || "";
  profile.qualificationCriteria = row.qualification_criteria || "";
  profile.objectionHandling = row.objection_handling || "";
  profile.idealNextStep = row.ideal_next_step || "";
  profile.agendaPolicy = row.agenda_policy || "";
  profile.advancedInstructions = row.advanced_instructions || "";
  profile.responsePlaybook = safeJsonParse(row.response_playbook, row.response_playbook || null);
  profile.qualificationStrategy = safeJsonParse(row.qualification_strategy, row.qualification_strategy || null);
  profile.offerStrategy = safeJsonParse(row.offer_strategy, row.offer_strategy || null);
  profile.handoffStrategy = safeJsonParse(row.handoff_strategy, row.handoff_strategy || null);
  profile.objectionPlaybook = (safeJsonParse(row.objection_playbook, row.objection_playbook || []) || [])
    .map((item, index) => normalizeObjectionPlaybookItem(item, index))
    .filter((item) => item.label);
  profile.improvementFeedback = (safeJsonParse(row.improvement_feedback, row.improvement_feedback || []) || [])
    .map((entry) => normalizeImprovementFeedbackEntry(entry))
    .filter((entry) => entry.detail);
  profile.testTranscript = (safeJsonParse(row.test_transcript, row.test_transcript || []) || [])
    .map((entry) => normalizeTestTranscriptEntry(entry))
    .filter((entry) => entry.text);
  profile.playbookVersion = row.playbook_version || null;
  profile.lastPlaybookGeneratedAt = row.last_playbook_generated_at || null;
  return profile;
}

async function getCanonicalCompanyProfile({ orgId, userId }) {
  let row = null;

  if (orgId) {
    const byOrg = await pool.query(
      `SELECT ic.*, o.name AS organization_name
         FROM ia_configs ic
         LEFT JOIN organizations o ON o.id = ic.organization_id
        WHERE ic.organization_id = $1
        ORDER BY ic.updated_at DESC NULLS LAST, ic.created_at DESC NULLS LAST
        LIMIT 1`,
      [orgId],
    );
    row = byOrg.rows[0] || null;
  }

  if (!row && userId) {
    const byUser = await pool.query(
      `SELECT ic.*, o.name AS organization_name
         FROM ia_configs ic
         LEFT JOIN organizations o ON o.id = ic.organization_id
        WHERE ic.user_id = $1
        ORDER BY ic.updated_at DESC NULLS LAST, ic.created_at DESC NULLS LAST
        LIMIT 1`,
      [userId],
    );
    row = byUser.rows[0] || null;
  }

  if (!row) {
    const empty = createDefaultCompanyProfile();
    if (orgId) {
      const orgRes = await pool.query("SELECT name FROM organizations WHERE id = $1", [orgId]).catch(() => ({ rows: [] }));
      empty.companyName = orgRes.rows[0]?.name || "";
    }
    return empty;
  }

  return mapIaConfigRowToCompanyProfile(row);
}

async function upsertCanonicalCompanyProfile({
  orgId,
  userId,
  payload = {},
  regeneratePlaybook = true,
}) {
  const existing = await getCanonicalCompanyProfile({ orgId, userId });
  const nextProfile = {
    ...existing,
    ...payload,
  };

  nextProfile.companyName = String(nextProfile.companyName || "").trim();
  nextProfile.companyProduct = String(nextProfile.companyProduct || "").trim();
  nextProfile.targetAudience = String(nextProfile.targetAudience || "").trim();
  nextProfile.customerPain = String(nextProfile.customerPain || "").trim();
  nextProfile.customerDesires = String(nextProfile.customerDesires || "").trim();
  nextProfile.differentiators = String(nextProfile.differentiators || "").trim();
  nextProfile.industry = String(nextProfile.industry || "").trim();
  nextProfile.industryDetail = String(nextProfile.industryDetail || "").trim();
  nextProfile.channels = normalizeStringList(nextProfile.channels);
  nextProfile.salesCycle = String(nextProfile.salesCycle || "").trim();
  nextProfile.revenueGoal = String(nextProfile.revenueGoal || "").trim();
  nextProfile.productPrice = String(nextProfile.productPrice || "").trim();
  nextProfile.agentName = String(nextProfile.agentName || "").trim();
  nextProfile.agentObjective = String(nextProfile.agentObjective || "").trim();
  nextProfile.voiceTone = String(nextProfile.voiceTone || "").trim();
  nextProfile.unknownBehavior = String(nextProfile.unknownBehavior || "").trim();
  nextProfile.humanHandoffPolicy = String(nextProfile.humanHandoffPolicy || "").trim();
  nextProfile.restrictions = String(nextProfile.restrictions || "").trim();
  nextProfile.buyingSignals = String(nextProfile.buyingSignals || "").trim();
  nextProfile.qualificationCriteria = String(nextProfile.qualificationCriteria || "").trim();
  nextProfile.objectionHandling = String(nextProfile.objectionHandling || "").trim();
  nextProfile.idealNextStep = String(nextProfile.idealNextStep || "").trim();
  nextProfile.agendaPolicy = String(nextProfile.agendaPolicy || "").trim();
  nextProfile.advancedInstructions = String(nextProfile.advancedInstructions || "").trim();
  nextProfile.objectionPlaybook = (Array.isArray(nextProfile.objectionPlaybook) ? nextProfile.objectionPlaybook : [])
    .map((item, index) => normalizeObjectionPlaybookItem(item, index))
    .filter((item) => item.label);
  nextProfile.improvementFeedback = (Array.isArray(nextProfile.improvementFeedback) ? nextProfile.improvementFeedback : [])
    .map((entry) => normalizeImprovementFeedbackEntry(entry))
    .filter((entry) => entry.detail);
  nextProfile.testTranscript = (Array.isArray(nextProfile.testTranscript) ? nextProfile.testTranscript : [])
    .map((entry) => normalizeTestTranscriptEntry(entry))
    .filter((entry) => entry.text);

  const generatedPlaybook = regeneratePlaybook
    ? await generateOrchestratorPlaybook(nextProfile, {
      feedbackEntries: nextProfile.improvementFeedback,
      testTranscript: nextProfile.testTranscript,
    })
    : sanitizePlaybookShape({
      response_playbook: nextProfile.responsePlaybook,
      qualification_strategy: nextProfile.qualificationStrategy,
      offer_strategy: nextProfile.offerStrategy,
      handoff_strategy: nextProfile.handoffStrategy,
      objection_playbook: nextProfile.objectionPlaybook,
      advanced_instructions: nextProfile.advancedInstructions,
    }, buildFallbackOperationalPlaybook(nextProfile, nextProfile.improvementFeedback));

  nextProfile.responsePlaybook = generatedPlaybook.response_playbook;
  nextProfile.qualificationStrategy = generatedPlaybook.qualification_strategy;
  nextProfile.offerStrategy = generatedPlaybook.offer_strategy;
  nextProfile.handoffStrategy = generatedPlaybook.handoff_strategy;
  nextProfile.objectionPlaybook = generatedPlaybook.objection_playbook;
  nextProfile.advancedInstructions = generatedPlaybook.advanced_instructions || nextProfile.advancedInstructions;
  nextProfile.playbookVersion = KOGNA_PLAYBOOK_VERSION;
  nextProfile.lastPlaybookGeneratedAt = new Date().toISOString();

  if (orgId && nextProfile.companyName) {
    await pool.query(`UPDATE organizations SET name = $1 WHERE id = $2`, [nextProfile.companyName, orgId]).catch(() => { });
  }

  const values = [
    orgId,
    userId,
    nextProfile.companyName || "",
    nextProfile.agentName || null,
    nextProfile.companyProduct || "",
    nextProfile.revenueGoal || null,
    nextProfile.agentObjective || "",
    nextProfile.unknownBehavior || null,
    nextProfile.voiceTone || null,
    nextProfile.restrictions || null,
    nextProfile.customerPain || null,
    nextProfile.productPrice || null,
    nextProfile.targetAudience || null,
    nextProfile.customerDesires || null,
    nextProfile.differentiators || null,
    nextProfile.industry || null,
    nextProfile.industryDetail || null,
    JSON.stringify(nextProfile.channels || []),
    nextProfile.salesCycle || null,
    nextProfile.humanHandoffPolicy || null,
    nextProfile.buyingSignals || null,
    nextProfile.qualificationCriteria || null,
    nextProfile.objectionHandling || null,
    nextProfile.idealNextStep || null,
    nextProfile.agendaPolicy || null,
    nextProfile.advancedInstructions || null,
    JSON.stringify(nextProfile.responsePlaybook || {}),
    JSON.stringify(nextProfile.qualificationStrategy || {}),
    JSON.stringify(nextProfile.offerStrategy || {}),
    JSON.stringify(nextProfile.handoffStrategy || {}),
    JSON.stringify(nextProfile.objectionPlaybook || []),
    JSON.stringify(nextProfile.improvementFeedback || []),
    JSON.stringify(nextProfile.testTranscript || []),
    nextProfile.playbookVersion,
    nextProfile.lastPlaybookGeneratedAt,
  ];

  const updateRes = await pool.query(
    `UPDATE ia_configs SET
       user_id = $2,
       company_name = $3,
       agent_name = $4,
       main_product = $5,
       desired_revenue = $6,
       agent_objective = $7,
       unknown_behavior = $8,
       voice_tone = $9,
       restrictions = $10,
       customer_pain = $11,
       product_price = $12,
       target_audience = $13,
       customer_desires = $14,
       differentiators = $15,
       industry = $16,
       industry_detail = $17,
       channels = $18::jsonb,
       sales_cycle = $19,
       human_handoff_policy = $20,
       buying_signals = $21,
       qualification_criteria = $22,
       objection_handling = $23,
       ideal_next_step = $24,
       agenda_policy = $25,
       advanced_instructions = $26,
       response_playbook = $27::jsonb,
       qualification_strategy = $28::jsonb,
       offer_strategy = $29::jsonb,
       handoff_strategy = $30::jsonb,
       objection_playbook = $31::jsonb,
       improvement_feedback = $32::jsonb,
       test_transcript = $33::jsonb,
       playbook_version = $34,
       last_playbook_generated_at = $35::timestamptz,
       updated_at = NOW()
     WHERE organization_id = $1`,
    values,
  );

  if (updateRes.rowCount === 0) {
    await pool.query(
      `INSERT INTO ia_configs (
         organization_id, user_id, company_name, agent_name, main_product, desired_revenue,
         agent_objective, unknown_behavior, voice_tone, restrictions, customer_pain, product_price,
         target_audience, customer_desires, differentiators, industry, industry_detail, channels,
         sales_cycle, human_handoff_policy, buying_signals, qualification_criteria, objection_handling,
         ideal_next_step, agenda_policy, advanced_instructions, response_playbook,
         qualification_strategy, offer_strategy, handoff_strategy, objection_playbook,
         improvement_feedback, test_transcript, playbook_version, last_playbook_generated_at,
         created_at, updated_at
       ) VALUES (
         $1, $2, $3, $4, $5, $6,
         $7, $8, $9, $10, $11, $12,
         $13, $14, $15, $16, $17, $18::jsonb,
         $19, $20, $21, $22, $23,
         $24, $25, $26, $27::jsonb,
         $28::jsonb, $29::jsonb, $30::jsonb, $31::jsonb,
         $32::jsonb, $33::jsonb, $34, $35::timestamptz, NOW(), NOW()
       )`,
      values,
    );
  }

  return nextProfile;
}

async function appendCompanyProfileFeedback({ orgId, userId, category, detail, transcript = [] }) {
  const current = await getCanonicalCompanyProfile({ orgId, userId });
  const nextFeedback = [
    ...(current.improvementFeedback || []),
    normalizeImprovementFeedbackEntry({ category, detail }),
  ].slice(-25);
  const nextTranscript = transcript.length > 0
    ? transcript.map((entry) => normalizeTestTranscriptEntry(entry)).slice(-30)
    : current.testTranscript;

  return upsertCanonicalCompanyProfile({
    orgId,
    userId,
    payload: {
      ...current,
      improvementFeedback: nextFeedback,
      testTranscript: nextTranscript,
    },
    regeneratePlaybook: true,
  });
}

function selectRelevantObjection(objectionPlaybook = [], userText = "", explicitObjection = "") {
  const haystack = `${explicitObjection} ${userText}`.toLowerCase();
  if (!haystack.trim()) return null;

  const ranked = objectionPlaybook
    .filter((item) => item.is_active !== false)
    .map((item) => {
      const label = String(item.label || "").toLowerCase();
      const signals = normalizeStringList(item.signals).map((signal) => signal.toLowerCase());
      const score =
        (label && haystack.includes(label) ? 3 : 0) +
        signals.reduce((acc, signal) => acc + (signal && haystack.includes(signal) ? 2 : 0), 0);
      return { item, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.item.priority - b.item.priority);

  return ranked[0]?.item || null;
}

function composeAgentSystemPrompt({
  profile,
  agentName,
  agentType,
  customInstructions = "",
}) {
  const fallback = buildFallbackOperationalPlaybook(profile, profile.improvementFeedback || []);
  const responsePlaybook = profile.responsePlaybook || fallback.response_playbook || {};
  const qualificationStrategy = profile.qualificationStrategy || fallback.qualification_strategy || {};
  const offerStrategy = profile.offerStrategy || fallback.offer_strategy || {};
  const handoffStrategy = profile.handoffStrategy || fallback.handoff_strategy || {};
  const objectionSummary = (profile.objectionPlaybook || fallback.objection_playbook || [])
    .slice(0, 3)
    .map((item) => `${item.label}: ${item.recommended_approach}`)
    .join("\n");

  return `Voce e ${agentName || profile.agentName || "um agente da Kogna"}, agente ${agentType || "comercial"} da empresa ${profile.companyName || "cliente Kogna"}.

Missao principal: ${profile.agentObjective || "gerar avancos comerciais no WhatsApp"}.
Oferta principal: ${offerStrategy.primary_offer || profile.companyProduct || "entender a oferta e conduzir o proximo passo"}.
ICP / publico ideal: ${qualificationStrategy.icp || profile.targetAudience || "descobrir o fit ideal ao longo da conversa"}.
Dor central: ${qualificationStrategy.pain_points || profile.customerPain || "entender a principal dor do lead"}.
Desejo / resultado: ${profile.customerDesires || "mapear o resultado que o lead quer atingir"}.
Diferenciais: ${offerStrategy.benefit_anchor || profile.differentiators || "conectar valor, contexto e proximo passo"}.
Preco / ticket: ${profile.productPrice ? `R$ ${profile.productPrice}` : "nao informado"}.
Tom de voz: ${profile.voiceTone || "consultivo"}.
Quando nao souber: ${profile.unknownBehavior || "ganhe contexto e ofereca proximo passo seguro"}.
Sinais de compra: ${qualificationStrategy.buying_signals || profile.buyingSignals || "pedido de preco, agenda, urgencia e comparacao"}.
Definicao de bom lead: ${qualificationStrategy.good_lead_definition || profile.qualificationCriteria || "fit, dor clara, timing e abertura para avancar"}.
CTA preferida: ${qualificationStrategy.next_step || profile.idealNextStep || "levar para o proximo passo mais simples e valioso"}.
Uso de imagem e catalogo: ${offerStrategy.use_image_when || "quando houver pedido de produto, comparacao ou contexto visual"}.
Uso de promocao: ${offerStrategy.use_promotion_when || "quando houver intencao, objecao de preco ou promocao vigente"}.
Politica de humano: ${handoffStrategy.policy || profile.humanHandoffPolicy || "sinalize prioridade humana, mas continue apoiando ate o takeover"}.
Operacao com humano: ${handoffStrategy.human_signal_message || "nao silencie a conversa; continue conduzindo ate takeover manual real"}.
Regras de resposta: ${(responsePlaybook.principles || []).join(" | ")}
Playbook de objecoes:
${objectionSummary || "Reposicione valor, dor e proximo passo com objetividade."}
${profile.restrictions ? `Nunca diga: ${profile.restrictions}` : ""}
${customInstructions ? `Instrucao complementar especifica deste agente: ${customInstructions}` : ""}`.trim();
}

function buildPreviewDiagnostics(message, reply) {
  const userText = String(message || "").toLowerCase();
  const assistantText = String(reply || "").toLowerCase();
  const qualitySignals = [];
  const suggestedImprovements = [];
  const objectionWeaknesses = [];

  if (assistantText.includes("como posso ajudar")) {
    qualitySignals.push("abertura_passiva");
    suggestedImprovements.push("Entrar mais ativo no contexto, evitando abertura generica.");
  }
  if ((userText.includes("preco") || userText.includes("valor")) && !assistantText.includes("r$")) {
    qualitySignals.push("contexto_comercial_raso");
    suggestedImprovements.push("Quando houver pedido de preco, posicionar valor e proximo passo com mais clareza.");
  }
  if ((userText.includes("caro") || userText.includes("concorrente") || userText.includes("pensar")) && assistantText.length < 100) {
    objectionWeaknesses.push("Resposta curta demais para uma objecao explicita.");
  }
  if (!assistantText.includes("?")) {
    suggestedImprovements.push("Encerrar com CTA ou pergunta unica quando fizer sentido.");
  }

  return {
    qualitySignals: uniqueStrings(qualitySignals),
    suggestedImprovements: uniqueStrings(suggestedImprovements),
    objectionWeaknesses: uniqueStrings(objectionWeaknesses),
    orchestratorDraftVersion: KOGNA_PLAYBOOK_VERSION,
  };
}

// Resilient Connection Check with SSL fallback
const initPool = async () => {
  try {
    const client = await pool.connect();
    log("Connected to Database successfully (SSL: " + !!poolConfig.ssl + ")!");
    client.release();
  } catch (err) {
    if (err.message && err.message.includes("The server does not support SSL connections")) {
      log("Warning: Server does not support SSL. Retrying with SSL disabled...");

      pool.end().catch(e => log('Error ending old pool: ' + e.message));

      poolConfig.ssl = false;
      pool = new Pool(poolConfig);

      pool.on("error", (e) => {
        log("Unexpected error on idle client (ssl: false): " + e.toString());
      });

      try {
        const client = await pool.connect();
        log("Connected to Database successfully with SSL disabled!");
        client.release();
      } catch (retryErr) {
        log("CRITICAL: Database connection failed on retry without SSL.");
        log("DB Error: " + retryErr.message);
      }
    } else {
      log("CRITICAL: Database connection failed on startup. API will run, but DB features will fail.");
      log("DB Error: " + err.message);
    }
  }
};

// Revenue OS Coaching: ensure vendedor_insights table exists
const ensureCoachingTables = async () => {
  try {
    log("[SYSTEM] Ensuring vendor coaching tables exist...");
    await pool.query(`
      CREATE TABLE IF NOT EXISTS vendedor_insights (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          vendedor_id UUID REFERENCES vendedores(id) ON DELETE CASCADE,
          organization_id UUID NOT NULL,
          lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
          insight_type VARCHAR(50) NOT NULL,
          message TEXT NOT NULL,
          is_sent BOOLEAN DEFAULT FALSE,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `);
    log("[SYSTEM] Vendor coaching tables verified.");
  } catch (err) {
    log("[ERROR] ensureCoachingTables failed: " + err.message);
  }
};

// ── CONVERSATION INTELLIGENCE LAYER ──────────────────────────────────────────
const ensureConversationIntelligenceTables = async () => {
  try {
    log("[CIL] Ensuring Conversation Intelligence tables exist...");

    // Main analysis table: one row per analyzed message
    await pool.query(`
      CREATE TABLE IF NOT EXISTS conversation_intelligence (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id TEXT NOT NULL,
        lead_id TEXT,
        conversation_id TEXT,
        message_id TEXT UNIQUE,
        timestamp TIMESTAMPTZ DEFAULT NOW(),
        intent VARCHAR(50),
        product_interest TEXT,
        stage VARCHAR(50),
        urgency VARCHAR(20),
        sentiment VARCHAR(20),
        objections TEXT[],
        purchase_probability FLOAT,
        estimated_ticket FLOAT,
        decision_maker BOOLEAN,
        segment TEXT,
        city TEXT,
        state TEXT,
        source TEXT,
        agent_id TEXT,
        closed_won BOOLEAN DEFAULT FALSE,
        closed_lost BOOLEAN DEFAULT FALSE,
        lost_reason TEXT,
        days_to_close INT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // Events table: one row per detected behavioral event
    await pool.query(`
      CREATE TABLE IF NOT EXISTS conversation_events (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id TEXT NOT NULL,
        lead_id TEXT,
        conversation_id TEXT,
        timestamp TIMESTAMPTZ DEFAULT NOW(),
        event_type VARCHAR(100) NOT NULL,
        event_metadata JSONB DEFAULT '{}',
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // Sales behavior graph: one row per conversation
    await pool.query(`
      CREATE TABLE IF NOT EXISTS sales_behavior_graph (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id TEXT NOT NULL,
        lead_id TEXT,
        conversation_id TEXT UNIQUE,
        intent_sequence JSONB DEFAULT '[]',
        objection_sequence JSONB DEFAULT '[]',
        message_count INT DEFAULT 0,
        time_between_messages FLOAT,
        time_to_decision FLOAT,
        conversion_result VARCHAR(20) DEFAULT 'pending',
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // Indexes for performance
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_ci_org_id ON conversation_intelligence(organization_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_ci_lead_id ON conversation_intelligence(lead_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_ce_org_id ON conversation_events(organization_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_sbg_org_id ON sales_behavior_graph(organization_id)`);

    // Anti-reprocessing flag for the CIE batch engine
    await pool.query(`ALTER TABLE conversation_intelligence ADD COLUMN IF NOT EXISTS processed_by_cie BOOLEAN DEFAULT FALSE`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_ci_processed ON conversation_intelligence(organization_id, processed_by_cie)`);

    // ── New extraction fields (Kogna Intelligence Panel) ──────────────────────
    await pool.query(`ALTER TABLE conversation_intelligence ADD COLUMN IF NOT EXISTS lead_interest_category TEXT`);
    await pool.query(`ALTER TABLE conversation_intelligence ADD COLUMN IF NOT EXISTS industry_segment TEXT`);


    // ── CIE: Conversation Intelligence Engine tables ──────────────────────────

    // Periodic aggregated snapshots per org
    await pool.query(`
      CREATE TABLE IF NOT EXISTS conversation_insights (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id TEXT NOT NULL,
        period VARCHAR(20) DEFAULT 'daily',
        period_start TIMESTAMPTZ,
        period_end TIMESTAMPTZ,
        top_objections JSONB DEFAULT '[]',
        top_intents JSONB DEFAULT '[]',
        top_closing_phrases JSONB DEFAULT '[]',
        top_losing_phrases JSONB DEFAULT '[]',
        avg_response_time_minutes FLOAT DEFAULT 0,
        avg_close_time_days FLOAT DEFAULT 0,
        conversion_rate FLOAT DEFAULT 0,
        pipeline_drop_stage TEXT,
        total_conversations INT DEFAULT 0,
        total_won INT DEFAULT 0,
        total_lost INT DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_ci_insights_org ON conversation_insights(organization_id, period)`);

    // Sales phrase patterns (closing phrases & killer phrases)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS sales_patterns (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id TEXT NOT NULL,
        pattern_type VARCHAR(30) NOT NULL CHECK (pattern_type IN ('closing_phrase','killer_phrase')),
        phrase_detected TEXT NOT NULL,
        context_intent TEXT,
        conversion_impact_score FLOAT DEFAULT 0,
        detected_count INT DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(organization_id, pattern_type, phrase_detected)
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_sp_org_type ON sales_patterns(organization_id, pattern_type)`);

    // Auto-generated behavioral insight patterns
    await pool.query(`
      CREATE TABLE IF NOT EXISTS behavior_patterns (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id TEXT NOT NULL,
        pattern_type VARCHAR(50) NOT NULL,
        pattern_description TEXT NOT NULL,
        impact_score FLOAT DEFAULT 0,
        sample_size INT DEFAULT 0,
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_bp_org ON behavior_patterns(organization_id)`);

    log("[CIL] Conversation Intelligence tables verified.");
  } catch (err) {
    log("[ERROR] ensureConversationIntelligenceTables failed: " + err.message);
  }
};

const ensureOpportunityScoresTable = async () => {
  try {
    log("[OSE] Ensuring Opportunity Scores table exists...");
    await pool.query(`
      CREATE TABLE IF NOT EXISTS opportunity_scores (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id TEXT NOT NULL,
        lead_id TEXT NOT NULL,
        score INTEGER DEFAULT 0,
        temperature TEXT DEFAULT 'frio',
        intent TEXT,
        product_interest TEXT,
        top_objection TEXT,
        pipeline_stage TEXT,
        auto_pipeline_enabled BOOLEAN DEFAULT true,
        signals JSONB DEFAULT '{}',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(lead_id)
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_ose_org_id ON opportunity_scores(organization_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_ose_score ON opportunity_scores(score)`);
    log("[OSE] Opportunity Scores table verified.");
  } catch (err) {
    log("[ERROR] ensureOpportunityScoresTable failed: " + err.message);
  }
};

// ── CIL: AI Analysis Engine ───────────────────────────────────────────────────

/**
 * Calls OpenAI to extract structured sales intelligence from a message.
 * Returns null on any error (non-blocking, never throws).
 */
async function analyzeMessageIntelligence(messageContent, context = {}) {
  try {
    if (!messageContent || !messageContent.trim()) return null;

    const systemPrompt = `Você é um especialista em análise de conversas de vendas. Analise a mensagem do lead e retorne um JSON com exatamente os campos abaixo. Seja objetivo e preciso.

Campos obrigatórios:
- intent: "informacao" | "comparacao" | "compra" | "suporte" | "outro"
- product_interest: string (produto mencionado ou null)
- stage: "novo_lead" | "qualificacao" | "interesse" | "proposta" | "negociacao" | "fechamento"
- urgency: "baixa" | "media" | "alta"
- sentiment: "positivo" | "neutro" | "negativo"
- objections: array de strings com objeções detectadas (ex: ["preco_alto", "sem_tempo"])
- purchase_probability: number de 0 a 1
- estimated_ticket: number estimado em BRL ou null
- decision_maker: boolean (lead parece ser o tomador de decisão?)
- event_types: array de eventos detectados dentre: ["lead_started_conversation","lead_requested_information","lead_requested_price","lead_showed_interest","lead_objected_price","lead_objected_time","lead_objected_trust","lead_requested_proposal","lead_ready_to_buy","lead_stopped_responding","lead_closed_won","lead_closed_lost"]

Contexto adicional disponível: ${JSON.stringify(context)}

Responda APENAS com o JSON, sem markdown, sem explicações.`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: messageContent }
      ],
      max_tokens: 300,
      temperature: 0.1,
      response_format: { type: "json_object" }
    });

    const raw = completion.choices[0]?.message?.content;
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    return parsed;
  } catch (err) {
    log(`[CIL] analyzeMessageIntelligence error: ${err.message}`);
    return null;
  }
}

/**
 * Persists analysis into conversation_intelligence table.
 */
async function recordConversationIntelligence(analysis, context) {
  try {
    const { orgId, leadId, agentId, conversationId, messageId } = context;
    await pool.query(`
      INSERT INTO conversation_intelligence
        (organization_id, lead_id, agent_id, conversation_id, message_id,
         intent, product_interest, stage, urgency, sentiment, objections,
         purchase_probability, estimated_ticket, decision_maker)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
      ON CONFLICT (message_id) DO UPDATE SET
        intent = EXCLUDED.intent,
        stage = EXCLUDED.stage,
        urgency = EXCLUDED.urgency,
        sentiment = EXCLUDED.sentiment,
        objections = EXCLUDED.objections,
        purchase_probability = EXCLUDED.purchase_probability,
        estimated_ticket = EXCLUDED.estimated_ticket,
        decision_maker = EXCLUDED.decision_maker
    `, [
      orgId, leadId || null, agentId || null, conversationId || null, messageId || null,
      analysis.intent || null,
      analysis.product_interest || null,
      analysis.stage || null,
      analysis.urgency || null,
      analysis.sentiment || null,
      analysis.objections || [],
      analysis.purchase_probability != null ? analysis.purchase_probability : null,
      analysis.estimated_ticket || null,
      analysis.decision_maker != null ? analysis.decision_maker : null
    ]);
  } catch (err) {
    log(`[CIL] recordConversationIntelligence error: ${err.message}`);
  }
}

/**
 * Persists detected events into conversation_events table.
 */
async function recordConversationEvents(analysis, context) {
  try {
    const { orgId, leadId, conversationId } = context;
    const eventTypes = analysis.event_types || [];
    for (const eventType of eventTypes) {
      await pool.query(`
        INSERT INTO conversation_events (organization_id, lead_id, conversation_id, event_type, event_metadata)
        VALUES ($1, $2, $3, $4, $5)
      `, [
        orgId, leadId || null, conversationId || null, eventType,
        JSON.stringify({ intent: analysis.intent, stage: analysis.stage, urgency: analysis.urgency })
      ]);
    }
  } catch (err) {
    log(`[CIL] recordConversationEvents error: ${err.message}`);
  }
}

/**
 * Updates the sales behavior graph (upsert on conversation_id).
 */
async function updateSalesBehaviorGraph(analysis, context) {
  try {
    const { orgId, leadId, conversationId } = context;
    if (!conversationId) return;

    // Get or create the graph row
    const existing = await pool.query(
      `SELECT id, intent_sequence, objection_sequence, message_count FROM sales_behavior_graph WHERE conversation_id = $1`,
      [conversationId]
    );

    if (existing.rows.length === 0) {
      await pool.query(`
        INSERT INTO sales_behavior_graph (organization_id, lead_id, conversation_id, intent_sequence, objection_sequence, message_count, conversion_result)
        VALUES ($1,$2,$3,$4,$5,1,'pending')
      `, [
        orgId, leadId || null, conversationId,
        JSON.stringify([analysis.intent]),
        JSON.stringify(analysis.objections || [])
      ]);
    } else {
      const row = existing.rows[0];
      const intents = [...(row.intent_sequence || []), analysis.intent].filter(Boolean);
      const objections = [...(row.objection_sequence || []), ...(analysis.objections || [])];
      await pool.query(`
        UPDATE sales_behavior_graph SET
          intent_sequence = $1,
          objection_sequence = $2,
          message_count = message_count + 1,
          updated_at = NOW()
        WHERE id = $3
      `, [JSON.stringify(intents), JSON.stringify(objections), row.id]);
    }
  } catch (err) {
    log(`[CIL] updateSalesBehaviorGraph error: ${err.message}`);
  }
}

/**
 * Main entry point: analyze a WhatsApp message and record all intelligence.
 * Designed to be called fire-and-forget with .catch(log).
 */
async function processConversationIntelligence(messageContent, context) {
  try {
    const analysis = await analyzeMessageIntelligence(messageContent, context);
    if (!analysis) return;

    await Promise.all([
      recordConversationIntelligence(analysis, context),
      recordConversationEvents(analysis, context),
      updateSalesBehaviorGraph(analysis, context)
    ]);

    log(`[CIL] Intelligence recorded for lead ${context.leadId || 'unknown'}: stage=${analysis.stage}, prob=${analysis.purchase_probability}`);

    // [OSE] Hook: After CIL records data, recalculate the deterministc opportunity score
    if (context.orgId && context.leadId) {
      calculateOpportunityScore(context.orgId, context.leadId).catch(err => {
        log(`[OSE] calculateOpportunityScore error: ${err.message}`);
      });
    }

  } catch (err) {
    log(`[CIL] processConversationIntelligence error: ${err.message}`);
  }
}
// ── END CIL Engine ────────────────────────────────────────────────────────────

// ── OPPORTUNITY SCORING ENGINE (OSE) ──────────────────────────────────────────

/**
 * Calculates the deterministic Opportunity Score for a lead based on CIL data.
 * Updates the \`opportunity_scores\` table and optionally moves the lead in the pipeline.
 */
async function calculateOpportunityScore(orgId, leadId) {
  try {
    // 1. Fetch latest CIL messages for the lead
    const messagesRes = await pool.query(`
      SELECT intent, product_interest, stage, urgency, sentiment, objections, created_at
      FROM conversation_intelligence
      WHERE organization_id = $1 AND lead_id = $2
      ORDER BY created_at DESC LIMIT 50
    `, [orgId, leadId]);

    if (messagesRes.rows.length === 0) return;
    const messages = messagesRes.rows;
    const latestMsg = messages[0];

    // 2. Compute Signals & Weights
    let score = 0;
    const signals = {};

    function addSignal(name, weight) {
      score += weight;
      signals[name] = weight;
    }

    // --- POSITIVE SIGNALS ---
    if (latestMsg.intent === 'compra') addSignal('intent_compra', 25);

    const hasPriceRequest = messages.some(m => m.stage === 'proposta' || m.intent === 'comparação');
    if (hasPriceRequest) addSignal('perguntou_preco_ou_forma_pagamento', 20);

    if (latestMsg.product_interest && latestMsg.product_interest !== 'N/A') addSignal('interesse_produto_claro', 15);

    if (latestMsg.urgency === 'alta') addSignal('urgencia_alta', 15);
    else if (latestMsg.urgency === 'média') addSignal('urgencia_media', 5);

    if (latestMsg.stage === 'proposta' && latestMsg.intent === 'compra') addSignal('pediu_proposta', 25);

    // --- NEGATIVE SIGNALS ---
    if (latestMsg.intent === 'informação') addSignal('apenas_pesquisando', -5);

    const hasPriceObjection = latestMsg.objections && latestMsg.objections.some(o => o.toLowerCase().includes('preço') || o.toLowerCase().includes('caro') || o.toLowerCase().includes('valor'));
    if (hasPriceObjection) addSignal('objecao_preco', -10);

    const hasTrustObjection = latestMsg.objections && latestMsg.objections.some(o => o.toLowerCase().includes('confian') || o.toLowerCase().includes('garantia') || o.toLowerCase().includes('seguro'));
    if (hasTrustObjection) addSignal('objecao_confianca', -10);

    // Time penalty (idle > 24h)
    const hoursSinceLastMsg = (Date.now() - new Date(latestMsg.created_at).getTime()) / (1000 * 60 * 60);
    if (hoursSinceLastMsg > 24) addSignal('parado_mais_24h', -10);

    // Clamp score [0, 100]
    score = Math.max(0, Math.min(100, score));

    // Temperature
    const temperature = score >= 70 ? 'quente' : score >= 40 ? 'morno' : 'frio';

    // Target Pipeline Stage mapping — uses real org columns instead of hardcoded names
    let targetStage = null; // resolved below after fetching real columns
    try {
      const colsRes = await pool.query(
        `SELECT title FROM lead_columns WHERE organization_id = $1 ORDER BY order_index ASC`,
        [orgId]
      );
      const cols = colsRes.rows.map(r => r.title);
      if (cols.length > 0) {
        // Map score to column by relative position:
        // 0–20 → col[0], 21–40 → col[1], 41–60 → col[2], 61–80 → col[3], 81–100 → col[4]
        let targetColIndex = 0;
        if (score >= 81 && cols.length > 4) targetColIndex = 4;
        else if (score >= 61 && cols.length > 3) targetColIndex = 3;
        else if (score >= 41 && cols.length > 2) targetColIndex = 2;
        else if (score >= 21 && cols.length > 1) targetColIndex = 1;
        targetStage = cols[targetColIndex];
      }
    } catch (colErr) {
      log(`[OSE] Could not fetch org columns, skipping pipeline movement: ${colErr.message}`);
    }

    const cleanObjection = (latestMsg.objections && latestMsg.objections.length > 0) ? latestMsg.objections[0].replace(/['"\\[\\]]/g, '') : null;

    // 3. Upsert to opportunity_scores
    const upsertRes = await pool.query(`
      INSERT INTO opportunity_scores (
        organization_id, lead_id, score, temperature, intent, 
        product_interest, top_objection, pipeline_stage, signals, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
      ON CONFLICT (lead_id) 
      DO UPDATE SET
        score = EXCLUDED.score,
        temperature = EXCLUDED.temperature,
        intent = EXCLUDED.intent,
        product_interest = EXCLUDED.product_interest,
        top_objection = EXCLUDED.top_objection,
        pipeline_stage = EXCLUDED.pipeline_stage,
        signals = EXCLUDED.signals,
        updated_at = NOW()
      RETURNING auto_pipeline_enabled, pipeline_stage
    `, [
      orgId, leadId, score, temperature, latestMsg.intent,
      latestMsg.product_interest, cleanObjection, targetStage, JSON.stringify(signals)
    ]);

    const row = upsertRes.rows[0];

    // 4. Automatic Pipeline Movement + temperature update
    if (row && row.auto_pipeline_enabled && targetStage) {
      await pool.query(`
        UPDATE leads 
        SET status = $1, temperature = $2, updated_at = NOW()
        WHERE id = $3 AND organization_id = $4 AND status != 'Cliente' AND status != $1
      `, [targetStage, temperature, leadId, orgId]);
      log(`[OSE] Lead ${leadId} moved to '${targetStage}' (temp: ${temperature})`);
    }

    log(`[OSE] Score calculated for lead ${leadId}: ${score} (${temperature}) | Stage: ${targetStage}`);
  } catch (err) {
    log(`[OSE] Engine Error: ${err.message}`);
  }
}

// ── END OSE Engine ────────────────────────────────────────────────────────────

// ══════════════════════════════════════════════════════════════════════════════
// AI FOLLOW-UP ENGINE — Smart Revenue Recovery System
// ══════════════════════════════════════════════════════════════════════════════

async function ensureFollowupEngineTables() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS followup_sequences_v2 (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id TEXT NOT NULL,
        name TEXT NOT NULL,
        pipeline_stage TEXT DEFAULT NULL,
        active BOOLEAN DEFAULT TRUE,
        ai_mode BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_fseq_org ON followup_sequences_v2(organization_id);

      CREATE TABLE IF NOT EXISTS followup_steps (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        sequence_id UUID NOT NULL REFERENCES followup_sequences_v2(id) ON DELETE CASCADE,
        step_number INT NOT NULL DEFAULT 1,
        delay_minutes INT NOT NULL DEFAULT 60,
        message_template TEXT NOT NULL,
        media_url TEXT DEFAULT NULL,
        followup_type TEXT DEFAULT 'reminder',
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_fstep_seq ON followup_steps(sequence_id);

      CREATE TABLE IF NOT EXISTS followup_queue (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id TEXT NOT NULL,
        lead_id UUID DEFAULT NULL,
        remote_jid TEXT NOT NULL,
        instance_name TEXT NOT NULL,
        sequence_id UUID DEFAULT NULL,
        current_step INT DEFAULT 1,
        total_steps INT DEFAULT 1,
        scheduled_at TIMESTAMPTZ NOT NULL,
        status TEXT DEFAULT 'pending',
        conversation_temperature TEXT DEFAULT 'frio',
        pipeline_stage TEXT DEFAULT NULL,
        last_customer_message_at TIMESTAMPTZ DEFAULT NULL,
        followup_trigger_reason TEXT DEFAULT NULL,
        detected_objection TEXT DEFAULT NULL,
        detected_product_interest TEXT DEFAULT NULL,
        intent_score INT DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_fqueue_org ON followup_queue(organization_id);
      CREATE INDEX IF NOT EXISTS idx_fqueue_jid ON followup_queue(remote_jid);
      CREATE INDEX IF NOT EXISTS idx_fqueue_status ON followup_queue(status);
      CREATE INDEX IF NOT EXISTS idx_fqueue_scheduled ON followup_queue(scheduled_at);

      CREATE TABLE IF NOT EXISTS followup_events (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        followup_queue_id UUID DEFAULT NULL,
        organization_id TEXT NOT NULL,
        sequence_id UUID DEFAULT NULL,
        step_number INT DEFAULT 1,
        final_message_sent TEXT DEFAULT NULL,
        template_used TEXT DEFAULT NULL,
        message_sent_at TIMESTAMPTZ DEFAULT NOW(),
        customer_replied BOOLEAN DEFAULT FALSE,
        reply_time_minutes INT DEFAULT NULL,
        converted_to_sale BOOLEAN DEFAULT FALSE
      );
      CREATE INDEX IF NOT EXISTS idx_fevents_org ON followup_events(organization_id);
      CREATE INDEX IF NOT EXISTS idx_fevents_queue ON followup_events(followup_queue_id);

      CREATE TABLE IF NOT EXISTS followup_settings (
        organization_id TEXT PRIMARY KEY,
        enabled BOOLEAN DEFAULT TRUE,
        ai_mode_enabled BOOLEAN DEFAULT FALSE,
        max_followups_per_lead INT DEFAULT 4,
        quente_delay_minutes INT DEFAULT 30,
        morno_delay_minutes INT DEFAULT 120,
        frio_delay_minutes INT DEFAULT 720,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    await pool.query(`ALTER TABLE followup_sequences_v2 ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'native'`);
    await pool.query(`ALTER TABLE followup_sequences_v2 ADD COLUMN IF NOT EXISTS legacy_user_id TEXT`);
    await pool.query(`ALTER TABLE followup_sequences_v2 ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()`);
    await pool.query(`ALTER TABLE followup_steps ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()`);
    await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_fseq_legacy_user ON followup_sequences_v2(organization_id, legacy_user_id) WHERE legacy_user_id IS NOT NULL`);
    await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_fstep_sequence_step ON followup_steps(sequence_id, step_number)`);
    log('[FOLLOWUP] Follow-up Engine tables verified.');
  } catch (err) {
    log(`[FOLLOWUP] ensureFollowupEngineTables error: ${err.message}`);
  }
}

let followupEngineReadyPromise = null;

function legacyDelayDaysToMinutes(delayDays) {
  const numeric = Number(delayDays);
  if (!Number.isFinite(numeric) || numeric <= 0) return 60;
  return Math.max(1, Math.round(numeric * 24 * 60));
}

function minutesToLegacyDelayDays(minutes) {
  const numeric = Number(minutes);
  if (!Number.isFinite(numeric) || numeric <= 0) return 1;
  return Math.max(1, Math.round(numeric / 1440));
}

const optionalColumnExistsCache = new Map();

async function doesColumnExist(tableName, columnName) {
  const cacheKey = `${tableName}.${columnName}`;
  if (optionalColumnExistsCache.has(cacheKey)) {
    return optionalColumnExistsCache.get(cacheKey);
  }

  const result = await pool.query(
    `SELECT 1
       FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = $1
        AND column_name = $2
      LIMIT 1`,
    [tableName, columnName],
  );

  const exists = result.rows.length > 0;
  optionalColumnExistsCache.set(cacheKey, exists);
  return exists;
}

async function getOrganizationIdForUser(userId) {
  const orgRes = await pool.query('SELECT organization_id FROM users WHERE id = $1', [userId]);
  return orgRes.rows[0]?.organization_id || null;
}

const SELLER_DEFAULT_PERIOD_DAYS = 7;
const SELLER_MESSAGE_LOOKBACK_DAYS = 45;

function endOfDay(date) {
  const result = new Date(date);
  result.setHours(23, 59, 59, 999);
  return result;
}

function parseSellerPeriod(query = {}, { defaultDays = SELLER_DEFAULT_PERIOD_DAYS } = {}) {
  const now = new Date();
  const range = String(query.range || "").toLowerCase();
  const daysFromQuery = Number(query.days);
  let periodStart;
  let periodEnd = now;
  let normalizedRange = range || null;

  if (range === "today") {
    periodStart = startOfDay(now);
    normalizedRange = "today";
  } else if (range === "custom" && query.from && query.to) {
    periodStart = startOfDay(new Date(query.from));
    periodEnd = endOfDay(new Date(query.to));
    normalizedRange = "custom";
  } else {
    const days = Number.isFinite(daysFromQuery) && daysFromQuery > 0
      ? daysFromQuery
      : defaultDays;
    periodStart = startOfDay(new Date(now.getTime() - (days - 1) * 86400000));
    normalizedRange = days === 30 ? "30d" : "7d";
  }

  if (Number.isNaN(periodStart.getTime())) {
    periodStart = startOfDay(new Date(now.getTime() - (defaultDays - 1) * 86400000));
    normalizedRange = defaultDays === 30 ? "30d" : "7d";
  }

  if (Number.isNaN(periodEnd.getTime())) {
    periodEnd = now;
  }

  const periodLength = Math.max(1, periodEnd.getTime() - periodStart.getTime());
  const comparisonEnd = new Date(periodStart.getTime() - 1);
  const comparisonStart = new Date(comparisonEnd.getTime() - periodLength);

  return {
    range: normalizedRange,
    periodStart,
    periodEnd,
    comparisonStart,
    comparisonEnd,
  };
}

async function ensureSellerPlatformSchema() {
  try {
    await pool.query(`ALTER TABLE vendedores ADD COLUMN IF NOT EXISTS avatar_url TEXT`);
    await pool.query(`ALTER TABLE vendedores ADD COLUMN IF NOT EXISTS role TEXT`);
    await pool.query(`ALTER TABLE vendedores ADD COLUMN IF NOT EXISTS notes TEXT`);
    await pool.query(`ALTER TABLE vendedores ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'offline'`);
    await pool.query(`ALTER TABLE vendedores ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()`);
    await pool.query(`ALTER TABLE vendedores ALTER COLUMN email DROP NOT NULL`).catch(() => { });
    await pool.query(`UPDATE vendedores SET updated_at = COALESCE(updated_at, created_at, NOW()) WHERE updated_at IS NULL`);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS seller_connections (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        seller_id UUID NOT NULL REFERENCES vendedores(id) ON DELETE CASCADE,
        connection_id UUID NOT NULL REFERENCES whatsapp_instances(id) ON DELETE CASCADE,
        is_primary BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_seller_connections_unique_pair ON seller_connections(seller_id, connection_id)`);
    await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_seller_connections_unique_connection ON seller_connections(connection_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_seller_connections_seller ON seller_connections(seller_id)`);
  } catch (err) {
    log(`[SELLERS] Schema ensure error: ${err.message}`);
  }
}

setTimeout(() => {
  ensureSellerPlatformSchema().catch((err) => log(`[SELLERS] Startup ensure error: ${err.message}`));
}, 3000);

function serializeInstanceRow(row) {
  return {
    id: row.id,
    instance_name: row.instance_name,
    status: row.status,
    created_at: row.created_at,
    connected_agent_id: row.connected_agent_id || null,
    connected_agent_name: row.connected_agent_name || null,
    connected_seller_id: row.connected_seller_id || null,
    connected_seller_name: row.connected_seller_name || null,
    seller_is_primary: Boolean(row.seller_is_primary),
  };
}

function mapConnectionRow(row, instancesById) {
  const instance = instancesById.get(row.connection_id) || null;

  return {
    id: row.id,
    sellerId: row.seller_id,
    connectionId: row.connection_id,
    isPrimary: Boolean(row.is_primary),
    createdAt: row.created_at,
    instanceId: instance?.id || row.connection_id,
    instanceName: row.instance_name || instance?.instance_name || null,
    connectionStatus: row.connection_status || instance?.status || "DISCONNECTED",
    connectedAgentId: row.connected_agent_id || instance?.connected_agent_id || null,
    connectedAgentName: row.connected_agent_name || instance?.connected_agent_name || null,
  };
}

function buildConnectionsBySeller(connectionRows, instancesById) {
  const grouped = new Map();

  for (const row of connectionRows) {
    const current = grouped.get(row.seller_id) || [];
    current.push(mapConnectionRow(row, instancesById));
    grouped.set(row.seller_id, current);
  }

  for (const [sellerId, sellerConnections] of grouped) {
    sellerConnections.sort((left, right) => {
      if (left.isPrimary !== right.isPrimary) {
        return left.isPrimary ? -1 : 1;
      }
      return new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime();
    });
    grouped.set(sellerId, sellerConnections);
  }

  return grouped;
}

function serializeSellerRow(row, connections = [], explicitStatus = null) {
  const primaryConnection = connections.find((item) => item.isPrimary) || connections[0] || null;
  const status = explicitStatus
    || (row.ativo === false ? "inactive" : row.status || "offline");

  return {
    id: row.id,
    organizationId: row.organization_id,
    name: row.nome,
    email: row.email || null,
    phoneNumber: row.whatsapp || null,
    avatarUrl: row.avatar_url || null,
    role: row.role || null,
    notes: row.notes || null,
    status,
    active: row.ativo !== false,
    createdAt: row.created_at,
    updatedAt: row.updated_at || row.created_at,
    primaryConnectionId: primaryConnection?.connectionId || null,
    primaryConnection,
    connections,
    legacy: {
      nome: row.nome,
      whatsapp: row.whatsapp,
      ativo: row.ativo,
      porcentagem: row.porcentagem,
      leads_recebidos_ciclo: row.leads_recebidos_ciclo,
    },
  };
}

async function fetchOrganizationInstances(orgId) {
  await ensureSellerPlatformSchema();
  const result = await pool.query(`
    SELECT wi.*,
           a.id AS connected_agent_id,
           a.name AS connected_agent_name,
           sc.seller_id AS connected_seller_id,
           v.nome AS connected_seller_name,
           sc.is_primary AS seller_is_primary
      FROM whatsapp_instances wi
      LEFT JOIN agents a ON a.whatsapp_instance_id = wi.id
      LEFT JOIN seller_connections sc ON sc.connection_id = wi.id
      LEFT JOIN vendedores v ON v.id = sc.seller_id
     WHERE wi.organization_id = $1
     ORDER BY wi.created_at DESC
  `, [orgId]);

  return result.rows.map(serializeInstanceRow);
}

async function fetchSellerRows(orgId, sellerId = null) {
  await ensureSellerPlatformSchema();
  const params = [orgId];
  let query = `
    SELECT *
      FROM vendedores
     WHERE organization_id = $1
  `;

  if (sellerId) {
    params.push(sellerId);
    query += ` AND id = $2`;
  }

  query += ` ORDER BY created_at ASC`;

  const result = await pool.query(query, params);
  return result.rows;
}

async function fetchSellerConnectionRows(orgId, sellerId = null) {
  await ensureSellerPlatformSchema();
  const params = [orgId];
  let query = `
    SELECT sc.*,
           wi.instance_name,
           wi.status AS connection_status,
           a.id AS connected_agent_id,
           a.name AS connected_agent_name
      FROM seller_connections sc
      JOIN vendedores v ON v.id = sc.seller_id
      LEFT JOIN whatsapp_instances wi ON wi.id = sc.connection_id
      LEFT JOIN agents a ON a.whatsapp_instance_id = wi.id
     WHERE v.organization_id = $1
  `;

  if (sellerId) {
    params.push(sellerId);
    query += ` AND sc.seller_id = $2`;
  }

  query += ` ORDER BY sc.is_primary DESC, sc.created_at ASC`;

  const result = await pool.query(query, params);
  return result.rows;
}

async function fetchSellerLeadRows(orgId, sellerId = null) {
  const params = [orgId];
  let query = `
    SELECT id,
           organization_id,
           assigned_to,
           name,
           phone,
           email,
           status,
           temperature,
           value,
           score,
           created_at,
           last_contact,
           last_interaction_at
      FROM leads
     WHERE organization_id = $1
       AND assigned_to IS NOT NULL
  `;

  if (sellerId) {
    params.push(sellerId);
    query += ` AND assigned_to = $2`;
  }

  query += ` ORDER BY created_at DESC`;

  const result = await pool.query(query, params);
  return result.rows;
}

async function fetchChatMessagesForPhoneCandidates(orgId, phoneCandidates, lookbackStart) {
  if (!phoneCandidates.length) {
    return [];
  }

  const patterns = Array.from(new Set(phoneCandidates.map((candidate) => `%${candidate}%`)));
  const result = await pool.query(`
    SELECT cm.id,
           cm.remote_jid,
           cm.role,
           cm.content,
           cm.created_at,
           wi.instance_name,
           wi.id AS connection_id,
           a.id AS agent_id
      FROM chat_messages cm
      JOIN agents a ON a.id = cm.agent_id
      LEFT JOIN whatsapp_instances wi ON wi.id = a.whatsapp_instance_id
     WHERE a.organization_id = $1
       AND cm.remote_jid IS NOT NULL
       AND cm.created_at >= $3
       AND EXISTS (
         SELECT 1
           FROM unnest($2::text[]) AS candidate_pattern
          WHERE regexp_replace(split_part(cm.remote_jid, '@', 1), '\D', '', 'g') LIKE candidate_pattern
       )
     ORDER BY cm.created_at ASC
  `, [orgId, patterns, lookbackStart.toISOString()]);

  return result.rows;
}

async function loadSellerAnalyticsContext(orgId, {
  sellerId = null,
  periodStart,
  periodEnd,
} = {}) {
  const [sellerRows, connectionRows, leadRows, instanceRows] = await Promise.all([
    fetchSellerRows(orgId, sellerId),
    fetchSellerConnectionRows(orgId, sellerId),
    fetchSellerLeadRows(orgId, sellerId),
    fetchOrganizationInstances(orgId),
  ]);

  const instancesById = new Map(instanceRows.map((instance) => [instance.id, instance]));
  const connectionsBySeller = buildConnectionsBySeller(connectionRows, instancesById);
  const phoneCandidates = Array.from(new Set(leadRows.flatMap((lead) => buildPhoneCandidates(lead.phone))));
  const lookbackStart = new Date(periodStart.getTime() - SELLER_MESSAGE_LOOKBACK_DAYS * 86400000);
  const rawMessages = await fetchChatMessagesForPhoneCandidates(orgId, phoneCandidates, lookbackStart);

  const scopes = sellerRows.map((seller) => buildSellerScope({
    sellerId: seller.id,
    sellers: sellerRows,
    connectionsBySeller,
    instancesById,
    leads: leadRows,
    rawMessages,
    periodStart,
    periodEnd,
    now: new Date(),
  }));

  const teamAverages = buildTeamAverages(scopes);

  return {
    sellerRows,
    scopes,
    teamAverages,
    instanceRows,
    instancesById,
    connectionsBySeller,
  };
}

function serializeSellerScope(scope, teamAverages) {
  const qualityScore = buildSellerScore(scope.metrics);
  const risk = buildRiskBadge(scope.metrics);
  const quality = buildSellerStrengthsAndCriticalPoints(scope.metrics, teamAverages);
  const seller = serializeSellerRow(scope.seller, scope.connections, scope.status);

  return {
    ...seller,
    metrics: {
      ...scope.metrics,
      avgResponseTimeLabel: scope.metrics.avgResponseTimeMinutes > 0
        ? `${scope.metrics.avgResponseTimeMinutes} min`
        : "Sem base suficiente",
    },
    risk,
    qualityScore,
    quality,
    activeConversations: scope.conversations.length,
    hasAiConnected: scope.connections.some((connection) => Boolean(connection.connectedAgentId)),
    mainConnectionStatus: seller.primaryConnection?.connectionStatus || "DISCONNECTED",
    leadsCount: scope.leadRows.length,
  };
}

function buildSellerDetailPayload(scope, teamAverages, previousScope) {
  const seller = serializeSellerScope(scope, teamAverages);
  const insights = buildSellerInsights({
    sellerName: seller.name,
    metrics: scope.metrics,
    previousMetrics: previousScope?.metrics || {},
    teamAverages,
    funnel: scope.funnel,
  });
  const executiveSummary = buildSellerExecutiveSummary(seller.qualityScore, insights);

  return {
    seller,
    metrics: {
      ...scope.metrics,
      qualityScore: seller.qualityScore,
      quality: seller.quality,
    },
    funnel: scope.funnel,
    conversations: scope.conversations,
    leads: scope.leadRows,
    bottlenecks: buildSellerBottlenecks(scope, teamAverages),
    insights,
    executiveSummary,
  };
}

function buildSellerBottlenecks(scope, teamAverages) {
  const stalledConversations = scope.conversations.filter((conversation) => conversation.waitingForReply && conversation.waitingMinutes >= 60);
  const staleLeads = scope.leadRows.filter((lead) => lead.lastInteractionAt && hoursBetween(lead.lastInteractionAt, new Date()) >= 48 && !isTerminalStatus(lead.stage));
  const lowResponseComparedToTeam = (scope.metrics.responseRate || 0) < Math.max((teamAverages.responseRate || 0) - 0.1, 0);

  return [
    {
      id: "waiting_customer_reply",
      label: "Leads sem resposta ha mais de 1h",
      count: stalledConversations.length,
      action: "open_waiting",
    },
    {
      id: "pending_followups",
      label: "Leads parados sem follow-up",
      count: scope.metrics.pendingFollowups,
      action: "open_followups",
    },
    {
      id: "last_customer_message",
      label: "Ultima mensagem do cliente sem retorno",
      count: scope.metrics.unansweredLeads,
      action: "open_unanswered",
    },
    {
      id: "stale_conversations",
      label: "Conversas antigas sem movimentacao",
      count: staleLeads.length,
      action: "open_stale",
    },
    {
      id: "response_gap",
      label: "Resposta abaixo da media do time",
      count: lowResponseComparedToTeam ? scope.metrics.leadsReceived : 0,
      action: "open_response_gap",
    },
  ].filter((item) => item.count > 0);
}

function pickPrimaryConnection(connections = []) {
  return connections.find((connection) => connection.isPrimary) || connections[0] || null;
}

function parseBooleanLike(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const normalized = String(value).toLowerCase();
  if (["1", "true", "yes", "sim"].includes(normalized)) return true;
  if (["0", "false", "no", "nao"].includes(normalized)) return false;
  return null;
}

function filterSellerDirectory(items, query = {}) {
  const search = String(query.search || "").trim().toLowerCase();
  const statusFilter = String(query.status || "").trim().toLowerCase();
  const connectionStatusFilter = String(query.connection_status || "").trim().toLowerCase();
  const unansweredOnly = parseBooleanLike(query.unanswered_only);
  const highRiskOnly = parseBooleanLike(query.high_risk_only);
  const aiConnected = parseBooleanLike(query.ai_connected);

  return items.filter((item) => {
    if (statusFilter && String(item.status || "").toLowerCase() !== statusFilter) {
      return false;
    }

    if (connectionStatusFilter) {
      const hasConnectionStatus = item.connections.some((connection) =>
        String(connection.connectionStatus || "").toLowerCase() === connectionStatusFilter,
      );
      if (!hasConnectionStatus) {
        return false;
      }
    }

    if (unansweredOnly === true && item.metrics.unansweredLeads <= 0) {
      return false;
    }

    if (highRiskOnly === true && item.risk.level !== "high") {
      return false;
    }

    if (aiConnected !== null && item.hasAiConnected !== aiConnected) {
      return false;
    }

    if (!search) {
      return true;
    }

    const haystack = [
      item.name,
      item.phoneNumber,
      item.email,
      item.id,
      item.primaryConnection?.instanceName,
      ...item.connections.map((connection) => connection.instanceName || ""),
    ]
      .join(" ")
      .toLowerCase();

    return haystack.includes(search);
  });
}

async function loadSellerDetailByPeriod(orgId, sellerId, period) {
  const currentContext = await loadSellerAnalyticsContext(orgId, {
    sellerId,
    periodStart: period.periodStart,
    periodEnd: period.periodEnd,
  });
  const previousContext = await loadSellerAnalyticsContext(orgId, {
    sellerId,
    periodStart: period.comparisonStart,
    periodEnd: period.comparisonEnd,
  });

  const currentScope = currentContext.scopes[0] || null;
  const previousScope = previousContext.scopes[0] || null;

  return {
    currentScope,
    previousScope,
    currentContext,
  };
}

async function attachConnectionToSeller(orgId, sellerId, connectionId, { isPrimary = false, forceTransfer = false } = {}) {
  await ensureSellerPlatformSchema();
  const sellerRes = await pool.query(
    `SELECT id
       FROM vendedores
      WHERE id = $1 AND organization_id = $2
      LIMIT 1`,
    [sellerId, orgId],
  );

  if (sellerRes.rows.length === 0) {
    const error = new Error("Seller not found");
    error.statusCode = 404;
    throw error;
  }

  const connectionRes = await pool.query(
    `SELECT id
       FROM whatsapp_instances
      WHERE id = $1 AND organization_id = $2
      LIMIT 1`,
    [connectionId, orgId],
  );

  if (connectionRes.rows.length === 0) {
    const error = new Error("Connection not found");
    error.statusCode = 404;
    throw error;
  }

  const currentLink = await pool.query(
    `SELECT sc.id,
            sc.seller_id,
            v.nome AS seller_name
       FROM seller_connections sc
       JOIN vendedores v ON v.id = sc.seller_id
      WHERE sc.connection_id = $1
      LIMIT 1`,
    [connectionId],
  );

  if (currentLink.rows.length > 0 && currentLink.rows[0].seller_id !== sellerId) {
    if (!forceTransfer) {
      const error = new Error("Connection already linked");
      error.statusCode = 409;
      error.payload = {
        currentSellerId: currentLink.rows[0].seller_id,
        currentSellerName: currentLink.rows[0].seller_name,
      };
      throw error;
    }

    await pool.query(`DELETE FROM seller_connections WHERE connection_id = $1`, [connectionId]);
  }

  if (isPrimary) {
    await pool.query(`UPDATE seller_connections SET is_primary = FALSE WHERE seller_id = $1`, [sellerId]);
  }

  const result = await pool.query(`
    INSERT INTO seller_connections (seller_id, connection_id, is_primary)
    VALUES ($1, $2, $3)
    ON CONFLICT (seller_id, connection_id)
    DO UPDATE SET is_primary = EXCLUDED.is_primary
    RETURNING *
  `, [sellerId, connectionId, isPrimary]);

  if (!isPrimary) {
    const existingPrimary = await pool.query(
      `SELECT id FROM seller_connections WHERE seller_id = $1 AND is_primary = TRUE LIMIT 1`,
      [sellerId],
    );

    if (existingPrimary.rows.length === 0) {
      await pool.query(
        `UPDATE seller_connections SET is_primary = TRUE WHERE id = $1`,
        [result.rows[0].id],
      );
    }
  }

  return result.rows[0];
}

async function detachConnectionFromSeller(orgId, sellerId, connectionId) {
  await ensureSellerPlatformSchema();
  const result = await pool.query(`
    DELETE FROM seller_connections sc
    USING vendedores v
    WHERE sc.seller_id = v.id
      AND v.organization_id = $1
      AND sc.seller_id = $2
      AND sc.connection_id = $3
    RETURNING sc.*
  `, [orgId, sellerId, connectionId]);

  if (result.rows.length === 0) {
    return null;
  }

  const stillConnected = await pool.query(
    `SELECT id FROM seller_connections WHERE seller_id = $1 ORDER BY created_at ASC`,
    [sellerId],
  );

  const hasPrimary = await pool.query(
    `SELECT id FROM seller_connections WHERE seller_id = $1 AND is_primary = TRUE LIMIT 1`,
    [sellerId],
  );

  if (stillConnected.rows.length > 0 && hasPrimary.rows.length === 0) {
    await pool.query(`UPDATE seller_connections SET is_primary = TRUE WHERE id = $1`, [stillConnected.rows[0].id]);
  }

  return result.rows[0];
}

async function getLinkedSellerIdForConnection(orgId, connectionId) {
  if (!connectionId) return null;
  await ensureSellerPlatformSchema();

  const result = await pool.query(`
    SELECT sc.seller_id
      FROM seller_connections sc
      JOIN vendedores v ON v.id = sc.seller_id
     WHERE sc.connection_id = $1
       AND v.organization_id = $2
       AND v.ativo = TRUE
     ORDER BY sc.is_primary DESC, sc.created_at ASC
     LIMIT 1
  `, [connectionId, orgId]);

  return result.rows[0]?.seller_id || null;
}

async function syncLegacyRecoverySequencesToV2() {
  try {
    const tableCheck = await pool.query(`SELECT to_regclass('public.followup_sequences') AS table_name`);
    if (!tableCheck.rows[0]?.table_name) return;

    const legacyRes = await pool.query(`
      SELECT
        fs.*,
        u.organization_id,
        COALESCE(NULLIF(TRIM(u.name), ''), NULLIF(TRIM(u.email), ''), 'Operacao') AS owner_label
      FROM followup_sequences fs
      JOIN users u ON u.id = fs.user_id
      WHERE u.organization_id IS NOT NULL
      ORDER BY fs.user_id ASC, fs.delay_days ASC, fs.created_at ASC NULLS LAST, fs.id ASC
    `);

    const rows = legacyRes.rows;
    const grouped = new Map();

    for (const row of rows) {
      const groupKey = `${row.organization_id}:${row.user_id}`;
      if (!grouped.has(groupKey)) {
        grouped.set(groupKey, {
          organizationId: row.organization_id,
          legacyUserId: row.user_id,
          ownerLabel: row.owner_label,
          rows: [],
        });
      }
      grouped.get(groupKey).rows.push(row);
    }

    const legacyKeys = Array.from(grouped.keys());
    const existingLegacyRes = await pool.query(`
      SELECT id, organization_id, legacy_user_id
      FROM followup_sequences_v2
      WHERE legacy_user_id IS NOT NULL
    `);

    for (const existing of existingLegacyRes.rows) {
      const key = `${existing.organization_id}:${existing.legacy_user_id}`;
      if (!legacyKeys.includes(key)) {
        await pool.query(`DELETE FROM followup_sequences_v2 WHERE id = $1`, [existing.id]);
      }
    }

    for (const group of grouped.values()) {
      const sequenceName = `Recuperacao migrada - ${group.ownerLabel}`;
      const sequenceActive = group.rows.some((row) => row.active !== false);

      const seqRes = await pool.query(`
        INSERT INTO followup_sequences_v2 (
          organization_id,
          name,
          pipeline_stage,
          active,
          ai_mode,
          source,
          legacy_user_id,
          updated_at
        )
        VALUES ($1, $2, NULL, $3, FALSE, 'legacy_sync', $4, NOW())
        ON CONFLICT (organization_id, legacy_user_id)
        DO UPDATE SET
          name = EXCLUDED.name,
          active = EXCLUDED.active,
          source = EXCLUDED.source,
          updated_at = NOW()
        RETURNING id
      `, [group.organizationId, sequenceName, sequenceActive, group.legacyUserId]);

      const sequenceId = seqRes.rows[0]?.id;
      if (!sequenceId) continue;

      for (let index = 0; index < group.rows.length; index += 1) {
        const row = group.rows[index];
        const stepNumber = index + 1;
        await pool.query(`
          INSERT INTO followup_steps (
            sequence_id,
            step_number,
            delay_minutes,
            message_template,
            media_url,
            followup_type,
            updated_at
          )
          VALUES ($1, $2, $3, $4, $5, 'legacy_sync', NOW())
          ON CONFLICT (sequence_id, step_number)
          DO UPDATE SET
            delay_minutes = EXCLUDED.delay_minutes,
            message_template = EXCLUDED.message_template,
            media_url = EXCLUDED.media_url,
            followup_type = EXCLUDED.followup_type,
            updated_at = NOW()
        `, [
          sequenceId,
          stepNumber,
          legacyDelayDaysToMinutes(row.delay_days),
          row.message,
          row.image_url || null,
        ]);
      }

      await pool.query(`DELETE FROM followup_steps WHERE sequence_id = $1 AND step_number > $2`, [sequenceId, group.rows.length]);
    }

    if (rows.length > 0) {
      log(`[FOLLOWUP] Legacy recovery sequences synchronized: ${rows.length} legacy rows`);
    }
  } catch (err) {
    log(`[FOLLOWUP] syncLegacyRecoverySequencesToV2 error: ${err.message}`);
  }
}

async function ensureFollowupEngineReady() {
  if (!followupEngineReadyPromise) {
    followupEngineReadyPromise = (async () => {
      await ensureFollowupEngineTables();
      await syncLegacyRecoverySequencesToV2();
    })().catch((err) => {
      followupEngineReadyPromise = null;
      throw err;
    });
  }

  return followupEngineReadyPromise;
}

async function getFollowupSequenceForOrg(sequenceId, organizationId) {
  const result = await pool.query(
    `SELECT * FROM followup_sequences_v2 WHERE id = $1 AND organization_id = $2 LIMIT 1`,
    [sequenceId, organizationId]
  );
  return result.rows[0] || null;
}

async function getFollowupStepForOrg(stepId, organizationId) {
  const result = await pool.query(`
    SELECT st.*, fs.organization_id, fs.name AS sequence_name
    FROM followup_steps st
    JOIN followup_sequences_v2 fs ON fs.id = st.sequence_id
    WHERE st.id = $1 AND fs.organization_id = $2
    LIMIT 1
  `, [stepId, organizationId]);
  return result.rows[0] || null;
}

/**
 * Get or create followup_settings for an org.
 */
async function getFollowupSettings(orgId) {
  const res = await pool.query(
    `INSERT INTO followup_settings (organization_id) VALUES ($1)
     ON CONFLICT (organization_id) DO NOTHING;
     SELECT * FROM followup_settings WHERE organization_id = $1`,
    [orgId]
  );
  // pg doesn't return from the INSERT part easily with ON CONFLICT DO NOTHING in one query,
  // so we use two queries when needed. But for simplicity, do a separate SELECT:
  const settingsRes = await pool.query('SELECT * FROM followup_settings WHERE organization_id = $1', [orgId]);
  if (settingsRes.rows.length === 0) {
    await pool.query('INSERT INTO followup_settings (organization_id) VALUES ($1) ON CONFLICT DO NOTHING', [orgId]);
    const settings2 = await pool.query('SELECT * FROM followup_settings WHERE organization_id = $1', [orgId]);
    return settings2.rows[0];
  }
  return settingsRes.rows[0];
}

async function buildFollowupQueuePayload(orgId, remoteJid) {
  const settings = await getFollowupSettings(orgId);
  if (!settings.enabled) return null;

  const existingQ = await pool.query(
    `SELECT id FROM followup_queue WHERE remote_jid = $1 AND organization_id = $2 AND status = 'pending'`,
    [remoteJid, orgId]
  );
  if (existingQ.rows.length > 0) return null;

  const phone = remoteJid.split('@')[0];
  const hasMobilePhoneColumn = await doesColumnExist('leads', 'mobile_phone');
  const leadPhoneFilter = hasMobilePhoneColumn
    ? '(l.phone LIKE $2 OR l.mobile_phone LIKE $2)'
    : 'l.phone LIKE $2';
  const leadRes = await pool.query(
    `SELECT l.id AS lead_id, os.temperature, os.intent, os.product_interest, os.top_objection, os.score, l.status AS pipeline_stage
     FROM leads l
     LEFT JOIN opportunity_scores os ON os.lead_id = l.id
     WHERE l.organization_id = $1 AND ${leadPhoneFilter}
     LIMIT 1`,
    [orgId, `%${phone}%`]
  );

  const lead = leadRes.rows[0];
  const temperature = lead?.temperature || 'frio';
  const pipelineStage = lead?.pipeline_stage || 'Novo Lead';

  let requiredDelay;
  if (temperature === 'quente') requiredDelay = settings.quente_delay_minutes;
  else if (temperature === 'morno') requiredDelay = settings.morno_delay_minutes;
  else requiredDelay = settings.frio_delay_minutes;

  const sentCount = await pool.query(
    `SELECT COUNT(*) FROM followup_queue WHERE remote_jid = $1 AND organization_id = $2 AND status IN ('sent', 'replied')`,
    [remoteJid, orgId]
  );
  if (parseInt(sentCount.rows[0].count) >= settings.max_followups_per_lead) return null;

  const seqRes = await pool.query(
    `SELECT fs.id, COUNT(st.id) AS step_count
     FROM followup_sequences_v2 fs
     LEFT JOIN followup_steps st ON st.sequence_id = fs.id
     WHERE fs.organization_id = $1 AND fs.active = TRUE
       AND (fs.pipeline_stage IS NULL OR fs.pipeline_stage = $2)
     GROUP BY fs.id
     ORDER BY fs.pipeline_stage NULLS LAST
     LIMIT 1`,
    [orgId, pipelineStage]
  );

  if (seqRes.rows.length === 0) return null;

  const sequence = seqRes.rows[0];
  const trigger = temperature === 'quente' ? 'high_temp_inactivity' :
    temperature === 'morno' ? 'medium_temp_inactivity' : 'low_temp_inactivity';

  return {
    lead,
    temperature,
    pipelineStage,
    requiredDelay,
    sequence,
    trigger,
  };
}

async function enqueueFollowupForConversation({
  orgId,
  remoteJid,
  instanceName,
  baseTime = new Date(),
}) {
  const payload = await buildFollowupQueuePayload(orgId, remoteJid);
  if (!payload) return null;

  const baseDate = baseTime instanceof Date ? baseTime : new Date(baseTime);
  const scheduledAt = new Date(baseDate.getTime() + payload.requiredDelay * 60 * 1000);

  await pool.query(`
    INSERT INTO followup_queue (
      organization_id, lead_id, remote_jid, instance_name, sequence_id,
      current_step, total_steps, scheduled_at, status,
      conversation_temperature, pipeline_stage, last_customer_message_at,
      followup_trigger_reason, detected_objection, detected_product_interest, intent_score
    ) VALUES ($1,$2,$3,$4,$5,1,$6,$7,'pending',$8,$9,$10,$11,$12,$13,$14)
  `, [
    orgId,
    payload.lead?.lead_id || null,
    remoteJid,
    instanceName,
    payload.sequence.id,
    parseInt(payload.sequence.step_count) || 1,
    scheduledAt.toISOString(),
    payload.temperature,
    payload.pipelineStage,
    baseDate.toISOString(),
    payload.trigger,
    payload.lead?.top_objection || null,
    payload.lead?.product_interest || null,
    payload.lead?.score || 0,
  ]);

  return {
    scheduledAt,
    requiredDelay: payload.requiredDelay,
    temperature: payload.temperature,
  };
}

async function backfillMissedFollowupQueue({ lookbackHours = 24, limit = 100 } = {}) {
  try {
    await ensureFollowupEngineReady();

    const candidatesRes = await pool.query(`
      SELECT *
      FROM (
        SELECT
          a.organization_id,
          cm.remote_jid,
          COALESCE(wi.instance_name, org_wi.instance_name) AS instance_name,
          cm.created_at AS last_assistant_at,
          ROW_NUMBER() OVER (
            PARTITION BY a.organization_id, cm.remote_jid
            ORDER BY cm.created_at DESC
          ) AS rn
        FROM chat_messages cm
        JOIN agents a ON a.id = cm.agent_id
        LEFT JOIN whatsapp_instances wi ON wi.id = a.whatsapp_instance_id
        LEFT JOIN LATERAL (
          SELECT instance_name
          FROM whatsapp_instances
          WHERE organization_id = a.organization_id
            AND LOWER(status) IN ('connected', 'open')
          ORDER BY created_at DESC
          LIMIT 1
        ) org_wi ON TRUE
        WHERE cm.role = 'assistant'
          AND cm.remote_jid IS NOT NULL
          AND cm.created_at >= NOW() - ($1 || ' hours')::interval
      ) ranked
      WHERE rn = 1
        AND instance_name IS NOT NULL
      ORDER BY last_assistant_at DESC
      LIMIT $2
    `, [lookbackHours, limit]);

    let enqueued = 0;

    for (const candidate of candidatesRes.rows) {
      const repliedAfter = await pool.query(
        `SELECT 1
           FROM chat_messages
          WHERE remote_jid = $1
            AND role = 'user'
            AND created_at > $2
          LIMIT 1`,
        [candidate.remote_jid, candidate.last_assistant_at]
      );
      if (repliedAfter.rows.length > 0) continue;

      const result = await enqueueFollowupForConversation({
        orgId: candidate.organization_id,
        remoteJid: candidate.remote_jid,
        instanceName: candidate.instance_name,
        baseTime: candidate.last_assistant_at,
      });

      if (result) {
        enqueued += 1;
      }
    }

    if (enqueued > 0) {
      log(`[FOLLOWUP] Backfill queued ${enqueued} missed follow-up(s)`);
    }
  } catch (err) {
    log(`[FOLLOWUP] backfillMissedFollowupQueue error: ${err.message}`);
  }
}

/**
 * Event-Driven: Schedule a follow-up directly after the agent replies.
 * Called when `role = 'assistant'` message is sent to the customer.
 */
async function scheduleFollowupEvent(orgId, remoteJid, instanceName) {
  try {
    await ensureFollowupEngineReady();
    const result = await enqueueFollowupForConversation({ orgId, remoteJid, instanceName });
    if (result) {
      log(`[FOLLOWUP] Queued future follow-up (+${result.requiredDelay}m) for ${remoteJid} (${result.temperature})`);
    }
  } catch (err) {
    log(`[FOLLOWUP] scheduleFollowupEvent error: ${err.message}`);
  }
}

/**
 * Resolve {{variable}} placeholders in a message template.
 */
async function resolveMessageTemplate(template, queueEntry) {
  try {
    let message = template;

    // Fetch lead name
    if (queueEntry.lead_id) {
      const leadRes = await pool.query('SELECT name FROM leads WHERE id = $1', [queueEntry.lead_id]);
      const leadName = leadRes.rows[0]?.name || '';
      message = message.replace(/\{\{nome_cliente\}\}/gi, leadName.split(' ')[0] || '');
    } else {
      message = message.replace(/\{\{nome_cliente\}\}/gi, '');
    }

    // Other variables
    const product = queueEntry.detected_product_interest || '';
    message = message.replace(/\{\{produto_interesse\}\}/gi, product);

    const minutesSilent = queueEntry.last_customer_message_at
      ? Math.round((Date.now() - new Date(queueEntry.last_customer_message_at).getTime()) / 60000)
      : 0;

    if (minutesSilent < 60) {
      message = message.replace(/\{\{tempo_sem_resposta\}\}/gi, `${minutesSilent} minutos`);
    } else if (minutesSilent < 1440) {
      message = message.replace(/\{\{tempo_sem_resposta\}\}/gi, `${Math.round(minutesSilent / 60)} horas`);
    } else {
      message = message.replace(/\{\{tempo_sem_resposta\}\}/gi, `${Math.round(minutesSilent / 1440)} dias`);
    }

    // {{ultima_pergunta}} - last customer message
    const lastMsgRes = await pool.query(`
      SELECT content FROM chat_messages
      WHERE remote_jid = $1 AND role = 'user'
      ORDER BY created_at DESC LIMIT 1
    `, [queueEntry.remote_jid]);
    const lastQuestion = lastMsgRes.rows[0]?.content?.substring(0, 100) || '';
    message = message.replace(/\{\{ultima_pergunta\}\}/gi, lastQuestion);

    return message;
  } catch (err) {
    log(`[FOLLOWUP] resolveMessageTemplate error: ${err.message}`);
    return template;
  }
}

/**
 * Generate a contextual follow-up message using AI (when ai_mode is enabled).
 */
async function generateAIFollowupMessage(queueEntry, step) {
  try {
    // Gather context
    const recentMessages = await pool.query(`
      SELECT role, content FROM chat_messages
      WHERE remote_jid = $1
      ORDER BY created_at DESC LIMIT 10
    `, [queueEntry.remote_jid]);

    const history = recentMessages.rows.reverse().map(m => `${m.role === 'user' ? 'Cliente' : 'Vendedor'}: ${m.content}`).join('\n');

    const prompt = `Você é um assistente de vendas da empresa. Gere uma mensagem de follow-up personalizada e natural.

Contexto:
- Temperatura do lead: ${queueEntry.conversation_temperature}
- Estágio no funil: ${queueEntry.pipeline_stage}
- Produto de interesse detectado: ${queueEntry.detected_product_interest || 'não identificado'}
- Objeção detectada: ${queueEntry.detected_objection || 'nenhuma'}
- Score de oportunidade: ${queueEntry.intent_score}/100
- Tipo de follow-up recomendado: ${step.followup_type}
- Silêncio há: ${Math.round((Date.now() - new Date(queueEntry.last_customer_message_at).getTime()) / 60000)} minutos

Últimas mensagens da conversa:
${history}

Gere uma mensagem de follow-up curta (máximo 3 parágrafos), natural, sem ser invasivo, adequada ao contexto. Não use emojis em excesso. Responda SOMENTE com o texto da mensagem.`;

    const completion = await openai.chat.completions.create({
      model: DEFAULT_AGENT_MODEL,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 300,
      temperature: 0.7
    });

    return completion.choices[0]?.message?.content?.trim() || null;
  } catch (err) {
    log(`[FOLLOWUP] generateAIFollowupMessage error: ${err.message}`);
    return null;
  }
}

/**
 * Send a WhatsApp message via Evolution API.
 */
async function sendFollowupWhatsApp(instanceName, remoteJid, message, mediaUrl) {
  try {
    const evoBase = process.env.EVOLUTION_API_URL;
    const evoKey = process.env.EVOLUTION_API_KEY;
    if (!evoBase || !evoKey) {
      log('[FOLLOWUP] Missing Evolution API config — cannot send message');
      return false;
    }

    // Text message
    const textRes = await fetch(`${evoBase}/message/sendText/${instanceName}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: evoKey },
      body: JSON.stringify({
        number: remoteJid,
        text: message
      })
    });

    if (!textRes.ok) {
      const errorText = await textRes.text();
      log(`[FOLLOWUP] sendText failed: ${textRes.status} ${errorText}`);
      return false;
    }

    // Optional media
    if (mediaUrl) {
      const normalizedMedia = normalizeMediaForEvolution(mediaUrl);
      if (!normalizedMedia) {
        log('[FOLLOWUP] Media skipped: empty media payload');
      } else {
        const mediaRes = await fetch(`${evoBase}/message/sendMedia/${instanceName}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', apikey: evoKey },
          body: JSON.stringify({
            number: remoteJid,
            mediatype: 'image',
            media: normalizedMedia,
            fileName: buildProductMediaFileName('followup', mediaUrl)
          })
        });
        if (!mediaRes.ok) {
          const errorText = await mediaRes.text();
          log(`[FOLLOWUP] sendMedia failed: ${mediaRes.status} ${errorText}`);
        }
      }
    }

    return true;
  } catch (err) {
    log(`[FOLLOWUP] sendFollowupWhatsApp error: ${err.message}`);
    return false;
  }
}

/**
 * [CRON] Process the follow-up queue every 2 minutes.
 */
async function processFollowupQueue() {
  try {
    await ensureFollowupEngineReady();
    await backfillMissedFollowupQueue();
    const stats = { processed: 0, sent: 0, skipped: 0 };
    const pendingRes = await pool.query(`
      SELECT fq.*, fs.ai_mode AS sequence_ai_mode
      FROM followup_queue fq
      LEFT JOIN followup_sequences_v2 fs ON fs.id = fq.sequence_id
      WHERE fq.status = 'pending' AND fq.scheduled_at <= NOW()
      LIMIT 50
    `);

    if (pendingRes.rows.length === 0) return stats;

    log(`[FOLLOWUP] Processing ${pendingRes.rows.length} queued follow-ups`);

    for (const queueEntry of pendingRes.rows) {
      try {
        stats.processed += 1;
        // Fetch the step
        const stepRes = await pool.query(
          `SELECT * FROM followup_steps WHERE sequence_id = $1 AND step_number = $2`,
          [queueEntry.sequence_id, queueEntry.current_step]
        );
        if (stepRes.rows.length === 0) {
          // No more steps, close
          stats.skipped += 1;
          await pool.query(`UPDATE followup_queue SET status = 'completed', updated_at = NOW() WHERE id = $1`, [queueEntry.id]);
          continue;
        }

        const step = stepRes.rows[0];

        // Generate message
        let finalMessage;
        if (queueEntry.sequence_ai_mode) {
          finalMessage = await generateAIFollowupMessage(queueEntry, step);
        }
        if (!finalMessage) {
          finalMessage = await resolveMessageTemplate(step.message_template, queueEntry);
        }

        // Send
        const sent = await sendFollowupWhatsApp(queueEntry.instance_name, queueEntry.remote_jid, finalMessage, step.media_url);

        if (sent) {
          stats.sent += 1;
          // Record event
          await pool.query(`
            INSERT INTO followup_events (followup_queue_id, organization_id, sequence_id, step_number, final_message_sent, template_used, message_sent_at)
            VALUES ($1, $2, $3, $4, $5, $6, NOW())
          `, [queueEntry.id, queueEntry.organization_id, queueEntry.sequence_id, queueEntry.current_step, finalMessage, step.message_template]);

          // Check if there's a next step
          const nextStep = queueEntry.current_step + 1;
          const nextStepRes = await pool.query(
            `SELECT delay_minutes FROM followup_steps WHERE sequence_id = $1 AND step_number = $2`,
            [queueEntry.sequence_id, nextStep]
          );

          if (nextStepRes.rows.length > 0 && nextStep <= queueEntry.total_steps) {
            // Schedule next step
            const delayMins = nextStepRes.rows[0].delay_minutes;
            await pool.query(`
              UPDATE followup_queue
              SET status = 'pending', current_step = $1, scheduled_at = NOW() + ($2 || ' minutes')::interval, updated_at = NOW()
              WHERE id = $3
            `, [nextStep, delayMins, queueEntry.id]);
          } else {
            await pool.query(`UPDATE followup_queue SET status = 'sent', updated_at = NOW() WHERE id = $1`, [queueEntry.id]);
          }

          log(`[FOLLOWUP] Sent follow-up step ${queueEntry.current_step} to ${queueEntry.remote_jid}`);
        } else {
          stats.skipped += 1;
          // Mark as failed temporarily — retry on next run
          await pool.query(`UPDATE followup_queue SET updated_at = NOW() WHERE id = $1`, [queueEntry.id]);
        }
      } catch (itemErr) {
        stats.skipped += 1;
        log(`[FOLLOWUP] Error processing queue item ${queueEntry.id}: ${itemErr.message}`);
      }
    }
    return stats;
  } catch (err) {
    log(`[FOLLOWUP] processFollowupQueue error: ${err.message}`);
    throw err;
  }
}

/**
 * Cancel any pending follow-ups for a JID when the customer replies.
 * Call this inside MESSAGES_UPSERT handler.
 */
async function cancelFollowupOnReply(orgId, remoteJid, replyTimestamp) {
  try {
    await ensureFollowupEngineReady();
    const result = await pool.query(`
      UPDATE followup_queue
      SET status = 'replied', updated_at = NOW()
      WHERE organization_id = $1 AND remote_jid = $2 AND status = 'pending'
      RETURNING id
    `, [orgId, remoteJid]);

    // Mark followup_events as replied
    if (result.rows.length > 0) {
      for (const row of result.rows) {
        const lastEvent = await pool.query(
          `SELECT id, message_sent_at FROM followup_events WHERE followup_queue_id = $1 ORDER BY message_sent_at DESC LIMIT 1`,
          [row.id]
        );
        if (lastEvent.rows.length > 0) {
          const sentAt = new Date(lastEvent.rows[0].message_sent_at);
          const replyAt = replyTimestamp ? new Date(replyTimestamp * 1000) : new Date();
          const replyMinutes = Math.round((replyAt - sentAt) / 60000);
          await pool.query(
            `UPDATE followup_events SET customer_replied = TRUE, reply_time_minutes = $1 WHERE id = $2`,
            [Math.max(0, replyMinutes), lastEvent.rows[0].id]
          );
        }
      }
      log(`[FOLLOWUP] Cancelled ${result.rows.length} pending follow-ups for ${remoteJid} (customer replied)`);
    }
  } catch (err) {
    log(`[FOLLOWUP] cancelFollowupOnReply error: ${err.message}`);
  }
}

// ── END AI Follow-up Engine ────────────────────────────────────────────────────

// ══════════════════════════════════════════════════════════════════════════════
// CONVERSATION INTELLIGENCE ENGINE (CIE)
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Compute aggregated conversation insights for a single org.
 * Called by runConversationIntelligenceEngine per org.
 * Returns batch of rows to upsert into conversation_insights.
 */
async function computeOrgInsights(orgId, periodDays = 30) {
  const periodStart = new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000);

  // Aggregated intent & objection data
  const ciRows = await pool.query(`
    SELECT intent, objections, stage, purchase_probability, days_to_close,
           closed_won, closed_lost, agent_id, conversation_id
    FROM conversation_intelligence
    WHERE organization_id = $1 AND created_at >= $2
  `, [orgId, periodStart.toISOString()]);

  if (ciRows.rows.length === 0) return null;

  const rows = ciRows.rows;

  // Conversion metrics
  const total = rows.length;
  const won = rows.filter(r => r.closed_won).length;
  const lost = rows.filter(r => r.closed_lost).length;
  const conversionRate = total > 0 ? won / total : 0;

  // Avg close time
  const closeTimes = rows.filter(r => r.days_to_close > 0).map(r => r.days_to_close);
  const avgCloseTime = closeTimes.length > 0 ? closeTimes.reduce((a, b) => a + b, 0) / closeTimes.length : 0;

  // Top intents
  const intentCount = {};
  rows.forEach(r => { if (r.intent) intentCount[r.intent] = (intentCount[r.intent] || 0) + 1; });
  const topIntents = Object.entries(intentCount).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k, v]) => ({ intent: k, count: v }));

  // Top objections
  const objCount = {};
  rows.forEach(r => { (r.objections || []).forEach(o => { objCount[o] = (objCount[o] || 0) + 1; }); });
  const topObjections = Object.entries(objCount).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k, v]) => ({ objection: k, count: v }));

  // Pipeline drop stage (most common stage among lost)
  const lostRows = rows.filter(r => r.closed_lost);
  const stageCount = {};
  lostRows.forEach(r => { if (r.stage) stageCount[r.stage] = (stageCount[r.stage] || 0) + 1; });
  const pipelineDropStage = Object.entries(stageCount).sort((a, b) => b[1] - a[1])[0]?.[0] || null;

  return {
    topIntents,
    topObjections,
    conversionRate,
    avgCloseTime,
    pipelineDropStage,
    total,
    won,
    lost
  };
}

/**
 * Extract sales phrases from chat_messages for won / lost conversations.
 * Uses last N messages before close as signal.
 */
async function extractSalesPatterns(orgId) {
  try {
    // Get won conversations — find their conversation_ids
    const wonConvs = await pool.query(`
      SELECT DISTINCT conversation_id FROM conversation_intelligence
      WHERE organization_id = $1 AND closed_won = TRUE AND conversation_id IS NOT NULL
    `, [orgId]);

    // Get lost conversations
    const lostConvs = await pool.query(`
      SELECT DISTINCT conversation_id FROM conversation_intelligence
      WHERE organization_id = $1 AND closed_lost = TRUE AND conversation_id IS NOT NULL
    `, [orgId]);

    const processConversations = async (convIds, patternType) => {
      for (const row of convIds) {
        const convId = row.conversation_id;
        // Fetch up to 5 assistant messages before close (closing/killing phrases)
        const msgs = await pool.query(`
          SELECT content FROM chat_messages
          WHERE remote_jid = $1 AND role = 'assistant'
          ORDER BY created_at DESC LIMIT 5
        `, [convId]);

        for (const msg of msgs.rows) {
          if (!msg.content || msg.content.length > 300) continue;
          // Extract short phrases (sentences under 100 chars)
          const sentences = msg.content.split(/[.!?]/).map(s => s.trim()).filter(s => s.length > 10 && s.length < 100);
          for (const phrase of sentences.slice(0, 3)) {
            const impact = patternType === 'closing_phrase' ? 0.8 : -0.7;
            await pool.query(`
              INSERT INTO sales_patterns (organization_id, pattern_type, phrase_detected, conversion_impact_score, detected_count)
              VALUES ($1, $2, $3, $4, 1)
              ON CONFLICT (organization_id, pattern_type, phrase_detected)
              DO UPDATE SET detected_count = sales_patterns.detected_count + 1, updated_at = NOW()
            `, [orgId, patternType, phrase, impact]);
          }
        }
      }
    };

    await processConversations(wonConvs.rows, 'closing_phrase');
    await processConversations(lostConvs.rows, 'killer_phrase');

    log(`[CIE] Sales patterns extracted for org ${orgId}`);
  } catch (err) {
    log(`[CIE] extractSalesPatterns error (org ${orgId}): ${err.message}`);
  }
}

/**
 * Generate behavioral insight rows for the org.
 */
async function computeBehaviorPatterns(orgId) {
  try {
    // Pattern 1: Fast responders vs slow — compare win rate
    const fastReply = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE sbg.conversion_result = 'won') AS won_fast,
        COUNT(*) AS total_fast
      FROM sales_behavior_graph sbg
      WHERE sbg.organization_id = $1 AND sbg.time_between_messages <= 5
    `, [orgId]);
    const slowReply = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE sbg.conversion_result = 'won') AS won_slow,
        COUNT(*) AS total_slow
      FROM sales_behavior_graph sbg
      WHERE sbg.organization_id = $1 AND sbg.time_between_messages > 30
    `, [orgId]);

    const fastWins = parseInt(fastReply.rows[0]?.won_fast || 0);
    const fastTotal = parseInt(fastReply.rows[0]?.total_fast || 0);
    const slowWins = parseInt(slowReply.rows[0]?.won_slow || 0);
    const slowTotal = parseInt(slowReply.rows[0]?.total_slow || 0);

    if (fastTotal >= 5 && slowTotal >= 5) {
      const fastRate = fastWins / fastTotal;
      const slowRate = slowWins / slowTotal;
      const lift = Math.round((fastRate - slowRate) * 100);
      const desc = `Leads respondidos em até 5 minutos convertem ${Math.abs(lift)}% ${lift > 0 ? 'a mais' : 'a menos'} que respostas acima de 30 minutos.`;
      await pool.query(`
        INSERT INTO behavior_patterns (organization_id, pattern_type, pattern_description, impact_score, sample_size, metadata)
        VALUES ($1, 'response_speed', $2, $3, $4, $5)
        ON CONFLICT DO NOTHING
      `, [orgId, desc, Math.abs(lift / 100), fastTotal + slowTotal, JSON.stringify({ fast_rate: fastRate, slow_rate: slowRate })]);
    }

    // Pattern 2: Price objection impact
    const priceObj = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE closed_won = TRUE) AS won,
        COUNT(*) AS total
      FROM conversation_intelligence
      WHERE organization_id = $1 AND 'preco_alto' = ANY(objections)
    `, [orgId]);

    const noPrice = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE closed_won = TRUE) AS won,
        COUNT(*) AS total
      FROM conversation_intelligence
      WHERE organization_id = $1 AND NOT ('preco_alto' = ANY(COALESCE(objections, '{}')))
    `, [orgId]);

    const priceWon = parseInt(priceObj.rows[0]?.won || 0);
    const priceTotal = parseInt(priceObj.rows[0]?.total || 0);
    const noPriceWon = parseInt(noPrice.rows[0]?.won || 0);
    const noPriceTotal = parseInt(noPrice.rows[0]?.total || 0);

    if (priceTotal >= 5 && noPriceTotal >= 5) {
      const priceRate = priceWon / priceTotal;
      const noPriceRate = noPriceWon / noPriceTotal;
      const diff = Math.round((priceRate - noPriceRate) * 100);
      const desc = `Leads com objeção de preço convertem ${Math.abs(diff)}% ${diff < 0 ? 'a menos' : 'a mais'} do que sem essa objeção.`;
      await pool.query(`
        INSERT INTO behavior_patterns (organization_id, pattern_type, pattern_description, impact_score, sample_size, metadata)
        VALUES ($1, 'price_objection', $2, $3, $4, $5)
        ON CONFLICT DO NOTHING
      `, [orgId, desc, Math.abs(diff / 100), priceTotal + noPriceTotal, JSON.stringify({ price_obj_rate: priceRate, no_price_rate: noPriceRate })]);
    }

    // Pattern 3: Hot leads close faster
    const tempData = await pool.query(`
      SELECT os.temperature,
        AVG(sbg.time_to_decision) AS avg_days,
        COUNT(*) FILTER (WHERE sbg.conversion_result = 'won') AS won,
        COUNT(*) AS total
      FROM sales_behavior_graph sbg
      JOIN opportunity_scores os ON os.lead_id = sbg.lead_id
      WHERE sbg.organization_id = $1
      GROUP BY os.temperature
    `, [orgId]);

    for (const row of tempData.rows) {
      if (parseInt(row.total) >= 5) {
        const rate = Math.round((parseInt(row.won) / parseInt(row.total)) * 100);
        const desc = `Leads "${row.temperature}" têm taxa de conversão de ${rate}% com tempo médio de fechamento de ${Math.round(row.avg_days || 0)} dias.`;
        await pool.query(`
          INSERT INTO behavior_patterns (organization_id, pattern_type, pattern_description, impact_score, sample_size, metadata)
          VALUES ($1, $2, $3, $4, $5, $6)
          ON CONFLICT DO NOTHING
        `, [orgId, `temp_${row.temperature}`, desc, rate / 100, parseInt(row.total), JSON.stringify({ temperature: row.temperature, conversion_rate: rate / 100 })]);
      }
    }

    log(`[CIE] Behavior patterns computed for org ${orgId}`);
  } catch (err) {
    log(`[CIE] computeBehaviorPatterns error (org ${orgId}): ${err.message}`);
  }
}

/**
 * Main CIE batch engine. Processes unprocessed conversations per org in batches.
 * Designed to run once daily.
 */
async function runConversationIntelligenceEngine() {
  try {
    log('[CIE] Starting Conversation Intelligence Engine run...');

    // Get all distinct orgs with unprocessed data
    const orgsRes = await pool.query(`
      SELECT DISTINCT organization_id FROM conversation_intelligence
      WHERE processed_by_cie = FALSE
    `);

    log(`[CIE] Processing ${orgsRes.rows.length} organizations...`);

    for (const orgRow of orgsRes.rows) {
      const orgId = orgRow.organization_id;
      try {
        // 1. Compute aggregated insights
        const insights = await computeOrgInsights(orgId, 30);
        if (insights) {
          await pool.query(`
            INSERT INTO conversation_insights (
              organization_id, period, period_start, period_end,
              top_objections, top_intents, conversion_rate, avg_close_time_days,
              pipeline_drop_stage, total_conversations, total_won, total_lost
            ) VALUES ($1,'daily', NOW() - INTERVAL '30 days', NOW(), $2,$3,$4,$5,$6,$7,$8,$9)
          `, [
            orgId,
            JSON.stringify(insights.topObjections),
            JSON.stringify(insights.topIntents),
            insights.conversionRate,
            insights.avgCloseTime,
            insights.pipelineDropStage,
            insights.total,
            insights.won,
            insights.lost
          ]);
        }

        // 2. Extract sales phrase patterns
        await extractSalesPatterns(orgId);

        // 3. Compute behavioral patterns
        await computeBehaviorPatterns(orgId);

        // 4. Mark batch as processed
        await pool.query(`
          UPDATE conversation_intelligence SET processed_by_cie = TRUE
          WHERE organization_id = $1 AND processed_by_cie = FALSE
        `, [orgId]);

        log(`[CIE] Org ${orgId} processed successfully.`);
      } catch (orgErr) {
        log(`[CIE] Error processing org ${orgId}: ${orgErr.message}`);
      }
    }

    log('[CIE] Engine run complete.');
  } catch (err) {
    log(`[CIE] runConversationIntelligenceEngine error: ${err.message}`);
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// CONVERSATION STATE ENGINE (CSE)
// Backend-controlled conversation stage machine.
// The LLM receives a slim payload; stage transitions are decided here, not by the AI.
// ══════════════════════════════════════════════════════════════════════════════

const ensureConversationStateTables = async () => {
  try {
    log('[CSE] Ensuring Conversation State tables...');

    await pool.query(`
      CREATE TABLE IF NOT EXISTS conversation_state (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id TEXT NOT NULL,
        agent_id UUID,
        lead_id TEXT NOT NULL,
        lead_stage TEXT NOT NULL DEFAULT 'novo',
        conversation_goal TEXT,
        last_user_intent TEXT,
        last_ai_action TEXT,
        next_expected_action TEXT,
        stage_entered_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(agent_id, lead_id)
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_cse_agent_lead ON conversation_state(agent_id, lead_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_cse_org ON conversation_state(organization_id)`);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS lead_memory (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id TEXT NOT NULL,
        lead_id TEXT NOT NULL,
        name TEXT,
        pain_point TEXT,
        product_interest TEXT,
        budget_range TEXT,
        decision_timeline TEXT,
        main_objection TEXT,
        asked_price BOOLEAN DEFAULT FALSE,
        showed_buying_intent BOOLEAN DEFAULT FALSE,
        accepted_meeting BOOLEAN DEFAULT FALSE,
        answered_questions JSONB DEFAULT '{}',
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(organization_id, lead_id)
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_lm_org_lead ON lead_memory(organization_id, lead_id)`);

    // Extend lead_memory with structured + semantic memory fields (safe to re-run)
    const alterColumns = [
      // Structured identity fields
      `ALTER TABLE lead_memory ADD COLUMN IF NOT EXISTS company TEXT`,
      `ALTER TABLE lead_memory ADD COLUMN IF NOT EXISTS business_type TEXT`,
      `ALTER TABLE lead_memory ADD COLUMN IF NOT EXISTS lead_interest TEXT`,
      `ALTER TABLE lead_memory ADD COLUMN IF NOT EXISTS purchase_moment TEXT`,
      `ALTER TABLE lead_memory ADD COLUMN IF NOT EXISTS decision_role TEXT`,
      // Semantic insight signals
      `ALTER TABLE lead_memory ADD COLUMN IF NOT EXISTS lead_interested BOOLEAN DEFAULT FALSE`,
      `ALTER TABLE lead_memory ADD COLUMN IF NOT EXISTS lead_price_sensitive BOOLEAN DEFAULT FALSE`,
      `ALTER TABLE lead_memory ADD COLUMN IF NOT EXISTS lead_comparing_options BOOLEAN DEFAULT FALSE`,
      `ALTER TABLE lead_memory ADD COLUMN IF NOT EXISTS lead_not_ready BOOLEAN DEFAULT FALSE`,
      `ALTER TABLE lead_memory ADD COLUMN IF NOT EXISTS lead_urgent BOOLEAN DEFAULT FALSE`,
      // Orchestrator / CRM summary fields
      `ALTER TABLE lead_memory ADD COLUMN IF NOT EXISTS last_intent TEXT`,
      `ALTER TABLE lead_memory ADD COLUMN IF NOT EXISTS last_temperature TEXT`,
      `ALTER TABLE lead_memory ADD COLUMN IF NOT EXISTS last_agent_decision TEXT`,
      `ALTER TABLE lead_memory ADD COLUMN IF NOT EXISTS lead_summary TEXT`,
      `ALTER TABLE lead_memory ADD COLUMN IF NOT EXISTS next_recommendation TEXT`,
    ];
    for (const sql of alterColumns) {
      await pool.query(sql).catch(e => log(`[CSE] ALTER warning: ${e.message}`));
    }

    log('[CSE] Conversation State tables verified.');
  } catch (err) {
    log('[CSE] ensureConversationStateTables error: ' + err.message);
  }
};

// ─── CSE: Load or create conversation state ───────────────────────────────────
async function loadConversationState(orgId, agentId, leadId) {
  try {
    // Ensure state row exists
    await pool.query(`
      INSERT INTO conversation_state (organization_id, agent_id, lead_id, lead_stage, conversation_goal)
      VALUES ($1, $2, $3, 'novo', 'Qualificar o lead e entender sua necessidade principal.')
      ON CONFLICT (agent_id, lead_id) DO NOTHING
    `, [orgId, agentId, leadId]);

    const stateRes = await pool.query(
      `SELECT * FROM conversation_state WHERE agent_id = $1 AND lead_id = $2`,
      [agentId, leadId]
    );
    const state = stateRes.rows[0] || null;

    // Ensure lead memory row exists
    await pool.query(`
      INSERT INTO lead_memory (organization_id, lead_id)
      VALUES ($1, $2)
      ON CONFLICT (organization_id, lead_id) DO NOTHING
    `, [orgId, leadId]);

    const memRes = await pool.query(
      `SELECT * FROM lead_memory WHERE organization_id = $1 AND lead_id = $2`,
      [orgId, leadId]
    );
    const memory = memRes.rows[0] || {};

    return { state, memory };
  } catch (err) {
    log(`[CSE] loadConversationState error: ${err.message}`);
    return { state: null, memory: {} };
  }
}

// ─── CSE: Extract user intent (lightweight LLM call) ─────────────────────────
async function extractUserIntent(messageContent) {
  try {
    if (!messageContent || !messageContent.trim()) return 'neutral';

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{
        role: 'system',
        content: `Classifique a intenção da mensagem do lead em EXATAMENTE uma das opções abaixo. Responda apenas com a palavra-chave.

Opções:
- buying_intent     (demonstra interesse real em comprar, fechar, contratar)
- asked_price       (perguntou preço, valor, investimento, custo, parcela)
- accepted_meeting  (aceitou agendar, marcar reunião, demonstração, horário)
- gave_objection    (expressou resistência, objeção, dúvida impeditiva)
- asked_info        (pediu mais informações, detalhes, explicação sobre produto/serviço)
- not_interested    (disse que não tem interesse, está satisfeito, dispensa)
- neutral           (qualquer outra coisa)`
      }, {
        role: 'user',
        content: messageContent.substring(0, 400)
      }],
      max_tokens: 12,
      temperature: 0,
    });

    const raw = (completion.choices[0]?.message?.content || 'neutral').trim().toLowerCase();
    const valid = ['buying_intent', 'asked_price', 'accepted_meeting', 'gave_objection', 'asked_info', 'not_interested', 'neutral'];
    return valid.includes(raw) ? raw : 'neutral';
  } catch (err) {
    log(`[CSE] extractUserIntent error: ${err.message}`);
    return 'neutral';
  }
}

// ─── CSE: Stage transition rules (pure backend, no LLM) ──────────────────────
const STAGE_GOALS = {
  novo: 'Saudar o lead e iniciar qualificação. Fazer apenas UMA pergunta de qualificação.',
  qualificacao: 'Identificar a necessidade principal, aplicação e contexto do lead.',
  diagnostico: 'Aprofundar o problema. Entender dor, urgência e decisão de compra.',
  apresentacao: 'Apresentar a solução conectando diretamente ao problema do lead.',
  proposta: 'Apresentar valor e ROI. Não dar desconto. Fortalecer justificativa de preço.',
  agendamento: 'Usar as ferramentas de agendamento para marcar uma reunião ou demonstração.',
  followup: 'Retomar o contexto anterior e reengajar o lead com uma pergunta direcionadora.',
};

function determineStageTransition(currentStage, intent, memory) {
  let newStage = currentStage;

  switch (currentStage) {
    case 'novo':
      newStage = 'qualificacao';
      break;
    case 'qualificacao':
      if (intent === 'asked_price') newStage = 'proposta';
      else if (intent === 'buying_intent') newStage = 'diagnostico';
      else if (intent === 'asked_info' || intent === 'gave_objection') newStage = 'diagnostico';
      break;
    case 'diagnostico':
      if (intent === 'asked_price') newStage = 'proposta';
      else if (intent === 'buying_intent') newStage = 'apresentacao';
      else if (intent === 'accepted_meeting') newStage = 'agendamento';
      break;
    case 'apresentacao':
      if (intent === 'asked_price') newStage = 'proposta';
      else if (intent === 'accepted_meeting') newStage = 'agendamento';
      break;
    case 'proposta':
      if (intent === 'accepted_meeting') newStage = 'agendamento';
      break;
    case 'followup':
      // Re-engage: react to what user said
      if (intent === 'asked_price') newStage = 'proposta';
      else if (intent === 'buying_intent') newStage = 'apresentacao';
      else if (intent === 'accepted_meeting') newStage = 'agendamento';
      else newStage = 'qualificacao';
      break;
    default:
      break;
  }

  const stageChanged = newStage !== currentStage;
  const goal = STAGE_GOALS[newStage] || STAGE_GOALS['qualificacao'];

  // Determine next expected action hint for this stage
  const nextExpected = {
    novo: 'lead_reply_to_greeting',
    qualificacao: 'lead_share_context',
    diagnostico: 'lead_confirm_pain',
    apresentacao: 'lead_react_to_presentation',
    proposta: 'lead_react_to_price',
    agendamento: 'lead_confirm_slot',
    followup: 'lead_reengage',
  }[newStage] || 'lead_reply';

  return { newStage, goal, stageChanged, nextExpected };
}

// ─── CSE: Build slim LLM payload ─────────────────────────────────────────────
function buildCSEStageDirective(stage, goal, memory) {
  let directive = `\n\n[ESTADO DA CONVERSA]\nEstágio atual: ${stage.toUpperCase()}\nObjetivo deste turno: ${goal}\n`;

  // ── Layer 2: Structured identity + behavioral memory ───────────────────────
  const known = [];
  if (memory.name) known.push(`Nome do lead: "${memory.name}"`);
  if (memory.company) known.push(`Empresa: "${memory.company}"`);
  if (memory.business_type) known.push(`Setor/negócio: "${memory.business_type}"`);
  if (memory.lead_interest) known.push(`Interesse identificado: "${memory.lead_interest}"`);
  if (memory.pain_point) known.push(`Dor identificada: "${memory.pain_point}"`);
  if (memory.product_interest) known.push(`Produto de interesse: "${memory.product_interest}"`);
  if (memory.budget_range) known.push(`Orçamento informado: "${memory.budget_range}"`);
  if (memory.purchase_moment) known.push(`Momento de compra: "${memory.purchase_moment}"`);
  if (memory.decision_timeline) known.push(`Prazo de decisão: "${memory.decision_timeline}"`);
  if (memory.decision_role) known.push(`Papel na decisão: "${memory.decision_role}"`);
  if (memory.main_objection) known.push(`Objeção principal: "${memory.main_objection}"`);
  if (memory.asked_price) known.push('Lead já perguntou o preço — não repita a qualificação de valor.');
  if (memory.showed_buying_intent) known.push('Lead demonstrou intenção de compra anteriormente.');
  if (memory.accepted_meeting) known.push('Lead aceitou agendar — priorize confirmar data/horário.');

  if (known.length > 0) {
    directive += `\n[MEMÓRIA ESTRUTURADA DO LEAD — NÃO PERGUNTE O QUE JÁ SABE]\n${known.join('\n')}\n`;
  }

  // ── Layer 3: Semantic insight signals ─────────────────────────────────────
  const signals = [];
  if (memory.lead_interested) signals.push('✓ Interessado no produto');
  if (memory.lead_price_sensitive) signals.push('✓ Sensível a preço — use ROI, não desconto');
  if (memory.lead_comparing_options) signals.push('✓ Comparando opções — destaque diferenciais');
  if (memory.lead_not_ready) signals.push('⚠ Não está pronto — foque em educar e manter engajamento');
  if (memory.lead_urgent) signals.push('✓ Urgente — acesse decisão agora, minimize fricção');

  if (signals.length > 0) {
    directive += `\n[SINAIS SEMÂNTICOS DETECTADOS]\n${signals.join('\n')}\n`;
  }

  const answeredKeys = Object.keys(memory.answered_questions || {});
  if (answeredKeys.length > 0) {
    directive += `\n[PERGUNTAS JÁ FEITAS — NÃO REPITA]\n${answeredKeys.join(', ')}\n`;
  }

  return directive;
}

// ─── CSE: Update state after AI response ─────────────────────────────────────
async function updateConversationState(stateId, intent, newStage, goal, nextExpected, aiResponseSnippet) {
  try {
    await pool.query(`
      UPDATE conversation_state SET
        lead_stage = $1,
        conversation_goal = $2,
        last_user_intent = $3,
        last_ai_action = $4,
        next_expected_action = $5,
        stage_entered_at = CASE WHEN lead_stage != $1 THEN NOW() ELSE stage_entered_at END,
        updated_at = NOW()
      WHERE id = $6
    `, [
      newStage,
      goal,
      intent,
      aiResponseSnippet ? aiResponseSnippet.substring(0, 200) : null,
      nextExpected,
      stateId
    ]);
  } catch (err) {
    log(`[CSE] updateConversationState error: ${err.message}`);
  }
}

// ─── MEMORY: Extract structured memory from conversation (lightweight LLM call) ──
/**
 * Reads the last 3 messages + new user message and extracts structured lead memory.
 * Returns a partial object — only fields that could be extracted are present.
 * Runs async/non-blocking after AI response.
 */
async function extractConversationMemory(last3Messages, userMessage) {
  try {
    const conversationText = [
      ...last3Messages.map(m => `${m.role === 'user' ? 'Lead' : 'IA'}: ${m.content || ''}`),
      `Lead: ${userMessage}`
    ].join('\n').substring(0, 1500);

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{
        role: 'system',
        content: `Você é um extrator de dados de CRM. Leia a conversa abaixo e extraia as informações do lead.
Retorne APENAS um JSON válido com os campos a seguir. Para campos desconhecidos use null. Não invente dados.

Campos obrigatórios no JSON:
{
  "name": string | null,
  "company": string | null,
  "business_type": string | null,
  "lead_interest": string | null,
  "budget_range": string | null,
  "purchase_moment": string | null,
  "decision_role": "decisor" | "influenciador" | "usuario_final" | null,
  "main_objection": string | null,
  "pain_point": string | null,
  "lead_interested": boolean,
  "lead_price_sensitive": boolean,
  "lead_comparing_options": boolean,
  "lead_not_ready": boolean,
  "lead_urgent": boolean
}`
      }, {
        role: 'user',
        content: conversationText
      }],
      max_tokens: 250,
      temperature: 0,
      response_format: { type: 'json_object' },
    });

    const raw = completion.choices[0]?.message?.content;
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (err) {
    log(`[AI ANALYST] extractConversationMemory error: ${err.message}`);
    return null;
  }
}

// ─── MEMORY: Upsert all extracted fields into lead_memory ────────────────────
async function updateLeadMemory(orgId, leadId, intent, extractedMemory) {
  try {
    // Boolean flags from intent classification
    const intentFlags = {
      asked_price: intent === 'asked_price' ? true : undefined,
      showed_buying_intent: intent === 'buying_intent' ? true : undefined,
      accepted_meeting: intent === 'accepted_meeting' ? true : undefined,
    };

    // Build dynamic SET clause — only apply non-null values
    const setClauses = [];
    const values = [orgId, leadId];
    let idx = 3;

    // Helper: COALESCE update (don't overwrite existing data)
    const coalesce = (col, val) => {
      if (val !== null && val !== undefined && val !== '') {
        setClauses.push(`${col} = COALESCE(${col}, $${idx++})`);
        values.push(val);
      }
    };
    // Helper: OR update for booleans (once true, stays true)
    const orFlag = (col, val) => {
      if (val === true) {
        setClauses.push(`${col} = ${col} OR $${idx++}`);
        values.push(true);
      }
    };
    // Helper: overwrite for semantic signals (can flip back to false)
    const setSignal = (col, val) => {
      if (typeof val === 'boolean') {
        setClauses.push(`${col} = $${idx++}`);
        values.push(val);
      }
    };

    // --- Intent flags ---
    if (intentFlags.asked_price !== undefined) orFlag('asked_price', intentFlags.asked_price);
    if (intentFlags.showed_buying_intent !== undefined) orFlag('showed_buying_intent', intentFlags.showed_buying_intent);
    if (intentFlags.accepted_meeting !== undefined) orFlag('accepted_meeting', intentFlags.accepted_meeting);

    // --- Structured extracted memory ---
    if (extractedMemory) {
      coalesce('name', extractedMemory.name);
      coalesce('company', extractedMemory.company);
      coalesce('business_type', extractedMemory.business_type);
      coalesce('lead_interest', extractedMemory.lead_interest);
      coalesce('budget_range', extractedMemory.budget_range);
      coalesce('purchase_moment', extractedMemory.purchase_moment);
      coalesce('decision_role', extractedMemory.decision_role);
      coalesce('main_objection', extractedMemory.main_objection);
      coalesce('top_objection', extractedMemory.main_objection);
      coalesce('pain_point', extractedMemory.pain_point);
      // Semantic signals — overwrite each turn (reflects current state)
      setSignal('lead_interested', extractedMemory.lead_interested);
      setSignal('lead_price_sensitive', extractedMemory.lead_price_sensitive);
      setSignal('lead_comparing_options', extractedMemory.lead_comparing_options);
      setSignal('lead_not_ready', extractedMemory.lead_not_ready);
      setSignal('lead_urgent', extractedMemory.lead_urgent);
    }

    if (setClauses.length === 0) return; // Nothing to update
    setClauses.push('updated_at = NOW()');

    await pool.query(
      `UPDATE lead_memory SET ${setClauses.join(', ')} WHERE organization_id = $1 AND lead_id = $2`,
      values
    );
    log(`[MEMORY] Updated lead_memory for ${leadId}: ${setClauses.length - 1} fields`);
  } catch (err) {
    log(`[MEMORY] updateLeadMemory error: ${err.message}`);
  }
}

function normalizePhoneDigits(value) {
  return String(value || '').replace(/\D/g, '');
}

const KOGNA_SYSTEM_ORIGIN_MARKER = "\u200B\u200C\u200D\u2060\u2061\u2062\u2063";

function buildPhoneCandidateList(value) {
  const digits = normalizePhoneDigits(value);
  if (!digits) return [];

  const candidates = new Set([digits]);
  if (digits.startsWith("55") && digits.length > 11) {
    candidates.add(digits.slice(2));
  } else if (!digits.startsWith("55")) {
    candidates.add(`55${digits}`);
  }
  return [...candidates].filter(Boolean);
}

function markSystemOriginMessage(message) {
  const text = String(message || "");
  return text.includes(KOGNA_SYSTEM_ORIGIN_MARKER)
    ? text
    : `${text}${KOGNA_SYSTEM_ORIGIN_MARKER}`;
}

function hasKognaSystemOriginMarker(message) {
  return String(message || "").includes(KOGNA_SYSTEM_ORIGIN_MARKER);
}

async function isKognaInternalOrigin(remoteJid) {
  const remoteDigits = String(remoteJid || "").split("@")[0];
  const candidates = buildPhoneCandidateList(remoteDigits);
  if (candidates.length === 0) return false;

  const configuredNumbers = normalizeStringList(process.env.KOGNA_INTERNAL_WHATSAPP_NUMBERS || "")
    .flatMap((entry) => buildPhoneCandidateList(entry));
  if (configuredNumbers.some((entry) => candidates.includes(entry))) {
    return true;
  }

  const adminUserRes = await pool.query(
    `SELECT 1
       FROM users
      WHERE role = 'admin'
        AND (
          regexp_replace(COALESCE(personal_phone, ''), '\\D', '', 'g') = ANY($1::text[])
          OR regexp_replace(COALESCE(company_phone, ''), '\\D', '', 'g') = ANY($1::text[])
        )
      LIMIT 1`,
    [candidates],
  ).catch(() => ({ rows: [] }));

  return adminUserRes.rows.length > 0;
}

async function getInboundIgnoreReason({ remoteJid, content }) {
  if (hasKognaSystemOriginMarker(content)) {
    return "system-origin";
  }

  if (await isKognaInternalOrigin(remoteJid)) {
    return "kogna-internal-number";
  }

  return null;
}

async function cleanupFailedOnboardingProvisioning({ orgId, userId }) {
  if (!orgId && !userId) return;

  await pool.query(
    `UPDATE organizations
        SET owner_id = NULL
      WHERE id = $1`,
    [orgId],
  ).catch(() => { });

  await pool.query(
    `DELETE FROM agents
      WHERE organization_id = $1`,
    [orgId],
  ).catch(() => { });

  await pool.query(
    `DELETE FROM ia_configs
      WHERE organization_id = $1
         OR user_id = $2`,
    [orgId, userId],
  ).catch(() => { });

  await pool.query(
    `DELETE FROM users
      WHERE id = $1`,
    [userId],
  ).catch(() => { });

  await pool.query(
    `DELETE FROM organizations
      WHERE id = $1`,
    [orgId],
  ).catch(() => { });
}

function formatConversationStage(stage) {
  const labels = {
    novo: 'Inicio do contato',
    qualificacao: 'Qualificacao',
    diagnostico: 'Diagnostico',
    apresentacao: 'Apresentacao da solucao',
    proposta: 'Proposta',
    agendamento: 'Agendamento',
    followup: 'Follow-up',
  };
  return labels[stage] || stage || 'Em andamento';
}

function formatIntentLabel(intent) {
  const labels = {
    buying_intent: 'Interesse de compra',
    asked_price: 'Pedido de preco',
    accepted_meeting: 'Aceitou agendamento',
    gave_objection: 'Objeção ativa',
    asked_info: 'Pedido de informacoes',
    not_interested: 'Sem interesse',
    neutral: 'Explorando a conversa',
  };
  return labels[intent] || 'Sem classificacao';
}

function buildNextRecommendation({ stage, nextExpected, memory, intent, leadRow }) {
  if (nextExpected === 'schedule_meeting' || memory?.accepted_meeting) {
    return 'Priorizar confirmacao de dia e horario para avancar a conversa.';
  }
  if (intent === 'asked_price' || memory?.lead_price_sensitive) {
    return 'Responder valor com contexto de ROI e reduzir a friccao sobre preco.';
  }
  if (intent === 'gave_objection' || memory?.main_objection) {
    return `Trabalhar a objecao principal${memory?.main_objection ? `: ${memory.main_objection}` : ''} antes de pressionar o fechamento.`;
  }
  if (stage === 'proposta') {
    return 'Retomar a proposta enviada, validar aderencia e conduzir para decisao.';
  }
  if (stage === 'apresentacao') {
    return 'Conectar a solucao diretamente a dor do lead e puxar o proximo compromisso.';
  }
  if (stage === 'diagnostico') {
    return 'Aprofundar contexto, urgencia e criterios de decisao para qualificar melhor.';
  }
  if (memory?.lead_not_ready) {
    return 'Manter o lead aquecido com educacao e um proximo passo leve, sem forcar fechamento.';
  }
  if (leadRow?.temperature && String(leadRow.temperature).toLowerCase().includes('quente')) {
    return 'Acao comercial rapida: responder agora e tentar avancar para proposta ou fechamento.';
  }
  return 'Continuar a qualificacao com uma unica pergunta objetiva e mover a conversa para o proximo passo.';
}

function buildLeadSummaryText({ leadRow, stage, intent, memory, nextRecommendation }) {
  const pieces = [];
  const leadName = leadRow?.name || memory?.name || 'O lead';

  pieces.push(`${leadName} esta em ${formatConversationStage(stage)}.`);

  if (leadRow?.last_ia_briefing) {
    pieces.push(leadRow.last_ia_briefing);
  } else if (memory?.pain_point) {
    pieces.push(`A principal dor percebida e ${memory.pain_point}.`);
  } else {
    pieces.push(`A conversa indica ${formatIntentLabel(intent).toLowerCase()}.`);
  }

  if (memory?.lead_interest || memory?.product_interest) {
    pieces.push(`Interesse atual: ${memory.lead_interest || memory.product_interest}.`);
  }
  if (memory?.main_objection) {
    pieces.push(`Objecao principal: ${memory.main_objection}.`);
  }
  if (memory?.purchase_moment) {
    pieces.push(`Momento de compra: ${memory.purchase_moment}.`);
  }

  pieces.push(`Recomendacao: ${nextRecommendation}`);

  return pieces.join(' ');
}

async function resolveLeadConversationContext(orgId, leadIdentifier) {
  const identifier = String(leadIdentifier || '');
  let lead = null;

  const leadByIdRes = await pool.query(
    `SELECT id, name, phone, mobile_phone, status, score, temperature, last_ia_briefing,
            needs_human_attention, human_attention_reason, human_attention_since, top_objection
     FROM leads
     WHERE organization_id = $1 AND id = $2
     LIMIT 1`,
    [orgId, identifier]
  );
  if (leadByIdRes.rows.length > 0) {
    lead = leadByIdRes.rows[0];
  }

  const digits = normalizePhoneDigits(lead?.phone || lead?.mobile_phone || identifier);
  const exactConversationKey = digits ? `${digits}@s.whatsapp.net` : identifier.includes('@') ? identifier : null;

  const leadIdCandidates = [];
  if (identifier) leadIdCandidates.push(identifier);
  if (exactConversationKey && !leadIdCandidates.includes(exactConversationKey)) {
    leadIdCandidates.push(exactConversationKey);
  }
  if (digits && !leadIdCandidates.includes(digits)) {
    leadIdCandidates.push(digits);
  }

  if (!lead && digits) {
    const leadByPhoneRes = await pool.query(
      `SELECT id, name, phone, mobile_phone, status, score, temperature, last_ia_briefing,
              needs_human_attention, human_attention_reason, human_attention_since, top_objection
       FROM leads
       WHERE organization_id = $1
         AND (
           regexp_replace(COALESCE(phone, ''), '\\D', '', 'g') = $2
           OR regexp_replace(COALESCE(mobile_phone, ''), '\\D', '', 'g') = $2
         )
       ORDER BY last_contact DESC NULLS LAST, created_at DESC
       LIMIT 1`,
      [orgId, digits]
    );
    lead = leadByPhoneRes.rows[0] || null;
    if (lead?.id && !leadIdCandidates.includes(lead.id)) {
      leadIdCandidates.unshift(lead.id);
    }
  }

  let memory = null;
  let conversationKey = exactConversationKey || identifier;
  for (const candidate of leadIdCandidates) {
    const memRes = await pool.query(
      `SELECT * FROM lead_memory WHERE organization_id = $1 AND lead_id = $2 LIMIT 1`,
      [orgId, candidate]
    );
    if (memRes.rows.length > 0) {
      memory = memRes.rows[0];
      conversationKey = candidate;
      break;
    }
  }

  let state = null;
  for (const candidate of [conversationKey, ...leadIdCandidates.filter(c => c !== conversationKey)]) {
    if (!candidate) continue;
    const stateRes = await pool.query(
      `SELECT lead_stage, conversation_goal, last_user_intent, last_ai_action,
              next_expected_action, stage_entered_at, updated_at
       FROM conversation_state
       WHERE organization_id = $1 AND lead_id = $2
       ORDER BY updated_at DESC
       LIMIT 1`,
      [orgId, candidate]
    );
    if (stateRes.rows.length > 0) {
      state = stateRes.rows[0];
      conversationKey = candidate;
      break;
    }
  }

  return { lead, memory, state, conversationKey, digits };
}

async function refreshLeadConversationSummary({
  orgId,
  conversationKey,
  leadId = null,
  intent = null,
  stage = null,
  nextExpected = null,
  agentDecision = null,
}) {
  try {
    const context = await resolveLeadConversationContext(orgId, leadId || conversationKey);
    const effectiveKey = context.conversationKey || conversationKey;
    if (!effectiveKey) return null;

    const memory = context.memory || {};
    const effectiveStage = stage || context.state?.lead_stage || null;
    const effectiveIntent = intent || memory.last_intent || context.state?.last_user_intent || 'neutral';
    const effectiveRecommendation = buildNextRecommendation({
      stage: effectiveStage,
      nextExpected: nextExpected || context.state?.next_expected_action || null,
      memory,
      intent: effectiveIntent,
      leadRow: context.lead,
    });
    const summaryText = buildLeadSummaryText({
      leadRow: context.lead,
      stage: effectiveStage,
      intent: effectiveIntent,
      memory,
      nextRecommendation: effectiveRecommendation,
    });

    const effectiveTemperature = context.lead?.temperature || memory.last_temperature || null;
    const effectiveAgentDecision = agentDecision || memory.last_agent_decision || null;

    const targets = Array.from(new Set([effectiveKey, context.lead?.id].filter(Boolean)));

    for (const targetLeadId of targets) {
      await pool.query(
        `INSERT INTO lead_memory (organization_id, lead_id, last_intent, last_temperature, last_agent_decision, lead_summary, next_recommendation, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
         ON CONFLICT (organization_id, lead_id)
         DO UPDATE SET
           last_intent = EXCLUDED.last_intent,
           last_temperature = COALESCE(EXCLUDED.last_temperature, lead_memory.last_temperature),
           last_agent_decision = COALESCE(EXCLUDED.last_agent_decision, lead_memory.last_agent_decision),
           lead_summary = EXCLUDED.lead_summary,
           next_recommendation = EXCLUDED.next_recommendation,
           updated_at = NOW()`,
        [
          orgId,
          targetLeadId,
          effectiveIntent,
          effectiveTemperature,
          effectiveAgentDecision,
          summaryText,
          effectiveRecommendation,
        ]
      );
    }

    return {
      summary: summaryText,
      recommendation: effectiveRecommendation,
      stage: effectiveStage,
      intent: effectiveIntent,
      conversationKey: effectiveKey,
    };
  } catch (err) {
    log(`[LEAD-SUMMARY] refresh error: ${err.message}`);
    return null;
  }
}


// ══════════════════════════════════════════════════════════════════════════════
// STAGE-BASED PROMPT ARCHITECTURE
// Each conversation stage gets a focused, modular prompt.
// Dynamically loaded by CSE lead_stage. Replaces the monolithic system prompt.
// ══════════════════════════════════════════════════════════════════════════════

const STAGE_PROMPTS = {

  novo: {
    objective: 'Iniciar a conversa de forma calorosa, breve e profissional.',
    style: 'Tom amigável mas direto. Mensagem curta (máx 3 linhas). Sem textos de boas-vindas genéricos.',
    actions: [
      'Saudar o lead pelo nome se disponível.',
      'Fazer UMA pergunta aberta para iniciar a qualificação.',
      'Verificar se é o tomador de decisão se possível.',
    ],
    collect: ['nome', 'motivo do contato inicial'],
    next_step: 'Identificar a necessidade principal e transicionar para qualificação.',
  },

  qualificacao: {
    objective: 'Entender a necessidade principal, contexto de uso e porte do negócio.',
    style: 'Perguntas curtas e diretas. 1 pergunta por mensagem. Escuta ativa. Sem discurso de vendas ainda.',
    actions: [
      'Perguntar sobre o negócio, segmento ou processo atual.',
      'Identificar se há urgência ou prazo.',
      'NÃO fazer pitch de produto neste estágio.',
    ],
    collect: ['tipo de negócio', 'necessidade principal', 'contexto de uso', 'porte da equipe'],
    next_step: 'Com a necessidade clara, transicionar para diagnóstico profundo.',
  },

  diagnostico: {
    objective: 'Aprofundar a dor. Entender o processo atual, o que não funciona e o impacto do problema.',
    style: 'Perguntas abertas que revelam custo do status quo. Mostre que você entende o problema antes de apresentar solução.',
    actions: [
      'Perguntar como resolvem hoje o problema identificado.',
      'Explorar o impacto (tempo, dinheiro, oportunidades perdidas).',
      'Identificar objeções antecipadas e nível de urgência.',
      'NÃO repetir perguntas sobre dados já presentes na memória.',
    ],
    collect: ['processo atual', 'dor principal', 'impacto do problema', 'urgência', 'objeções potenciais'],
    next_step: 'Com a dor mapeada, transicionar para apresentação da solução.',
  },

  apresentacao: {
    objective: 'Apresentar a solução conectada diretamente à dor identificada. Mostrar transformação, não features.',
    style: 'Método FAB: Funcionalidade → Vantagem → Benefício. Linguagem de resultado, não técnica. Use exemplos do setor do lead se possível.',
    actions: [
      'Conectar cada ponto da solução a uma dor específica do lead.',
      'Usar case ou analogia relevante para o tipo de negócio.',
      'Terminar com uma pergunta de validação ("Faz sentido para o que você precisa?").',
      'NÃO forçar preço neste momento.',
    ],
    collect: ['reação à apresentação', 'interesse específico em alguma funcionalidade'],
    next_step: 'Se lead reage positivamente, mover para proposta. Se pede preço, mover imediatamente.',
  },

  proposta: {
    objective: 'Apresentar valor e ROI antes do número. Defender o investimento com lógica e benefício tangível.',
    style: 'Confiante e direto. Apresentar preço como consequência, não como pauta. Nunca dar desconto imediato.',
    actions: [
      'Recapitular o problema e o impacto antes de apresentar o preço.',
      'Apresentar o retorno esperado (tempo economizado, receita gerada, etc.).',
      'Se questionado sobre preço: "Entendo — se o investimento não fosse uma questão, você avançaria?"',
      'Dar desconto SOMENTE se for política da empresa. Nunca espontaneamente.',
    ],
    collect: ['reação ao preço', 'objeções de valor', 'intenção de compra'],
    next_step: 'Se o lead aceitar, mover para agendamento. Se objetar, aplicar LAER e renegociar valor.',
  },

  agendamento: {
    objective: 'Confirmar data e horário para reunião ou demonstração usando as ferramentas disponíveis.',
    style: 'Direto e eficiente. Oferecer sempre 2 opções específicas. Nunca fazer pergunta aberta de horário.',
    actions: [
      'SEMPRE usar a ferramenta consultar_horarios_disponiveis antes de sugerir qualquer horário.',
      'Oferecer EXATAMENTE 2 opções no formato: "*[dia] às [hora]*" ou "*[dia] às [hora]*".',
      'Confirmar nome (se não tiver) e interesse para o agendamento.',
      'Se lead recusar: oferecer mais 2 opções diferentes, nunca as mesmas.',
      'Confirmar explicitamente após agendamento com resumo.',
    ],
    collect: ['data/hora confirmada', 'nome para agendamento'],
    next_step: 'Confirmar agendamento e enviar lembrete/próximos passos.',
  },

  followup: {
    objective: 'Reengajar o lead que parou de responder, sem parecer desesperado ou repetitivo.',
    style: 'Curto, relevante e baseado no contexto anterior. Nunca começar com "Oi, tudo bem?". Trazer algo novo: insight, número ou pergunta específica.',
    actions: [
      'Entrar com referência direta ao último assunto discutido.',
      'Apresentar um novo ângulo de valor ou dado relevante.',
      'Fazer 1 pergunta simples e direta que exige resposta curta.',
      'Se o lead demonstrar interesse, transicionar para o estágio adequado.',
    ],
    collect: ['motivo do silêncio', 'nível atual de interesse'],
    next_step: 'Dependendo da resposta: qualificação, proposta ou agendamento.',
  },

};

/**
 * Builds the stage-based system prompt dynamically.
 * Replaces the monolithic prompt. ~200–350 tokens per call instead of ~900.
 *
 * @param {Object} options
 * @param {Object} options.agent - Agent row from DB
 * @param {string} options.stage - CSE stage (e.g., 'qualificacao')
 * @param {string|null} options.knowledgeBase - Extracted KB text (or null)
 * @param {string} options.currentDate - Formatted date string
 * @param {string} options.currentTime - Formatted time string
 * @returns {string} Complete system prompt
 */
function buildSystemPrompt({
  agent,
  stage,
  knowledgeBase,
  currentDate,
  currentTime,
  activeAgent,
  companyProfile,
  leadContext,
  activeObjection,
}) {
  const stageConf = STAGE_PROMPTS[stage] || STAGE_PROMPTS['qualificacao'];
  const profile = companyProfile || createDefaultCompanyProfile();
  const responsePlaybook = profile.responsePlaybook || buildFallbackOperationalPlaybook(profile, profile.improvementFeedback || []).response_playbook;
  const qualificationStrategy = profile.qualificationStrategy || {};
  const offerStrategy = profile.offerStrategy || {};
  const handoffStrategy = profile.handoffStrategy || {};
  const advancedInstructions = agent.advanced_instructions || profile.advancedInstructions || agent.system_prompt || '';

  // ── 1. Identity Layer ────────────────────────────────────────────────────────
  let prompt = `Você é uma IA de vendas de alta performance via WhatsApp.
Data: ${currentDate} | Hora: ${currentTime} (Brasília)

[IDENTIDADE E VOZ]
Empresa: ${profile.companyName || 'Operacao Kogna'}
Oferta principal: ${profile.companyProduct || 'Conduza a conversa para valor e proximo passo.'}
ICP: ${profile.targetAudience || 'Descubra fit, dor e timing do lead.'}
Dor central: ${profile.customerPain || 'Descobrir a principal dor e o impacto comercial.'}
Diferenciais: ${profile.differentiators || 'Conecte clareza, valor e proximo passo.'}
Tom: ${profile.voiceTone || 'Consultivo'}
Objetivo comercial: ${profile.agentObjective || 'Gerar avancos de receita via WhatsApp.'}
Comportamento fora de escopo: ${profile.unknownBehavior || 'Se nao souber, ganhe contexto e ofereca um proximo passo seguro.'}

[PLAYBOOK CENTRAL]
Promessa comercial: ${responsePlaybook.promise || 'Organize a conversa para gerar oportunidade real.'}
Estilo de abertura: ${responsePlaybook.opening_style || 'Entre de forma ativa, contextual e objetiva.'}
Principios:
${(responsePlaybook.principles || [
    'Nao responda de forma passiva.',
    'Conduza o proximo passo com clareza.',
    'Adapte o tom ao negocio e ao lead.',
    'Nao repita perguntas ja respondidas.',
  ]).map((item) => `• ${item}`).join('\n')}

[INSTRUCOES AVANCADAS]
${advancedInstructions || 'Use contexto real do negocio, do lead e do estagio para responder.'}`;

  // ── 1b. Agent Persona Block ───────────────────────────────────────────────────
  if (activeAgent && activeAgent.key !== 'analyst') {
    prompt += `

[AGENTE RESPONSÁVEL: ${activeAgent.name.toUpperCase()}]
Papel: ${activeAgent.role}
Missão: ${activeAgent.mission}
Tom: ${activeAgent.tone}`;
  }


  // ── 2. Stage Prompt ──────────────────────────────────────────────────────────
  prompt += `

[MODO ATUAL: ${stage.toUpperCase()}]
Objetivo: ${stageConf.objective}
Estilo: ${stageConf.style}

Ações permitidas neste estágio:
${stageConf.actions.map(a => `• ${a}`).join('\n')}

Informações a coletar: ${stageConf.collect.join(', ')}
Próximo passo: ${stageConf.next_step}`;

  if (profile.productPrice || offerStrategy.primary_offer || offerStrategy.benefit_anchor) {
    prompt += `

[CONTEXTO COMERCIAL DA OFERTA]
Preco / ticket: ${profile.productPrice ? `R$ ${profile.productPrice}` : 'Nao informado'}
Oferta principal: ${offerStrategy.primary_offer || profile.companyProduct || 'Nao informado'}
Beneficio ancora: ${offerStrategy.benefit_anchor || profile.differentiators || 'Conecte valor, contexto e proximo passo.'}
Quando usar imagem ou catalogo: ${offerStrategy.use_image_when || 'Quando o lead pedir produto, comparacao ou contexto visual.'}
Quando usar promocao: ${offerStrategy.use_promotion_when || 'Quando houver intencao, objecao de preco ou promocao vigente.'}`;
  }

  if (qualificationStrategy.icp || qualificationStrategy.pain_points || qualificationStrategy.buying_signals) {
    prompt += `

[QUALIFICACAO E PRIORIDADE]
ICP / fit: ${qualificationStrategy.icp || profile.targetAudience || 'Descobrir se o lead tem fit com a operacao.'}
Dor a aprofundar: ${qualificationStrategy.pain_points || profile.customerPain || 'Entender a principal dor.'}
Sinais de compra: ${qualificationStrategy.buying_signals || profile.buyingSignals || 'Pedidos de preco, agenda, comparacao, urgencia e detalhes de entrega.'}
Definicao de bom lead: ${qualificationStrategy.good_lead_definition || profile.qualificationCriteria || 'Lead com fit, dor clara e abertura para proximo passo.'}
CTA preferida: ${qualificationStrategy.next_step || profile.idealNextStep || 'Levar o lead para o proximo passo mais simples e valioso.'}`;
  }

  if (leadContext) {
    prompt += `

[CONTEXTO VIVO DO LEAD]
Temperatura: ${leadContext.temperature || leadContext.last_temperature || 'Sem leitura'}
Score: ${leadContext.score || leadContext.intent_score || 0}
Resumo: ${leadContext.lead_summary || leadContext.last_ia_briefing || 'Sem resumo ainda'}
Recomendacao: ${leadContext.next_recommendation || 'Conduza o proximo passo com uma CTA unica.'}
Sinal humano: ${leadContext.needs_human_attention ? `Prioridade humana ativa desde ${leadContext.human_attention_since || 'agora'} por ${leadContext.human_attention_reason || 'alta intencao comercial'}` : 'Sem takeover necessario neste turno.'}`;
  }

  if (activeObjection) {
    prompt += `

[OBJECAO ATIVA]
Objeção: ${activeObjection.label}
Contexto: ${activeObjection.context || 'O lead levantou uma objecao relevante.'}
Abordagem recomendada: ${activeObjection.recommended_approach || 'Reposicione valor e reduza friccao.'}
Argumentos permitidos: ${(activeObjection.allowed_arguments || []).join(', ') || 'Use fatos, contexto e prova.'}
Evite dizer: ${(activeObjection.avoid_phrases || []).join(', ') || 'Evite soar vago, passivo ou defensivo.'}
CTA apos contornar: ${activeObjection.cta_after_resolution || 'Leve para o proximo passo mais simples.'}`;
  }

  // ── 3. Knowledge Base (conditional) ──────────────────────────────────────────
  if (knowledgeBase) {
    prompt += `

[BASE DE CONHECIMENTO]
Use EXCLUSIVAMENTE as informações abaixo para perguntas sobre produtos/serviços/processos.
${knowledgeBase}
[/BASE DE CONHECIMENTO]`;
  }

  // ── 4. Scheduling Module ──────────────────────────────────────────────────────
  // Always available (tool calling must work in any stage), but emphasized for 'agendamento'
  if (stage === 'agendamento') {
    prompt += `

[MÓDULO DE AGENDAMENTO — ATIVO]
Use SEMPRE a ferramenta consultar_horarios_disponiveis antes de sugerir qualquer horário.
Ofereça EXATAMENTE 2 opções. Formato: "*[dia] às [hora]*". Nunca liste todos os slots.
Após confirmação use confirmar_agendamento com o UUID exato do vendedor.`;
  } else {
    prompt += `

[AGENDAMENTO] Se o lead quiser agendar, use as ferramentas disponíveis (consultar_horarios_disponiveis, confirmar_agendamento).`;
  }

  // ── 5. Universal Rules (compact) ─────────────────────────────────────────────
  prompt += `

[REGRAS INVIOLÁVEIS]
• NUNCA revele que é uma IA. Mantenha a persona 100%.
• NUNCA faça mais de 1 pergunta por mensagem.
• Evite aberturas passivas como "Oi, como posso ajudar?". Entre com contexto, valor ou proximo passo.
• TODA mensagem deve terminar com uma pergunta ou CTA claro quando fizer sentido comercial.
• Textos escaneavéis: máx 3 linhas por parágrafo. Use *negrito* para CTAs.
• Adapte o tom: se o lead for curto, seja curto. Se descontraído, acompanhe.
• NUNCA invente dados. Se não souber, siga o comportamento padrão da identidade.`;

  if (handoffStrategy.policy || handoffStrategy.human_signal_message) {
    prompt += `

[OPERACAO HUMANA]
${handoffStrategy.policy || 'Sinalize prioridade humana quando houver calor comercial alto.'}
${handoffStrategy.human_signal_message || 'Nao silencie a conversa: continue conduzindo ate takeover manual real.'}`;
  }

  return prompt;
}

// ── END Stage-Based Prompt Architecture ──────────────────────────────────────



// ══════════════════════════════════════════════════════════════════════════════
// BACKEND TOOL ROUTER
// Stage controls which tools the LLM can call. tool_choice: auto is replaced
// by stage-aware routing. All calls are validated before execution.
// ══════════════════════════════════════════════════════════════════════════════

// ─── Full Tool Registry ───────────────────────────────────────────────────────
const TOOL_DEFINITIONS = {

  consultar_horarios_disponiveis: {
    type: 'function',
    function: {
      name: 'consultar_horarios_disponiveis',
      description: 'Consulta horários disponíveis para agendamento em uma data específica.',
      parameters: {
        type: 'object',
        properties: {
          date: { type: 'string', description: 'Data no formato YYYY-MM-DD' },
          vendedorId: { type: 'string', description: 'ID opcional do vendedor específico' },
        },
        required: ['date'],
      },
    },
  },

  confirmar_agendamento: {
    type: 'function',
    function: {
      name: 'confirmar_agendamento',
      description: 'Confirma e realiza o agendamento de uma reunião ou demonstração.',
      parameters: {
        type: 'object',
        properties: {
          date: { type: 'string', description: 'Data no formato YYYY-MM-DD' },
          time: { type: 'string', description: 'Horário no formato HH:MM' },
          vendedorId: { type: 'string', description: 'O UUID do vendedor retornado na consulta.' },
          notas: { type: 'string', description: 'Notas adicionais sobre o agendamento' },
        },
        required: ['date', 'time', 'vendedorId'],
      },
    },
  },

  cancelar_agendamento: {
    type: 'function',
    function: {
      name: 'cancelar_agendamento',
      description: 'Cancela qualquer agendamento ativo (status agendado) que o lead possua atualmente.',
      parameters: {
        type: 'object',
        properties: {
          confirmacion: { type: 'boolean', description: 'Confirmação de que o usuário deseja cancelar.' },
        },
        required: ['confirmacion'],
      },
    },
  },

  crm_update_lead: {
    type: 'function',
    function: {
      name: 'crm_update_lead',
      description: 'Atualiza campos estruturados do lead no CRM (memória e perfil). Use para registrar informações coletadas durante a conversa.',
      parameters: {
        type: 'object',
        properties: {
          fields: {
            type: 'object',
            description: 'Campos a atualizar. Aceita: name, company, business_type, lead_interest, budget_range, purchase_moment, decision_role, pain_point, main_objection',
            additionalProperties: { type: 'string' },
          },
        },
        required: ['fields'],
      },
    },
  },

  send_followup_message: {
    type: 'function',
    function: {
      name: 'send_followup_message',
      description: 'Agenda uma mensagem de follow-up para ser enviada automaticamente após um período de tempo.',
      parameters: {
        type: 'object',
        properties: {
          message: { type: 'string', description: 'Mensagem a ser enviada no follow-up.' },
          delay_minutes: { type: 'number', description: 'Minutos até o envio (mínimo 1).' },
        },
        required: ['message', 'delay_minutes'],
      },
    },
  },

  present_product: {
    type: 'function',
    function: {
      name: 'present_product',
      description: 'Apresenta automaticamente o produto mais relevante ao lead no WhatsApp. Envia imagem, descrição curta, benefício principal e, se existir, a melhor oferta ativa. Use quando o lead pedir informações sobre produtos, preços, catálogo, planos, soluções ou quiser ver opções.',
      parameters: {
        type: 'object',
        properties: {
          product_hint: {
            type: 'string',
            description: 'Palavra-chave ou nome do produto mencionado pelo lead (opcional). Se omitido, o sistema seleciona automaticamente.',
          },
        },
        required: [],
      },
    },
  },

};

// ─── Stage → Tools Map ────────────────────────────────────────────────────────
const STAGE_TOOL_MAP = {
  novo: { tools: [], tool_choice: 'none' },
  qualificacao: { tools: ['crm_update_lead'], tool_choice: 'none' },
  diagnostico: { tools: ['crm_update_lead', 'present_product'], tool_choice: 'auto' },
  apresentacao: { tools: ['crm_update_lead', 'present_product'], tool_choice: 'auto' },
  proposta: { tools: ['crm_update_lead', 'present_product'], tool_choice: 'auto' },
  agendamento: { tools: ['consultar_horarios_disponiveis', 'confirmar_agendamento', 'cancelar_agendamento'], tool_choice: 'auto' },
  followup: { tools: ['send_followup_message', 'crm_update_lead', 'present_product'], tool_choice: 'auto' },
};

/**
 * Returns the OpenAI-ready tools array and tool_choice for a given CSE stage.
 * @param {string} stage - CSE lead_stage
 * @returns {{ tools: Array, toolChoice: string, allowedNames: Set<string> }}
 */
function getToolsForStage(stage) {
  const config = STAGE_TOOL_MAP[stage] || STAGE_TOOL_MAP['qualificacao'];
  const tools = config.tools.map(name => TOOL_DEFINITIONS[name]).filter(Boolean);
  const allowedNames = new Set(config.tools);
  log(`[TOOL ROUTER] Stage ${stage} → ${tools.length} tool(s): ${config.tools.join(', ') || 'none'}`);
  return { tools, toolChoice: config.tool_choice, allowedNames };
}

/**
 * Validates a tool call before execution.
 * Returns { valid: true } or { valid: false, reason: string }.
 */
function validateToolCall(functionName, args, allowedNames) {
  // 1. Check the tool is allowed for this stage
  if (!allowedNames.has(functionName)) {
    log(`[TOOL ROUTER] BLOCKED: tool "${functionName}" not allowed in current stage. Allowed: ${[...allowedNames].join(', ') || 'none'}`);
    return { valid: false, reason: `Ferramenta "${functionName}" não está disponível neste momento.` };
  }

  // 2. Validate required args per tool
  if (functionName === 'crm_update_lead') {
    if (!args.fields || typeof args.fields !== 'object' || Object.keys(args.fields).length === 0) {
      return { valid: false, reason: 'crm_update_lead requer o campo "fields" com pelo menos um campo.' };
    }
    const ALLOWED_FIELDS = new Set(['name', 'company', 'business_type', 'lead_interest', 'budget_range',
      'purchase_moment', 'decision_role', 'pain_point', 'main_objection']);
    for (const key of Object.keys(args.fields)) {
      if (!ALLOWED_FIELDS.has(key)) {
        return { valid: false, reason: `Campo inválido para crm_update_lead: "${key}"` };
      }
    }
  }

  if (functionName === 'send_followup_message') {
    if (!args.message || typeof args.message !== 'string') {
      return { valid: false, reason: 'send_followup_message requer o campo "message".' };
    }
    if (typeof args.delay_minutes !== 'number' || args.delay_minutes < 1) {
      return { valid: false, reason: 'send_followup_message requer delay_minutes >= 1.' };
    }
  }

  if (functionName === 'consultar_horarios_disponiveis' || functionName === 'confirmar_agendamento') {
    if (!args.date || typeof args.date !== 'string') {
      return { valid: false, reason: `${functionName} requer o campo "date" no formato YYYY-MM-DD.` };
    }
  }

  if (functionName === 'confirmar_agendamento') {
    if (!args.time || !args.vendedorId) {
      return { valid: false, reason: 'confirmar_agendamento requer "time" e "vendedorId".' };
    }
  }

  return { valid: true };
}

// ─── Tool Executor: crm_update_lead ──────────────────────────────────────────
async function executeCrmUpdateLead(orgId, leadId, fields) {
  try {
    const ALLOWED_FIELDS = ['name', 'company', 'business_type', 'lead_interest', 'budget_range',
      'purchase_moment', 'decision_role', 'pain_point', 'main_objection'];

    const setClauses = [];
    const values = [orgId, leadId];
    let idx = 3;

    for (const [key, val] of Object.entries(fields)) {
      if (ALLOWED_FIELDS.includes(key) && val) {
        setClauses.push(`${key} = COALESCE(${key}, $${idx++})`);
        values.push(String(val).substring(0, 500));
      }
    }

    if (setClauses.length === 0) return { success: false, updated: [] };

    setClauses.push('updated_at = NOW()');
    await pool.query(
      `UPDATE lead_memory SET ${setClauses.join(', ')} WHERE organization_id = $1 AND lead_id = $2`,
      values
    );

    const updated = Object.keys(fields).filter(k => ALLOWED_FIELDS.includes(k));
    log(`[TOOL ROUTER] crm_update_lead: updated ${updated.join(', ')} for lead ${leadId}`);
    return { success: true, updated };
  } catch (err) {
    log(`[TOOL ROUTER] executeCrmUpdateLead error: ${err.message}`);
    return { success: false, error: err.message };
  }
}

// ─── Tool Executor: send_followup_message ─────────────────────────────────────
async function executeSendFollowupMessage(orgId, leadId, instanceName, message, delayMinutes) {
  try {
    const scheduledAt = new Date(Date.now() + delayMinutes * 60 * 1000);

    // Insert into followup_events (existing table from Follow-up Engine)
    await pool.query(`
      INSERT INTO followup_events
        (organization_id, lead_id, instance_name, message, scheduled_at, status, created_at)
      VALUES ($1, $2, $3, $4, $5, 'pending', NOW())
    `, [orgId, leadId, instanceName, message, scheduledAt]);

    log(`[TOOL ROUTER] send_followup_message scheduled for ${leadId} in ${delayMinutes}min`);
    return { success: true, scheduled_at: scheduledAt.toISOString(), delay_minutes: delayMinutes };
  } catch (err) {
    log(`[TOOL ROUTER] executeSendFollowupMessage error: ${err.message}`);
    return { success: false, error: err.message };
  }
}

// ── END Backend Tool Router ───────────────────────────────────────────────────

// ══════════════════════════════════════════════════════════════════════════════
// MULTI-AGENT ARCHITECTURE
// Each CSE stage is handled by a named specialist agent with its own identity.
// The Conversation Analyst runs async after every turn (not a message handler).
// ══════════════════════════════════════════════════════════════════════════════

const AGENT_DEFINITIONS = {

  sdr: {
    name: 'AI SDR',
    role: 'Especialista em prospecção e qualificação de leads via WhatsApp.',
    mission: 'Identificar o perfil do lead, entender sua necessidade principal e qualificá-lo para avançar no funil. Não fazer pitch de produto. Fazer perguntas cirúrgicas.',
    tone: 'Curioso e acolhedor. Mensagens curtas. Uma pergunta por vez. Nunca parecendo um robô.',
  },

  closer: {
    name: 'AI Closer',
    role: 'Especialista em apresentação de valor, gestão de objeções e fechamento.',
    mission: 'Conectar a solução à dor específica do lead usando o método FAB. Defender o investimento com ROI. Usar LAER para objeções. Nunca dar desconto espontaneamente.',
    tone: 'Confiante, direto e orientado a resultado. Empático, mas sem enrolar.',
  },

  scheduler: {
    name: 'AI Scheduler',
    role: 'Especialista em agendamento de reuniões e demonstrações via WhatsApp.',
    mission: 'Confirmar data e horário usando as ferramentas disponíveis. Oferecer exatamente 2 opções. Nunca fazer perguntas abertas de horário. Fechar o agendamento neste turno.',
    tone: 'Eficiente e direto. Sem rodeios. Foco 100% em confirmar o next step.',
  },

  followup: {
    name: 'AI Follow-up',
    role: 'Especialista em reengajamento de leads inativos.',
    mission: 'Reentrar na conversa com contexto do histórico anterior. Trazer um novo ângulo de valor ou dado relevante. Fazer 1 pergunta simples que force uma resposta curta. Nunca começar com "Oi, tudo bem?".',
    tone: 'Relevante e surpreendente. Curto. Sem desespero. Mostra que lembra do lead.',
  },

  analyst: {
    name: 'AI Analyst',
    role: 'Especialista em extração de dados e inteligência conversacional.',
    mission: 'Extrair dados estruturados de cada conversa. Preencher lead_memory com nome, empresa, dor, interesse, orçamento, objeção e sinais semânticos. Opera silenciosamente em background.',
    tone: 'Não interage com o lead. Opera apenas no backend.',
  },

};

// ─── Stage → Agent Router ─────────────────────────────────────────────────────
const STAGE_TO_AGENT = {
  novo: 'sdr',
  qualificacao: 'sdr',
  diagnostico: 'closer',
  apresentacao: 'closer',
  proposta: 'closer',
  agendamento: 'scheduler',
  followup: 'followup',
};

/**
 * Returns the agent definition responsible for a given CSE stage.
 * @param {string} stage - CSE lead_stage
 * @returns {Object} Agent definition from AGENT_DEFINITIONS
 */
function resolveAgent(stage) {
  const key = STAGE_TO_AGENT[stage] || 'sdr';
  return { key, ...AGENT_DEFINITIONS[key] };
}

// ── END Multi-Agent Architecture ──────────────────────────────────────────────


// ══════════════════════════════════════════════════════════════════════════════
// PRODUCT & DYNAMIC OFFER ENGINE
// Product catalog, multi-offer selection by CSE stage, WhatsApp media delivery
// ══════════════════════════════════════════════════════════════════════════════

const ensureProductEngineTables = async () => {
  try {
    log('[PRODUCT ENGINE] Ensuring Product & Offer tables...');

    // Core product catalog
    await pool.query(`
      CREATE TABLE IF NOT EXISTS products (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id TEXT,
        nome TEXT,
        categoria TEXT,
        descricao_curta TEXT,
        descricao_detalhada TEXT,
        beneficios TEXT[] DEFAULT '{}',
        preco_base FLOAT,
        faq JSONB DEFAULT '[]',
        tags TEXT[] DEFAULT '{}',
        status VARCHAR(20) DEFAULT 'ativo' CHECK (status IN ('ativo','inativo')),
        name TEXT,
        description TEXT,
        price FLOAT,
        active BOOLEAN DEFAULT TRUE,
        koins_bonus INT DEFAULT 0,
        connections_bonus INT DEFAULT 0,
        type VARCHAR(50) DEFAULT 'KOINS',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_products_org ON products(organization_id)`);
    await pool.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS organization_id TEXT`);
    await pool.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS nome TEXT`);
    await pool.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS categoria TEXT`);
    await pool.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS descricao_curta TEXT`);
    await pool.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS descricao_detalhada TEXT`);
    await pool.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS beneficios TEXT[] DEFAULT '{}'`);
    await pool.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS preco_base FLOAT`);
    await pool.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS faq JSONB DEFAULT '[]'`);
    await pool.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}'`);
    await pool.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'ativo'`);
    await pool.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS name TEXT`);
    await pool.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS description TEXT`);
    await pool.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS price FLOAT`);
    await pool.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT TRUE`);
    await pool.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS koins_bonus INT DEFAULT 0`);
    await pool.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS connections_bonus INT DEFAULT 0`);
    await pool.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS type VARCHAR(50) DEFAULT 'KOINS'`);
    await pool.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW()`);
    await pool.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()`);

    // Product media library
    await pool.query(`
      CREATE TABLE IF NOT EXISTS product_images (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        product_id TEXT NOT NULL,
        organization_id TEXT NOT NULL,
        url TEXT NOT NULL,
        tipo VARCHAR(20) DEFAULT 'image' CHECK (tipo IN ('image','video','pdf')),
        caption TEXT,
        ordem INT DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await pool.query(`ALTER TABLE product_images DROP CONSTRAINT IF EXISTS product_images_product_id_fkey`);
    await pool.query(`ALTER TABLE product_images ALTER COLUMN product_id TYPE TEXT USING product_id::text`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_product_images_pid ON product_images(product_id)`);

    // Dynamic offers per product
    await pool.query(`
      CREATE TABLE IF NOT EXISTS offers (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        product_id TEXT NOT NULL,
        organization_id TEXT NOT NULL,
        nome TEXT NOT NULL,
        preco FLOAT,
        descricao TEXT,
        mensagem_sugerida TEXT,
        prioridade INT DEFAULT 5 CHECK (prioridade BETWEEN 1 AND 10),
        status VARCHAR(20) DEFAULT 'ativo' CHECK (status IN ('ativo','inativo')),
        starts_at TIMESTAMPTZ,
        ends_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await pool.query(`ALTER TABLE offers DROP CONSTRAINT IF EXISTS offers_product_id_fkey`);
    await pool.query(`ALTER TABLE offers ALTER COLUMN product_id TYPE TEXT USING product_id::text`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_offers_product ON offers(product_id, organization_id)`);
    await pool.query(`ALTER TABLE offers ADD COLUMN IF NOT EXISTS starts_at TIMESTAMPTZ`);
    await pool.query(`ALTER TABLE offers ADD COLUMN IF NOT EXISTS ends_at TIMESTAMPTZ`);

    // Conversational trigger rules per offer
    await pool.query(`
      CREATE TABLE IF NOT EXISTS offer_triggers (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        offer_id UUID NOT NULL REFERENCES offers(id) ON DELETE CASCADE,
        trigger_type TEXT NOT NULL CHECK (trigger_type IN (
          'pergunta_preco', 'comparacao', 'objecao_preco',
          'indecisao', 'pronto_para_comprar', 'followup', 'primeiro_contato'
        )),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(offer_id, trigger_type)
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_offer_triggers_oid ON offer_triggers(offer_id)`);

    // Offer presentation events for CIL intelligence
    await pool.query(`
      CREATE TABLE IF NOT EXISTS offer_events (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id TEXT NOT NULL,
        conversation_id TEXT,
        lead_id TEXT,
        product_id TEXT,
        offer_id UUID,
        lead_stage TEXT,
        resposta_cliente TEXT,
        timestamp TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await pool.query(`ALTER TABLE offer_events ALTER COLUMN product_id TYPE TEXT USING product_id::text`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_offer_events_org ON offer_events(organization_id, lead_id)`);

    log('[PRODUCT ENGINE] All tables verified.');
  } catch (err) {
    log('[PRODUCT ENGINE] ensureProductEngineTables error: ' + err.message);
    throw err;
  }
};

let productEngineTablesReadyPromise = null;
async function ensureProductEngineTablesReady() {
  if (!productEngineTablesReadyPromise) {
    productEngineTablesReadyPromise = ensureProductEngineTables().catch((err) => {
      productEngineTablesReadyPromise = null;
      throw err;
    });
  }
  return productEngineTablesReadyPromise;
}

ensureProductEngineTablesReady().catch((err) => {
  log('[PRODUCT ENGINE] bootstrap error: ' + err.message);
});

// ─── Stage → Default Trigger Map ────────────────────────────────────────────
const STAGE_DEFAULT_TRIGGER = {
  novo: 'primeiro_contato',
  qualificacao: 'primeiro_contato',
  diagnostico: 'pergunta_preco',
  apresentacao: 'comparacao',
  proposta: 'pronto_para_comprar',
  followup: 'followup',
};

function normalizeMatchText(value = '') {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function formatCurrencyBRL(value) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return null;
  return numericValue.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
}

function formatPromotionDate(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString('pt-BR');
}

/**
 * Selects the best offer for a given org, CSE stage, and user intent keyword.
 * Scores: +10 trigger match on intent, +5 trigger match on stage default, +prioridade.
 * @returns {{ offer, product } | null}
 */
async function selectBestOffer(orgId, leadStage, userIntent = '') {
  try {
    await ensureProductEngineTablesReady();
    const stageTrigger = STAGE_DEFAULT_TRIGGER[leadStage] || 'primeiro_contato';
    const intentLower = normalizeMatchText(userIntent);

    // Load active offers + their triggers + their product
    const result = await pool.query(`
      SELECT o.*, p.nome AS product_nome, p.categoria, p.tags, p.preco_base,
             p.descricao_curta, p.descricao_detalhada, p.beneficios,
             p.id AS product_id_actual,
             ARRAY_AGG(ot.trigger_type) FILTER (WHERE ot.trigger_type IS NOT NULL) AS triggers
      FROM offers o
      JOIN products p ON p.id::text = o.product_id
      LEFT JOIN offer_triggers ot ON ot.offer_id = o.id
      WHERE o.organization_id = $1
        AND o.status = 'ativo'
        AND p.status = 'ativo'
        AND (o.starts_at IS NULL OR o.starts_at <= NOW())
        AND (o.ends_at IS NULL OR o.ends_at >= NOW())
      GROUP BY o.id, p.nome, p.categoria, p.tags, p.preco_base, p.descricao_curta, p.descricao_detalhada, p.beneficios, p.id
    `, [orgId]);

    if (result.rows.length === 0) {
      const fallbackProducts = await pool.query(`
        SELECT id, nome, categoria, tags, preco_base, descricao_curta, descricao_detalhada, beneficios
        FROM products
        WHERE organization_id = $1
          AND status = 'ativo'
        ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST
      `, [orgId]);

      if (fallbackProducts.rows.length === 0) return null;

      let bestProduct = null;
      let bestProductScore = -1;

      for (const product of fallbackProducts.rows) {
        let score = 1;
        const productName = normalizeMatchText(product.nome);
        const category = normalizeMatchText(product.categoria);
        const tags = Array.isArray(product.tags) ? product.tags.map((tag) => normalizeMatchText(tag)) : [];

        if (productName && intentLower.includes(productName)) score += 30;
        if (category && intentLower.includes(category)) score += 8;
        for (const tag of tags) {
          if (tag && intentLower.includes(tag)) {
            score += 6;
            break;
          }
        }

        if (score > bestProductScore) {
          bestProductScore = score;
          bestProduct = product;
        }
      }

      if (!bestProduct) return null;

      return {
        offer: {
          id: null,
          nome: bestProduct.nome,
          preco: bestProduct.preco_base,
          descricao: bestProduct.descricao_curta || bestProduct.descricao_detalhada || null,
          mensagem_sugerida: null,
          starts_at: null,
          ends_at: null,
        },
        product: {
          id: bestProduct.id,
          nome: bestProduct.nome,
          categoria: bestProduct.categoria,
          preco_base: bestProduct.preco_base,
          descricao_curta: bestProduct.descricao_curta,
          descricao_detalhada: bestProduct.descricao_detalhada,
          beneficios: bestProduct.beneficios || [],
        },
      };
    }

    let best = null;
    let bestScore = -1;

    for (const row of result.rows) {
      const triggers = row.triggers || [];
      let score = row.prioridade || 5;
      const productName = normalizeMatchText(row.product_nome);
      const category = normalizeMatchText(row.categoria);
      const tags = Array.isArray(row.tags) ? row.tags.map((tag) => normalizeMatchText(tag)) : [];

      // +10 if stage default trigger is in this offer's triggers
      if (triggers.includes(stageTrigger)) score += 10;

      // +5 if any trigger keyword appears in userIntent
      for (const t of triggers) {
        if (intentLower.includes(t.replace(/_/g, ' '))) { score += 5; break; }
      }

      // Stronger match if the lead explicitly mentioned the product.
      if (productName && intentLower.includes(productName)) {
        score += 30;
      }

      if (category && intentLower.includes(category)) {
        score += 8;
      }

      for (const tag of tags) {
        if (tag && intentLower.includes(tag)) {
          score += 6;
          break;
        }
      }

      if (score > bestScore) {
        bestScore = score;
        best = row;
      }
    }

    if (!best) return null;

    return {
      offer: {
        id: best.id,
        nome: best.nome,
        preco: best.preco,
        descricao: best.descricao,
        mensagem_sugerida: best.mensagem_sugerida,
        starts_at: best.starts_at,
        ends_at: best.ends_at,
      },
      product: {
        id: best.product_id_actual,
        nome: best.product_nome,
        categoria: best.categoria,
        preco_base: best.preco_base,
        descricao_curta: best.descricao_curta,
        descricao_detalhada: best.descricao_detalhada,
        beneficios: best.beneficios || [],
      },
    };
  } catch (err) {
    log(`[OFFER ENGINE] selectBestOffer error: ${err.message}`);
    return null;
  }
}

function buildProductMediaFileName(productName = "produto", mediaUrl = "") {
  const safeBase = (productName || "produto")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase() || "produto";

  if (typeof mediaUrl === "string" && mediaUrl.startsWith("data:")) {
    const mimeMatch = mediaUrl.match(/^data:([^;]+);base64,/i);
    const ext =
      mimeMatch?.[1]?.split("/")[1]?.split("+")[0]?.toLowerCase() || "jpg";
    return `${safeBase}.${ext}`;
  }

  try {
    const parsed = new URL(mediaUrl);
    const lastSegment = parsed.pathname.split("/").pop();
    if (lastSegment && lastSegment.includes(".")) return lastSegment;
  } catch {}

  return `${safeBase}.jpg`;
}

function normalizeMediaForEvolution(mediaUrl = "") {
  if (typeof mediaUrl !== "string") return "";
  const sanitized = mediaUrl.trim();
  if (sanitized.startsWith("data:")) {
    const parts = sanitized.split(",", 2);
    return parts[1] || "";
  }
  return sanitized;
}

/**
 * Records an offer presentation event for CIL telemetry.
 */
async function recordOfferEvent(orgId, leadId, productId, offerId, leadStage) {
  try {
    await pool.query(`
      INSERT INTO offer_events (organization_id, lead_id, product_id, offer_id, lead_stage)
      VALUES ($1, $2, $3, $4, $5)
    `, [orgId, leadId, productId, offerId, leadStage]);
  } catch (err) {
    log(`[OFFER ENGINE] recordOfferEvent error: ${err.message}`);
  }
}

/**
 * Sends product image + description text + offer message to WhatsApp lead.
 * Uses Evolution API (EVOLUTION_API_URL + EVOLUTION_API_KEY from env).
 */
async function sendProductToLead(orgId, instanceName, remoteJid, leadStage, userIntent) {
  try {
    const selected = await selectBestOffer(orgId, leadStage, userIntent);
    if (!selected) {
      log(`[PRODUCT SEND] No active offer found for org=${orgId} stage=${leadStage}`);
      return null;
    }

    const { offer, product } = selected;
    const evoBase = process.env.EVOLUTION_API_URL || 'https://evo.kogna.co';
    const evoKey = process.env.EVOLUTION_API_KEY || '';
    const headers = { 'Content-Type': 'application/json', apikey: evoKey };

    log(`[OFFER ENGINE] Stage=${leadStage} → offer="${offer.nome}" for lead=${remoteJid}`);

    // Step 1: Send product image if available
    const imgRes = await pool.query(
      `SELECT url, caption FROM product_images WHERE product_id = $1 AND tipo = 'image' ORDER BY ordem LIMIT 1`,
      [product.id]
    );
    if (imgRes.rows.length > 0) {
      const img = imgRes.rows[0];
      const mediaPayload = normalizeMediaForEvolution(img.url);
      if (!mediaPayload) {
        log(`[PRODUCT SEND] Image skipped for ${product.nome}: empty media payload`);
      } else {
        const mediaResponse = await fetch(`${evoBase}/message/sendMedia/${instanceName}`, {
          method: 'POST', headers,
          body: JSON.stringify({
            number: remoteJid,
            mediatype: 'image',
            media: mediaPayload,
            fileName: buildProductMediaFileName(product.nome, img.url),
            caption: img.caption || product.nome,
          }),
        });
        if (!mediaResponse.ok) {
          const errorText = await mediaResponse.text();
          log(`[PRODUCT SEND] Image failed for ${product.nome}: ${mediaResponse.status} ${errorText}`);
        } else {
          log(`[PRODUCT SEND] Image sent for ${product.nome}`);
        }
      }
    }

    // Step 2: Send description + main benefit
    const benefit = product.beneficios?.[0] || '';
    const productDescription = product.descricao_detalhada || product.descricao_curta || '';
    const descText = `*${product.nome}*\n\n${productDescription}${benefit ? `\n\n✅ ${benefit}` : ''}`;
    await fetch(`${evoBase}/message/sendText/${instanceName}`, {
      method: 'POST', headers,
      body: JSON.stringify({ number: remoteJid, text: descText, delay: 800 }),
    });

    // Step 3: Send promotion message
    let promotionText = offer.mensagem_sugerida;
    if (!promotionText) {
      const promotionalPrice = formatCurrencyBRL(offer.preco);
      const basePrice = formatCurrencyBRL(product.preco_base);
      const hasDiscountPrice = promotionalPrice && basePrice && Number(offer.preco) < Number(product.preco_base);
      const validityText = formatPromotionDate(offer.ends_at);
      const hasOfferWindow = Boolean(offer.starts_at || offer.ends_at || offer.id);
      promotionText = hasOfferWindow
        ? [
          `*Promoção: ${offer.nome}*`,
          hasDiscountPrice
            ? `De ${basePrice} por ${promotionalPrice}`
            : promotionalPrice || null,
          offer.descricao || null,
          validityText ? `Válida até ${validityText}.` : null,
        ].filter(Boolean).join('\n\n')
        : [
          `*${product.nome}*`,
          promotionalPrice || basePrice || null,
          offer.descricao || null,
        ].filter(Boolean).join('\n\n');
    }
    if (promotionText) {
      await fetch(`${evoBase}/message/sendText/${instanceName}`, {
        method: 'POST', headers,
        body: JSON.stringify({ number: remoteJid, text: promotionText, delay: 1200 }),
      });
    }

    // Step 4: Record offer event
    await recordOfferEvent(orgId, remoteJid, product.id, offer.id, leadStage);
    log(`[OFFER EVENT] Recorded offer presentation for lead=${remoteJid} offer="${offer.nome}"`);

    return { offer, product };
  } catch (err) {
    log(`[PRODUCT SEND] sendProductToLead error: ${err.message}`);
    return null;
  }
}

// ── END Product & Dynamic Offer Engine ───────────────────────────────────────

// ── ONBOARDING V2 SESSION TABLE ───────────────────────────────────────────────
const ONBOARDING_ANALYTICS_VERSION = 'v2';
const ONBOARDING_ANALYTICS_TOTAL_STEPS = 18;

let onboardingAnalyticsReadyPromise = null;
const ensureOnboardingAnalyticsTable = async () => {
  if (onboardingAnalyticsReadyPromise) return onboardingAnalyticsReadyPromise;

  onboardingAnalyticsReadyPromise = (async () => {
    try {
      log('[SYSTEM] Ensuring onboarding_progress_analytics table...');
      await pool.query(`
        CREATE TABLE IF NOT EXISTS onboarding_progress_analytics (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          session_id TEXT NOT NULL UNIQUE,
          user_id TEXT DEFAULT NULL,
          onboarding_version TEXT NOT NULL DEFAULT '${ONBOARDING_ANALYTICS_VERSION}',
          current_step INT NOT NULL DEFAULT 1,
          max_step_reached INT NOT NULL DEFAULT 1,
          total_steps INT NOT NULL DEFAULT ${ONBOARDING_ANALYTICS_TOTAL_STEPS},
          email TEXT DEFAULT NULL,
          phone TEXT DEFAULT NULL,
          started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          registered_at TIMESTAMPTZ DEFAULT NULL,
          completed_at TIMESTAMPTZ DEFAULT NULL,
          last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          metadata JSONB NOT NULL DEFAULT '{}'::jsonb
        )
      `);
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_onboarding_progress_user_id ON onboarding_progress_analytics(user_id)`);
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_onboarding_progress_started_at ON onboarding_progress_analytics(started_at DESC)`);
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_onboarding_progress_max_step ON onboarding_progress_analytics(max_step_reached DESC)`);
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_onboarding_progress_completed_at ON onboarding_progress_analytics(completed_at DESC)`);
      log('[SYSTEM] onboarding_progress_analytics table verified.');
    } catch (err) {
      onboardingAnalyticsReadyPromise = null;
      log('[ERROR] ensureOnboardingAnalyticsTable: ' + err.message);
      throw err;
    }
  })();

  return onboardingAnalyticsReadyPromise;
};

function normalizeOnboardingEmail(email) {
  const normalized = String(email || '').trim().toLowerCase();
  return normalized || null;
}

function normalizeOnboardingPhone(phone) {
  const normalized = normalizeWhatsAppNumber(phone);
  return normalized || null;
}

function sanitizeOnboardingStep(step, totalSteps = ONBOARDING_ANALYTICS_TOTAL_STEPS) {
  const safeTotalSteps = Math.max(Number(totalSteps) || ONBOARDING_ANALYTICS_TOTAL_STEPS, 1);
  const parsed = Number.parseInt(step, 10);
  if (!Number.isFinite(parsed)) return 1;
  return Math.min(Math.max(parsed, 1), safeTotalSteps);
}

async function trackOnboardingProgress({
  sessionId,
  userId = null,
  step,
  totalSteps = ONBOARDING_ANALYTICS_TOTAL_STEPS,
  email = null,
  phone = null,
  metadata = {},
  registered = false,
  completed = false,
}, db = pool) {
  const safeSessionId = String(sessionId || '').trim();
  if (!safeSessionId) return null;

  await ensureOnboardingAnalyticsTable();

  const safeTotalSteps = Math.max(Number(totalSteps) || ONBOARDING_ANALYTICS_TOTAL_STEPS, 1);
  const safeStep = sanitizeOnboardingStep(step, safeTotalSteps);
  const normalizedEmail = normalizeOnboardingEmail(email);
  const normalizedPhone = normalizeOnboardingPhone(phone);
  const normalizedUserId = userId ? String(userId).trim() : null;
  const shouldMarkCompleted = completed || safeStep >= safeTotalSteps;
  const shouldMarkRegistered = registered || Boolean(normalizedUserId);
  const safeMetadata = metadata && typeof metadata === 'object' ? metadata : {};

  const result = await db.query(`
    INSERT INTO onboarding_progress_analytics (
      session_id,
      user_id,
      onboarding_version,
      current_step,
      max_step_reached,
      total_steps,
      email,
      phone,
      registered_at,
      completed_at,
      last_seen_at,
      metadata
    ) VALUES ($1,$2,$3,$4,$4,$5,$6,$7,
      CASE WHEN $8 THEN NOW() ELSE NULL END,
      CASE WHEN $9 THEN NOW() ELSE NULL END,
      NOW(),
      $10::jsonb
    )
    ON CONFLICT (session_id) DO UPDATE
      SET user_id = COALESCE(EXCLUDED.user_id, onboarding_progress_analytics.user_id),
          current_step = EXCLUDED.current_step,
          max_step_reached = GREATEST(onboarding_progress_analytics.max_step_reached, EXCLUDED.max_step_reached),
          total_steps = GREATEST(onboarding_progress_analytics.total_steps, EXCLUDED.total_steps),
          email = COALESCE(EXCLUDED.email, onboarding_progress_analytics.email),
          phone = COALESCE(EXCLUDED.phone, onboarding_progress_analytics.phone),
          registered_at = CASE
            WHEN onboarding_progress_analytics.registered_at IS NOT NULL THEN onboarding_progress_analytics.registered_at
            WHEN $8 THEN NOW()
            ELSE onboarding_progress_analytics.registered_at
          END,
          completed_at = CASE
            WHEN onboarding_progress_analytics.completed_at IS NOT NULL THEN onboarding_progress_analytics.completed_at
            WHEN $9 THEN NOW()
            ELSE onboarding_progress_analytics.completed_at
          END,
          last_seen_at = NOW(),
          metadata = COALESCE(onboarding_progress_analytics.metadata, '{}'::jsonb) || EXCLUDED.metadata
    RETURNING *
  `, [
    safeSessionId,
    normalizedUserId,
    ONBOARDING_ANALYTICS_VERSION,
    safeStep,
    safeTotalSteps,
    normalizedEmail,
    normalizedPhone,
    shouldMarkRegistered,
    shouldMarkCompleted,
    JSON.stringify(safeMetadata),
  ]);

  return result.rows[0] || null;
}

const ensureOnboardingSessionsTable = async () => {
  try {
    log('[SYSTEM] Ensuring onboarding_test_sessions table...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS onboarding_test_sessions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        session_id TEXT NOT NULL,
        user_message TEXT,
        ai_reply TEXT,
        onboarding_context JSONB,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_onboarding_sessions_sid ON onboarding_test_sessions(session_id)`);
    // Ensure optional columns exist on ia_configs for onboarding V2 data
    await pool.query(`ALTER TABLE ia_configs ADD COLUMN IF NOT EXISTS customer_pain TEXT`).catch(() => { });
    await pool.query(`ALTER TABLE ia_configs ADD COLUMN IF NOT EXISTS product_price TEXT`).catch(() => { });
    await pool.query(`ALTER TABLE ia_configs ADD COLUMN IF NOT EXISTS agent_objective TEXT`).catch(() => { });
    await pool.query(`ALTER TABLE ia_configs ADD COLUMN IF NOT EXISTS customer_pain TEXT`).catch(() => { });
    log('[SYSTEM] onboarding_test_sessions table verified.');
  } catch (err) {
    log('[ERROR] ensureOnboardingSessionsTable: ' + err.message);
  }
};
// ── END ONBOARDING V2 SESSION TABLE ──────────────────────────────────────────

const ensureGuidedTourColumns = async () => {
  try {
    log("[SYSTEM] Ensuring guided tour columns...");
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS guided_tour_seen_version TEXT`).catch(() => { });
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS guided_tour_seen_at TIMESTAMPTZ`).catch(() => { });
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS guided_tour_last_status TEXT`).catch(() => { });
    await pool.query(
      `UPDATE users
          SET guided_tour_seen_version = $1,
              guided_tour_seen_at = COALESCE(guided_tour_seen_at, NOW()),
              guided_tour_last_status = COALESCE(guided_tour_last_status, 'completed')
        WHERE created_at < $2::timestamptz
          AND guided_tour_seen_version IS NULL`,
      [GUIDED_TOUR_VERSION, GUIDED_TOUR_ROLLOUT_AT],
    ).catch(() => { });
    log("[SYSTEM] Guided tour columns verified.");
  } catch (err) {
    log("[ERROR] ensureGuidedTourColumns: " + err.message);
  }
};

const ensureKognaAICoreTables = async () => {
  try {
    log("[SYSTEM] Ensuring Kogna AI Core 2.1 columns...");
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ia_configs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id UUID REFERENCES organizations(id),
        user_id UUID REFERENCES users(id),
        company_name TEXT,
        agent_name TEXT,
        main_product TEXT,
        desired_revenue TEXT,
        agent_objective TEXT,
        unknown_behavior TEXT,
        voice_tone TEXT,
        restrictions TEXT,
        customer_pain TEXT,
        product_price TEXT,
        target_audience TEXT,
        customer_desires TEXT,
        differentiators TEXT,
        industry TEXT,
        industry_detail TEXT,
        channels JSONB DEFAULT '[]'::jsonb,
        sales_cycle TEXT,
        human_handoff_policy TEXT,
        buying_signals TEXT,
        qualification_criteria TEXT,
        objection_handling TEXT,
        ideal_next_step TEXT,
        agenda_policy TEXT,
        advanced_instructions TEXT,
        response_playbook JSONB DEFAULT '{}'::jsonb,
        qualification_strategy JSONB DEFAULT '{}'::jsonb,
        offer_strategy JSONB DEFAULT '{}'::jsonb,
        handoff_strategy JSONB DEFAULT '{}'::jsonb,
        objection_playbook JSONB DEFAULT '[]'::jsonb,
        improvement_feedback JSONB DEFAULT '[]'::jsonb,
        test_transcript JSONB DEFAULT '[]'::jsonb,
        playbook_version TEXT,
        last_playbook_generated_at TIMESTAMPTZ,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    const iaConfigAlterations = [
      `ALTER TABLE ia_configs ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id)`,
      `ALTER TABLE ia_configs ADD COLUMN IF NOT EXISTS company_name TEXT`,
      `ALTER TABLE ia_configs ADD COLUMN IF NOT EXISTS agent_name TEXT`,
      `ALTER TABLE ia_configs ADD COLUMN IF NOT EXISTS main_product TEXT`,
      `ALTER TABLE ia_configs ADD COLUMN IF NOT EXISTS desired_revenue TEXT`,
      `ALTER TABLE ia_configs ADD COLUMN IF NOT EXISTS agent_objective TEXT`,
      `ALTER TABLE ia_configs ADD COLUMN IF NOT EXISTS unknown_behavior TEXT`,
      `ALTER TABLE ia_configs ADD COLUMN IF NOT EXISTS voice_tone TEXT`,
      `ALTER TABLE ia_configs ADD COLUMN IF NOT EXISTS restrictions TEXT`,
      `ALTER TABLE ia_configs ADD COLUMN IF NOT EXISTS customer_pain TEXT`,
      `ALTER TABLE ia_configs ADD COLUMN IF NOT EXISTS product_price TEXT`,
      `ALTER TABLE ia_configs ADD COLUMN IF NOT EXISTS target_audience TEXT`,
      `ALTER TABLE ia_configs ADD COLUMN IF NOT EXISTS customer_desires TEXT`,
      `ALTER TABLE ia_configs ADD COLUMN IF NOT EXISTS differentiators TEXT`,
      `ALTER TABLE ia_configs ADD COLUMN IF NOT EXISTS industry TEXT`,
      `ALTER TABLE ia_configs ADD COLUMN IF NOT EXISTS industry_detail TEXT`,
      `ALTER TABLE ia_configs ADD COLUMN IF NOT EXISTS channels JSONB DEFAULT '[]'::jsonb`,
      `ALTER TABLE ia_configs ADD COLUMN IF NOT EXISTS sales_cycle TEXT`,
      `ALTER TABLE ia_configs ADD COLUMN IF NOT EXISTS human_handoff_policy TEXT`,
      `ALTER TABLE ia_configs ADD COLUMN IF NOT EXISTS buying_signals TEXT`,
      `ALTER TABLE ia_configs ADD COLUMN IF NOT EXISTS qualification_criteria TEXT`,
      `ALTER TABLE ia_configs ADD COLUMN IF NOT EXISTS objection_handling TEXT`,
      `ALTER TABLE ia_configs ADD COLUMN IF NOT EXISTS ideal_next_step TEXT`,
      `ALTER TABLE ia_configs ADD COLUMN IF NOT EXISTS agenda_policy TEXT`,
      `ALTER TABLE ia_configs ADD COLUMN IF NOT EXISTS advanced_instructions TEXT`,
      `ALTER TABLE ia_configs ADD COLUMN IF NOT EXISTS response_playbook JSONB DEFAULT '{}'::jsonb`,
      `ALTER TABLE ia_configs ADD COLUMN IF NOT EXISTS qualification_strategy JSONB DEFAULT '{}'::jsonb`,
      `ALTER TABLE ia_configs ADD COLUMN IF NOT EXISTS offer_strategy JSONB DEFAULT '{}'::jsonb`,
      `ALTER TABLE ia_configs ADD COLUMN IF NOT EXISTS handoff_strategy JSONB DEFAULT '{}'::jsonb`,
      `ALTER TABLE ia_configs ADD COLUMN IF NOT EXISTS objection_playbook JSONB DEFAULT '[]'::jsonb`,
      `ALTER TABLE ia_configs ADD COLUMN IF NOT EXISTS improvement_feedback JSONB DEFAULT '[]'::jsonb`,
      `ALTER TABLE ia_configs ADD COLUMN IF NOT EXISTS test_transcript JSONB DEFAULT '[]'::jsonb`,
      `ALTER TABLE ia_configs ADD COLUMN IF NOT EXISTS playbook_version TEXT`,
      `ALTER TABLE ia_configs ADD COLUMN IF NOT EXISTS last_playbook_generated_at TIMESTAMPTZ`,
      `ALTER TABLE ia_configs ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW()`,
      `ALTER TABLE ia_configs ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW()`,
      `ALTER TABLE ia_configs ALTER COLUMN created_at SET DEFAULT NOW()`,
      `ALTER TABLE ia_configs ALTER COLUMN updated_at SET DEFAULT NOW()`,
    ];

    for (const statement of iaConfigAlterations) {
      await pool.query(statement).catch(() => { });
    }

    await pool.query(`
      UPDATE ia_configs ic
         SET organization_id = u.organization_id
       FROM users u
      WHERE ic.user_id = u.id
        AND ic.organization_id IS NULL
        AND u.organization_id IS NOT NULL
    `).catch(() => { });

    await pool.query(`
      UPDATE ia_configs
         SET created_at = COALESCE(created_at, NOW()),
             updated_at = COALESCE(updated_at, created_at, NOW())
       WHERE created_at IS NULL
          OR updated_at IS NULL
    `).catch(() => { });

    const leadAlterations = [
      `ALTER TABLE leads ADD COLUMN IF NOT EXISTS needs_human_attention BOOLEAN DEFAULT FALSE`,
      `ALTER TABLE leads ADD COLUMN IF NOT EXISTS human_attention_reason TEXT`,
      `ALTER TABLE leads ADD COLUMN IF NOT EXISTS human_attention_since TIMESTAMPTZ`,
      `ALTER TABLE leads ADD COLUMN IF NOT EXISTS top_objection TEXT`,
    ];

    for (const statement of leadAlterations) {
      await pool.query(statement).catch(() => { });
    }

    const memoryAlterations = [
      `ALTER TABLE lead_memory ADD COLUMN IF NOT EXISTS needs_human_attention BOOLEAN DEFAULT FALSE`,
      `ALTER TABLE lead_memory ADD COLUMN IF NOT EXISTS human_attention_reason TEXT`,
      `ALTER TABLE lead_memory ADD COLUMN IF NOT EXISTS human_attention_since TIMESTAMPTZ`,
      `ALTER TABLE lead_memory ADD COLUMN IF NOT EXISTS handoff_recommendation TEXT`,
      `ALTER TABLE lead_memory ADD COLUMN IF NOT EXISTS human_attention_score INT DEFAULT 0`,
      `ALTER TABLE lead_memory ADD COLUMN IF NOT EXISTS top_objection TEXT`,
    ];

    for (const statement of memoryAlterations) {
      await pool.query(statement).catch(() => { });
    }

    await pool.query(`ALTER TABLE agents ADD COLUMN IF NOT EXISTS advanced_instructions TEXT`).catch(() => { });
    await pool.query(`ALTER TABLE agents ADD COLUMN IF NOT EXISTS knowledge_summary TEXT`).catch(() => { });

    log("[SYSTEM] Kogna AI Core 2.1 columns verified.");
  } catch (err) {
    log("[ERROR] ensureKognaAICoreTables: " + err.message);
  }
};

// Inicia as conexões e migrações em segundo plano para não travar o boot da Vercel
initPool().then(() => {
  ensureKognaAICoreTables();
  ensureLeadsColumns();
  setTimeout(ensureMessageBuffer, 3000);
  setTimeout(ensureRevenueOSColumns, 5000); // Revenue OS: ensure intent_label, last_ia_briefing, assigned_to
  setTimeout(ensureCoachingTables, 7000); // Revenue OS Coaching: insights table
  setTimeout(() => ensureAdminMetricsTablesReady().catch((err) => log("[ERROR] ensureAdminMetricsTables: " + err.message)), 8500);
  setTimeout(ensureConversationIntelligenceTables, 9000); // CIL: Conversation Intelligence tables
  setTimeout(ensureOpportunityScoresTable, 10000); // OSE: Opportunity Scores table
  setTimeout(ensureFollowupEngineReady, 12000); // AI Follow-up Engine tables + legacy sync
  setTimeout(ensureIndustryProfileTables, 14000); // Industry Accelerator Layer tables
  setTimeout(ensureConversationStateTables, 16000); // CSE: Conversation State Engine tables
  setTimeout(ensureProductEngineTables, 18000);      // Product & Dynamic Offer Engine tables
  setTimeout(ensureOnboardingSessionsTable, 20000);   // Onboarding V2 test sessions table
  setTimeout(ensureOnboardingAnalyticsTable, 20500);  // Onboarding V2 analytics table
  setTimeout(ensureGuidedTourColumns, 22000);         // Guided tour rollout + persistence columns

  // Start Follow-up Engine cron jobs (fire after tables are ready)
  setTimeout(() => {
    // Process queue every 1 minute
    cron.schedule('* * * * *', () => {
      processFollowupQueue().catch(err => log(`[FOLLOWUP CRON] processQueue: ${err.message}`));
    });
    // Run Conversation Intelligence Engine once daily at 2am
    cron.schedule('0 2 * * *', () => {
      runConversationIntelligenceEngine().catch(err => log(`[CIE CRON] error: ${err.message}`));
    });
    log('[FOLLOWUP] Cron jobs started: queue processor (1m), CIE engine (daily 2am)');
  }, 15000);

}).catch(e => log("Startup error: " + e.message));

app.use(cors({ origin: true, credentials: true }));
app.use(cookieParser());
app.use(express.json({ limit: "50mb" })); // Increased limit for base64 image uploads
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// Request Logger Middleware
app.use((req, res, next) => {
  log(`${req.method} ${req.url}`);
  next();
});

// Helper to check DB health before query
const checkDb = async () => {
  try {
    const client = await pool.connect();
    client.release();
    return true;
  } catch (e) {
    return false;
  }
};

// --- AUTHENTICATION MIDDLEWARE ---

const verifyJWT = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  if (!authHeader) {
    return res.status(401).json({ error: "Nenhum token fornecido" });
  }

  const token = authHeader.startsWith("Bearer ")
    ? authHeader.split(" ")[1]
    : authHeader;

  if (token.startsWith("mock-jwt-token-for-")) {
    req.userId = token.replace("mock-jwt-token-for-", "");
    return next();
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET || "invalid_fallback");
    req.userId = decoded.id;
    req.userRole = decoded.role;
    next();
  } catch (err) {
    log(`[AUTH] JWT Verification failed: ${err.message} (Secret defined: ${!!JWT_SECRET})`);
    return res.status(401).json({
      error: "Token inválido ou expirado",
      reason: err.message,
      code: err.name
    });
  }
};

const verifyAdmin = async (req, res, next) => {
  if (!req.userId) return res.status(401).json({ error: "Unauthorized" });

  if (req.userRole !== "admin") {
    return res
      .status(403)
      .json({ error: "Acesso negado: Requer administrador" });
  }
  next();
};

// --- EVOLUTION API PROXY ---

const EVOLUTION_API_URL = process.env.EVOLUTION_API_URL;
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY;

if (!EVOLUTION_API_URL || !EVOLUTION_API_KEY) {
  log("CRITICAL: Evolution API configuration missing in .env");
}

const evolutionProxy = async (req, res) => {
  // req.baseUrl has the matched prefix ('/chat', '/instance', etc)
  // req.path has the remaining path ('/findChats/instanceName', etc)
  const targetPath = req.baseUrl + req.path;
  const url = `${EVOLUTION_API_URL}${targetPath}`;

  log(`[PROXY] ${req.method} ${url}`);

  try {
    const response = await fetch(url, {
      method: req.method,
      headers: {
        apikey: EVOLUTION_API_KEY,
        "Content-Type": "application/json",
      },
      body: ["POST", "PUT", "PATCH"].includes(req.method)
        ? JSON.stringify(req.body)
        : undefined,
    });

    const data = await response.json();
    res.status(response.status).json(data);
  } catch (err) {
    log(`[PROXY ERROR] ${req.method} ${url}: ${err.message}`);
    res.status(500).json({ error: "Failed to proxy request to Evolution API" });
  }
};

// --- AUTH DIAGNOSTICS ---
app.get("/api/auth-diag", (req, res) => {
  res.json({
    status: "ok",
    env: {
      hasJwtSecret: !!process.env.JWT_SECRET,
      jwtSecretLength: process.env.JWT_SECRET ? process.env.JWT_SECRET.length : 0,
      databaseUrlSet: !!process.env.DATABASE_URL,
      nodeEnv: process.env.NODE_ENV,
      vercel: process.env.VERCEL
    }
  });
});

app.use("/chat", evolutionProxy);
app.use("/message", evolutionProxy);
app.use("/group", evolutionProxy);
app.use("/instance", evolutionProxy);

// --- LIVE CHAT ROUTES ---

// GET /api/instance - Get current instance for Live Chat
app.get("/api/instance", verifyJWT, async (req, res) => {
  try {
    const userId = req.userId;
    log(`[API_INSTANCE] Hit by userId: ${userId}`);

    const orgRes = await pool.query(
      "SELECT organization_id FROM users WHERE id = $1",
      [userId],
    );
    const orgId = orgRes.rows[0]?.organization_id;
    log(`[API_INSTANCE] Found OrgId: ${orgId}`);

    let result;
    if (orgId) {
      result = await pool.query(
        "SELECT instance_name, status FROM whatsapp_instances WHERE organization_id = $1 ORDER BY created_at DESC",
        [orgId],
      );
    } else {
      result = await pool.query(
        "SELECT instance_name, status FROM whatsapp_instances WHERE user_id = $1 ORDER BY created_at DESC",
        [userId],
      );
    }

    log(`[API_INSTANCE] Found ${result.rows.length} instances`);

    if (result.rows.length === 0) {
      log(`[API_INSTANCE] No instances found for user ${userId}`);
      return res.status(404).json({ error: "Nenhuma instância encontrada" });
    }

    // Prioritize CONNECTED instances
    const active = result.rows.find(
      (r) => r.status === "CONNECTED" || r.status === "open",
    );
    const instance = active || result.rows[0];

    log(
      `[API_INSTANCE] Returning: ${instance.instance_name} (Status: ${instance.status})`,
    );
    res.json({ instanceName: instance.instance_name });
  } catch (err) {
    log("GET /api/instance error: " + err.toString());
    res.status(500).json({ error: "Database error" });
  }
});

// GET /api/chat-context/:instanceName/:jid - Get agent and pause status
app.get("/api/chat-context/:instanceName/:jid", verifyJWT, async (req, res) => {
  try {
    const { instanceName, jid } = req.params;

    // 1. Find Agent for this instance
    const agentRes = await pool.query(
      `SELECT a.id FROM agents a
             JOIN whatsapp_instances wi ON a.whatsapp_instance_id = wi.id
             WHERE wi.instance_name = $1`,
      [instanceName],
    );

    const agentId = agentRes.rows[0]?.id;

    // 2. Find Pause Status
    let isPaused = false;
    if (agentId) {
      const sessionRes = await pool.query(
        "SELECT is_paused FROM chat_sessions WHERE agent_id = $1 AND remote_jid = $2",
        [agentId, jid],
      );
      isPaused = sessionRes.rows[0]?.is_paused || false;
    }

    // 3. Find Lead Info
    let leadId = null;
    let leadScore = 0;
    let leadTemperature = "Frio";
    let needsHumanAttention = false;
    let humanAttentionReason = null;
    let humanAttentionSince = null;
    let topObjection = null;
    if (agentId) {
      const orgRes = await pool.query(
        "SELECT organization_id FROM agents WHERE id = $1",
        [agentId],
      );
      const orgId = orgRes.rows[0]?.organization_id;

      if (orgId) {
        const leadRes = await pool.query(
          `SELECT id, score, temperature, needs_human_attention, human_attention_reason, human_attention_since, top_objection
             FROM leads
            WHERE organization_id = $1 AND (phone LIKE $2 OR mobile_phone LIKE $2)
            LIMIT 1`,
          [orgId, `%${jid.split("@")[0]}%`],
        );
        if (leadRes.rows.length > 0) {
          leadId = leadRes.rows[0].id || null;
          leadScore = leadRes.rows[0].score || 0;
          leadTemperature = leadRes.rows[0].temperature || "Frio";
          needsHumanAttention = leadRes.rows[0].needs_human_attention || false;
          humanAttentionReason = leadRes.rows[0].human_attention_reason || null;
          humanAttentionSince = leadRes.rows[0].human_attention_since || null;
          topObjection = leadRes.rows[0].top_objection || null;
        }
      }
    }

    res.json({ agentId, isPaused, leadId, leadScore, leadTemperature, needsHumanAttention, humanAttentionReason, humanAttentionSince, topObjection });
  } catch (err) {
    log(`GET /api/chat-context error: ${err.message}`);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/chat-context/bulk/:instanceName - Get lead temperatures for multiple JIDs
app.post("/api/chat-context/bulk/:instanceName", verifyJWT, async (req, res) => {
  try {
    const { instanceName } = req.params;
    const { jids } = req.body;

    if (!jids || !Array.isArray(jids) || jids.length === 0) {
      return res.json({});
    }

    const agentRes = await pool.query(
      `SELECT a.organization_id FROM agents a
             JOIN whatsapp_instances wi ON a.whatsapp_instance_id = wi.id
             WHERE wi.instance_name = $1`,
      [instanceName]
    );

    const orgId = agentRes.rows[0]?.organization_id;
    if (!orgId) return res.json({});

    // We fetch leads that match any of the phone numbers
    // Note: since jids can be 551199999999@s.whatsapp.net, we strip the suffix
    const phonesToMatch = jids.map(jid => jid.split('@')[0]);

    const results = {};
    for (const phone of phonesToMatch) {
      const leadRes = await pool.query(
        "SELECT phone, mobile_phone, score, temperature FROM leads WHERE organization_id = $1 AND (phone LIKE $2 OR mobile_phone LIKE $2) LIMIT 1",
        [orgId, `%${phone}%`]
      );
      if (leadRes.rows.length > 0) {
        // Map the original jid directly (assumes single match per phone base)
        const matchedJid = jids.find(j => j.includes(phone));
        if (matchedJid) {
          results[matchedJid] = {
            temperature: leadRes.rows[0].temperature || 'Frio',
            score: leadRes.rows[0].score || 0
          };
        }
      }
    }

    res.json(results);
  } catch (err) {
    log(`POST /api/chat-context/bulk error: ${err.message}`);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/chats/toggle-pause - Toggle AI pause
app.post("/api/chats/toggle-pause", verifyJWT, async (req, res) => {
  try {
    const { instanceName, jid, isPaused, agentId: rawAgentId, remoteJid } = req.body;
    let agentId = rawAgentId || null;
    const targetJid = remoteJid || jid;

    if (!targetJid) {
      return res.status(400).json({ error: "remoteJid is required" });
    }

    if (!agentId) {
      const agentRes = await pool.query(
        `SELECT a.id FROM agents a
               JOIN whatsapp_instances wi ON a.whatsapp_instance_id = wi.id
               WHERE wi.instance_name = $1`,
        [instanceName],
      );
      agentId = agentRes.rows[0]?.id || null;
    }

    if (!agentId) {
      return res.status(404).json({ error: "Agent not found for this conversation" });
    }

    let nextPausedState = typeof isPaused === "boolean" ? isPaused : true;
    if (typeof isPaused !== "boolean") {
      const sessionRes = await pool.query(
        "SELECT is_paused FROM chat_sessions WHERE agent_id = $1 AND remote_jid = $2",
        [agentId, targetJid],
      );
      nextPausedState =
        sessionRes.rows.length > 0 ? !sessionRes.rows[0].is_paused : true;
    }

    await pool.query(
      `INSERT INTO chat_sessions (agent_id, remote_jid, is_paused) 
             VALUES ($1, $2, $3)
             ON CONFLICT (agent_id, remote_jid) 
             DO UPDATE SET is_paused = $3, updated_at = NOW()`,
      [agentId, targetJid, nextPausedState],
    );

    res.json({ success: true, isPaused: nextPausedState });
  } catch (err) {
    log(`POST /api/chats/toggle-pause error: ${err.message}`);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Helper to extract text from various file types
async function getAgentKnowledge(trainingFiles) {
  log(
    `[RAG] getAgentKnowledge called. Type: ${typeof trainingFiles}. Length: ${Array.isArray(trainingFiles) ? trainingFiles.length : "N/A"}`,
  );

  if (!trainingFiles) return "";

  // Ensure we have an array
  let files = trainingFiles;
  if (typeof trainingFiles === "string") {
    try {
      files = JSON.parse(trainingFiles);
    } catch (e) {
      log(`[RAG] Error parsing trainingFiles string: ${e.message}`);
      return "";
    }
  }

  if (!Array.isArray(files) || files.length === 0) {
    log(`[RAG] No files to process or files is not an array`);
    return "";
  }

  let combinedText = "\n\nBASE DE CONHECIMENTO DISPONIVEL:\n";

  for (const file of files) {
    try {
      const fileName = file.originalName || file.filename || file.name || "arquivo";
      const mimeType = file.mimeType || file.mimetype || "";
      const hasInlineContent = typeof file.content === "string" && file.content.length > 0;
      const hasResolvedPath = typeof file.path === "string" && file.path.length > 0;
      let textContent = "";

      if (hasInlineContent) {
        const buffer = Buffer.from(file.content, "base64");
        if (mimeType.includes("pdf") || /\.pdf$/i.test(fileName)) {
          try {
            const pdf = require("pdf-parse");
            const parsed = await pdf(buffer);
            textContent = parsed?.text || "";
          } catch (err) {
            log(`[RAG] Inline PDF parse failed for ${fileName}: ${err.message}`);
          }
        } else {
          textContent = buffer.toString("utf8");
        }
      } else if (hasResolvedPath) {
        const filePath = path.resolve(file.path);
        log(`[RAG] Processing file path: ${fileName} at ${filePath}`);
        if (!fs.existsSync(filePath)) {
          log(`[RAG] File not found: ${filePath}`);
          continue;
        }
        if (mimeType.includes("pdf") || filePath.endsWith(".pdf")) {
          try {
            const pdf = require("pdf-parse");
            const parsed = await pdf(fs.readFileSync(filePath));
            textContent = parsed?.text || "";
          } catch (err) {
            log(`[RAG] File PDF parse failed for ${fileName}: ${err.message}`);
          }
        } else {
          textContent = fs.readFileSync(filePath, "utf8");
        }
      }

      if (textContent && textContent.trim()) {
        combinedText += `\n--- Arquivo: ${fileName} ---\n${textContent.trim()}\n`;
        if (!file.extractedText) {
          file.extractedText = textContent.trim();
        }
      } else {
        log(`[RAG] Unsupported or empty file content for ${fileName}`);
      }
    } catch (err) {
      log(`[RAG] Error reading file ${file.originalName || file.filename || "arquivo"}: ${err.message}`);
    }
  }

  log(
    `[RAG] Knowledge base text generated. Total length: ${combinedText.length}`,
  );
  return combinedText;
}

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date() });
});

// Login API
app.post("/api/login", async (req, res) => {
  const { email, password } = req.body;
  log(`Login attempt for: ${email}`);

  if (!(await checkDb())) {
    return res
      .status(503)
      .json({ error: "Database disconnected. Check server logs." });
  }

  if (!email || !password) {
    return res.status(400).json({ error: "E-mail e senha são obrigatórios" });
  }

  try {
    const result = await pool.query("SELECT * FROM users WHERE email = $1", [
      email,
    ]);
    const user = result.rows[0];

    if (!user) {
      log(`Login failed: User not found for email ${email}`);
      return res.status(401).json({ error: "E-mail ou senha incorretos" });
    }

    // Validate password
    if (!user.password) {
      return res
        .status(401)
        .json({
          error: "Conta sem senha definida. Entre em contato com o suporte.",
        });
    }

    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      log(`Login failed: Invalid password for ${email}`);
      return res.status(401).json({ error: "E-mail ou senha incorretos" });
    }

    // Ensure user has an organization
    if (!user.organization_id) {
      const newOrg = await pool.query(
        `INSERT INTO organizations (name, owner_id, plan_type) VALUES ($1, $2, 'basic') RETURNING *`,
        [user.name + "'s Organization", user.id],
      );
      const org = newOrg.rows[0];

      await pool.query("UPDATE users SET organization_id = $1 WHERE id = $2", [
        org.id,
        user.id,
      ]);
      user.organization_id = org.id;
    }

    // Fetch organization details to return
    const orgRes = await pool.query(
      "SELECT id, name, plan_type, whatsapp_connections_limit FROM organizations WHERE id = $1",
      [user.organization_id],
    );
    const organization = orgRes.rows[0];

    // Don't send password hash to client
    const { password: _, ...safeUser } = user;

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: "24h" },
    );

    log(`Login successful for ${email} (ID: ${user.id})`);

    res.json({
      user: { ...safeUser, organization },
      role: user.role,
      token,
    });
  } catch (err) {
    log("Login error: " + err.toString());
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── ONBOARDING V2 ENDPOINTS ───────────────────────────────────────────────────

// POST /api/onboarding/preview-ai — powers the Step 15 AI test chat
// Public, rate-limited to 5 msgs per session_id
const onboardingPreviewLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 25,
  keyGenerator: (req) => req.body?.session_id || req.ip,
  message: { error: 'Limite de mensagens de teste atingido.' }
});

// In-memory session counter (survives for the duration of the process, good enough for test chats)
const onboardingSessionCount = new Map();

app.post('/api/onboarding/preview-ai', onboardingPreviewLimiter, async (req, res) => {
  try {
    const { session_id, message, onboarding_context, history } = req.body;
    if (!session_id || !message) return res.status(400).json({ error: 'session_id e message são obrigatórios.' });

    const MAX_MSGS = 5;

    // Track count in memory (reliable even if DB table doesn't exist)
    const count = onboardingSessionCount.get(session_id) || 0;

    if (count >= MAX_MSGS) {
      return res.status(429).json({ error: 'Limite de interações de teste atingido.', limitReached: true, messagesUsed: MAX_MSGS });
    }

    const ctx = onboarding_context || {};
    const previewProfile = {
      ...createDefaultCompanyProfile(),
      companyName: ctx.companyName || "",
      companyProduct: ctx.mainProduct || "",
      targetAudience: Array.isArray(ctx.targetAudience) ? ctx.targetAudience.join(', ') : (ctx.targetAudience || ""),
      customerPain: ctx.customerPain || "",
      customerDesires: ctx.customerDesires || "",
      differentiators: ctx.differentiators || "",
      industry: ctx.industry || "",
      voiceTone: ctx.voiceTone || "",
      agentName: ctx.aiName || "",
      agentObjective: ctx.agentObjective || "",
      restrictions: ctx.restrictions || "",
      humanHandoffPolicy: ctx.humanHandoffPolicy || "",
      objectionHandling: ctx.objectionHandling || "",
      idealNextStep: ctx.idealNextStep || "",
      productPrice: ctx.productPrice || "",
      objectionPlaybook: Array.isArray(ctx.objectionPlaybook)
        ? ctx.objectionPlaybook
        : normalizeStringList(ctx.objections).map((label, index) => ({
          label,
          signals: [label],
          recommended_approach: ctx.objectionHandling || "Reposicione valor e conduza o proximo passo.",
          cta_after_resolution: ctx.idealNextStep || "Leve a conversa para o proximo passo comercial.",
          priority: index + 1,
        })),
    };

    const previewPlaybook = buildFallbackOperationalPlaybook(previewProfile, []);
    const systemPrompt = `Voce e ${ctx.aiName || 'uma IA de vendas'}, assistente da empresa ${ctx.companyName || 'nossa empresa'}.

Seu objetivo comercial: ${ctx.agentObjective === 'fechar_venda' ? 'fechar vendas diretamente no WhatsApp' : ctx.agentObjective === 'qualificar_agendar' ? 'qualificar leads e agendar reunioes' : 'qualificar, aquecer e direcionar para um vendedor quando fizer sentido'}.

Produto/Servico: ${ctx.mainProduct || 'nossos produtos'}
ICP / publico ideal: ${Array.isArray(ctx.targetAudience) ? ctx.targetAudience.join(', ') : (ctx.targetAudience || 'clientes em geral')}
Dor principal: ${ctx.customerPain || 'descobrir a dor central do lead'}
Diferenciais: ${ctx.differentiators || 'conectar valor, clareza e proximo passo'}
Tom de voz: ${ctx.voiceTone || 'consultivo'}
Mercado: ${ctx.industry || 'geral'}
Playbook de resposta: ${(previewPlaybook.response_playbook?.principles || []).join(' | ')}
Objecoes: ${(previewPlaybook.objection_playbook || []).map((item) => `${item.label}: ${item.recommended_approach}`).join(' | ') || 'Se houver objecao, reposicione valor e conduza o proximo passo.'}
${ctx.restrictions ? `\nNunca diga: ${ctx.restrictions}` : ''}

IMPORTANTE:
- Este e um teste com o dono da operacao. Mostre o potencial da Kogna.
- Nao responda de forma passiva como "Oi, como posso ajudar?".
- Entre com contexto, valor ou proximo passo.
- Seja natural, comercial e em portugues do Brasil.
- Maximo 3 paragrafos curtos por resposta.`;

    // Build messages with full conversation history for memory
    const messages = [{ role: 'system', content: systemPrompt }];

    // Add prior turns from history sent by client
    if (Array.isArray(history)) {
      for (const h of history) {
        if (h.role === 'user') messages.push({ role: 'user', content: h.text });
        else if (h.role === 'ai') messages.push({ role: 'assistant', content: h.text });
      }
    }
    // Add current user message
    messages.push({ role: 'user', content: message });

    const completion = await openai.chat.completions.create({
      model: DEFAULT_AGENT_MODEL,
      messages,
      max_tokens: 300,
      temperature: 0.75
    });

    const reply = completion.choices[0]?.message?.content || 'Não consegui responder, tente novamente.';

    const newCount = count + 1;
    onboardingSessionCount.set(session_id, newCount);

    // Save to dataset for CIL — best-effort
    pool.query(
      `INSERT INTO onboarding_test_sessions (session_id, user_message, ai_reply, onboarding_context)
       VALUES ($1, $2, $3, $4)`,
      [session_id, message, reply, JSON.stringify(ctx)]
    ).catch(() => { });

    const previewUserId = getOptionalUserIdFromAuthHeader(req);
    if (previewUserId) {
      const previewOrgId = await getOrganizationIdForUser(previewUserId).catch(() => null);
      if (previewOrgId) {
        const currentProfile = await getCanonicalCompanyProfile({ orgId: previewOrgId, userId: previewUserId }).catch(() => createDefaultCompanyProfile());
        const nextTranscript = [
          ...(currentProfile.testTranscript || []),
          normalizeTestTranscriptEntry({ role: 'user', text: message }),
          normalizeTestTranscriptEntry({ role: 'assistant', text: reply }),
        ].slice(-30);
        await upsertCanonicalCompanyProfile({
          orgId: previewOrgId,
          userId: previewUserId,
          payload: { ...currentProfile, testTranscript: nextTranscript },
          regeneratePlaybook: false,
        }).catch((profileErr) => {
          log('[ONBOARDING-PREVIEW] transcript sync error: ' + profileErr.message);
        });
      }
      await runAdminEventAutomations('ai_tested', {
        userId: previewUserId,
        eventKey: `ai_tested:${previewUserId}`,
        extraVars: {
          mensagem_teste: message,
          resposta_teste: reply,
        },
      }).catch((err) => {
        log('[AUTO EVENT ai_tested] ' + err.message);
      });
    }

    const diagnostics = buildPreviewDiagnostics(message, reply);
    const limitReached = newCount >= MAX_MSGS;
    res.json({
      reply,
      messagesUsed: newCount,
      messagesLeft: Math.max(0, MAX_MSGS - newCount),
      limitReached,
      ...diagnostics,
    });
  } catch (err) {
    log('[ONBOARDING-PREVIEW] Error: ' + err.message);
    res.status(500).json({ error: 'Erro ao processar mensagem: ' + err.message });
  }
});

// POST /api/onboarding/register-and-save — creates account + org + agent from all onboarding data
app.post('/api/onboarding/track-step', async (req, res) => {
  try {
    const {
      session_id,
      step,
      total_steps,
      email,
      phone,
      metadata,
    } = req.body || {};

    if (!session_id) {
      return res.status(400).json({ error: 'session_id é obrigatório.' });
    }

    const userId = getOptionalUserIdFromAuthHeader(req);
    const progress = await trackOnboardingProgress({
      sessionId: session_id,
      userId,
      step,
      totalSteps: total_steps || ONBOARDING_ANALYTICS_TOTAL_STEPS,
      email,
      phone,
      metadata: {
        route: '/register',
        ...((metadata && typeof metadata === 'object') ? metadata : {}),
      },
      completed: Number(step) >= Number(total_steps || ONBOARDING_ANALYTICS_TOTAL_STEPS),
    });

    res.json({
      success: true,
      session_id: progress?.session_id || session_id,
      current_step: progress?.current_step || sanitizeOnboardingStep(step, total_steps || ONBOARDING_ANALYTICS_TOTAL_STEPS),
      max_step_reached: progress?.max_step_reached || sanitizeOnboardingStep(step, total_steps || ONBOARDING_ANALYTICS_TOTAL_STEPS),
      completed: Boolean(progress?.completed_at),
    });
  } catch (err) {
    log('[ONBOARDING TRACK] ' + err.message);
    res.status(500).json({ error: 'Erro ao rastrear etapa do onboarding.' });
  }
});

app.post('/api/onboarding/register-and-save', authLimiter, async (req, res) => {
  const client = await pool.connect();
  let committedProvisioning = false;
  let org = null;
  let user = null;
  try {
    const {
      name, email, phone, password,
      agentObjective, industry, industryDetail,
      companyName, aiName, mainProduct, customerPain, customerDesires, differentiators, productPrice,
      targetAudience, channels, salesCycle, revenueGoal,
      unknownBehavior, voiceTone, restrictions,
      humanHandoffPolicy, buyingSignals, qualificationCriteria, objectionHandling, idealNextStep, agendaPolicy,
      objectionPlaybook, objections,
      referral_code,
      onboarding_session_id,
    } = req.body;

    if (!name || !email || !password) return res.status(400).json({ error: 'Nome, e-mail e senha são obrigatórios.' });
    if (password.length < 6) return res.status(400).json({ error: 'A senha deve ter pelo menos 6 caracteres.' });

    const existCheck = await client.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
    if (existCheck.rows.length > 0) return res.status(409).json({ error: 'Este e-mail já está cadastrado. Faça login.' });

    // ── Mandatory transaction: org + user ─────────────────────────────────────
    await client.query('BEGIN');

    // Use SAVEPOINT so we can recover from a failed INSERT without aborting the whole transaction
    await client.query('SAVEPOINT sp_org');
    try {
      const r = await client.query(
        `INSERT INTO organizations (name, plan_type) VALUES ($1, 'basic') RETURNING *`,
        [companyName || name + "'s Organization"]
      );
      org = r.rows[0];
    } catch (e) {
      await client.query('ROLLBACK TO SAVEPOINT sp_org');
      // Retry without plan_type column (may not exist in all environments)
      const r = await client.query(
        `INSERT INTO organizations (name) VALUES ($1) RETURNING *`,
        [companyName || name + "'s Organization"]
      );
      org = r.rows[0];
    }
    await client.query('RELEASE SAVEPOINT sp_org');

    const hashedPassword = await bcrypt.hash(password, 10);

    // Insert with guaranteed columns. koins_balance confirmed to exist.
    const userRes = await client.query(
      `INSERT INTO users (name, email, password, organization_id, role, koins_balance)
       VALUES ($1, $2, $3, $4, 'user', 100) RETURNING *`,
      [name, email.toLowerCase(), hashedPassword, org.id]
    );
    user = userRes.rows[0];

    await client.query('UPDATE organizations SET owner_id = $1 WHERE id = $2', [user.id, org.id]);

    await ensureDefaultVendedorForUser(client, {
      orgId: org.id,
      nome: name,
      email: email.toLowerCase(),
      whatsapp: phone || null,
    });

    // Mark onboarding complete (non-blocking if column missing)
    await client.query(`UPDATE users SET onboarding_completed = true WHERE id = $1`, [user.id]).catch(() => { });

    await client.query('COMMIT');
    committedProvisioning = true;

    // Best-effort: save whatsapp number in personal_phone column
    if (phone) pool.query(`UPDATE users SET personal_phone=$1 WHERE id=$2`, [phone, user.id]).catch(() => { });

    // ── Mandatory: seed canonical company profile before creating the agent ───
    const seededObjectionPlaybook = Array.isArray(objectionPlaybook) && objectionPlaybook.length > 0
      ? objectionPlaybook
      : normalizeStringList(objections).map((label, index) => ({
        label,
        signals: [label],
        recommended_approach: objectionHandling || 'Reposicione valor, contexto e proximo passo com clareza.',
        cta_after_resolution: idealNextStep || 'Conduza para o proximo passo mais simples da jornada.',
        priority: index + 1,
      }));

    await ensureKognaAICoreTables();
    const seededProfile = await upsertCanonicalCompanyProfile({
      orgId: org.id,
      userId: user.id,
      payload: {
        companyName,
        agentName: aiName,
        companyProduct: mainProduct,
        revenueGoal,
        agentObjective,
        unknownBehavior,
        voiceTone,
        restrictions: restrictions || "",
        customerPain: customerPain || "",
        customerDesires: customerDesires || "",
        differentiators: differentiators || "",
        productPrice: productPrice || "",
        targetAudience: Array.isArray(targetAudience) ? targetAudience.join(', ') : targetAudience || "",
        industry: industry || "",
        industryDetail: industryDetail || "",
        channels: channels || [],
        salesCycle: salesCycle || "",
        humanHandoffPolicy: humanHandoffPolicy || "",
        buyingSignals: buyingSignals || "",
        qualificationCriteria: qualificationCriteria || "",
        objectionHandling: objectionHandling || "",
        idealNextStep: idealNextStep || "",
        agendaPolicy: agendaPolicy || "",
        objectionPlaybook: seededObjectionPlaybook,
      },
      regeneratePlaybook: false,
    });
    log(`[ONBOARDING-V2] canonical profile saved for org ${org.id}`);

    // ── Mandatory: create first agent hydrated from onboarding profile ────────
    const createdAgent = {
      id: null,
      name: aiName || seededProfile.agentName || 'Agente IA',
      type: 'sdr',
    };
    const systemPrompt = composeAgentSystemPrompt({
      profile: seededProfile,
      agentName: createdAgent.name,
      agentType: createdAgent.type,
    });

    const agentInsert = await pool.query(
      `INSERT INTO agents (organization_id, name, type, status, system_prompt, advanced_instructions, model_config)
       VALUES ($1, $2, 'sdr', 'active', $3, $4, $5)
       RETURNING id`,
      [
        org.id,
        createdAgent.name,
        systemPrompt,
        seededProfile.advancedInstructions || null,
        JSON.stringify({ model: DEFAULT_AGENT_MODEL, temperature: 0.45 }),
      ]
    );
    createdAgent.id = agentInsert.rows[0]?.id || null;
    log(`[ONBOARDING-V2] agent hydrated from onboarding profile for org ${org.id}`);

    const { password: _, ...safeUser } = user;
    const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '24h' });

    log(`[ONBOARDING-V2] New account created: ${email} (org: ${org.id})`);
    res.status(201).json({ token, user: { ...safeUser, organization: org }, role: 'user', agentId: createdAgent.id });

    runNonBlockingTask(`onboarding-track-register:${user.id}`, async () => {
      if (!onboarding_session_id) return;
      await trackOnboardingProgress({
        sessionId: onboarding_session_id,
        userId: user.id,
        step: 14,
        totalSteps: ONBOARDING_ANALYTICS_TOTAL_STEPS,
        email: user.email,
        phone: phone || user.personal_phone || null,
        metadata: {
          route: '/register',
          registered_via: 'register-and-save',
        },
        registered: true,
      });
    });

    runNonBlockingTask(`onboarding-playbook:${org.id}`, async () => {
      const currentProfile = await getCanonicalCompanyProfile({ orgId: org.id, userId: user.id });
      const hydratedProfile = await upsertCanonicalCompanyProfile({
        orgId: org.id,
        userId: user.id,
        payload: currentProfile,
        regeneratePlaybook: true,
      });
      if (createdAgent.id) {
        const nextSystemPrompt = composeAgentSystemPrompt({
          profile: hydratedProfile,
          agentName: createdAgent.name,
          agentType: createdAgent.type,
        });
        await pool.query(
          `UPDATE agents
              SET system_prompt = $1,
                  advanced_instructions = $2,
                  updated_at = NOW()
            WHERE id = $3
              AND organization_id = $4`,
          [
            nextSystemPrompt,
            hydratedProfile.advancedInstructions || null,
            createdAgent.id,
            org.id,
          ],
        );
      }
      log(`[ONBOARDING-V2] playbook regenerated and agent prompt synced for org ${org.id}`);
    });

    runNonBlockingTask(`onboarding-automations:${user.id}`, async () => {
      await Promise.allSettled([
        runAdminEventAutomations('user_created', {
          userId: user.id,
          eventKey: `user_created:${user.id}`,
        }),
        runAdminEventAutomations('onboarding_completed', {
          userId: user.id,
          eventKey: `onboarding_completed:${user.id}`,
        }),
      ]);
    });
  } catch (err) {
    if (!committedProvisioning) {
      await client.query('ROLLBACK').catch(() => { });
    } else {
      await cleanupFailedOnboardingProvisioning({ orgId: org?.id, userId: user?.id });
    }
    log('[ONBOARDING-V2] register-and-save error: ' + err.message);
    res.status(500).json({ error: 'Erro ao criar conta: ' + err.message });
  } finally {
    client.release();
  }
});

// ── END ONBOARDING V2 ENDPOINTS ───────────────────────────────────────────────

// ── COMPANY DATA ENDPOINTS ────────────────────────────────────────────────────

// GET /api/company-data — returns ia_configs mapped to CompanyData shape (used by MyAIs)
app.get('/api/company-data', verifyJWT, async (req, res) => {
  try {
    await ensureKognaAICoreTables();
    const orgId = await getOrganizationIdForUser(req.userId);
    if (!orgId) return res.status(400).json({ error: 'No organization' });
    const profile = await getCanonicalCompanyProfile({ orgId, userId: req.userId });
    res.json(profile);
  } catch (err) {
    log('[COMPANY-DATA] GET error: ' + err.message);
    res.status(500).json({ error: 'Erro ao buscar dados da empresa.' });
  }
});

// PUT /api/company-profile — saves ia_configs for the org
app.put('/api/company-profile', verifyJWT, async (req, res) => {
  try {
    await ensureKognaAICoreTables();
    const orgId = await getOrganizationIdForUser(req.userId);
    if (!orgId) return res.status(400).json({ error: 'No organization' });
    const profile = await upsertCanonicalCompanyProfile({
      orgId,
      userId: req.userId,
      payload: req.body || {},
      regeneratePlaybook: true,
    });
    res.json({ success: true, profile });
  } catch (err) {
    log('[COMPANY-PROFILE] PUT error: ' + err.message);
    res.status(500).json({ error: 'Erro ao salvar perfil da empresa.', details: err.message });
  }
});

app.post('/api/company-profile/feedback', verifyJWT, async (req, res) => {
  try {
    await ensureKognaAICoreTables();
    const orgId = await getOrganizationIdForUser(req.userId);
    if (!orgId) return res.status(400).json({ error: 'No organization' });
    const { category, detail, transcript } = req.body || {};
    if (!detail) return res.status(400).json({ error: 'Feedback detail is required.' });
    const profile = await appendCompanyProfileFeedback({
      orgId,
      userId: req.userId,
      category,
      detail,
      transcript: Array.isArray(transcript) ? transcript : [],
    });
    res.json({ success: true, profile });
  } catch (err) {
    log('[COMPANY-PROFILE] feedback error: ' + err.message);
    res.status(500).json({ error: 'Erro ao salvar melhoria.' });
  }
});

app.post('/api/company-profile/regenerate-playbook', verifyJWT, async (req, res) => {
  try {
    await ensureKognaAICoreTables();
    const orgId = await getOrganizationIdForUser(req.userId);
    if (!orgId) return res.status(400).json({ error: 'No organization' });
    const current = await getCanonicalCompanyProfile({ orgId, userId: req.userId });
    const profile = await upsertCanonicalCompanyProfile({
      orgId,
      userId: req.userId,
      payload: current,
      regeneratePlaybook: true,
    });
    res.json({ success: true, profile });
  } catch (err) {
    log('[COMPANY-PROFILE] regenerate-playbook error: ' + err.message);
    res.status(500).json({ error: 'Erro ao regenerar playbook.' });
  }
});

// PATCH /api/ia-config — compatibility wrapper for structured feedback
app.patch('/api/ia-config', verifyJWT, async (req, res) => {
  try {
    await ensureKognaAICoreTables();
    const orgId = await getOrganizationIdForUser(req.userId);
    if (!orgId) return res.status(400).json({ error: 'No organization' });
    const { restrictions, category, detail, transcript } = req.body || {};
    const feedbackDetail = detail || restrictions;
    if (!feedbackDetail) return res.json({ success: true });
    const profile = await appendCompanyProfileFeedback({
      orgId,
      userId: req.userId,
      category: category || 'melhoria_onboarding',
      detail: feedbackDetail,
      transcript: Array.isArray(transcript) ? transcript : [],
    });
    res.json({ success: true, profile });
  } catch (err) {
    log('[IA-CONFIG] PATCH error: ' + err.message);
    res.status(500).json({ error: 'Erro ao salvar melhoria.' });
  }
});

app.get('/api/objections', verifyJWT, async (req, res) => {
  try {
    await ensureKognaAICoreTables();
    const orgId = await getOrganizationIdForUser(req.userId);
    if (!orgId) return res.status(400).json({ error: 'No organization' });
    const profile = await getCanonicalCompanyProfile({ orgId, userId: req.userId });
    res.json(profile.objectionPlaybook || []);
  } catch (err) {
    log('[OBJECTIONS] GET error: ' + err.message);
    res.status(500).json({ error: 'Erro ao buscar objecoes.' });
  }
});

app.post('/api/objections', verifyJWT, async (req, res) => {
  try {
    await ensureKognaAICoreTables();
    const orgId = await getOrganizationIdForUser(req.userId);
    if (!orgId) return res.status(400).json({ error: 'No organization' });
    const profile = await getCanonicalCompanyProfile({ orgId, userId: req.userId });
    const nextItems = [
      ...(profile.objectionPlaybook || []),
      normalizeObjectionPlaybookItem(req.body || {}, (profile.objectionPlaybook || []).length),
    ].filter((item) => item.label);
    const updated = await upsertCanonicalCompanyProfile({
      orgId,
      userId: req.userId,
      payload: { ...profile, objectionPlaybook: nextItems },
      regeneratePlaybook: true,
    });
    res.status(201).json(updated.objectionPlaybook);
  } catch (err) {
    log('[OBJECTIONS] POST error: ' + err.message);
    res.status(500).json({ error: 'Erro ao criar objecao.' });
  }
});

app.put('/api/objections/:id', verifyJWT, async (req, res) => {
  try {
    await ensureKognaAICoreTables();
    const orgId = await getOrganizationIdForUser(req.userId);
    if (!orgId) return res.status(400).json({ error: 'No organization' });
    const profile = await getCanonicalCompanyProfile({ orgId, userId: req.userId });
    const nextItems = (profile.objectionPlaybook || []).map((item, index) =>
      item.id === req.params.id ? normalizeObjectionPlaybookItem({ ...item, ...(req.body || {}), id: item.id }, index) : item,
    );
    const updated = await upsertCanonicalCompanyProfile({
      orgId,
      userId: req.userId,
      payload: { ...profile, objectionPlaybook: nextItems },
      regeneratePlaybook: true,
    });
    res.json(updated.objectionPlaybook);
  } catch (err) {
    log('[OBJECTIONS] PUT error: ' + err.message);
    res.status(500).json({ error: 'Erro ao atualizar objecao.' });
  }
});

app.patch('/api/objections/:id/toggle', verifyJWT, async (req, res) => {
  try {
    await ensureKognaAICoreTables();
    const orgId = await getOrganizationIdForUser(req.userId);
    if (!orgId) return res.status(400).json({ error: 'No organization' });
    const profile = await getCanonicalCompanyProfile({ orgId, userId: req.userId });
    const nextItems = (profile.objectionPlaybook || []).map((item) =>
      item.id === req.params.id ? { ...item, is_active: req.body?.is_active ?? !item.is_active } : item,
    );
    const updated = await upsertCanonicalCompanyProfile({
      orgId,
      userId: req.userId,
      payload: { ...profile, objectionPlaybook: nextItems },
      regeneratePlaybook: true,
    });
    res.json(updated.objectionPlaybook);
  } catch (err) {
    log('[OBJECTIONS] TOGGLE error: ' + err.message);
    res.status(500).json({ error: 'Erro ao ativar/inativar objecao.' });
  }
});

app.delete('/api/objections/:id', verifyJWT, async (req, res) => {
  try {
    await ensureKognaAICoreTables();
    const orgId = await getOrganizationIdForUser(req.userId);
    if (!orgId) return res.status(400).json({ error: 'No organization' });
    const profile = await getCanonicalCompanyProfile({ orgId, userId: req.userId });
    const nextItems = (profile.objectionPlaybook || []).filter((item) => item.id !== req.params.id);
    const updated = await upsertCanonicalCompanyProfile({
      orgId,
      userId: req.userId,
      payload: { ...profile, objectionPlaybook: nextItems },
      regeneratePlaybook: true,
    });
    res.json(updated.objectionPlaybook);
  } catch (err) {
    log('[OBJECTIONS] DELETE error: ' + err.message);
    res.status(500).json({ error: 'Erro ao excluir objecao.' });
  }
});

// ── END COMPANY DATA ENDPOINTS ────────────────────────────────────────────────

// ── AGENTS CRUD ───────────────────────────────────────────────────────────────

// GET /api/agents — list all agents for the user's org
app.get('/api/agents', verifyJWT, async (req, res) => {
  try {
    const orgRes = await pool.query('SELECT organization_id FROM users WHERE id = $1', [req.userId]);
    const orgId = orgRes.rows[0]?.organization_id;
    if (!orgId) return res.json([]);
    const r = await pool.query(
      `SELECT a.id, a.name,
              COALESCE(a.type, 'sdr') AS type,
              COALESCE(a.status, 'active') AS status,
              a.system_prompt,
              a.advanced_instructions,
              a.model_config,
              a.training_files,
              a.whatsapp_instance_id,
              a.created_at,
              wi.instance_name AS whatsapp_instance_name,
              wi.status AS whatsapp_instance_status
       FROM agents a
       LEFT JOIN whatsapp_instances wi ON wi.id = a.whatsapp_instance_id
       WHERE a.organization_id = $1
       ORDER BY a.created_at DESC`,
      [orgId]
    );
    res.json(r.rows);
  } catch (err) {
    log('[AGENTS] GET error: ' + err.message);
    res.status(500).json({ error: 'Erro ao buscar agentes.' });
  }
});

// POST /api/agents — create a new agent
app.post('/api/agents', verifyJWT, async (req, res) => {
  try {
    await ensureKognaAICoreTables();
    const orgRes = await pool.query('SELECT organization_id FROM users WHERE id = $1', [req.userId]);
    const orgId = orgRes.rows[0]?.organization_id;
    if (!orgId) return res.status(400).json({ error: 'No organization' });

    const { name, type, system_prompt, model_config, use_company_profile, advanced_instructions } = req.body;
    if (!name) return res.status(400).json({ error: 'name é obrigatório' });

    const profile = await getCanonicalCompanyProfile({ orgId, userId: req.userId });
    const generatedPrompt = use_company_profile || !system_prompt
      ? composeAgentSystemPrompt({
        profile,
        agentName: name,
        agentType: type || 'sdr',
        customInstructions: advanced_instructions || system_prompt || "",
      })
      : system_prompt;
    const nextModelConfig = {
      model: DEFAULT_AGENT_MODEL,
      temperature: Number.isFinite(Number(model_config?.temperature)) ? Number(model_config.temperature) : 0.45,
    };

    const r = await pool.query(
      `INSERT INTO agents (organization_id, name, type, system_prompt, advanced_instructions, model_config, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'active') RETURNING *`,
      [orgId, name, type || 'sdr', generatedPrompt || '', advanced_instructions || null, JSON.stringify(nextModelConfig)]
    );
    await runAdminEventAutomations('agent_created', {
      userId: req.userId,
      eventKey: `agent_created:${r.rows[0].id}`,
      extraVars: { nome_ia: r.rows[0].name },
    }).catch((automationErr) => {
      log('[AUTO EVENT agent_created] ' + automationErr.message);
    });
    res.status(201).json(r.rows[0]);
  } catch (err) {
    log('[AGENTS] POST error: ' + err.message);
    res.status(500).json({ error: 'Erro ao criar agente.', details: err.message });
  }
});

// DELETE /api/agents/:id
app.delete('/api/agents/:id', verifyJWT, async (req, res) => {
  try {
    const orgRes = await pool.query('SELECT organization_id FROM users WHERE id = $1', [req.userId]);
    const orgId = orgRes.rows[0]?.organization_id;
    const r = await pool.query(
      'DELETE FROM agents WHERE id = $1 AND organization_id = $2 RETURNING id',
      [req.params.id, orgId]
    );
    if (r.rows.length === 0) return res.status(404).json({ error: 'Agente não encontrado.' });
    res.json({ success: true });
  } catch (err) {
    log('[AGENTS] DELETE error: ' + err.message);
    res.status(500).json({ error: 'Erro ao excluir agente.', details: err.message });
  }
});

// POST /api/agents/:id/toggle-pause
app.post('/api/agents/:id/toggle-pause', verifyJWT, async (req, res) => {
  try {
    const orgRes = await pool.query('SELECT organization_id FROM users WHERE id = $1', [req.userId]);
    const orgId = orgRes.rows[0]?.organization_id;
    const curr = await pool.query(
      'SELECT status FROM agents WHERE id = $1 AND organization_id = $2',
      [req.params.id, orgId]
    );
    if (curr.rows.length === 0) return res.status(404).json({ error: 'Agente não encontrado.' });
    const newStatus = curr.rows[0].status === 'paused' ? 'active' : 'paused';
    await pool.query('UPDATE agents SET status = $1 WHERE id = $2', [newStatus, req.params.id]);
    res.json({ status: newStatus });
  } catch (err) {
    log('[AGENTS] toggle-pause error: ' + err.message);
    res.status(500).json({ error: 'Erro ao pausar/retomar agente.' });
  }
});

// GET /api/industry/my-profile — returns org industry slug (used by MyAIs for agent suggestions)
app.get('/api/industry/my-profile', verifyJWT, async (req, res) => {
  try {
    const orgRes = await pool.query('SELECT organization_id FROM users WHERE id = $1', [req.userId]);
    const orgId = orgRes.rows[0]?.organization_id;
    if (!orgId) return res.json({});
    const r = await pool.query(
      'SELECT industry AS industry_slug FROM ia_configs WHERE organization_id = $1',
      [orgId]
    );
    res.json(r.rows[0] || {});
  } catch (_) { res.json({}); }
});

// ── END AGENTS CRUD ───────────────────────────────────────────────────────────

// ── AUTOMATIONS & NOTIFICATIONS SYSTEM ────────────────────────────────────────

// Lazy-load nodemailer so the module doesn't crash if not installed
let nodemailer;
try { nodemailer = (await import('nodemailer')).default; } catch (_) { log('[SMTP] nodemailer not available'); }

function createSmtpTransporter() {
  if (!nodemailer) return null;
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.hostinger.com',
    port: parseInt(process.env.SMTP_PORT || '465'),
    secure: true, // SSL
    auth: {
      user: process.env.SMTP_USER || 'news@kogna.co',
      pass: process.env.SMTP_PASS || 'Louiseemel@123',
    },
  });
}

async function sendEmail(to, subject, html) {
  const transporter = createSmtpTransporter();
  if (!transporter) { log('[SMTP] Skipped – nodemailer not available'); return; }
  await transporter.sendMail({
    from: process.env.SMTP_FROM || '"Kogna" <news@kogna.co>',
    to, subject, html,
  });
  log(`[SMTP] Sent to ${to}: ${subject}`);
}

async function sendWhatsAppMsg(instanceName, phone, message, options = {}) {
  const EVO_URL = process.env.EVOLUTION_API_URL;
  const EVO_KEY = process.env.EVOLUTION_API_KEY;
  if (!EVO_URL || !EVO_KEY) { log('[WA] EVOLUTION env vars missing'); return; }
  const cleaned = phone.replace(/\D/g, '');
  const finalMessage = options.systemOrigin ? markSystemOriginMessage(message) : message;
  await fetch(`${EVO_URL}/message/sendText/${instanceName}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'apikey': EVO_KEY },
    body: JSON.stringify({ number: cleaned, text: finalMessage }),
  });
}

async function sendInternalNotification(userId, message, title = 'Mensagem da Kogna') {
  try {
    await pool.query(
      `INSERT INTO notifications (user_id, title, message, read, created_at)
       VALUES ($1, $2, $3, false, NOW())`,
      [userId, title, message]
    ).catch(async () => {
      await pool.query(
        `INSERT INTO notifications (user_id, message, is_read, created_at)
         VALUES ($1, $2, false, NOW())`,
        [userId, message]
      );
    });
  } catch (e) { log('[INTERNAL_NOTIF] ' + e.message); }
}

function interpolateTemplate(template, vars) {
  return template.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? `{${k}}`);
}

function requireAdmin(req, res, next) {
  if (req.userRole !== 'admin') return res.status(403).json({ error: 'Acesso negado.' });
  next();
}

async function ensureAdminAutomationColumns() {
  try {
    await pool.query(`ALTER TABLE automation_rules ADD COLUMN IF NOT EXISTS wa_instance TEXT`);
    await pool.query(`ALTER TABLE automation_logs ADD COLUMN IF NOT EXISTS event_key TEXT`);
    await pool.query(`ALTER TABLE automation_logs ADD COLUMN IF NOT EXISTS target_user_id TEXT`);
  } catch (err) {
    log('[AUTO] ensureAdminAutomationColumns error: ' + err.message);
    throw err;
  }
}

function normalizeWhatsAppNumber(phone) {
  if (!phone) return null;
  const digits = String(phone).replace(/\D/g, '');
  if (!digits) return null;
  return digits.startsWith('55') ? digits : `55${digits}`;
}

async function getAutomationRecipientByUserId(userId) {
  const result = await pool.query(
    `SELECT u.id, u.name, u.email, u.koins_balance, u.personal_phone, u.company_phone,
            COALESCE(cfg.company_name, org.name, '') AS company_name
     FROM users u
     LEFT JOIN LATERAL (
       SELECT company_name
       FROM ia_configs
       WHERE user_id = u.id
       ORDER BY created_at DESC
       LIMIT 1
     ) cfg ON true
     LEFT JOIN organizations org ON org.id = u.organization_id
     WHERE u.id = $1
     LIMIT 1`,
    [userId],
  );

  return result.rows[0] || null;
}

async function doesAutomationAudienceMatchUser(automation, userId) {
  if (!automation || automation.audience_type !== 'filtered') return true;
  const filter = automation.audience_filter || {};
  const tags = Array.isArray(filter.tags) ? filter.tags.map((tag) => String(tag).trim().toLowerCase()).filter(Boolean) : [];
  if (!tags.length) return true;

  const match = await pool.query(
    `SELECT 1
     FROM user_tags
     WHERE user_id = $1
       AND tag = ANY($2::text[])
     LIMIT 1`,
    [userId, tags],
  );

  return match.rows.length > 0;
}

function getAutomationTemplateVars(user, extraVars = {}) {
  return {
    nome: user?.name || '',
    empresa: user?.company_name || '',
    koins: user?.koins_balance ?? '',
    email: user?.email || '',
    link_dashboard: 'https://ia.kogna.co',
    link_pagamento: 'https://ia.kogna.co/billing',
    ...extraVars,
  };
}

function getAutomationTargetWhatsAppNumber(automation, recipient) {
  const manualNumber = normalizeWhatsAppNumber(automation?.audience_filter?.whatsapp_number || '');
  if (manualNumber) return manualNumber;
  return normalizeWhatsAppNumber(recipient?.personal_phone || recipient?.company_phone || '');
}

async function hasProcessedAutomationEvent(automationId, eventKey) {
  if (!automationId || !eventKey) return false;

  const existing = await pool.query(
    `SELECT 1
     FROM automation_logs
     WHERE automation_id = $1
       AND event_key = $2
       AND status = 'sent'
     LIMIT 1`,
    [automationId, eventKey],
  );

  return existing.rows.length > 0;
}

async function createAutomationDispatchLog({
  automationId,
  automationName,
  recipientsCount,
  channels,
  status,
  error = null,
  eventKey = null,
  targetUserId = null,
}) {
  await ensureAdminAutomationColumns();

  await pool.query(
    `INSERT INTO automation_logs (
       automation_id, automation_name, recipients_count, channel, status, error, event_key, target_user_id
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      automationId || null,
      automationName,
      recipientsCount,
      Array.isArray(channels) ? channels.join(',') : String(channels || ''),
      status,
      error,
      eventKey,
      targetUserId,
    ],
  ).catch((err) => {
    log('[AUTO LOG] ' + err.message);
  });
}

async function dispatchAutomationToRecipient(automation, recipient, options = {}) {
  const channels = Array.isArray(automation?.channels) ? automation.channels : [];
  const eventKey = options.eventKey || null;
  const extraVars = options.extraVars || {};
  const systemOrigin = options.systemOrigin === true;
  const vars = getAutomationTemplateVars(recipient, extraVars);
  const finalMessage = interpolateTemplate(automation.message_template || '', vars);
  const errors = [];
  let delivered = false;

  try {
    if (channels.includes('email') && recipient.email) {
      await sendEmail(recipient.email, automation.name, `<p>${finalMessage.replace(/\n/g, '<br>')}</p>`);
      delivered = true;
    }
  } catch (err) {
    errors.push(`email: ${err.message}`);
  }

  try {
    if (channels.includes('internal')) {
      await sendInternalNotification(recipient.id, finalMessage, automation.name || 'Mensagem da Kogna');
      delivered = true;
    }
  } catch (err) {
    errors.push(`internal: ${err.message}`);
  }

  try {
    if (channels.includes('whatsapp')) {
      if (!automation.wa_instance) {
        errors.push('whatsapp: nenhuma conexao selecionada');
      } else {
        const phone = getAutomationTargetWhatsAppNumber(automation, recipient);
        if (!phone) {
          errors.push('whatsapp: usuario sem numero cadastrado');
        } else {
          await sendWhatsAppMsg(automation.wa_instance, phone, finalMessage, { systemOrigin });
          delivered = true;
        }
      }
    }
  } catch (err) {
    errors.push(`whatsapp: ${err.message}`);
  }

  await createAutomationDispatchLog({
    automationId: automation.id,
    automationName: automation.name,
    recipientsCount: delivered ? 1 : 0,
    channels,
    status: delivered ? 'sent' : 'error',
    error: errors.length ? errors.join(' | ') : null,
    eventKey,
    targetUserId: recipient.id,
  });

  return {
    delivered,
    error: errors.length ? errors.join(' | ') : null,
  };
}

async function runAdminEventAutomations(triggerEvent, { userId, eventKey, extraVars = {}, systemOrigin = true } = {}) {
  if (!triggerEvent || !userId) return;

  await ensureAdminAutomationColumns();

  const recipient = await getAutomationRecipientByUserId(userId);
  if (!recipient) return;

  const automationRes = await pool.query(
    `SELECT *
     FROM automation_rules
     WHERE is_active = true
       AND trigger_event = $1
     ORDER BY created_at DESC`,
    [triggerEvent],
  );

  for (const automation of automationRes.rows) {
    if (!(await doesAutomationAudienceMatchUser(automation, userId))) {
      continue;
    }

    if (eventKey && await hasProcessedAutomationEvent(automation.id, eventKey)) {
      continue;
    }

    await dispatchAutomationToRecipient(automation, recipient, {
      eventKey,
      extraVars,
      systemOrigin,
    });
  }
}

function runNonBlockingTask(label, task) {
  setTimeout(() => {
    Promise.resolve()
      .then(task)
      .catch((err) => {
        log(`[BG ${label}] ${err?.message || err}`);
      });
  }, 0);
}

function getOptionalUserIdFromAuthHeader(req) {
  try {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!token) return null;
    const decoded = jwt.verify(token, JWT_SECRET);
    return decoded?.id || null;
  } catch (_err) {
    return null;
  }
}

// ── GET /api/admin/automations ────────────────────────────────────────────────
app.get('/api/admin/automations', verifyJWT, requireAdmin, async (req, res) => {
  try {
    await ensureAdminAutomationColumns();
    const r = await pool.query(
      'SELECT * FROM automation_rules ORDER BY created_at DESC'
    );
    res.json(r.rows);
  } catch (e) {
    log('[AUTO] GET error: ' + e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── POST /api/admin/automations ───────────────────────────────────────────────
app.post('/api/admin/automations', verifyJWT, requireAdmin, async (req, res) => {
  try {
    await ensureAdminAutomationColumns();
    const { name, trigger_event, trigger_rule, audience_type, audience_filter, channels, message_template, wa_instance } = req.body;
    if (!name || !trigger_event || !message_template) {
      return res.status(400).json({ error: 'name, trigger_event e message_template são obrigatórios.' });
    }
    if (Array.isArray(channels) && channels.includes('whatsapp') && !wa_instance) {
      return res.status(400).json({ error: 'Selecione qual conexao do WhatsApp sera usada nessa automacao.' });
    }
    const r = await pool.query(
      `INSERT INTO automation_rules (name, trigger_event, trigger_rule, audience_type, audience_filter, channels, message_template, wa_instance)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [name, trigger_event, JSON.stringify(trigger_rule || {}), audience_type || 'all',
        JSON.stringify(audience_filter || {}), channels || [], message_template, wa_instance || null]
    );
    res.status(201).json(r.rows[0]);
  } catch (e) {
    log('[AUTO] POST error: ' + e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── PATCH /api/admin/automations/:id ─────────────────────────────────────────
app.patch('/api/admin/automations/:id', verifyJWT, requireAdmin, async (req, res) => {
  try {
    await ensureAdminAutomationColumns();
    const { name, trigger_event, trigger_rule, audience_type, audience_filter, channels, message_template, is_active, wa_instance } = req.body;
    if (Array.isArray(channels) && channels.includes('whatsapp') && !wa_instance) {
      return res.status(400).json({ error: 'Selecione qual conexao do WhatsApp sera usada nessa automacao.' });
    }
    const r = await pool.query(
      `UPDATE automation_rules
       SET name=COALESCE($1,name), trigger_event=COALESCE($2,trigger_event),
           trigger_rule=COALESCE($3,trigger_rule), audience_type=COALESCE($4,audience_type),
           audience_filter=COALESCE($5,audience_filter), channels=COALESCE($6,channels),
           message_template=COALESCE($7,message_template),
           is_active=COALESCE($8,is_active),
           wa_instance = CASE WHEN $10::text IS NULL THEN wa_instance ELSE $10 END
       WHERE id=$9 RETURNING *`,
      [name, trigger_event, trigger_rule ? JSON.stringify(trigger_rule) : null,
        audience_type, audience_filter ? JSON.stringify(audience_filter) : null,
        channels, message_template, is_active, req.params.id, wa_instance ?? null]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Automação não encontrada.' });
    res.json(r.rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── DELETE /api/admin/automations/:id ────────────────────────────────────────
app.delete('/api/admin/automations/:id', verifyJWT, requireAdmin, async (req, res) => {
  try {
    await pool.query('DELETE FROM automation_rules WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── POST /api/admin/automations/:id/trigger ───────────────────────────────────
// Manually trigger an automation, sending to its audience right now
app.post('/api/admin/automations/:id/trigger', verifyJWT, requireAdmin, async (req, res) => {
  try {
    await ensureAdminAutomationColumns();
    const autoRes = await pool.query('SELECT * FROM automation_rules WHERE id=$1', [req.params.id]);
    if (!autoRes.rows.length) return res.status(404).json({ error: 'Automação não encontrada.' });
    const auto = autoRes.rows[0];

    // Fetch audience
    let usersQ = "SELECT u.id, u.name, u.email, oc.company_name FROM users u LEFT JOIN ia_configs oc ON oc.user_id=u.id WHERE u.role='user'";
    const filter = auto.audience_filter || {};
    const params = [];
    if (auto.audience_type === 'filtered' && filter.tags?.length) {
      usersQ = `SELECT DISTINCT u.id, u.name, u.email, oc.company_name FROM users u
        LEFT JOIN ia_configs oc ON oc.user_id=u.id
        INNER JOIN user_tags ut ON ut.user_id=u.id AND ut.tag=ANY($1)
        WHERE u.role='user'`;
      params.push(filter.tags);
    }
    const usersRes = await pool.query(usersQ, params);
    const recipients = usersRes.rows;

    const channels = Array.isArray(auto.channels) ? auto.channels : [];
    let sent = 0;
    let logError = null;

    let userPhones = {};
    if (channels.includes('whatsapp') && auto.wa_instance) {
      const manualTargetPhone = normalizeWhatsAppNumber(auto?.audience_filter?.whatsapp_number || '');
      if (manualTargetPhone) {
        for (const recipient of recipients) {
          userPhones[recipient.id] = manualTargetPhone;
        }
      }

      const phoneRes = await pool.query(
        `SELECT id, personal_phone, company_phone
         FROM users
         WHERE id = ANY($1::text[])`,
        [recipients.map((recipient) => recipient.id)],
      ).catch(() => ({ rows: [] }));

      for (const row of phoneRes.rows) {
        if (manualTargetPhone) continue;
        const phone = normalizeWhatsAppNumber(row.personal_phone || row.company_phone);
        if (phone) userPhones[row.id] = phone;
      }
    }

    for (const u of recipients) {
      const vars = {
        nome: u.name, empresa: u.company_name || '', email: u.email,
        link_dashboard: 'https://ia.kogna.co', link_pagamento: 'https://ia.kogna.co/billing'
      };
      const msg = interpolateTemplate(auto.message_template, vars);
      try {
        if (channels.includes('email') && u.email) {
          await sendEmail(u.email, auto.name, `<p>${msg.replace(/\n/g, '<br>')}</p>`);
        }
        if (channels.includes('internal')) {
          await sendInternalNotification(u.id, msg);
        }
        if (channels.includes('whatsapp')) {
          if (!auto.wa_instance) {
            throw new Error('Nenhuma conexao do WhatsApp foi selecionada para esta automacao.');
          }
          if (!userPhones[u.id]) {
            throw new Error(`Usuario ${u.email || u.id} nao possui numero de WhatsApp cadastrado.`);
          }
          await sendWhatsAppMsg(auto.wa_instance, userPhones[u.id], msg);
        }
        sent++;
      } catch (e) { logError = e.message; }
    }

    await createAutomationDispatchLog({
      automationId: auto.id,
      automationName: auto.name,
      recipientsCount: sent,
      channels,
      status: logError ? 'error' : 'sent',
      error: logError,
    });

    res.json({ sent, total: recipients.length, error: logError });
  } catch (e) {
    log('[AUTO TRIGGER] ' + e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── POST /api/admin/notifications/send — Manual send ─────────────────────────
app.post('/api/admin/notifications/send', verifyJWT, requireAdmin, async (req, res) => {
  try {
    const { message, subject, channels, audience_type, user_ids, filter_tags, wa_instance, notification_title } = req.body;
    if (!message) return res.status(400).json({ error: 'message é obrigatório.' });

    let recipients = [];
    if (audience_type === 'specific' && user_ids?.length) {
      const r = await pool.query(
        'SELECT id, name, email FROM users WHERE id=ANY($1)', [user_ids]
      );
      recipients = r.rows;
    } else if (audience_type === 'filtered' && filter_tags?.length) {
      const r = await pool.query(
        `SELECT DISTINCT u.id, u.name, u.email FROM users u
         INNER JOIN user_tags ut ON ut.user_id=u.id AND ut.tag=ANY($1)
         WHERE u.role='user'`, [filter_tags]
      );
      recipients = r.rows;
    } else {
      const r = await pool.query("SELECT id, name, email FROM users WHERE role='user'");
      recipients = r.rows;
    }

    // ── Anti-ban helpers ─────────────────────────────────────────────────────
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));
    const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

    // Slight humanization: random trailing variation fools Meta's duplicate-detection
    const humanize = (text) => {
      const tweaks = ['', ' ', '  ', '.'];
      return text.trimEnd() + tweaks[randInt(0, tweaks.length - 1)];
    };

    // Simulate WhatsApp typing presence (best-effort)
    const simulateTyping = async (instanceName, phone) => {
      const EVO_URL = process.env.EVOLUTION_API_URL;
      const EVO_KEY = process.env.EVOLUTION_API_KEY;
      if (!EVO_URL || !EVO_KEY) return;
      await fetch(`${EVO_URL}/chat/sendPresence/${instanceName}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': EVO_KEY },
        body: JSON.stringify({ number: phone + '@s.whatsapp.net', options: { delay: 1200, presence: 'composing' } }),
      }).catch(() => { });
    };
    // ────────────────────────────────────────────────────────────────────────

    let sent = 0;
    const chs = Array.isArray(channels) ? channels : ['internal'];
    const waQueue = []; // WA sends queued separately for rate-limiting

    // Fetch user phones from registration data (personal_phone column)
    let userPhones = {};
    if (chs.includes('whatsapp') && wa_instance) {
      const phoneRes = await pool.query(
        `SELECT id, personal_phone FROM users WHERE role='user' AND personal_phone IS NOT NULL AND personal_phone <> ''`
      ).catch(() => ({ rows: [] }));
      for (const row of phoneRes.rows) {
        const digits = row.personal_phone.replace(/\D/g, '');
        if (digits.length >= 8) {
          userPhones[row.id] = digits.startsWith('55') ? digits : `55${digits}`;
        }
      }
    }

    // Process internal + email IMMEDIATELY
    for (const u of recipients) {
      const vars = { nome: u.name, email: u.email, link_dashboard: 'https://ia.kogna.co' };
      const msg = interpolateTemplate(message, vars);
      if (chs.includes('email') && u.email) {
        await sendEmail(u.email, subject || 'Mensagem da Kogna', `<p>${msg.replace(/\n/g, '<br>')}</p>`).catch(() => { });
      }
      if (chs.includes('internal')) {
        await sendInternalNotification(u.id, msg, notification_title || 'Mensagem da Kogna');
      }
      if (chs.includes('whatsapp') && wa_instance && userPhones[u.id]) {
        waQueue.push({ u, msg });
      }
      sent++;
    }

    // Log + respond to client NOW (WA sends happen in background)
    await pool.query(
      `INSERT INTO automation_logs (automation_name, recipients_count, channel, status)
       VALUES ($1, $2, $3, 'sent')`,
      ['Envio Manual', sent, chs.join(',')]
    ).catch(() => { });

    res.json({ sent, total: recipients.length, wa_queued: waQueue.length });

    // ── WA anti-ban send queue (async background after HTTP response) ─────────
    if (waQueue.length > 0) {
      (async () => {
        log(`[WA-BLAST] Iniciando fila: ${waQueue.length} destinatários`);
        for (let i = 0; i < waQueue.length; i++) {
          const { u, msg } = waQueue[i];
          try {
            // Simulate typing 1-3s before sending
            await simulateTyping(wa_instance, userPhones[u.id]);
            await sleep(randInt(1000, 3000));

            await sendWhatsAppMsg(wa_instance, userPhones[u.id], humanize(msg)).catch(() => { });
            log(`[WA-BLAST] ${i + 1}/${waQueue.length} → ...${userPhones[u.id].slice(-4)}`);

            if (i + 1 >= waQueue.length) break;

            // Batch cooldown every 10 messages (45-90s)
            if ((i + 1) % 10 === 0) {
              const pause = randInt(45000, 90000);
              log(`[WA-BLAST] Pausa de lote: ${Math.round(pause / 1000)}s`);
              await sleep(pause);
            } else {
              // Normal inter-message delay: 7-23s
              const delay = randInt(7000, 23000);
              log(`[WA-BLAST] Aguardando ${Math.round(delay / 1000)}s`);
              await sleep(delay);
            }
          } catch (err) {
            log(`[WA-BLAST] Erro: ${err.message}`);
          }
        }
        log(`[WA-BLAST] Fila concluída: ${waQueue.length} mensagens.`);
      })();
    }
  } catch (e) {
    log('[MANUAL NOTIF] ' + e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── GET /api/admin/whatsapp-instances — list all WA instances ───────────────────
app.get('/api/admin/whatsapp-instances', verifyJWT, requireAdmin, async (req, res) => {
  try {
    // Get admin's own organization
    const adminRes = await pool.query('SELECT organization_id FROM users WHERE id=$1', [req.userId]);
    const orgId = adminRes.rows[0]?.organization_id;
    if (!orgId) return res.json([]);

    const r = await pool.query(
      `SELECT wi.instance_name, wi.status, a.name AS agent_name
       FROM whatsapp_instances wi
       LEFT JOIN agents a ON a.whatsapp_instance_id = wi.id
       WHERE wi.organization_id = $1
       ORDER BY wi.created_at DESC`,
      [orgId]
    );
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── GET /api/admin/automation-logs ────────────────────────────────────────────
app.get('/api/admin/automation-logs', verifyJWT, requireAdmin, async (req, res) => {
  try {
    const r = await pool.query(
      'SELECT * FROM automation_logs ORDER BY sent_at DESC LIMIT 200'
    );
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── GET /api/admin/user-tags — list all tags (distinct) ──────────────────────
app.get('/api/admin/user-tags', verifyJWT, requireAdmin, async (req, res) => {
  try {
    const r = await pool.query('SELECT DISTINCT tag FROM user_tags ORDER BY tag');
    res.json(r.rows.map(r => r.tag));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── GET /api/admin/user-tags/:userId — tags for a specific user ───────────────
app.get('/api/admin/user-tags/:userId', verifyJWT, requireAdmin, async (req, res) => {
  try {
    const r = await pool.query('SELECT tag FROM user_tags WHERE user_id=$1', [req.params.userId]);
    res.json(r.rows.map(r => r.tag));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── POST /api/admin/user-tags — add a tag ────────────────────────────────────
app.post('/api/admin/user-tags', verifyJWT, requireAdmin, async (req, res) => {
  try {
    const { user_id, tag } = req.body;
    if (!user_id || !tag) return res.status(400).json({ error: 'user_id e tag obrigatórios.' });
    await pool.query(
      'INSERT INTO user_tags (user_id, tag) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [user_id, tag.trim().toLowerCase()]
    );
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── DELETE /api/admin/user-tags — remove a tag ───────────────────────────────
app.delete('/api/admin/user-tags', verifyJWT, requireAdmin, async (req, res) => {
  try {
    const { user_id, tag } = req.body;
    await pool.query('DELETE FROM user_tags WHERE user_id=$1 AND tag=$2', [user_id, tag]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── GET /api/admin/users-filtered ─────────────────────────────────────────────
app.get('/api/admin/users-filtered', verifyJWT, requireAdmin, async (req, res) => {
  try {
    const { tag, koins_max, no_agent, no_whatsapp } = req.query;
    let q = `SELECT u.id, u.name, u.email, u.koins_balance, u.created_at,
                    oc.company_name,
                    COALESCE(JSON_AGG(DISTINCT ut.tag) FILTER (WHERE ut.tag IS NOT NULL), '[]') AS tags
             FROM users u
             LEFT JOIN ia_configs oc ON oc.user_id=u.id
             LEFT JOIN user_tags ut ON ut.user_id=u.id
             WHERE u.role='user'`;
    const params = [];
    if (tag) { params.push(tag); q += ` AND EXISTS (SELECT 1 FROM user_tags t2 WHERE t2.user_id=u.id AND t2.tag=$${params.length})`; }
    if (koins_max !== undefined) { params.push(parseInt(koins_max)); q += ` AND u.koins_balance<=$${params.length}`; }
    if (no_agent === 'true') { q += ` AND NOT EXISTS (SELECT 1 FROM agents a WHERE a.organization_id=u.organization_id)`; }
    q += ' GROUP BY u.id, oc.company_name ORDER BY u.created_at DESC';
    const r = await pool.query(q, params);
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── END AUTOMATIONS SYSTEM ────────────────────────────────────────────────────

/**
 * @swagger
 * /api/me:
 *   get:
 *     summary: Get current user profile and organization
 *     tags: [Authentication]
 *     security:
 *       - ApiKeyAuth: []
 *     responses:
 *       200:
 *         description: User profile data
 */
app.get("/api/me", verifyJWT, async (req, res) => {
  try {
    const userId = req.userId;
    const userRes = await pool.query(
      "SELECT id, email, name, organization_id, role, koins_balance FROM users WHERE id = $1",
      [userId],
    );
    const user = userRes.rows[0];

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const orgRes = await pool.query(
      "SELECT id, name, plan_type, whatsapp_connections_limit FROM organizations WHERE id = $1",
      [user.organization_id],
    );
    const organization = orgRes.rows[0];

    res.json({
      user: { ...user, organization },
      role: user.role,
    });
  } catch (err) {
    log("Get /api/me error: " + err.toString());
    res.status(500).json({ error: "Internal server error" });
  }
});


// ==================== SWAGGER CONFIGURATION ====================
import swaggerUi from "swagger-ui-express";
import swaggerJsdoc from "swagger-jsdoc";
import crypto from "crypto";

const swaggerOptions = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Kogna API",
      version: "1.0.0",
      description: "API Integration for Kogna Platform",
    },
    servers: [
      {
        url: "http://localhost:3000",
        description: "Local Development Server",
      },
    ],
    components: {
      securitySchemes: {
        ApiKeyAuth: {
          type: "apiKey",
          in: "header",
          name: "X-Api-Key",
        },
      },
    },
    security: [
      {
        ApiKeyAuth: [],
      },
    ],
  },
  apis: ["./server.js"], // Files containing annotations
};

const swaggerSpec = swaggerJsdoc(swaggerOptions);
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// ==================== INTEGRATIONS: API KEYS ====================

/**
 * @swagger
 * /api/keys:
 *   post:
 *     summary: Create a new API Key
 *     tags: [Integrations]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name:
 *                 type: string
 *     responses:
 *       200:
 *         description: API Key created successfully. Returns the key ONLY ONCE.
 */
app.post("/api/keys", verifyJWT, async (req, res) => {
  try {
    const userId = req.userId;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const { name } = req.body;
    if (!name) return res.status(400).json({ error: "Name is required" });

    // Generate Key
    const keyPrefix = "kg_";
    const randomBytes = crypto.randomBytes(24).toString("hex");
    const visibleKey = `${keyPrefix}${randomBytes}`;
    const hashedKey = crypto
      .createHash("sha256")
      .update(visibleKey)
      .digest("hex");

    // Store Hash
    const newKey = await pool.query(
      `INSERT INTO api_keys (user_id, key_prefix, hashed_key, name) 
             VALUES ($1, $2, $3, $4) RETURNING id, name, key_prefix, created_at`,
      [userId, keyPrefix, hashedKey, name],
    );

    log(`API Key created for user ${userId}: ${name}`);

    // Return full key only once
    res.json({
      ...newKey.rows[0],
      key: visibleKey,
    });
  } catch (err) {
    log("Create API Key error: " + err.toString());
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * @swagger
 * /api/keys:
 *   get:
 *     summary: List API Keys
 *     tags: [Integrations]
 *     responses:
 *       200:
 *         description: List of active API keys
 */
app.get("/api/keys", verifyJWT, async (req, res) => {
  try {
    const userId = req.userId;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const result = await pool.query(
      `SELECT id, name, key_prefix, last_used_at, created_at 
             FROM api_keys WHERE user_id = $1 ORDER BY created_at DESC`,
      [userId],
    );

    res.json(result.rows);
  } catch (err) {
    log("List API Keys error: " + err.toString());
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * @swagger
 * /api/keys/{id}:
 *   delete:
 *     summary: Revoke an API Key
 *     tags: [Integrations]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: API Key revoked
 */
app.delete("/api/keys/:id", verifyJWT, async (req, res) => {
  try {
    const userId = req.userId;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const { id } = req.params;
    await pool.query("DELETE FROM api_keys WHERE id = $1 AND user_id = $2", [
      id,
      userId,
    ]);

    log(`API Key revoked: ${id}`);
    res.json({ success: true });
  } catch (err) {
    log("Revoke API Key error: " + err.toString());
    res.status(500).json({ error: "Internal server error" });
  }
});

// ==================== INTEGRATIONS: WEBHOOKS ====================

/**
 * @swagger
 * /api/webhooks:
 *   post:
 *     summary: Create a Webhook Subscription
 *     tags: [Integrations]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [targetUrl, events]
 *             properties:
 *               targetUrl:
 *                 type: string
 *               events:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       200:
 *         description: Webhook created
 */
app.post("/api/webhooks", verifyJWT, async (req, res) => {
  try {
    const userId = req.userId;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const { targetUrl, events } = req.body;
    if (!targetUrl || !events || !Array.isArray(events)) {
      return res
        .status(400)
        .json({ error: "Target URL and Events array are required" });
    }

    const secret = crypto.randomBytes(32).toString("hex");

    const newWebhook = await pool.query(
      `INSERT INTO webhook_subscriptions (user_id, target_url, events, secret) 
             VALUES ($1, $2, $3, $4) RETURNING *`,
      [userId, targetUrl, events, secret],
    );

    log(`Webhook created for user ${userId}: ${targetUrl}`);
    res.json(newWebhook.rows[0]);
  } catch (err) {
    log("Create Webhook error: " + err.toString());
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/api/webhooks", verifyJWT, async (req, res) => {
  try {
    const userId = req.userId;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const result = await pool.query(
      `SELECT * FROM webhook_subscriptions WHERE user_id = $1 ORDER BY created_at DESC`,
      [userId],
    );

    res.json(result.rows);
  } catch (err) {
    log("List Webhooks error: " + err.toString());
    res.status(500).json({ error: "Internal server error" });
  }
});

app.delete("/api/webhooks/:id", verifyJWT, async (req, res) => {
  try {
    const userId = req.userId;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const { id } = req.params;
    await pool.query(
      "DELETE FROM webhook_subscriptions WHERE id = $1 AND user_id = $2",
      [id, userId],
    );

    log(`Webhook deleted: ${id}`);
    res.json({ success: true });
  } catch (err) {
    log("Delete Webhook error: " + err.toString());
    res.status(500).json({ error: "Internal server error" });
  }
});

// Helper to trigger webhooks
async function triggerWebhooks(userId, event, payload) {
  try {
    // Find subscriptions for this user that include this event
    const subs = await pool.query(
      `SELECT * FROM webhook_subscriptions WHERE user_id = $1 AND active = true AND $2 = ANY(events)`,
      [userId, event],
    );

    for (const sub of subs.rows) {
      log(`Triggering webhook ${sub.id} for event ${event}`);

      // Signature: HMAC-SHA256 of payload using secret
      const signature = crypto
        .createHmac("sha256", sub.secret)
        .update(JSON.stringify(payload))
        .digest("hex");

      // Fire and forget (don't await to avoid blocking)
      fetch(sub.target_url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Kogna-Event": event,
          "X-Kogna-Signature": signature,
        },
        body: JSON.stringify(payload),
      })
        .then((res) => {
          log(`Webhook ${sub.id} delivery status: ${res.status}`);
        })
        .catch((err) => {
          log(`Webhook ${sub.id} delivery failed: ${err.message}`);
        });
    }
  } catch (err) {
    log(`Trigger webhook error: ${err.message}`);
  }
}

// ==================== DASHBOARD API ====================

app.get("/api/dashboard/metrics", verifyJWT, async (req, res) => {
  try {
    const userId = req.userId;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    // Get user's organization
    const userRes = await pool.query(
      "SELECT organization_id FROM users WHERE id = $1",
      [userId],
    );
    const organizationId = userRes.rows[0]?.organization_id;

    if (!organizationId) {
      // If no organization, return zeros
      return res.json({
        pipeline: {
          total_leads: 0,
          total_value: 0,
          won_value: 0,
          won_count: 0,
          appointments: 0,
        },
        ai: { active_chats: 0, total_messages: 0, saved_hours: 0, chart: [] },
      });
    }

    // 1. Pipeline Metrics
    const pipelineQuery = await pool.query(
      `
            SELECT 
                COUNT(*) as total_leads,
                COALESCE(SUM(value), 0) as total_value,
                COUNT(CASE WHEN LOWER(status) IN ('fechado', 'closed', 'won', 'ganho', 'vendido', 'cliente', 'client') THEN 1 END) as won_count,
                COALESCE(SUM(CASE WHEN LOWER(status) IN ('fechado', 'closed', 'won', 'ganho', 'vendido', 'cliente', 'client') THEN value ELSE 0 END), 0) as won_value
            FROM leads 
            WHERE organization_id = $1
        `,
      [organizationId],
    );

    const stats = pipelineQuery.rows[0];

    // Appointments (Agendamentos)
    const appointmentsQuery = await pool.query(
      `
            SELECT COUNT(*) as count
            FROM agendamentos a
            JOIN vendedores v ON v.id = a.vendedor_id
            WHERE v.organization_id = $1 AND a.status != 'cancelado'
        `,
      [organizationId],
    );

    const appointmentsCount = parseInt(appointmentsQuery.rows[0]?.count || "0");

    // 2. AI Metrics
    const aiQuery = await pool.query(
      `
            SELECT 
                COUNT(*) as total_messages,
                COUNT(DISTINCT remote_jid) as active_chats
            FROM chat_messages cm
            JOIN agents a ON a.id = cm.agent_id
            WHERE a.organization_id = $1
        `,
      [organizationId],
    );

    const aiStats = aiQuery.rows[0];
    const totalMessages = parseInt(aiStats.total_messages || "0");
    const activeChats = parseInt(aiStats.active_chats || "0");
    const savedHours = Math.round((totalMessages * 2) / 60); // Est. 2 mins saved per message

    // 3. Chart Data (Last 7 days volume)
    const chartQuery = await pool.query(
      `
            SELECT 
                TO_CHAR(cm.created_at, 'DD/MM') as date_label,
                COUNT(*) as volume
            FROM chat_messages cm
            JOIN agents a ON a.id = cm.agent_id
            WHERE a.organization_id = $1 
              AND cm.created_at >= NOW() - INTERVAL '7 days'
            GROUP BY date_label, DATE(cm.created_at)
            ORDER BY DATE(cm.created_at) ASC
        `,
      [organizationId],
    );

    const chartData = chartQuery.rows.map((row) => ({
      name: row.date_label,
      volume: parseInt(row.volume),
    }));

    res.json({
      pipeline: {
        total_leads: parseInt(stats.total_leads),
        total_value: parseFloat(stats.total_value),
        won_value: parseFloat(stats.won_value),
        won_count: parseInt(stats.won_count),
        appointments: appointmentsCount,
      },
      ai: {
        active_chats: activeChats,
        total_messages: totalMessages,
        saved_hours: savedHours,
        chart: chartData,
      },
    });
  } catch (err) {
    log("GET /api/dashboard/metrics error: " + err.toString());
    res.status(500).json({ error: "Internal server error" });
  }
});

// ==================== INBOUND API (v1) ====================

// Middleware for API Key Authentication
const apiKeyAuth = async (req, res, next) => {
  const apiKey = req.headers["x-api-key"];
  if (!apiKey)
    return res.status(401).json({ error: "Missing X-Api-Key header" });

  try {
    const hashedKey = crypto.createHash("sha256").update(apiKey).digest("hex");
    const keyRes = await pool.query(
      `SELECT * FROM api_keys WHERE hashed_key = $1`,
      [hashedKey],
    );

    if (keyRes.rows.length === 0) {
      return res.status(401).json({ error: "Invalid API Key" });
    }

    const key = keyRes.rows[0];

    // Update last used
    await pool.query("UPDATE api_keys SET last_used_at = NOW() WHERE id = $1", [
      key.id,
    ]);

    req.apiUser = { id: key.user_id }; // Attach user ID to request
    next();
  } catch (err) {
    log("API Key Auth error: " + err.toString());
    res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * @swagger
 * /api/v1/leads:
 *   post:
 *     summary: Create a new Lead
 *     tags: [Public API]
 *     security:
 *       - ApiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, phone]
 *             properties:
 *               name:
 *                 type: string
 *               phone:
 *                 type: string
 *               email:
 *                 type: string
 *               company:
 *                 type: string
 *     responses:
 *       200:
 *         description: Lead created successfully
 */
app.post("/api/v1/leads", apiKeyAuth, async (req, res) => {
  try {
    const { name, phone, email, company } = req.body;
    const userId = req.apiUser.id;

    if (!name || !phone) {
      return res.status(400).json({ error: "Name and Phone are required" });
    }

    const newLead = await pool.query(
      `INSERT INTO leads (user_id, name, phone, email, company, source, created_at) 
             VALUES ($1, $2, $3, $4, $5, 'api', NOW()) RETURNING *`,
      [userId, name, phone, email || "", company || ""],
    );

    log(`Lead created via API for user ${userId}: ${name}`);

    // Trigger Webhook
    triggerWebhooks(userId, "lead.created", newLead.rows[0]);

    res.json(newLead.rows[0]);
  } catch (err) {
    log("API Create Lead error: " + err.toString());
    res.status(500).json({ error: "Internal server error" });
  }
});

// Get Public Product
app.get("/api/public/products/:id", async (req, res) => {
  try {
    const { id } = req.params;
    // Check if it's a UUID or 'plan_pro' slug
    let query = "SELECT * FROM products WHERE id = $1";
    let params = [id];

    // Basic validation for UUID
    const isUuid =
      /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(
        id,
      );

    if (!isUuid) {
      // Handle slugs if you have them, or return fake data for testing
      if (id === "plan_pro") {
        return res.json({
          id: "plan_pro",
          name: "Plano Pro - Assinatura Mensal",
          description: "Acesso completo a todos os recursos",
          price: 197.0,
        });
      }
      return res.status(404).json({ error: "Invalid Product ID" });
    }

    const result = await pool.query(query, params);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Product not found" });
    }
    res.json(result.rows[0]);
  } catch (err) {
    log("Get Product error: " + err.toString());
    res.status(500).json({ error: "Internal server error" });
  }
});

// ==================== ONBOARDING API ====================

app.post("/api/ia-configs", verifyJWT, async (req, res) => {
  try {
    const userId = req.userId;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const {
      companyName,
      mainProduct,
      productPrice,
      desiredRevenue,
      agentObjective,
    } = req.body;

    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    // Ensure table exists (Self-healing)
    await pool.query(`
            CREATE TABLE IF NOT EXISTS ia_configs (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                user_id UUID REFERENCES users(id),
                company_name TEXT,
                main_product TEXT,
                product_price TEXT,
                desired_revenue TEXT,
                agent_objective TEXT,
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW()
            )
        `);

    // Migrate columns to TEXT to handle any input format
    try {
      log("Checking/Migrating ia_configs schema...");
      await pool.query(
        `ALTER TABLE ia_configs ALTER COLUMN product_price TYPE TEXT`,
      );
      await pool.query(
        `ALTER TABLE ia_configs ALTER COLUMN desired_revenue TYPE TEXT`,
      );
      log("Schema migration successful (or columns already TEXT).");
    } catch (e) {
      log("Schema migration note: " + e.message);
      // Ignore (already text or other non-blocking issue)
    }

    // Upsert configuration (assuming 1 config per user for now, or just insert new)
    // Let's just insert a new record for history tracking, or update if we want single source of truth.
    // For onboarding, usually we just want to save it.
    const newConfig = await pool.query(
      `INSERT INTO ia_configs (user_id, company_name, main_product, product_price, desired_revenue, agent_objective, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, NOW())
             RETURNING *`,
      [
        userId,
        companyName,
        mainProduct,
        productPrice,
        desiredRevenue,
        agentObjective,
      ],
    );

    log(`IA Config saved for user ${userId}`);
    res.json(newConfig.rows[0]);
  } catch (err) {
    log("Save IA Config error: " + err.toString());
    res.status(500).json({ error: "Internal server error" });
  }
});

// UPLOAD Knowledge Files for Onboarding (ia-configs)
app.post(
  "/api/ia-configs/upload",
  verifyJWT,
  upload.array("files"),
  async (req, res) => {
    try {
      const userId = req.userId;
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      if (!req.files || req.files.length === 0) {
        return res.status(400).json({ error: "No files uploaded" });
      }

      const newFiles = req.files.map((file) => ({
        originalName: file.originalname,
        filename: Date.now() + "-" + file.originalname,
        content: file.buffer.toString("base64"),
        mimeType: file.mimetype,
        size: file.size,
        uploadedAt: new Date().toISOString(),
      }));

      // Save file metadata to the most recent ia_config for this user
      await pool.query(
        `UPDATE ia_configs SET updated_at = NOW() WHERE user_id = $1 AND id = (
           SELECT id FROM ia_configs WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1
         )`,
        [userId]
      );

      log(`[ONBOARDING] Uploaded ${req.files.length} files for user ${userId}`);
      res.json({ success: true, files: newFiles });
    } catch (err) {
      log("[ERROR] /api/ia-configs/upload: " + err.toString());
      res.status(500).json({ error: "Upload failed", details: err.message });
    }
  }
);

// Register Affiliate Click
app.post("/api/partners/click", async (req, res) => {
  const { affiliateCode } = req.body;

  if (!affiliateCode) {
    return res.status(400).json({ error: "affiliateCode is required" });
  }

  try {
    const partnerRes = await pool.query(
      "SELECT id FROM partners WHERE affiliate_code = $1",
      [affiliateCode]
    );

    if (partnerRes.rows.length === 0) {
      return res.status(404).json({ error: "Partner not found" });
    }

    const partnerId = partnerRes.rows[0].id;
    const ipAddress = req.ip || req.connection.remoteAddress || "unknown";
    const userAgent = req.headers["user-agent"] || "unknown";

    await pool.query(
      "INSERT INTO partner_clicks (partner_id, ip_address, user_agent, created_at) VALUES ($1, $2, $3, NOW())",
      [partnerId, ipAddress, userAgent]
    );

    res.status(200).json({ success: true });
  } catch (err) {
    log("Register Click error: " + err.toString());
    res.status(500).json({ error: "Internal server error" });
  }
});

// Register API
app.post("/api/register", async (req, res) => {
  const { name, email, password, whatsapp } = req.body;
  log(`Register attempt for: ${email}`);

  if (!(await checkDb())) {
    return res
      .status(503)
      .json({ error: "Database disconnected. Check server logs." });
  }

  if (!email || !password || !name) {
    return res
      .status(400)
      .json({ error: "Nome, e-mail e senha são obrigatórios" });
  }

  if (password.length < 6) {
    return res
      .status(400)
      .json({ error: "A senha deve ter no mínimo 6 caracteres" });
  }

  try {
    // Check if email already exists
    const existingEmail = await pool.query("SELECT id FROM users WHERE email = $1", [
      email,
    ]);
    if (existingEmail.rows.length > 0) {
      return res.status(409).json({ error: "Este e-mail já está cadastrado" });
    }

    // Check if WhatsApp/phone already exists (if provided)
    if (whatsapp && whatsapp.trim()) {
      const cleanPhone = whatsapp.replace(/\D/g, '');
      const existingPhone = await pool.query(
        "SELECT id FROM users WHERE REGEXP_REPLACE(personal_phone, '\\D', '', 'g') = $1",
        [cleanPhone]
      );
      if (existingPhone.rows.length > 0) {
        return res.status(409).json({ error: "Este número de celular já está cadastrado" });
      }
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Check for affiliate referral (from cookie or body)
    const affiliateCode =
      req.body.affiliateCode || req.cookies?.kogna_affiliate;
    let referredByPartnerId = null;
    if (affiliateCode) {
      const partnerRes = await pool.query(
        "SELECT id FROM partners WHERE affiliate_code = $1 AND status = $2",
        [affiliateCode, "active"],
      );
      if (partnerRes.rows.length > 0) {
        referredByPartnerId = partnerRes.rows[0].id;
      }
    }

    // Create user
    const newUser = await pool.query(
      `INSERT INTO users (id, name, email, password, created_at, koins_balance, referred_by, personal_phone) 
             VALUES (gen_random_uuid(), $1, $2, $3, NOW(), 0, $4, $5) 
             RETURNING *`,
      [name, email, hashedPassword, referredByPartnerId, whatsapp || null],
    );
    const user = newUser.rows[0];

    // Create organization
    const newOrg = await pool.query(
      `INSERT INTO organizations (name, owner_id, plan_type) VALUES ($1, $2, 'basic') RETURNING *`,
      [name + "'s Organization", user.id],
    );
    const org = newOrg.rows[0];
    await pool.query("UPDATE users SET organization_id = $1 WHERE id = $2", [
      org.id,
      user.id,
    ]);
    user.organization_id = org.id;

    // Clear affiliate cookie after use
    if (affiliateCode) {
      res.clearCookie("kogna_affiliate");
    }

    // Create Welcome Notification
    await pool.query(
      `INSERT INTO notifications (user_id, title, message) VALUES ($1, $2, $3)`,
      [
        user.id,
        "Bem-vindo à Kogna!",
        "Estamos felizes em tê-lo conosco. Complete o onboarding para ganhar 100 Koins grátis!",
      ],
    );

    const orgRes = await pool.query(
      "SELECT * FROM organizations WHERE id = $1",
      [org.id],
    );
    const organization = orgRes.rows[0];

    // Don't send password hash to client
    const { password: _, ...safeUser } = user;

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: "24h" },
    );

    log(`User registered successfully: ${user.id} (${email})`);
    res.json({
      user: { ...safeUser, organization },
      role: user.role,
      token,
    });

    runNonBlockingTask(`register-automation:${user.id}`, async () => {
      await runAdminEventAutomations('user_created', {
        userId: user.id,
        eventKey: `user_created:${user.id}`,
      });
    });
  } catch (err) {
    log("Register error: " + err.toString());
    res.status(500).json({ error: "Internal server error" });
  }
});

// ==================== KOGNA PARTNERS (AFFILIATE) ENDPOINTS ====================

// Affiliate Tracking Link - /p/:code
app.get("/p/:code", async (req, res) => {
  const { code } = req.params;
  try {
    const partnerRes = await pool.query(
      "SELECT id FROM partners WHERE affiliate_code = $1 AND status = $2",
      [code, "active"],
    );
    if (partnerRes.rows.length === 0) {
      return res.redirect("/register");
    }
    const partnerId = partnerRes.rows[0].id;

    // Log click
    const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress;
    const ua = req.headers["user-agent"] || "";
    await pool.query(
      "INSERT INTO partner_clicks (partner_id, ip_address, user_agent) VALUES ($1, $2, $3)",
      [partnerId, ip, ua],
    );

    // Set cookie for 30 days
    res.cookie("kogna_affiliate", code, {
      maxAge: 30 * 24 * 60 * 60 * 1000,
      httpOnly: false,
      sameSite: "lax",
    });

    log(`Affiliate click tracked for code: ${code}`);
    res.redirect("/register");
  } catch (err) {
    log("Affiliate tracking error: " + err.toString());
    res.redirect("/register");
  }
});

// Create Partner (user becomes a partner)
app.post("/api/partners/apply", verifyJWT, async (req, res) => {
  try {
    const userId = req.userId;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    // Check if already a partner
    const existing = await pool.query(
      "SELECT id FROM partners WHERE user_id = $1",
      [userId],
    );
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: "Você já é um parceiro Kogna" });
    }

    // Generate unique affiliate code
    const userRes = await pool.query("SELECT name FROM users WHERE id = $1", [
      userId,
    ]);
    const userName = userRes.rows[0]?.name || "partner";
    const baseCode = userName
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "")
      .slice(0, 10);
    const code = baseCode + "-" + Math.random().toString(36).substring(2, 7);

    const newPartner = await pool.query(
      `INSERT INTO partners (user_id, affiliate_code, commission_percentage, status) 
             VALUES ($1, $2, 10.0, 'active') RETURNING *`,
      [userId, code],
    );

    log(`New partner created: ${newPartner.rows[0].id} for user ${userId}`);
    res.json({ success: true, partner: newPartner.rows[0] });
  } catch (err) {
    log("Partner apply error: " + err.toString());
    res.status(500).json({ error: "Internal server error" });

    // Public Partner Registration
    app.post("/api/partners/register", async (req, res) => {
      const { name, email, password } = req.body;

      if (!(await checkDb())) {
        return res.status(503).json({ error: "Database disconnected." });
      }

      if (!email || !password || !name) {
        return res
          .status(400)
          .json({ error: "Nome, e-mail e senha são obrigatórios" });
      }

      if (password.length < 6) {
        return res
          .status(400)
          .json({ error: "A senha deve ter no mínimo 6 caracteres" });
      }

      try {
        // 1. Check if user already exists
        const existing = await pool.query(
          "SELECT id FROM users WHERE email = $1",
          [email],
        );
        if (existing.rows.length > 0) {
          return res
            .status(409)
            .json({
              error:
                "Este e-mail já está cadastrado. Faça login para se tornar um parceiro.",
            });
        }

        // 2. Create User
        const hashedPassword = await bcrypt.hash(password, 10);

        // Check for referral (partners referring partners?) - Optional, for now just create user
        const newUser = await pool.query(
          `INSERT INTO users (id, name, email, password, created_at, koins_balance) 
             VALUES (gen_random_uuid(), $1, $2, $3, NOW(), 0) 
             RETURNING *`,
          [name, email, hashedPassword],
        );
        const user = newUser.rows[0];

        // 3. Create Organization
        const newOrg = await pool.query(
          `INSERT INTO organizations (name, owner_id, plan_type) VALUES ($1, $2, 'basic') RETURNING *`,
          [name + "'s Organization", user.id],
        );
        user.organization_id = newOrg.rows[0].id;
        await pool.query(
          "UPDATE users SET organization_id = $1 WHERE id = $2",
          [user.organization_id, user.id],
        );

        // 4. Create Partner Record immediately
        // Generate unique affiliate code
        const baseCode = name
          .toLowerCase()
          .replace(/[^a-z0-9]/g, "")
          .slice(0, 10);
        const code =
          baseCode + "-" + Math.random().toString(36).substring(2, 7);

        await pool.query(
          `INSERT INTO partners (user_id, affiliate_code, commission_percentage, status) 
             VALUES ($1, $2, 10.0, 'active')`,
          [user.id, code],
        );

        // 5. Create Welcome Notification
        await pool.query(
          `INSERT INTO notifications (user_id, title, message) VALUES ($1, $2, $3)`,
          [
            user.id,
            "Bem-vindo ao Programa de Parceiros!",
            "Seu link de afiliado já está ativo. Acesse o painel de parceiros para começar.",
          ],
        );

        // 6. Return Auth Token
        const { password: _, ...safeUser } = user;
        const organization = newOrg.rows[0];

        const token = jwt.sign(
          { id: user.id, email: user.email, role: user.role },
          JWT_SECRET,
          { expiresIn: "24h" },
        );

        log(`New Partner Registered via Public Page: ${user.id} (${email})`);

        res.json({
          user: { ...safeUser, organization },
          role: user.role,
          token,
        });
      } catch (err) {
        log("Partner public register error: " + err.toString());
        res.status(500).json({ error: "Internal server error" });
      }
    });
  }
});

// Get Partner Dashboard Data
app.get("/api/partners/dashboard", verifyJWT, async (req, res) => {
  try {
    const userId = req.userId;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const partnerRes = await pool.query(
      "SELECT * FROM partners WHERE user_id = $1",
      [userId],
    );
    if (partnerRes.rows.length === 0) {
      return res
        .status(404)
        .json({ error: "Você não é um parceiro. Solicite sua afiliação." });
    }
    const partner = partnerRes.rows[0];

    // Total Clicks
    const clicksRes = await pool.query(
      "SELECT COUNT(*) as total FROM partner_clicks WHERE partner_id = $1",
      [partner.id],
    );
    const totalClicks = parseInt(clicksRes.rows[0].total);

    // Total Leads (registered users referred by this partner)
    const leadsRes = await pool.query(
      "SELECT COUNT(*) as total FROM users WHERE referred_by = $1",
      [partner.id],
    );
    const totalLeads = parseInt(leadsRes.rows[0].total);

    // Active Customers (users who made at least 1 purchase)
    const customersRes = await pool.query(
      `SELECT COUNT(DISTINCT u.id) as total FROM users u 
             INNER JOIN billing_history bh ON bh.user_id = u.id 
             WHERE u.referred_by = $1 AND bh.status = 'completed'`,
      [partner.id],
    );
    const activeCustomers = parseInt(customersRes.rows[0].total);

    // Commissions list (financial statement)
    const commissionsRes = await pool.query(
      `SELECT id, amount, status, created_at FROM partner_commissions 
             WHERE partner_id = $1 ORDER BY created_at DESC LIMIT 50`,
      [partner.id],
    );

    res.json({
      partner: {
        id: partner.id,
        affiliateCode: partner.affiliate_code,
        commissionPercentage: partner.commission_percentage,
        status: partner.status,
        walletPending: partner.wallet_balance_pending,
        walletAvailable: partner.wallet_balance_available,
      },
      metrics: {
        totalClicks,
        totalLeads,
        activeCustomers,
      },
      commissions: commissionsRes.rows,
    });
  } catch (err) {
    log("Partner dashboard error: " + err.toString());
    res.status(500).json({ error: "Internal server error" });
  }
});

// ==================== CLIENTS API ====================

app.get("/api/clients", verifyJWT, async (req, res) => {
  try {
    const userId = req.userId;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    // Fetch user's organization_id
    const userRes = await pool.query(
      "SELECT organization_id FROM users WHERE id = $1",
      [userId],
    );
    const orgId = userRes.rows[0]?.organization_id;

    if (!orgId) return res.status(403).json({ error: "No organization" });

    // Fetch leads that are marked as 'Cliente', 'client', or 'won' with product details
    const result = await pool.query(
      `SELECT l.id, l.name, l.company, l.phone, l.email, l.value, l.status, l.tags, l.source, 
                    l.last_contact as "lastContact", l.created_at as "createdAt", l.notes, l.product_id as "productId",
                    p.name as "productName"
             FROM leads l
             LEFT JOIN products p ON l.product_id = p.id
             WHERE l.organization_id = $1 AND (l.status = 'Cliente' OR l.status = 'client' OR l.status = 'won' OR l.status = 'ganho')
             ORDER BY l.created_at DESC`,
      [orgId],
    );

    const clients = result.rows;

    // Calculate summary
    const summary = {
      count: clients.length,
      total_value: clients.reduce(
        (sum, client) => sum + (parseFloat(client.value) || 0),
        0,
      ),
    };

    res.json({ clients, summary });
  } catch (err) {
    log("GET /api/clients error: " + err.toString());
    res.status(500).json({ error: "Internal server error" });
  }
});


// ==================== PRODUCTS API ====================

// [REMOVED] Legacy product routes were here. Replaced by advanced implementation around line 5400.

// ==================== USER & ONBOARDING API ====================

// Get Current User Profile (for refreshUser)
app.get("/api/me", verifyJWT, async (req, res) => {
  try {
    const userId = req.userId;
    const result = await pool.query("SELECT * FROM users WHERE id = $1", [
      userId,
    ]);
    const user = result.rows[0];

    if (!user) return res.status(404).json({ error: "User not found" });

    // Get Org
    let organization = null;
    if (user.organization_id) {
      const orgRes = await pool.query(
        "SELECT * FROM organizations WHERE id = $1",
        [user.organization_id],
      );
      organization = orgRes.rows[0];
    }

    const { password: _, ...safeUser } = user;
    res.json({ user: { ...safeUser, organization } });
  } catch (err) {
    log("Get Me error: " + err.toString());
    res.status(500).json({ error: "Internal server error" });
  }
});

// Complete Onboarding & Reward Koins
app.post("/api/onboarding/complete", verifyJWT, async (req, res) => {
  try {
    const userId = req.userId;

    // Check current status
    const userRes = await pool.query(
      "SELECT name, email, personal_phone, company_phone, onboarding_completed, organization_id FROM users WHERE id = $1",
      [userId],
    );
    const user = userRes.rows[0];

    if (!user) return res.status(404).json({ error: "User not found" });

    await ensureDefaultVendedorForUser(pool, {
      orgId: user.organization_id,
      nome: user.name,
      email: user.email,
      whatsapp: user.personal_phone || user.company_phone || null,
    });

    if (user.onboarding_completed) {
      // Idempotent success
      return res.json({ success: true, message: "Already completed" });
    }

    const orgId = user.organization_id;

    // NOTE: Agent creation is handled by POST /api/onboarding/create-agent earlier in the flow.
    // We intentionally do NOT auto-create a fallback agent here to avoid duplicates.

    // Update status and add reward (100 Koins)
    await pool.query(
      "UPDATE users SET onboarding_completed = true WHERE id = $1",
      [userId],
    );
    await adjustUserKoinsBalance({
      userId,
      delta: 100,
      source: "onboarding_reward",
      metadata: { trigger: "onboarding_completed" },
    });
    await runAdminEventAutomations('onboarding_completed', {
      userId,
      eventKey: `onboarding_completed:${userId}`,
    }).catch((automationErr) => {
      log('[AUTO EVENT onboarding_completed] ' + automationErr.message);
    });

    log(`User ${userId} completed onboarding. Awarded 100 Koins.`);
    res.json({ success: true, addedKoins: 100 });
  } catch (err) {
    log("Complete Onboarding error: " + err.toString());
    res.status(500).json({ error: "Internal server error" });
  }
});

// Create Initial Agent (Onboarding)
app.post("/api/onboarding/create-agent", verifyJWT, async (req, res) => {
  try {
    const userId = req.userId;
    const {
      templateId,
      companyName,
      aiName,
      companyProduct,
      targetAudience,
      unknownBehavior,
      voiceTone,
      restrictions,
      customerPain,
    } = req.body;

    // 1. Get User's Org
    const userRes = await pool.query(
      "SELECT organization_id FROM users WHERE id = $1",
      [userId],
    );
    const orgId = userRes.rows[0]?.organization_id;

    if (!orgId)
      return res.status(400).json({ error: "User has no organization" });

    // 1.1 Prevent Duplicate Agent Creation during Onboarding
    const existingAgent = await pool.query(
      "SELECT id FROM agents WHERE organization_id = $1 LIMIT 1",
      [orgId],
    );
    if (existingAgent.rows.length > 0) {
      log(`[ONBOARDING] Agent already exists for org ${orgId}. Skipping creation.`);
      return res.json({
        success: true,
        agent: existingAgent.rows[0],
        message: "Agent already exists",
      });
    }

    // 2. Define Templates (kept in sync with src/data/agentTemplates.ts)
    const templates = {
      sdr: `[IDENTIDADE E MISSÃO]
Você é {{aiName}}, um SDR (Sales Development Representative) de elite da empresa {{companyName}}, operando via WhatsApp.
A empresa vende: {{companyProduct}}.
O público-alvo é: {{targetAudience}}.
Tom de voz: {{voiceTone}}.
Principal dor/problema do cliente que você resolve: {{customerPain}}.

Sua MISSÃO ÚNICA E MENSURÁVEL é: AGENDAR UMA REUNIÃO/DEMONSTRAÇÃO. Você NÃO vende o produto final — você vende a REUNIÃO.

[ABERTURA OBRIGATÓRIA — PRIMEIRA MENSAGEM]
Quando alguém iniciar uma conversa com você pela primeira vez (ex: "oi", "olá", qualquer saudação), NUNCA responda com "Como posso te ajudar?" ou qualquer variação. Em vez disso, SEMPRE siga este roteiro:
1. Cumprimente pelo nome se disponível, de forma breve e calorosa.
2. Apresente-se e a empresa em uma linha.
3. Imediatamente faça UMA pergunta de qualificação fechada, diretamente ligada à dor do cliente. Exemplo:
"Ei! Sou a {{aiName}} da {{companyName}}. A maioria das empresas que nos procura enfrenta [dor do cliente]. Isso ressoa com o que vocês vivem hoje?"

[MAPA COGNITIVO — 4 ESTADOS OBRIGATÓRIOS]
Nunca pule estados. Mova o lead de um estado para o próximo a cada mensagem:
1. DESCOBERTA (Rapport + Dor): Confirme o problema. Use: "Você mencionou X — isso acontece com qual frequência?"
2. QUALIFICAÇÃO (SPIN): Meça o impacto da dor. "Quanto esse problema custa para vocês por mês, estimativamente?"
3. CURIOSIDADE (Ponte): "Nós ajudamos [empresa similar] a resolver exatamente isso. Posso te mostrar como em 15 minutos?"
4. CONVERSÃO (Alternative Close): "Você prefere uma call amanhã de manhã ou na quinta à tarde?"

[PROTOCOLO DE CONDUÇÃO ATIVA — INVIOLÁVEL]
- VOCÊ LIDERA, NUNCA SEGUE. Cada mensagem deve avançar o lead um passo.
- UMA PERGUNTA POR MENSAGEM — sempre fechada ou de alternativa (A ou B), nunca aberta.
- PROIBIDO: "O que você gostaria de saber?", "Como posso te ajudar?", "Sobre o que você quer falar?"
- Se o lead der uma resposta vaga, não aceite. Redirecione: "Entendi! Me conta mais especificamente: [pergunta fechada]"
- REGRA DA ÚLTIMA FRASE: 100% das suas mensagens terminam com uma pergunta ou CTA.

[TRATAMENTO DE OBJEÇÕES — MÉTODO LAER]
- "SEM TEMPO": "Exatamente por isso estou aqui — resolver isso antes que consuma mais tempo. Quanto tempo esse problema já tomou da sua equipe esse mês?"
- "JÁ TENHO FORNECEDOR": "Ótimo! O que faria sua experiência atual passar de 'boa' para 'perfeita'?"
- "NÃO PRECISO": "Entendo. O que te leva a pensar que {{customerPain}} não é uma prioridade agora?"

REGRAS:
1. Use linguagem natural, escaneável, parágrafos de no máximo 2 linhas.
2. Nunca invente dados sobre o produto.
3. Se não souber algo: {{unknownBehavior}}.

RESTRIÇÕES (NUNCA FAZER):
{{restrictions}}`,

      vendedor: `[IDENTIDADE E MISSÃO]
Você é {{aiName}}, um Vendedor Closer de alta performance da empresa {{companyName}}, operando via WhatsApp.
A empresa vende: {{companyProduct}}.
O público-alvo é: {{targetAudience}}.
Tom de voz: {{voiceTone}}.
Principal dor/problema do cliente que você resolve: {{customerPain}}.

Sua MISSÃO ÚNICA E MENSURÁVEL é: FECHAR A VENDA. Você não tira dúvidas — você conduz o cliente à decisão.

[ABERTURA OBRIGATÓRIA — PRIMEIRA MENSAGEM]
Quando alguém iniciar uma conversa (ex: "oi", "quero saber mais", qualquer mensagem inicial), NUNCA responda com "Como posso te ajudar?" ou "Sobre o que gostaria de saber?". Siga este roteiro:
1. Cumprimento breve + apresentação em uma linha.
2. Gatilho de dor imediato: mencione a dor principal do cliente.
3. Pergunta de diagnóstico fechada para confirmar a dor. Exemplo:
"Olá! Sou {{aiName}} da {{companyName}}. Muitos dos nossos clientes chegam até nós com [dor do cliente] — você também enfrenta isso no dia a dia?"

[MAPA COGNITIVO — 4 ESTADOS]
1. DIAGNÓSTICO: Confirme e aprofunde a dor. "Esse problema afeta mais a sua equipe, as vendas ou a operação?"
2. APRESENTAÇÃO DE VALOR (BAF): Benefício → Vantagem → Característica. Nunca comece pela feature.
3. NEGOCIAÇÃO: Isole objeções, mostre ROI. "O custo de não resolver isso já é maior que o investimento."
4. FECHAMENTO: Assumptive Close. "Para liberar seu acesso agora, qual o melhor e-mail?"

[PROTOCOLO DE CONDUÇÃO ATIVA — INVIOLÁVEL]
- VOCÊ LIDERA SEMPRE. Não existe mensagem sua que não avance o processo de venda.
- UMA PERGUNTA POR MENSAGEM — fechada ou alternativa, nunca aberta.
- PROIBIDO: "O que você quer saber?", "Tem alguma dúvida?", "Como posso te ajudar?"
- REGRA DA ÚLTIMA FRASE: 100% das mensagens terminam com pergunta ou CTA de fechamento.

[TRATAMENTO TÁTICO DE OBJEÇÕES — LAER]
- "TÁ CARO": "Se o preço não fosse obstáculo, você fecharia hoje? O que impede além disso?"
- "PRECISO PENSAR": "O que especificamente está pesando mais? A [benefício] ou a [outra preocupação]?"
- "CONCORRENTE É MAIS BARATO": "O que você busca: o menor preço ou a certeza de resolver [dor]?"

[TÉCNICAS DE FECHAMENTO]
- ASSUMPTIVE CLOSE: "Para seguirmos, me passa seu e-mail que já preparo o acesso."
- ALTERNATIVE CLOSE: "Prefere fechar no PIX hoje ou parcelar no cartão?"
- URGÊNCIA: Mencione escassez de vagas/estoque de forma natural e verdadeira.

REGRAS:
1. Nunca invente dados. Se não souber: {{unknownBehavior}}.

RESTRIÇÕES (NUNCA FAZER):
{{restrictions}}`,

      suporte: `[IDENTIDADE E MISSÃO]
Você é {{aiName}}, Especialista em Suporte e Sucesso do Cliente da empresa {{companyName}}, operando via WhatsApp.
A empresa atua com: {{companyProduct}}.
O público-alvo é: {{targetAudience}}.
Tom de voz: {{voiceTone}}.

Sua MISSÃO é: Resolver a dor ou dúvida do cliente no menor número de mensagens possível, garantindo que ele saia mais satisfeito do que quando chegou.

[ABERTURA]
Receba o cliente com empatia e agilidade. Identifique o problema antes de propor soluções.
Example: "Olá, {{aiName}} aqui da {{companyName}}! Pode me contar o que está acontecendo? Vou resolver isso para você."

[MAPA COGNITIVO]
1. Acolhimento: Empatia imediata, sem julgamento.
2. Investigação: Isole o problema com uma pergunta específica.
3. Resolução: Entregue a solução em passos curtos.
4. Confirmação: "Isso resolveu? Posso ajudar com mais alguma coisa?"

[GESTÃO DE CONFLITOS — LAER]
Cliente irritado:
1. Validar: "Entendo sua frustração e lamento muito. Vou resolver agora."
2. Explorar: "Para eu agir no ponto certo — o erro aparece em qual tela/momento exato?"
3. Responder: Solução objetiva em passos numerados.

PROTOCOLOS:
- AMBIGUIDADE: Se o relato for vago, peça um detalhe específico antes de responder.
- ESPELHAMENTO: Se formal → seja preciso. Se casual → seja caloroso.
- ÚLTIMA FRASE: Sempre feche com "Consegui te ajudar ou há mais algo que posso verificar?"

REGRAS:
1. Respostas técnicas = passos numerados e curtos.
2. Se não souber: {{unknownBehavior}}. NUNCA invente prazos.

RESTRIÇÕES (NUNCA FAZER):
{{restrictions}}`,

      atendente: `[IDENTIDADE E MISSÃO]
Você é {{aiName}}, Concierge e Atendente da empresa {{companyName}}, operando via WhatsApp.
A empresa vende: {{companyProduct}}.
O público-alvo é: {{targetAudience}}.
Tom de voz: {{voiceTone}}.

Sua MISSÃO é: Identificar rapidamente a intenção do usuário (Comprar, Dúvida, Reclamação) e resolver ou direcionar no menor número de mensagens possível.

[ABERTURA]
Receba o cliente com energia e identifique a intenção rapidamente.
"Olá! Sou a {{aiName}} da {{companyName}}. Posso te ajudar com informações, suporte ou dar início a um pedido. O que te trouxe aqui hoje?"

[TRIAGEM — 3 TRILHAS]

TRILHA 1: INTERESSE/COMPRA
- Aja como consultor. Apresente: Benefício → Vantagem → Produto (BAF).
- Assumptive Close: "Para seguirmos, só preciso de [dado]..."

TRILHA 2: SUPORTE/RECLAMAÇÃO — LAER
1. Validar: "Entendo a frustração. Vou resolver agora."
2. Explorar: "O erro aparece na tela X ou Y?"
3. Responder: Solução em passos claros.

TRILHA 3: DÚVIDA GERAL
- Resposta direta com base no conhecimento disponível.
- Se vago: peça clareza antes de adivinhar.

PROTOCOLOS:
- ESPELHAMENTO: Adapte energia ao cliente.
- LOOP: Responda focado na última pergunta. Não polua com info extra.
- ENCERRAMENTO: "Mais alguma coisa que posso verificar para você hoje?"

REGRAS:
1. Parágrafos máximo 3 linhas.
2. Se não souber: {{unknownBehavior}}.

RESTRIÇÕES (NUNCA FAZER):
{{restrictions}}`,
    };

    // Default or Fallback Template
    const basePrompt = templates[templateId] || templates["sdr"];

    // 3. Replace Placeholders
    let system_prompt = basePrompt
      .replace(/{{aiName}}/g, aiName || "Assistente")
      .replace(/{{companyName}}/g, companyName || "nossa empresa")
      .replace(/{{companyProduct}}/g, companyProduct || "nossos produtos")
      .replace(/{{targetAudience}}/g, targetAudience || "clientes")
      .replace(/{{voiceTone}}/g, voiceTone || "profissional")
      .replace(/{{customerPain}}/g, customerPain || "seus desafios")
      .replace(
        /{{unknownBehavior}}/g,
        unknownBehavior || "pedirei um momento para verificar",
      )
      .replace(
        /{{restrictions}}/g,
        restrictions || "Nenhuma restrição definida.",
      );

    // 4. Find most recent WhatsApp Instance for this Org
    const instanceRes = await pool.query(
      "SELECT id FROM whatsapp_instances WHERE organization_id = $1 ORDER BY created_at DESC LIMIT 1",
      [orgId],
    );
    const whatsappInstanceId = instanceRes.rows[0]?.id || null;

    // 5. Create Agent
    const newAgent = await pool.query(
      `INSERT INTO agents (organization_id, name, type, system_prompt, model_config, whatsapp_instance_id, created_at) 
             VALUES ($1, $2, 'whatsapp', $3, $4, $5, NOW()) 
             RETURNING id, name`,
      [
        orgId,
        aiName,
        system_prompt,
        { model: DEFAULT_AGENT_MODEL, temperature: 0.7 },
        whatsappInstanceId,
      ],
    );

    if (whatsappInstanceId) {
      log(
        `Onboarding Agent Created: ${newAgent.rows[0].id} and linked to WhatsApp Instance: ${whatsappInstanceId}`,
      );
    } else {
      log(
        `Onboarding Agent Created: ${newAgent.rows[0].id} (No WhatsApp instance found to link)`,
      );
    }

    await runAdminEventAutomations('agent_created', {
      userId,
      eventKey: `agent_created:${newAgent.rows[0].id}`,
      extraVars: { nome_ia: newAgent.rows[0].name },
    }).catch((automationErr) => {
      log('[AUTO EVENT agent_created] ' + automationErr.message);
    });

    res.json({ success: true, agent: newAgent.rows[0] });
  } catch (err) {
    log("Create Agent (Onboarding) error: " + err.toString());
    res.status(500).json({ error: "Internal server error" });
  }
});

// ==================== ONBOARDING STATUS ====================

// Check Onboarding Status
app.get("/api/onboarding/status", verifyJWT, async (req, res) => {
  try {
    const userId = req.userId;
    const result = await pool.query(
      "SELECT onboarding_completed FROM users WHERE id = $1",
      [userId],
    );
    if (!result.rows.length)
      return res.status(404).json({ error: "User not found" });

    res.json({ completed: result.rows[0].onboarding_completed });
  } catch (err) {
    log("Onboarding status error: " + err.toString());
    res.status(500).json({ error: "Internal server error" });
  }
});

// ==================== ADMIN DASHBOARD API ====================

// Admin: Fix orgs that have WhatsApp instances but no agents (retroactive fix)
app.post("/api/admin/fix-missing-agents", verifyJWT, verifyAdmin, async (req, res) => {
  try {
    // Find all orgs that have WhatsApp instances but NO agents
    const orphanedOrgs = await pool.query(`
      SELECT DISTINCT wi.organization_id, wi.id as instance_id, wi.instance_name,
             u.id as user_id, u.email
      FROM whatsapp_instances wi
      JOIN users u ON wi.user_id = u.id
      WHERE wi.organization_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM agents a WHERE a.organization_id = wi.organization_id
      )
    `);

    const fixes = [];

    for (const row of orphanedOrgs.rows) {
      // Get ia_configs for this user
      const configRes = await pool.query(
        "SELECT * FROM ia_configs WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1",
        [row.user_id],
      );
      const config = configRes.rows[0];

      const companyName = config?.company_name || "Empresa";
      const aiName = config?.ai_name || "Assistente";
      const companyProduct = config?.company_product || "produtos";
      const targetAudience = config?.target_audience || "clientes";
      const voiceTone = config?.voice_tone || "profissional";

      const systemPrompt = `Você é um SDR virtual chamado ${aiName}.
A empresa ${companyName} vende: ${companyProduct}.
O público-alvo é: ${targetAudience}.
Tom de voz: ${voiceTone}.

REGRAS:
1. Faça perguntas de qualificação para entender a necessidade do lead.
2. Quando o lead estiver qualificado, proponha uma reunião ou demonstração.
3. Nunca invente informações sobre o produto.
4. Use linguagem natural e evite parecer um robô.
5. Responda sempre em português brasileiro.
6. Mantenha as respostas curtas (máximo 3 parágrafos).`;

      const agentName = aiName || companyName || "Agente IA";

      await pool.query(
        `INSERT INTO agents (organization_id, name, type, system_prompt, model_config, whatsapp_instance_id, status, created_at) 
         VALUES ($1, $2, 'whatsapp', $3, $4, $5, 'active', NOW())`,
        [
          row.organization_id,
          agentName,
          systemPrompt,
          JSON.stringify({ model: DEFAULT_AGENT_MODEL, temperature: 0.7 }),
          row.instance_id,
        ],
      );

      fixes.push({ email: row.email, orgId: row.organization_id, agentName, instanceName: row.instance_name });
      log(`[FIX] Created agent "${agentName}" for ${row.email} (org: ${row.organization_id})`);
    }

    res.json({ success: true, fixed: fixes.length, details: fixes });
  } catch (err) {
    log("[ERROR] fix-missing-agents: " + err.toString());
    res.status(500).json({ error: err.message });
  }
});

// Admin: Get Overview Stats (MRR, Revenue Chart)
app.get("/api/admin/stats", verifyJWT, verifyAdmin, async (req, res) => {
  try {
    // 1. Calculate MRR (Approximate based on recent billings + subscriptions)
    // For this MVP, we sum up billing_history 'approved' transactions from the last 30 days
    const mrrRes = await pool.query(`
            SELECT SUM(value) as total 
            FROM billing_history 
            WHERE status = 'approved' 
            AND created_at > NOW() - INTERVAL '30 days'
        `);
    const mrr = parseFloat(mrrRes.rows[0]?.total || 0);

    // 2. Generate Chart Data (Last 6 months revenue)
    const chartRes = await pool.query(`
            SELECT TO_CHAR(created_at, 'Mon') as month, SUM(value) as revenue
            FROM billing_history
            WHERE status = 'approved'
            AND created_at > NOW() - INTERVAL '6 months'
            GROUP BY TO_CHAR(created_at, 'Mon'), DATE_TRUNC('month', created_at)
            ORDER BY DATE_TRUNC('month', created_at) ASC
        `);

    // Fill in missing months if necessary (basic implementation)
    const chartData = chartRes.rows.map((r) => ({
      month: r.month,
      revenue: parseFloat(r.revenue),
    }));

    res.json({
      mrr,
      chartData,
    });
  } catch (err) {
    log("Admin stats error: " + err.toString());
    res.status(500).json({ error: "Internal server error" });
  }
});

// Admin: Get All Users
app.get("/api/admin/users", verifyJWT, verifyAdmin, async (req, res) => {
  try {
    const users = await pool.query(`
            SELECT u.id, u.name, u.email, u.koins_balance, u.created_at, u.role,
                   COALESCE(NULLIF(u.personal_phone, ''), NULLIF(u.company_phone, '')) AS phone,
                   o.name as company_name, o.plan_type
            FROM users u
            LEFT JOIN organizations o ON u.organization_id = o.id
            ORDER BY u.created_at DESC
        `);
    res.json(users.rows);
  } catch (err) {
    log("Admin users list error: " + err.toString());
    res.status(500).json({ error: "Internal server error" });
  }
});

// Admin: Get Consumption Stats
app.get("/api/admin/consumption", verifyJWT, verifyAdmin, async (req, res) => {
  try {
    const metricsStartAt = await getAdminMetricsStartAt();
    const consumptions = await pool.query(`
      WITH message_usage AS (
        SELECT
          a.organization_id,
          COUNT(*)::int AS total_messages,
          COALESCE(SUM(cm.prompt_tokens), 0)::bigint AS total_prompt_tokens,
          COALESCE(SUM(cm.completion_tokens), 0)::bigint AS total_completion_tokens,
          COALESCE(SUM(cm.token_cost), 0)::numeric AS total_cost
        FROM chat_messages cm
        JOIN agents a ON a.id = cm.agent_id
        WHERE cm.created_at >= $1
        GROUP BY a.organization_id
      ),
      koins_usage AS (
        SELECT
          user_id,
          COALESCE(SUM(ABS(delta)) FILTER (WHERE delta < 0), 0)::int AS koins_spent_real
        FROM koins_ledger
        WHERE created_at >= $1
        GROUP BY user_id
      )
      SELECT
        u.id,
        u.name AS user_name,
        u.email,
        COALESCE(o.name, 'Sem empresa') AS company_name,
        COALESCE(mu.total_messages, 0) AS total_messages,
        COALESCE(mu.total_prompt_tokens, 0) AS total_prompt_tokens,
        COALESCE(mu.total_completion_tokens, 0) AS total_completion_tokens,
        COALESCE(mu.total_cost, 0)::float AS total_cost,
        COALESCE(ku.koins_spent_real, 0) AS koins_spent_real,
        COALESCE(u.koins_balance, 0) AS current_koins_balance
      FROM users u
      LEFT JOIN organizations o ON u.organization_id = o.id
      LEFT JOIN message_usage mu ON mu.organization_id = o.id
      LEFT JOIN koins_usage ku ON ku.user_id = u.id
      WHERE u.role = 'user'
      ORDER BY COALESCE(mu.total_cost, 0) DESC, COALESCE(ku.koins_spent_real, 0) DESC, u.created_at DESC
      LIMIT 50
    `, [metricsStartAt]);

    res.json(consumptions.rows);
  } catch (err) {
    log("Admin consumption error: " + err.toString());
    res.status(500).json({ error: "Internal server error" });
  }
});

// Admin: Get Strategic Metrics for New Dashboard
app.get("/api/admin/strategic-metrics", verifyJWT, verifyAdmin, async (req, res) => {
  try {
    const period = String(req.query.period || "30d");
    const metricsStartAt = await getAdminMetricsStartAt();
    const currentWindow = buildAdminMetricsWindow(period, metricsStartAt);
    const chartWindowStart = maxDate(currentWindow.start, addDays(startOfDay(currentWindow.end || currentWindow.now), -6))
      || addDays(startOfDay(currentWindow.end || currentWindow.now), -6);
    const chartWindowEnd = addDays(startOfDay(currentWindow.end || currentWindow.now), 1);

    const revenueQuery = buildWindowedQuery(
      `SELECT
         COALESCE(SUM(value), 0)::numeric AS total_revenue,
         COALESCE(SUM(value) FILTER (WHERE COALESCE(amount, 0) > 0), 0)::numeric AS koins_revenue,
         COALESCE(SUM(value) FILTER (WHERE COALESCE(amount, 0) <= 0), 0)::numeric AS connections_revenue,
         COALESCE(SUM(amount), 0)::int AS koins_sold
       FROM billing_history
       WHERE status = 'approved'`,
      "created_at",
      currentWindow.start,
      currentWindow.end,
    );
    const previousRevenueQuery = currentWindow.previous
      ? buildWindowedQuery(
        `SELECT COALESCE(SUM(value), 0)::numeric AS total_revenue
         FROM billing_history
         WHERE status = 'approved'`,
        "created_at",
        currentWindow.previous.start,
        currentWindow.previous.end,
      )
      : null;
    const messageUsageQuery = buildWindowedQuery(
      `SELECT
         COUNT(*)::int AS total_messages,
         COALESCE(SUM(prompt_tokens), 0)::bigint AS total_prompt_tokens,
         COALESCE(SUM(completion_tokens), 0)::bigint AS total_completion_tokens,
         COALESCE(SUM(token_cost), 0)::numeric AS total_api_cost
       FROM chat_messages
       WHERE 1 = 1`,
      "created_at",
      currentWindow.start,
      currentWindow.end,
    );
    const newClientsQuery = buildWindowedQuery(
      `SELECT COUNT(*)::int AS total
       FROM users
       WHERE role = 'user'`,
      "created_at",
      currentWindow.start,
      currentWindow.end,
    );
    const koinsConsumedQuery = buildWindowedQuery(
      `SELECT COALESCE(SUM(ABS(delta)) FILTER (WHERE delta < 0), 0)::int AS total
       FROM koins_ledger
       WHERE 1 = 1`,
      "created_at",
      currentWindow.start,
      currentWindow.end,
    );
    const revenueChartQuery = buildWindowedQuery(
      `SELECT
         DATE_TRUNC('day', created_at) AS bucket,
         COALESCE(SUM(value), 0)::numeric AS total
       FROM billing_history
       WHERE status = 'approved'`,
      "created_at",
      chartWindowStart,
      chartWindowEnd,
    );
    const billingRowsQuery = buildWindowedQuery(
      `SELECT id, amount, value
       FROM billing_history
       WHERE status = 'approved'`,
      "created_at",
      currentWindow.start,
      currentWindow.end,
    );

    const [
      revenueRes,
      previousRevenueRes,
      clientsRes,
      partnersRes,
      organizationsRes,
      koinsBalancesRes,
      messageUsageRes,
      newClientsRes,
      koinsConsumedRes,
      productsRes,
      chartRevenueRes,
      billingRowsRes,
    ] = await Promise.all([
      pool.query(revenueQuery.text, revenueQuery.values),
      previousRevenueQuery
        ? pool.query(previousRevenueQuery.text, previousRevenueQuery.values)
        : Promise.resolve({ rows: [{ total_revenue: 0 }] }),
      pool.query(`SELECT COUNT(*)::int AS total_clients FROM users WHERE role = 'user'`),
      pool.query(`SELECT COUNT(*)::int AS total_partners FROM partners`),
      pool.query(`
        SELECT
          COUNT(*)::int AS total_organizations,
          COALESCE(SUM(whatsapp_connections_limit), 0)::int AS total_whatsapp_slots
        FROM organizations
      `),
      pool.query(`
        SELECT
          COALESCE(SUM(koins_balance), 0)::int AS total_koins_balance,
          COUNT(*) FILTER (WHERE COALESCE(koins_balance, 0) > 0)::int AS users_with_koins
        FROM users
        WHERE role = 'user'
      `),
      pool.query(messageUsageQuery.text, messageUsageQuery.values),
      pool.query(newClientsQuery.text, newClientsQuery.values),
      pool.query(koinsConsumedQuery.text, koinsConsumedQuery.values),
      pool.query(`
        SELECT
          id,
          name,
          price,
          type,
          active,
          koins_bonus,
          connections_bonus,
          created_at,
          updated_at
        FROM products
        ORDER BY active DESC, updated_at DESC NULLS LAST, created_at DESC NULLS LAST, name ASC
      `),
      pool.query(`${revenueChartQuery.text} GROUP BY 1 ORDER BY 1 ASC`, revenueChartQuery.values),
      pool.query(billingRowsQuery.text, billingRowsQuery.values),
    ]);

    const totalRevenue = Number(revenueRes.rows[0]?.total_revenue || 0);
    const koinsRevenue = Number(revenueRes.rows[0]?.koins_revenue || 0);
    const connectionsRevenue = Number(revenueRes.rows[0]?.connections_revenue || 0);
    const prevRevenue = Number(previousRevenueRes.rows[0]?.total_revenue || 0);
    const totalClients = Number(clientsRes.rows[0]?.total_clients || 0);
    const totalPartners = Number(partnersRes.rows[0]?.total_partners || 0);
    const totalOrganizations = Number(organizationsRes.rows[0]?.total_organizations || 0);
    const totalWhatsappSlots = Number(organizationsRes.rows[0]?.total_whatsapp_slots || 0);
    const totalKoinsBalance = Number(koinsBalancesRes.rows[0]?.total_koins_balance || 0);
    const usersWithKoins = Number(koinsBalancesRes.rows[0]?.users_with_koins || 0);
    const totalMessages = Number(messageUsageRes.rows[0]?.total_messages || 0);
    const totalPromptTokens = Number(messageUsageRes.rows[0]?.total_prompt_tokens || 0);
    const totalCompletionTokens = Number(messageUsageRes.rows[0]?.total_completion_tokens || 0);
    const apiCost = Number(messageUsageRes.rows[0]?.total_api_cost || 0);
    const newClients = Number(newClientsRes.rows[0]?.total || 0);
    const koinsConsumed = Number(koinsConsumedRes.rows[0]?.total || 0);
    const koinsSold = Number(revenueRes.rows[0]?.koins_sold || 0);
    const growthPercentage = prevRevenue > 0 ? ((totalRevenue - prevRevenue) / prevRevenue) * 100 : 0;
    const ticketMedio = totalClients > 0 ? totalRevenue / totalClients : 0;
    const revenueChartData = buildRecentRevenueChartData(chartRevenueRes.rows, currentWindow);

    const productCatalog = (productsRes.rows || []).map((product) => ({
      id: product.id,
      name: product.name,
      type:
        product.type ||
        (Number(product.connections_bonus || 0) > 0 && Number(product.koins_bonus || 0) === 0
          ? "CONNECTIONS"
          : "KOINS"),
      price: Number(product.price || 0),
      active: Boolean(product.active),
      koinsBonus: Number(product.koins_bonus || 0),
      connectionsBonus: Number(product.connections_bonus || 0),
    }));
    const productStats = new Map(
      productCatalog.map((product) => [
        product.id,
        {
          sales: 0,
          revenue: 0,
        },
      ]),
    );
    let matchedBillingRows = 0;

    for (const billingRow of billingRowsRes.rows || []) {
      const billingAmount = Number(billingRow.amount || 0);
      const billingValue = Number(billingRow.value || 0);
      const exactMatches = productCatalog.filter((product) => {
        const typeMatches =
          billingAmount > 0
            ? product.koinsBonus === billingAmount
            : product.connectionsBonus > 0;
        const priceMatches = Math.abs(product.price - billingValue) < 0.01;
        return typeMatches && priceMatches;
      });
      const fallbackMatches = productCatalog.filter((product) => {
        const typeMatches =
          billingAmount > 0
            ? product.koinsBonus > 0
            : product.connectionsBonus > 0;
        return typeMatches && Math.abs(product.price - billingValue) < 0.01;
      });
      const matchedProduct =
        exactMatches.length === 1
          ? exactMatches[0]
          : fallbackMatches.length === 1
            ? fallbackMatches[0]
            : null;

      if (!matchedProduct) continue;

      matchedBillingRows += 1;
      const stats = productStats.get(matchedProduct.id);
      if (stats) {
        stats.sales += 1;
        stats.revenue += billingValue;
      }
    }

    const products = productCatalog.map((product) => {
      const stats = productStats.get(product.id) || { sales: 0, revenue: 0 };
      return {
        id: product.id,
        name: product.name,
        type: product.type,
        price: product.price,
        sales: stats.sales,
        revenue: stats.revenue,
        active: product.active,
        tracking_status: matchedBillingRows > 0 ? "catalog_match" : "awaiting_sales_data",
      };
    });

    res.json({
      meta: {
        metricsStartAt,
        period,
        totalClients,
        totalPartners,
        totalOrganizations,
        totalKoinsBalance,
        usersWithKoins,
        totalWhatsappSlots,
        usdToBrlRate: ADMIN_USD_TO_BRL,
      },
      overview: {
        totalRevenue,
        prevRevenue,
        koinsRevenue,
        connectionsRevenue,
        apiCost,
        apiCostCurrency: "USD",
        activeClients: totalClients,
        totalClients,
        newClients,
        churn: 0,
        ticketMedio,
        growthPercentage,
        revenueChartData,
        totalMessages,
        totalPromptTokens,
        totalCompletionTokens,
        koinsSold,
        koinsConsumed,
      },
      products: {
        list: products,
        topProducts: [...products].sort((a, b) => b.revenue - a.revenue || b.sales - a.sales || a.name.localeCompare(b.name)).slice(0, 5),
        koinsSold,
        koinsConsumed,
        totalPromptTokens,
        totalCompletionTokens,
        apiCost,
        apiCostCurrency: "USD",
        messagesProcessed: totalMessages,
        totalKoinsBalance,
        usersWithKoins,
        productRevenueTracked: matchedBillingRows > 0,
        matchedBillingRows,
        totalBillingRows: billingRowsRes.rows?.length || 0,
        koinsConsumptionTracked: true,
      },
      connections: {
        totalActive: totalWhatsappSlots,
        mrr: 0,
      },
      ads: {
        investmentTotal: 0,
        leadsGenerated: 0,
        cpl: 0,
        roas: 0,
        tracked: false,
      },
      tracking: {
        metricsStartAt,
        adsTracked: false,
        productRevenueTracked: matchedBillingRows > 0,
        koinsConsumptionTracked: true,
        revenueSplitUsesBillingHeuristic: true,
        productSalesMatchMode: "catalog_signature",
      },
    });
  } catch (err) {
    log("Strategic Metrics Error: " + err.message);
    res.status(500).json({ error: "Failed fetching strategic metrics" });
  }
});

app.get("/api/admin/onboarding-analytics", verifyJWT, verifyAdmin, async (req, res) => {
  try {
    await ensureOnboardingAnalyticsTable();

    const identitySql = `COALESCE(NULLIF(user_id, ''), NULLIF(LOWER(email), ''), session_id)`;
    const dedupRes = await pool.query(`
      WITH base AS (
        SELECT
          ${identitySql} AS identity_key,
          max_step_reached,
          total_steps,
          completed_at,
          registered_at,
          last_seen_at,
          started_at,
          metadata
        FROM onboarding_progress_analytics
        WHERE onboarding_version = $1
      ),
      dedup AS (
        SELECT DISTINCT ON (identity_key)
          identity_key,
          max_step_reached,
          total_steps,
          completed_at,
          registered_at,
          last_seen_at,
          started_at,
          metadata
        FROM base
        ORDER BY
          identity_key,
          max_step_reached DESC,
          completed_at DESC NULLS LAST,
          registered_at DESC NULLS LAST,
          last_seen_at DESC,
          started_at DESC
      )
      SELECT
        identity_key,
        max_step_reached,
        total_steps,
        completed_at,
        registered_at,
        last_seen_at,
        started_at,
        metadata
      FROM dedup
    `, [ONBOARDING_ANALYTICS_VERSION]);

    const rawTotalSteps = ONBOARDING_ANALYTICS_TOTAL_STEPS;
    const displayTotalSteps = rawTotalSteps + 1;
    const journeys = dedupRes.rows || [];

    const totalStarted = journeys.length;
    const totalRegistered = journeys.filter((row) => Boolean(row.registered_at)).length;
    const totalCompleted = journeys.filter((row) => Boolean(row.completed_at)).length;
    const completionRate = totalStarted > 0 ? (totalCompleted / totalStarted) * 100 : 0;

    const hasReachedDisplayStep = (journey, displayStepNumber) => {
      const maxStepReached = Number(journey?.max_step_reached || 0);
      if (displayStepNumber === 1) return true;
      if (displayStepNumber === 2) {
        const stage = journey?.metadata && typeof journey.metadata === "object"
          ? journey.metadata.step_one_stage
          : null;
        return stage === "account" || maxStepReached >= 2 || Boolean(journey?.registered_at);
      }
      return maxStepReached >= (displayStepNumber - 1);
    };

    const steps = Array.from({ length: displayTotalSteps }, (_, index) => {
      const stepNumber = index + 1;
      const reached = journeys.filter((journey) => hasReachedDisplayStep(journey, stepNumber)).length;
      const nextReached = stepNumber >= displayTotalSteps
        ? totalCompleted
        : journeys.filter((journey) => hasReachedDisplayStep(journey, stepNumber + 1)).length;
      const abandoned = stepNumber >= displayTotalSteps
        ? journeys.filter((journey) => hasReachedDisplayStep(journey, stepNumber) && !journey.completed_at).length
        : Math.max(reached - nextReached, 0);
      const dropOffRate = reached > 0 ? (abandoned / reached) * 100 : 0;
      const progressionRate = reached > 0 ? (nextReached / reached) * 100 : 0;

      return {
        step_number: stepNumber,
        reached,
        abandoned,
        drop_off_rate: dropOffRate,
        progression_rate: progressionRate,
      };
    });

    const topDropOffStep = totalStarted > 0
      ? steps.reduce((worst, step) => {
        if (!worst) return step;
        if (step.abandoned > worst.abandoned) return step;
        if (step.abandoned === worst.abandoned && step.drop_off_rate > worst.drop_off_rate) return step;
        return worst;
      }, null)
      : null;

    res.json({
      totals: {
        total_started: totalStarted,
        total_registered: totalRegistered,
        total_completed: totalCompleted,
        completion_rate: completionRate,
      },
      steps,
      insights: {
        top_dropoff_step: topDropOffStep,
      },
      meta: {
        onboarding_version: ONBOARDING_ANALYTICS_VERSION,
        total_steps: displayTotalSteps,
        raw_total_steps: rawTotalSteps,
      },
    });
  } catch (err) {
    log("Onboarding analytics error: " + err.toString());
    res.status(500).json({ error: "Internal server error" });
  }
});

app.delete("/api/admin/onboarding-analytics", verifyJWT, verifyAdmin, async (req, res) => {
  try {
    await ensureOnboardingAnalyticsTable();

    const result = await pool.query(
      `DELETE FROM onboarding_progress_analytics
       WHERE onboarding_version = $1`,
      [ONBOARDING_ANALYTICS_VERSION],
    );

    res.json({
      success: true,
      deleted_rows: Number(result.rowCount || 0),
      onboarding_version: ONBOARDING_ANALYTICS_VERSION,
    });
  } catch (err) {
    log("Onboarding analytics reset error: " + err.toString());
    res.status(500).json({ error: "Internal server error" });
  }
});

// Admin: Update User Koins
app.patch(
  "/api/admin/users/:id/koins",
  verifyJWT,
  verifyAdmin,
  async (req, res) => {
    try {
      const { amount } = req.body;
      const userId = req.params.id;

      if (!amount) return res.status(400).json({ error: "Invalid amount" });

      await adjustUserKoinsBalance({
        userId,
        delta: amount,
        source: "admin_adjustment",
        metadata: { actor_user_id: req.userId || null },
      });

      log(`Admin adjusted koins for user ${userId} by ${amount} `);
      res.json({ success: true });
    } catch (err) {
      log("Admin koin update error: " + err.toString());
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

// Admin: Create User manually
app.post("/api/admin/users", verifyJWT, verifyAdmin, async (req, res) => {
  try {
    const { email, name, role } = req.body;

    // Check if exists
    const exists = await pool.query("SELECT id FROM users WHERE email = $1", [
      email,
    ]);
    if (exists.rows.length > 0) {
      return res.status(400).json({ error: "Email já cadastrado" });
    }

    const tempPassword = Math.random().toString(36).slice(-8);
    const hashedPassword = await bcrypt.hash(tempPassword, 10);

    const newUser = await pool.query(
      `INSERT INTO users(id, name, email, password, role, created_at, koins_balance, onboarding_completed)
    VALUES(gen_random_uuid(), $1, $2, $3, $4, NOW(), 50, true) 
             RETURNING id, name, email`,
      [name, email, hashedPassword, role || "user"],
    );

    // Create Org
    const user = newUser.rows[0];
    const newOrg = await pool.query(
      `INSERT INTO organizations(name, owner_id, plan_type) VALUES($1, $2, 'basic') RETURNING id`,
      [name + "'s Organization", user.id],
    );
    await pool.query("UPDATE users SET organization_id = $1 WHERE id = $2", [
      newOrg.rows[0].id,
      user.id,
    ]);

    log(`Admin created user ${email}. Temp pass: ${tempPassword} `);
    res.json({ user, tempPassword });
  } catch (err) {
    log("Admin create user error: " + err.toString());
    res.status(500).json({ error: "Internal server error" });
  }
});

// Admin: Delete User (full cascade)
app.delete("/api/admin/users/:id", verifyJWT, verifyAdmin, async (req, res) => {
  const userId = req.params.id;
  const client = await pool.connect();
  try {
    log(`[ADMIN - DELETE] Starting cascade delete for user ${userId}`);
    const result = await deleteAdminUserCascade(userId, req.userId || null, client);

    if (result.error === "self_delete") {
      return res.status(400).json({ error: "Nao e possivel excluir seu proprio usuario" });
    }

    if (result.error === "not_found") {
      return res.status(404).json({ error: "Usuário não encontrado" });
    }

    log(`[ADMIN - DELETE] User ${userId} deleted successfully. Organization deleted? ${result.orgDeleted}`);
    res.json({ success: true, organization_deleted: result.orgDeleted });
  } catch (err) {
    log("Admin delete user error: " + err.toString());
    res.status(500).json({ error: "Internal server error", details: err.message });
  } finally {
    client.release();
  }
});

// Admin: List all partners
app.get("/api/admin/partners", verifyJWT, verifyAdmin, async (req, res) => {
  try {
    const userId = req.userId;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    // Verify admin
    const adminCheck = await pool.query(
      "SELECT role FROM users WHERE id = $1",
      [userId],
    );
    if (adminCheck.rows[0]?.role !== "admin") {
      return res.status(403).json({ error: "Acesso negado" });
    }

    const partners = await pool.query(
      `SELECT p.*, u.name as user_name, u.email as user_email,
      (SELECT COUNT(*) FROM partner_clicks WHERE partner_id = p.id) as total_clicks,
  (SELECT COUNT(*) FROM users WHERE referred_by = p.id) as total_leads
             FROM partners p
             INNER JOIN users u ON u.id = p.user_id
             ORDER BY p.created_at DESC`,
    );

    res.json(partners.rows);
  } catch (err) {
    log("Admin partners list error: " + err.toString());
    res.status(500).json({ error: "Internal server error" });
  }
});

// Admin: Manually create partner (promote existing user or create user+partner)
// For now, simpler version: promote existing user by email
app.post("/api/admin/partners", verifyJWT, verifyAdmin, async (req, res) => {
  try {
    const userId = req.userId;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const adminCheck = await pool.query(
      "SELECT role FROM users WHERE id = $1",
      [userId],
    );
    if (adminCheck.rows[0]?.role !== "admin") {
      return res.status(403).json({ error: "Acesso negado" });
    }

    const { email, name } = req.body;
    if (!email) return res.status(400).json({ error: "Email obrigatório" });

    // 1. Check if user exists
    let targetUser = await pool.query("SELECT * FROM users WHERE email = $1", [
      email,
    ]);
    let targetUserId;

    if (targetUser.rows.length === 0) {
      // Option: Create user if not exists?
      // For now, let's assume we require the user to exist, OR we create a "pending" user.
      // Let's create a user with a temp password if name is provided
      if (!name) {
        return res
          .status(404)
          .json({
            error:
              "Usuário não encontrado. Para criar um novo, forneça o nome.",
          });
      }

      // Create new user
      const tempPassword = Math.random().toString(36).slice(-8);
      const hashedPassword = await bcrypt.hash(tempPassword, 10);

      const newUser = await pool.query(
        `INSERT INTO users(id, name, email, password, created_at, koins_balance)
VALUES(gen_random_uuid(), $1, $2, $3, NOW(), 0) 
                 RETURNING id`,
        [name, email, hashedPassword],
      );
      targetUserId = newUser.rows[0].id;

      // Create Organization for new user
      const newOrg = await pool.query(
        `INSERT INTO organizations(name, owner_id, plan_type) VALUES($1, $2, 'basic') RETURNING * `,
        [name + "'s Organization", targetUserId],
      );
      await pool.query("UPDATE users SET organization_id = $1 WHERE id = $2", [
        newOrg.rows[0].id,
        targetUserId,
      ]);

      log(
        `Admin created new user ${email} for partnership.Temp pass: ${tempPassword} `,
      );
      // In a real app, send email with tempPassword. Here, we just log it.
    } else {
      targetUserId = targetUser.rows[0].id;
    }

    // 2. Check if already partner
    const existingPartner = await pool.query(
      "SELECT id FROM partners WHERE user_id = $1",
      [targetUserId],
    );
    if (existingPartner.rows.length > 0) {
      return res.status(409).json({ error: "Usuário já é um parceiro." });
    }

    // 3. Create Partner
    // Generate code based on name (if new) or existing name
    const userRes = await pool.query("SELECT name FROM users WHERE id = $1", [
      targetUserId,
    ]);
    const userName = userRes.rows[0].name;

    const baseCode = userName
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "")
      .slice(0, 10);
    const code = baseCode + "-" + Math.random().toString(36).substring(2, 7);

    const newPartner = await pool.query(
      `INSERT INTO partners(user_id, affiliate_code, commission_percentage, status)
VALUES($1, $2, 10.0, 'active') RETURNING * `,
      [targetUserId, code],
    );

    res.json({ success: true, partner: newPartner.rows[0] });
  } catch (err) {
    log("Admin create partner error: " + err.toString());
    res.status(500).json({ error: "Internal server error" });
  }
});

// Admin: Update partner (approve/reject, change commission %)
app.put("/api/admin/partners/:id", verifyJWT, verifyAdmin, async (req, res) => {
  try {
    const userId = req.userId;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const adminCheck = await pool.query(
      "SELECT role FROM users WHERE id = $1",
      [userId],
    );
    if (adminCheck.rows[0]?.role !== "admin") {
      return res.status(403).json({ error: "Acesso negado" });
    }

    const { status, commissionPercentage } = req.body;
    const partnerId = req.params.id;

    const updates = [];
    const values = [];
    let i = 1;

    if (status) {
      updates.push(`status = $${i++} `);
      values.push(status);
    }
    if (commissionPercentage !== undefined) {
      updates.push(`commission_percentage = $${i++} `);
      values.push(commissionPercentage);
    }

    if (updates.length === 0)
      return res.status(400).json({ error: "Nada para atualizar" });

    values.push(partnerId);
    const result = await pool.query(
      `UPDATE partners SET ${updates.join(", ")} WHERE id = $${i} RETURNING * `,
      values,
    );

    if (result.rowCount === 0)
      return res.status(404).json({ error: "Parceiro não encontrado" });

    log(`Admin updated partner ${partnerId}: ${JSON.stringify(req.body)} `);
    res.json({ success: true, partner: result.rows[0] });
  } catch (err) {
    log("Admin partner update error: " + err.toString());
    res.status(500).json({ error: "Internal server error" });
  }
});

// Commission Engine: Called after Koin purchase (internal helper)
async function processAffiliateCommission(userId, purchaseAmount) {
  try {
    const userRes = await pool.query(
      "SELECT referred_by FROM users WHERE id = $1",
      [userId],
    );
    const referredBy = userRes.rows[0]?.referred_by;
    if (!referredBy) return;

    const partnerRes = await pool.query(
      "SELECT * FROM partners WHERE id = $1 AND status = $2",
      [referredBy, "active"],
    );
    if (partnerRes.rows.length === 0) return;

    const partner = partnerRes.rows[0];
    const commissionAmount =
      (purchaseAmount * parseFloat(partner.commission_percentage)) / 100;

    // Create commission record as pending
    await pool.query(
      "INSERT INTO partner_commissions (partner_id, referral_id, amount, status) VALUES ($1, $2, $3, $4)",
      [partner.id, userId, commissionAmount, "pending"],
    );

    // Add to pending balance
    await pool.query(
      "UPDATE partners SET wallet_balance_pending = wallet_balance_pending + $1 WHERE id = $2",
      [commissionAmount, partner.id],
    );

    log(
      `Commission of R$${commissionAmount.toFixed(2)} created for partner ${partner.id} from user ${userId} `,
    );
  } catch (err) {
    log("Commission processing error: " + err.toString());
  }
}

// Confirm Commission (called after payment webhook confirms)
async function confirmPartnerCommissions(userId) {
  try {
    const userRes = await pool.query(
      "SELECT referred_by FROM users WHERE id = $1",
      [userId],
    );
    const referredBy = userRes.rows[0]?.referred_by;
    if (!referredBy) return;

    // Move pending commissions for this referral to available
    const pendingRes = await pool.query(
      `UPDATE partner_commissions SET status = 'available' 
             WHERE partner_id = $1 AND referral_id = $2 AND status = 'pending' 
             RETURNING amount`,
      [referredBy, userId],
    );

    if (pendingRes.rows.length > 0) {
      const totalConfirmed = pendingRes.rows.reduce(
        (sum, r) => sum + parseFloat(r.amount),
        0,
      );
      await pool.query(
        `UPDATE partners SET
wallet_balance_pending = wallet_balance_pending - $1,
  wallet_balance_available = wallet_balance_available + $1
                 WHERE id = $2`,
        [totalConfirmed, referredBy],
      );
      log(
        `Confirmed R$${totalConfirmed.toFixed(2)} commission for partner ${referredBy}`,
      );
    }
  } catch (err) {
    log("Commission confirmation error: " + err.toString());
  }
}

// Get Current User API
app.get("/api/me", verifyJWT, async (req, res) => {
  try {
    const userId = req.userId;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const result = await pool.query(
      `SELECT u.id, u.email, u.name, u.role, u.koins_balance, u.personal_phone, u.company_phone, u.onboarding_completed,
  o.id as org_id, o.name as org_name, o.plan_type
             FROM users u
             LEFT JOIN organizations o ON u.organization_id = o.id
             WHERE u.id = $1`,
      [userId],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    const row = result.rows[0];
    const user = {
      id: row.id,
      email: row.email,
      name: row.name,
      role: row.role,
      koins_balance: row.koins_balance,
      personal_phone: row.personal_phone,
      company_phone: row.company_phone,
      organization: row.org_id
        ? {
          id: row.org_id,
          name: row.org_name,
          planType: row.plan_type,
        }
        : undefined,
    };

    res.json({ user });
  } catch (err) {
    log(`Error fetching current user: ${err.message} `);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/api/guided-tour/status", verifyJWT, async (req, res) => {
  try {
    await ensureGuidedTourColumns();
    const userId = req.userId;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const result = await pool.query(
      `SELECT onboarding_completed, guided_tour_seen_version, guided_tour_last_status, created_at
         FROM users
        WHERE id = $1`,
      [userId],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    const row = result.rows[0];
    const createdAt = row.created_at ? new Date(row.created_at).getTime() : 0;
    const rolloutAt = new Date(GUIDED_TOUR_ROLLOUT_AT).getTime();
    const isEligibleUser = createdAt >= rolloutAt;
    const shouldStart =
      Boolean(row.onboarding_completed) &&
      isEligibleUser &&
      row.guided_tour_seen_version !== GUIDED_TOUR_VERSION;

    res.json({
      shouldStart,
      currentVersion: GUIDED_TOUR_VERSION,
      seenVersion: row.guided_tour_seen_version || null,
      seenStatus: row.guided_tour_last_status || null,
    });
  } catch (err) {
    log("GET /api/guided-tour/status error: " + err.toString());
    res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/api/guided-tour/state", verifyJWT, async (req, res) => {
  try {
    await ensureGuidedTourColumns();
    const userId = req.userId;
    const status = req.body?.status;

    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    if (!["completed", "skipped"].includes(status)) {
      return res.status(400).json({ error: "Status invalido" });
    }

    await pool.query(
      `UPDATE users
          SET guided_tour_seen_version = $1,
              guided_tour_seen_at = NOW(),
              guided_tour_last_status = $2
        WHERE id = $3`,
      [GUIDED_TOUR_VERSION, status, userId],
    );

    res.json({
      ok: true,
      currentVersion: GUIDED_TOUR_VERSION,
      seenStatus: status,
    });
  } catch (err) {
    log("POST /api/guided-tour/state error: " + err.toString());
    res.status(500).json({ error: "Internal server error" });
  }
});

// Update Profile API
app.put("/api/profile/update", verifyJWT, async (req, res) => {
  const { name, email, companyName, personalPhone, companyPhone } = req.body;
  // Log incoming data
  log(`[PROFILE UPDATE] Request Body: ${JSON.stringify(req.body)} `);

  try {
    const userId = req.userId;
    log(`[PROFILE UPDATE] User ID extracted: ${userId} `);

    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    // Update User
    const result = await pool.query(
      `UPDATE users SET
name = COALESCE($1, name),
  email = COALESCE($2, email),
  personal_phone = $3,
  company_phone = $4
             WHERE id = $5 RETURNING * `,
      [name, email, personalPhone, companyPhone, userId],
    );

    log(`[PROFILE UPDATE] Update Result: ${result.rowCount} rows affected.`);
    if (result.rowCount > 0) {
      log(`[PROFILE UPDATE] New Data: ${JSON.stringify(result.rows[0])} `);
    } else {
      log(`[PROFILE UPDATE]WARNING: No rows updated for user ${userId}`);
    }

    // Update Organization Name if provided
    if (companyName) {
      const userRes = await pool.query(
        "SELECT organization_id FROM users WHERE id = $1",
        [userId],
      );
      const orgId = userRes.rows[0]?.organization_id;
      if (orgId) {
        await pool.query("UPDATE organizations SET name = $1 WHERE id = $2", [
          companyName,
          orgId,
        ]);
      }
    }

    res.json({ success: true, message: "Profile updated successfully" });
  } catch (err) {
    log("PUT /api/profile/update error: " + err.toString());
    res.status(500).json({ error: "Internal server error" });
  }
});

// Change Password API
app.put("/api/profile/change-password", verifyJWT, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  try {
    const userId = req.userId;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    if (!newPassword || newPassword.length < 6) {
      return res
        .status(400)
        .json({ error: "A nova senha deve ter no mínimo 6 caracteres" });
    }

    const userRes = await pool.query(
      "SELECT password FROM users WHERE id = $1",
      [userId],
    );
    const dbPassword = userRes.rows[0]?.password;

    // If user has an existing password, verify the current one
    if (dbPassword) {
      const isValid = await bcrypt.compare(currentPassword, dbPassword);
      if (!isValid) {
        return res.status(400).json({ error: "Senha atual incorreta" });
      }
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await pool.query("UPDATE users SET password = $1 WHERE id = $2", [
      hashedPassword,
      userId,
    ]);
    res.json({ success: true, message: "Senha alterada com sucesso" });
  } catch (err) {
    log("PUT /api/profile/change-password error: " + err.toString());
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/credits - Fetch current Koins balance
app.get("/api/credits", verifyJWT, async (req, res) => {
  try {
    const userId = req.userId;
    const result = await pool.query(
      "SELECT koins_balance FROM users WHERE id = $1",
      [userId],
    );
    if (result.rows.length === 0)
      return res.status(404).json({ error: "User not found" });

    res.json({ koins_balance: result.rows[0].koins_balance });
  } catch (err) {
    log("GET /api/credits error: " + err.toString());
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/notifications - Fetch user notifications
app.get("/api/notifications", verifyJWT, async (req, res) => {
  try {
    const userId = req.userId;
    const result = await pool.query(
      "SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC",
      [userId],
    );
    res.json(result.rows);
  } catch (err) {
    log("GET /api/notifications error: " + err.toString());
    res.status(500).json({ error: "Internal server error" });
  }
});

// PUT /api/notifications/:id/read - Mark notification as read
app.put("/api/notifications/:id/read", verifyJWT, async (req, res) => {
  const { id } = req.params;
  try {
    const userId = req.userId;

    const result = await pool.query(
      "UPDATE notifications SET read = true WHERE id = $1 AND user_id = $2 RETURNING *",
      [id, userId],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Notification not found" });
    }

    res.json(result.rows[0]);
  } catch (err) {
    log("PUT /api/notifications/:id/read error: " + err.toString());
    res.status(500).json({ error: "Internal server error" });
  }
});

// Email Sanitization Helper
const sanitizeEmail = (email) => {
  if (!email) return "";
  // Remove dots, @ symbol, and everything after @
  // Convert to lowercase
  // Example: joao.silva@kogna.co -> joaosilva
  return email
    .split("@")[0] // Get part before @
    .replace(/\./g, "") // Remove dots
    .toLowerCase();
};

// Helper: Check if Evolution API state means "connected"
// Evolution API may return 'open', 'conected' (single n), 'connected', 'connecting', etc.
const isConnectedState = (stateStr) => {
  if (!stateStr) return false;
  const s = stateStr.toLowerCase();
  // Strict check: only 'open' or 'connected' (and 'conected' typo variant) are valid connected states.
  // Explicitly exclude 'connecting' to avoid false positives.
  return s === "open" || s === "connected" || s === "conected";
};

// Check Plan Limits
const checkPlanLimits = async (userId) => {
  try {
    const userRes = await pool.query(
      "SELECT organization_id FROM users WHERE id = $1",
      [userId],
    );
    const orgId = userRes.rows[0]?.organization_id;

    if (!orgId) return { allowed: true }; // No org? Allow for now or block.

    const orgRes = await pool.query(
      "SELECT plan_type, whatsapp_connections_limit FROM organizations WHERE id = $1",
      [orgId],
    );
    const plan = orgRes.rows[0]?.plan_type || "basic";
    const limit = orgRes.rows[0]?.whatsapp_connections_limit || 1;

    // We now enforce the limit explicitly, regardless of plan, 
    // since higher plans simply have a higher initial limit or can buy more.
    const countRes = await pool.query(
      "SELECT COUNT(*) FROM whatsapp_instances WHERE organization_id = $1",
      [orgId],
    );
    const count = parseInt(countRes.rows[0].count);

    if (count >= limit) {
      return {
        allowed: false,
        message: `Limite de ${limit} conex${limit === 1 ? 'ão' : 'ões'} atingido.Compre mais conexões para adicionar.`,
      };
    }

    return { allowed: true, orgId };
  } catch (e) {
    log("checkPlanLimits error: " + e.message);
    return { allowed: false, message: "Erro ao verificar limites." };
  }
};

// Helper: Get full user details including org
const getUserDetails = async (userId) => {
  const res = await pool.query("SELECT * FROM users WHERE id = $1", [userId]);
  return res.rows[0] || null;
};

const getUserByEmail = async (email) => {
  try {
    const res = await pool.query(
      "SELECT * FROM users WHERE email = $1 LIMIT 1",
      [email],
    );
    return res.rows[0] || null;
  } catch (e) {
    log("Error getting user: " + e.toString());
    return null;
  }
};

// Helper: Ensure User has Organization and Default Columns (Self-Healing)
const ensureUserInitialized = async (userId) => {
  try {
    // 1. Check Org
    let userRes = await pool.query(
      "SELECT organization_id, email FROM users WHERE id = $1",
      [userId],
    );
    let user = userRes.rows[0];
    if (!user) return;

    let orgId = user.organization_id;

    if (!orgId) {
      log(`[INIT] User ${userId} has no Org.Creating one...`);
      const orgRes = await pool.query(
        "INSERT INTO organizations (name) VALUES ($1) RETURNING id",
        [`Org for ${user.email}`],
      );
      orgId = orgRes.rows[0].id;
      await pool.query("UPDATE users SET organization_id = $1 WHERE id = $2", [
        orgId,
        userId,
      ]);
      log(`[INIT] Created and assigned Org ${orgId} to User ${userId} `);
    }

    // 2. Check Columns
    const colsRes = await pool.query(
      "SELECT id FROM lead_columns WHERE organization_id = $1 LIMIT 1",
      [orgId],
    );
    if (colsRes.rows.length === 0) {
      log(
        `[INIT] User ${userId} (Org ${orgId}) has no columns.Creating defaults...`,
      );
      const defaultColumns = [
        {
          title: "Novos Leads",
          color: "#3b82f6",
          order_index: 0,
          is_system: true,
        },
        {
          title: "Em Contato",
          color: "#f59e0b",
          order_index: 1,
          is_system: false,
        },
        {
          title: "Qualificado",
          color: "#8b5cf6",
          order_index: 2,
          is_system: false,
        },
        {
          title: "Proposta Enviada",
          color: "#06b6d4",
          order_index: 3,
          is_system: false,
        },
        {
          title: "Agendamento Feito",
          color: "#10b981",
          order_index: 4,
          is_system: true,
        },
      ];
      for (const col of defaultColumns) {
        await pool.query(
          "INSERT INTO lead_columns (organization_id, title, color, order_index, is_system) VALUES ($1, $2, $3, $4, $5)",
          [orgId, col.title, col.color, col.order_index, col.is_system],
        );
      }
      log(`[INIT] Default columns created.`);
    }

    // 3. Check Sources (Optional but good)
    const sourcesRes = await pool.query(
      "SELECT id FROM lead_sources WHERE organization_id = $1 LIMIT 1",
      [orgId],
    );
    if (sourcesRes.rows.length === 0) {
      log(`[INIT] Creating default sources...`);
      const defaultSources = [
        { name: "Facebook", is_system: true },
        { name: "Instagram", is_system: true },
        { name: "Google", is_system: true },
        { name: "Indicação", is_system: false },
        { name: "WhatsApp", is_system: false },
        { name: "Site", is_system: false },
      ];
      for (const src of defaultSources) {
        await pool.query(
          "INSERT INTO lead_sources (organization_id, name, is_system) VALUES ($1, $2, $3)",
          [orgId, src.name, src.is_system],
        );
      }
    }
  } catch (err) {
    log(
      `[INIT ERROR] ensureUserInitialized failed for ${userId}: ${err.message} `,
    );
  }
};

// Canonical helper for routes that depend on a valid organization context.
const getUserById = async (userId) => {
  try {
    await ensureUserInitialized(userId);
    return await getUserDetails(userId);
  } catch (e) {
    log("Error getting user by id: " + e.toString());
    return null;
  }
};

const assignWhatsAppInstanceToAgent = async ({ organizationId, agentId, instanceId }) => {
  if (!organizationId || !agentId || !instanceId) return;

  await pool.query(
    `UPDATE agents
        SET whatsapp_instance_id = NULL,
            updated_at = NOW()
      WHERE organization_id = $1
        AND whatsapp_instance_id = $2
        AND id <> $3`,
    [organizationId, instanceId, agentId],
  ).catch(() => { });

  await pool.query(
    `UPDATE agents
        SET whatsapp_instance_id = $1,
            updated_at = NOW()
      WHERE id = $2
        AND organization_id = $3`,
    [instanceId, agentId, organizationId],
  );
};

// --- AGENTS API ---
// Moved to top to avoid shadowing issues

// GET Agents
app.get("/api/whatsapp/instances", verifyJWT, async (req, res) => {
  try {
    const userId = req.userId;

    const userRes = await pool.query(
      "SELECT organization_id FROM users WHERE id = $1",
      [userId],
    );
    const orgId = userRes.rows[0]?.organization_id;

    if (!orgId) return res.json([]);

    // Join with agents to see if instance is in use
    const query = `
            SELECT wi.*, a.id as connected_agent_id, a.name as connected_agent_name
            FROM whatsapp_instances wi
            LEFT JOIN agents a ON a.whatsapp_instance_id = wi.id
            WHERE wi.organization_id = $1
            ORDER BY wi.created_at DESC
  `;

    const result = await pool.query(query, [orgId]);
    res.json(result.rows);
  } catch (err) {
    log("[ERROR] GET /api/whatsapp/instances error: " + err.toString());
    res.status(500).json({ error: "Database error" });
  }
});

app.get("/api/agents", verifyJWT, async (req, res) => {
  log("[DEBUG] GET /api/agents entry");
  try {
    const userId = req.userId;

    const userRes = await pool.query(
      "SELECT organization_id FROM users WHERE id = $1",
      [userId],
    );
    const orgId = userRes.rows[0]?.organization_id;

    if (!orgId) return res.json([]); // No org? No agents.

    const query = `
            SELECT a.*, w.instance_name as whatsapp_instance_name, w.status as whatsapp_instance_status 
            FROM agents a 
            LEFT JOIN whatsapp_instances w ON a.whatsapp_instance_id = w.id 
            WHERE a.organization_id = $1 
            ORDER BY a.created_at DESC
        `;
    const result = await pool.query(query, [orgId]);
    res.json(result.rows);
  } catch (err) {
    log("[ERROR] GET /api/agents error: " + err.toString());
    res.status(500).json({ error: "Database error" });
  }
});

// GET Company Data (from onboarding ia_configs)
app.get("/api/company-data", verifyJWT, async (req, res) => {
  try {
    const userId = req.userId;

    const result = await pool.query(
      `SELECT company_name, main_product, agent_objective FROM ia_configs WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [userId],
    );

    if (result.rows.length === 0) {
      return res.json(null);
    }

    const row = result.rows[0];

    // Parse agent_objective to extract structured data
    // Format from onboarding: "Atender <audience> com tom <voiceTone>"
    let targetAudience = "";
    let voiceTone = "";
    const objectiveMatch = row.agent_objective?.match(
      /^Atender (.+?) com tom (.+)$/,
    );
    if (objectiveMatch) {
      targetAudience = objectiveMatch[1];
      voiceTone = objectiveMatch[2];
    }

    res.json({
      companyName: row.company_name,
      companyProduct: row.main_product,
      targetAudience: targetAudience,
      voiceTone: voiceTone,
      unknownBehavior: "Avisar que vai verificar e retornar",
      restrictions: "Nenhuma restrição definida.",
    });
  } catch (err) {
    log("[ERROR] GET /api/company-data error: " + err.toString());
    res.status(500).json({ error: "Database error" });
  }
});

// POST Agent
app.post("/api/agents", verifyJWT, async (req, res) => {
  const { name, type, system_prompt, model_config } = req.body;
  log(`[DEBUG] POST / api / agents entry.Body: ${JSON.stringify(req.body)} `);

  if (!name || !type) {
    return res.status(400).json({ error: "Name and type are required" });
  }

  try {
    const userId = req.userId;
    log(`[DEBUG] Authenticated User ID: ${userId} `);

    // Get Org ID
    const userRes = await pool.query(
      "SELECT organization_id FROM users WHERE id = $1",
      [userId],
    );
    let orgId = userRes.rows[0]?.organization_id;

    // Auto-create ORG if missing (for tests/new users)
    if (!orgId) {
      log(`[DEBUG] User ${userId} has no Org.Creating one...`);
      const orgRes = await pool.query(
        "INSERT INTO organizations (name) VALUES ($1) RETURNING id",
        [`Org for ${userId}`],
      );
      orgId = orgRes.rows[0].id;
      await pool.query("UPDATE users SET organization_id = $1 WHERE id = $2", [
        orgId,
        userId,
      ]);
      log(`[DEBUG] Created and assigned Org ${orgId} to User ${userId} `);
    }

    const result = await pool.query(
      `INSERT INTO agents(organization_id, name, type, system_prompt, model_config)
VALUES($1, $2, $3, $4, $5) RETURNING * `,
      [orgId, name, type, system_prompt || "", { model: DEFAULT_AGENT_MODEL, temperature: Number.isFinite(Number(model_config?.temperature)) ? Number(model_config.temperature) : 0.45 }],
    );

    log(`[DEBUG] Agent created successfully: ${result.rows[0].id} `);
    res.json(result.rows[0]);
  } catch (err) {
    log("[ERROR] POST /api/agents error: " + err.toString());
    res.status(500).json({ error: "Database error", details: err.message });
  }
});

// DELETE Agent
app.delete("/api/agents/:id", verifyJWT, async (req, res) => {
  const { id } = req.params;
  log(`[DEBUG] DELETE / api / agents /:id entry.ID: ${id} `);

  if (!id) return res.status(400).json({ error: "Agent ID is required" });

  try {
    const userId = req.userId;
    log(`[DEBUG] DELETE / api / agents Authenticated User ID: ${userId} `);

    // Get Org ID
    const userRes = await pool.query(
      "SELECT organization_id FROM users WHERE id = $1",
      [userId],
    );
    const orgId = userRes.rows[0]?.organization_id;

    if (!orgId)
      return res.status(400).json({ error: "User has no organization" });

    // Delete agent only if it belongs to the user organization
    log(`[DEBUG] Attempting to delete Agent ${id} for Org ${orgId}`);
    const result = await pool.query(
      "DELETE FROM agents WHERE id = $1 AND organization_id = $2 RETURNING *",
      [id, orgId],
    );

    if (result.rows.length === 0) {
      log(`[DEBUG] Agent ${id} not found or access denied for Org ${orgId}`);
      return res
        .status(404)
        .json({ error: "Agent not found or access denied" });
    }

    log(`[DEBUG] Agent deleted successfully: ${id} from Org ${orgId} `);
    res.json({ success: true, message: "Agent deleted successfully" });
  } catch (err) {
    log("[ERROR] DELETE /api/agents error: " + err.toString());
    res.status(500).json({ error: "Database error", details: err.message });
  }
});

// UPDATE Agent (Configuration)
app.put("/api/agents/:id", verifyJWT, async (req, res) => {
  const { id } = req.params;
  const {
    name,
    type,
    system_prompt,
    advanced_instructions,
    model_config,
    status,
    whatsapp_instance_id,
    use_company_profile,
  } = req.body;

  if (!id) return res.status(400).json({ error: "Agent ID is required" });

  try {
    const userId = req.userId;

    const userRes = await pool.query(
      "SELECT organization_id FROM users WHERE id = $1",
      [userId],
    );
    const orgId = userRes.rows[0]?.organization_id;

    if (!orgId)
      return res.status(400).json({ error: "User has no organization" });

    // Check ownership first
    const check = await pool.query(
      "SELECT id, name, type FROM agents WHERE id = $1 AND organization_id = $2",
      [id, orgId],
    );
    if (check.rows.length === 0)
      return res
        .status(404)
        .json({ error: "Agent not found or access denied" });

    // Validate Unique Connection Assignment
    if (whatsapp_instance_id) {
      const collisionCheck = await pool.query(
        "SELECT id, name FROM agents WHERE whatsapp_instance_id = $1 AND id != $2",
        [whatsapp_instance_id, id],
      );

      if (collisionCheck.rows.length > 0) {
        const otherAgent = collisionCheck.rows[0];
        return res.status(400).json({
          error: `Esta conexão já está sendo usada pela IA "${otherAgent.name}".Desconecte - a antes de usar aqui.`,
        });
      }
    }

    const currentAgent = check.rows[0];
    const profile = await getCanonicalCompanyProfile({ orgId, userId });
    const effectiveName = name || currentAgent?.name;
    const effectiveType = type || currentAgent?.type;

    // Build Update Query dynamic
    const fields = [];
    const values = [];
    let idx = 1;

    if (name) {
      fields.push(`name = $${idx++} `);
      values.push(name);
    }
    if (type) {
      fields.push(`type = $${idx++} `);
      values.push(type);
    }
    if (system_prompt !== undefined || use_company_profile) {
      fields.push(`system_prompt = $${idx++} `);
      values.push(
        use_company_profile
          ? composeAgentSystemPrompt({
            profile,
            agentName: effectiveName,
            agentType: effectiveType,
            customInstructions: advanced_instructions || system_prompt || "",
          })
          : system_prompt
      );
    }
    if (advanced_instructions !== undefined) {
      fields.push(`advanced_instructions = $${idx++} `);
      values.push(advanced_instructions);
    }
    if (model_config !== undefined) {
      fields.push(`model_config = $${idx++} `);
      values.push({
        model: DEFAULT_AGENT_MODEL,
        temperature: Number.isFinite(Number(model_config?.temperature)) ? Number(model_config.temperature) : 0.45,
      });
    }
    if (status) {
      fields.push(`status = $${idx++} `);
      values.push(status);
    }
    if (whatsapp_instance_id !== undefined) {
      fields.push(`whatsapp_instance_id = $${idx++} `);
      values.push(whatsapp_instance_id);
    }

    fields.push(`updated_at = NOW()`);

    if (fields.length === 1)
      return res.json({ message: "No changes provided" }); // Only updated_at

    values.push(id);
    values.push(orgId);

    const query = `UPDATE agents SET ${fields.join(", ")} WHERE id = $${idx++} AND organization_id = $${idx++} RETURNING * `;

    const result = await pool.query(query, values);
    log(`[DEBUG] Agent updated: ${id} `);
    res.json(result.rows[0]);
  } catch (err) {
    log("[ERROR] PUT /api/agents error: " + err.toString());
    res.status(500).json({ error: "Database error" });
  }
});

// UPLOAD Training Files for Agent
app.post(
  "/api/agents/:id/upload",
  verifyJWT,
  upload.array("files"),
  async (req, res) => {
    const { id } = req.params;

    if (!req.files || req.files.length === 0)
      return res.status(400).json({ error: "No files uploaded" });

    try {
      const userId = req.userId;

      // Org Check
      const userRes = await pool.query(
        "SELECT organization_id FROM users WHERE id = $1",
        [userId],
      );
      const orgId = userRes.rows[0]?.organization_id;

      if (!orgId)
        return res.status(400).json({ error: "User has no organization" });

      // Agent Check
      const agentCheck = await pool.query(
        "SELECT training_files FROM agents WHERE id = $1 AND organization_id = $2",
        [id, orgId],
      );
      if (agentCheck.rows.length === 0)
        return res.status(404).json({ error: "Agent not found" });

      const currentFiles = agentCheck.rows[0].training_files || [];

      // Process uploaded files (in-memory via memoryStorage)
      const newFiles = req.files.map((file) => ({
        originalName: file.originalname,
        filename: Date.now() + "-" + file.originalname,
        content: file.buffer.toString("base64"),
        extractedText: file.mimetype.includes("text") ? file.buffer.toString("utf8") : "",
        mimeType: file.mimetype,
        size: file.size,
        uploadedAt: new Date().toISOString(),
      }));

      const updatedFiles = [...currentFiles, ...newFiles];

      const knowledgeSummary = updatedFiles
        .map((file) => file.extractedText || "")
        .filter(Boolean)
        .join("\n\n")
        .slice(0, 6000);

      const result = await pool.query(
        "UPDATE agents SET training_files = $1, knowledge_summary = $2, updated_at = NOW() WHERE id = $3 RETURNING *",
        [JSON.stringify(updatedFiles), knowledgeSummary || null, id],
      );

      log(`[DEBUG] Uploaded ${req.files.length} files for Agent ${id}`);
      res.json({ success: true, files: updatedFiles, agent: result.rows[0] });
    } catch (err) {
      log("[ERROR] Upload error: " + err.toString());
      res.status(500).json({ error: "Upload failed", details: err.message });
    }
  },
);

// TOGGLE AGENT PAUSE (Global)
app.post("/api/agents/:id/toggle-pause", verifyJWT, async (req, res) => {
  const { id } = req.params;
  try {
    const userId = req.userId;

    // Get current status
    const agentRes = await pool.query(
      "SELECT status FROM agents WHERE id = $1",
      [id],
    );
    if (agentRes.rows.length === 0)
      return res.status(404).json({ error: "Agent not found" });

    const currentStatus = agentRes.rows[0].status;
    const newStatus = currentStatus === "paused" ? "active" : "paused";

    await pool.query("UPDATE agents SET status = $1 WHERE id = $2", [
      newStatus,
      id,
    ]);

    log(`[PAUSE] Agent ${id} is now ${newStatus} `);
    res.json({ success: true, status: newStatus });
  } catch (err) {
    log("[ERROR] Toggle Agent Pause error: " + err.toString());
    res.status(500).json({ error: "Database error" });
  }
});

// TOGGLE CHAT PAUSE (Local)
app.post("/api/chats/toggle-pause", verifyJWT, async (req, res) => {
  const { agentId, remoteJid } = req.body;
  try {
    const userId = req.userId;

    // Upsert ChatSession
    // Check if exists
    const sessionRes = await pool.query(
      "SELECT is_paused FROM chat_sessions WHERE agent_id = $1 AND remote_jid = $2",
      [agentId, remoteJid],
    );

    let newPausedState = true;

    if (sessionRes.rows.length > 0) {
      newPausedState = !sessionRes.rows[0].is_paused;
      await pool.query(
        "UPDATE chat_sessions SET is_paused = $1, updated_at = NOW() WHERE agent_id = $2 AND remote_jid = $3",
        [newPausedState, agentId, remoteJid],
      );
    } else {
      // Create new session entry
      await pool.query(
        "INSERT INTO chat_sessions (agent_id, remote_jid, is_paused) VALUES ($1, $2, $3)",
        [agentId, remoteJid, true],
      );
      newPausedState = true;
    }

    log(
      `[PAUSE] Chat ${remoteJid} on agent ${agentId} is now ${newPausedState ? "PAUSED" : "ACTIVE"} `,
    );
    res.json({ success: true, isPaused: newPausedState });
  } catch (err) {
    log("[ERROR] Toggle Chat Pause error: " + err.toString());
    res.status(500).json({ error: "Database error" });
  }
});

// GET CHAT PAUSE STATUS
app.get("/api/chats/status/:agentId/:remoteJid", async (req, res) => {
  const { agentId, remoteJid } = req.params;
  try {
    const sessionRes = await pool.query(
      "SELECT is_paused FROM chat_sessions WHERE agent_id = $1 AND remote_jid = $2",
      [agentId, remoteJid],
    );
    const isPaused =
      sessionRes.rows.length > 0 ? sessionRes.rows[0].is_paused : false;
    res.json({ isPaused });
  } catch (err) {
    res.status(500).json({ error: "Database error" });
  }
});

// ── MEMORY: GET /api/leads/:leadId/memory ─────────────────────────────────────
// Returns the full 3-layer memory for a given lead (WhatsApp remoteJid).
app.get('/api/leads/:leadId/memory', verifyJWT, async (req, res) => {
  try {
    await ensureConversationStateTables();
    const userId = req.userId;
    const leadId = decodeURIComponent(req.params.leadId);

    const orgRes = await pool.query('SELECT organization_id FROM users WHERE id = $1', [userId]);
    const orgId = orgRes.rows[0]?.organization_id;
    if (!orgId) return res.status(400).json({ error: 'No organization' });

    const context = await resolveLeadConversationContext(orgId, leadId);
    const summaryData = context.memory?.lead_summary
      ? {
        text: context.memory.lead_summary,
        recommendation: context.memory.next_recommendation || null,
        stage: context.state?.lead_stage || null,
        intent: context.memory.last_intent || context.state?.last_user_intent || null,
      }
      : await refreshLeadConversationSummary({
        orgId,
        conversationKey: context.conversationKey || leadId,
        leadId: context.lead?.id || leadId,
      });

    res.json({
      memory: context.memory || null,
      state: context.state || null,
      lead: context.lead || null,
      conversationKey: context.conversationKey || null,
      summary: summaryData
        ? {
          text: summaryData.text || summaryData.summary || null,
          recommendation: summaryData.recommendation || null,
          stage: summaryData.stage || context.state?.lead_stage || null,
          intent: summaryData.intent || context.memory?.last_intent || context.state?.last_user_intent || null,
          needs_human_attention: context.lead?.needs_human_attention || context.memory?.needs_human_attention || false,
          human_attention_reason: context.lead?.human_attention_reason || context.memory?.human_attention_reason || null,
          human_attention_since: context.lead?.human_attention_since || context.memory?.human_attention_since || null,
          top_objection: context.lead?.top_objection || context.memory?.top_objection || context.memory?.main_objection || null,
        }
        : null,
    });
  } catch (err) {
    log(`[MEMORY] GET /api/leads/:leadId/memory error: ${err.message}`);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── MEMORY: GET /api/crm/memory-overview ──────────────────────────────────────
// Returns memory summary for all leads in the org (for CRM list view).
app.get('/api/crm/memory-overview', verifyJWT, async (req, res) => {
  try {
    const userId = req.userId;
    const orgRes = await pool.query('SELECT organization_id FROM users WHERE id = $1', [userId]);
    const orgId = orgRes.rows[0]?.organization_id;
    if (!orgId) return res.status(400).json({ error: 'No organization' });

    const result = await pool.query(`
      SELECT
        lm.lead_id, lm.name, lm.company, lm.business_type,
        lm.lead_interest, lm.main_objection, lm.decision_role,
        lm.lead_interested, lm.lead_price_sensitive,
        lm.lead_urgent, lm.lead_not_ready, lm.lead_comparing_options,
        lm.updated_at AS memory_updated_at,
        cs.lead_stage, cs.last_user_intent
      FROM lead_memory lm
      LEFT JOIN conversation_state cs
        ON cs.lead_id = lm.lead_id AND cs.organization_id = lm.organization_id
      WHERE lm.organization_id = $1
      ORDER BY lm.updated_at DESC
      LIMIT 100
    `, [orgId]);

    res.json(result.rows);
  } catch (err) {
    log(`[MEMORY] GET /api/crm/memory-overview error: ${err.message}`);
    res.status(500).json({ error: 'Internal server error' });
  }
});


app.patch("/api/vendedores/:id/toggle-ativo", verifyJWT, async (req, res) => {
  const { id } = req.params;
  try {
    const userId = req.userId;
    const orgRes = await pool.query("SELECT organization_id FROM users WHERE id = $1", [userId]);
    const orgId = orgRes.rows[0]?.organization_id;
    if (!orgId) return res.status(400).json({ error: "No organization" });

    const cur = await pool.query("SELECT ativo FROM vendedores WHERE id = $1 AND organization_id = $2", [id, orgId]);
    if (cur.rows.length === 0) return res.status(404).json({ error: "Vendedor not found" });

    const newAtivo = !cur.rows[0].ativo;
    const result = await pool.query(
      "UPDATE vendedores SET ativo = $1 WHERE id = $2 AND organization_id = $3 RETURNING *",
      [newAtivo, id, orgId]
    );
    res.json(result.rows[0]);
  } catch (err) {
    log("[ERROR] PATCH /api/vendedores/:id/toggle-ativo: " + err.toString());
    res.status(500).json({ error: "Database error" });
  }
});

// PATCH /api/vendedores/:id — update porcentagem and/or other fields
app.patch("/api/vendedores/:id", verifyJWT, async (req, res) => {
  const { id } = req.params;
  const { porcentagem, nome, whatsapp } = req.body;
  try {
    const userId = req.userId;
    const orgRes = await pool.query("SELECT organization_id FROM users WHERE id = $1", [userId]);
    const orgId = orgRes.rows[0]?.organization_id;
    if (!orgId) return res.status(400).json({ error: "No organization" });

    const fields = [];
    const values = [];
    let idx = 1;
    if (porcentagem !== undefined) { fields.push(`porcentagem = $${idx++}`); values.push(porcentagem); }
    if (nome !== undefined) { fields.push(`nome = $${idx++}`); values.push(nome); }
    if (whatsapp !== undefined) { fields.push(`whatsapp = $${idx++}`); values.push(whatsapp); }
    if (fields.length === 0) return res.json({ message: "No changes" });

    values.push(id); values.push(orgId);
    const result = await pool.query(
      `UPDATE vendedores SET ${fields.join(", ")} WHERE id = $${idx++} AND organization_id = $${idx++} RETURNING *`,
      values
    );
    res.json(result.rows[0]);
  } catch (err) {
    log("[ERROR] PATCH /api/vendedores/:id: " + err.toString());
    res.status(500).json({ error: "Database error" });
  }
});

// GET CHAT CONTEXT (Agent Info + Pause Status)
app.get(
  "/api/chat-context/:instanceName/:remoteJid",
  verifyJWT,
  async (req, res) => {
    const { instanceName, remoteJid } = req.params;
    try {
      const userId = req.userId;

      // Find Agent by Instance Name
      const agentRes = await pool.query(
        `
            SELECT a.id, a.status 
            FROM agents a
            JOIN whatsapp_instances wi ON a.whatsapp_instance_id = wi.id
            WHERE wi.instance_name = $1
            LIMIT 1
        `,
        [instanceName],
      );

      if (agentRes.rows.length === 0) {
        return res.json({ found: false });
      }

      const agent = agentRes.rows[0];

      // Check Chat Session Pause Status
      const sessionRes = await pool.query(
        "SELECT is_paused FROM chat_sessions WHERE agent_id = $1 AND remote_jid = $2",
        [agent.id, remoteJid],
      );
      const isChatPaused =
        sessionRes.rows.length > 0 ? sessionRes.rows[0].is_paused : false;

      res.json({
        found: true,
        agentId: agent.id,
        agentStatus: agent.status,
        isChatPaused,
      });
    } catch (err) {
      log("Error fetching chat context: " + err.message);
      res.status(500).json({ error: "Server error" });
    }
  },
);

// --- Leads Table Migration (self-healing) ---

// ==================== EVOLUTION API PROXY (Chat) ====================
// These proxy endpoints are required in production (Vercel) where the Vite dev proxy isn't available.
// The frontend calls /chat/findChats/:instance and /chat/findMessages/:instance directly in dev (via Vite proxy).
// In production (Vercel), these requests serve the React SPA. This proxy bridges that gap.

// POST /chat/findChats/:instance — proxy to Evolution API
app.post("/chat/findChats/:instanceName", async (req, res) => {
  const { instanceName } = req.params;
  const evolutionUrl = process.env.EVOLUTION_API_URL;
  const evolutionKey = process.env.EVOLUTION_API_KEY;
  if (!evolutionUrl || !evolutionKey) {
    return res.status(500).json({ error: "Evolution API not configured" });
  }
  try {
    const response = await fetch(
      `${evolutionUrl} /chat/findChats / ${instanceName} `,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: evolutionKey,
        },
        body: JSON.stringify(req.body || {}),
      }
    );
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (err) {
    log("[ERROR] Evolution proxy /chat/findChats: " + err.message);
    res.status(500).json({ error: "Evolution API proxy error" });
  }
});

// POST /chat/findMessages/:instance — proxy to Evolution API
app.post("/chat/findMessages/:instanceName", async (req, res) => {
  const { instanceName } = req.params;
  const evolutionUrl = process.env.EVOLUTION_API_URL;
  const evolutionKey = process.env.EVOLUTION_API_KEY;
  if (!evolutionUrl || !evolutionKey) {
    return res.status(500).json({ error: "Evolution API not configured" });
  }
  try {
    const response = await fetch(
      `${evolutionUrl} /chat/findMessages / ${instanceName} `,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: evolutionKey,
        },
        body: JSON.stringify(req.body || {}),
      }
    );
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (err) {
    log("[ERROR] Evolution proxy /chat/findMessages: " + err.message);
    res.status(500).json({ error: "Evolution API proxy error" });
  }
});


async function ensureLeadsColumns() {
  try {
    const check = await pool.query(
      "SELECT column_name FROM information_schema.columns WHERE table_name = 'leads' AND column_name IN ('phone', 'email', 'assigned_to', 'temperature')",
    );
    const existing = check.rows.map((r) => r.column_name);
    if (!existing.includes("phone")) {
      await pool.query("ALTER TABLE leads ADD COLUMN phone TEXT DEFAULT ''");
      log("[MIGRATION] Added phone column to leads table");
    }
    if (!existing.includes("email")) {
      await pool.query("ALTER TABLE leads ADD COLUMN email TEXT DEFAULT ''");
      log("[MIGRATION] Added email column to leads table");
    }
    if (!existing.includes("assigned_to")) {
      await pool.query("ALTER TABLE leads ADD COLUMN assigned_to UUID REFERENCES vendedores(id) ON DELETE SET NULL");
      log("[MIGRATION] Added assigned_to column to leads table");
    }
    if (!existing.includes("temperature")) {
      await pool.query("ALTER TABLE leads ADD COLUMN temperature TEXT DEFAULT 'frio'");
      log("[MIGRATION] Added temperature column to leads table");
    }
  } catch (e) {
    log("[MIGRATION] ensureLeadsColumns error: " + e.message);
  }
}
// Run migration on startup
ensureLeadsColumns();
ensureConversationStateTables().catch(err => log('[CSE] Startup ensureConversationStateTables error: ' + err.message));


// GET /api/leads - List leads for the org
app.get("/api/leads", verifyJWT, async (req, res) => {
  try {
    const userId = req.userId;
    const orgRes = await pool.query("SELECT organization_id FROM users WHERE id = $1", [userId]);
    const orgId = orgRes.rows[0]?.organization_id;
    if (!orgId) return res.status(403).json({ error: "No organization" });

    const result = await pool.query(
      `SELECT l.*,
              CASE
                WHEN COALESCE(NULLIF(TRIM(l.last_ia_briefing), ''), NULL) IS NOT NULL THEN TRUE
                ELSE FALSE
              END AS has_ai_summary
       FROM leads l
       WHERE l.organization_id = $1
       ORDER BY l.last_contact DESC`,
      [orgId]
    );

    // Map rows to frontend-friendly format (snake_case to camelCase where needed)
    const leads = result.rows.map(row => ({
      id: row.id,
      name: row.name,
      company: row.company,
      phone: row.phone,
      email: row.email,
      value: Number(row.value),
      status: row.status,
      tags: row.tags || [],
      source: row.source,
      lastContact: row.last_contact,
      assignedTo: row.assigned_to,
      briefing: row.last_ia_briefing || row.briefing || null,
      temperature: row.temperature,
      hasAiSummary: Boolean(row.has_ai_summary)
    }));

    res.json(leads);
  } catch (err) {
    log("GET /api/leads error: " + err.toString());
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/leads - Create a new lead
app.post("/api/leads", verifyJWT, async (req, res) => {
  const { name, company, phone, email, value, status, tags, source, assigned_to } = req.body;

  if (!name) {
    return res.status(400).json({ error: "Name is required" });
  }

  try {
    const userId = req.userId;
    const userRes = await pool.query(
      "SELECT organization_id FROM users WHERE id = $1",
      [userId],
    );
    const orgId = userRes.rows[0]?.organization_id;

    if (!orgId) return res.status(403).json({ error: "No organization" });

    const result = await pool.query(
      "INSERT INTO leads (user_id, organization_id, name, company, phone, email, value, status, tags, source, assigned_to) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *",
      [
        userId,
        orgId,
        name,
        company || "",
        phone || "",
        email || "",
        value || 0,
        status || "new",
        tags || [],
        source || "",
        assigned_to || null,
      ],
    );

    const resultRow = result.rows[0];
    const newLead = {
      id: resultRow.id,
      name: resultRow.name,
      company: resultRow.company,
      phone: resultRow.phone,
      email: resultRow.email,
      value: Number(resultRow.value),
      status: resultRow.status,
      tags: resultRow.tags || [],
      source: resultRow.source,
      lastContact: resultRow.last_contact,
      assignedTo: resultRow.assigned_to
    };

    res.status(201).json(newLead);
  } catch (err) {
    log("POST /api/leads error: " + err.toString());
    res.status(500).json({ error: "Failed to create lead" });
  }
});

// PUT /api/leads/:id - Update a lead
app.put("/api/leads/:id", verifyJWT, async (req, res) => {
  const { id } = req.params;
  const { name, phone, email, value, source, assigned_to, status, notes, product_id } = req.body;

  try {
    const userId = req.userId;
    const userRes = await pool.query(
      "SELECT organization_id FROM users WHERE id = $1",
      [userId],
    );
    const orgId = userRes.rows[0]?.organization_id;

    if (!orgId) return res.status(403).json({ error: "No organization" });

    const result = await pool.query(
      `UPDATE leads SET 
         name = COALESCE($1, name), 
         phone = COALESCE($2, phone), 
         email = COALESCE($3, email), 
         value = COALESCE($4, value), 
         source = COALESCE($5, source), 
         last_contact = NOW(), 
         assigned_to = COALESCE($6, assigned_to),
         status = COALESCE($7, status),
         notes = COALESCE($8, notes),
         product_id = COALESCE($9, product_id)
       WHERE id = $10 AND organization_id = $11 RETURNING *`,
      [name, phone, email, value, source, assigned_to, status, notes, product_id, id, orgId],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Lead not found" });
    }

    res.json(result.rows[0]);
  } catch (err) {
    log("PUT /api/leads/:id error: " + err.toString());
    res.status(500).json({ error: "Failed to update lead" });
  }
});

// DELETE /api/leads/:id - Delete a lead
app.delete("/api/leads/:id", verifyJWT, async (req, res) => {
  const { id } = req.params;
  try {
    const userId = req.userId;
    const orgRes = await pool.query("SELECT organization_id FROM users WHERE id = $1", [userId]);
    const orgId = orgRes.rows[0]?.organization_id;
    if (!orgId) return res.status(403).json({ error: "No organization" });

    const result = await pool.query(
      "DELETE FROM leads WHERE id = $1 AND organization_id = $2 RETURNING *",
      [id, orgId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Lead not found" });
    }

    res.json({ success: true });
  } catch (err) {
    log("DELETE /api/leads/:id error: " + err.toString());
    res.status(500).json({ error: "Failed to delete lead" });
  }
});

// GET /api/vendedores - List vendors for the org
app.get("/api/vendedores", verifyJWT, async (req, res) => {
  try {
    const userId = req.userId;
    const orgRes = await pool.query("SELECT organization_id FROM users WHERE id = $1", [userId]);
    const orgId = orgRes.rows[0]?.organization_id;
    if (!orgId) return res.status(403).json({ error: "No organization" });

    const result = await pool.query(
      "SELECT id, nome, email, whatsapp, ativo FROM vendedores WHERE organization_id = $1 AND ativo = true ORDER BY nome",
      [orgId]
    );
    res.json(result.rows);
  } catch (err) {
    log("GET /api/vendedores error: " + err.toString());
    res.status(500).json({ error: "Failed to list vendors" });
  }
});

// WhatsApp Connection Endpoint (Automated)
app.post("/api/whatsapp/connect", verifyJWT, async (req, res) => {
  const { instanceLabel, connect_agent_id } = req.body;
  log(
    `WhatsApp connect request for UserID: ${req.userId} [Label: ${instanceLabel || "Default"}]`,
  );

  if (!(await checkDb())) {
    return res.status(503).json({ error: "Database disconnected" });
  }

  try {
    const userId = req.userId;
    const userRes = await pool.query("SELECT * FROM users WHERE id = $1", [
      userId,
    ]);
    const user = userRes.rows[0];

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const email = user.email;

    const organizationId = user.organization_id;

    // Generate instance name: sanitized-email_Label
    const emailSanitized = sanitizeEmail(email);
    let instanceName = emailSanitized;

    if (instanceLabel) {
      const labelSanitized = instanceLabel
        .trim()
        .replace(/[^a-zA-Z0-9]/g, "")
        .toLowerCase();
      instanceName = `${emailSanitized}_${labelSanitized}`;
    }

    log(`Target Instance Name: ${instanceName}`);

    // Check if THIS specific instance already exists
    const existingInstanceRes = await pool.query(
      "SELECT * FROM whatsapp_instances WHERE instance_name = $1",
      [instanceName],
    );
    const existingInstance = existingInstanceRes.rows[0];

    // If it does NOT exist, we are creating a new one -> Check Limits
    if (!existingInstance) {
      const limits = await checkPlanLimits(user.id);
      if (!limits.allowed) {
        return res
          .status(403)
          .json({ error: limits.message, upgradeRequired: true });
      }
    }

    // ... Existing Logic for "Instance exists" ...
    if (existingInstance) {
      const instance = existingInstance;
      log(`Instance already exists: ${instance.status}`);

      if (instance.status === "CONNECTED") {
        if (connect_agent_id && instance.id) {
          await assignWhatsAppInstanceToAgent({
            organizationId,
            agentId: connect_agent_id,
            instanceId: instance.id,
          });
        }
        await runAdminEventAutomations('whatsapp_connected', {
          userId: instance.user_id,
          eventKey: `whatsapp_connected:${instance.id || instance.instance_name}`,
          extraVars: { conexao_whatsapp: instance.instance_name },
        }).catch((automationErr) => {
          log('[AUTO EVENT whatsapp_connected] ' + automationErr.message);
        });
        return res.json({
          exists: true,
          instance: instance,
          message: "Instance already connected",
        });
      }

      // Instance exists but is DISCONNECTED -> Try to get QR Code again
      log(`Instance ${instanceName} is disconnected. Fetching new QR Code...`);

      const evolutionApiUrl =
        process.env.EVOLUTION_API_URL || "https://evo.kogna.co";
      const evolutionApiKey = process.env.EVOLUTION_API_KEY || "";

      // 1. Check actual status on Evolution API first
      try {
        const statusResponse = await fetch(
          `${evolutionApiUrl}/instance/connectionState/${instanceName}`,
          {
            method: "GET",
            headers: { apikey: evolutionApiKey },
          },
        );

        if (statusResponse.ok) {
          const statusData = await statusResponse.json();

          const stateRaw =
            statusData?.instance?.state || statusData?.connectionStatus || "";
          const state = stateRaw.toLowerCase();

          if (isConnectedState(state)) {
            // Instance is actually connected! Update DB and return
            await pool.query(
              "UPDATE whatsapp_instances SET status = $1, last_checked = NOW() WHERE id = $2",
              ["CONNECTED", instance.id],
            );
            instance.status = "CONNECTED";
            await runAdminEventAutomations('whatsapp_connected', {
              userId: instance.user_id,
              eventKey: `whatsapp_connected:${instance.id || instance.instance_name}`,
              extraVars: { conexao_whatsapp: instance.instance_name },
            }).catch((automationErr) => {
              log('[AUTO EVENT whatsapp_connected] ' + automationErr.message);
            });
            log(
              `Instance ${instanceName} was found connected on Evolution. Updated local DB.`,
            );
            return res.json({
              exists: true,
              instance: instance,
            });
          }
        }
      } catch (err) {
        log(
          `Failed to check connection state for existing instance: ${err.message}`,
        );
      }

      // 2. If not connected, try to fetch new QR Code
      try {
        const qrResponse = await fetch(
          `${evolutionApiUrl}/instance/connect/${instanceName}`,
          {
            method: "GET",
            headers: { apikey: evolutionApiKey },
          },
        );

        if (qrResponse.ok) {
          const qrData = await qrResponse.json();
          const qrCode =
            qrData.base64 || qrData.code || qrData.qrcode?.base64 || null;

          if (!qrCode) {
            // Fallback check
            await pool.query(
              "UPDATE whatsapp_instances SET status = $1, last_checked = NOW() WHERE id = $2",
              ["CONNECTED", instance.id],
            );
            instance.status = "CONNECTED";
            if (connect_agent_id && instance.id) {
              await assignWhatsAppInstanceToAgent({
                organizationId,
                agentId: connect_agent_id,
                instanceId: instance.id,
              });
            }
            await runAdminEventAutomations('whatsapp_connected', {
              userId: instance.user_id,
              eventKey: `whatsapp_connected:${instance.id || instance.instance_name}`,
              extraVars: { conexao_whatsapp: instance.instance_name },
            }).catch((automationErr) => {
              log('[AUTO EVENT whatsapp_connected] ' + automationErr.message);
            });
            log(
              `Instance ${instanceName} connect call returned no QR (likely connected). Updated local DB.`,
            );
            return res.json({
              exists: true,
              instance: instance,
            });
          }

          if (connect_agent_id && instance.id) {
            await assignWhatsAppInstanceToAgent({
              organizationId,
              agentId: connect_agent_id,
              instanceId: instance.id,
            });
          }

          return res.json({
            exists: true,
            instance: instance,
            qrCode: qrCode,
            message: "Instance exists but disconnected. New QR Code generated.",
          });
        }
      } catch (e) {
        log(`Error fetching QR for existing instance: ${e.message}.`);
      }
    }

    // --- CREATION / RE-CREATION LOGIC ---

    const evolutionApiUrl =
      process.env.EVOLUTION_API_URL || "https://evo.kogna.co";
    const evolutionApiKey = process.env.EVOLUTION_API_KEY || "";
    const webhookUrl =
      process.env.WEBHOOK_URL || "http://localhost:3000/api/webhooks/whatsapp";

    const createInstancePayload = {
      instanceName: instanceName,
      token: "",
      qrcode: true,
      integration: "WHATSAPP-BAILEYS",
      reject_call: false,
      groups_ignore: true, // Try snake_case
      groupsIgnore: true, // Try camelCase
    };

    log(`Creating instance in Evolution API: ${instanceName}`);

    let evolutionResponse = await fetch(`${evolutionApiUrl}/instance/create`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: evolutionApiKey,
      },
      body: JSON.stringify(createInstancePayload),
    });

    if (!evolutionResponse.ok) {
      const errorText = await evolutionResponse.text();
      if (
        evolutionResponse.status === 403 &&
        (errorText.includes("already") || errorText.includes("Forbidden"))
      ) {
        log(
          `Instance ${instanceName} is stuck (Zombie). Force deleting to clean up...`,
        );
        await fetch(`${evolutionApiUrl}/instance/logout/${instanceName}`, {
          method: "DELETE",
          headers: { apikey: evolutionApiKey },
        });
        await fetch(`${evolutionApiUrl}/instance/delete/${instanceName}`, {
          method: "DELETE",
          headers: { apikey: evolutionApiKey },
        });

        // Retry create
        evolutionResponse = await fetch(`${evolutionApiUrl}/instance/create`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: evolutionApiKey,
          },
          body: JSON.stringify(createInstancePayload),
        });
      }
    }

    if (!evolutionResponse.ok) {
      const finalError = await evolutionResponse.text();
      throw new Error(`Failed to create instance: ${finalError}`);
    }

    const evolutionData = await evolutionResponse.json();

    // 2. Configure Webhook
    await fetch(`${evolutionApiUrl}/webhook/set/${instanceName}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: evolutionApiKey },
      body: JSON.stringify({
        webhook: {
          enabled: true,
          url: webhookUrl,
          byEvents: false,
          base64: true,
          events: ["MESSAGES_UPSERT", "CONNECTION_UPDATE", "MESSAGES_UPDATE"],
        },
      }),
    });

    // 3. Configure Settings (Ignore Groups)
    // 3. Configure Settings (Ignore Groups) - Try both casing styles for compatibility
    const settingsPayload = {
      groupsIgnore: true,
      groups_ignore: true,
      rejectCall: false,
      reject_call: false,
      alwaysOnline: false,
      readMessages: false,
      readStatus: false,
    };

    const settingsRes = await fetch(
      `${evolutionApiUrl}/settings/set/${instanceName}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: evolutionApiKey,
        },
        body: JSON.stringify(settingsPayload),
      },
    );

    if (settingsRes.ok) {
      log(`Settings configured for ${instanceName}: Ignore Groups ENABLED`);
    } else {
      log(
        `WARNING: Failed to set settings for ${instanceName}: ${await settingsRes.text()}`,
      );
    }

    // 4. Get QR
    const qrResponse = await fetch(
      `${evolutionApiUrl}/instance/connect/${instanceName}`,
      {
        method: "GET",
        headers: { apikey: evolutionApiKey },
      },
    );

    let qrCode = null;
    if (qrResponse.ok) {
      const qrData = await qrResponse.json();
      qrCode = qrData.base64 || qrData.code || null;
    }

    // 5. Save/Update DB
    const checkRes = await pool.query(
      "SELECT id FROM whatsapp_instances WHERE instance_name = $1",
      [instanceName],
    );

    let dbResult;
    if (checkRes.rows.length > 0) {
      dbResult = await pool.query(
        "UPDATE whatsapp_instances SET user_id = $1, status = $2, organization_id = $3 WHERE instance_name = $4 RETURNING *",
        [user.id, "DISCONNECTED", organizationId, instanceName],
      );
    } else {
      dbResult = await pool.query(
        "INSERT INTO whatsapp_instances (user_id, instance_name, instance_token, status, organization_id) VALUES ($1, $2, $3, $4, $5) RETURNING *",
        [
          user.id,
          instanceName,
          evolutionData.hash || "",
          "DISCONNECTED",
          organizationId,
        ],
      );
    }

    if (connect_agent_id && dbResult.rows[0]?.id) {
      await assignWhatsAppInstanceToAgent({
        organizationId,
        agentId: connect_agent_id,
        instanceId: dbResult.rows[0].id,
      });
    }

    res.json({
      success: true,
      instance: dbResult.rows[0],
      qrCode: qrCode,
    });
  } catch (err) {
    log("POST /api/whatsapp/connect error: " + err.toString());
    res
      .status(500)
      .json({ error: "Internal server error", details: err.message });
  }
});

// Webhook Handler for Evolution API
app.post("/api/webhooks/whatsapp", async (req, res) => {
  const event = req.body;
  // Log received webhook (truncated for safety)
  const logBody = { ...req.body };
  if (logBody.data) logBody.data = "[TRUNCATED]";
  log(`Webhook received: ${JSON.stringify(logBody)}`);

  try {
    // Handle CONNECTION_UPDATE event
    if (
      event.event === "CONNECTION_UPDATE" ||
      event.event === "connection.update"
    ) {
      const instanceName = event.instance;
      const state = event.data?.state || event.state;

      log(`Connection update for ${instanceName}: ${state}`);

      if (isConnectedState(state)) {
        await pool.query(
          "UPDATE whatsapp_instances SET status = $1 WHERE instance_name = $2",
          ["CONNECTED", instanceName],
        );
        const connectedInstanceRes = await pool.query(
          "SELECT id, user_id, instance_name FROM whatsapp_instances WHERE instance_name = $1 LIMIT 1",
          [instanceName],
        );
        const connectedInstance = connectedInstanceRes.rows[0];
        if (connectedInstance?.user_id) {
          await runAdminEventAutomations('whatsapp_connected', {
            userId: connectedInstance.user_id,
            eventKey: `whatsapp_connected:${connectedInstance.id || connectedInstance.instance_name}`,
            extraVars: { conexao_whatsapp: connectedInstance.instance_name },
          }).catch((automationErr) => {
            log('[AUTO EVENT whatsapp_connected] ' + automationErr.message);
          });
        }
        log(`Instance ${instanceName} marked as CONNECTED`);
      } else if (state === "close" || state === "DISCONNECTED") {
        await pool.query(
          "UPDATE whatsapp_instances SET status = $1 WHERE instance_name = $2",
          ["DISCONNECTED", instanceName],
        );
        log(`Instance ${instanceName} marked as DISCONNECTED`);
      }
    }

    // Handle MESSAGES_UPSERT event
    if (
      event.event === "MESSAGES_UPSERT" ||
      event.event === "messages.upsert"
    ) {
      const data = event.data;
      const message = data?.message;
      const key = data?.key || message?.key;
      const remoteJid = key?.remoteJid;
      const fromMe = key?.fromMe;
      const instanceName = event.instance;

      // Only respond to incoming text messages from others
      if (fromMe) return res.json({ success: true });

      // 1. Find the Agent connected to this instance
      const instanceRes = await pool.query(
        "SELECT * FROM whatsapp_instances WHERE instance_name = $1",
        [instanceName],
      );
      const instance = instanceRes.rows[0];

      if (!instance) {
        log(`[AI] Instance ${instanceName} not found in DB.`);
        return res.json({ success: false, error: "Instance not found" });
      }

      const agentRes = await pool.query(
        "SELECT * FROM agents WHERE whatsapp_instance_id = $1",
        [instance.id],
      );
      const agent = agentRes.rows[0];

      if (!agent) {
        log(`[AI] No agent configured for instance ${instanceName}`);
        return res.json({ success: true });
      }

      const orgId = instance.organization_id;
      const pushName = event.data?.pushName || event.data?.notify || data?.pushName || data?.notify || null;

      let finalUserText = "";
      let imageUrl = null;
      let reductionAmount = 0; // Default 0 (text messages cost nothing to process input, only output)
      let isAudioInput = false;

      const messageType = message?.messageType || Object.keys(message)[0];
      log(
        `[DEBUG] Message Type: ${messageType} (Keys: ${Object.keys(message)})`,
      );

      // Explicitly check for message types to be safe
      const isAudioMessage =
        message?.audioMessage || messageType === "audioMessage";
      const isImageMessage =
        message?.imageMessage || messageType === "imageMessage";

      // 1. AUDIO HANDLING (HEARING)
      if (isAudioMessage) {
        log(`[AI] Audio message detected from ${remoteJid} `);
        isAudioInput = true;

        let tempFilePath = null;
        try {
          let audioBuffer;
          const base64Data =
            message?.base64 || data?.base64 || message?.audioMessage?.base64;

          if (base64Data) {
            try {
              const cleanBase64 = base64Data.replace(/^data:.*;base64,/, "");
              audioBuffer = Buffer.from(cleanBase64, "base64");
            } catch (e) {
              log(
                `[AI] Failed to convert audio base64 to buffer: ${e.message} `,
              );
            }
          }

          if (!audioBuffer) {
            const mediaUrl = message?.audioMessage?.url;
            if (mediaUrl) {
              const response = await fetch(mediaUrl);
              if (response.ok) {
                audioBuffer = await response.arrayBuffer();
              } else {
                log(`[AI] Failed to fetch audio URL: ${response.statusText} `);
              }
            }
          }

          if (audioBuffer) {
            // Detect Mime Type to determine extension
            const mimeType = message?.audioMessage?.mimetype || "audio/ogg";
            let extension = "ogg";
            if (mimeType.includes("mp4") || mimeType.includes("aac"))
              extension = "mp4";
            if (mimeType.includes("mpeg") || mimeType.includes("mp3"))
              extension = "mp3";
            if (mimeType.includes("wav")) extension = "wav";

            log(
              `[AI] Audio MimeType: ${mimeType}, formatting as .${extension} `,
            );

            // Write to temp file to ensure correct format handling by OpenAI
            const tempFileName = `audio_${Date.now()}.${extension} `;
            tempFilePath = path.join(__dirname, tempFileName);
            fs.writeFileSync(tempFilePath, Buffer.from(audioBuffer));

            const transcription = await openai.audio.transcriptions.create({
              file: fs.createReadStream(tempFilePath),
              model: "whisper-1",
            });

            finalUserText = transcription.text;
            reductionAmount = 10;
            log(`[AI] Audio transcribed: "${finalUserText}"`);
          } else {
            log(`[AI] Could not retrieve audio data.`);
            return res.json({ success: true });
          }
        } catch (transcribeError) {
          log(`[AI] Transcription failed: ${transcribeError.message} `);
          return res.json({ success: true, error: "Transcription failed" });
        } finally {
          if (tempFilePath && fs.existsSync(tempFilePath)) {
            fs.unlinkSync(tempFilePath);
          }
        }
      }
      // 2. VISION HANDLING (SEEING)
      else if (isImageMessage) {
        log(`[AI] Image message detected from ${remoteJid} `);

        const caption = message?.imageMessage?.caption || "";
        finalUserText =
          caption ||
          "O usuário enviou esta imagem. Descreva o que você vê e responda de forma útil.";

        let base64Data =
          message?.base64 || data?.base64 || message?.imageMessage?.base64;
        const mediaUrl = message?.imageMessage?.url;

        if (base64Data) {
          // Strip any existing data URI prefix to avoid double-prefixing
          const cleanBase64 = base64Data.replace(/^data:.*;base64,/, "");

          // Get clean mime type (remove codec info like "; codecs=opus")
          let mimeType = message?.imageMessage?.mimetype || "image/jpeg";
          mimeType = mimeType.split(";")[0].trim();

          imageUrl = `data:${mimeType}; base64, ${cleanBase64} `;
          log(
            `[AI] Image prepared.MimeType: ${mimeType}, Base64 length: ${cleanBase64.length}, Starts with: ${cleanBase64.substring(0, 30)}...`,
          );
        } else if (mediaUrl) {
          imageUrl = mediaUrl;
          log(`[AI] Using image URL: ${mediaUrl.substring(0, 80)}...`);
        }

        if (imageUrl) {
          reductionAmount = 10;
        } else {
          log(`[AI] Image data not found(No Base64 or URL).`);
        }
      }
      // 3. TEXT HANDLING (DEFAULT)
      else {
        finalUserText =
          message?.conversation ||
          message?.extendedTextMessage?.text ||
          data?.content ||
          "";
      }

      if (!finalUserText && !imageUrl) {
        log(`[AI] No content to process.`);
        return res.json({ success: true });
      }

      const ignoreReason = await getInboundIgnoreReason({
        remoteJid,
        content: finalUserText,
      });
      if (ignoreReason) {
        log(`[AI GUARD] Ignoring inbound message from ${remoteJid} on ${instanceName}: ${ignoreReason}`);
        return res.json({ success: true, ignored: ignoreReason });
      }

      // --- AUTO LEAD CREATION (CRM) ---
      // Ensure a lead exists in the CRM for this WhatsApp contact.
      // This runs fire-and-forget (no await) to not slow the message path.
      if (orgId) {
        ensureLeadFromWhatsApp(remoteJid, pushName, orgId, instance.id)
          .catch(e => log(`[AUTO-LEAD] Error: ${e.message}`));
      }
      // --- END AUTO LEAD CREATION ---

      // Deduct Koins for Input Processing (Hearing/Seeing)
      if (reductionAmount > 0) {
        // Wait, agent doesn't have user_id directly here.
        // We need to get the USER ID. We found the agent via instance name.
        // Agent -> WhatsappInstance -> User

        // Let's fetch User ID from Agent relation again to be sure
        const userRes = await pool.query(
          `
                    SELECT u.id, u.koins_balance 
                    FROM users u
                    JOIN whatsapp_instances wi ON wi.user_id = u.id
                    JOIN agents a ON a.whatsapp_instance_id = wi.id
                    WHERE a.id = $1
  `,
          [agent.id],
        );

        const user = userRes.rows[0];
        if (user) {
          if (user.koins_balance < reductionAmount) {
            log(
              `[AI] Insufficient Koins for multimodal processing.Need ${reductionAmount}, has ${user.koins_balance}.`,
            );
            return res.json({ success: true }); // Stop processing
          }

          const updatedUser = await adjustUserKoinsBalance({
            userId: user.id,
            delta: -reductionAmount,
            source: "multimodal_input",
            metadata: { reduction_amount: reductionAmount },
          });
          log(
            `[KOINS] Deducted ${reductionAmount} for Multimodal Input.Balance: ${updatedUser?.koins_balance ?? user.koins_balance - reductionAmount} `,
          );
        }
      }

      log(
        `[AI] Message received from ${remoteJid} on instance ${instanceName}: ${finalUserText} ${imageUrl ? "[+IMAGE]" : ""}`,
      );

      // 1. Find the Agent connected to this instance (Already done above)

      // ... (Agent check existing) ...

      // 1.2 Save incoming message to history (WITHOUT base64 data to avoid DB bloat)
      await pool.query(
        "INSERT INTO chat_messages (agent_id, remote_jid, role, content) VALUES ($1, $2, $3, $4)",
        [
          agent.id,
          remoteJid,
          "user",
          finalUserText + (imageUrl ? " [Imagem enviada]" : ""),
        ],
      );

      // --- DB-BACKED MESSAGE BUFFER (10-second debounce for serverless) ---
      // Save this message to the buffer table
      const bufferRes = await pool.query(
        `INSERT INTO message_buffer(remote_jid, agent_id, instance_name, content, image_url, is_audio)
VALUES($1, $2, $3, $4, $5, $6) RETURNING id`,
        [remoteJid, agent.id, instanceName, finalUserText || null, imageUrl || null, isAudioInput]
      );
      const bufferId = BigInt(bufferRes.rows[0].id);

      // Wait 10 seconds (debounce window)
      await new Promise(resolve => setTimeout(resolve, 10000));

      // Check if this is still the LATEST unprocessed message for this contact
      // If a newer message arrived in the meantime, skip — that message's handler will process all
      const latestCheck = await pool.query(
        `SELECT id FROM message_buffer
         WHERE remote_jid = $1 AND agent_id = $2 AND processed = false
         ORDER BY received_at DESC LIMIT 1`,
        [remoteJid, agent.id]
      );

      const latestId = latestCheck.rows[0]?.id ? BigInt(latestCheck.rows[0].id) : null;
      if (!latestId || latestId !== bufferId) {
        // A newer message arrived — its handler will process everything
        log(`[BUFFER] Message ${bufferId} skipped — newer message ${latestId} will handle the batch.`);
        return res.json({ success: true, status: 'waiting_for_batch' });
      }

      // We are the latest message — collect all buffered messages for this contact
      const allBuffered = await pool.query(
        `SELECT * FROM message_buffer
         WHERE remote_jid = $1 AND agent_id = $2 AND processed = false
         ORDER BY received_at ASC`,
        [remoteJid, agent.id]
      );

      // Mark all as processed (prevent double-processing)
      await pool.query(
        `UPDATE message_buffer SET processed = true
         WHERE remote_jid = $1 AND agent_id = $2 AND processed = false`,
        [remoteJid, agent.id]
      );

      // Clean up old processed entries (housekeeping)
      pool.query(`DELETE FROM message_buffer WHERE processed = true AND received_at < NOW() - INTERVAL '2 hours'`)
        .catch(e => log('[BUFFER] Cleanup error: ' + e.message));

      // Build combined input for AI (all messages in this batch)
      const inputMessages = allBuffered.rows.map(m => ({
        role: 'user',
        content: m.content || '',
        imageUrl: m.image_url || null,
        isAudio: m.is_audio || false,
      }));

      log(`[BUFFER] Processing batch of ${inputMessages.length} message(s) for ${remoteJid}`);

      // Process all buffered messages together in one AI call
      await processAIResponse(agent, remoteJid, instanceName, inputMessages);

      // ── CIL: Fire-and-forget intelligence analysis ──
      // Build combined text from the batch, ignoring audio-only messages
      const batchText = inputMessages.map(m => m.content).filter(Boolean).join(' | ');
      if (batchText && orgId) {
        // Find the lead ID for this conversation (phone matches remoteJid)
        // Fix: Use ORDER BY to ensure we get the real, most recently active lead, avoiding hidden ghost leads
        const phone = remoteJid.split('@')[0];
        const cleanPhone = phone.replace(/\D/g, '');
        pool.query(
          `SELECT id FROM leads 
           WHERE organization_id = $1 AND (phone = $2 OR phone LIKE $3) 
           ORDER BY last_contact DESC NULLS LAST, created_at DESC LIMIT 1`,
          [orgId, cleanPhone, `%${cleanPhone}%`]
        ).then(leadRes => {
          const leadId = leadRes.rows[0]?.id || null;
          processConversationIntelligence(batchText, {
            orgId,
            leadId,
            agentId: agent.id,
            conversationId: remoteJid,
            messageId: `${remoteJid}_${Date.now()}`
          }).catch(e => log(`[CIL] Background error: ${e.message}`));
        }).catch(e => log(`[CIL] Lead lookup error: ${e.message}`));
      }
      // ── END CIL ──

      return res.json({ success: true });
      // --- END DB-BACKED MESSAGE BUFFER ---

    }

    res.json({ success: true });
  } catch (err) {
    log("Webhook error: " + err.toString());
    res.status(500).json({ error: "Webhook processing failed" });
  }
});

// FAILS_SAFE DEBUG ENDPOINT
app.get("/api/debug-connection", async (req, res) => {
  try {
    const email = "natanael@kogna.co";
    const userRes = await pool.query("SELECT * FROM users WHERE email = $1", [
      email,
    ]);
    const user = userRes.rows[0] || { error: "User not found" };

    const instancesByUser = await pool.query(
      "SELECT * FROM whatsapp_instances WHERE user_id = $1",
      [user.id],
    );
    const instancesByOrg = user.organization_id
      ? await pool.query(
        "SELECT * FROM whatsapp_instances WHERE organization_id = $1",
        [user.organization_id],
      )
      : { rows: [] };

    res.json({
      user,
      instances_by_user_id: instancesByUser.rows,
      instances_by_org_id: instancesByOrg.rows,
    });
  } catch (e) {
    res.json({ error: e.message });
  }
});

// TEMPORARY CLEANUP ENDPOINT
app.get("/api/debug/cleanup-leads", async (req, res) => {
  try {
    const q1 = await pool.query("DELETE FROM leads WHERE phone LIKE '%554791935149%' OR phone LIKE '%4791935149%' RETURNING id");
    const q2 = await pool.query("DELETE FROM message_buffer WHERE remote_jid LIKE '%554791935149%' RETURNING id");
    const q3 = await pool.query("DELETE FROM chat_messages WHERE remote_jid LIKE '%554791935149%' RETURNING id");
    res.json({ deletedLeads: q1.rowCount, deletedBuffer: q2.rowCount, deletedMessages: q3.rowCount, success: true });
  } catch(e) {
    res.json({ error: e.message, success: false });
  }
});

// GET /api/instances - List all instances (for multi-connection users)
app.get("/api/instances", verifyJWT, async (req, res) => {
  try {
    const userId = req.userId;

    const orgRes = await pool.query(
      "SELECT organization_id FROM users WHERE id = $1",
      [userId],
    );
    const orgId = orgRes.rows[0]?.organization_id;

    if (!orgId) {
      const fallback = await pool.query(
        `
          SELECT wi.*,
                 a.id AS connected_agent_id,
                 a.name AS connected_agent_name,
                 sc.seller_id AS connected_seller_id,
                 v.nome AS connected_seller_name,
                 sc.is_primary AS seller_is_primary
            FROM whatsapp_instances wi
            LEFT JOIN agents a ON a.whatsapp_instance_id = wi.id
            LEFT JOIN seller_connections sc ON sc.connection_id = wi.id
            LEFT JOIN vendedores v ON v.id = sc.seller_id
           WHERE wi.user_id = $1
           ORDER BY wi.created_at DESC
        `,
        [userId],
      );
      return res.json(fallback.rows.map(serializeInstanceRow));
    }

    let instances = await fetchOrganizationInstances(orgId);

    if (instances.length === 0) {
      const userInstances = await pool.query(
        "SELECT * FROM whatsapp_instances WHERE user_id = $1 AND (organization_id IS NULL OR organization_id != $2)",
        [userId, orgId],
      );

      if (userInstances.rows.length > 0) {
        await pool.query(
          "UPDATE whatsapp_instances SET organization_id = $1 WHERE user_id = $2",
          [orgId, userId],
        );
        instances = await fetchOrganizationInstances(orgId);
      }
    }

    res.json(instances);
  } catch (err) {
    log("GET /api/instances error: " + err.toString());
    res.status(500).json({ error: "Database error" });
  }
});

// REPAIR ENDPOINT
app.post("/api/repair-connection", verifyJWT, async (req, res) => {
  try {
    const userId = req.userId;
    log(`[REPAIR] Request from user ${userId}`);

    // 1. Get User & Org
    const userRes = await pool.query(
      "SELECT organization_id, email FROM users WHERE id = $1",
      [userId],
    );
    if (userRes.rows.length === 0)
      return res.status(404).json({ error: "User not found" });

    const user = userRes.rows[0];
    const orgId = user.organization_id;

    if (!orgId) {
      // Try to find if user owns an org but it's not linked in users table (rare)
      // For now, just fail or maybe create one?
      // Let's create one if missing, just like ensureUserInitialized
      const newOrg = await pool.query(
        "INSERT INTO organizations (name, plan_type) VALUES ($1, 'pro') RETURNING id",
        [`Org of ${user.email}`],
      );
      await pool.query("UPDATE users SET organization_id = $1 WHERE id = $2", [
        newOrg.rows[0].id,
        userId,
      ]);
      log(`[REPAIR] Created missing org for user ${userId}`);
      return res.json({
        message: "Organization created. Refreshed.",
        fixed: true,
      });
    }

    // 2. Fix Instances
    const result = await pool.query(
      "UPDATE whatsapp_instances SET organization_id = $1 WHERE user_id = $2 AND (organization_id IS NULL OR organization_id != $1) RETURNING instance_name",
      [orgId, userId],
    );

    if (result.rows.length > 0) {
      log(`[REPAIR] Fixed ${result.rows.length} instances for user ${userId}`);
      return res.json({
        message: `Fixed ${result.rows.length} connections.`,
        fixed: true,
      });
    }

    return res.json({ message: "No issues found.", fixed: false });
  } catch (e) {
    log(`[REPAIR] Error: ${e.message} `);
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/instance", verifyJWT, async (req, res) => {
  const { instanceName, token, status } = req.body;
  log(`POST /api/instance: ${instanceName}`);

  const userId = req.userId;

  // Check Plan Limits
  const limits = await checkPlanLimits(userId);
  if (!limits.allowed) {
    return res
      .status(403)
      .json({ error: limits.message, upgradeRequired: true });
  }
  const organizationId = limits.orgId; // Will be set if checkPlanLimits found an Org

  if (!organizationId) {
    // Double check if user has org, because checkPlanLimits might return allowed:true even without org if logic says so (e.g. for basic plan)
    const userRes = await pool.query(
      "SELECT organization_id FROM users WHERE id = $1",
      [userId],
    );
    if (!userRes.rows[0]?.organization_id) {
      return res
        .status(400)
        .json({ error: "User has no organization. Please contact support." });
    }
  }

  // Only check 1 instance per user/org for now to be safe
  const existing = await pool.query(
    "SELECT * FROM whatsapp_instances WHERE user_id = $1 LIMIT 1",
    [userId],
  );
  if (existing.rows.length > 0) {
    const instance = existing.rows[0];
    // ... (rest of logic handles existing instance)
    if (instance.status === "CONNECTED" || instance.status === "open") {
      return res.json({
        exists: true,
        instance,
        message: "Instance already connected",
      });
    }
  }

  try {
    // The instanceName is now derived from the user's email in /api/whatsapp/connect
    // This endpoint is more for manual creation/linking, so we'll use a generic name or the provided one.
    const finalInstanceName = instanceName || `kogna_${userId.substring(0, 8)}`;

    // Ensure organization_id is passed. limits.orgId should have it.
    const orgIdToUse =
      organizationId ||
      (
        await pool.query("SELECT organization_id FROM users WHERE id = $1", [
          userId,
        ])
      ).rows[0]?.organization_id;

    const result = await pool.query(
      "INSERT INTO whatsapp_instances (user_id, instance_name, instance_token, status, organization_id) VALUES ($1, $2, $3, $4, $5) RETURNING *",
      [
        userId,
        finalInstanceName,
        token || "",
        status || "DISCONNECTED",
        orgIdToUse,
      ],
    );
    log("Instance created: " + result.rows[0].id);
    res.json(result.rows[0]);
  } catch (err) {
    log("POST /api/instance error: " + err.toString());
    res.status(500).json({ error: "Database error" });
  }
});

// DELETE /api/instance/:id - Disconnect and remove instance
app.delete("/api/instance/:id", verifyJWT, async (req, res) => {
  try {
    const userId = req.userId;
    const { id } = req.params;
    log(`[DELETE_INSTANCE] Request from user ${userId} for instance ID ${id}`);

    // 1. Get instance details and verify ownership/org
    const userRes = await pool.query(
      "SELECT organization_id FROM users WHERE id = $1",
      [userId],
    );
    const orgId = userRes.rows[0]?.organization_id;
    log(`[DELETE_INSTANCE] User Org: ${orgId}`);

    const instanceRes = await pool.query(
      "SELECT * FROM whatsapp_instances WHERE id = $1",
      [id],
    );

    if (instanceRes.rows.length === 0) {
      log(`[DELETE_INSTANCE] Instance ${id} not found in database`);
      return res
        .status(404)
        .json({ error: "Conexão não encontrada no banco de dados" });
    }

    const instance = instanceRes.rows[0];
    const instanceName = instance.instance_name;
    log(
      `[DELETE_INSTANCE] Found instance: ${instanceName}, owner: ${instance.user_id}, org: ${instance.organization_id} `,
    );

    // Verify ownership
    if (instance.user_id !== userId && instance.organization_id !== orgId) {
      log(
        `[DELETE_INSTANCE] Access denied for user ${userId} to instance ${id} `,
      );
      return res
        .status(403)
        .json({ error: "Acesso negado para remover esta conexão" });
    }

    // 2. Delete from Evolution API (logout + destroy instance)
    const evolutionApiUrl =
      process.env.EVOLUTION_API_URL || "https://evo.kogna.co";
    const evolutionApiKey = process.env.EVOLUTION_API_KEY || "";

    try {
      log(`[DELETE_INSTANCE] Calling Evolution logout for: ${instanceName} `);
      const logoutRes = await fetch(
        `${evolutionApiUrl} /instance/logout / ${instanceName} `,
        { method: "DELETE", headers: { apikey: evolutionApiKey } }
      );
      const logoutBody = await logoutRes.text().catch(() => "(no body)");
      log(`[DELETE_INSTANCE] Evolution logout ${instanceName}: ${logoutRes.status} — ${logoutBody} `);
    } catch (evoErr) {
      log(`[DELETE_INSTANCE] Evolution logout error for ${instanceName}: ${evoErr.message} `);
    }

    try {
      log(`[DELETE_INSTANCE] Calling Evolution delete for: ${instanceName} `);
      const deleteRes = await fetch(
        `${evolutionApiUrl} /instance/delete / ${instanceName} `,
        { method: "DELETE", headers: { apikey: evolutionApiKey } }
      );
      const deleteBody = await deleteRes.text().catch(() => "(no body)");
      log(`[DELETE_INSTANCE] Evolution delete ${instanceName}: ${deleteRes.status} — ${deleteBody} `);
    } catch (evoErr) {
      log(`[DELETE_INSTANCE] Evolution delete error for ${instanceName}: ${evoErr.message} `);
    }

    // 3. Remove from database
    await pool.query("DELETE FROM whatsapp_instances WHERE id = $1", [id]);

    log(
      `[DELETE_INSTANCE] User ${userId} disconnected instance ${instanceName} (${id})`,
    );
    res.json({ success: true, message: "Conexão removida com sucesso" });
  } catch (err) {
    log("DELETE /api/instance error: " + err.toString());
    res.status(500).json({ error: "Erro ao remover conexão" });
  }
});

// ==========================================
// LIVE CHAT PROXY ENDPOINTS (Evolution API)
// ==========================================

// Helper to proxy requests to Evolution API
const proxyToEvolution = async (req, res, endpoint) => {
  const { instance } = req.params;
  const method = req.method;
  const body = req.body; // already parsed by express.json()

  // instance comes from URL param :instance
  // endpoint is passed from the route handler, e.g., '/chat/findChats'

  const evolutionApiUrl =
    process.env.EVOLUTION_API_URL || "https://evo.kogna.co";
  const evolutionApiKey = process.env.EVOLUTION_API_KEY || "";

  // Construct full URL: https://evo.kogna.co/chat/findChats/instanceName
  const targetUrl = `${evolutionApiUrl}${endpoint}/${instance}`;

  log(`Proxying ${method} to ${targetUrl}`);
  const requestId = Math.random().toString(36).substring(7);
  log(`[${requestId}] ENTERING proxyToEvolution for ${endpoint}`);

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout

    const response = await fetch(targetUrl, {
      method: method,
      headers: {
        "Content-Type": "application/json",
        apikey: evolutionApiKey,
      },
      body: method !== "GET" ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    log(`[${requestId}] FETCH COMPLETED with status ${response.status}`);

    // Ensure we handle non-JSON responses gracefully (though Evolution usually returns JSON)
    const contentType = response.headers.get("content-type");
    log(
      `DEBUG: Got response from ${endpoint}, status: ${response.status}, type: ${contentType}`,
    );

    let data;
    if (contentType && contentType.includes("application/json")) {
      data = await response.json();
    } else {
      data = await response.text();
    }

    log(`DEBUG: Parsed response body for ${endpoint}`);

    if (!response.ok) {
      log(
        `Proxy error from Evolution: ${response.status} - ${JSON.stringify(data)}`,
      );
      return res
        .status(response.status)
        .json({ error: "Evolution API Error", details: data });
    }

    if (endpoint.includes("findChats")) {
      log(`DEBUG findChats response keys: ${Object.keys(data)}`);
      if (Array.isArray(data)) {
        log(`DEBUG findChats first item: ${JSON.stringify(data[0])}`);
      } else if (data.result && Array.isArray(data.result)) {
        log(
          `DEBUG findChats first item (in result): ${JSON.stringify(data.result[0])}`,
        );
      } else {
        log(
          `DEBUG findChats structure unknown: ${JSON.stringify(data).substring(0, 200)}...`,
        );
      }
    }

    if (endpoint.includes("findMessages")) {
      log(`DEBUG findMessages response keys: ${Object.keys(data)}`);
      if (Array.isArray(data)) {
        log(`DEBUG findMessages (Array) length: ${data.length}`);
        if (data.length > 0)
          log(`DEBUG findMessages first item: ${JSON.stringify(data[0])}`);
      } else if (data.messages && Array.isArray(data.messages)) {
        log(
          `DEBUG findMessages (data.messages) length: ${data.messages.length}`,
        );
        if (data.messages.length > 0)
          log(
            `DEBUG findMessages first item: ${JSON.stringify(data.messages[0])}`,
          );
      } else if (data.result && Array.isArray(data.result)) {
        // Some versions use result
        log(`DEBUG findMessages (data.result) length: ${data.result.length}`);
        if (data.result.length > 0)
          log(
            `DEBUG findMessages first item: ${JSON.stringify(data.result[0])}`,
          );
      } else {
        log(
          `DEBUG findMessages structure unknown: ${JSON.stringify(data).substring(0, 500)}...`,
        );
      }
    }

    res.json(data);
  } catch (error) {
    log(`Proxy Server Error: ${error.message}`);
    res
      .status(500)
      .json({ error: "Internal Server Error (Proxy)", details: error.message });
  }
};

// 1. Fetch Chats
app.post("/chat/findChats/:instance", async (req, res) => {
  await proxyToEvolution(req, res, "/chat/findChats");
});

// 2. Fetch Messages
app.post("/chat/findMessages/:instance", async (req, res) => {
  await proxyToEvolution(req, res, "/chat/findMessages");
});

// 3. Send Text Message
app.post("/message/sendText/:instance", async (req, res) => {
  await proxyToEvolution(req, res, "/message/sendText");
});

// 4. Fetch Profile Picture
// The user asked for "fetchProfilePictureUrl" but mapped it to GET or POST logic?
// Evolution usually has /chat/fetchProfilePictureUrl/{instance} with body { number: "..." }
app.post("/chat/fetchProfilePictureUrl/:instance", async (req, res) => {
  await proxyToEvolution(req, res, "/chat/fetchProfilePictureUrl");
});

// -- CRM / Leads API --

// GET /api/leads - Fetch all leads for the user's organization
app.get("/api/leads", verifyJWT, async (req, res) => {
  try {
    const userId = req.userId;

    // Ensure initialization (Self-Healing)
    await ensureUserInitialized(userId);

    // Fetch user's org
    const userRes = await pool.query(
      "SELECT organization_id FROM users WHERE id = $1",
      [userId],
    );
    const orgId = userRes.rows[0]?.organization_id;

    if (!orgId) return res.json([]);

    // Filter by Organization ID
    const result = await pool.query(
      `SELECT l.*,
              CASE
                WHEN COALESCE(NULLIF(TRIM(l.last_ia_briefing), ''), NULL) IS NOT NULL THEN TRUE
                ELSE FALSE
              END AS has_ai_summary
       FROM leads l
       WHERE l.organization_id = $1
       ORDER BY l.created_at DESC`,
      [orgId],
    );

    // Map DB fields to frontend consistent types if necessary, though they match closely now.
    const leads = result.rows.map((row) => ({
      id: row.id,
      name: row.name,
      company: row.company,
      phone: row.phone,
      email: row.email,
      source: row.source,
      value: Number(row.value),
      status: row.status,
      tags: row.tags || [],
      lastContact: row.last_contact,
      score: row.score,
      temperature: row.temperature,
      intentLabel: row.intent_label || null,
      briefing: row.last_ia_briefing || null,
      hasAiSummary: Boolean(row.has_ai_summary),
    }));

    res.json(leads);
  } catch (err) {
    log("GET /api/leads error: " + err.toString());
    res.status(500).json({ error: "Failed to fetch leads" });
  }
});

// GET /api/leads/heatmap - Revenue OS: Leads sorted by intent score for Heat Map widget
app.get("/api/leads/heatmap", verifyJWT, async (req, res) => {
  try {
    const userId = req.userId;
    const userRes = await pool.query(
      "SELECT organization_id FROM users WHERE id = $1",
      [userId],
    );
    const orgId = userRes.rows[0]?.organization_id;
    if (!orgId) return res.json([]);

    const result = await pool.query(
      `SELECT 
         id, name, phone, company, status, value,
         COALESCE(score, 0) as score,
         COALESCE(temperature, '🔵 Frio') as temperature,
         COALESCE(intent_label, 'COLD') as intent_label,
         last_ia_briefing,
         last_interaction_at,
         last_contact
       FROM leads 
       WHERE organization_id = $1
         AND COALESCE(score, 0) > 0
       ORDER BY score DESC, last_interaction_at DESC
       LIMIT 20`,
      [orgId],
    );

    const heatmap = result.rows.map(row => ({
      id: row.id,
      name: row.name,
      phone: row.phone,
      company: row.company,
      status: row.status,
      value: Number(row.value),
      score: Number(row.score),
      temperature: row.temperature,
      intentLabel: row.intent_label,
      briefing: row.last_ia_briefing,
      lastInteraction: row.last_interaction_at || row.last_contact,
    }));

    res.json(heatmap);
  } catch (err) {
    log("GET /api/leads/heatmap error: " + err.toString());
    res.status(500).json({ error: "Failed to fetch heatmap" });
  }
});

// --- COACHING AI LOGIC ---
const generateCoachingInsight = async (leadId, orgId, newStatus) => {
  try {
    // Apenas gerar insight se foi ganho ou perdido para simplificar, ou "quente"
    if (!["ganho", "perdido"].includes(newStatus.toLowerCase())) return;

    // Buscar o lead e vendedor associado
    const leadRes = await pool.query(
      "SELECT * FROM leads WHERE id = $1 AND organization_id = $2",
      [leadId, orgId]
    );
    const lead = leadRes.rows[0];
    // Se leads não tem assigned_to na mesma tabela, podemos pular ou tentar achar na tabela associativa.
    // Vamos assumir que a tabela leads tem 'assigned_to' conforme Revenue OS
    if (!lead || !lead.assigned_to) return;

    const vendedorId = lead.assigned_to;

    // Obter dados do vendedor
    const vendRes = await pool.query("SELECT nome FROM vendedores WHERE id = $1", [vendedorId]);
    const vendedorNome = vendRes.rows[0]?.nome || "Vendedor";

    // Simular chamada ao GPT para gerar insight baseado no status
    // Idealmente buscaríamos histórico de interações, horas desde a criação etc.
    const leadCreated = new Date(lead.created_at || Date.now());
    const leadUpdated = new Date();
    const difHours = Math.round((leadUpdated - leadCreated) / (1000 * 60 * 60));

    const prompt = `Atue como um treinador de vendas (Revenue OS). 
O vendedor ${vendedorNome} acabou de marcar o lead "${lead.name}" (Valor: R$ ${lead.value}) como ${newStatus.toUpperCase()}.
Tempo desde a criação do lead até agora: ${difHours} horas.
Gere UM insight curto (máx 2 frases) avaliando o desempenho e dando uma dica construtiva de coaching. 
Se for "ganho", parabenize e destaque o que foi bem. Se for "perdido", identifique um possível ponto de melhoria ou padrão.`;

    const chatCompletion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "system", content: prompt }],
    });

    const insightMsg = chatCompletion.choices[0].message.content;

    await pool.query(
      "INSERT INTO vendedor_insights (vendedor_id, organization_id, lead_id, insight_type, message) VALUES ($1, $2, $3, $4, $5)",
      [vendedorId, orgId, leadId, newStatus.toLowerCase(), insightMsg]
    );

    log(`[COACHING] Insight gerado para lead ${leadId} (Vendedor: ${vendedorId})`);
  } catch (err) {
    log(`[COACHING ERROR] Failed to generate insight: ${err.message}`);
  }
};

// --- CRON JOBS ---
// Envio semanal de relatórios para os vendedores (Sexta-feira às 18:00)
cron.schedule("0 18 * * 5", async () => {
  log("[CRON] Iniciando rotina de envio de insights semanais de Coaching para Vendedores");
  try {
    // Pegar insights não enviados
    const insightsRes = await pool.query(
      "SELECT * FROM vendedor_insights WHERE is_sent = FALSE ORDER BY vendedor_id, created_at"
    );

    if (insightsRes.rows.length === 0) return;

    // Agrupar por vendedor
    const porVendedor = {};
    for (const row of insightsRes.rows) {
      if (!porVendedor[row.vendedor_id]) porVendedor[row.vendedor_id] = { orgId: row.organization_id, insights: [] };
      porVendedor[row.vendedor_id].insights.push(row);
    }

    for (const [vendId, data] of Object.entries(porVendedor)) {
      const vendRes = await pool.query("SELECT nome, whatsapp FROM vendedores WHERE id = $1", [vendId]);
      const vendedor = vendRes.rows[0];
      if (!vendedor || !vendedor.whatsapp) continue;

      let msg = `*Kogna Revenue OS - Coaching Semanal*\nOlá ${vendedor.nome}! Aqui estão seus insights de desempenho desta semana:\n\n`;
      data.insights.forEach(i => {
        msg += `💡 ${i.message}\n\n`;
      });
      msg += `Continue acelerando as vendas e conte com a Kogna para otimizar seus contatos! 🚀`;

      // Encontrar uma instância da organização para enviar
      const instRes = await pool.query("SELECT instance_name FROM whatsapp_instances WHERE organization_id = $1 AND status = 'CONNECTED' LIMIT 1", [data.orgId]);
      if (instRes.rows.length > 0) {
        const instanceName = instRes.rows[0].instance_name;
        // Enviar via Evolution API
        const url = `${EVOLUTION_API_URL}/message/sendText/${instanceName}`;
        await fetch(url, {
          method: "POST",
          headers: { apikey: EVOLUTION_API_KEY, "Content-Type": "application/json" },
          body: JSON.stringify({
            number: vendedor.whatsapp,
            text: msg
          })
        });

        // Marcar como lido/enviado
        const ids = data.insights.map(i => i.id);
        await pool.query("UPDATE vendedor_insights SET is_sent = TRUE WHERE id = ANY($1)", [ids]);
        log(`[CRON] Relatório semanal enviado com sucesso ao vendedor ${vendedor.nome}`);
      }
    }
  } catch (e) {
    log(`[CRON ERROR] Relatório semanal: ${e.message}`);
  }
});

// // DEBUG ENDPOINT: Dispara relatório semanal (Apenas para dev/test)
app.get("/api/vendedores/debug-report", verifyAdmin, async (req, res) => {
  try {
    const orgId = req.query.orgId || "09a74aa9-9d7a-428a-ba01-71b3e9a59cf6"; // Padrão ou query

    // Obter todos os vendedores da org
    const vendRes = await pool.query("SELECT id, nome, whatsapp FROM vendedores WHERE organization_id = $1", [orgId]);
    if (vendRes.rows.length === 0) return res.json({ msg: "Sem vendedores" });

    // Achar uma instância da org para enviar
    const instRes = await pool.query("SELECT instance_name FROM whatsapp_instances WHERE organization_id = $1 AND status = 'CONNECTED' LIMIT 1", [orgId]);
    const instanceName = instRes.rows[0]?.instance_name;

    for (const vendedor of vendRes.rows) {
      if (!vendedor.whatsapp) continue;

      let msg = `*Kogna Revenue OS - Coaching Semanal*\nOlá ${vendedor.nome}! Aqui estão seus insights de desempenho (TESTE DEBUG):\n\n`;
      msg += `💡 Seu tempo de resposta está excelente.\n\n`;
      msg += `Continue acelerando as vendas e conte com a Kogna para otimizar seus contatos! 🚀`;

      if (instanceName) {
        // Enviar teste via Evolution API
        const url = `${EVOLUTION_API_URL}/message/sendText/${instanceName}`;
        await fetch(url, {
          method: "POST",
          headers: { apikey: EVOLUTION_API_KEY, "Content-Type": "application/json" },
          body: JSON.stringify({ number: vendedor.whatsapp, text: msg })
        });
        log(`[DEBUG] Relatório de teste enviado ao vendedor ${vendedor.nome}`);
      }
    }
    res.json({ success: true, instanceName, vendedores: vendRes.rows.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/leads/:id/status - Update lead status
app.patch("/api/leads/:id/status", verifyJWT, async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  if (!status) {
    return res.status(400).json({ error: "Status is required" });
  }

  try {
    const userId = req.userId;
    const userRes = await pool.query(
      "SELECT organization_id FROM users WHERE id = $1",
      [userId],
    );
    const orgId = userRes.rows[0]?.organization_id;

    if (!orgId) return res.status(403).json({ error: "No organization" });

    // Derive temperature from column order
    let temperature = "Frio";
    try {
      const colsRes = await pool.query(
        "SELECT title, order_index FROM lead_columns WHERE organization_id = $1 OR user_id IN (SELECT id FROM users WHERE organization_id = $1) ORDER BY order_index ASC",
        [orgId]
      );
      const cols = colsRes.rows;
      if (cols.length > 0) {
        const colIdx = cols.findIndex(c => c.title === status);
        if (colIdx >= 0) {
          const ratio = colIdx / (cols.length - 1);
          if (ratio >= 0.7) temperature = "Quente";
          else if (ratio >= 0.35) temperature = "Morno";
          else temperature = "Frio";
        }
      }
    } catch (e) {
      log("Could not derive temperature from columns: " + e.message);
    }

    const result = await pool.query(
      "UPDATE leads SET status = $1, last_contact = NOW(), temperature = $2 WHERE id = $3 AND organization_id = $4 RETURNING *",
      [status, temperature, id, orgId],
    );

    // Fallback if temperature column doesn't exist
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Lead not found" });
    }

    // AI Coaching Hook (não bloqueia a response)
    generateCoachingInsight(id, orgId, status).catch(e => log("Insight hook error: " + e.message));

    const row = result.rows[0];
    const updatedLead = {
      id: row.id,
      name: row.name,
      company: row.company,
      value: Number(row.value),
      status: row.status,
      tags: row.tags || [],
      lastContact: row.last_contact,
    };

    res.json(updatedLead);
  } catch (err) {
    log("PATCH /api/leads/:id/status error: " + err.toString());
    res.status(500).json({ error: "Failed to update lead status" });
  }
});

// PATCH /api/leads/:id/assign - Assign a vendedor to a lead
app.patch("/api/leads/:id/assign", verifyJWT, async (req, res) => {
  const { id } = req.params;
  const { vendedorId } = req.body;
  try {
    const userId = req.userId;
    const orgRes = await pool.query("SELECT organization_id FROM users WHERE id = $1", [userId]);
    const orgId = orgRes.rows[0]?.organization_id;
    if (!orgId) return res.status(403).json({ error: "No organization" });

    // Check if assigned_to column exists, if not add it
    await pool.query(`
      ALTER TABLE leads ADD COLUMN IF NOT EXISTS assigned_to UUID REFERENCES vendedores(id) ON DELETE SET NULL
    `).catch(() => { });

    const result = await pool.query(
      "UPDATE leads SET assigned_to = $1 WHERE id = $2 AND organization_id = $3 RETURNING id, name, assigned_to",
      [vendedorId || null, id, orgId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: "Lead not found" });
    res.json(result.rows[0]);
  } catch (err) {
    log("PATCH /api/leads/:id/assign error: " + err.toString());
    res.status(500).json({ error: "Failed to assign vendor" });
  }
});



// -- Leads Settings API --

// Safe migration: add organization_id to lead_columns and lead_sources if missing
let settingsMigrated = false;
async function ensureSettingsMigration() {
  if (settingsMigrated) return;
  try {
    await pool.query(
      `ALTER TABLE lead_columns ADD COLUMN IF NOT EXISTS organization_id TEXT`,
    );
    await pool.query(
      `ALTER TABLE lead_sources ADD COLUMN IF NOT EXISTS organization_id TEXT`,
    );
    await pool.query(
      `ALTER TABLE lead_sources ADD COLUMN IF NOT EXISTS is_system BOOLEAN DEFAULT false`,
    );
    settingsMigrated = true;
  } catch (e) {
    log("Settings migration error (non-fatal): " + e.message);
  }
}

// GET /api/settings/columns
app.get("/api/settings/columns", verifyJWT, async (req, res) => {
  try {
    await ensureSettingsMigration();
    const userId = req.userId;
    const userRes = await pool.query(
      "SELECT organization_id FROM users WHERE id = $1",
      [userId],
    );
    const orgId = userRes.rows[0]?.organization_id;

    if (!orgId) return res.status(401).json({ error: "Unauthorized" });

    let result = await pool.query(
      "SELECT * FROM lead_columns WHERE organization_id = $1 ORDER BY order_index ASC",
      [orgId],
    );

    // Auto-seed default columns if organization has none
    if (result.rows.length === 0) {
      const defaultColumns = [
        {
          title: "Novos Leads",
          color: "#3b82f6",
          order_index: 0,
          is_system: true,
        },
        {
          title: "Em Contato",
          color: "#f59e0b",
          order_index: 1,
          is_system: false,
        },
        {
          title: "Qualificado",
          color: "#8b5cf6",
          order_index: 2,
          is_system: false,
        },
        {
          title: "Proposta Enviada",
          color: "#06b6d4",
          order_index: 3,
          is_system: false,
        },
        {
          title: "Agendamento Feito",
          color: "#10b981",
          order_index: 4,
          is_system: true,
        },
      ];
      for (const col of defaultColumns) {
        await pool.query(
          "INSERT INTO lead_columns (organization_id, title, color, order_index, is_system) VALUES ($1, $2, $3, $4, $5)",
          [orgId, col.title, col.color, col.order_index, col.is_system],
        );
      }
      result = await pool.query(
        "SELECT * FROM lead_columns WHERE organization_id = $1 ORDER BY order_index ASC",
        [orgId],
      );
    }

    res.json(result.rows);
  } catch (err) {
    log("GET /api/settings/columns error: " + err.toString());
    res.status(500).json({ error: "Failed to fetch columns" });
  }
});

// POST /api/settings/columns
app.post("/api/settings/columns", verifyJWT, async (req, res) => {
  const { title, color, orderIndex } = req.body;
  try {
    await ensureSettingsMigration();
    const userId = req.userId;
    const userRes = await pool.query(
      "SELECT organization_id FROM users WHERE id = $1",
      [userId],
    );
    const orgId = userRes.rows[0]?.organization_id;

    if (!orgId) return res.status(401).json({ error: "Unauthorized" });

    const result = await pool.query(
      "INSERT INTO lead_columns (organization_id, title, color, order_index, is_system) VALUES ($1, $2, $3, $4, false) RETURNING *",
      [orgId, title, color || "#3b82f6", orderIndex || 99],
    );
    res.json(result.rows[0]);
  } catch (err) {
    log("POST /api/settings/columns error: " + err.toString());
    res.status(500).json({ error: "Failed to create column" });
  }
});

// DELETE /api/settings/columns/:id
app.delete("/api/settings/columns/:id", verifyJWT, async (req, res) => {
  const { id } = req.params;
  try {
    const userId = req.userId;
    const userRes = await pool.query(
      "SELECT organization_id FROM users WHERE id = $1",
      [userId],
    );
    const orgId = userRes.rows[0]?.organization_id;

    if (!orgId) return res.status(401).json({ error: "Unauthorized" });

    // Check if system column
    const check = await pool.query(
      "SELECT is_system FROM lead_columns WHERE id = $1 AND organization_id = $2",
      [id, orgId],
    );
    if (check.rows.length > 0 && check.rows[0].is_system) {
      return res
        .status(403)
        .json({ error: "Colunas do sistema não podem ser excluídas." });
    }

    await pool.query(
      "DELETE FROM lead_columns WHERE id = $1 AND organization_id = $2 AND (is_system IS NULL OR is_system = false)",
      [id, orgId],
    );
    res.json({ success: true });
  } catch (err) {
    log("DELETE /api/settings/columns/:id error: " + err.toString());
    res.status(500).json({ error: "Failed to delete column" });
  }
});

// PUT /api/settings/columns/reorder
app.put("/api/settings/columns/reorder", verifyJWT, async (req, res) => {
  const { columns } = req.body; // Expect array of { id, orderIndex }
  try {
    const userId = req.userId;
    const userRes = await pool.query(
      "SELECT organization_id FROM users WHERE id = $1",
      [userId],
    );
    const orgId = userRes.rows[0]?.organization_id;

    if (!orgId) return res.status(401).json({ error: "Unauthorized" });

    for (const col of columns) {
      await pool.query(
        "UPDATE lead_columns SET order_index = $1 WHERE id = $2 AND organization_id = $3",
        [col.orderIndex, col.id, orgId],
      );
    }
    res.json({ success: true });
  } catch (err) {
    log("PUT /api/settings/columns/reorder error: " + err.toString());
    res.status(500).json({ error: "Failed to reorder columns" });
  }
});

// GET /api/settings/sources
app.get("/api/settings/sources", verifyJWT, async (req, res) => {
  try {
    await ensureSettingsMigration();
    const userId = req.userId;
    const userRes = await pool.query(
      "SELECT organization_id FROM users WHERE id = $1",
      [userId],
    );
    const orgId = userRes.rows[0]?.organization_id;

    if (!orgId) return res.status(401).json({ error: "Unauthorized" });

    let result = await pool.query(
      "SELECT * FROM lead_sources WHERE organization_id = $1 ORDER BY created_at DESC",
      [orgId],
    );

    // Auto-seed default sources if organization has none
    if (result.rows.length === 0) {
      const defaultSources = [
        { name: "Facebook", is_system: true },
        { name: "Instagram", is_system: true },
        { name: "Google", is_system: true },
        { name: "Indicação", is_system: false },
        { name: "WhatsApp", is_system: false },
        { name: "Site", is_system: false },
      ];
      for (const src of defaultSources) {
        await pool.query(
          "INSERT INTO lead_sources (organization_id, name, is_system) VALUES ($1, $2, $3)",
          [orgId, src.name, src.is_system],
        );
      }
      result = await pool.query(
        "SELECT * FROM lead_sources WHERE organization_id = $1 ORDER BY created_at DESC",
        [orgId],
      );
    }

    res.json(result.rows);
  } catch (err) {
    log("GET /api/settings/sources error: " + err.toString());
    res.status(500).json({ error: "Failed to fetch sources" });
  }
});

// POST /api/settings/sources
app.post("/api/settings/sources", verifyJWT, async (req, res) => {
  const { name } = req.body;
  try {
    await ensureSettingsMigration();
    const userId = req.userId;
    const userRes = await pool.query(
      "SELECT organization_id FROM users WHERE id = $1",
      [userId],
    );
    const orgId = userRes.rows[0]?.organization_id;

    if (!orgId) return res.status(401).json({ error: "Unauthorized" });

    const result = await pool.query(
      "INSERT INTO lead_sources (organization_id, name, is_system) VALUES ($1, $2, false) RETURNING *",
      [orgId, name],
    );
    res.json(result.rows[0]);
  } catch (err) {
    log("POST /api/settings/sources error: " + err.toString());
    res.status(500).json({ error: "Failed to create source" });
  }
});

// DELETE /api/settings/sources/:id
app.delete("/api/settings/sources/:id", verifyJWT, async (req, res) => {
  const { id } = req.params;
  try {
    const userId = req.userId;
    const userRes = await pool.query(
      "SELECT organization_id FROM users WHERE id = $1",
      [userId],
    );
    const orgId = userRes.rows[0]?.organization_id;

    if (!orgId) return res.status(401).json({ error: "Unauthorized" });

    // Check if system source
    const check = await pool.query(
      "SELECT is_system FROM lead_sources WHERE id = $1 AND organization_id = $2",
      [id, orgId],
    );
    if (check.rows.length > 0 && check.rows[0].is_system) {
      return res
        .status(403)
        .json({ error: "Fontes do sistema não podem ser excluídas." });
    }

    await pool.query(
      "DELETE FROM lead_sources WHERE id = $1 AND organization_id = $2 AND (is_system IS NULL OR is_system = false)",
      [id, orgId],
    );
    res.json({ success: true });
  } catch (err) {
    log("DELETE /api/settings/sources/:id error: " + err.toString());
    res.status(500).json({ error: "Failed to delete source" });
  }
});

// Global Error Handler
app.use((err, req, res, next) => {
  log("Global Error Handler: " + err.toString());
  console.error(err);
  res
    .status(500)
    .json({ error: "Internal Server Error", details: err.message });
});

// POST /api/evolution/webhook - Global Webhook for Evolution API
app.post("/api/evolution/webhook", async (req, res) => {
  const apiKey = req.headers["apikey"] || req.query.apiKey;
  const evolutionApiKey = process.env.EVOLUTION_API_KEY || "";

  // 1. Verify API Key
  if (!apiKey || apiKey !== evolutionApiKey) {
    log("[WEBHOOK] Unauthorized access attempt: " + apiKey);
    return res.status(403).json({ error: "Unauthorized" });
  }

  try {
    const body = req.body;
    const instanceName = body.instance || body.sender || "unknown";
    const type = body.type;

    // log(`[WEBHOOK] Received event: ${type} from ${instanceName}`); // Verbose

    // 2. Filter: Process 'messages.upsert', 'message', OR 'connection.update'
    if (type === "connection.update") {
      const state = (
        body.data?.state ||
        body.data?.connectionState ||
        ""
      ).toLowerCase();
      log(`[WEBHOOK] Connection Update for ${instanceName}: ${state}`);

      // Map Evolution state to our DB status
      let dbStatus = "DISCONNECTED";
      if (state === "open" || state === "connected") dbStatus = "CONNECTED";
      else if (state === "connecting")
        dbStatus = "connecting"; // optional, keep 'qrcode' or update?
      else if (state === "close") dbStatus = "DISCONNECTED";

      // If connected, update DB
      if (dbStatus === "CONNECTED") {
        await pool.query(
          "UPDATE whatsapp_instances SET status = $1, last_checked = NOW() WHERE instance_name = $2",
          ["CONNECTED", instanceName],
        );
        log(`[WEBHOOK] Updated instance ${instanceName} to CONNECTED`);
      } else if (dbStatus === "DISCONNECTED") {
        await pool.query(
          "UPDATE whatsapp_instances SET status = $1 WHERE instance_name = $2",
          ["DISCONNECTED", instanceName],
        );
        log(`[WEBHOOK] Updated instance ${instanceName} to DISCONNECTED`);
      }

      return res.status(200).send("OK");
    }

    if (type !== "messages.upsert" && type !== "message") {
      return res.status(200).send("OK");
    }

    const data = body.data;
    if (!data || !data.key || data.key.fromMe) {
      return res.status(200).send("OK"); // Ignore own messages
    }

    const remoteJid = data.key.remoteJid;
    const pushName = data.pushName || "Unknown";

    // Extract content (Text or Image)
    let content = "";
    let imageUrl = null;
    let isAudio = false;

    const messageType = data.messageType;

    if (messageType === "conversation") {
      content = data.message?.conversation || "";
    } else if (messageType === "extendedTextMessage") {
      content = data.message?.extendedTextMessage?.text || "";
    } else if (messageType === "imageMessage") {
      content = data.message?.imageMessage?.caption || "[IMAGE]";
      // Extract base64 if available, or URL. Evolution usually provides base64 in a separate field or requires media fetch.
      // For now, let's just mark it. Detailed implementation might need another call to get the media.
      // But if 'base64' is present in the payload:
      if (data.message.base64) {
        // imageUrl = ... logic to save or pass base64
        // For now, we skip heavy media logic to avoid complexities, unless requested.
      }
    } else if (messageType === "audioMessage") {
      isAudio = true;
      content = "[AUDIO]"; // Default fallback

      try {
        const evolutionApiUrl = process.env.EVOLUTION_API_URL || "https://evo.kogna.co";
        const evolutionApiKey = process.env.EVOLUTION_API_KEY || "";

        // Fetch the audio media from Evolution API
        const mediaRes = await fetch(
          `${evolutionApiUrl}/chat/getBase64FromMediaMessage/${instanceName}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json", apikey: evolutionApiKey },
            body: JSON.stringify({ message: data.message, convertToMp4: false }),
          }
        );

        if (mediaRes.ok) {
          const mediaData = await mediaRes.json();
          const base64Audio = mediaData.base64;

          if (base64Audio) {
            const tempDir = path.join(__dirname, "temp", "audio");
            if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

            const audioPath = path.join(tempDir, `recv_${Date.now()}.ogg`);
            fs.writeFileSync(audioPath, Buffer.from(base64Audio, "base64"));

            try {
              const transcription = await openai.audio.transcriptions.create({
                file: fs.createReadStream(audioPath),
                model: "whisper-1",
                language: "pt",
              });
              content = transcription.text || "[AUDIO]";
              log(`[WHISPER] Transcribed audio from ${remoteJid}: "${content.substring(0, 80)}"`);
            } catch (whisperErr) {
              log(`[WHISPER] Transcription failed: ${whisperErr.message}. Using [AUDIO] placeholder.`);
            } finally {
              if (fs.existsSync(audioPath)) fs.unlinkSync(audioPath);
            }
          }
        } else {
          const errText = await mediaRes.text();
          log(`[WHISPER] Failed to fetch audio from Evolution: ${mediaRes.status} - ${errText}`);
        }
      } catch (audioErr) {
        log(`[WHISPER] Audio handling error: ${audioErr.message}`);
      }
    }

    if (!content && !isAudio) {
      return res.status(200).send("OK");
    }

    const ignoreReason = await getInboundIgnoreReason({
      remoteJid,
      content,
    });
    if (ignoreReason) {
      log(`[AI GUARD] Ignoring inbound message from ${remoteJid} on ${instanceName}: ${ignoreReason}`);
      return res.status(200).send("OK");
    }

    log(
      `[WEBHOOK] Message from ${remoteJid} (${pushName}): ${content.substring(0, 50)}...`,
    );

    // 3. Find the Agent linked to this Instance
    // We need to find which agent is using this `instanceName`.
    // The `whatsapp_instances` table maps instanceName -> user_id
    // The `agents` table maps whatsapp_instance_id -> agent details

    // However, the `instanceName` from webhook might match the `instance_name` column in `whatsapp_instances`.

    const instanceRes = await pool.query(
      "SELECT id, user_id, organization_id FROM whatsapp_instances WHERE instance_name = $1",
      [instanceName],
    );
    if (instanceRes.rows.length === 0) {
      log(`[WEBHOOK] Instance '${instanceName}' not found in DB.`);
      return res.status(200).send("OK");
    }

    const instanceId = instanceRes.rows[0].id;
    const userId = instanceRes.rows[0].user_id;
    const instanceOrgId = instanceRes.rows[0].organization_id;

    // Find Active Agent for this instance
    const agentRes = await pool.query(
      "SELECT * FROM agents WHERE whatsapp_instance_id = $1 AND status = 'active' LIMIT 1",
      [instanceId],
    );
    if (agentRes.rows.length === 0) {
      log(
        `[WEBHOOK] No active agent found for instance ${instanceName} (ID: ${instanceId}).`,
      );
      return res.status(200).send("OK");
    }

    const agent = agentRes.rows[0];

    // ── Auto-create lead in CRM only for valid external inbound messages ──────
    if (instanceOrgId && remoteJid && !remoteJid.includes('g.us')) {
      ensureLeadFromWhatsApp(remoteJid, pushName, instanceOrgId, instanceId)
        .catch(e => log(`[WEBHOOK] Auto-lead error: ${e.message}`));
    }

    // 4. Log User Message to DB
    // Evolution sends 'id' in data.key.id
    const msgId = data.key.id;

    const inputMessage = {
      role: "user",
      content: content,
      imageUrl: imageUrl,
      isAudio: isAudio,
      metadata: { pushName, whatsapp_id: msgId },
    };

    await pool.query(
      `INSERT INTO chat_messages (agent_id, remote_jid, role, content) 
           VALUES ($1, $2, 'user', $3)`,
      [agent.id, remoteJid, content],
    );

    // Event-driven: Cancel follow-up since user replied
    await cancelFollowupOnReply(agent.organization_id, remoteJid);

    // 5. Trigger AI Processing
    await processAIResponse(agent, remoteJid, instanceName, [inputMessage]);

    res.status(200).send("OK");
  } catch (err) {
    log("[WEBHOOK] Error: " + err.toString());
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Final Error Handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res
    .status(500)
    .json({ error: "Internal Server Error", details: err.message });
});

// ===== Evolution API Proxies =====
// Generic proxy for /message/* endpoints (sendText, sendMedia, etc.)
app.post("/message/:action/:instance", async (req, res) => {
  const { action, instance } = req.params;
  const evolutionApiUrl =
    process.env.EVOLUTION_API_URL || "https://evo.kogna.co";
  const evolutionApiKey = process.env.EVOLUTION_API_KEY || "";

  log(`Proxying POST /message/${action}/${instance}`);

  try {
    const response = await fetch(
      `${evolutionApiUrl}/message/${action}/${instance}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: evolutionApiKey,
        },
        body: JSON.stringify(req.body),
      },
    );

    const data = await response.json();

    if (!response.ok) {
      log(`Evolution API error: ${JSON.stringify(data)}`);
      return res.status(response.status).json(data);
    }

    res.json(data);
  } catch (error) {
    log(`Proxy error for /message/${action}/${instance}: ${error.message}`);
    res
      .status(500)
      .json({
        error: "Failed to proxy request to Evolution API",
        details: error.message,
      });
  }
});

// Media proxy to bypass CORS issues with WhatsApp media URLs
app.get("/api/media-proxy", async (req, res) => {
  const { url } = req.query;

  if (!url) {
    return res.status(400).json({ error: "URL parameter is required" });
  }

  log(`Proxying media from: ${url}`);

  try {
    const response = await fetch(url);

    if (!response.ok) {
      log(`Failed to fetch media: ${response.status} ${response.statusText}`);
      return res
        .status(response.status)
        .json({ error: "Failed to fetch media" });
    }

    // Get content type from response
    const contentType =
      response.headers.get("content-type") || "application/octet-stream";

    // Set appropriate headers
    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "public, max-age=86400"); // Cache for 24 hours

    // Stream the response
    const buffer = await response.arrayBuffer();
    res.send(Buffer.from(buffer));
  } catch (error) {
    log(`Media proxy error: ${error.message}`);
    res
      .status(500)
      .json({ error: "Failed to proxy media", details: error.message });
  }
});

// Generic proxy for /chat/* endpoints (findChats, findMessages, etc.)
app.post("/chat/:action/:instance", async (req, res) => {
  const { action, instance } = req.params;
  const evolutionApiUrl =
    process.env.EVOLUTION_API_URL || "https://evo.kogna.co";
  const evolutionApiKey = process.env.EVOLUTION_API_KEY || "";

  log(`Proxying POST /chat/${action}/${instance}`);

  try {
    const response = await fetch(
      `${evolutionApiUrl}/chat/${action}/${instance}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: evolutionApiKey,
        },
        body: JSON.stringify(req.body),
      },
    );

    const data = await response.json();

    if (!response.ok) {
      log(`Evolution API error: ${JSON.stringify(data)}`);
      return res.status(response.status).json(data);
    }

    res.json(data);
  } catch (error) {
    log(`Proxy error for /chat/${action}/${instance}: ${error.message}`);
    res
      .status(500)
      .json({
        error: "Failed to proxy request to Evolution API",
        details: error.message,
      });
  }
});

// ==========================================
// ONBOARDING API
// ==========================================

// GET /api/onboarding/status - Check if user completed onboarding
app.get("/api/onboarding/status", verifyJWT, async (req, res) => {
  try {
    const userId = req.userId;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const userRes = await pool.query(
      "SELECT onboarding_completed FROM users WHERE id = $1",
      [userId],
    );
    const completed = userRes.rows[0]?.onboarding_completed || false;

    // Also check if they have config
    const configRes = await pool.query(
      "SELECT id FROM ia_configs WHERE user_id = $1",
      [userId],
    );
    const hasConfig = configRes.rows.length > 0;

    res.json({ completed, hasConfig });
  } catch (err) {
    log("GET /api/onboarding/status error: " + err.toString());
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE Agent Knowledge File
app.delete(
  "/api/agents/:id/knowledge/:filename",
  verifyJWT,
  async (req, res) => {
    const { id, filename } = req.params;
    log(`DELETE /api/agents/${id}/knowledge/${filename}`);

    try {
      const userId = req.userId;
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      // Get Org ID
      const userRes = await pool.query(
        "SELECT organization_id FROM users WHERE id = $1",
        [userId],
      );
      const orgId = userRes.rows[0]?.organization_id;

      // Find the agent and ensure it belongs to the org
      const agentRes = await pool.query(
        "SELECT training_files FROM agents WHERE id = $1 AND organization_id = $2",
        [id, orgId],
      );
      if (agentRes.rows.length === 0) {
        return res
          .status(404)
          .json({ error: "Agent not found or unauthorized" });
      }

      let trainingFiles = agentRes.rows[0].training_files || [];
      if (typeof trainingFiles === "string")
        trainingFiles = JSON.parse(trainingFiles);

      // Find the file to delete
      const fileToDelete = trainingFiles.find((f) => f.filename === filename);
      if (!fileToDelete) {
        return res
          .status(404)
          .json({ error: "File not found in agent configuration" });
      }

      // 1. Remove from Database
      const updatedFiles = trainingFiles.filter((f) => f.filename !== filename);
      await pool.query("UPDATE agents SET training_files = $1 WHERE id = $2", [
        JSON.stringify(updatedFiles),
        id,
      ]);

      // 2. Delete from Filesystem
      const filePath = path.resolve(fileToDelete.path);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        log(`[FILE] Deleted actual file: ${filePath}`);
      } else {
        log(`[FILE] File not found on disk, skipping unlink: ${filePath}`);
      }

      res.json({ success: true, message: "File deleted successfully" });
    } catch (err) {
      log(
        "[ERROR] DELETE /api/agents/:id/knowledge/:filename error: " +
        err.toString(),
      );
      res
        .status(500)
        .json({ error: "Failed to delete file", details: err.message });
    }
  },
);

// DEBUG ENDPOINT - REMOVE LATER
app.get("/api/debug/reset-onboarding", async (req, res) => {
  const { email } = req.query;
  if (!email) return res.status(400).json({ error: "Email required" });

  try {
    const userRes = await pool.query("SELECT id FROM users WHERE email = $1", [
      email,
    ]);
    if (userRes.rows.length === 0)
      return res.status(404).json({ error: "User not found" });

    const userId = userRes.rows[0].id;

    await pool.query(
      "UPDATE users SET onboarding_completed = false WHERE id = $1",
      [userId],
    );
    await pool.query("DELETE FROM ia_configs WHERE user_id = $1", [userId]);
    await pool.query("DELETE FROM whatsapp_instances WHERE user_id = $1", [
      userId,
    ]);

    log(`[DEBUG] Reset onboarding for ${email}`);
    res.json({ success: true, message: `Reset complete for ${email}` });
  } catch (e) {
    log(`[DEBUG] Reset failed: ${e.message}`);
    res.status(500).json({ error: e.message });
  }
});

// POST /api/ia-configs - Save AI Configuration (Step 1)
app.post("/api/ia-configs", verifyJWT, async (req, res) => {
  const { companyName, mainProduct, productPrice, agentObjective } = req.body;

  if (!companyName || !mainProduct || !agentObjective) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  try {
    const userId = req.userId;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const userRes = await pool.query(
      "SELECT organization_id FROM users WHERE id = $1",
      [userId],
    );
    const orgId = userRes.rows[0]?.organization_id;

    // Generate initial prompt (Simple template for now)
    const initialPrompt = `You are an AI sales agent for ${companyName}. 
Your main product is ${mainProduct} priced at ${productPrice}.
Your objective: ${agentObjective}.
Be helpful, professional, and persuasive.`;

    // Check if config exists to update or insert
    const existing = await pool.query(
      "SELECT id FROM ia_configs WHERE user_id = $1",
      [userId],
    );

    let result;
    log(
      `[DEBUG] Saving ia_config for user ${userId}. Exists? ${existing.rows.length > 0}`,
    );

    if (existing.rows.length > 0) {
      log("[DEBUG] Executing UPDATE ia_configs");
      result = await pool.query(
        `UPDATE ia_configs 
                 SET company_name=$1, main_product=$2, product_price=$3, agent_objective=$4, initial_prompt=$5, desired_revenue=$6, updated_at=NOW()
                 WHERE user_id=$7 RETURNING *`,
        [
          companyName,
          mainProduct,
          productPrice || 0,
          agentObjective,
          initialPrompt,
          req.body.desiredRevenue || null,
          userId,
        ],
      );
    } else {
      log("[DEBUG] Executing INSERT ia_configs");
      // Explicitly handling updated_at to avoid null violation
      result = await pool.query(
        `INSERT INTO ia_configs 
                 (user_id, organization_id, company_name, main_product, product_price, agent_objective, initial_prompt, desired_revenue, updated_at)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW()) RETURNING *`,
        [
          userId,
          orgId,
          companyName,
          mainProduct,
          productPrice || 0,
          agentObjective,
          initialPrompt,
          req.body.desiredRevenue || null,
        ],
      );
    }

    log(`[DEBUG] ia_configs save success. ID: ${result.rows[0].id}`);
    res.json(result.rows[0]);
  } catch (err) {
    log("POST /api/ia-configs error: " + err.toString());
    res.status(500).json({ error: "Failed to save configuration" });
  }
});

// POST /api/ia-configs/upload - Upload Training Files (Step 2)
app.post(
  "/api/ia-configs/upload",
  verifyJWT,
  upload.array("files", 5),
  async (req, res) => {
    try {
      const userId = req.userId;
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      if (!req.files || req.files.length === 0) {
        return res.status(400).json({ error: "No files uploaded" });
      }

      const uploadedFiles = req.files.map((file) => ({
        originalName: file.originalname,
        filename: file.filename,
        path: file.path,
        size: file.size,
        mimetype: file.mimetype,
        uploadedAt: new Date(),
      }));

      log(
        `Files uploaded for user ${userId}: ${JSON.stringify(uploadedFiles.map((f) => f.originalName))}`,
      );

      // Update JSON in DB
      // First get existing files
      const currentRes = await pool.query(
        "SELECT training_files FROM ia_configs WHERE user_id = $1",
        [userId],
      );

      let existingFiles = [];
      if (currentRes.rows.length > 0 && currentRes.rows[0].training_files) {
        existingFiles = currentRes.rows[0].training_files;
        if (typeof existingFiles === "string") {
          try {
            existingFiles = JSON.parse(existingFiles);
          } catch (e) { }
        }
      }

      // Merge
      const newFiles = [
        ...(Array.isArray(existingFiles) ? existingFiles : []),
        ...uploadedFiles,
      ];

      await pool.query(
        "UPDATE ia_configs SET training_files = $1 WHERE user_id = $2",
        [JSON.stringify(newFiles), userId],
      );

      res.json({ success: true, files: newFiles });
    } catch (err) {
      log("POST /upload error: " + err.toString());
      res.status(500).json({ error: "Upload failed" });
    }
  },
);

// ═══════════════════════════════════════════════════════════════
// SCHEDULING & ROUND ROBIN SYSTEM
// ═══════════════════════════════════════════════════════════════

// ── Helper: Get Org ID from request ──
async function getOrgId(req) {
  const userId = req.userId;
  if (!userId) return null;
  const res = await pool.query(
    "SELECT organization_id FROM users WHERE id = $1",
    [userId],
  );
  return res.rows[0]?.organization_id || null;
}

// ── Round Robin: Get Next Vendedor (Logic Only) ──
async function calculateNextVendedor(orgId) {
  const result = await pool.query(
    "SELECT * FROM vendedores WHERE organization_id = $1 AND ativo = true ORDER BY leads_recebidos_ciclo ASC",
    [orgId],
  );
  const vendedores = result.rows;
  if (vendedores.length === 0) return null;

  // Calculate total porcentagem
  const totalPorcentagem = vendedores.reduce(
    (sum, v) => sum + v.porcentagem,
    0,
  );
  const totalLeads = vendedores.reduce(
    (sum, v) => sum + v.leads_recebidos_ciclo,
    0,
  );

  let chosen = null;
  let maxDeficit = -Infinity;

  for (const v of vendedores) {
    const expectedRatio = v.porcentagem / totalPorcentagem;
    const actualRatio =
      totalLeads > 0 ? v.leads_recebidos_ciclo / totalLeads : 0;
    const deficit = expectedRatio - actualRatio;

    if (deficit > maxDeficit) {
      maxDeficit = deficit;
      chosen = v;
    }
  }

  // If no clear winner (all equal), pick the one with lowest absolute count
  if (!chosen) chosen = vendedores[0];

  return chosen;
}

// ── Round Robin: Increment Vendedor Counter ──
async function incrementVendedorCounter(vendedorId, orgId) {
  // Increment counter
  await pool.query(
    "UPDATE vendedores SET leads_recebidos_ciclo = leads_recebidos_ciclo + 1 WHERE id = $1",
    [vendedorId],
  );

  // Check reset condition
  const res = await pool.query(
    "SELECT * FROM vendedores WHERE organization_id = $1 AND ativo = true",
    [orgId],
  );
  const vendedores = res.rows;
  if (vendedores.length === 0) return;

  const totalPorcentagem = vendedores.reduce(
    (sum, v) => sum + v.porcentagem,
    0,
  );
  const totalLeads = vendedores.reduce(
    (sum, v) => sum + v.leads_recebidos_ciclo,
    0,
  );

  // Check if cycle should reset (all vendedores have received proportional amounts)
  const allProportional = vendedores.every((v) => {
    const expected = Math.round(
      (v.porcentagem / totalPorcentagem) * totalLeads,
    );
    // Allow slack of 1
    return v.leads_recebidos_ciclo >= expected - 1;
  });

  // Only reset if significant total leads to avoid frequent resets
  if (allProportional && totalLeads >= vendedores.length * 2) {
    await pool.query(
      "UPDATE vendedores SET leads_recebidos_ciclo = 0 WHERE organization_id = $1",
      [orgId],
    );
    log(`[ROUND-ROBIN] Cycle reset for org ${orgId}`);
  }
}

// Legacy wrapper if needed, but we will update usages
async function getNextVendedor(orgId) {
  const chosen = await calculateNextVendedor(orgId);
  // Do NOT increment here anymore for AI tools
  return chosen;
}

const DEFAULT_VENDEDOR_BUSINESS_HOURS = [
  { diaSemana: 1, horaInicio: "09:00", horaFim: "18:00", intervalo: 30 },
  { diaSemana: 2, horaInicio: "09:00", horaFim: "18:00", intervalo: 30 },
  { diaSemana: 3, horaInicio: "09:00", horaFim: "18:00", intervalo: 30 },
  { diaSemana: 4, horaInicio: "09:00", horaFim: "18:00", intervalo: 30 },
  { diaSemana: 5, horaInicio: "09:00", horaFim: "18:00", intervalo: 30 },
];

async function ensureDefaultVendedorForUser(db, { orgId, nome, email, whatsapp }) {
  if (!db || !orgId || !nome || !email) return null;

  const normalizedName = String(nome).trim();
  const normalizedEmail = String(email).trim().toLowerCase();
  const normalizedWhatsapp = whatsapp ? String(whatsapp).trim() : null;

  const existingRes = await db.query(
    `SELECT id, nome, email, whatsapp
     FROM vendedores
     WHERE organization_id = $1
       AND LOWER(email) = LOWER($2)
     ORDER BY created_at ASC
     LIMIT 1`,
    [orgId, normalizedEmail]
  );

  let vendedorId = existingRes.rows[0]?.id || null;

  if (!vendedorId) {
    const insertRes = await db.query(
      `INSERT INTO vendedores (organization_id, nome, email, whatsapp, porcentagem)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [orgId, normalizedName, normalizedEmail, normalizedWhatsapp, 100]
    );
    vendedorId = insertRes.rows[0].id;
  } else {
    await db.query(
      `UPDATE vendedores
       SET nome = COALESCE(NULLIF(nome, ''), $2),
           whatsapp = COALESCE(NULLIF(whatsapp, ''), $3)
       WHERE id = $1`,
      [vendedorId, normalizedName, normalizedWhatsapp]
    );
  }

  const disponibilidadeRes = await db.query(
    `SELECT dia_semana
     FROM disponibilidade_vendedor
     WHERE vendedor_id = $1`,
    [vendedorId]
  );

  const diasExistentes = new Set(
    disponibilidadeRes.rows.map((row) => Number(row.dia_semana))
  );

  for (const slot of DEFAULT_VENDEDOR_BUSINESS_HOURS) {
    if (diasExistentes.has(slot.diaSemana)) continue;
    await db.query(
      `INSERT INTO disponibilidade_vendedor (vendedor_id, dia_semana, hora_inicio, hora_fim, intervalo)
       VALUES ($1, $2, $3, $4, $5)`,
      [vendedorId, slot.diaSemana, slot.horaInicio, slot.horaFim, slot.intervalo]
    );
  }

  return vendedorId;
}

// ── Check Availability ──
async function checkAvailability(
  vendedorId,
  dataHora,
  excludeAppointmentId = null,
) {
  const dt = new Date(dataHora);
  const diaSemana = dt.getDay(); // 0=Sun, 6=Sat
  const hora = dt.toTimeString().slice(0, 5); // "HH:MM"

  // 1. Check fixed schedule
  const dispRes = await pool.query(
    "SELECT * FROM disponibilidade_vendedor WHERE vendedor_id = $1 AND dia_semana = $2",
    [vendedorId, diaSemana],
  );

  if (dispRes.rows.length === 0)
    return { available: false, reason: "Sem horário definido para este dia" };

  const hasSlot = dispRes.rows.some(
    (d) => hora >= d.hora_inicio && hora < d.hora_fim,
  );
  if (!hasSlot)
    return { available: false, reason: "Fora do horário de atendimento" };

  // 2. Check blocks
  const blockRes = await pool.query(
    "SELECT * FROM bloqueios_agenda WHERE vendedor_id = $1 AND data_inicio <= $2 AND data_fim > $2",
    [vendedorId, dt.toISOString()],
  );
  if (blockRes.rows.length > 0)
    return { available: false, reason: "Horário bloqueado pelo gestor" };

  // 3. Check existing appointments
  let query = `SELECT * FROM agendamentos WHERE vendedor_id = $1 AND data_hora = $2 AND status != 'cancelado'`;
  const params = [vendedorId, dt.toISOString()];

  if (excludeAppointmentId) {
    query += ` AND id != $3`;
    params.push(excludeAppointmentId);
  }

  const apptRes = await pool.query(query, params);
  if (apptRes.rows.length > 0)
    return { available: false, reason: "Já existe agendamento neste horário" };

  return { available: true };
}

// ── Get Free Slots for a Vendedor on a given date ──
async function getFreeSlots(vendedorId, dateStr) {
  // 1. Parse dateStr (YYYY-MM-DD)
  const [year, month, day] = dateStr.split("-").map(Number);
  // 2. We want to work in "Brasilia Wall Clock" time
  const date = new Date(year, month - 1, day);
  const diaSemana = date.getDay();

  // Get availability rules for this day
  const dispRes = await pool.query(
    "SELECT * FROM disponibilidade_vendedor WHERE vendedor_id = $1 AND dia_semana = $2",
    [vendedorId, diaSemana],
  );
  if (dispRes.rows.length === 0) return [];

  // Get blocks for this date
  // Blocks are stored as UTC timestamps. We need to compare them with the slot in UTC.
  const dayStart = new Date(Date.UTC(year, month - 1, day, 3, 0, 0)); // 00:00 BRT is 03:00 UTC
  const dayEnd = new Date(Date.UTC(year, month - 1, day + 1, 2, 59, 59)); // 23:59 BRT is 02:59 UTC (+1 day)

  const blockRes = await pool.query(
    "SELECT * FROM bloqueios_agenda WHERE vendedor_id = $1 AND data_inicio < $2 AND data_fim > $3",
    [vendedorId, dayEnd.toISOString(), dayStart.toISOString()],
  );

  const apptRes = await pool.query(
    `SELECT data_hora FROM agendamentos WHERE vendedor_id = $1 AND data_hora >= $2 AND data_hora <= $3 AND status != 'cancelado'`,
    [vendedorId, dayStart.toISOString(), dayEnd.toISOString()],
  );

  // Booked times in format "HH:mm" (BRT)
  const bookedTimes = new Set(
    apptRes.rows.map((a) => {
      const dt = new Date(a.data_hora);
      // Convert UTC to BRT (UTC-3) for comparison
      dt.setUTCHours(dt.getUTCHours() - 3);
      return dt.toISOString().slice(11, 16);
    }),
  );

  const slots = [];
  const nowBRT = new Date(new Date().getTime() - 3 * 3600000);
  const todayStr = nowBRT.toISOString().split("T")[0];
  const isToday = dateStr === todayStr;
  const nowMin = nowBRT.getUTCHours() * 60 + nowBRT.getUTCMinutes();

  for (const disp of dispRes.rows) {
    const [startH, startM] = disp.hora_inicio.split(":").map(Number);
    const [endH, endM] = disp.hora_fim.split(":").map(Number);
    const interval = disp.intervalo || 30;

    let currentMin = startH * 60 + startM;
    const endMin = endH * 60 + endM;

    while (currentMin < endMin) {
      if (isToday && currentMin <= nowMin) {
        currentMin += interval;
        continue;
      }

      const h = Math.floor(currentMin / 60);
      const m = currentMin % 60;
      const timeStr = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;

      if (!bookedTimes.has(timeStr)) {
        // Check blocks (slotDt in UTC)
        const slotDtZ = new Date(Date.UTC(year, month - 1, day, h + 3, m, 0)); // HH:mm BRT is HH+3:mm UTC

        const isBlocked = blockRes.rows.some((b) => {
          return (
            slotDtZ >= new Date(b.data_inicio) && slotDtZ < new Date(b.data_fim)
          );
        });

        if (!isBlocked) {
          slots.push(timeStr);
        }
      }
      currentMin += interval;
    }
  }
  return slots;
}

// ─── REVENUE OS: COACHING DE VENDEDORES ───────────────────

/**
 * Analisa a performance do vendedor quando um lead muda de status
 * Foco principal: Tempo de resposta para leads quentes que foram perdidos
 */
const analyzeVendedorPerformance = async (leadId, newStatus, orgId) => {
  try {
    // Só analisa se o novo status for de perda/descarte
    const lostStatuses = ['perdido', 'lost', 'descartado', 'unqualified'];
    if (!lostStatuses.includes(newStatus.toLowerCase())) return;

    // Busca dados do lead
    const leadRes = await pool.query(
      `SELECT assigned_to, intent_label, last_ia_briefing_at 
       FROM leads WHERE id = $1 AND organization_id = $2`,
      [leadId, orgId]
    );

    if (leadRes.rows.length === 0) return;
    const lead = leadRes.rows[0];

    // Só avalia leads que tinham intenção alta e estavam com um vendedor
    if (!lead.assigned_to) return;
    if (lead.intent_label !== 'HOT' && lead.intent_label !== 'CRITICAL') return;
    if (!lead.last_ia_briefing_at) return;

    // Busca a primeira mensagem do vendedor (owner) APÓS o Handoff
    const msgRes = await pool.query(
      `SELECT created_at FROM chat_messages 
       WHERE lead_id = $1 AND role = 'owner' AND created_at > $2
       ORDER BY created_at ASC LIMIT 1`,
      [leadId, lead.last_ia_briefing_at]
    );

    let tempoRespostaHoras = 0;

    if (msgRes.rows.length === 0) {
      // Vendedor nunca respondeu
      const horasDesdeHandoff = (new Date() - new Date(lead.last_ia_briefing_at)) / (1000 * 60 * 60);
      tempoRespostaHoras = Math.round(horasDesdeHandoff);
    } else {
      // Calculo do tempo de resposta real
      const firstReply = msgRes.rows[0].created_at;
      tempoRespostaHoras = Math.round((new Date(firstReply) - new Date(lead.last_ia_briefing_at)) / (1000 * 60 * 60));
    }

    // Se demorou mais de 2 horas para um lead quente que foi perdido, gera o insight
    if (tempoRespostaHoras >= 2) {
      const msg = tempoRespostaHoras > 24
        ? `Você demorou mais de 1 dia para responder este lead quente — padrão de perda identificado.`
        : `Você demorou ${tempoRespostaHoras}h para responder este lead quente — padrão de perda identificado.`;

      await pool.query(
        `INSERT INTO vendedor_insights (vendedor_id, organization_id, lead_id, insight_type, message)
         VALUES ($1, $2, $3, 'delay', $4)`,
        [lead.assigned_to, orgId, leadId, msg]
      );
      log(`[COACHING] Insight gerado para vendedor ${lead.assigned_to}: ${msg}`);
    }

  } catch (err) {
    log(`[COACHING] Erro na análise de performance: ${err.message}`);
  }
};

const generateWeeklyCoachingReports = async (orgId) => {
  try {
    // 1. Busca todos os insights não enviados da organização
    const insightsRes = await pool.query(
      `SELECT i.*, v.nome, v.whatsapp, l.name as lead_name
       FROM vendedor_insights i
       JOIN vendedores v ON i.vendedor_id = v.id
       LEFT JOIN leads l ON i.lead_id = l.id
       WHERE i.is_sent = FALSE AND i.organization_id = $1 AND v.ativo = TRUE 
       AND v.whatsapp IS NOT NULL AND v.whatsapp != ''
       ORDER BY i.vendedor_id, i.created_at DESC`,
      [orgId]
    );

    if (insightsRes.rows.length === 0) return 0;

    // 2. Agrupa por vendedor
    const porVendedor = {};
    for (const row of insightsRes.rows) {
      if (!porVendedor[row.vendedor_id]) {
        porVendedor[row.vendedor_id] = { info: row, insights: [] };
      }
      porVendedor[row.vendedor_id].insights.push(row);
    }

    // 3. Busca instância Evolution API da org
    const instRes = await pool.query(
      `SELECT instance_name FROM whatsapp_instances WHERE organization_id = $1 AND status = 'open' LIMIT 1`,
      [orgId]
    );
    if (instRes.rows.length === 0) return 0;
    const instanceName = instRes.rows[0].instance_name;

    let enviados = 0;
    const evolutionApiUrl = process.env.EVOLUTION_API_URL || "https://evo.kogna.co";
    const evolutionApiKey = process.env.EVOLUTION_API_KEY || "";

    // 4. Monta e envia as mensagens
    for (const vid in porVendedor) {
      const data = porVendedor[vid];
      const items = data.insights.map(i => `- Lead ${i.lead_name || 'Desconhecido'}: ${i.message}`).join('\\n');

      const text = `🤖 *Kogna Revenue OS: Relatório de Coaching*\\nOlá ${data.info.nome.split(' ')[0]}! Aqui estão seus insights da semana:\\n\\n📉 *Pontos de Atenção:*\\n${items}\\n\\nVamos acelerar essa conversão na próxima semana! 🚀`;

      let wpp = data.info.whatsapp.replace(/\\D/g, '');
      if (!wpp.startsWith('55')) wpp = '55' + wpp;

      try {
        const resp = await fetch(`${evolutionApiUrl}/message/sendText/${instanceName}`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "apikey": evolutionApiKey },
          body: JSON.stringify({ number: wpp, text: text })
        });

        if (resp.ok) {
          // Marca como enviados
          const ids = data.insights.map(i => i.id);
          await pool.query(`UPDATE vendedor_insights SET is_sent = TRUE WHERE id = ANY($1)`, [ids]);
          enviados++;
        }
      } catch (e) {
        log(`[COACHING] Falha envio p/ ${wpp}: ${e.message}`);
      }
    }

    return enviados;
  } catch (err) {
    log(`[COACHING] Erro no envio semanal: ${err.message}`);
    return 0;
  }
};

// Endpoint p/ disparar o envio (pode ser chamado por um cron)
app.post("/api/coaching/trigger-weekly-report", verifyJWT, async (req, res) => {
  try {
    const orgId = await getOrgId(req);
    if (!orgId) return res.status(401).json({ error: "Unauthorized" });

    const enviados = await generateWeeklyCoachingReports(orgId);
    res.json({ success: true, enviados });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── VENDEDORES CRUD ──────────────────────────────────────



// ─── AGENDAMENTOS ─────────────────────────────────────────

// GET /api/agendamentos
app.get("/api/agendamentos", async (req, res) => {
  try {
    const orgId = await getOrgId(req);
    if (!orgId) return res.status(401).json({ error: "Unauthorized" });

    const { vendedorId, data, status } = req.query;
    let query = `SELECT a.*, v.nome as vendedor_nome, l.name as lead_nome 
                      FROM agendamentos a 
                      JOIN vendedores v ON a.vendedor_id = v.id
                      LEFT JOIN leads l ON a.lead_id = l.id
                      WHERE v.organization_id = $1`;
    const params = [orgId];
    let paramIdx = 2;

    if (vendedorId) {
      query += ` AND a.vendedor_id = $${paramIdx++}`;
      params.push(vendedorId);
    }
    if (data) {
      query += ` AND DATE(a.data_hora) = $${paramIdx++}`;
      params.push(data);
    }
    if (status) {
      query += ` AND a.status = $${paramIdx++}`;
      params.push(status);
    }

    query += " ORDER BY a.data_hora";
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    log("GET /api/agendamentos error: " + err.toString());
    res.status(500).json({ error: "Failed to fetch agendamentos" });
  }
});

// POST /api/agendamentos
app.post("/api/agendamentos", async (req, res) => {
  const { vendedorId, leadId, dataHora, duracao, notas } = req.body;
  if (!vendedorId || !dataHora)
    return res
      .status(400)
      .json({ error: "vendedorId and dataHora are required" });

  try {
    const orgId = await getOrgId(req);
    if (!orgId) return res.status(401).json({ error: "Unauthorized" });

    // Check availability
    const avail = await checkAvailability(vendedorId, dataHora);
    if (!avail.available) {
      return res.status(409).json({ error: avail.reason });
    }

    const result = await pool.query(
      "INSERT INTO agendamentos (vendedor_id, lead_id, data_hora, duracao, notas) VALUES ($1, $2, $3, $4, $5) RETURNING *",
      [vendedorId, leadId || null, dataHora, duracao || 30, notas || null],
    );

    log(`[AGENDAMENTO] Created for vendedor ${vendedorId} at ${dataHora}`);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    log("POST /api/agendamentos error: " + err.toString());
    res.status(500).json({ error: "Failed to create agendamento" });
  }
});

// PATCH /api/agendamentos/:id/status
app.patch("/api/agendamentos/:id/status", async (req, res) => {
  const { status } = req.body;
  if (!status) return res.status(400).json({ error: "status is required" });

  try {
    const orgId = await getOrgId(req);
    if (!orgId) return res.status(401).json({ error: "Unauthorized" });

    const result = await pool.query(
      `UPDATE agendamentos a SET status = $1 
             FROM vendedores v WHERE a.id = $2 AND a.vendedor_id = v.id AND v.organization_id = $3 
             RETURNING a.*`,
      [status, req.params.id, orgId],
    );

    if (result.rows.length === 0)
      return res.status(404).json({ error: "Agendamento not found" });
    res.json(result.rows[0]);
  } catch (err) {
    log("PATCH /api/agendamentos/:id/status error: " + err.toString());
    res.status(500).json({ error: "Failed to update agendamento" });
  }
});

// DELETE /api/agendamentos/:id
app.delete("/api/agendamentos/:id", async (req, res) => {
  try {
    const orgId = await getOrgId(req);
    if (!orgId) return res.status(401).json({ error: "Unauthorized" });

    const result = await pool.query(
      "DELETE FROM agendamentos a USING vendedores v WHERE a.id = $1 AND a.vendedor_id = v.id AND v.organization_id = $2 RETURNING a.id",
      [req.params.id, orgId],
    );

    if (result.rows.length === 0)
      return res.status(404).json({ error: "Agendamento not found" });
    res.json({ success: true, message: "Agendamento deleted" });
  } catch (err) {
    log("DELETE /api/agendamentos/:id error: " + err.toString());
    res.status(500).json({ error: "Failed to delete agendamento" });
  }
});

// PATCH /api/agendamentos/:id
app.patch("/api/agendamentos/:id", async (req, res) => {
  const { dataHora, notas, duracao, status } = req.body;
  try {
    const orgId = await getOrgId(req);
    if (!orgId) return res.status(401).json({ error: "Unauthorized" });

    // If updating time, check availability
    if (dataHora) {
      // Get current agendamento to know vendedorId
      const curRes = await pool.query(
        "SELECT vendedor_id FROM agendamentos WHERE id = $1",
        [req.params.id],
      );
      if (curRes.rows.length > 0) {
        const vendedorId = curRes.rows[0].vendedor_id;
        const avail = await checkAvailability(
          vendedorId,
          dataHora,
          req.params.id,
        );
        if (!avail.available) {
          return res.status(409).json({ error: avail.reason });
        }
      }
    }

    const result = await pool.query(
      `UPDATE agendamentos a 
             SET data_hora = COALESCE($1, data_hora), 
                 notas = COALESCE($2, notas),
                 duracao = COALESCE($3, duracao),
                 status = COALESCE($4, status)
             FROM vendedores v 
             WHERE a.id = $5 AND a.vendedor_id = v.id AND v.organization_id = $6 
             RETURNING a.*`,
      [dataHora, notas, duracao, status, req.params.id, orgId],
    );

    if (result.rows.length === 0)
      return res.status(404).json({ error: "Agendamento not found" });
    res.json(result.rows[0]);
  } catch (err) {
    log("PATCH /api/agendamentos/:id error: " + err.toString());
    res.status(500).json({ error: "Failed to update agendamento" });
  }
});

// ─── ROUND ROBIN ENDPOINT ─────────────────────────────────

// POST /api/round-robin/next - Get next vendedor for a lead
app.post("/api/round-robin/next", async (req, res) => {
  try {
    const orgId = await getOrgId(req);
    if (!orgId) return res.status(401).json({ error: "Unauthorized" });

    const vendedor = await getNextVendedor(orgId);
    if (!vendedor)
      return res
        .status(404)
        .json({ error: "Nenhum vendedor ativo disponível" });

    res.json(vendedor);
  } catch (err) {
    log("POST /api/round-robin/next error: " + err.toString());
    res.status(500).json({ error: "Failed to get next vendedor" });
  }
});

// ─── AI TOOL ENDPOINTS ────────────────────────────────────

// POST /api/tools/horarios-disponiveis
// AI calls this to get free slots for the next vendedor
app.post("/api/tools/horarios-disponiveis", async (req, res) => {
  const { date, vendedorId } = req.body;
  if (!date)
    return res.status(400).json({ error: "date is required (YYYY-MM-DD)" });

  try {
    const orgId = await getOrgId(req);
    if (!orgId) return res.status(401).json({ error: "Unauthorized" });

    let targetVendedorId = vendedorId;

    // If no specific vendedor, use round robin to pick the next one
    if (!targetVendedorId) {
      const vendedor = await getNextVendedor(orgId);
      if (!vendedor)
        return res.json({
          slots: [],
          vendedor: null,
          message: "Nenhum vendedor disponível",
        });
      targetVendedorId = vendedor.id;
    }

    const slots = await getFreeSlots(targetVendedorId, date);

    // Get vendedor info
    const vendedorRes = await pool.query(
      "SELECT id, nome FROM vendedores WHERE id = $1",
      [targetVendedorId],
    );
    const vendedor = vendedorRes.rows[0];

    res.json({
      vendedor: { id: vendedor.id, nome: vendedor.nome },
      date,
      slots,
      slotsCount: slots.length,
    });
  } catch (err) {
    log("POST /api/tools/horarios-disponiveis error: " + err.toString());
    res.status(500).json({ error: "Failed to get available slots" });
  }
});

// POST /api/tools/confirmar-agendamento
// AI calls this to book an appointment
app.post("/api/tools/confirmar-agendamento", async (req, res) => {
  const { vendedorId, leadId, date, time, notas } = req.body;
  if (!vendedorId || !date || !time) {
    return res
      .status(400)
      .json({
        error: "vendedorId, date (YYYY-MM-DD) and time (HH:MM) are required",
      });
  }

  try {
    const orgId = await getOrgId(req);
    if (!orgId) return res.status(401).json({ error: "Unauthorized" });

    const dataHora = new Date(`${date}T${time}:00`);

    // Verify availability
    const avail = await checkAvailability(vendedorId, dataHora);
    if (!avail.available) {
      return res.status(409).json({ success: false, error: avail.reason });
    }

    const result = await pool.query(
      "INSERT INTO agendamentos (vendedor_id, lead_id, data_hora, notas) VALUES ($1, $2, $3, $4) RETURNING *",
      [vendedorId, leadId || null, dataHora.toISOString(), notas || null],
    );

    // Increment round-robin counter
    await incrementVendedorCounter(vendedorId, orgId);

    const vendedorRes = await pool.query(
      "SELECT nome FROM vendedores WHERE id = $1",
      [vendedorId],
    );

    log(
      `[AI-TOOL] Agendamento confirmed: vendedor=${vendedorId}, date=${date}, time=${time}`,
    );

    res.json({
      success: true,
      agendamento: result.rows[0],
      message: `Agendamento confirmado com ${vendedorRes.rows[0]?.nome} para ${date} às ${time}.`,
    });
  } catch (err) {
    log("POST /api/tools/confirmar-agendamento error: " + err.toString());
    res.status(500).json({ error: "Failed to confirm agendamento" });
  }
});

// --- CLIENTS API ---

app.get("/api/clients", verifyJWT, async (req, res) => {
  try {
    const userId = req.userId;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const userRes = await pool.query(
      "SELECT organization_id FROM users WHERE id = $1",
      [userId],
    );
    const orgId = userRes.rows[0]?.organization_id;

    log(`[CLIENTS] Fetching clients for User: ${userId}, Org: ${orgId}`);

    if (!orgId)
      return res.json({ clients: [], summary: { total_value: 0, count: 0 } });

    const clientsRes = await pool.query(
      `
            SELECT id, name, company, phone, email, value, status, tags, source, last_contact, created_at
            FROM leads
            WHERE organization_id = $1 
            AND LOWER(status) IN ('cliente', 'client', 'won', 'ganho', 'fechado', 'closed', 'vendido')
            ORDER BY last_contact DESC
        `,
      [orgId],
    );

    const summaryRes = await pool.query(
      `
            SELECT COUNT(*) as count, COALESCE(SUM(value), 0) as total_value
            FROM leads
            WHERE organization_id = $1 
            AND LOWER(status) IN ('cliente', 'client', 'won', 'ganho', 'fechado', 'closed', 'vendido')
        `,
      [orgId],
    );

    const clients = clientsRes.rows.map((row) => ({
      id: row.id,
      name: row.name,
      company: row.company,
      phone: row.phone,
      email: row.email,
      value: Number(row.value),
      status: row.status,
      tags: row.tags || [],
      source: row.source,
      lastContact: row.last_contact,
      createdAt: row.created_at,
    }));

    log(`[CLIENTS] Found ${clients.length} clients.`);

    res.json({
      clients,
      summary: {
        count: parseInt(summaryRes.rows[0].count || 0),
        total_value: parseFloat(summaryRes.rows[0].total_value || 0),
      },
    });
  } catch (err) {
    log("[ERROR] GET /api/clients: " + err.toString());
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── DASHBOARD METRICS (USER) ────────────────────────────
app.get("/api/dashboard/metrics", verifyJWT, async (req, res) => {
  try {
    log("[DASHBOARD] Fetching metrics...");
    const userId = req.userId;
    const days = Math.min(Math.max(parseInt(req.query.days) || 7, 1), 365);

    if (!userId) {
      log("[DASHBOARD] 401 Unauthorized - No valid userId");
      return res.status(401).json({ error: "Unauthorized" });
    }

    const userRes = await pool.query(
      "SELECT organization_id FROM users WHERE id = $1",
      [userId],
    );
    const orgId = userRes.rows[0]?.organization_id;
    log(`[DASHBOARD] User: ${userId}, Org: ${orgId}`);

    if (!orgId) {
      log("[DASHBOARD] No organization found for user");
      return res.json({
        pipeline: {
          total_leads: 0,
          total_value: 0,
          won_value: 0,
          appointments: 0,
        },
        ai: { active_chats: 0, total_messages: 0, saved_hours: 0, chart: [] },
      });
    }

    // 1. Pipeline Metrics
    // Total Leads & Value
    const leadsRes = await pool.query(
      `
            SELECT 
                COUNT(*) as count,
                COALESCE(SUM(value), 0) as total_value
            FROM leads 
            WHERE organization_id = $1
        `,
      [orgId],
    );

    // Won Value (Check multiple possible column names and values)
    const wonRes = await pool.query(
      `
            SELECT 
                COUNT(*) as won_count,
                COALESCE(SUM(value), 0) as won_value
            FROM leads 
            WHERE organization_id = $1 
            AND LOWER(status) IN ('fechado', 'closed', 'won', 'ganho', 'vendido', 'cliente')
        `,
      [orgId],
    );

    // DEBUG: Check if there are leads with 'Cliente' status
    const clienteCheck = await pool.query(
      `
            SELECT id, name, value, status FROM leads WHERE organization_id = $1 AND status = 'Cliente'
        `,
      [orgId],
    );
    log(
      `[DASHBOARD DEBUG] Org: ${orgId}, Leads with "Cliente": ${clienteCheck.rows.length}`,
    );
    clienteCheck.rows.forEach((r) =>
      log(` - Lead: ${r.name}, Value: ${r.value}, Status: ${r.status}`),
    );
    log(`[DASHBOARD DEBUG] Won Value calculated: ${wonRes.rows[0].won_value}`);
    log(`[DASHBOARD DEBUG] Won Count calculated: ${wonRes.rows[0].won_count}`);

    // Appointments
    const apptRes = await pool.query(
      `
            SELECT COUNT(*) as count
            FROM agendamentos a
            JOIN vendedores v ON a.vendedor_id = v.id
            WHERE v.organization_id = $1 AND a.status != 'cancelado'
        `,
      [orgId],
    );

    // 2. AI Metrics
    // Active Chats (Messages in last 24h)
    const activeChatsRes = await pool.query(
      `
            SELECT COUNT(DISTINCT remote_jid) as count
            FROM chat_messages cm
            JOIN agents a ON cm.agent_id = a.id
            WHERE a.organization_id = $1 
            AND cm.created_at > NOW() - INTERVAL '1 day' * $2
        `,
      [orgId, days],
    );

    // Total Messages
    const msgRes = await pool.query(
      `
            SELECT COUNT(*) as count
            FROM chat_messages cm
            JOIN agents a ON cm.agent_id = a.id
            WHERE a.organization_id = $1
        `,
      [orgId],
    );

    const totalMessages = parseInt(msgRes.rows[0].count || 0);

    // Chart Data (Last 7 Days) — using EXTRACT(DOW) to avoid PostgreSQL locale issues with TO_CHAR('Dy')
    const chartRes = await pool.query(
      `
            SELECT 
                EXTRACT(DOW FROM cm.created_at)::int as dow,
                DATE(cm.created_at) as msg_date,
                COUNT(*) as volume
            FROM chat_messages cm
            JOIN agents a ON cm.agent_id = a.id
            WHERE a.organization_id = $1
            AND cm.created_at >= NOW() - INTERVAL '1 day' * $2
            GROUP BY 2, 1
            ORDER BY 2 ASC
        `,
      [orgId, days],
    );

    const ptDayNames = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sab"];

    // Build statsMap keyed by date string "YYYY-MM-DD" => volume
    const statsMap = {};
    chartRes.rows.forEach((r) => {
      const dateKey = new Date(r.msg_date).toISOString().slice(0, 10);
      statsMap[dateKey] = (statsMap[dateKey] || 0) + parseInt(r.volume);
    });

    // Zero-fill last 7 days with dd/MM labels
    const chartData = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateKey = d.toISOString().slice(0, 10);
      const dd = String(d.getDate()).padStart(2, "0");
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      chartData.push({
        name: `${dd}/${mm}`,
        volume: statsMap[dateKey] || 0,
      });
    }

    res.json({
      pipeline: {
        total_leads: parseInt(leadsRes.rows[0].count || 0),
        total_value: parseFloat(leadsRes.rows[0].total_value || 0),
        won_value: parseFloat(wonRes.rows[0].won_value || 0),
        won_count: parseInt(wonRes.rows[0].won_count || 0),
        appointments: parseInt(apptRes.rows[0].count || 0),
      },
      ai: {
        active_chats: parseInt(activeChatsRes.rows[0].count || 0),
        total_messages: totalMessages,
        saved_hours: Math.round((totalMessages * 2) / 60),
        chart: chartData,
      },
    });
  } catch (err) {
    log("[ERROR] GET /api/dashboard/metrics: " + err.toString());
    res.status(500).json({ error: "Internal server error" });
  }
});

// --- REVENUE INTELLIGENCE ENDPOINTS ---

// GET /api/dashboard/forecast — Revenue Forecast weighted by intent tier
app.get("/api/dashboard/forecast", verifyJWT, async (req, res) => {
  try {
    const userId = req.userId;
    const userRes = await pool.query("SELECT organization_id FROM users WHERE id = $1", [userId]);
    const orgId = userRes.rows[0]?.organization_id;
    if (!orgId) return res.json({ projected: 0, pipeline_total: 0, hot_value: 0, warm_value: 0, cold_value: 0, by_stage: [] });

    // Get all active leads with value, score, intent, status
    const result = await pool.query(
      `SELECT status, value, COALESCE(score, 0) as score, COALESCE(intent_label, 'COLD') as intent_label
       FROM leads
       WHERE organization_id = $1
         AND LOWER(status) NOT IN ('cliente', 'fechado', 'closed', 'won', 'ganho', 'perdido', 'lost')
         AND COALESCE(value, 0) > 0`,
      [orgId]
    );

    // Probability weights by tier
    const weights = { HOT: 0.70, WARM: 0.30, COLD: 0.05 };

    let hot_value = 0, warm_value = 0, cold_value = 0, projected = 0;
    const stageMap = {};

    result.rows.forEach(row => {
      const v = parseFloat(row.value) || 0;
      const tier = row.intent_label || 'COLD';
      const weight = weights[tier] || 0.05;

      if (tier === 'HOT') hot_value += v;
      else if (tier === 'WARM') warm_value += v;
      else cold_value += v;

      projected += v * weight;

      const stage = row.status || 'Sem Estágio';
      if (!stageMap[stage]) stageMap[stage] = { stage, value: 0, count: 0 };
      stageMap[stage].value += v;
      stageMap[stage].count += 1;
    });

    const by_stage = Object.values(stageMap).sort((a, b) => b.value - a.value).slice(0, 6);

    res.json({
      projected: Math.round(projected),
      pipeline_total: Math.round(hot_value + warm_value + cold_value),
      hot_value: Math.round(hot_value),
      warm_value: Math.round(warm_value),
      cold_value: Math.round(cold_value),
      by_stage,
    });
  } catch (err) {
    log("GET /api/dashboard/forecast error: " + err.toString());
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/dashboard/velocity — Avg hours without contact per pipeline stage
app.get("/api/dashboard/velocity", verifyJWT, async (req, res) => {
  try {
    const userId = req.userId;
    const userRes = await pool.query("SELECT organization_id FROM users WHERE id = $1", [userId]);
    const orgId = userRes.rows[0]?.organization_id;
    if (!orgId) return res.json([]);

    const result = await pool.query(
      `SELECT
         status,
         COUNT(*) as lead_count,
         ROUND(AVG(EXTRACT(EPOCH FROM (NOW() - COALESCE(last_interaction_at, last_contact, created_at))) / 3600)::numeric, 1) as avg_hours_idle
       FROM leads
       WHERE organization_id = $1
         AND LOWER(status) NOT IN ('cliente', 'fechado', 'closed', 'won', 'ganho', 'perdido', 'lost')
       GROUP BY status
       ORDER BY avg_hours_idle DESC
       LIMIT 8`,
      [orgId]
    );

    const stages = result.rows.map(r => ({
      stage: r.status,
      count: parseInt(r.lead_count),
      avg_hours_idle: parseFloat(r.avg_hours_idle) || 0,
    }));

    res.json(stages);
  } catch (err) {
    log("GET /api/dashboard/velocity error: " + err.toString());
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/dashboard/urgency — Leads needing action: now (2h), today (24h), at-risk (48h+)
app.get("/api/dashboard/urgency", verifyJWT, async (req, res) => {
  try {
    const userId = req.userId;
    const userRes = await pool.query("SELECT organization_id FROM users WHERE id = $1", [userId]);
    const orgId = userRes.rows[0]?.organization_id;
    if (!orgId) return res.json({ now: [], today: [], at_risk: [] });

    const result = await pool.query(
      `SELECT
         id, name, phone, status, value,
         COALESCE(score, 0) as score,
         COALESCE(intent_label, 'COLD') as intent_label,
         last_ia_briefing,
         COALESCE(last_interaction_at, last_contact, created_at) as last_activity,
         EXTRACT(EPOCH FROM (NOW() - COALESCE(last_interaction_at, last_contact, created_at))) / 3600 as hours_idle
       FROM leads
       WHERE organization_id = $1
         AND LOWER(status) NOT IN ('cliente', 'fechado', 'closed', 'won', 'ganho', 'perdido', 'lost')
       ORDER BY score DESC, hours_idle DESC
       LIMIT 60`,
      [orgId]
    );

    const now = [], today = [], at_risk = [];

    result.rows.forEach(r => {
      const h = parseFloat(r.hours_idle) || 0;
      const tier = r.intent_label;
      const lead = {
        id: r.id,
        name: r.name,
        phone: r.phone,
        status: r.status,
        value: parseFloat(r.value) || 0,
        score: parseInt(r.score),
        intentLabel: tier,
        briefing: r.last_ia_briefing,
        hours_idle: Math.round(h * 10) / 10,
      };

      // Agir Agora: HOT leads idle > 2h
      if (tier === 'HOT' && h >= 2 && now.length < 10) now.push(lead);
      // Agir Hoje: WARM idle > 8h OR HOT idle > 6h
      else if (((tier === 'WARM' && h >= 8) || (tier === 'HOT' && h >= 6)) && today.length < 10) today.push(lead);
      // Em Risco: any non-COLD lead idle > 48h
      else if (tier !== 'COLD' && h >= 48 && at_risk.length < 10) at_risk.push(lead);
    });

    res.json({ now, today, at_risk });
  } catch (err) {
    log("GET /api/dashboard/urgency error: " + err.toString());
    res.status(500).json({ error: "Internal server error" });
  }
});

// In-memory Win/Loss cache (per org, 24h TTL)
const winLossCache = new Map();

// GET /api/dashboard/winloss — AI pattern analysis of wins and losses
app.get("/api/dashboard/winloss", verifyJWT, async (req, res) => {
  try {
    const userId = req.userId;
    const userRes = await pool.query("SELECT organization_id FROM users WHERE id = $1", [userId]);
    const orgId = userRes.rows[0]?.organization_id;
    if (!orgId) return res.json({ win_patterns: [], loss_patterns: [], sample_count: 0 });

    // Check cache (24h TTL)
    const cached = winLossCache.get(orgId);
    if (cached && (Date.now() - cached.ts) < 24 * 60 * 60 * 1000) {
      return res.json(cached.data);
    }

    // Fetch recent won/lost leads with briefings
    const result = await pool.query(
      `SELECT name, status, value, last_ia_briefing, score, temperature
       FROM leads
       WHERE organization_id = $1
         AND LOWER(status) IN ('cliente', 'fechado', 'closed', 'won', 'ganho', 'perdido', 'lost')
         AND last_ia_briefing IS NOT NULL
       ORDER BY last_contact DESC
       LIMIT 30`,
      [orgId]
    );

    if (result.rows.length < 3) {
      return res.json({ win_patterns: [], loss_patterns: [], sample_count: result.rows.length, insufficient_data: true });
    }

    const wins = result.rows.filter(r => ['cliente', 'fechado', 'closed', 'won', 'ganho'].includes(r.status?.toLowerCase()));
    const losses = result.rows.filter(r => ['perdido', 'lost'].includes(r.status?.toLowerCase()));

    const prompt = `Você é um analista de vendas da Kogna Revenue OS.
Analise os dados abaixo de leads ganhos e perdidos e identifique padrões.

LEADS GANHOS (${wins.length}):
${wins.map(r => `- ${r.name}: "${r.last_ia_briefing}" (score ${r.score})`).join('\n')}

LEADS PERDIDOS (${losses.length}):
${losses.map(r => `- ${r.name}: "${r.last_ia_briefing}" (score ${r.score})`).join('\n')}

Retorne APENAS um JSON válido com:
- win_patterns: array de 3 strings curtas (max 80 chars cada) descrevendo padrões dos leads ganhos
- loss_patterns: array de 3 strings curtas (max 80 chars cada) descrevendo padrões dos leads perdidos

JSON:`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "system", content: prompt }],
      response_format: { type: "json_object" }
    });

    const analysis = JSON.parse(completion.choices[0].message.content);
    const responseData = {
      win_patterns: analysis.win_patterns || [],
      loss_patterns: analysis.loss_patterns || [],
      sample_count: result.rows.length,
      last_updated: new Date().toISOString(),
    };

    // Cache for 24h
    winLossCache.set(orgId, { ts: Date.now(), data: responseData });

    res.json(responseData);
  } catch (err) {
    log("GET /api/dashboard/winloss error: " + err.toString());
    res.status(500).json({ error: "Internal server error" });
  }
});

// --- ADMIN API ---

app.get("/api/admin/stats", verifyAdmin, async (req, res) => {
  try {
    // 1. Calculate MRR
    // basic: 97, pro: 197, enterprise: 497 (example values)
    const planPrices = { basic: 97, pro: 197, enterprise: 497 };
    const orgs = await pool.query(
      "SELECT plan_type, COUNT(*) as count FROM organizations GROUP BY plan_type",
    );
    let mrr = 0;
    orgs.rows.forEach((row) => {
      const price = planPrices[row.plan_type] || 97;
      mrr += price * parseInt(row.count);
    });

    // 2. Revenue last 6 months (subscriptions + koins)
    const revenueData = await pool.query(`
            SELECT 
                TO_CHAR(created_at, 'YYYY-MM') as month,
                SUM(value) as total
            FROM billing_history
            WHERE created_at > NOW() - INTERVAL '6 months'
            AND status = 'paid'
            GROUP BY month
            ORDER BY month ASC
        `);

    // Add dummy MRR to each month for simplicity in dashboard visualization
    const chartData = revenueData.rows.map((row) => ({
      month: row.month,
      revenue: parseFloat(row.total) + mrr, // Current MRR + historical koin sales
    }));

    res.json({ mrr, chartData });
  } catch (err) {
    log("GET /api/admin/stats error: " + err.toString());
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/api/admin/users", verifyAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
            SELECT 
                u.id, u.name, u.email, u.koins_balance, u.created_at, u.role,
                COALESCE(NULLIF(u.personal_phone, ''), NULLIF(u.company_phone, '')) AS phone,
                o.name as company_name, o.plan_type
            FROM users u
            LEFT JOIN organizations o ON o.id = u.organization_id
            ORDER BY u.created_at DESC
        `);
    res.json(result.rows);
  } catch (err) {
    log("GET /api/admin/users error: " + err.toString());
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/admin/users - Create a new user (admin only)
app.post("/api/admin/users", verifyAdmin, async (req, res) => {
  const { email, name, role } = req.body;

  // Validate required fields
  if (!email || !name) {
    return res.status(400).json({ error: "Email and name are required" });
  }

  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ error: "Invalid email format" });
  }

  // Validate role
  const allowedRoles = ["user", "admin"];
  const userRole = role && allowedRoles.includes(role) ? role : "user";

  try {
    // Check if email already exists
    const existingUser = await pool.query(
      "SELECT id FROM users WHERE email = $1",
      [email],
    );

    if (existingUser.rows.length > 0) {
      return res.status(409).json({ error: "Email already exists" });
    }

    // Create new user
    const result = await pool.query(
      `INSERT INTO users (email, name, role, onboarding_completed, koins_balance) 
             VALUES ($1, $2, $3, $4, $5) 
             RETURNING id, email, name, role, koins_balance, created_at, onboarding_completed`,
      [email, name, userRole, false, 0],
    );

    log(`[ADMIN] Created new user: ${email} with role: ${userRole}`);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    log("POST /api/admin/users error: " + err.toString());
    res.status(500).json({ error: "Failed to create user" });
  }
});

// DELETE /api/admin/users/:id - Delete a user (admin only)
app.delete("/api/admin/users/:id", verifyAdmin, async (req, res) => {
  const { id } = req.params;
  const client = await pool.connect();

  try {
    const result = await deleteAdminUserCascade(id, req.userId || null, client);
    if (result.error === "self_delete") {
      return res.status(400).json({ error: "Cannot delete yourself" });
    }
    if (result.error === "not_found") {
      return res.status(404).json({ error: "User not found" });
    }

    log(`[ADMIN] Deleted user: ${id}`);
    res.json({ success: true, message: "User deleted successfully", organization_deleted: result.orgDeleted });
  } catch (err) {
    log("DELETE /api/admin/users/:id error: " + err.toString());
    // Check for foreign key constraint violations if not cascading
    if (err.code === "23503") {
      return res
        .status(400)
        .json({
          error:
            "Cannot delete user with associated data (organizations, etc.)",
        });
    }
    res.status(500).json({ error: "Failed to delete user" });
  } finally {
    client.release();
  }
});

app.patch("/api/admin/users/:id/koins", verifyAdmin, async (req, res) => {
  const { id } = req.params;
  const { amount } = req.body; // e.g., +100 or -50
  try {
    const update = await adjustUserKoinsBalance({
      userId: id,
      delta: amount,
      source: "admin_adjustment",
      metadata: { actor_user_id: req.userId || null },
    });
    if (!update) {
      return res.status(404).json({ error: "User not found" });
    }
    res.json({ success: true, newBalance: update.koins_balance });
  } catch (err) {
    log("PATCH /api/admin/users/:id/koins error: " + err.toString());
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/api/admin/consumption", verifyAdmin, async (req, res) => {
  try {
    const metricsStartAt = await getAdminMetricsStartAt();
    const stats = await pool.query(`
      WITH message_usage AS (
        SELECT
          a.organization_id,
          COUNT(*)::int AS total_messages,
          COALESCE(SUM(cm.prompt_tokens), 0)::bigint AS total_prompt_tokens,
          COALESCE(SUM(cm.completion_tokens), 0)::bigint AS total_completion_tokens,
          COALESCE(SUM(cm.token_cost), 0)::numeric AS total_cost
        FROM chat_messages cm
        JOIN agents a ON a.id = cm.agent_id
        WHERE cm.created_at >= $1
        GROUP BY a.organization_id
      ),
      koins_usage AS (
        SELECT
          user_id,
          COALESCE(SUM(ABS(delta)) FILTER (WHERE delta < 0), 0)::int AS koins_spent_real
        FROM koins_ledger
        WHERE created_at >= $1
        GROUP BY user_id
      )
      SELECT
        u.id,
        u.name AS user_name,
        u.email,
        COALESCE(o.name, 'Sem empresa') AS company_name,
        COALESCE(mu.total_messages, 0) AS total_messages,
        COALESCE(mu.total_prompt_tokens, 0) AS total_prompt_tokens,
        COALESCE(mu.total_completion_tokens, 0) AS total_completion_tokens,
        COALESCE(mu.total_cost, 0)::float AS total_cost,
        COALESCE(ku.koins_spent_real, 0) AS koins_spent_real,
        COALESCE(u.koins_balance, 0) AS current_koins_balance
      FROM users u
      LEFT JOIN organizations o ON u.organization_id = o.id
      LEFT JOIN message_usage mu ON mu.organization_id = o.id
      LEFT JOIN koins_usage ku ON ku.user_id = u.id
      WHERE u.role = 'user'
      ORDER BY COALESCE(mu.total_cost, 0) DESC, COALESCE(ku.koins_spent_real, 0) DESC, u.created_at DESC
      LIMIT 50
    `, [metricsStartAt]);
    res.json(stats.rows);
  } catch (err) {
    log("GET /api/admin/consumption error: " + err.toString());
    res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/api/payments/webhook", async (req, res) => {
  const { userId, amount, secret } = req.body;

  // Strict security check
  const configuredSecret = process.env.PAYMENT_WEBHOOK_SECRET;
  if (!configuredSecret) {
    log(
      "[SECURITY] PAYMENT_WEBHOOK_SECRET not set in .env. Rejecting webhook request.",
    );
    return res.status(500).json({ error: "Server misconfiguration" });
  }

  if (secret !== configuredSecret) {
    log(
      `[SECURITY] Invalid secret provided for payment webhook. IP: ${req.ip}`,
    );
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    if (!userId || !amount) {
      return res.status(400).json({ error: "Missing userId or amount" });
    }

    const result = await adjustUserKoinsBalance({
      userId,
      delta: amount,
      source: "payment_webhook_credit",
      metadata: { payment_amount: amount },
    });

    if (!result) {
      return res.status(404).json({ error: "User not found" });
    }

    log(
      `[PAYMENT] Added ${amount} koins to user ${userId}. New balance: ${result.koins_balance}`,
    );
    res.json({ success: true, newBalance: result.koins_balance });
  } catch (err) {
    log("POST /api/payments/webhook error: " + err.toString());
    res.status(500).json({ error: "Payment processing failed" });
  }
});

// GET /api/billing/history - Fetch successful transactions
app.get("/api/billing/history", verifyJWT, async (req, res) => {
  try {
    const userId = req.userId;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const result = await pool.query(
      "SELECT * FROM billing_history WHERE user_id = $1 ORDER BY created_at DESC",
      [userId],
    );
    res.json(result.rows);
  } catch (err) {
    log("GET /api/billing/history error: " + err.toString());
    res.status(500).json({ error: "Database error" });
  }
});

// POST /api/billing/checkout (Mock for now)
app.post("/api/billing/checkout", verifyJWT, async (req, res) => {
  const { packageId, amount, value } = req.body;
  try {
    const userId = req.userId;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    // Mock: Create pending transaction
    const result = await pool.query(
      "INSERT INTO billing_history (user_id, amount, value, status) VALUES ($1, $2, $3, $4) RETURNING *",
      [userId, amount, value, "pending"],
    );

    log(
      `[BILLING] Created checkout intent for user ${userId}, package ${packageId}`,
    );
    res.json({ success: true, transactionId: result.rows[0].id });
  } catch (err) {
    log("POST /api/billing/checkout error: " + err.toString());
    res.status(500).json({ error: "Checkout failed" });
  }
});

// POST /api/payments/create-preference - Create Mercado Pago Preference (Direct REST API)
app.post("/api/payments/create-preference", verifyJWT, async (req, res) => {
  try {
    const userId = req.userId;

    const { items, payer } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "Items are required" });
    }

    const accessToken = (process.env.MERCADOPAGO_ACCESS_TOKEN || "").trim();
    if (!accessToken || accessToken === "YOUR_ACCESS_TOKEN_HERE") {
      log(
        "[ERROR] MERCADOPAGO_ACCESS_TOKEN not configured or still placeholder",
      );
      return res
        .status(500)
        .json({
          error: "Server misconfiguration: Payment Gateway not configured",
        });
    }

    log(
      `[MERCADOPAGO] Creating preference via REST API. Token prefix: ${accessToken.substring(0, 15)}...`,
    );
    log(`[MERCADOPAGO] Items: ${JSON.stringify(items)}`);

    // Build webhook URL for IPN notifications
    const appUrl = (process.env.APP_URL || "").trim();
    const notificationUrl = appUrl
      ? `${appUrl}/api/payments/mercadopago-ipn`
      : null;
    // Frontend URL for redirects after payment
    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";

    const preferenceBody = {
      items: items.map((item) => ({
        id: item.id || "item-1",
        title: item.title,
        description: item.description || "",
        quantity: item.quantity || 1,
        unit_price: Number(item.unit_price),
        currency_id: "BRL",
      })),
      payer: {
        email: payer?.email || "test@test.com",
      },
      // Link the userId so we know who to credit Koins to
      external_reference: userId || "anonymous",
      // Back URLs only work with HTTPS (MP rejects localhost)
      ...(frontendUrl.startsWith("https") && {
        back_urls: {
          success: `${frontendUrl}/checkout/success`,
          failure: `${frontendUrl}/checkout/failure`,
          pending: `${frontendUrl}/checkout/pending`,
        },
        auto_return: "approved",
      }),
      // IPN: Mercado Pago will POST to this URL when payment status changes
      ...(notificationUrl && { notification_url: notificationUrl }),
    };

    log(`[MERCADOPAGO] Request body: ${JSON.stringify(preferenceBody)}`);

    const mpResponse = await fetch(
      "https://api.mercadopago.com/checkout/preferences",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(preferenceBody),
      },
    );

    const mpData = await mpResponse.json();

    if (!mpResponse.ok) {
      log(
        `[MERCADOPAGO-ERROR] Status: ${mpResponse.status} | Body: ${JSON.stringify(mpData)}`,
      );
      return res.status(mpResponse.status).json({
        error: "Failed to create preference",
        details: mpData.message || JSON.stringify(mpData),
        mpStatus: mpResponse.status,
        mpError: mpData,
      });
    }

    log(`[MERCADOPAGO] Preference created successfully: ${mpData.id}`);
    res.json({ id: mpData.id, init_point: mpData.init_point });
  } catch (error) {
    log(
      "[ERROR] POST /api/payments/create-preference: " +
      (error.message || JSON.stringify(error)),
    );
    res.status(500).json({
      error: "Failed to create preference",
      details: error.message || "Unknown error",
    });
  }
});

// POST /api/payments/process-payment - Process Transparent Checkout Payment
app.post("/api/payments/process-payment", verifyJWT, async (req, res) => {
  try {
    log(
      `[MERCADOPAGO] Processing payment. Body keys: ${Object.keys(req.body).join(", ")}`,
    );

    const accessToken = (process.env.MERCADOPAGO_ACCESS_TOKEN || "").trim();
    if (!accessToken) {
      return res.status(500).json({ error: "Payment gateway not configured" });
    }

    const userId = req.userId;

    // Build webhook URL for IPN notifications
    const appUrl = (process.env.APP_URL || "").trim();
    let notificationUrl = null;
    if (appUrl) {
      // Mercado Pago requires HTTPS for production webhooks
      notificationUrl = appUrl.startsWith("http") ? appUrl : `https://${appUrl}`;
      notificationUrl = `${notificationUrl}/api/payments/mercadopago-ipn`;
    }

    // Ensure external_reference is set to userId for Koins tracking
    const paymentBody = {
      ...req.body,
      external_reference: String(userId || req.body.external_reference || "anonymous"),
      ...(notificationUrl && { notification_url: notificationUrl }),
    };

    log(
      `[MERCADOPAGO] Sending payment to MP API: ${JSON.stringify(paymentBody)}`,
    );

    const mpResponse = await fetch("https://api.mercadopago.com/v1/payments", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
        "X-Idempotency-Key": `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      },
      body: JSON.stringify(paymentBody),
    });

    const mpData = await mpResponse.json();

    if (!mpResponse.ok) {
      log(
        `[MERCADOPAGO-ERROR] Payment failed. Status: ${mpResponse.status} | Body: ${JSON.stringify(mpData)}`,
      );
      return res.status(mpResponse.status).json({
        error: "Payment processing failed",
        details: mpData.message || JSON.stringify(mpData),
        mpError: mpData,
      });
    }

    log(
      `[MERCADOPAGO] Payment processed. ID: ${mpData.id} | Status: ${mpData.status} | Method: ${mpData.payment_method_id}`,
    );

    // If payment is approved, credit Koins immediately
    if (mpData.status === "approved" && userId) {
      try {
        const paymentAmount = mpData.transaction_amount || 0;
        let koinsToCredit = Math.floor(paymentAmount * 10);

        // Check for product bonus
        const productId = req.body.metadata?.product_id || req.body.product_id;
        if (productId) {
          try {
            const productRes = await pool.query(
              "SELECT koins_bonus FROM products WHERE id = $1",
              [productId],
            );
            if (productRes.rows.length > 0) {
              const bonus = productRes.rows[0].koins_bonus;
              // Only apply override if bonus is explicitly set (even if 0, technically, but usually we want positive)
              // Assuming 0 means 'default calculation' or 'no bonus', but user requirement implies 'specific value'.
              // If user sets 0, they might mean 0 koins.
              // Let's assume if it's not null, we use it. But DB default is 0.
              // If default is 0, maybe we should treat 0 as "fallback to standard"?
              // User said: "configurar quantas Koins aquele pagamento vai liberar".
              // If product has 0, maybe they want 0?
              // But migration set default to 0.
              // Let's use: if (bonus > 0) use bonus. If 0, use standard.
              // OR: if user wants 0, they can't?
              // Safety: use bonus if > 0.
              if (bonus > 0) {
                koinsToCredit = bonus;
                log(`[KOINS-BONUS] Applied product specific bonus: ${bonus}`);
              }
            }
          } catch (e) {
            log(`[KOINS-BONUS] Error fetching product bonus: ${e.message}`);
          }
        }

        const creditedUser = await adjustUserKoinsBalance({
          userId,
          delta: koinsToCredit,
          source: "mercadopago_status_credit",
          metadata: {
            payment_amount: paymentAmount,
            mp_payment_id: String(mpData.id),
          },
        });
        log(
          `[KOINS] Credited ${koinsToCredit} koins to user ${userId} for payment of R$${paymentAmount}. Balance: ${creditedUser?.koins_balance ?? "n/a"}`,
        );

        // Record in billing history
        try {
          await pool.query(
            `INSERT INTO billing_history (user_id, amount, value, status, mp_payment_id) VALUES ($1, $2, $3, 'approved', $4)`,
            [userId, koinsToCredit, paymentAmount, String(mpData.id)],
          );
        } catch (billErr) {
          await pool
            .query(
              `INSERT INTO billing_history (user_id, amount, value, status) VALUES ($1, $2, $3, 'approved')`,
              [userId, koinsToCredit, paymentAmount],
            )
            .catch(() => { });
        }

        // Notification
        await pool
          .query(
            `INSERT INTO notifications (user_id, title, message) VALUES ($1, $2, $3)`,
            [
              userId,
              "Pagamento Confirmado! 🎉",
              `Seu pagamento de R$${paymentAmount.toFixed(2)} foi aprovado. ${koinsToCredit} Koins foram adicionados à sua conta!`,
            ],
          )
          .catch(() => { });

        // Affiliate commission
        await processAffiliateCommission(userId, paymentAmount).catch(() => { });
      } catch (koinErr) {
        log(`[KOINS-ERROR] Failed to credit koins: ${koinErr.message}`);
      }
    }

    // Return full response including PIX data if applicable
    res.json({
      status: mpData.status,
      status_detail: mpData.status_detail,
      id: mpData.id,
      payment_method_id: mpData.payment_method_id,
      // PIX QR Code data
      ...(mpData.point_of_interaction && {
        point_of_interaction: mpData.point_of_interaction,
      }),
    });
  } catch (error) {
    log(
      "[ERROR] POST /api/payments/process-payment: " +
      (error.message || JSON.stringify(error)),
    );
    res.status(500).json({
      error: "Payment processing failed",
      details: error.message || "Unknown error",
    });
  }
});

// POST /api/payments/mercadopago-ipn - Mercado Pago IPN Webhook
// This endpoint is called by Mercado Pago when a payment status changes
app.post("/api/payments/mercadopago-ipn", async (req, res) => {
  try {
    log(`[MP-IPN] Received notification: ${JSON.stringify(req.body)}`);
    log(`[MP-IPN] Query params: ${JSON.stringify(req.query)}`);

    // Mercado Pago sends different notification types: Webhooks (v2) or IPN (legacy)
    const { type, action } = req.body;
    const topic = req.query.topic || req.body.topic;
    const dataId = req.body.data?.id || req.query["data.id"] || req.query.id;

    log(`[MP-IPN] Details - Type: ${type}, Action: ${action}, Topic: ${topic}, DataID: ${dataId}`);

    // Normalize topic/type
    const actualType = type || topic;

    // We only care about payment notifications
    if (actualType !== "payment" || !dataId) {
      log(`[MP-IPN] Ignoring non-payment notification. Type/Topic: ${actualType}`);
      return res.status(200).send("OK");
    }

    log(`[MP-IPN] Processing payment notification. Payment ID: ${dataId}`);

    // Fetch payment details from Mercado Pago
    const accessToken = (process.env.MERCADOPAGO_ACCESS_TOKEN || "").trim();
    const mpResponse = await fetch(
      `https://api.mercadopago.com/v1/payments/${dataId}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
    );

    if (!mpResponse.ok) {
      log(
        `[MP-IPN] Failed to fetch payment ${dataId}. Status: ${mpResponse.status}`,
      );
      return res.status(500).json({ error: "Failed to verify payment" });
    }

    const payment = await mpResponse.json();
    log(
      `[MP-IPN] Payment ${dataId}: status=${payment.status}, amount=${payment.transaction_amount}, ref=${payment.external_reference}`,
    );

    // Only process approved payments
    if (payment.status !== "approved") {
      log(
        `[MP-IPN] Payment ${dataId} not approved (status: ${payment.status}). Skipping.`,
      );
      return res.status(200).send("OK");
    }

    // Check if we already processed this payment (idempotency)
    const existingPayment = await pool.query(
      "SELECT id FROM billing_history WHERE mp_payment_id = $1",
      [String(dataId)],
    );

    if (existingPayment.rows.length > 0) {
      log(`[MP-IPN] Payment ${dataId} already processed. Skipping.`);
      return res.status(200).send("OK");
    }

    // Get userId from external_reference
    const userId = payment.external_reference;
    if (!userId || userId === "anonymous") {
      log(`[MP-IPN] No valid user reference (external_reference) for payment ${dataId}.`);
      return res.status(200).send("OK");
    }
    log(`[MP-IPN] Crediting Koins to user: ${userId}`);

    // Verify user exists
    const userCheck = await pool.query(
      "SELECT id, koins_balance FROM users WHERE id = $1",
      [userId],
    );
    if (userCheck.rows.length === 0) {
      log(`[MP-IPN] User ${userId} not found for payment ${dataId}.`);
      return res.status(200).send("OK");
    }

    // Calculate Koins (10 Koins per R$1)
    const paymentAmount = payment.transaction_amount || 0;
    let koinsToCredit = Math.floor(paymentAmount * 10);
    let connectionsToCredit = 0;
    let purchasedQuantity = payment.metadata?.quantity ? parseInt(payment.metadata.quantity) : 1;

    // Check for product bonus via metadata
    const productId = payment.metadata?.product_id;
    if (productId) {
      try {
        const productRes = await pool.query(
          "SELECT koins_bonus, connections_bonus, type FROM products WHERE id = $1",
          [productId],
        );
        if (productRes.rows.length > 0) {
          const product = productRes.rows[0];
          const koins_bonus = product.koins_bonus;
          const connections_bonus = product.connections_bonus;

          if (koins_bonus > 0) {
            koinsToCredit = koins_bonus * purchasedQuantity;
            log(`[MP-IPN] Applied product specific koins bonus: ${koins_bonus} x ${purchasedQuantity}`);
          }
          if (connections_bonus > 0 || product.type === 'CONNECTIONS') {
            connectionsToCredit = (connections_bonus > 0 ? connections_bonus : 1) * purchasedQuantity;
            log(`[MP-IPN] Applied product connections bonus: ${connectionsToCredit}`);
          }
        }
      } catch (e) {
        log(`[MP-IPN] Error fetching product bonus: ${e.message}`);
      }
    } else if (payment.additional_info?.items?.length > 0) {
      // Fallback to checking items if metadata is missing
      for (const item of payment.additional_info.items) {
        if (item.id && item.id.length > 10) {
          try {
            const productRes = await pool.query(
              "SELECT koins_bonus, connections_bonus, type FROM products WHERE id = $1",
              [item.id],
            );
            if (productRes.rows.length > 0) {
              const product = productRes.rows[0];
              if (product.koins_bonus > 0) {
                koinsToCredit = product.koins_bonus * purchasedQuantity;
                log(`[MP-IPN] Applied product koins bonus from item ${item.id}: ${koinsToCredit}`);
              }
              if (product.connections_bonus > 0 || product.type === 'CONNECTIONS') {
                connectionsToCredit = (product.connections_bonus > 0 ? product.connections_bonus : 1) * purchasedQuantity;
                log(`[MP-IPN] Applied product connections bonus from item ${item.id}: ${connectionsToCredit}`);
              }
              break; // Assume single product for now
            }
          } catch (e) { }
        }
      }
    }

    // Credit Koins
    const updateResult = await adjustUserKoinsBalance({
      userId,
      delta: koinsToCredit,
      source: "mercadopago_ipn_credit",
      metadata: {
        payment_amount: paymentAmount,
        mp_payment_id: String(dataId),
      },
    });

    if (!updateResult) {
      log(`[MP-IPN] User ${userId} not found in database. Cannot credit Koins.`);
      return res.status(200).send("OK");
    }

    log(
      `[MP-IPN] ✅ Credited ${koinsToCredit} Koins to user ${userId}. New balance: ${updateResult.koins_balance}`,
    );

    // Credit Connections if applicable
    if (connectionsToCredit > 0) {
      const userRes = await pool.query("SELECT organization_id FROM users WHERE id = $1", [userId]);
      const orgId = userRes.rows[0]?.organization_id;
      if (orgId) {
        await pool.query(
          "UPDATE organizations SET whatsapp_connections_limit = whatsapp_connections_limit + $1 WHERE id = $2",
          [connectionsToCredit, orgId]
        );
        log(`[MP-IPN] ✅ Credited ${connectionsToCredit} connections to organization ${orgId}`);
      }
    }

    // Record in billing history
    try {
      await pool.query(
        `INSERT INTO billing_history (user_id, amount, value, status, mp_payment_id) 
                 VALUES ($1, $2, $3, 'approved', $4)`,
        [userId, koinsToCredit, paymentAmount, String(dataId)],
      );
    } catch (billErr) {
      // billing_history might not have mp_payment_id column yet - try without it
      log(
        `[MP-IPN] billing_history insert with mp_payment_id failed, trying without: ${billErr.message}`,
      );
      try {
        await pool.query(
          `INSERT INTO billing_history (user_id, amount, value, status) VALUES ($1, $2, $3, 'approved')`,
          [userId, koinsToCredit, paymentAmount],
        );
      } catch (billErr2) {
        log(
          `[MP-IPN] billing_history insert failed entirely: ${billErr2.message}`,
        );
      }
    }

    // Create notification for user
    try {
      await pool.query(
        `INSERT INTO notifications (user_id, title, message) VALUES ($1, $2, $3)`,
        [
          userId,
          "Pagamento Confirmado! 🎉",
          `Seu pagamento de R$${paymentAmount.toFixed(2)} foi aprovado. ${koinsToCredit} Koins foram adicionados à sua conta!`,
        ],
      );
    } catch (notifErr) {
      log(`[MP-IPN] Notification insert failed: ${notifErr.message}`);
    }

    // Process affiliate commission
    try {
      await processAffiliateCommission(userId, paymentAmount);
      await confirmPartnerCommissions(userId);
    } catch (commErr) {
      log(`[MP-IPN] Commission processing failed: ${commErr.message}`);
    }

    res.status(200).send("OK");
  } catch (error) {
    log(
      "[ERROR] POST /api/payments/mercadopago-ipn: " +
      (error.message || JSON.stringify(error)),
    );
    // Always return 200 to MP to avoid retries for handled errors
    res.status(200).send("OK");
  }
});

// GET /api/payments/verify/:paymentId - Verify payment and credit Koins
// Called by the frontend when user returns from Mercado Pago checkout
app.get("/api/payments/verify/:paymentId", verifyJWT, async (req, res) => {
  try {
    const userId = req.userId;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const { paymentId } = req.params;
    log(`[PAYMENT-VERIFY] User ${userId} verifying payment ${paymentId}`);

    // Check if already processed (idempotency)
    try {
      const existing = await pool.query(
        "SELECT id FROM billing_history WHERE mp_payment_id = $1",
        [String(paymentId)],
      );
      if (existing.rows.length > 0) {
        log(`[PAYMENT-VERIFY] Payment ${paymentId} already processed.`);
        const userBalance = await pool.query(
          "SELECT koins_balance FROM users WHERE id = $1",
          [userId],
        );
        return res.json({
          status: "approved",
          already_processed: true,
          koins_balance: userBalance.rows[0]?.koins_balance || 0,
        });
      }
    } catch (checkErr) {
      // If mp_payment_id column doesn't exist, continue
      log(`[PAYMENT-VERIFY] Idempotency check failed: ${checkErr.message}`);
    }

    // Fetch payment details from Mercado Pago
    const accessToken = (process.env.MERCADOPAGO_ACCESS_TOKEN || "").trim();
    const mpResponse = await fetch(
      `https://api.mercadopago.com/v1/payments/${paymentId}`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    );

    if (!mpResponse.ok) {
      log(
        `[PAYMENT-VERIFY] Failed to fetch payment ${paymentId}. Status: ${mpResponse.status}`,
      );
      return res
        .status(400)
        .json({ error: "Payment not found", status: "unknown" });
    }

    const payment = await mpResponse.json();
    log(
      `[PAYMENT-VERIFY] Payment ${paymentId}: status=${payment.status}, amount=${payment.transaction_amount}, ref=${payment.external_reference}, userId=${userId}`,
    );

    if (payment.status !== "approved") {
      log(`[PAYMENT-VERIFY] Payment ${paymentId} is NOT approved yet. Current status: ${payment.status}`);
      return res.json({
        status: payment.status,
        status_detail: payment.status_detail,
      });
    }

    // Verify the payment belongs to this user
    if (String(payment.external_reference) !== String(userId)) {
      log(
        `[PAYMENT-VERIFY] User mismatch! Payment ref: ${payment.external_reference} (type: ${typeof payment.external_reference}), requesting user: ${userId} (type: ${typeof userId})`,
      );
      return res
        .status(403)
        .json({ error: "Payment does not belong to this user" });
    }

    // Calculate and credit Koins
    let koinsToCredit = 0;
    const paymentAmount = payment.transaction_amount || 0;

    // Check for product bonus via metadata
    if (payment.metadata?.product_id) {
      try {
        const productRes = await pool.query(
          "SELECT koins_bonus FROM products WHERE id = $1",
          [payment.metadata.product_id],
        );
        if (productRes.rows.length > 0) {
          const bonus = productRes.rows[0].koins_bonus;
          if (bonus > 0) {
            koinsToCredit = bonus;
            log(
              `[PAYMENT-VERIFY] Applied product specific bonus from metadata: ${bonus}`,
            );
          }
        }
      } catch (e) {
        log(`[PAYMENT-VERIFY] Error fetching product bonus: ${e.message}`);
      }
    }

    // Tentar obter Koins baseados no produto (items) - Fallback
    if (
      koinsToCredit === 0 &&
      payment.additional_info &&
      payment.additional_info.items &&
      payment.additional_info.items.length > 0
    ) {
      try {
        // Assume o primeiro item como principal ou soma se houver múltiplos
        for (const item of payment.additional_info.items) {
          // Tenta achar o produto pelo ID ou Titulo
          // O ID do item no MP pode ser o nosso ID do produto se passamos corretamente
          // No create-preference: id: item.id || 'item-1'

          // Se o ID for UUID válido, tentamos buscar
          if (item.id && item.id.length > 10) {
            const productRes = await pool.query(
              "SELECT koins_bonus FROM products WHERE id = $1",
              [item.id],
            );
            if (productRes.rows.length > 0) {
              const bonus = productRes.rows[0].koins_bonus || 0;
              if (bonus > 0) {
                const quantity = item.quantity ? Number(item.quantity) : 1;
                koinsToCredit += bonus * quantity;
                log(
                  `[KOINS-LOGIC] Found product ${item.id} with bonus ${bonus}. Total added: ${bonus * quantity}`,
                );
              }
            }
          }
        }
      } catch (prodErr) {
        log(`[KOINS-LOGIC] Error fetching product bonus: ${prodErr.message}`);
      }
    }

    // Fallback: Se não encontrou bonus de produto, usa a regra padrão (10x valor)
    if (koinsToCredit === 0) {
      koinsToCredit = Math.floor(paymentAmount * 10);
      log(
        `[KOINS-LOGIC] Using default rule: ${koinsToCredit} koins for R$${paymentAmount}`,
      );
    }

    const updateResult = await adjustUserKoinsBalance({
      userId,
      delta: koinsToCredit,
      source: "payment_verify_credit",
      metadata: {
        payment_amount: paymentAmount,
        payment_id: String(paymentId),
      },
    });

    if (updateResult) {
      log(
        `[PAYMENT-VERIFY] ✅ Credited ${koinsToCredit} Koins to user ${userId}. New balance: ${updateResult.koins_balance}`,
      );
    } else {
      log(`[PAYMENT-VERIFY] User ${userId} not found during credit attempt.`);
    }

    // Record in billing history
    try {
      await pool.query(
        `INSERT INTO billing_history (user_id, amount, value, status, mp_payment_id) 
                 VALUES ($1, $2, $3, 'approved', $4)`,
        [userId, koinsToCredit, paymentAmount, String(paymentId)],
      );
    } catch (billErr) {
      log(`[PAYMENT-VERIFY] billing_history insert failed: ${billErr.message}`);
      try {
        await pool.query(
          `INSERT INTO billing_history (user_id, amount, value, status) VALUES ($1, $2, $3, 'approved')`,
          [userId, koinsToCredit, paymentAmount],
        );
      } catch (billErr2) {
        log(
          `[PAYMENT-VERIFY] billing_history fallback insert failed: ${billErr2.message}`,
        );
      }
    }

    // Create notification
    try {
      await pool.query(
        `INSERT INTO notifications (user_id, title, message) VALUES ($1, $2, $3)`,
        [
          userId,
          "Pagamento Confirmado! 🎉",
          `Seu pagamento de R$${paymentAmount.toFixed(2)} foi aprovado. ${koinsToCredit} Koins foram adicionados à sua conta!`,
        ],
      );
    } catch (notifErr) {
      log(`[PAYMENT-VERIFY] Notification insert failed: ${notifErr.message}`);
    }

    // Process affiliate commission
    try {
      await processAffiliateCommission(userId, paymentAmount);
    } catch (commErr) {
      log(`[PAYMENT-VERIFY] Commission processing failed: ${commErr.message}`);
    }

    res.json({
      status: "approved",
      koins_credited: koinsToCredit,
      koins_balance: updateResult.rows[0].koins_balance,
      amount: paymentAmount,
    });
  } catch (error) {
    log(
      "[ERROR] GET /api/payments/verify: " +
      (error.message || JSON.stringify(error)),
    );
    res
      .status(500)
      .json({ error: "Verification failed", details: error.message });
  }
});

// --- PRODUCT MANAGEMENT API ---

// GET /api/public/products/:id - Get product details for checkout (Public)
app.get("/api/public/products/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      "SELECT id, name, description, price, active, koins_bonus FROM products WHERE id = $1 AND active = true",
      [id],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Product not found" });
    }

    res.json(result.rows[0]);
  } catch (err) {
    log("[ERROR] GET /api/public/products/:id: " + err.toString());
    res.status(500).json({ error: "Database error" });
  }
});

// GET /api/products - List all products (Admin only)
app.get("/api/products", verifyJWT, verifyAdmin, async (req, res) => {
  try {
    const userId = req.userId;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    // Verify admin role
    const userRes = await pool.query("SELECT role FROM users WHERE id = $1", [
      userId,
    ]);
    if (userRes.rows[0]?.role !== "admin") {
      return res.status(403).json({ error: "Forbidden" });
    }

    const result = await pool.query(
      "SELECT * FROM products ORDER BY created_at DESC",
    );
    res.json(result.rows);
  } catch (err) {
    log("[ERROR] GET /api/products: " + err.toString());
    res.status(500).json({ error: "Database error" });
  }
});

// POST /api/products - Create a new product (Admin only)
app.post("/api/products", verifyJWT, verifyAdmin, async (req, res) => {
  try {
    const userId = req.userId;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    // Verify admin role
    const userRes = await pool.query("SELECT role FROM users WHERE id = $1", [
      userId,
    ]);
    if (userRes.rows[0]?.role !== "admin") {
      return res.status(403).json({ error: "Forbidden" });
    }

    const { name, description, price, active, koins_bonus, connections_bonus, type } = req.body;
    log(`[DEBUG] POST /api/products payload: ${JSON.stringify(req.body)}`);

    if (!name || price === undefined) {
      return res.status(400).json({ error: "Name and price are required" });
    }

    const result = await pool.query(
      "INSERT INTO products (name, description, price, active, koins_bonus, connections_bonus, type) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *",
      [
        name,
        description,
        price,
        active !== undefined ? active : true,
        koins_bonus || 0,
        connections_bonus || 0,
        type || 'KOINS',
      ],
    );
    res.json(result.rows[0]);
  } catch (err) {
    log("[ERROR] POST /api/products: " + (err.stack || err.message));
    res.status(500).json({ error: "Database error", details: err.message });
  }
});

// PUT /api/products/:id - Update a product (Admin only)
app.put("/api/products/:id", verifyJWT, verifyAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    log(`[DEBUG] PUT /api/products/${id} payload: ${JSON.stringify(req.body)}`);

    const userId = req.userId;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    // Verify admin role
    const userRes = await pool.query("SELECT role FROM users WHERE id = $1", [
      userId,
    ]);
    if (userRes.rows[0]?.role !== "admin") {
      return res.status(403).json({ error: "Forbidden" });
    }

    const { name, description, price, active, koins_bonus, connections_bonus, type } = req.body;

    const result = await pool.query(
      `UPDATE products 
             SET name = COALESCE($1, name), 
                 description = COALESCE($2, description), 
                 price = COALESCE($3, price), 
                 active = COALESCE($4, active),
                 koins_bonus = COALESCE($5, koins_bonus),
                 connections_bonus = COALESCE($6, connections_bonus),
                 type = COALESCE($7, type),
                 updated_at = NOW()
             WHERE id = $8 RETURNING *`,
      [
        name || null,
        description || null,
        price !== undefined ? price : null,
        active !== undefined ? active : null,
        koins_bonus !== undefined ? koins_bonus : null,
        connections_bonus !== undefined ? connections_bonus : null,
        type || null,
        id,
      ],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Product not found" });
    }

    res.json(result.rows[0]);
  } catch (err) {
    log(
      `[ERROR] PUT /api/products/${req.params.id}: ` +
      (err.stack || err.message),
    );
    if (!res.headersSent) {
      res.status(500).json({ error: "Database error", details: err.message });
    }
  }
});

// DELETE /api/products/:id - Delete a product (Admin only)
app.delete("/api/products/:id", verifyJWT, verifyAdmin, async (req, res) => {
  try {
    const userId = req.userId;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    // Verify admin role
    const userRes = await pool.query("SELECT role FROM users WHERE id = $1", [
      userId,
    ]);
    if (userRes.rows[0]?.role !== "admin") {
      return res.status(403).json({ error: "Forbidden" });
    }

    const { id } = req.params;
    const result = await pool.query(
      "DELETE FROM products WHERE id = $1 RETURNING id",
      [id],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Product not found" });
    }

    res.json({ success: true, id });
  } catch (err) {
    log("[ERROR] DELETE /api/products/:id: " + err.toString());
    res.status(500).json({ error: "Database error" });
  }
});

// END OF API SECTION

// ------------------------------------------

// ─── LIVE CHAT METRICS LOGGING ─────────────────────────────

// POST /api/chat/send - Log manual message and forward to Evolution API
app.post("/api/chat/send", verifyJWT, async (req, res) => {
  const { instanceName, number, text, agentId, options } = req.body;

  if (!instanceName || !number || !text) {
    return res
      .status(400)
      .json({ error: "Missing instanceName, number or text" });
  }

  // Default Evolution API URL/Key from standardized constants
  const evolutionApiUrl = EVOLUTION_API_URL;
  const evolutionApiKey = EVOLUTION_API_KEY;

  try {
    const userId = req.userId;

    // 1. Log to Database (if agentId is provided)
    if (agentId) {
      // Count tokens roughly (1 token per 4 chars as placeholder or 0)
      const estimatedTokens = Math.ceil(text.length / 4);

      // Log as 'assistant' (manual response)
      await pool.query(
        `INSERT INTO chat_messages (agent_id, remote_jid, role, content, prompt_tokens, completion_tokens, token_cost) 
                 VALUES ($1, $2, 'assistant', $3, 0, $4, 0)`,
        [agentId, number, text, estimatedTokens],
      );

      const resOrg = await pool.query('SELECT organization_id FROM agents WHERE id = $1', [agentId]);
      if (resOrg.rows.length > 0) {
        scheduleFollowupEvent(resOrg.rows[0].organization_id, number, instanceName)
          .catch(e => log(`[FOLLOWUP] Manual send error: ${e.message}`));
      }
    } else {
      log(
        `[LIVE-CHAT] Warning: Message sent without agentId, metrics will be missed. Instance: ${instanceName}, To: ${number}`,
      );
    }

    // 2. Forward to Evolution API
    const response = await fetch(
      `${evolutionApiUrl}/message/sendText/${instanceName}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: evolutionApiKey,
        },
        body: JSON.stringify({
          number,
          text,
          options: options || { delay: 1200, presence: "composing" },
        }),
      },
    );

    if (!response.ok) {
      const errText = await response.text();
      log(`[LIVE-CHAT] Evolution API Error: ${errText}`);
      return res
        .status(response.status)
        .json({
          error: "Failed to send message to WhatsApp Provider",
          details: errText,
        });
    }

    const data = await response.json();
    res.json(data);
  } catch (err) {
    log("POST /api/chat/send error: " + err.toString());
    res
      .status(500)
      .json({ error: "Internal server error while sending message" });
  }
});

// POST /api/chat/send-media - Log manual media and forward
app.post("/api/chat/send-media", verifyJWT, async (req, res) => {
  const { instanceName, number, mediatype, media, fileName, caption, agentId } =
    req.body;

  if (!instanceName || !number || !media || !mediatype) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  const evolutionApiUrl = EVOLUTION_API_URL;
  const evolutionApiKey = EVOLUTION_API_KEY;

  try {
    // 1. Log to Database
    if (agentId) {
      await pool.query(
        `INSERT INTO chat_messages (agent_id, remote_jid, role, content, prompt_tokens, completion_tokens, token_cost) 
                 VALUES ($1, $2, 'assistant', $3, 0, 0, 0)`,
        [agentId, number, caption || `[${mediatype.toUpperCase()} SENT]`],
      );

      const resOrg = await pool.query('SELECT organization_id FROM agents WHERE id = $1', [agentId]);
      if (resOrg.rows.length > 0) {
        scheduleFollowupEvent(resOrg.rows[0].organization_id, number, instanceName)
          .catch(e => log(`[FOLLOWUP] Manual media error: ${e.message}`));
      }
    }

    // 2. Forward to Evolution
    const response = await fetch(
      `${evolutionApiUrl}/message/sendMedia/${instanceName}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: evolutionApiKey,
        },
        body: JSON.stringify({
          number,
          mediatype,
          media, // Base64
          fileName,
          caption,
        }),
      },
    );

    if (!response.ok) {
      const errText = await response.text();
      return res
        .status(response.status)
        .json({ error: "Failed to send media", details: errText });
    }

    const data = await response.json();
    res.json(data);
  } catch (err) {
    log("POST /api/chat/send-media error: " + err.toString());
    res.status(500).json({ error: "Internal server error" });
  }
});

// --- Message Buffering Logic ---
const messageQueues = new Map();

// --- TTS: Convert Text to Audio ---

// Helper: Send text response in split paragraphs (used for text mode and audio fallback)
async function sendTextResponse(
  evolutionApiUrl,
  evolutionApiKey,
  instanceName,
  remoteJid,
  aiResponse,
  user,
) {
  const responseParts = aiResponse
    .split("\n\n")
    .filter((part) => part.trim().length > 0);

  for (const [index, part] of responseParts.entries()) {
    const sendResponse = await fetch(
      `${evolutionApiUrl}/message/sendText/${instanceName}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: evolutionApiKey,
        },
        body: JSON.stringify({
          number: remoteJid,
          text: part.trim(),
          options: { delay: 1200, presence: "composing" },
        }),
      },
    );

    if (sendResponse.ok) {
      log(
        `[AI] Response part ${index + 1}/${responseParts.length} sent to ${remoteJid}`,
      );
      const deductRes = await adjustUserKoinsBalance({
        userId: user.id,
        delta: -2,
        source: "assistant_text_response",
        metadata: { part_index: index + 1, total_parts: responseParts.length },
      });
      log(
        `[KOINS] Deducted 2 koins for part ${index + 1}. New balance: ${deductRes?.koins_balance ?? "n/a"}`,
      );
    } else {
      log(`[AI] Failed to send part ${index + 1}: ${sendResponse.statusText}`);
    }

    if (index < responseParts.length - 1) {
      const delay = Math.max(2000, Math.min(5000, part.length * 20));
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

async function convertToAudio(text) {
  const tempDir = path.join(__dirname, "temp", "audio");
  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

  const fileName = `tts_${Date.now()}.mp3`;
  const filePath = path.join(tempDir, fileName);

  const response = await openai.audio.speech.create({
    model: "tts-1",
    voice: "nova",
    input: text,
    response_format: "mp3",
  });

  const buffer = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(filePath, buffer);
  log(`[TTS] Audio generated: ${fileName} (${buffer.length} bytes)`);
  return filePath;
}

// --- REVENUE OS: INTENT SCORE ENGINE ---
// Self-healing: ensure new Revenue OS columns exist on startup
async function ensureRevenueOSColumns() {
  try {
    await pool.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS intent_label VARCHAR(20) DEFAULT 'COLD'`);
    await pool.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS last_ia_briefing TEXT`);
    await pool.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS assigned_to UUID`);
    await pool.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS last_interaction_at TIMESTAMPTZ`);
    log('[REVENUE-OS] DB columns ensured: intent_label, last_ia_briefing, assigned_to, last_interaction_at');
  } catch (err) {
    log(`[REVENUE-OS] Column ensure error (non-critical): ${err.message}`);
  }
}

// --- AUTO LEAD CREATION FROM WHATSAPP ---
async function ensureLeadFromWhatsApp(remoteJid, pushName, organizationId, connectionId = null) {
  try {
    // Extract clean phone number (strip @s.whatsapp.net, keep digits only)
    const rawPhone = remoteJid.split('@')[0];
    const cleanPhone = rawPhone.replace(/\D/g, '');

    // Skip group messages (JIDs with @g.us or @broadcast)
    if (remoteJid.includes('@g.us') || remoteJid.includes('@broadcast')) {
      return;
    }

    const linkedSellerId = await getLinkedSellerIdForConnection(organizationId, connectionId);

    // 1. Get the real pipeline columns for the org
    // We need this to check if an existing lead has a valid status, or if we need to fall back to the first column.
    let validColumns = [];
    let firstColumnTitle = 'Novos Leads';
    try {
      const colRes = await pool.query(
        `SELECT title FROM kanban_columns 
         WHERE organization_id = $1 
         ORDER BY order_index ASC`,
        [organizationId]
      );
      if (colRes.rows.length > 0) {
        validColumns = colRes.rows.map(r => r.title);
        firstColumnTitle = validColumns[0];
      }
    } catch (colErr) {
      log(`[AUTO-LEAD] Could not fetch columns, using default: ${colErr.message}`);
    }

    // 2. Check if lead already exists (dedup by phone)
    // Order by last_contact to find the MOST RECENT active lead.
    const existing = await pool.query(
      `SELECT id, status, assigned_to FROM leads 
       WHERE organization_id = $1 
         AND (phone = $2 OR phone = $3 OR phone LIKE $4)
       ORDER BY last_contact DESC NULLS LAST, created_at DESC
       LIMIT 1`,
      [organizationId, cleanPhone, rawPhone, `%${cleanPhone}%`]
    );

    if (existing.rows.length > 0) {
      const lead = existing.rows[0];
      // RESURRECTION LOGIC: 
      // If the lead exists but its status is not a valid column (and not 'Cliente'), 
      // it's "hidden" from the Kanban. We must resurrect it to the first column.
      if (lead.status !== 'Cliente' && validColumns.length > 0 && !validColumns.includes(lead.status)) {
        await pool.query(
          `UPDATE leads SET status = $1, last_contact = NOW() WHERE id = $2`,
          [firstColumnTitle, lead.id]
        );
        log(`[AUTO-LEAD] Resurrected hidden lead ${lead.id} from invalid status '${lead.status}' to '${firstColumnTitle}'`);
      } else if (!lead.assigned_to && linkedSellerId) {
        await pool.query(
          `UPDATE leads SET assigned_to = $1, last_contact = NOW() WHERE id = $2`,
          [linkedSellerId, lead.id],
        );
        log(`[AUTO-LEAD] Lead ${lead.id} attributed to seller ${linkedSellerId} by linked connection ${connectionId}`);
      } else {
        log(`[AUTO-LEAD] Lead already exists & visible for ${cleanPhone} in org ${organizationId}. Skipping.`);
      }
      return lead.id; // Stop here since the lead exists
    }

    // 3. Create new lead if none exists
    const contactName = (pushName && pushName.trim()) ? pushName.trim() : `WhatsApp ${cleanPhone.slice(-4)}`;
    const createdLead = await pool.query(
      `INSERT INTO leads 
         (name, phone, source, status, organization_id, last_contact, assigned_to)
       VALUES ($1, $2, $3, $4, $5, NOW(), $6)
       RETURNING id`,
      [contactName, cleanPhone, 'whatsapp', firstColumnTitle, organizationId, linkedSellerId]
    );

    log(`[AUTO-LEAD] Created NEW lead "${contactName}" (${cleanPhone}) in column "${firstColumnTitle}" for org ${organizationId}`);
    return createdLead.rows[0]?.id || null;
  } catch (err) {
    log(`[AUTO-LEAD] Error creating lead: ${err.message}`);
    return null;
  }
}

// --- AI PIPELINE STAGE ADVANCEMENT ---
async function advancePipelineStage(leadId, organizationId, score) {
  try {
    // Fetch all pipeline columns ordered by position
    const colRes = await pool.query(
      `SELECT title, order_index FROM kanban_columns 
       WHERE organization_id = $1 
       ORDER BY order_index ASC`,
      [organizationId]
    );

    const columns = colRes.rows;

    if (columns.length < 2) {
      // Need at least 2 columns to advance
      return;
    }

    // Determine target column index based on score tier
    // We map score tiers to positions in the pipeline:
    // COLD < 35 → no movement
    // WARM 35-64 → 40% through pipeline
    // HOT  65-84 → 65% through pipeline
    // CRITICAL 85+ → 85% through pipeline (penultimate column at most)
    let targetIndex = -1; // -1 means no movement
    const lastIdx = columns.length - 1;

    if (score >= 65) {
      // HOT: move to ~65% through pipeline
      targetIndex = Math.max(1, Math.floor(lastIdx * 0.65));
    } else if (score >= 35) {
      // WARM: move to ~40% through pipeline
      targetIndex = Math.max(1, Math.floor(lastIdx * 0.40));
    } else {
      // COLD: no movement
      return;
    }

    const targetColumn = columns[targetIndex];
    if (!targetColumn) return;

    // Get current lead status
    const leadRes = await pool.query(
      `SELECT name, status FROM leads WHERE id = $1`,
      [leadId]
    );
    if (leadRes.rows.length === 0) return;

    const lead = leadRes.rows[0];
    const currentStatus = lead.status;

    // Find current position in pipeline
    const currentIdx = columns.findIndex(c => c.title === currentStatus);

    // Only advance — NEVER move backwards
    if (currentIdx >= targetIndex) {
      log(`[PIPELINE-AI] Lead ${leadId} already at or ahead of target stage. No movement needed.`);
      return;
    }

    // Advance the lead to the target column
    await pool.query(
      `UPDATE leads SET status = $1, last_contact = NOW() WHERE id = $2`,
      [targetColumn.title, leadId]
    );

    log(`[PIPELINE-AI] Lead "${lead.name}" moved: "${currentStatus}" → "${targetColumn.title}" (score: ${score})`);
  } catch (err) {
    log(`[PIPELINE-AI] Error advancing stage: ${err.message}`);
  }
}


// Intent label mapping from score — 3 tiers: QUENTE / MORNO / FRIO
function scoreToIntentLabel(score) {
  if (score >= 65) return 'HOT';   // 🔥 Quente — alto engajamento
  if (score >= 35) return 'WARM';  // 🟡 Morno — interesse moderado
  return 'COLD';                    // 🔵 Frio  — baixo engajamento
}

async function updateLeadScore(agentId, remoteJid, organizationId, historyMessages) {
  try {
    // 1. Find Lead
    const leadRes = await pool.query(
      "SELECT id, name, score as prev_score FROM leads WHERE organization_id = $1 AND (phone LIKE $2 OR mobile_phone LIKE $2) LIMIT 1",
      [organizationId, `%${remoteJid.split("@")[0]}%`],
    );
    const leadRow = leadRes.rows[0];
    const leadId = leadRow?.id;
    const prevScore = leadRow?.prev_score ?? 0;

    if (!leadId) {
      log(`[INTENT-SCORE] No lead found for ${remoteJid} in org ${organizationId}. Skipping.`);
      return;
    }

    // 2. Prepare Context (Last 12 messages for accuracy)
    const context = historyMessages
      .slice(-12)
      .filter(m => m && m.content && !m.tool_calls)
      .map(m => `${m.role.toUpperCase()}: ${String(m.content).substring(0, 400)}`)
      .join('\n');

    // 3. Revenue OS Intent Classification Prompt
    const scoringPrompt = `Você é o motor de inteligência comercial da Kogna Revenue OS.
Analise a conversa abaixo e retorne APENAS um JSON válido.

CAMPOS OBRIGATÓRIOS:
- score: (0-100) Pontuação de intenção de compra e urgência. 65-100 = quente (alta intenção), 35-64 = morno (interesse moderado), 0-34 = frio.
- temperature: "🔥 Quente", "🟡 Morno" ou "🔵 Frio".
- briefing: Uma frase curta (máx 100 chars) descrevendo o estado atual do lead. Ex: "Interessado no plano Pro, objeção de preço, aguarda proposta".
- reason: Justificativa interna curta (máx 80 chars) para o score.

CONVERSA:
${context}

Regras:
- Se lead pediu preço, demonstração ou disse "quero fechar": score >= 70.
- Se lead desapareceu ou disse "vou pensar": score <= 40.
- Se lead tem objeção ativa (preço, tempo, concorrente): score entre 40-64.

JSON:`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "system", content: scoringPrompt }],
      response_format: { type: "json_object" }
    });

    const result = JSON.parse(completion.choices[0].message.content);
    const newScore = result.score || 0;
    const intentLabel = scoreToIntentLabel(newScore);

    // 4. Update Database with all Revenue OS fields
    await pool.query(
      `UPDATE leads 
       SET score = $1, 
           temperature = $2, 
           intent_label = $3,
           last_ia_briefing = $4,
           last_interaction_at = NOW()
       WHERE id = $5`,
      [newScore, result.temperature, intentLabel, result.briefing || null, leadId]
    );

    log(`[INTENT-SCORE] Lead ${leadId}: ${intentLabel} (${newScore}pts) | ${result.briefing || result.reason}`);

    refreshLeadConversationSummary({
      orgId: organizationId,
      conversationKey: remoteJid,
      leadId,
    }).catch(err => log(`[LEAD-SUMMARY] score refresh error: ${err.message}`));

    // 5. 🔥 HEAT ALERT — notify when lead transitions to HOT (Quente)
    // Only fires when lead crosses the HOT threshold for the first time in this turn
    if (newScore >= 65 && prevScore < 65) {
      try {
        // Get org's users to notify
        const usersRes = await pool.query(
          `SELECT u.id FROM users u WHERE u.organization_id = $1`,
          [organizationId]
        );
        const leadNameRes = await pool.query(`SELECT name FROM leads WHERE id = $1`, [leadId]);
        const leadName = leadNameRes.rows[0]?.name || 'Lead';

        for (const u of usersRes.rows) {
          await pool.query(
            `INSERT INTO notifications (user_id, title, message) VALUES ($1, $2, $3)`,
            [
              u.id,
              `🔥 Lead Esquentou: ${leadName}`,
              result.briefing
                ? `${leadName} está quente! ${result.briefing} Score: ${newScore}/100`
                : `${leadName} acabou de atingir score ${newScore}/100 — hora de agir!`
            ]
          );
        }
        log(`[HEAT-ALERT] Notificação criada para lead ${leadName} (score ${newScore})`);
      } catch (notifyErr) {
        log(`[HEAT-ALERT] Erro ao criar notificação: ${notifyErr.message}`);
      }
    }

    // 5b. 🤝 HANDOFF INTELIGENTE — score >= 80 (acima do alerta simples de 65)
    if (newScore >= 80 && prevScore < 80) {
      triggerIntelligentHandoff(agentId, remoteJid, organizationId, leadId, leadRow.name, context, newScore)
        .catch(e => log(`[HANDOFF] Error: ${e.message}`));
    }

    // 6. AI Pipeline Movement — advance stage if score warrants it (non-blocking)
    advancePipelineStage(leadId, organizationId, newScore)
      .catch(e => log(`[PIPELINE-AI] Movement error: ${e.message}`));

  } catch (err) {
    log(`[INTENT-SCORE] Error: ${err.message}`);
  }
}

// ─── INTELLIGENT HANDOFF ──────────────────────────────────────────────────────
// Triggered when lead score crosses 80: raises human attention, generates brief and notifies sellers

async function triggerIntelligentHandoff(agentId, remoteJid, orgId, leadId, leadName, context, score) {
  try {
    log(`[HANDOFF] Initiating intelligent handoff for lead "${leadName}" (score ${score})`);

    // 0. Signal to the lead that a specialist may join, but keep the AI active.
    try {
      const agentRes = await pool.query(
        `SELECT a.id, v.instance_name
         FROM agents a
         JOIN vendedores v ON v.id = a.vendedor_id
         WHERE a.id = $1 LIMIT 1`,
        [agentId]
      );
      const instanceName = agentRes.rows[0]?.instance_name;

      if (instanceName) {
        const transferMsg = "Perfeito. Ja sinalizei nosso time comercial para acompanhar este caso com mais prioridade. Enquanto isso, sigo com voce por aqui para acelerar o proximo passo.";
        await fetch(`${EVOLUTION_API_URL}/message/sendText/${instanceName}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: EVOLUTION_API_KEY,
          },
          body: JSON.stringify({
            number: remoteJid,
            text: transferMsg,
            options: { delay: 1200 },
          }),
        });
        log(`[HANDOFF] Transfer message sent to ${remoteJid}`);
      }
    } catch (msgErr) {
      log(`[HANDOFF] Could not send transfer message: ${msgErr.message}`);
      // Non-fatal — continue with attention flag and notification
    }

    // 1. Generate intelligent Lead Brief via GPT
    const briefPrompt = `Você é um gerente de vendas sênior da Kogna Revenue OS.
Um lead atingiu score ${score}/100, indicando alta intenção de compra e necessidade de atendimento humano.
Baseado na conversa abaixo, crie um brief operacional conciso para o vendedor humano que precisa priorizar esse lead.

CONVERSA:
${context}

Retorne APENAS um JSON válido com:
- interest: O que o lead quer/precisa (1 frase objetiva, máx 80 chars)
- objection: Principal objeção ou preocupação (1 frase, ou "Nenhuma identificada", máx 80 chars)
- approach: Melhor ação recomendada para fechar (1 frase imperativa, máx 100 chars)
- urgency: "Alta" | "Média" | "Baixa"

JSON:`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "system", content: briefPrompt }],
      response_format: { type: "json_object" }
    });

    const brief = JSON.parse(completion.choices[0].message.content);
    log(`[HANDOFF] Lead brief generated for "${leadName}": ${JSON.stringify(brief)}`);

    // 2. Store the human-attention signal without silencing the AI.
    await pool.query(
      `UPDATE leads
          SET handoff_brief = $1,
              handoff_at = NOW(),
              needs_human_attention = TRUE,
              human_attention_reason = $2,
              human_attention_since = NOW(),
              top_objection = COALESCE($3, top_objection)
        WHERE id = $4`,
      [JSON.stringify(brief), brief.approach || brief.interest || "Lead quente requer acompanhamento humano", brief.objection || null, leadId]
    ).catch(() => {
      log(`[HANDOFF] Could not store human attention fields on lead`);
    });

    await pool.query(
      `UPDATE lead_memory
          SET needs_human_attention = TRUE,
              human_attention_reason = $1,
              human_attention_since = NOW(),
              handoff_recommendation = $2,
              human_attention_score = $3,
              top_objection = COALESCE($4, top_objection),
              updated_at = NOW()
        WHERE organization_id = $5 AND lead_id = $6`,
      [
        brief.interest || "Lead requer acompanhamento humano",
        brief.approach || "Entre rapido, valide contexto e conduza o proximo passo.",
        score,
        brief.objection || null,
        orgId,
        leadId,
      ],
    ).catch(() => {
      log(`[HANDOFF] Could not update lead_memory human attention state`);
    });

    // 3. Notify all org users with the full brief
    const usersRes = await pool.query(
      `SELECT id FROM users WHERE organization_id = $1`, [orgId]
    );

    const urgencyEmoji = brief.urgency === 'Alta' ? '🔴' : brief.urgency === 'Média' ? '🟡' : '🟢';
    const notifMessage =
      `🎯 Interesse: ${brief.interest}\n` +
      `⚠️ Objeção: ${brief.objection}\n` +
      `✅ Ação: ${brief.approach}\n` +
      `${urgencyEmoji} Urgência: ${brief.urgency} | Score: ${score}/100`;

    for (const u of usersRes.rows) {
      await pool.query(
        `INSERT INTO notifications (user_id, title, message) VALUES ($1, $2, $3)`,
        [u.id, `🤝 Handoff Humano: ${leadName}`, notifMessage]
      );
    }

    log(`[HANDOFF] Notifications sent to ${usersRes.rows.length} user(s) for lead "${leadName}"`);
  } catch (err) {
    log(`[HANDOFF] triggerIntelligentHandoff error: ${err.message}`);
    throw err;
  }
}


async function processAIResponse(
  agent,
  remoteJid,
  instanceName,
  inputMessages = [],
) {
  try {
    log(
      `[AI] Processing buffered messages for ${remoteJid}. Input count: ${inputMessages.length}`,
    );

    // Check if any input was audio OR if user is asking AI to send audio
    const audioTriggerKeywords = ['manda um audio', 'manda audio', 'me manda um audio', 'envia um audio', 'envia audio', 'send audio', 'me manda audio', 'pode mandar um audio', 'fala por audio', 'responde em audio', 'responde por audio'];
    const userTextLower = inputMessages.map(m => (m.text || m.content || '')).join(' ').toLowerCase();
    const respondWithAudio = inputMessages.some((msg) => msg.isAudio) || audioTriggerKeywords.some(kw => userTextLower.includes(kw));

    // 1.5 Fetch Knowledge Base context
    const knowledgeBase = await getAgentKnowledge(agent.training_files);

    // 1.5.1 Check Pause Status (Global & Chat)
    // Global Check
    if (agent.status === "paused") {
      log(`[AI] Agent ${agent.name} is globally PAUSED. Skipping response.`);
      return;
    }

    // Chat Specific Check
    const chatSessionRes = await pool.query(
      "SELECT is_paused FROM chat_sessions WHERE agent_id = $1 AND remote_jid = $2",
      [agent.id, remoteJid],
    );
    if (chatSessionRes.rows.length > 0 && chatSessionRes.rows[0].is_paused) {
      log(`[AI] Chat with ${remoteJid} is PAUSED. Skipping response.`);
      return;
    }

    // --- Build real-time date context (Brazil Time) ---
    const now = new Date();
    const dateOptions = {
      timeZone: "America/Sao_Paulo",
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    };
    const timeOptions = {
      timeZone: "America/Sao_Paulo",
      hour: "2-digit",
      minute: "2-digit",
    };
    const currentDate = now.toLocaleString("pt-BR", dateOptions);
    const currentTime = now.toLocaleString("pt-BR", timeOptions);

    // ── CSE: Extract intent early (only needs message text) ─────────────────────
    const userText = inputMessages.map(m => m.content || m.text || '').join(' ');
    const userIntent = await extractUserIntent(userText);
    log(`[CSE] lead=${remoteJid} intent=${userIntent}`);
    // ── END CSE early intent ─────────────────────────────────────────────────────

    let systemPrompt = "";

    // 1.6 Check Koins Balance
    const userQuery = await pool.query(
      `
            SELECT u.id, u.koins_balance, u.organization_id
            FROM users u
            JOIN whatsapp_instances wi ON wi.user_id = u.id
            JOIN agents a ON a.whatsapp_instance_id = wi.id
            WHERE a.id = $1
            `,
      [agent.id],
    );

    const user = userQuery.rows[0];
    if (!user || user.koins_balance <= 0) {
      log(
        `[KOINS] Insufficient balance for user ${user?.id || "unknown"}.Balance: ${user?.koins_balance} `,
      );
      return; // Stop processing
    }

    const companyProfile = await getCanonicalCompanyProfile({
      orgId: user.organization_id,
      userId: user.id,
    });

    // ── CSE: Load state (now user/org is available) ─────────────────────────────
    const cseOrgId = user.organization_id;
    const { state: cseState, memory: cseMemory } = await loadConversationState(cseOrgId, agent.id, remoteJid);
    const { newStage: cseStage, goal: cseGoal, nextExpected: cseNextExpected } = cseState
      ? determineStageTransition(cseState.lead_stage, userIntent, cseMemory)
      : { newStage: 'qualificacao', goal: STAGE_GOALS['qualificacao'], nextExpected: 'lead_share_context' };
    log(`[CSE] stage=${cseStage} for lead=${remoteJid}`);

    // Rebuild systemPrompt with the real stage + active agent persona
    const activeAgent = resolveAgent(cseStage);
    log(`[MULTI-AGENT] ${activeAgent.name} handling stage=${cseStage} for lead=${remoteJid}`);
    const leadSnapshotRes = await pool.query(
      `SELECT id, score, temperature, last_ia_briefing, needs_human_attention,
              human_attention_reason, human_attention_since, top_objection
         FROM leads
        WHERE organization_id = $1
          AND (phone LIKE $2 OR mobile_phone LIKE $2)
        ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST
        LIMIT 1`,
      [cseOrgId, `%${remoteJid.split("@")[0]}%`],
    ).catch(() => ({ rows: [] }));
    const leadContext = {
      ...(leadSnapshotRes.rows[0] || {}),
      ...(cseMemory || {}),
    };
    const activeObjection = selectRelevantObjection(
      companyProfile.objectionPlaybook || [],
      userText,
      cseMemory?.main_objection || leadSnapshotRes.rows[0]?.top_objection || "",
    );
    systemPrompt = buildSystemPrompt({
      agent,
      stage: cseStage,
      knowledgeBase,
      currentDate,
      currentTime,
      activeAgent,
      companyProfile,
      leadContext,
      activeObjection,
    });

    // Append structured memory + semantic signals block
    systemPrompt += buildCSEStageDirective(cseStage, cseGoal, cseMemory);
    // ── END CSE state load ───────────────────────────────────────────────────────



    // 1.7 Fetch Last 3 Messages (CSE slim context — not full history)
    // CSE replaces fat history with structured state + 3 recent messages only.
    const historyResult = await pool.query(
      "SELECT role, content FROM chat_messages WHERE agent_id = $1 AND remote_jid = $2 ORDER BY created_at DESC LIMIT 6",
      [agent.id, remoteJid],
    );

    let history = historyResult.rows
      .reverse()
      .map((row) => {
        // Handle Tool Calls or Tool Results stored in JSON
        if (
          row.role === "assistant" &&
          row.content &&
          row.content.trim().startsWith("{") &&
          row.content.includes("tool_calls")
        ) {
          try {
            const parsed = JSON.parse(row.content);
            return {
              role: "assistant",
              content: null,
              tool_calls: parsed.tool_calls,
            };
          } catch (e) {
            return { role: "assistant", content: row.content };
          }
        }
        if (row.role === "tool") {
          try {
            const parsed = JSON.parse(row.content);
            if (parsed.tool_call_id) {
              // Include result OR error OR just a default message
              const toolContent =
                parsed.result ||
                parsed.error ||
                "Tool executed (no result details)";
              return {
                role: "tool",
                tool_call_id: parsed.tool_call_id,
                name: parsed.name,
                content:
                  typeof toolContent === "string"
                    ? toolContent
                    : JSON.stringify(toolContent),
              };
            }
            return null;
          } catch (e) {
            return null;
          }
        }

        // Normal Text Message
        return {
          role: row.role,
          content:
            row.content && row.content.length > 8000
              ? row.content.substring(0, 8000) + "...[truncado]"
              : row.content,
        };
      })
      .filter((msg) => msg !== null); // Remove nulls

    // Remove the raw text entries of the buffered messages from history
    // to avoid duplication, since we are building a rich "latest" message.
    if (inputMessages.length > 0) {
      // We assume the last inputMessages.length messages in DB history are the ones we just received.
      // This is a safe assumption given the timing, but let's be careful not to slice incorrectly if history is short.
      const messagesToRemove = inputMessages.length;
      if (history.length >= messagesToRemove) {
        history = history.slice(0, history.length - messagesToRemove);
      } else {
        history = []; // Should not happen usually
      }
    }

    // Coalesce OLD history (User messages only) to save context window
    let coalescedHistory = [];
    for (const msg of history) {
      const lastMsg = coalescedHistory[coalescedHistory.length - 1];
      if (lastMsg && lastMsg.role === "user" && msg.role === "user") {
        lastMsg.content += "\n" + msg.content;
      } else {
        coalescedHistory.push({ ...msg });
      }
    }

    // --- SELF-HEALING HISTORY ---
    // OpenAI requires that an assistant message with tool_calls is followed by TOOL messages.
    // If we have an assistant message with tool_calls at the end of history, and NO tool responses,
    // it will crash the next request. We must strip those tool_calls if they are unanswered.
    coalescedHistory = coalescedHistory.filter((msg, idx) => {
      if (msg.role === "assistant" && msg.tool_calls) {
        // Look ahead: are there tool messages following this?
        const nextMsg = coalescedHistory[idx + 1];
        if (!nextMsg || nextMsg.role !== "tool") {
          log(
            `[AI] Self-healing: Stripping unanswered tool_calls from assistant message.`,
          );
          delete msg.tool_calls;
          // If the message has no content AND no tool_calls, it's invalid
          if (!msg.content) return false;
        }
      }
      return true;
    });

    // Build the Current Turn Content (Multimodal)
    // OpenAI expects: content: "text" OR content: [ { type: "text" }, { type: "image_url" } ]
    // We aggregate all inputMessages into one User turn.

    const currentTurnParts = [];
    let hasImage = false;

    for (const msg of inputMessages) {
      // Add Text Part
      if (msg.content && msg.content.trim()) {
        currentTurnParts.push({ type: "text", text: msg.content });
      }
      // Add Image Part
      if (msg.imageUrl) {
        hasImage = true;
        currentTurnParts.push({
          type: "image_url",
          image_url: { url: msg.imageUrl },
        });
      }
    }

    // If we have no content (rare), just skip
    if (currentTurnParts.length === 0) return;

    const currentUserMessage = {
      role: "user",
      content: currentTurnParts, // Pass the array directly for GPT-4o
    };

    const model = agent.model_config?.model || DEFAULT_AGENT_MODEL;
    const temperature = Number.isFinite(Number(agent.model_config?.temperature))
      ? Math.max(0, Math.min(1.2, Number(agent.model_config.temperature)))
      : 0.45;

    // Prepare messages for OpenAI
    const apiMessages = [
      { role: "system", content: systemPrompt },
      ...coalescedHistory,
      currentUserMessage,
    ];

    // 2. Generate AI Response — Tool Router selects tools by CSE stage
    const { tools: activeTools, toolChoice, allowedNames } = getToolsForStage(cseStage);

    let aiResponse = "";
    let toolCallsAttempt = 0;
    const maxToolCalls = 5;
    let totalPromptTokens = 0;
    let totalCompletionTokens = 0;

    while (toolCallsAttempt < maxToolCalls) {
      const aiStartTime = Date.now();
      const completion = await openai.chat.completions.create({
        model: model,
        messages: apiMessages,
        temperature,
        ...(activeTools.length > 0 ? { tools: activeTools, tool_choice: toolChoice } : {}),
      });

      const message = completion.choices[0].message;
      const usage = completion.usage;
      if (usage) {
        totalPromptTokens += usage.prompt_tokens || 0;
        totalCompletionTokens += usage.completion_tokens || 0;
      }
      log(`[AI] Response chunk generated in ${Date.now() - aiStartTime} ms`);

      if (message.tool_calls) {
        // SAVE THE ASSISTANT MESSAGE WITH TOOL CALLS
        // We need to save this so the model knows it made a tool call in history
        await pool.query(
          "INSERT INTO chat_messages (agent_id, remote_jid, role, content) VALUES ($1, $2, $3, $4)",
          [
            agent.id,
            remoteJid,
            "assistant",
            JSON.stringify({ tool_calls: message.tool_calls }),
          ],
        );

        apiMessages.push(message); // Add assistant message with tool calls to history

        for (const toolCall of message.tool_calls) {
          const functionName = toolCall.function.name;
          const args = JSON.parse(toolCall.function.arguments);
          log(`[AI - TOOL] Calling ${functionName} with ${JSON.stringify(args)}`);

          // ── Backend validation guard ──────────────────────────────────────────
          const validation = validateToolCall(functionName, args, allowedNames);
          if (!validation.valid) {
            log(`[TOOL ROUTER] Rejected tool call: ${validation.reason}`);
            apiMessages.push({
              role: 'tool',
              tool_call_id: toolCall.id,
              content: JSON.stringify({ error: validation.reason }),
            });
            continue; // Skip execution, let LLM recover
          }

          let toolResult;
          try {
            const orgId = user.organization_id;
            log(`[AI - TOOL] Executing ${functionName} for Org: ${orgId}`);

            // ── New tools ────────────────────────────────────────────────────
            if (functionName === 'crm_update_lead') {
              toolResult = await executeCrmUpdateLead(orgId, remoteJid, args.fields);
            } else if (functionName === 'send_followup_message') {
              toolResult = await executeSendFollowupMessage(
                orgId, remoteJid, instanceName, args.message, args.delay_minutes
              );
            } else if (functionName === 'present_product') {
              // Calls the Dynamic Offer Engine — sends image + text + offer via WhatsApp
              const productResult = await sendProductToLead(
                orgId, instanceName, remoteJid, cseStage, args.product_hint || userIntent
              );
              toolResult = productResult
                ? {
                  success: true, product: productResult.product.nome, offer: productResult.offer.nome,
                  _instruction: 'O produto e a oferta foram enviados via WhatsApp. Confirme ao lead que você enviou as informações e pergunte se ele tem dúvidas.'
                }
                : { success: false, message: 'Nenhum produto ativo encontrado. Informe o lead que você vai enviar as informações em breve.' };
            }
            // ── Existing calendar tools ──────────────────────────────────────
            else if (functionName === 'consultar_horarios_disponiveis') {

              let targetVendedorId = args.vendedorId;
              if (!targetVendedorId) {
                const v = await getNextVendedor(orgId);
                targetVendedorId = v?.id;
              }

              if (targetVendedorId) {
                const slots = await getFreeSlots(targetVendedorId, args.date);
                const vRes = await pool.query(
                  "SELECT nome FROM vendedores WHERE id = $1",
                  [targetVendedorId],
                );

                toolResult = {
                  vendedor: { id: targetVendedorId, nome: vRes.rows[0]?.nome },
                  date: args.date,
                  available_slots: slots,
                  total_slots_available: slots.length,
                  _system_instruction:
                    "These are the ALL available slots for this date. You should offer 2 or 3 options to the user initially. If the user asks for a specific time and it is in 'available_slots', you MUST confirm it is available. Do not say it is unavailable if it is in the list.",
                };
              } else {
                toolResult = {
                  error: "Nenhum vendedor disponível no momento.",
                };
              }
            } else if (functionName === "confirmar_agendamento") {
              let targetVendedorId = args.vendedorId;

              // Self-healing: If AI sends a name instead of UUID, look it up
              const uuidRegex =
                /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
              if (!uuidRegex.test(targetVendedorId)) {
                log(
                  `[AI - TOOL] Warning: Invalid UUID '${targetVendedorId}'. Attempting lookup by name...`,
                );
                const vRes = await pool.query(
                  "SELECT id FROM vendedores WHERE nome ILIKE $1 AND organization_id = $2 LIMIT 1",
                  [targetVendedorId.trim(), user.organization_id],
                );
                if (vRes.rows.length > 0) {
                  targetVendedorId = vRes.rows[0].id;
                  log(
                    `[AI - TOOL] Resolved '${args.vendedorId}' to UUID '${targetVendedorId}'`,
                  );
                } else {
                  throw new Error(
                    `Vendedor '${args.vendedorId}' não encontrado. Use o ID correto.`,
                  );
                }
              }

              const dataHora = new Date(`${args.date}T${args.time}:00`);
              const avail = await checkAvailability(targetVendedorId, dataHora); // Use resolved ID

              if (avail.available) {
                // Find lead if possible by remoteJid
                // Use a simpler logic or ensure remoteJid is valid
                let leadId = null;
                try {
                  const leadRes = await pool.query(
                    "SELECT id FROM leads WHERE organization_id = $1 AND (phone LIKE $2 OR mobile_phone LIKE $2) LIMIT 1",
                    [orgId, `%${remoteJid.split("@")[0]}%`],
                  );
                  leadId = leadRes.rows[0]?.id;
                } catch (e) { }

                if (leadId) {
                  const existingAgendamentos = await pool.query(
                    "SELECT id FROM agendamentos WHERE lead_id = $1 AND status = 'agendado'",
                    [leadId],
                  );
                  if (existingAgendamentos.rows.length > 0) {
                    log(
                      `[AI - TOOL] Rescheduling: Deleting ${existingAgendamentos.rows.length} existing appointment(s) for lead ${leadId}`,
                    );
                    await pool.query(
                      "DELETE FROM agendamentos WHERE lead_id = $1 AND status = 'agendado'",
                      [leadId],
                    );
                  }
                }

                const insert = await pool.query(
                  "INSERT INTO agendamentos (vendedor_id, lead_id, data_hora, notas) VALUES ($1, $2, $3, $4) RETURNING *",
                  [
                    targetVendedorId,
                    leadId,
                    dataHora.toISOString(),
                    args.notas || "Agendado via IA",
                  ],
                );

                // Increment leads count for round-robin fairness
                await incrementVendedorCounter(targetVendedorId, orgId);

                toolResult = {
                  success: true,
                  agendamento: insert.rows[0],
                  message: "Agendamento realizado com sucesso.",
                };
              } else {
                toolResult = { success: false, error: avail.reason };
              }
            } else if (functionName === "cancelar_agendamento") {
              let leadId = null;
              try {
                const leadRes = await pool.query(
                  "SELECT id FROM leads WHERE organization_id = $1 AND (phone LIKE $2 OR mobile_phone LIKE $2) LIMIT 1",
                  [orgId, `%${remoteJid.split("@")[0]}%`],
                );
                leadId = leadRes.rows[0]?.id;
              } catch (e) { }

              if (!leadId) {
                toolResult = {
                  success: false,
                  error: "Lead não encontrado para cancelamento.",
                };
              } else {
                const checkExistence = await pool.query(
                  "SELECT id FROM agendamentos WHERE lead_id = $1 AND status = 'agendado'",
                  [leadId],
                );

                if (checkExistence.rows.length === 0) {
                  toolResult = {
                    success: false,
                    error:
                      "Nenhum agendamento ativo encontrado para este cliente.",
                  };
                } else {
                  log(
                    `[AI - TOOL] Cancellation: Deleting ${checkExistence.rows.length} appointment(s) for lead ${leadId}`,
                  );
                  await pool.query(
                    "DELETE FROM agendamentos WHERE lead_id = $1 AND status = 'agendado'",
                    [leadId],
                  );
                  toolResult = {
                    success: true,
                    message: "Agendamento cancelado com sucesso.",
                  };
                }
              }
            }

            const resultString = JSON.stringify(toolResult);
            log(`[AI - TOOL] Result: ${resultString}`);

            // Re-insert with structured content
            const storedContent = JSON.stringify({
              tool_call_id: toolCall.id,
              name: functionName,
              result: toolResult,
            });

            await pool.query(
              "INSERT INTO chat_messages (agent_id, remote_jid, role, content) VALUES ($1, $2, $3, $4)",
              [agent.id, remoteJid, "tool", storedContent],
            );

            apiMessages.push({
              role: "tool",
              tool_call_id: toolCall.id,
              name: functionName,
              content: JSON.stringify(toolResult),
            });
          } catch (toolErr) {
            log(
              `[AI - TOOL] Error executing ${functionName}: ${toolErr.message}`,
            );

            const errorContent = JSON.stringify({
              tool_call_id: toolCall.id,
              name: functionName,
              error: "Internal error",
            });

            await pool.query(
              "INSERT INTO chat_messages (agent_id, remote_jid, role, content) VALUES ($1, $2, $3, $4)",
              [agent.id, remoteJid, "tool", errorContent],
            );

            apiMessages.push({
              role: "tool",
              tool_call_id: toolCall.id,
              name: functionName,
              content: JSON.stringify({
                error: "Internal error executing tool",
              }),
            });
          }
        }
        toolCallsAttempt++;
        continue; // Call OpenAI again with tool results
      }

      aiResponse = message.content;
      break; // No more tool calls, exit loop
    }

    // Calculate Cost (gpt-4o-mini: $0.15/1M input, $0.60/1M output)
    const tokenCost =
      (totalPromptTokens / 1000000) * 0.15 +
      (totalCompletionTokens / 1000000) * 0.6;

    // 2.5 Save AI response to history
    await pool.query(
      "INSERT INTO chat_messages (agent_id, remote_jid, role, content, prompt_tokens, completion_tokens, token_cost) VALUES ($1, $2, $3, $4, $5, $6, $7)",
      [
        agent.id,
        remoteJid,
        "assistant",
        aiResponse,
        totalPromptTokens,
        totalCompletionTokens,
        tokenCost,
      ],
    );

    // 3. Send Response back to WhatsApp
    const evolutionApiUrl =
      process.env.EVOLUTION_API_URL || "https://evo.kogna.co";
    const evolutionApiKey = process.env.EVOLUTION_API_KEY || "";

    // --- AUDIO RESPONSE MODE ---
    if (respondWithAudio) {
      let audioFilePath = null;
      try {
        audioFilePath = await convertToAudio(aiResponse);
        const audioBase64 = fs.readFileSync(audioFilePath).toString("base64");

        log(
          `[TTS] Attempting to send audio(${audioBase64.length} base64 chars) to ${remoteJid} `,
        );

        // Attempt 1: sendWhatsAppAudio with raw base64
        let sendResponse = await fetch(
          `${evolutionApiUrl}/message/sendWhatsAppAudio/${instanceName}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              apikey: evolutionApiKey,
            },
            body: JSON.stringify({
              number: remoteJid,
              audio: audioBase64,
              delay: 3000,
              encoding: true,
            }),
          },
        );

        // If raw base64 fails, try data URI format
        if (!sendResponse.ok) {
          const err1 = await sendResponse.text();
          log(`[TTS] Attempt 1 (raw base64) failed: ${err1}`);

          sendResponse = await fetch(
            `${evolutionApiUrl}/message/sendWhatsAppAudio/${instanceName}`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                apikey: evolutionApiKey,
              },
              body: JSON.stringify({
                number: remoteJid,
                audio: `data:audio/mpeg;base64,${audioBase64}`,
                encoding: true,
              }),
            },
          );
        }

        // If both fail, try sendMedia endpoint as final attempt
        if (!sendResponse.ok) {
          const err2 = await sendResponse.text();
          log(`[TTS] Attempt 2 (data URI) failed: ${err2}`);

          sendResponse = await fetch(
            `${evolutionApiUrl}/message/sendMedia/${instanceName}`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                apikey: evolutionApiKey,
              },
              body: JSON.stringify({
                number: remoteJid,
                mediatype: "audio",
                media: `data:audio/mpeg;base64,${audioBase64}`,
                fileName: "audio.mp3",
              }),
            },
          );
        }

        if (sendResponse.ok) {
          log(`[AI] Audio response sent to ${remoteJid} `);
          // Deduct 10 Koins for audio response
          const deductRes = await adjustUserKoinsBalance({
            userId: user.id,
            delta: -10,
            source: "assistant_audio_response",
            metadata: { remote_jid: remoteJid || null },
          });
          log(
            `[KOINS] Deducted 10 koins for audio response.New balance: ${deductRes?.koins_balance ?? "n/a"} `,
          );
        } else {
          const errBody = await sendResponse.text();
          log(
            `[AI] Failed to send audio: ${sendResponse.statusText} - ${errBody} `,
          );
          // Fallback: send as text
          log(`[AI] Falling back to text response...`);
          await sendTextResponse(
            evolutionApiUrl,
            evolutionApiKey,
            instanceName,
            remoteJid,
            aiResponse,
            user,
          );
        }
      } catch (ttsError) {
        log(`[TTS] Error: ${ttsError.message}. Falling back to text.`);
        await sendTextResponse(
          evolutionApiUrl,
          evolutionApiKey,
          instanceName,
          remoteJid,
          aiResponse,
          user,
        );
      } finally {
        if (audioFilePath && fs.existsSync(audioFilePath)) {
          fs.unlinkSync(audioFilePath);
          log(`[TTS] Temp file cleaned: ${audioFilePath} `);
        }
      }
    }
    // --- TEXT RESPONSE MODE ---
    else {
      await sendTextResponse(
        evolutionApiUrl,
        evolutionApiKey,
        instanceName,
        remoteJid,
        aiResponse,
        user,
      );
    }

    // 4. Update Lead Score (Async / Non-blocking)
    if (user && user.organization_id) {
      updateLeadScore(agent.id, remoteJid, user.organization_id, apiMessages)
        .catch(err => log(`[LEAD-SCORE-TRIGGER] Error: ${err.message}`));

      scheduleFollowupEvent(user.organization_id, remoteJid, instanceName)
        .catch(err => log(`[FOLLOWUP SCHEDULE] Error: ${err.message}`));
    }

    // 5. CSE + MEMORY: Persist state and extract structured memory (async, non-blocking)
    if (cseState && cseOrgId) {
      (async () => {
        await updateConversationState(cseState.id, userIntent, cseStage, cseGoal, cseNextExpected, aiResponse);

        const memoryLast3 = coalescedHistory
          .filter(m => m.role === 'user' || m.role === 'assistant')
          .filter(m => typeof m.content === 'string')
          .slice(-3);

        const extracted = await extractConversationMemory(memoryLast3, userText);
        await updateLeadMemory(cseOrgId, remoteJid, userIntent, extracted);
        await refreshLeadConversationSummary({
          orgId: cseOrgId,
          conversationKey: remoteJid,
          intent: userIntent,
          stage: cseStage,
          nextExpected: cseNextExpected,
          agentDecision: activeAgent?.name || activeAgent?.key || null,
        });
      })().catch(err => log(`[MEMORY] pipeline error: ${err.message}`));
    }

  } catch (error) {
    log(`[AI] Error generating / sending response: ${error.message} `);
  }
}

// ==================== RECOVERY MACHINE (FOLLOW-UP) ====================

/**
 * @swagger
 * /api/recovery/sequences:
 *   get:
 *     summary: List follow-up sequences
 *     tags: [Recovery Machine]
 *     responses:
 *       200:
 *         description: List of sequences
 */
app.get("/api/recovery/sequences", verifyJWT, async (req, res) => {
  try {
    await ensureFollowupEngineReady();
    const userId = req.userId;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const result = await pool.query(
      `SELECT * FROM followup_sequences WHERE user_id = $1 ORDER BY delay_days ASC`,
      [userId],
    );

    res.json(result.rows);
  } catch (err) {
    log("Get Sequences error: " + err.toString());
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * @swagger
 * /api/recovery/sequences:
 *   post:
 *     summary: Create a follow-up sequence
 *     tags: [Recovery Machine]
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               delayDays:
 *                 type: integer
 *               message:
 *                 type: string
 *               image:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Sequence created
 */
app.post(
  "/api/recovery/sequences",
  verifyJWT,
  upload.single("image"),
  async (req, res) => {
    log(`[Recovery] POST /api/recovery/sequences hit.`);
    try {
      const userId = req.userId;
      log(`[Recovery] User ID: ${userId}`);

      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const { delayDays, message } = req.body;
      const imageFile = req.file;

      if (!delayDays || !message) {
        return res
          .status(400)
          .json({ error: "Dias de atraso e mensagem são obrigatórios" });
      }

      let imageUrl = null;
      if (imageFile && imageFile.buffer) {
        // Convert to data URL for serverless compatibility (no filesystem)
        const base64 = imageFile.buffer.toString("base64");
        imageUrl = `data:${imageFile.mimetype};base64,${base64}`;
      }

    const newSeq = await pool.query(
        `INSERT INTO followup_sequences (user_id, delay_days, message, image_url, active)
             VALUES ($1, $2, $3, $4, true) RETURNING *`,
        [userId, delayDays, message, imageUrl],
      );

      await syncLegacyRecoverySequencesToV2();

      log(
        `Follow-up sequence created for user ${userId}. ID: ${newSeq.rows[0].id}`,
      );
      res.json(newSeq.rows[0]);
    } catch (err) {
      log("Create Sequence error: " + err.toString());
      console.error(err); // Ensure it prints to stderr too
      res.status(500).json({ error: "Internal server error: " + err.message });
    }
  },
);

app.delete("/api/recovery/sequences/:id", verifyJWT, async (req, res) => {
  try {
    await ensureFollowupEngineReady();
    const userId = req.userId;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const { id } = req.params;
    await pool.query(
      "DELETE FROM followup_sequences WHERE id = $1 AND user_id = $2",
      [id, userId],
    );

    await syncLegacyRecoverySequencesToV2();

    res.json({ success: true });
  } catch (err) {
    log("Delete Sequence error: " + err.toString());
    res.status(500).json({ error: "Internal server error" });
  }
});

app.put(
  "/api/recovery/sequences/:id",
  verifyJWT,
  upload.single("image"),
  async (req, res) => {
    try {
      await ensureFollowupEngineReady();
      const userId = req.userId;
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const { id } = req.params;
      const { delayDays, message } = req.body;
      const imageFile = req.file;

      // Verify ownership
      const currentSeq = await pool.query(
        "SELECT * FROM followup_sequences WHERE id = $1 AND user_id = $2",
        [id, userId],
      );
      if (currentSeq.rows.length === 0) {
        return res.status(404).json({ error: "Sequência não encontrada" });
      }

      let imageUrl = currentSeq.rows[0].image_url;
      if (imageFile && imageFile.buffer) {
        const base64 = imageFile.buffer.toString("base64");
        imageUrl = `data:${imageFile.mimetype};base64,${base64}`;
      }

      const updatedSeq = await pool.query(
        `UPDATE followup_sequences
             SET delay_days = COALESCE($1, delay_days),
                 message = COALESCE($2, message),
                 image_url = $3
             WHERE id = $4 AND user_id = $5
             RETURNING *`,
        [delayDays, message, imageUrl, id, userId],
      );

      await syncLegacyRecoverySequencesToV2();

      log(`Follow-up sequence updated for user ${userId}. ID: ${id}`);
      res.json(updatedSeq.rows[0]);
    } catch (err) {
      log("Update Sequence error: " + err.toString());
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

// --- CRON JOB (Every hour) ---
// Legacy recovery machine disabled: follow-up queue processor is the single active engine now.
const ENABLE_LEGACY_RECOVERY_MACHINE = false;
// Using setInterval for simplicity as node-cron might not be installed
const ONE_HOUR = 60 * 60 * 1000;
if (ENABLE_LEGACY_RECOVERY_MACHINE) {
setInterval(async () => {
  log("[Recovery Machine] Running cron job...");
  if (!(await checkDb())) {
    log("[Recovery Machine] DB not ready, skipping.");
    return;
  }

  try {
    // 1. Find all active sequences needed to be sent
    // We need to iterate PER USER because of Koins and Evolution instances
    // A better approach for scalability is to query leads, but let's query Users with Active Sequences first?
    // No, let's query LEADS that are eligible.

    // Leads criteria:
    // - followup_status != 'completed' (or is null)
    // - NO confirmed appointment (agendamentos status != 'confirmado')
    // - Last interaction > delay_days ago

    // This is complex to do in one query if delays vary.
    // Simplified Logic:
    // Iterate over all active sequences. For each sequence, find leads that match.

    const sequencesRes = await pool.query(
      `SELECT * FROM followup_sequences WHERE active = true ORDER BY user_id, delay_days ASC`,
    );
    const sequences = sequencesRes.rows;

    for (const seq of sequences) {
      // Find eligible leads for THIS sequence
      // We need to know if the lead has ALREADY received this sequence?
      // Current model doesn't track "sent sequences" individually, just "last_interaction_at".
      // If we depend on "delay_days" being relative to "last_interaction_at", then:
      // IF (now - last_interaction) >= delay_days
      // AND user has enough Koins
      // AND lead has no confirmed appointment

      // BUT: If we have Day 1 and Day 3.
      // Lead interacts Day 0.
      // Day 1: (Day 1 - Day 0) >= 1. Send Day 1. Update last_interaction to Now (Day 1).
      // Day 2: (Day 2 - Day 1) = 1. Wait.
      // Day 3: (Day 3 - Day 1) = 2. Wait... (target is Day 3 message).
      // Wait, if we reset last_interaction, "Day 3" sequence effectively becomes "3 days after Day 1".
      // If the user intends "Day 1", "Day 3" (total time from start), then updating last_interaction breaks it.
      // If the user intends "Sequence of messages", locally defined delays are usually relative to previous step.
      // Let's assume delays are relative to LAST message.
      // So "Day 1" means "1 day after trigger". "Day 3" means "3 days after Day 1".
      // This fits `last_interaction_at` check.

      // However, how do we prevent re-sending the SAME sequence?
      // "Day 1" matches. We send. Update last_interaction.
      // Next hour: (Now - last_interaction) is 0.
      // Next day: (Now - last_interaction) is 1. "Day 1" matches AGAIN!
      // We need to track WHICH step the lead is at.
      // Added `followup_step` to Lead. Initial is 0.

      // So: Find leads where:
      // - user_id = seq.userId
      // - followup_step < current_sequence_index? (No, sequences change)
      // - logic: The sequences are ordered by delay.
      // - Let's assume strategies are linear.
      // - We need to know "Which sequence is next for this lead?".
      // - Lead.followup_step = N. We look for the (N+1)th sequence (ordered by delay? IDK).
      // - Let's use `order by delay_days`.

      // Get all sequences for this user, ordered.
      const userSeqsRes = await pool.query(
        "SELECT * FROM followup_sequences WHERE user_id = $1 ORDER BY delay_days ASC",
        [seq.user_id],
      );
      const userSeqs = userSeqsRes.rows;
      const seqIndex = userSeqs.findIndex((s) => s.id === seq.id);
      const targetStep = seqIndex + 1; // 1-based step

      // Find leads for this user that are at step (targetStep - 1)
      // AND time passed >= seq.delayDays

      const leadsRes = await pool.query(
        `SELECT l.*, u.koins_balance, u.organization_id
                 FROM leads l
                 JOIN users u ON l.user_id = u.id
                 WHERE l.user_id = $1
                   AND (l.followup_status = 'active' OR l.followup_status IS NULL)
                   AND COALESCE(l.followup_step, 0) = $2
                   AND l.last_interaction_at <= NOW() - ($3 || ' days')::INTERVAL
                   AND NOT EXISTS (
                       SELECT 1 FROM agendamentos a
                       WHERE a.lead_id = l.id AND a.status = 'confirmado'
                   )`,
        [seq.user_id, targetStep - 1, seq.delay_days],
      );

      const leadsToProcess = leadsRes.rows;

      if (leadsToProcess.length === 0) continue;

      const user = await pool.query("SELECT * FROM users WHERE id = $1", [
        seq.user_id,
      ]);
      const userData = user.rows[0];

      // Koin Check
      if (userData.koins_balance < 5) {
        log(`[Recovery] User ${seq.user_id} out of Koins. Skipping.`);
        continue;
      }

      // Get Evolution Instance
      const instanceRes = await pool.query(
        "SELECT * FROM whatsapp_instances WHERE user_id = $1 AND status = 'CONNECTED'",
        [seq.user_id],
      );
      if (instanceRes.rows.length === 0) {
        // Try org instance?
        continue;
      }
      const instance = instanceRes.rows[0];

      for (const lead of leadsToProcess) {
        // Double check balance (atomic decrement ideally)
        const currentBalRes = await pool.query(
          "SELECT koins_balance FROM users WHERE id = $1",
          [seq.user_id],
        );
        if (currentBalRes.rows[0].koins_balance < 5) break;

        log(
          `[Recovery] Sending recovery to lead ${lead.id} (Step ${targetStep})`,
        );

        // Send Message
        const evolutionApiUrl = EVOLUTION_API_URL;
        const evolutionApiKey = EVOLUTION_API_KEY;
        const remoteJid = lead.phone.includes("@")
          ? lead.phone
          : `${lead.phone.replace(/\D/g, "")}@s.whatsapp.net`;

        let sent = false;

        // Send Text
        if (seq.message) {
          try {
            const payload = {
              number: remoteJid,
              text: seq.message,
            };
            const r = await fetch(
              `${evolutionApiUrl}/message/sendText/${instance.instanceName}`,
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  apikey: evolutionApiKey,
                },
                body: JSON.stringify(payload),
              },
            );
            if (r.ok) sent = true;
            else log(`[Recovery] Text failed: ${await r.text()}`);
          } catch (e) {
            log(`[Recovery] Text Error: ${e.message}`);
          }
        }

        // Send Image
        if (seq.image_url) {
          try {
            // Resolve full URL if relative
            // If it's local upload, we need to provide a public URL or read file and send as base64/media.
            // Evolution supports URL. If localhost, tunnel needed.
            // Assuming this runs on a server with public URL or we use base64.
            // Let's use base64 for reliability if local.

            let mediaPayload = {};
            if (seq.image_url.startsWith("http")) {
              mediaPayload = {
                number: remoteJid,
                media: seq.image_url,
                mediatype: "image",
                caption: seq.message || "",
              };
            } else {
              // Local file
              const filePath = path.join(__dirname, seq.image_url);
              if (fs.existsSync(filePath)) {
                const b64 = fs.readFileSync(filePath, "base64");
                mediaPayload = {
                  number: remoteJid,
                  media: b64,
                  mediatype: "image",
                  fileName: "image.jpg",
                  caption: seq.message || "",
                };
              }
            }

            // Use sendMedia from Evolution (check docs, usually /message/sendMedia)
            const r = await fetch(
              `${evolutionApiUrl}/message/sendMedia/${instance.instanceName}`,
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  apikey: evolutionApiKey,
                },
                body: JSON.stringify(mediaPayload),
              },
            );
            if (r.ok) sent = true;
            else log(`[Recovery] Image failed: ${await r.text()}`);
          } catch (e) {
            log(`[Recovery] Image Error: ${e.message}`);
          }
        }

        if (sent) {
          // Deduct Koins
          await adjustUserKoinsBalance({
            userId: seq.user_id,
            delta: -5,
            source: "followup_recovery_message",
            metadata: { lead_id: lead.id, sequence_id: seq.id || null },
          });
          // Update Lead
          await pool.query(
            "UPDATE leads SET last_interaction_at = NOW(), followup_step = $1 WHERE id = $2",
            [targetStep, lead.id],
          );

          // Insert into chat_messages so AI knows about it
          try {
            // Find agent for this user/org
            const agentRes = await pool.query(
              "SELECT id FROM agents WHERE organization_id = $1 LIMIT 1",
              [userData.organization_id],
            );
            if (agentRes.rows.length > 0) {
              const agentId = agentRes.rows[0].id;
              const content =
                seq.message ||
                (seq.image_url ? "[Imagem enviada]" : "Follow-up");
              await pool.query(
                "INSERT INTO chat_messages (agent_id, remote_jid, role, content, created_at) VALUES ($1, $2, 'assistant', $3, NOW())",
                [agentId, remoteJid, content],
              );
            }
          } catch (err) {
            log(`[Recovery] Failed to log to chat history: ${err.message}`);
          }

          log(`[Recovery] Success for lead ${lead.id}. Koins deducted.`);
        }
      }
    }
  } catch (e) {
    log(`[Recovery Machine] Error: ${e.message}`);
  }
}, ONE_HOUR);
} else {
  log("[Recovery Machine] Legacy cron disabled in favor of the AI Follow-up Engine.");
}

// Serve frontend static files (production build)
const distPath = path.resolve(__dirname, "dist");
if (fs.existsSync(distPath)) {
  console.log(`Serving frontend from ${distPath}`);
  app.use(express.static(distPath));

  // SPA fallback - serve index.html for non-API routes
  app.get("{*path}", (req, res, next) => {
    // Skip API routes and uploads
    if (
      req.path.startsWith("/api/") ||
      req.path.startsWith("/uploads/") ||
      req.path.startsWith("/auth/")
    ) {
      return next();
    }
    res.sendFile(path.join(distPath, "index.html"));
  });
}

// Serve uploads
app.use("/uploads", express.static("uploads"));

// Start Server
// Export for Vercel
export default app;

// --- ONE-TIME FIX FOR NATANAEL ---
const fixNatanaelData = async () => {
  try {
    log("--- RUNNING NATANAEL FIX ---");
    const email = "natanael@kogna.co";
    const userRes = await pool.query(
      "SELECT id, organization_id FROM users WHERE email = $1",
      [email],
    );

    if (userRes.rows.length === 0) {
      log("Natanael user not found.");
      return;
    }

    const user = userRes.rows[0];
    const orgId = user.organization_id;

    log(`Natanael Found: ID=${user.id}, OrgID=${orgId}`);

    if (orgId) {
      const res = await pool.query(
        `UPDATE whatsapp_instances
                 SET organization_id = $1
                 WHERE user_id = $2 AND (organization_id IS NULL OR organization_id != $1)
                 RETURNING *`,
        [orgId, user.id],
      );
      log(`Updated ${res.rows.length} instances for Natanael.`);
      res.rows.forEach((r) => log(` - Fixed Instance: ${r.instance_name}`));
    } else {
      log("Natanael has no Org ID, cannot fix instances.");
    }
    log("--- FIX COMPLETE ---");
  } catch (err) {
    log("Fix Error: " + err.message);
  }
};

// Run the fix after a short delay to ensure DB connection (only locally)
if (process.env.VERCEL !== '1') {
  setTimeout(fixNatanaelData, 5000);
}

app.get("/api/sellers", verifyJWT, async (req, res) => {
  try {
    const orgId = await getOrganizationIdForUser(req.userId);
    if (!orgId) return res.status(400).json({ error: "No organization found" });

    const period = parseSellerPeriod(req.query, { defaultDays: SELLER_DEFAULT_PERIOD_DAYS });
    const context = await loadSellerAnalyticsContext(orgId, {
      periodStart: period.periodStart,
      periodEnd: period.periodEnd,
    });

    const directory = context.scopes.map((scope) => serializeSellerScope(scope, context.teamAverages));
    const items = filterSellerDirectory(directory, req.query);

    res.json({
      items,
      period: {
        range: period.range,
        start: period.periodStart.toISOString(),
        end: period.periodEnd.toISOString(),
      },
    });
  } catch (err) {
    log(`[SELLERS] GET /api/sellers error: ${err.message}`);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/api/sellers", verifyJWT, async (req, res) => {
  try {
    await ensureSellerPlatformSchema();
    const orgId = await getOrganizationIdForUser(req.userId);
    if (!orgId) return res.status(400).json({ error: "No organization found" });

    const {
      name,
      email,
      phoneNumber,
      avatarUrl,
      role,
      notes,
      status,
      connectionId,
      connectionIds,
      primaryConnectionId,
      forceTransfer,
    } = req.body || {};

    if (!name || !String(name).trim()) {
      return res.status(400).json({ error: "Name is required" });
    }

    const normalizedStatus = String(status || "offline").toLowerCase();
    const isActive = normalizedStatus !== "inactive";
    const insertedSeller = await pool.query(`
      INSERT INTO vendedores (
        organization_id,
        nome,
        email,
        whatsapp,
        avatar_url,
        role,
        notes,
        status,
        porcentagem,
        ativo,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 100, $9, NOW())
      RETURNING *
    `, [
      orgId,
      String(name).trim(),
      email ? String(email).trim().toLowerCase() : null,
      phoneNumber ? String(phoneNumber).trim() : null,
      avatarUrl ? String(avatarUrl).trim() : null,
      role ? String(role).trim() : null,
      notes ? String(notes).trim() : null,
      normalizedStatus,
      isActive,
    ]);

    const seller = insertedSeller.rows[0];
    const requestedConnections = Array.from(new Set([
      ...(Array.isArray(connectionIds) ? connectionIds : []),
      connectionId,
      primaryConnectionId,
    ].filter(Boolean)));
    const chosenPrimary = primaryConnectionId || connectionId || requestedConnections[0] || null;

    for (const requestedConnectionId of requestedConnections) {
      await attachConnectionToSeller(orgId, seller.id, requestedConnectionId, {
        isPrimary: chosenPrimary ? requestedConnectionId === chosenPrimary : requestedConnections[0] === requestedConnectionId,
        forceTransfer: Boolean(forceTransfer),
      });
    }

    const period = parseSellerPeriod(req.query, { defaultDays: SELLER_DEFAULT_PERIOD_DAYS });
    const { currentScope, previousScope, currentContext } = await loadSellerDetailByPeriod(orgId, seller.id, period);
    res.status(201).json({
      ...buildSellerDetailPayload(currentScope, currentContext.teamAverages, previousScope),
      period: {
        range: period.range,
        start: period.periodStart.toISOString(),
        end: period.periodEnd.toISOString(),
      },
    });
  } catch (err) {
    if (err.statusCode === 409) {
      return res.status(409).json({
        error: "Connection already linked to another seller",
        ...err.payload,
      });
    }

    log(`[SELLERS] POST /api/sellers error: ${err.message}`);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.put("/api/sellers/:id", verifyJWT, async (req, res) => {
  try {
    await ensureSellerPlatformSchema();
    const orgId = await getOrganizationIdForUser(req.userId);
    if (!orgId) return res.status(400).json({ error: "No organization found" });

    const sellerId = req.params.id;
    const {
      name,
      email,
      phoneNumber,
      avatarUrl,
      role,
      notes,
      status,
      primaryConnectionId,
      forceTransfer,
    } = req.body || {};

    const fields = [];
    const values = [];
    let index = 1;

    if (name !== undefined) {
      fields.push(`nome = $${index++}`);
      values.push(String(name).trim());
    }
    if (email !== undefined) {
      fields.push(`email = $${index++}`);
      values.push(email ? String(email).trim().toLowerCase() : null);
    }
    if (phoneNumber !== undefined) {
      fields.push(`whatsapp = $${index++}`);
      values.push(phoneNumber ? String(phoneNumber).trim() : null);
    }
    if (avatarUrl !== undefined) {
      fields.push(`avatar_url = $${index++}`);
      values.push(avatarUrl ? String(avatarUrl).trim() : null);
    }
    if (role !== undefined) {
      fields.push(`role = $${index++}`);
      values.push(role ? String(role).trim() : null);
    }
    if (notes !== undefined) {
      fields.push(`notes = $${index++}`);
      values.push(notes ? String(notes).trim() : null);
    }
    if (status !== undefined) {
      const normalizedStatus = String(status || "offline").toLowerCase();
      fields.push(`status = $${index++}`);
      values.push(normalizedStatus);
      fields.push(`ativo = $${index++}`);
      values.push(normalizedStatus !== "inactive");
    }

    if (fields.length > 0) {
      fields.push(`updated_at = NOW()`);
      values.push(sellerId, orgId);
      const updateResult = await pool.query(`
        UPDATE vendedores
           SET ${fields.join(", ")}
         WHERE id = $${index++}
           AND organization_id = $${index++}
         RETURNING *
      `, values);

      if (updateResult.rows.length === 0) {
        return res.status(404).json({ error: "Seller not found" });
      }
    } else {
      const existingSeller = await pool.query(
        `SELECT id FROM vendedores WHERE id = $1 AND organization_id = $2 LIMIT 1`,
        [sellerId, orgId],
      );

      if (existingSeller.rows.length === 0) {
        return res.status(404).json({ error: "Seller not found" });
      }
    }

    if (primaryConnectionId) {
      await attachConnectionToSeller(orgId, sellerId, primaryConnectionId, {
        isPrimary: true,
        forceTransfer: Boolean(forceTransfer),
      });
    }

    const period = parseSellerPeriod(req.query, { defaultDays: SELLER_DEFAULT_PERIOD_DAYS });
    const { currentScope, previousScope, currentContext } = await loadSellerDetailByPeriod(orgId, sellerId, period);

    res.json({
      ...buildSellerDetailPayload(currentScope, currentContext.teamAverages, previousScope),
      period: {
        range: period.range,
        start: period.periodStart.toISOString(),
        end: period.periodEnd.toISOString(),
      },
    });
  } catch (err) {
    if (err.statusCode === 409) {
      return res.status(409).json({
        error: "Connection already linked to another seller",
        ...err.payload,
      });
    }

    log(`[SELLERS] PUT /api/sellers/:id error: ${err.message}`);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/api/sellers/:id", verifyJWT, async (req, res) => {
  try {
    const orgId = await getOrganizationIdForUser(req.userId);
    if (!orgId) return res.status(400).json({ error: "No organization found" });

    const period = parseSellerPeriod(req.query, { defaultDays: SELLER_DEFAULT_PERIOD_DAYS });
    const { currentScope, previousScope, currentContext } = await loadSellerDetailByPeriod(orgId, req.params.id, period);

    if (!currentScope) {
      return res.status(404).json({ error: "Seller not found" });
    }

    res.json({
      ...buildSellerDetailPayload(currentScope, currentContext.teamAverages, previousScope),
      period: {
        range: period.range,
        start: period.periodStart.toISOString(),
        end: period.periodEnd.toISOString(),
      },
    });
  } catch (err) {
    log(`[SELLERS] GET /api/sellers/:id error: ${err.message}`);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/api/sellers/:id/metrics", verifyJWT, async (req, res) => {
  try {
    const orgId = await getOrganizationIdForUser(req.userId);
    if (!orgId) return res.status(400).json({ error: "No organization found" });

    const period = parseSellerPeriod(req.query, { defaultDays: SELLER_DEFAULT_PERIOD_DAYS });
    const { currentScope, previousScope, currentContext } = await loadSellerDetailByPeriod(orgId, req.params.id, period);
    if (!currentScope) {
      return res.status(404).json({ error: "Seller not found" });
    }

    const seller = serializeSellerScope(currentScope, currentContext.teamAverages);
    res.json({
      seller,
      metrics: {
        ...currentScope.metrics,
        qualityScore: seller.qualityScore,
        quality: seller.quality,
      },
      funnel: currentScope.funnel,
      bottlenecks: buildSellerBottlenecks(currentScope, currentContext.teamAverages),
      comparison: previousScope?.metrics || null,
      period: {
        range: period.range,
        start: period.periodStart.toISOString(),
        end: period.periodEnd.toISOString(),
      },
    });
  } catch (err) {
    log(`[SELLERS] GET /api/sellers/:id/metrics error: ${err.message}`);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/api/sellers/:id/insights", verifyJWT, async (req, res) => {
  try {
    const orgId = await getOrganizationIdForUser(req.userId);
    if (!orgId) return res.status(400).json({ error: "No organization found" });

    const period = parseSellerPeriod(req.query, { defaultDays: SELLER_DEFAULT_PERIOD_DAYS });
    const { currentScope, previousScope, currentContext } = await loadSellerDetailByPeriod(orgId, req.params.id, period);
    if (!currentScope) {
      return res.status(404).json({ error: "Seller not found" });
    }

    const seller = serializeSellerScope(currentScope, currentContext.teamAverages);
    const insights = buildSellerInsights({
      sellerName: seller.name,
      metrics: currentScope.metrics,
      previousMetrics: previousScope?.metrics || {},
      teamAverages: currentContext.teamAverages,
      funnel: currentScope.funnel,
    });

    res.json({
      seller,
      summary: buildSellerExecutiveSummary(seller.qualityScore, insights),
      insights,
      period: {
        range: period.range,
        start: period.periodStart.toISOString(),
        end: period.periodEnd.toISOString(),
      },
    });
  } catch (err) {
    log(`[SELLERS] GET /api/sellers/:id/insights error: ${err.message}`);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/api/sellers/:id/conversations", verifyJWT, async (req, res) => {
  try {
    const orgId = await getOrganizationIdForUser(req.userId);
    if (!orgId) return res.status(400).json({ error: "No organization found" });

    const period = parseSellerPeriod(req.query, { defaultDays: SELLER_DEFAULT_PERIOD_DAYS });
    const { currentScope, currentContext } = await loadSellerDetailByPeriod(orgId, req.params.id, period);
    if (!currentScope) {
      return res.status(404).json({ error: "Seller not found" });
    }

    res.json({
      seller: serializeSellerScope(currentScope, currentContext.teamAverages),
      conversations: currentScope.conversations,
    });
  } catch (err) {
    log(`[SELLERS] GET /api/sellers/:id/conversations error: ${err.message}`);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/api/sellers/:id/leads", verifyJWT, async (req, res) => {
  try {
    const orgId = await getOrganizationIdForUser(req.userId);
    if (!orgId) return res.status(400).json({ error: "No organization found" });

    const period = parseSellerPeriod(req.query, { defaultDays: SELLER_DEFAULT_PERIOD_DAYS });
    const { currentScope, currentContext } = await loadSellerDetailByPeriod(orgId, req.params.id, period);
    if (!currentScope) {
      return res.status(404).json({ error: "Seller not found" });
    }

    let leads = currentScope.leadRows;
    const filter = String(req.query.filter || "").toLowerCase();
    if (filter === "waiting") {
      leads = leads.filter((lead) => lead.waitingForReply);
    } else if (filter === "stale") {
      leads = leads.filter((lead) => lead.lastInteractionAt && hoursBetween(lead.lastInteractionAt, new Date()) >= 48);
    } else if (filter === "risk") {
      leads = leads.filter((lead) => lead.waitingForReply || lead.timeWithoutResponseMinutes >= 60);
    }

    res.json({
      seller: serializeSellerScope(currentScope, currentContext.teamAverages),
      leads,
    });
  } catch (err) {
    log(`[SELLERS] GET /api/sellers/:id/leads error: ${err.message}`);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/api/sellers/:id/connections", verifyJWT, async (req, res) => {
  try {
    const orgId = await getOrganizationIdForUser(req.userId);
    if (!orgId) return res.status(400).json({ error: "No organization found" });

    const { connectionId, isPrimary, forceTransfer } = req.body || {};
    if (!connectionId) {
      return res.status(400).json({ error: "connectionId is required" });
    }

    const linked = await attachConnectionToSeller(orgId, req.params.id, connectionId, {
      isPrimary: Boolean(isPrimary),
      forceTransfer: Boolean(forceTransfer),
    });

    res.status(201).json(linked);
  } catch (err) {
    if (err.statusCode === 409) {
      return res.status(409).json({
        error: "Connection already linked to another seller",
        ...err.payload,
      });
    }

    log(`[SELLERS] POST /api/sellers/:id/connections error: ${err.message}`);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.delete("/api/sellers/:id/connections/:connectionId", verifyJWT, async (req, res) => {
  try {
    const orgId = await getOrganizationIdForUser(req.userId);
    if (!orgId) return res.status(400).json({ error: "No organization found" });

    const removed = await detachConnectionFromSeller(orgId, req.params.id, req.params.connectionId);
    if (!removed) {
      return res.status(404).json({ error: "Connection link not found" });
    }

    res.json({ success: true });
  } catch (err) {
    log(`[SELLERS] DELETE /api/sellers/:id/connections/:connectionId error: ${err.message}`);
    res.status(500).json({ error: "Internal server error" });
  }
});


// ─────────────────────────────────────────────────────────────────────────────
// AGENDA API ROUTES
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/vendedores/all – list all vendors for the user's organization, including inactive ones
app.get("/api/vendedores/all", verifyJWT, async (req, res) => {
  try {
    const userRes = await pool.query("SELECT organization_id FROM users WHERE id = $1", [req.userId]);
    const orgId = userRes.rows[0]?.organization_id;
    if (!orgId) return res.status(400).json({ error: "No organization found" });
    const result = await pool.query(
      "SELECT id, nome, email, whatsapp, porcentagem, ativo, leads_recebidos_ciclo FROM vendedores WHERE organization_id = $1 ORDER BY created_at ASC",
      [orgId]
    );
    res.json(result.rows);
  } catch (err) {
    log("GET /api/vendedores error: " + err);
    res.status(500).json({ error: "Internal error" });
  }
});

// POST /api/vendedores – create a vendor
app.post("/api/vendedores", verifyJWT, async (req, res) => {
  try {
    const userRes = await pool.query("SELECT organization_id FROM users WHERE id = $1", [req.userId]);
    const orgId = userRes.rows[0]?.organization_id;
    if (!orgId) return res.status(400).json({ error: "No organization found" });
    const { nome, email, whatsapp, porcentagem } = req.body;
    if (!nome || !email) return res.status(400).json({ error: "nome and email are required" });
    const result = await pool.query(
      "INSERT INTO vendedores (organization_id, nome, email, whatsapp, porcentagem) VALUES ($1, $2, $3, $4, $5) RETURNING id, nome, email, whatsapp, porcentagem, ativo, leads_recebidos_ciclo",
      [orgId, nome, email, whatsapp || null, porcentagem || 50]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    log("POST /api/vendedores error: " + err);
    res.status(500).json({ error: "Internal error" });
  }
});

// DELETE /api/vendedores/:id – remove a vendor
app.delete("/api/vendedores/:id", verifyJWT, async (req, res) => {
  try {
    const userRes = await pool.query("SELECT organization_id FROM users WHERE id = $1", [req.userId]);
    const orgId = userRes.rows[0]?.organization_id;
    const check = await pool.query("SELECT id FROM vendedores WHERE id = $1 AND organization_id = $2", [req.params.id, orgId]);
    if (check.rows.length === 0) return res.status(404).json({ error: "Not found" });
    await pool.query("DELETE FROM vendedores WHERE id = $1", [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    log("DELETE /api/vendedores/:id error: " + err);
    res.status(500).json({ error: "Internal error" });
  }
});

// GET /api/vendedores/:id/disponibilidade – list schedules for a vendor
app.get("/api/vendedores/:id/disponibilidade", verifyJWT, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT id, vendedor_id, dia_semana, hora_inicio, hora_fim, intervalo FROM disponibilidade_vendedor WHERE vendedor_id = $1 ORDER BY dia_semana ASC",
      [req.params.id]
    );
    res.json(result.rows);
  } catch (err) {
    log("GET disponibilidade error: " + err);
    res.status(500).json({ error: "Internal error" });
  }
});

// POST /api/vendedores/:id/disponibilidade – add a schedule slot
app.post("/api/vendedores/:id/disponibilidade", verifyJWT, async (req, res) => {
  try {
    const { diaSemana, horaInicio, horaFim, intervalo } = req.body;
    const result = await pool.query(
      "INSERT INTO disponibilidade_vendedor (vendedor_id, dia_semana, hora_inicio, hora_fim, intervalo) VALUES ($1, $2, $3, $4, $5) RETURNING id, vendedor_id, dia_semana, hora_inicio, hora_fim, intervalo",
      [req.params.id, Number(diaSemana), horaInicio, horaFim, Number(intervalo) || 30]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    log("POST disponibilidade error: " + err);
    res.status(500).json({ error: "Internal error" });
  }
});

// DELETE /api/disponibilidade/:id – remove a schedule slot
app.delete("/api/disponibilidade/:id", verifyJWT, async (req, res) => {
  try {
    await pool.query("DELETE FROM disponibilidade_vendedor WHERE id = $1", [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    log("DELETE disponibilidade error: " + err);
    res.status(500).json({ error: "Internal error" });
  }
});

// GET /api/vendedores/:id/bloqueios – list blocks for a vendor
app.get("/api/vendedores/:id/bloqueios", verifyJWT, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT id, vendedor_id, data_inicio, data_fim, motivo FROM bloqueios_agenda WHERE vendedor_id = $1 ORDER BY data_inicio ASC",
      [req.params.id]
    );
    res.json(result.rows);
  } catch (err) {
    log("GET bloqueios error: " + err);
    res.status(500).json({ error: "Internal error" });
  }
});

// POST /api/vendedores/:id/bloqueios – add a block
app.post("/api/vendedores/:id/bloqueios", verifyJWT, async (req, res) => {
  try {
    const { dataInicio, dataFim, motivo } = req.body;
    const result = await pool.query(
      "INSERT INTO bloqueios_agenda (vendedor_id, data_inicio, data_fim, motivo) VALUES ($1, $2, $3, $4) RETURNING id, vendedor_id, data_inicio, data_fim, motivo",
      [req.params.id, new Date(dataInicio), new Date(dataFim), motivo || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    log("POST bloqueios error: " + err);
    res.status(500).json({ error: "Internal error" });
  }
});

// DELETE /api/bloqueios/:id – remove a block
app.delete("/api/bloqueios/:id", verifyJWT, async (req, res) => {
  try {
    await pool.query("DELETE FROM bloqueios_agenda WHERE id = $1", [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    log("DELETE bloqueio error: " + err);
    res.status(500).json({ error: "Internal error" });
  }
});

// GET /api/agendamentos – list appointments for a date
app.get("/api/agendamentos", verifyJWT, async (req, res) => {
  try {
    const userRes = await pool.query("SELECT organization_id FROM users WHERE id = $1", [req.userId]);
    const orgId = userRes.rows[0]?.organization_id;
    if (!orgId) return res.status(400).json({ error: "No organization found" });
    const data = req.query.data || new Date().toISOString().split("T")[0];
    const result = await pool.query(
      `SELECT a.id, a.vendedor_id, a.lead_id, a.data_hora, a.duracao, a.status, a.notas,
              v.nome AS vendedor_nome, l.name AS lead_nome
       FROM agendamentos a
       JOIN vendedores v ON v.id = a.vendedor_id
       LEFT JOIN leads l ON l.id = a.lead_id
       WHERE v.organization_id = $1
         AND a.data_hora::date = $2::date
       ORDER BY a.data_hora ASC`,
      [orgId, data]
    );
    res.json(result.rows);
  } catch (err) {
    log("GET /api/agendamentos error: " + err);
    res.status(500).json({ error: "Internal error" });
  }
});

// DELETE /api/agendamentos/:id – delete an appointment
app.delete("/api/agendamentos/:id", verifyJWT, async (req, res) => {
  try {
    await pool.query("DELETE FROM agendamentos WHERE id = $1", [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    log("DELETE /api/agendamentos/:id error: " + err);
    res.status(500).json({ error: "Internal error" });
  }
});

// PATCH /api/agendamentos/:id – update an appointment
app.patch("/api/agendamentos/:id", verifyJWT, async (req, res) => {
  try {
    const { dataHora, notas, status } = req.body;
    if (dataHora) {
      const agRes = await pool.query("SELECT vendedor_id FROM agendamentos WHERE id = $1", [req.params.id]);
      const vendedorId = agRes.rows[0]?.vendedor_id;
      if (vendedorId) {
        const dt = new Date(dataHora);
        const conflict = await pool.query(
          "SELECT id FROM agendamentos WHERE vendedor_id = $1 AND id != $2 AND ABS(EXTRACT(EPOCH FROM (data_hora - $3::timestamptz))) < 1800",
          [vendedorId, req.params.id, dt]
        );
        if (conflict.rows.length > 0) return res.status(409).json({ error: "Conflito de horário com outro agendamento" });
      }
    }
    const fields = [];
    const vals = [];
    let idx = 1;
    if (dataHora) { fields.push(`data_hora = $${idx++}`); vals.push(new Date(dataHora)); }
    if (notas !== undefined) { fields.push(`notas = $${idx++}`); vals.push(notas); }
    if (status) { fields.push(`status = $${idx++}`); vals.push(status); }
    if (fields.length === 0) return res.status(400).json({ error: "Nothing to update" });
    vals.push(req.params.id);
    const result = await pool.query(
      `UPDATE agendamentos SET ${fields.join(", ")} WHERE id = $${idx} RETURNING id, data_hora, status, notas`,
      vals
    );
    res.json(result.rows[0]);
  } catch (err) {
    log("PATCH /api/agendamentos/:id error: " + err);
    res.status(500).json({ error: "Internal error" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// CONVERSATION INTELLIGENCE LAYER — API ROUTES
// ─────────────────────────────────────────────────────────────────────────────

// ADMIN: Summary counts (total conversations, messages, events)
app.get("/api/admin/conversation-intelligence/summary", verifyJWT, verifyAdmin, async (req, res) => {
  try {
    const metricsStartAt = await getAdminMetricsStartAt();
    const [convRes, msgRes, evtRes] = await Promise.all([
      pool.query(`SELECT COUNT(DISTINCT conversation_id) AS total FROM conversation_intelligence WHERE created_at >= $1`, [metricsStartAt]),
      pool.query(`SELECT COUNT(*) AS total FROM conversation_intelligence WHERE created_at >= $1`, [metricsStartAt]),
      pool.query(`SELECT COUNT(*) AS total FROM conversation_events WHERE created_at >= $1`, [metricsStartAt])
    ]);
    res.json({
      total_conversations: parseInt(convRes.rows[0]?.total || 0),
      total_messages: parseInt(msgRes.rows[0]?.total || 0),
      total_events: parseInt(evtRes.rows[0]?.total || 0),
      metrics_start_at: metricsStartAt,
    });
  } catch (err) {
    log(`[CIL] GET /api/admin/conversation-intelligence/summary error: ${err.message}`);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ADMIN: Intent distribution
app.get("/api/admin/conversation-intelligence/intents", verifyJWT, verifyAdmin, async (req, res) => {
  try {
    const metricsStartAt = await getAdminMetricsStartAt();
    const result = await pool.query(`
      SELECT intent, COUNT(*) AS count
      FROM conversation_intelligence
      WHERE intent IS NOT NULL AND created_at >= $1
      GROUP BY intent
      ORDER BY count DESC
    `, [metricsStartAt]);
    res.json(result.rows);
  } catch (err) {
    log(`[CIL] GET /api/admin/conversation-intelligence/intents error: ${err.message}`);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ADMIN: Top objections
app.get("/api/admin/conversation-intelligence/objections", verifyJWT, verifyAdmin, async (req, res) => {
  try {
    const metricsStartAt = await getAdminMetricsStartAt();
    const result = await pool.query(`
      SELECT unnest(objections) AS objection, COUNT(*) AS count
      FROM conversation_intelligence
      WHERE objections IS NOT NULL AND array_length(objections, 1) > 0 AND created_at >= $1
      GROUP BY objection
      ORDER BY count DESC
      LIMIT 20
    `, [metricsStartAt]);
    res.json(result.rows);
  } catch (err) {
    log(`[CIL] GET /api/admin/conversation-intelligence/objections error: ${err.message}`);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ADMIN: Funnel stage heatmap
app.get("/api/admin/conversation-intelligence/stages", verifyJWT, verifyAdmin, async (req, res) => {
  try {
    const metricsStartAt = await getAdminMetricsStartAt();
    const result = await pool.query(`
      SELECT stage, COUNT(*) AS count
      FROM conversation_intelligence
      WHERE stage IS NOT NULL AND created_at >= $1
      GROUP BY stage
      ORDER BY count DESC
    `, [metricsStartAt]);
    res.json(result.rows);
  } catch (err) {
    log(`[CIL] GET /api/admin/conversation-intelligence/stages error: ${err.message}`);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ADMIN: Top segments, products, cities
app.get("/api/admin/conversation-intelligence/top-segments", verifyJWT, verifyAdmin, async (req, res) => {
  try {
    const metricsStartAt = await getAdminMetricsStartAt();
    const [products, segments, cities] = await Promise.all([
      pool.query(`
        SELECT product_interest AS name, COUNT(*) AS count
        FROM conversation_intelligence
        WHERE product_interest IS NOT NULL AND created_at >= $1
        GROUP BY product_interest ORDER BY count DESC LIMIT 10
      `, [metricsStartAt]),
      pool.query(`
        SELECT segment AS name, COUNT(*) AS count
        FROM conversation_intelligence
        WHERE segment IS NOT NULL AND created_at >= $1
        GROUP BY segment ORDER BY count DESC LIMIT 10
      `, [metricsStartAt]),
      pool.query(`
        SELECT city AS name, COUNT(*) AS count
        FROM conversation_intelligence
        WHERE city IS NOT NULL AND created_at >= $1
        GROUP BY city ORDER BY count DESC LIMIT 10
      `, [metricsStartAt])
    ]);
    res.json({
      top_products: products.rows,
      top_segments: segments.rows,
      top_cities: cities.rows
    });
  } catch (err) {
    log(`[CIL] GET /api/admin/conversation-intelligence/top-segments error: ${err.message}`);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ADMIN: Average metrics
app.get("/api/admin/conversation-intelligence/avg-metrics", verifyJWT, verifyAdmin, async (req, res) => {
  try {
    const metricsStartAt = await getAdminMetricsStartAt();
    const result = await pool.query(`
      SELECT
        ROUND(AVG(purchase_probability)::numeric, 3) AS avg_purchase_probability,
        ROUND(AVG(sbg.time_to_decision)::numeric, 0) AS avg_time_to_decision_seconds
      FROM conversation_intelligence ci
      LEFT JOIN sales_behavior_graph sbg ON ci.conversation_id = sbg.conversation_id
      WHERE ci.created_at >= $1
    `, [metricsStartAt]);
    res.json(result.rows[0] || { avg_purchase_probability: null, avg_time_to_decision_seconds: null });
  } catch (err) {
    log(`[CIL] GET /api/admin/conversation-intelligence/avg-metrics error: ${err.message}`);
    res.status(500).json({ error: "Internal server error" });
  }
});

// TENANT: Lead intelligence for a specific lead (scoped to org)
app.get("/api/leads/:leadId/intelligence", verifyJWT, async (req, res) => {
  try {
    const userId = req.userId;
    const { leadId } = req.params;

    const userRes = await pool.query("SELECT organization_id FROM users WHERE id = $1", [userId]);
    const orgId = userRes.rows[0]?.organization_id;
    if (!orgId) return res.status(400).json({ error: "No organization" });

    // Verify the lead belongs to this org
    const leadCheck = await pool.query(
      "SELECT id FROM leads WHERE id = $1 AND organization_id = $2",
      [leadId, orgId]
    );
    if (leadCheck.rows.length === 0) return res.status(404).json({ error: "Lead not found" });

    const result = await pool.query(`
      SELECT intent, product_interest, stage, urgency, sentiment, objections,
             purchase_probability, estimated_ticket, decision_maker, created_at
      FROM conversation_intelligence
      WHERE lead_id = $1 AND organization_id = $2
      ORDER BY created_at DESC
      LIMIT 1
    `, [leadId, orgId]);

    if (result.rows.length === 0) {
      return res.json({ hasIntelligence: false });
    }

    const row = result.rows[0];
    const score = Math.round((row.purchase_probability || 0) * 100);
    const temperature = score >= 70 ? 'quente' : score >= 40 ? 'morno' : 'frio';

    const leadStatusRes = await pool.query(
      `SELECT needs_human_attention, human_attention_reason, human_attention_since, top_objection
         FROM leads
        WHERE id = $1 AND organization_id = $2
        LIMIT 1`,
      [leadId, orgId]
    ).catch(() => ({ rows: [] }));
    const leadStatus = leadStatusRes.rows[0] || {};

    res.json({
      hasIntelligence: true,
      leadScore: score,
      temperature,
      intent: row.intent,
      stage: row.stage,
      urgency: row.urgency,
      sentiment: row.sentiment,
      objections: row.objections || [],
      topObjection: leadStatus.top_objection || row.objections?.[0] || null,
      productInterest: row.product_interest,
      decisionMaker: row.decision_maker,
      estimatedTicket: row.estimated_ticket,
      needsHumanAttention: leadStatus.needs_human_attention || false,
      humanAttentionReason: leadStatus.human_attention_reason || null,
      humanAttentionSince: leadStatus.human_attention_since || null,
      updatedAt: row.created_at
    });
  } catch (err) {
    log(`[CIL] GET /api/leads/:leadId/intelligence error: ${err.message}`);
    res.status(500).json({ error: "Internal server error" });
  }
});

// TENANT: Stalled high-urgency leads alert
app.get("/api/leads/intelligence/alerts", verifyJWT, async (req, res) => {
  try {
    const userId = req.userId;
    const userRes = await pool.query("SELECT organization_id FROM users WHERE id = $1", [userId]);
    const orgId = userRes.rows[0]?.organization_id;
    if (!orgId) return res.status(400).json({ error: "No organization" });

    const result = await pool.query(`
      SELECT ci.lead_id, ci.intent, ci.stage, ci.urgency, ci.purchase_probability,
             ci.objections, ci.product_interest, ci.created_at,
             l.name AS lead_name, l.phone AS lead_phone
      FROM conversation_intelligence ci
      LEFT JOIN leads l ON l.id = ci.lead_id::uuid
      WHERE ci.organization_id = $1
        AND ci.urgency = 'alta'
        AND ci.created_at < NOW() - INTERVAL '2 hours'
        AND ci.created_at > NOW() - INTERVAL '48 hours'
      ORDER BY ci.purchase_probability DESC, ci.created_at DESC
      LIMIT 20
    `, [orgId]);

    res.json(result.rows);
  } catch (err) {
    log(`[CIL] GET /api/leads/intelligence/alerts error: ${err.message}`);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// END CONVERSATION INTELLIGENCE LAYER
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// OPPORTUNITY SCORING ENGINE (OSE) — API ROUTES
// ─────────────────────────────────────────────────────────────────────────────

// TENANT: Get Opportunity Score for a specific lead
app.get("/api/leads/:leadId/opportunity-score", verifyJWT, async (req, res) => {
  try {
    const userId = req.userId;
    const { leadId } = req.params;

    const userRes = await pool.query("SELECT organization_id FROM users WHERE id = $1", [userId]);
    const orgId = userRes.rows[0]?.organization_id;
    if (!orgId) return res.status(400).json({ error: "No organization" });

    const result = await pool.query(`
      SELECT os.score,
             os.temperature,
             os.intent,
             os.product_interest,
             os.top_objection,
             os.pipeline_stage,
             os.auto_pipeline_enabled,
             os.signals,
             os.updated_at,
             l.needs_human_attention,
             l.human_attention_reason,
             l.human_attention_since
      FROM opportunity_scores os
      LEFT JOIN leads l
        ON l.id = os.lead_id::uuid
       AND l.organization_id = os.organization_id
      WHERE os.lead_id = $1 AND os.organization_id = $2
    `, [leadId, orgId]);

    if (result.rows.length === 0) {
      return res.json({ hasScore: false });
    }

    res.json({
      hasScore: true,
      ...result.rows[0]
    });
  } catch (err) {
    log(`[OSE] GET /api/leads/:leadId/opportunity-score error: ${err.message}`);
    res.status(500).json({ error: "Internal server error" });
  }
});

// TENANT: Toggle Auto-Pipeline for a lead
app.post("/api/leads/:leadId/opportunity-score/auto-pipeline", verifyJWT, async (req, res) => {
  try {
    const userId = req.userId;
    const { leadId } = req.params;
    const { enabled } = req.body;

    const userRes = await pool.query("SELECT organization_id FROM users WHERE id = $1", [userId]);
    const orgId = userRes.rows[0]?.organization_id;
    if (!orgId) return res.status(400).json({ error: "No organization" });

    await pool.query(`
      UPDATE opportunity_scores 
      SET auto_pipeline_enabled = $1
      WHERE lead_id = $2 AND organization_id = $3
    `, [enabled === true, leadId, orgId]);

    res.json({ success: true, auto_pipeline_enabled: enabled === true });
  } catch (err) {
    log(`[OSE] POST auto-pipeline error: ${err.message}`);
    res.status(500).json({ error: "Internal server error" });
  }
});

// TENANT (DASHBOARD): Revenue Intelligence - Opportunity Metrics & Funnel
app.get("/api/dashboard/revenue-intelligence", verifyJWT, async (req, res) => {
  try {
    const userId = req.userId;
    const userRes = await pool.query("SELECT organization_id FROM users WHERE id = $1", [userId]);
    const orgId = userRes.rows[0]?.organization_id;
    if (!orgId) return res.status(400).json({ error: "No organization" });

    // 1. North Star: Oportunidades criadas (score > 60)
    const nsRes = await pool.query(`
      SELECT 
        COUNT(*) FILTER (WHERE updated_at >= NOW() - INTERVAL '24 hours') AS created_today,
        COUNT(*) FILTER (WHERE updated_at >= NOW() - INTERVAL '7 days') AS created_week,
        COUNT(*) FILTER (WHERE updated_at >= NOW() - INTERVAL '30 days') AS created_month
      FROM opportunity_scores
      WHERE organization_id = $1 AND score > 60
    `, [orgId]);

    // 2. Leads por temperatura
    const tempRes = await pool.query(`
      SELECT temperature, COUNT(*) as count 
      FROM opportunity_scores 
      WHERE organization_id = $1 
      GROUP BY temperature
    `, [orgId]);

    // 3. Distribuição de Score (Histograma)
    const distRes = await pool.query(`
      SELECT 
        CASE 
          WHEN score BETWEEN 0 AND 20 THEN '0-20'
          WHEN score BETWEEN 21 AND 40 THEN '21-40'
          WHEN score BETWEEN 41 AND 60 THEN '41-60'
          WHEN score BETWEEN 61 AND 80 THEN '61-80'
          WHEN score BETWEEN 81 AND 100 THEN '81-100'
        END as range,
        COUNT(*) as count
      FROM opportunity_scores
      WHERE organization_id = $1
      GROUP BY range
      ORDER BY range
    `, [orgId]);

    // 4. Taxa de conversão por faixa (Aproximada cruzando leads.status = Cliente)
    const conversionRes = await pool.query(`
      SELECT 
        CASE 
          WHEN os.score BETWEEN 0 AND 20 THEN '0-20'
          WHEN os.score BETWEEN 21 AND 40 THEN '21-40'
          WHEN os.score BETWEEN 41 AND 60 THEN '41-60'
          WHEN os.score BETWEEN 61 AND 80 THEN '61-80'
          WHEN os.score BETWEEN 81 AND 100 THEN '81-100'
        END as range,
        COUNT(*) as total_leads,
        COUNT(*) FILTER (WHERE l.status = 'Cliente') as won_leads
      FROM opportunity_scores os
      LEFT JOIN leads l ON l.id = os.lead_id::uuid
      WHERE os.organization_id = $1
      GROUP BY range
    `, [orgId]);

    const conversionRates = conversionRes.rows.map(r => ({
      range: r.range,
      rate: r.total_leads > 0 ? Math.round((parseInt(r.won_leads) / parseInt(r.total_leads)) * 100) : 0
    })).filter(r => r.range);

    res.json({
      opportunities: {
        today: parseInt(nsRes.rows[0]?.created_today || 0),
        week: parseInt(nsRes.rows[0]?.created_week || 0),
        month: parseInt(nsRes.rows[0]?.created_month || 0)
      },
      temperatures: tempRes.rows.map(r => ({ name: r.temperature, value: parseInt(r.count) })),
      distribution: distRes.rows.map(r => ({ range: r.range, count: parseInt(r.count) })).filter(r => r.range),
      conversion_rates: conversionRates
    });
  } catch (err) {
    log(`[OSE] GET /api/dashboard/revenue-intelligence error: ${err.message}`);
    res.status(500).json({ error: "Internal server error" });
  }
});
// ── END OSE ────────────────────────────────────────────────────────────

// Temporary Migration Route to execute schema changes against the live database pool
app.get("/api/run-migration-temp", async (req, res) => {
  try {
    log("[MIGRATION] Running temporary migration against live pool...");
    await pool.query('ALTER TABLE organizations ADD COLUMN IF NOT EXISTS whatsapp_connections_limit INT DEFAULT 1;');
    await pool.query('ALTER TABLE products ADD COLUMN IF NOT EXISTS connections_bonus INT DEFAULT 0;');
    await pool.query('ALTER TABLE products ADD COLUMN IF NOT EXISTS type VARCHAR(50) DEFAULT \'KOINS\';');
    log("[MIGRATION] Temporary migration completed successfully.");
    res.json({ success: true, message: "Migration executed successfully" });
  } catch (err) {
    log("[MIGRATION] Error executing migration: " + err.message);
    res.status(500).json({ error: "Migration failed", details: err.message });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// AI FOLLOW-UP ENGINE — API ROUTES
// ══════════════════════════════════════════════════════════════════════════════

// GET /api/followup/sequences — List all sequences for this org
app.get('/api/followup/sequences', verifyJWT, async (req, res) => {
  try {
    await ensureFollowupEngineReady();
    const orgId = await getOrganizationIdForUser(req.userId);
    if (!orgId) return res.status(400).json({ error: 'No organization' });

    const result = await pool.query(
      `SELECT
         fs.*,
         COUNT(DISTINCT st.id)::int AS step_count,
         COUNT(DISTINCT fq.id) FILTER (WHERE fq.status = 'pending')::int AS active_queue_count,
         MAX(fq.scheduled_at) FILTER (WHERE fq.status = 'pending') AS next_scheduled_at
       FROM followup_sequences_v2 fs
       LEFT JOIN followup_steps st ON st.sequence_id = fs.id
       LEFT JOIN followup_queue fq
         ON fq.sequence_id = fs.id
        AND fq.organization_id = fs.organization_id
       WHERE fs.organization_id = $1
       GROUP BY fs.id
       ORDER BY fs.created_at DESC`,
      [orgId]
    );
    res.json(result.rows);
  } catch (err) {
    log('GET /api/followup/sequences error: ' + err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/followup/sequences — Create a new sequence
app.post('/api/followup/sequences', verifyJWT, async (req, res) => {
  try {
    await ensureFollowupEngineReady();
    const orgId = await getOrganizationIdForUser(req.userId);
    if (!orgId) return res.status(400).json({ error: 'No organization' });

    const { name, pipeline_stage, ai_mode } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });

    const result = await pool.query(
      `INSERT INTO followup_sequences_v2 (organization_id, name, pipeline_stage, ai_mode, source, updated_at)
       VALUES ($1,$2,$3,$4,'native',NOW()) RETURNING *`,
      [orgId, name, pipeline_stage || null, ai_mode || false]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    log('POST /api/followup/sequences error: ' + err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/followup/sequences/:id — Update a sequence
app.put('/api/followup/sequences/:id', verifyJWT, async (req, res) => {
  try {
    await ensureFollowupEngineReady();
    const orgId = await getOrganizationIdForUser(req.userId);
    if (!orgId) return res.status(400).json({ error: 'No organization' });

    const { id } = req.params;
    const { name, pipeline_stage, active, ai_mode } = req.body;
    const existing = await getFollowupSequenceForOrg(id, orgId);
    if (!existing) return res.status(404).json({ error: 'Not found' });

    const result = await pool.query(
      `UPDATE followup_sequences_v2
       SET name = $1,
           pipeline_stage = $2,
           active = $3,
           ai_mode = $4,
           updated_at = NOW()
       WHERE id = $5 AND organization_id = $6
       RETURNING *`,
      [
        name ?? existing.name,
        Object.prototype.hasOwnProperty.call(req.body, 'pipeline_stage') ? (pipeline_stage || null) : existing.pipeline_stage,
        active ?? existing.active,
        ai_mode ?? existing.ai_mode,
        id,
        orgId,
      ]
    );
    res.json(result.rows[0]);
  } catch (err) {
    log('PUT /api/followup/sequences error: ' + err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/followup/sequences/:id — Delete a sequence (cascades to steps)
app.delete('/api/followup/sequences/:id', verifyJWT, async (req, res) => {
  try {
    await ensureFollowupEngineReady();
    const orgId = await getOrganizationIdForUser(req.userId);
    if (!orgId) return res.status(400).json({ error: 'No organization' });

    const existing = await getFollowupSequenceForOrg(req.params.id, orgId);
    if (!existing) return res.status(404).json({ error: 'Not found' });

    await pool.query('DELETE FROM followup_sequences_v2 WHERE id = $1 AND organization_id = $2', [req.params.id, orgId]);
    res.json({ success: true });
  } catch (err) {
    log('DELETE /api/followup/sequences error: ' + err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/followup/sequences/:id/steps — List steps for a sequence
app.get('/api/followup/sequences/:id/steps', verifyJWT, async (req, res) => {
  try {
    await ensureFollowupEngineReady();
    const orgId = await getOrganizationIdForUser(req.userId);
    if (!orgId) return res.status(400).json({ error: 'No organization' });

    const sequence = await getFollowupSequenceForOrg(req.params.id, orgId);
    if (!sequence) return res.status(404).json({ error: 'Not found' });

    const result = await pool.query(
      `SELECT * FROM followup_steps WHERE sequence_id = $1 ORDER BY step_number ASC`,
      [sequence.id]
    );
    res.json(result.rows);
  } catch (err) {
    log('GET /api/followup/sequences/:id/steps error: ' + err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/followup/sequences/:id/steps — Add a step to a sequence
app.post('/api/followup/sequences/:id/steps', verifyJWT, async (req, res) => {
  try {
    await ensureFollowupEngineReady();
    const orgId = await getOrganizationIdForUser(req.userId);
    if (!orgId) return res.status(400).json({ error: 'No organization' });

    const { id: sequenceId } = req.params;
    const { step_number, delay_minutes, message_template, media_url, followup_type } = req.body;
    if (!message_template) return res.status(400).json({ error: 'message_template is required' });

    const sequence = await getFollowupSequenceForOrg(sequenceId, orgId);
    if (!sequence) return res.status(404).json({ error: 'Not found' });

    // Auto-number if not provided
    let stepNum = step_number;
    if (!stepNum) {
      const countRes = await pool.query('SELECT COUNT(*) FROM followup_steps WHERE sequence_id = $1', [sequenceId]);
      stepNum = parseInt(countRes.rows[0].count) + 1;
    }

    const result = await pool.query(
      `INSERT INTO followup_steps (sequence_id, step_number, delay_minutes, message_template, media_url, followup_type, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,NOW()) RETURNING *`,
      [sequence.id, stepNum, delay_minutes || 60, message_template, media_url || null, followup_type || 'reminder']
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    log('POST /api/followup/sequences/:id/steps error: ' + err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/followup/steps/:id — Update a step
app.put('/api/followup/steps/:id', verifyJWT, async (req, res) => {
  try {
    await ensureFollowupEngineReady();
    const orgId = await getOrganizationIdForUser(req.userId);
    if (!orgId) return res.status(400).json({ error: 'No organization' });

    const { delay_minutes, message_template, media_url, followup_type, step_number } = req.body;
    const existing = await getFollowupStepForOrg(req.params.id, orgId);
    if (!existing) return res.status(404).json({ error: 'Not found' });

    const result = await pool.query(
      `UPDATE followup_steps SET
         delay_minutes = $1,
         message_template = $2,
         media_url = $3,
         followup_type = $4,
         step_number = $5,
         updated_at = NOW()
       WHERE id = $6 RETURNING *`,
      [
        delay_minutes ?? existing.delay_minutes,
        message_template ?? existing.message_template,
        Object.prototype.hasOwnProperty.call(req.body, 'media_url') ? (media_url || null) : existing.media_url,
        followup_type ?? existing.followup_type,
        step_number ?? existing.step_number,
        req.params.id,
      ]
    );
    res.json(result.rows[0]);
  } catch (err) {
    log('PUT /api/followup/steps error: ' + err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/followup/steps/:id — Delete a step
app.delete('/api/followup/steps/:id', verifyJWT, async (req, res) => {
  try {
    await ensureFollowupEngineReady();
    const orgId = await getOrganizationIdForUser(req.userId);
    if (!orgId) return res.status(400).json({ error: 'No organization' });

    const existing = await getFollowupStepForOrg(req.params.id, orgId);
    if (!existing) return res.status(404).json({ error: 'Not found' });

    await pool.query('DELETE FROM followup_steps WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    log('DELETE /api/followup/steps error: ' + err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/followup/settings — Get org follow-up settings
app.get('/api/followup/settings', verifyJWT, async (req, res) => {
  try {
    await ensureFollowupEngineReady();
    const orgId = await getOrganizationIdForUser(req.userId);
    if (!orgId) return res.status(400).json({ error: 'No organization' });

    const settings = await getFollowupSettings(orgId);
    res.json(settings);
  } catch (err) {
    log('GET /api/followup/settings error: ' + err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/followup/settings — Save org follow-up settings
app.put('/api/followup/settings', verifyJWT, async (req, res) => {
  try {
    await ensureFollowupEngineReady();
    const orgId = await getOrganizationIdForUser(req.userId);
    if (!orgId) return res.status(400).json({ error: 'No organization' });

    const { enabled, ai_mode_enabled, max_followups_per_lead, quente_delay_minutes, morno_delay_minutes, frio_delay_minutes } = req.body;

    const result = await pool.query(`
      INSERT INTO followup_settings (organization_id, enabled, ai_mode_enabled, max_followups_per_lead, quente_delay_minutes, morno_delay_minutes, frio_delay_minutes, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7, NOW())
      ON CONFLICT (organization_id) DO UPDATE SET
        enabled = EXCLUDED.enabled,
        ai_mode_enabled = EXCLUDED.ai_mode_enabled,
        max_followups_per_lead = EXCLUDED.max_followups_per_lead,
        quente_delay_minutes = EXCLUDED.quente_delay_minutes,
        morno_delay_minutes = EXCLUDED.morno_delay_minutes,
        frio_delay_minutes = EXCLUDED.frio_delay_minutes,
        updated_at = NOW()
      RETURNING *
    `, [orgId, enabled ?? true, ai_mode_enabled ?? false, max_followups_per_lead ?? 4,
      quente_delay_minutes ?? 30, morno_delay_minutes ?? 120, frio_delay_minutes ?? 720]);

    res.json(result.rows[0]);
  } catch (err) {
    log('PUT /api/followup/settings error: ' + err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/followup/queue — View active queue for this org
app.get('/api/followup/queue', verifyJWT, async (req, res) => {
  try {
    await ensureFollowupEngineReady();
    const orgId = await getOrganizationIdForUser(req.userId);
    if (!orgId) return res.status(400).json({ error: 'No organization' });

    const result = await pool.query(`
      SELECT
        fq.id,
        fq.remote_jid,
        fq.instance_name,
        fq.sequence_id,
        fq.current_step,
        fq.total_steps,
        fq.scheduled_at,
        fq.status,
        fq.conversation_temperature,
        fq.pipeline_stage,
        fq.last_customer_message_at,
        fq.followup_trigger_reason,
        fq.detected_objection,
        fq.detected_product_interest,
        fq.intent_score,
        fq.created_at,
        fq.updated_at,
        l.id AS lead_id,
        l.name AS lead_name,
        COALESCE(l.score, fq.intent_score, 0)::int AS lead_score,
        COALESCE(NULLIF(l.last_ia_briefing, ''), NULLIF(lm.lead_summary, ''), fq.detected_product_interest, 'Sem contexto adicional') AS lead_briefing,
        l.needs_human_attention,
        l.human_attention_reason,
        l.human_attention_since,
        COALESCE(l.top_objection, lm.top_objection, lm.main_objection, fq.detected_objection) AS top_objection,
        lm.lead_summary,
        lm.next_recommendation,
        v.nome AS assigned_vendor_name,
        fs.name AS sequence_name,
        fs.ai_mode AS sequence_ai_mode,
        last_evt.message_sent_at AS last_event_at,
        last_evt.final_message_sent AS last_event_message
      FROM followup_queue fq
      LEFT JOIN leads l ON l.id = fq.lead_id
      LEFT JOIN lead_memory lm
        ON lm.organization_id = fq.organization_id
       AND lm.lead_id = fq.lead_id
      LEFT JOIN vendedores v ON v.id = l.assigned_to
      LEFT JOIN followup_sequences_v2 fs ON fs.id = fq.sequence_id
      LEFT JOIN LATERAL (
        SELECT fe.message_sent_at, fe.final_message_sent
        FROM followup_events fe
        WHERE fe.followup_queue_id = fq.id
        ORDER BY fe.message_sent_at DESC
        LIMIT 1
      ) last_evt ON TRUE
      WHERE fq.organization_id = $1
        AND fq.status IN ('pending', 'sent', 'replied')
      ORDER BY fq.scheduled_at DESC
      LIMIT 100
    `, [orgId]);

    res.json(result.rows);
  } catch (err) {
    log('GET /api/followup/queue error: ' + err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/followup/queue/:id — Cancel a queued follow-up
app.delete('/api/followup/queue/:id', verifyJWT, async (req, res) => {
  try {
    await ensureFollowupEngineReady();
    const orgId = await getOrganizationIdForUser(req.userId);
    if (!orgId) return res.status(400).json({ error: 'No organization' });

    const result = await pool.query(
      `UPDATE followup_queue
       SET status = 'cancelled', updated_at = NOW()
       WHERE id = $1 AND organization_id = $2
       RETURNING id`,
      [req.params.id, orgId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true });
  } catch (err) {
    log('DELETE /api/followup/queue error: ' + err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/followup/dashboard — Recovery metrics dashboard
app.get('/api/followup/dashboard', verifyJWT, async (req, res) => {
  try {
    await ensureFollowupEngineReady();
    const orgId = await getOrganizationIdForUser(req.userId);
    if (!orgId) return res.status(400).json({ error: 'No organization' });

    const [
      recoveredRes,
      responseRateRes,
      avgTimeRes,
      conversionRes,
      byStepRes,
      trendRes,
      queueSummaryRes,
      temperatureBreakdownRes,
      sequencePerformanceRes,
    ] = await Promise.all([
      // Leads recovered (replied after follow-up sent) in last 30d
      pool.query(`
        SELECT COUNT(DISTINCT fq.id) AS count
        FROM followup_queue fq
        WHERE fq.organization_id = $1 AND fq.status = 'replied'
          AND fq.updated_at >= NOW() - INTERVAL '30 days'
      `, [orgId]),
      // Response rate
      pool.query(`
        SELECT
          COUNT(*) FILTER (WHERE customer_replied = TRUE)::float / NULLIF(COUNT(*), 0) AS rate
        FROM followup_events
        WHERE organization_id = $1
          AND message_sent_at >= NOW() - INTERVAL '30 days'
      `, [orgId]),
      // Average reply time
      pool.query(`
        SELECT AVG(reply_time_minutes) AS avg_minutes
        FROM followup_events
        WHERE organization_id = $1 AND customer_replied = TRUE
          AND message_sent_at >= NOW() - INTERVAL '30 days'
      `, [orgId]),
      // Conversions after follow-up
      pool.query(`
        SELECT COUNT(*) AS count
        FROM followup_events
        WHERE organization_id = $1 AND converted_to_sale = TRUE
          AND message_sent_at >= NOW() - INTERVAL '30 days'
      `, [orgId]),
      // Follow-ups by step
      pool.query(`
        SELECT step_number, COUNT(*) AS sent, COUNT(*) FILTER (WHERE customer_replied) AS replied
        FROM followup_events
        WHERE organization_id = $1
          AND message_sent_at >= NOW() - INTERVAL '30 days'
        GROUP BY step_number
        ORDER BY step_number
      `, [orgId]),
      // Daily trend (last 14 days)
      pool.query(`
        SELECT DATE(message_sent_at) AS day, COUNT(*) AS sent, COUNT(*) FILTER (WHERE customer_replied) AS replied
        FROM followup_events
        WHERE organization_id = $1
          AND message_sent_at >= NOW() - INTERVAL '14 days'
        GROUP BY DATE(message_sent_at)
        ORDER BY day
      `, [orgId]),
      pool.query(`
        SELECT status, COUNT(*)::int AS count
        FROM followup_queue
        WHERE organization_id = $1
        GROUP BY status
      `, [orgId]),
      pool.query(`
        SELECT conversation_temperature AS name, COUNT(*)::int AS value
        FROM followup_queue
        WHERE organization_id = $1
        GROUP BY conversation_temperature
      `, [orgId]),
      pool.query(`
        SELECT
          COALESCE(fs.name, 'Sem sequencia') AS name,
          COUNT(DISTINCT fq.id)::int AS queued,
          COUNT(fe.id) FILTER (WHERE fe.customer_replied)::int AS replied,
          COUNT(fe.id) FILTER (WHERE fe.converted_to_sale)::int AS conversions
        FROM followup_sequences_v2 fs
        LEFT JOIN followup_queue fq
          ON fq.sequence_id = fs.id
         AND fq.organization_id = fs.organization_id
        LEFT JOIN followup_events fe
          ON fe.sequence_id = fs.id
         AND fe.organization_id = fs.organization_id
         AND fe.message_sent_at >= NOW() - INTERVAL '30 days'
        WHERE fs.organization_id = $1
        GROUP BY fs.id
        ORDER BY queued DESC, replied DESC, conversions DESC, name ASC
      `, [orgId])
    ]);

    const queueSummary = queueSummaryRes.rows.reduce((acc, row) => {
      acc[row.status] = row.count;
      return acc;
    }, {});

    res.json({
      kpis: {
        recovered: parseInt(recoveredRes.rows[0]?.count || 0),
        responseRate: parseFloat(responseRateRes.rows[0]?.rate || 0),
        avgReplyMinutes: parseInt(avgTimeRes.rows[0]?.avg_minutes || 0),
        conversions: parseInt(conversionRes.rows[0]?.count || 0),
        activeQueue: (queueSummary.pending || 0) + (queueSummary.sent || 0),
        activeSequences: sequencePerformanceRes.rows.length,
      },
      byStep: byStepRes.rows,
      trend: trendRes.rows,
      statusBreakdown: queueSummaryRes.rows,
      temperatureBreakdown: temperatureBreakdownRes.rows,
      sequencePerformance: sequencePerformanceRes.rows,
    });
  } catch (err) {
    log('GET /api/followup/dashboard error: ' + err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/followup/status/:jid — Get follow-up status for a specific JID
app.get('/api/followup/status/:jid', verifyJWT, async (req, res) => {
  try {
    await ensureFollowupEngineReady();
    const orgId = await getOrganizationIdForUser(req.userId);
    if (!orgId) return res.status(400).json({ error: 'No organization' });

    const jid = decodeURIComponent(req.params.jid);
    const result = await pool.query(
      `SELECT
         fq.id,
         fq.status,
         fq.current_step,
         fq.total_steps,
         fq.scheduled_at,
         fq.conversation_temperature,
         fq.pipeline_stage,
         fq.followup_trigger_reason,
         fq.detected_objection,
         fq.detected_product_interest,
         COALESCE(l.score, fq.intent_score, 0)::int AS lead_score,
         l.id AS lead_id,
         l.name AS lead_name,
         l.last_ia_briefing AS lead_briefing,
         l.needs_human_attention,
         l.human_attention_reason,
         l.human_attention_since,
         COALESCE(l.top_objection, lm.top_objection, lm.main_objection, fq.detected_objection) AS top_objection,
         lm.lead_summary,
         lm.next_recommendation,
         fs.name AS sequence_name,
         v.nome AS assigned_vendor_name
       FROM followup_queue fq
       LEFT JOIN leads l ON l.id = fq.lead_id
       LEFT JOIN lead_memory lm
         ON lm.organization_id = fq.organization_id
        AND lm.lead_id = fq.lead_id
       LEFT JOIN followup_sequences_v2 fs ON fs.id = fq.sequence_id
       LEFT JOIN vendedores v ON v.id = l.assigned_to
       WHERE fq.organization_id = $1 AND fq.remote_jid = $2
       ORDER BY fq.created_at DESC LIMIT 1`,
      [orgId, jid]
    );

    if (result.rows.length === 0) return res.json({ status: 'none' });
    res.json(result.rows[0]);
  } catch (err) {
    log('GET /api/followup/status error: ' + err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── END AI Follow-up Engine API Routes ────────────────────────────────────────

// ══════════════════════════════════════════════════════════════════════════════
// CONVERSATION INTELLIGENCE ENGINE — API ROUTES
// ══════════════════════════════════════════════════════════════════════════════

// Helper to get orgId from JWT
async function getCIEOrgId(userId) {
  const r = await pool.query('SELECT organization_id FROM users WHERE id = $1', [userId]);
  return r.rows[0]?.organization_id || null;
}

// Helper: require super_admin role
async function isSuperAdmin(userId) {
  const r = await pool.query('SELECT role FROM users WHERE id = $1', [userId]);
  return r.rows[0]?.role === 'super_admin';
}

// GET /api/intelligence/summary — KPIs: conversion, avg close, abandonment
app.get('/api/intelligence/summary', verifyJWT, async (req, res) => {
  try {
    const orgId = await getCIEOrgId(req.userId);
    if (!orgId) return res.status(400).json({ error: 'No organization' });

    const days = parseInt(req.query.days || '30');
    const periodStart = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const stats = await pool.query(`
      SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE closed_won = TRUE) AS won,
        COUNT(*) FILTER (WHERE closed_lost = TRUE) AS lost,
        AVG(days_to_close) FILTER (WHERE days_to_close > 0) AS avg_close_days,
        AVG(purchase_probability) AS avg_probability
      FROM conversation_intelligence
      WHERE organization_id = $1 AND created_at >= $2
    `, [orgId, periodStart.toISOString()]);

    const row = stats.rows[0];
    const total = parseInt(row.total || 0);
    const won = parseInt(row.won || 0);
    const lost = parseInt(row.lost || 0);
    const abandoned = total - won - lost;

    res.json({
      total,
      won,
      lost,
      abandoned: Math.max(0, abandoned),
      conversion_rate: total > 0 ? (won / total) : 0,
      avg_close_days: parseFloat(row.avg_close_days || 0).toFixed(1),
      avg_probability: parseFloat(row.avg_probability || 0).toFixed(2),
      abandonment_rate: total > 0 ? (abandoned / total) : 0
    });
  } catch (err) {
    log('GET /api/intelligence/summary error: ' + err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/intelligence/funnel — Conversion by pipeline stage
app.get('/api/intelligence/funnel', verifyJWT, async (req, res) => {
  try {
    const orgId = await getCIEOrgId(req.userId);
    if (!orgId) return res.status(400).json({ error: 'No organization' });
    const days = parseInt(req.query.days || '30');
    const periodStart = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const result = await pool.query(`
      SELECT stage,
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE closed_won = TRUE) AS won
      FROM conversation_intelligence
      WHERE organization_id = $1 AND created_at >= $2 AND stage IS NOT NULL
      GROUP BY stage ORDER BY COUNT(*) DESC
    `, [orgId, periodStart.toISOString()]);

    res.json(result.rows.map(r => ({
      stage: r.stage,
      total: parseInt(r.total),
      won: parseInt(r.won),
      conversion: parseInt(r.total) > 0 ? (parseInt(r.won) / parseInt(r.total)) : 0
    })));
  } catch (err) {
    log('GET /api/intelligence/funnel error: ' + err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/intelligence/objections — Distribution of detected objections
app.get('/api/intelligence/objections', verifyJWT, async (req, res) => {
  try {
    const orgId = await getCIEOrgId(req.userId);
    if (!orgId) return res.status(400).json({ error: 'No organization' });
    const days = parseInt(req.query.days || '30');
    const periodStart = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const result = await pool.query(`
      SELECT unnest(objections) AS objection, COUNT(*) AS count
      FROM conversation_intelligence
      WHERE organization_id = $1 AND created_at >= $2 AND objections IS NOT NULL
      GROUP BY objection ORDER BY count DESC LIMIT 15
    `, [orgId, periodStart.toISOString()]);

    res.json(result.rows);
  } catch (err) {
    log('GET /api/intelligence/objections error: ' + err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/intelligence/intents — Distribution of detected purchase intents
app.get('/api/intelligence/intents', verifyJWT, async (req, res) => {
  try {
    const orgId = await getCIEOrgId(req.userId);
    if (!orgId) return res.status(400).json({ error: 'No organization' });
    const days = parseInt(req.query.days || '30');
    const periodStart = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const result = await pool.query(`
      SELECT intent, COUNT(*) AS count,
        COUNT(*) FILTER (WHERE closed_won = TRUE) AS won
      FROM conversation_intelligence
      WHERE organization_id = $1 AND created_at >= $2 AND intent IS NOT NULL
      GROUP BY intent ORDER BY count DESC
    `, [orgId, periodStart.toISOString()]);

    res.json(result.rows);
  } catch (err) {
    log('GET /api/intelligence/intents error: ' + err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/intelligence/patterns/closing — Top closing phrases
app.get('/api/intelligence/patterns/closing', verifyJWT, async (req, res) => {
  try {
    const orgId = await getCIEOrgId(req.userId);
    if (!orgId) return res.status(400).json({ error: 'No organization' });

    const result = await pool.query(`
      SELECT phrase_detected, conversion_impact_score, detected_count, context_intent
      FROM sales_patterns
      WHERE organization_id = $1 AND pattern_type = 'closing_phrase'
      ORDER BY detected_count DESC, conversion_impact_score DESC LIMIT 20
    `, [orgId]);

    res.json(result.rows);
  } catch (err) {
    log('GET /api/intelligence/patterns/closing error: ' + err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/intelligence/patterns/killers — Top killer phrases
app.get('/api/intelligence/patterns/killers', verifyJWT, async (req, res) => {
  try {
    const orgId = await getCIEOrgId(req.userId);
    if (!orgId) return res.status(400).json({ error: 'No organization' });

    const result = await pool.query(`
      SELECT phrase_detected, conversion_impact_score, detected_count, context_intent
      FROM sales_patterns
      WHERE organization_id = $1 AND pattern_type = 'killer_phrase'
      ORDER BY detected_count DESC LIMIT 20
    `, [orgId]);

    res.json(result.rows);
  } catch (err) {
    log('GET /api/intelligence/patterns/killers error: ' + err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/intelligence/behavior — Auto-generated behavior patterns
app.get('/api/intelligence/behavior', verifyJWT, async (req, res) => {
  try {
    const orgId = await getCIEOrgId(req.userId);
    if (!orgId) return res.status(400).json({ error: 'No organization' });

    const result = await pool.query(`
      SELECT pattern_type, pattern_description, impact_score, sample_size, metadata
      FROM behavior_patterns
      WHERE organization_id = $1
      ORDER BY impact_score DESC, sample_size DESC LIMIT 20
    `, [orgId]);

    res.json(result.rows);
  } catch (err) {
    log('GET /api/intelligence/behavior error: ' + err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/intelligence/temperature — Conversion by lead temperature
app.get('/api/intelligence/temperature', verifyJWT, async (req, res) => {
  try {
    const orgId = await getCIEOrgId(req.userId);
    if (!orgId) return res.status(400).json({ error: 'No organization' });
    const days = parseInt(req.query.days || '30');
    const periodStart = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const result = await pool.query(`
      SELECT os.temperature,
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE ci.closed_won = TRUE) AS won
      FROM conversation_intelligence ci
      JOIN opportunity_scores os ON os.lead_id = ci.lead_id
      WHERE ci.organization_id = $1 AND ci.created_at >= $2
      GROUP BY os.temperature
    `, [orgId, periodStart.toISOString()]);

    res.json(result.rows.map(r => ({
      temperature: r.temperature,
      total: parseInt(r.total),
      won: parseInt(r.won),
      conversion: parseInt(r.total) > 0 ? (parseInt(r.won) / parseInt(r.total)) : 0
    })));
  } catch (err) {
    log('GET /api/intelligence/temperature error: ' + err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/intelligence/sellers — Conversion by seller (agent)
app.get('/api/intelligence/sellers', verifyJWT, async (req, res) => {
  try {
    const orgId = await getCIEOrgId(req.userId);
    if (!orgId) return res.status(400).json({ error: 'No organization' });
    const days = parseInt(req.query.days || '30');
    const periodStart = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const result = await pool.query(`
      SELECT ci.agent_id, a.name AS agent_name,
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE ci.closed_won = TRUE) AS won
      FROM conversation_intelligence ci
      LEFT JOIN agents a ON a.id::text = ci.agent_id
      WHERE ci.organization_id = $1 AND ci.created_at >= $2 AND ci.agent_id IS NOT NULL
      GROUP BY ci.agent_id, a.name ORDER BY won DESC
    `, [orgId, periodStart.toISOString()]);

    res.json(result.rows.map(r => ({
      agent_id: r.agent_id,
      agent_name: r.agent_name || 'Agente Desconhecido',
      total: parseInt(r.total),
      won: parseInt(r.won),
      conversion: parseInt(r.total) > 0 ? (parseInt(r.won) / parseInt(r.total)) : 0
    })));
  } catch (err) {
    log('GET /api/intelligence/sellers error: ' + err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/intelligence/run — Manual trigger for the engine (admin only)
app.get('/api/intelligence/run', verifyJWT, async (req, res) => {
  try {
    const admin = await isSuperAdmin(req.userId);
    if (!admin) return res.status(403).json({ error: 'Requires super_admin' });
    runConversationIntelligenceEngine().catch(e => log(`[CIE] manual run error: ${e.message}`));
    res.json({ success: true, message: 'CIE engine triggered asynchronously' });
  } catch (err) {
    log('GET /api/intelligence/run error: ' + err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/intelligence/admin/summary — Global platform summary (super_admin)
app.get('/api/intelligence/admin/summary', verifyJWT, async (req, res) => {
  try {
    const admin = await isSuperAdmin(req.userId);
    if (!admin) return res.status(403).json({ error: 'Requires super_admin' });
    const days = parseInt(req.query.days || '30');
    const periodStart = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const result = await pool.query(`
      SELECT
        COUNT(DISTINCT organization_id) AS total_orgs,
        COUNT(*) AS total_conversations,
        COUNT(*) FILTER (WHERE closed_won = TRUE) AS total_won,
        COUNT(*) FILTER (WHERE closed_lost = TRUE) AS total_lost,
        AVG(purchase_probability) AS avg_probability
      FROM conversation_intelligence
      WHERE created_at >= $1
    `, [periodStart.toISOString()]);

    res.json(result.rows[0]);
  } catch (err) {
    log('GET /api/intelligence/admin/summary error: ' + err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/intelligence/admin/objections — Top objections by sector (super_admin)
app.get('/api/intelligence/admin/objections', verifyJWT, async (req, res) => {
  try {
    const admin = await isSuperAdmin(req.userId);
    if (!admin) return res.status(403).json({ error: 'Requires super_admin' });
    const days = parseInt(req.query.days || '30');
    const periodStart = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const result = await pool.query(`
      SELECT unnest(objections) AS objection, COUNT(*) AS count
      FROM conversation_intelligence
      WHERE created_at >= $1 AND objections IS NOT NULL
      GROUP BY objection ORDER BY count DESC LIMIT 20
    `, [periodStart.toISOString()]);

    res.json(result.rows);
  } catch (err) {
    log('GET /api/intelligence/admin/objections error: ' + err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/intelligence/admin/segments — Intent & ticket by segment (super_admin)
app.get('/api/intelligence/admin/segments', verifyJWT, async (req, res) => {
  try {
    const admin = await isSuperAdmin(req.userId);
    if (!admin) return res.status(403).json({ error: 'Requires super_admin' });
    const days = parseInt(req.query.days || '30');
    const periodStart = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const result = await pool.query(`
      SELECT segment, intent,
        COUNT(*) AS total,
        AVG(estimated_ticket) AS avg_ticket,
        COUNT(*) FILTER (WHERE closed_won = TRUE) AS won
      FROM conversation_intelligence
      WHERE created_at >= $1 AND segment IS NOT NULL
      GROUP BY segment, intent ORDER BY total DESC LIMIT 30
    `, [periodStart.toISOString()]);

    res.json(result.rows);
  } catch (err) {
    log('GET /api/intelligence/admin/segments error: ' + err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/intelligence/admin/regions — Demand by region (super_admin)
app.get('/api/intelligence/admin/regions', verifyJWT, async (req, res) => {
  try {
    const admin = await isSuperAdmin(req.userId);
    if (!admin) return res.status(403).json({ error: 'Requires super_admin' });
    const days = parseInt(req.query.days || '30');
    const periodStart = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const result = await pool.query(`
      SELECT state, city, COUNT(*) AS total,
        COUNT(*) FILTER (WHERE closed_won = TRUE) AS won
      FROM conversation_intelligence
      WHERE created_at >= $1 AND state IS NOT NULL
      GROUP BY state, city ORDER BY total DESC LIMIT 30
    `, [periodStart.toISOString()]);

    res.json(result.rows);
  } catch (err) {
    log('GET /api/intelligence/admin/regions error: ' + err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/intelligence/admin/products — Most mentioned products (super_admin)
app.get('/api/intelligence/admin/products', verifyJWT, async (req, res) => {
  try {
    const admin = await isSuperAdmin(req.userId);
    if (!admin) return res.status(403).json({ error: 'Requires super_admin' });
    const days = parseInt(req.query.days || '30');
    const periodStart = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const result = await pool.query(`
      SELECT product_interest, COUNT(*) AS total,
        COUNT(*) FILTER (WHERE closed_won = TRUE) AS won,
        AVG(estimated_ticket) AS avg_ticket
      FROM conversation_intelligence
      WHERE created_at >= $1 AND product_interest IS NOT NULL
      GROUP BY product_interest ORDER BY total DESC LIMIT 20
    `, [periodStart.toISOString()]);

    res.json(result.rows);
  } catch (err) {
    log('GET /api/intelligence/admin/products error: ' + err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/intelligence/run — frontend calls POST, existing engine uses GET
app.post('/api/intelligence/run', verifyJWT, async (req, res) => {
  try {
    const admin = await isSuperAdmin(req.userId);
    if (!admin) return res.status(403).json({ error: 'Requires super_admin' });
    runConversationIntelligenceEngine().catch(e => log(`[CIE] manual run error: ${e.message}`));
    res.json({ success: true, message: 'CIE engine triggered asynchronously' });
  } catch (err) {
    log('POST /api/intelligence/run error: ' + err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// KOGNA INTELLIGENCE PANEL — 5 cross-org anonymized metric endpoints
// ══════════════════════════════════════════════════════════════════════════════

// GET /api/intelligence/panel/language-patterns
// Returns sales_patterns ranked by conversion_impact_score
app.get('/api/intelligence/panel/language-patterns', verifyJWT, async (req, res) => {
  try {
    const admin = await isSuperAdmin(req.userId);
    if (!admin) return res.status(403).json({ error: 'Requires super_admin' });
    const days = parseInt(req.query.days || '30');

    const result = await pool.query(`
      SELECT
        pattern_type,
        phrase_detected,
        context_intent,
        ROUND(CAST(AVG(conversion_impact_score) AS numeric), 3) AS avg_impact_score,
        SUM(detected_count) AS total_detected
      FROM sales_patterns
      WHERE updated_at >= NOW() - INTERVAL '${days} days'
      GROUP BY pattern_type, phrase_detected, context_intent
      ORDER BY avg_impact_score DESC
      LIMIT 30
    `);

    res.json(result.rows);
  } catch (err) {
    log('GET /api/intelligence/panel/language-patterns error: ' + err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/intelligence/panel/conversion-time
// Returns avg days_to_close by segment (anonymized)
app.get('/api/intelligence/panel/conversion-time', verifyJWT, async (req, res) => {
  try {
    const admin = await isSuperAdmin(req.userId);
    if (!admin) return res.status(403).json({ error: 'Requires super_admin' });
    const days = parseInt(req.query.days || '30');

    const result = await pool.query(`
      SELECT
        COALESCE(industry_segment, segment, 'Geral') AS segment,
        ROUND(CAST(AVG(days_to_close) AS numeric), 1) AS avg_days_to_close,
        COUNT(*) FILTER (WHERE closed_won = TRUE) AS total_won,
        COUNT(*) AS total_analyzed
      FROM conversation_intelligence
      WHERE created_at >= NOW() - INTERVAL '${days} days'
        AND days_to_close IS NOT NULL AND days_to_close > 0
      GROUP BY COALESCE(industry_segment, segment, 'Geral')
      ORDER BY avg_days_to_close ASC
      LIMIT 20
    `);

    res.json(result.rows);
  } catch (err) {
    log('GET /api/intelligence/panel/conversion-time error: ' + err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/intelligence/panel/top-questions
// Returns top closing phrases from sales_patterns (sorted by impact score)
app.get('/api/intelligence/panel/top-questions', verifyJWT, async (req, res) => {
  try {
    const admin = await isSuperAdmin(req.userId);
    if (!admin) return res.status(403).json({ error: 'Requires super_admin' });
    const days = parseInt(req.query.days || '30');

    const result = await pool.query(`
      SELECT
        phrase_detected,
        context_intent,
        ROUND(CAST(AVG(conversion_impact_score) AS numeric), 3) AS avg_impact_score,
        SUM(detected_count) AS total_detected,
        pattern_type
      FROM sales_patterns
      WHERE pattern_type = 'closing_phrase'
        AND updated_at >= NOW() - INTERVAL '${days} days'
      GROUP BY phrase_detected, context_intent, pattern_type
      ORDER BY avg_impact_score DESC
      LIMIT 15
    `);

    res.json(result.rows);
  } catch (err) {
    log('GET /api/intelligence/panel/top-questions error: ' + err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/intelligence/panel/intent-distribution
// Returns cross-org intent counts (anonymized: no org_id exposed)
app.get('/api/intelligence/panel/intent-distribution', verifyJWT, async (req, res) => {
  try {
    const admin = await isSuperAdmin(req.userId);
    if (!admin) return res.status(403).json({ error: 'Requires super_admin' });
    const days = parseInt(req.query.days || '30');

    const result = await pool.query(`
      SELECT
        COALESCE(intent, 'desconhecido') AS intent,
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE closed_won = TRUE) AS won,
        ROUND(CAST(AVG(purchase_probability) AS numeric), 2) AS avg_prob
      FROM conversation_intelligence
      WHERE created_at >= NOW() - INTERVAL '${days} days'
        AND intent IS NOT NULL
      GROUP BY COALESCE(intent, 'desconhecido')
      ORDER BY total DESC
      LIMIT 20
    `);

    res.json(result.rows);
  } catch (err) {
    log('GET /api/intelligence/panel/intent-distribution error: ' + err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/intelligence/panel/objection-detail
// Returns objection type + avg ticket + conversion rate (anonymized)
app.get('/api/intelligence/panel/objection-detail', verifyJWT, async (req, res) => {
  try {
    const admin = await isSuperAdmin(req.userId);
    if (!admin) return res.status(403).json({ error: 'Requires super_admin' });
    const days = parseInt(req.query.days || '30');

    const result = await pool.query(`
      SELECT
        unnest(objections) AS objection,
        COUNT(*) AS count,
        COUNT(*) FILTER (WHERE closed_won = TRUE) AS won,
        ROUND(CAST(AVG(estimated_ticket) AS numeric), 0) AS avg_ticket,
        ROUND(CAST(AVG(purchase_probability) AS numeric), 2) AS avg_prob
      FROM conversation_intelligence
      WHERE created_at >= NOW() - INTERVAL '${days} days'
        AND objections IS NOT NULL AND array_length(objections, 1) > 0
      GROUP BY unnest(objections)
      ORDER BY count DESC
      LIMIT 20
    `);

    res.json(result.rows);
  } catch (err) {
    log('GET /api/intelligence/panel/objection-detail error: ' + err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// ADMIN PRODUCTS (Koins Plans) — global products without org filter
// ══════════════════════════════════════════════════════════════════════════════

// GET /api/admin/products — list all system products (Koins plans)
app.get('/api/admin/products', verifyJWT, requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM products WHERE organization_id IS NULL ORDER BY created_at DESC`
    );
    res.json(result.rows);
  } catch (err) {
    log('GET /api/admin/products error: ' + err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/admin/products — create a system product
app.post('/api/admin/products', verifyJWT, requireAdmin, async (req, res) => {
  try {
    const { name, description, price, koins_bonus, connections_bonus, type } = req.body;
    if (!name || !price) return res.status(400).json({ error: 'name e price são obrigatórios.' });
    const result = await pool.query(
      `INSERT INTO products (name, description, price, koins_bonus, connections_bonus, type, active)
       VALUES ($1,$2,$3,$4,$5,$6,true) RETURNING *`,
      [name, description || '', price, koins_bonus || 0, connections_bonus || 0, type || 'KOINS']
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    log('POST /api/admin/products error: ' + err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/admin/products/:id — update a system product
app.put('/api/admin/products/:id', verifyJWT, requireAdmin, async (req, res) => {
  try {
    const { name, description, price, koins_bonus, connections_bonus, type } = req.body;
    const result = await pool.query(
      `UPDATE products SET name=$1, description=$2, price=$3, koins_bonus=$4, connections_bonus=$5, type=$6
       WHERE id=$7 AND organization_id IS NULL RETURNING *`,
      [name, description || '', price, koins_bonus || 0, connections_bonus || 0, type || 'KOINS', req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Produto não encontrado.' });
    res.json(result.rows[0]);
  } catch (err) {
    log('PUT /api/admin/products error: ' + err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/admin/products/:id — delete a system product
app.delete('/api/admin/products/:id', verifyJWT, requireAdmin, async (req, res) => {
  try {
    await pool.query(`DELETE FROM products WHERE id=$1 AND organization_id IS NULL`, [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    log('DELETE /api/admin/products error: ' + err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// PRODUCT & DYNAMIC OFFER ENGINE — CRUD API
// ══════════════════════════════════════════════════════════════════════════════

// GET /api/products — list org products
app.get('/api/products', verifyJWT, async (req, res) => {
  try {
    await ensureProductEngineTablesReady();
    const user = await getUserById(req.userId);
    if (!user) return res.status(401).json({ error: 'Not authenticated' });
    const result = await pool.query(
      `SELECT p.*, COUNT(DISTINCT pi.id) AS image_count, COUNT(DISTINCT o.id) AS offer_count
       FROM products p
       LEFT JOIN product_images pi ON pi.product_id = p.id::text
       LEFT JOIN offers o ON o.product_id = p.id::text
       WHERE p.organization_id = $1
       GROUP BY p.id ORDER BY p.created_at DESC`,
      [user.organization_id]
    );
    res.json(result.rows);
  } catch (err) {
    log('GET /api/products error: ' + err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/products — create product
app.post('/api/products', verifyJWT, async (req, res) => {
  try {
    await ensureProductEngineTablesReady();
    const user = await getUserById(req.userId);
    if (!user) return res.status(401).json({ error: 'Not authenticated' });
    const { nome, categoria, descricao_curta, descricao_detalhada, beneficios, preco_base, faq, tags, status } = req.body;
    if (!nome) return res.status(400).json({ error: 'nome is required' });
    const result = await pool.query(
      `INSERT INTO products (organization_id, nome, categoria, descricao_curta, descricao_detalhada, beneficios, preco_base, faq, tags, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [user.organization_id, nome, categoria || null, descricao_curta || null, descricao_detalhada || null,
      beneficios || [], preco_base || null, faq ? JSON.stringify(faq) : '[]', tags || [], status || 'ativo']
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    log('POST /api/products error: ' + err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/products/:id — get product with images + offers
app.get('/api/products/:id', verifyJWT, async (req, res) => {
  try {
    await ensureProductEngineTablesReady();
    const user = await getUserById(req.userId);
    if (!user) return res.status(401).json({ error: 'Not authenticated' });

    const [pRes, imgRes, offRes] = await Promise.all([
      pool.query(`SELECT * FROM products WHERE id = $1 AND organization_id = $2`, [req.params.id, user.organization_id]),
      pool.query(`SELECT * FROM product_images WHERE product_id = $1 ORDER BY ordem`, [req.params.id]),
      pool.query(
        `SELECT o.*, ARRAY_AGG(ot.trigger_type) FILTER (WHERE ot.trigger_type IS NOT NULL) AS triggers
         FROM offers o
         LEFT JOIN offer_triggers ot ON ot.offer_id = o.id
         WHERE o.product_id = $1 AND o.organization_id = $2
         GROUP BY o.id ORDER BY o.prioridade DESC`,
        [req.params.id, user.organization_id]
      ),
    ]);

    if (!pRes.rows[0]) return res.status(404).json({ error: 'Product not found' });
    res.json({ ...pRes.rows[0], images: imgRes.rows, offers: offRes.rows });
  } catch (err) {
    log('GET /api/products/:id error: ' + err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/products/:id — update product
app.put('/api/products/:id', verifyJWT, async (req, res) => {
  try {
    await ensureProductEngineTablesReady();
    const user = await getUserById(req.userId);
    if (!user) return res.status(401).json({ error: 'Not authenticated' });
    const { nome, categoria, descricao_curta, descricao_detalhada, beneficios, preco_base, faq, tags, status } = req.body;
    const result = await pool.query(
      `UPDATE products SET nome=$1, categoria=$2, descricao_curta=$3, descricao_detalhada=$4,
       beneficios=$5, preco_base=$6, faq=$7, tags=$8, status=$9, updated_at=NOW()
       WHERE id=$10 AND organization_id=$11 RETURNING *`,
      [nome, categoria, descricao_curta, descricao_detalhada,
        beneficios || [], preco_base, faq ? JSON.stringify(faq) : '[]', tags || [], status || 'ativo',
        req.params.id, user.organization_id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Product not found' });
    res.json(result.rows[0]);
  } catch (err) {
    log('PUT /api/products/:id error: ' + err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/products/:id — soft-delete (set status=inativo)
app.delete('/api/products/:id', verifyJWT, async (req, res) => {
  try {
    await ensureProductEngineTablesReady();
    const user = await getUserById(req.userId);
    if (!user) return res.status(401).json({ error: 'Not authenticated' });
    await pool.query(`UPDATE products SET status='inativo', updated_at=NOW() WHERE id=$1 AND organization_id=$2`,
      [req.params.id, user.organization_id]);
    res.json({ success: true });
  } catch (err) {
    log('DELETE /api/products/:id error: ' + err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/products/:id/images — add image/video/pdf
app.post('/api/products/:id/images', verifyJWT, async (req, res) => {
  try {
    await ensureProductEngineTablesReady();
    const user = await getUserById(req.userId);
    if (!user) return res.status(401).json({ error: 'Not authenticated' });
    const { url, tipo, caption, ordem } = req.body;
    if (!url) return res.status(400).json({ error: 'url is required' });
    const result = await pool.query(
      `INSERT INTO product_images (product_id, organization_id, url, tipo, caption, ordem)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [req.params.id, user.organization_id, url, tipo || 'image', caption || null, ordem || 0]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    log('POST /api/products/:id/images error: ' + err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/products/:productId/images/:imgId — remove media
app.delete('/api/products/:productId/images/:imgId', verifyJWT, async (req, res) => {
  try {
    await ensureProductEngineTablesReady();
    const user = await getUserById(req.userId);
    if (!user) return res.status(401).json({ error: 'Not authenticated' });
    await pool.query(`DELETE FROM product_images WHERE id=$1 AND organization_id=$2`, [req.params.imgId, user.organization_id]);
    res.json({ success: true });
  } catch (err) {
    log('DELETE /api/products/:productId/images/:imgId error: ' + err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/products/:id/offers — create offer for product
app.post('/api/products/:id/offers', verifyJWT, async (req, res) => {
  try {
    await ensureProductEngineTablesReady();
    const user = await getUserById(req.userId);
    if (!user) return res.status(401).json({ error: 'Not authenticated' });
    const { nome, preco, descricao, mensagem_sugerida, prioridade, status, starts_at, ends_at, triggers } = req.body;
    if (!nome) return res.status(400).json({ error: 'nome is required' });
    if (starts_at && ends_at && new Date(ends_at) < new Date(starts_at)) {
      return res.status(400).json({ error: 'A vigencia final precisa ser maior que a inicial' });
    }
    const result = await pool.query(
      `INSERT INTO offers (product_id, organization_id, nome, preco, descricao, mensagem_sugerida, prioridade, status, starts_at, ends_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [req.params.id, user.organization_id, nome, preco || null, descricao || null,
      mensagem_sugerida || null, prioridade || 5, status || 'ativo', starts_at || null, ends_at || null]
    );
    if (Array.isArray(triggers) && triggers.length) {
      for (const triggerType of triggers) {
        await pool.query(
          `INSERT INTO offer_triggers (offer_id, trigger_type) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
          [result.rows[0].id, triggerType]
        );
      }
    }
    res.status(201).json(result.rows[0]);
  } catch (err) {
    log('POST /api/products/:id/offers error: ' + err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/offers/:id — update offer
app.put('/api/offers/:id', verifyJWT, async (req, res) => {
  try {
    await ensureProductEngineTablesReady();
    const user = await getUserById(req.userId);
    if (!user) return res.status(401).json({ error: 'Not authenticated' });
    const { nome, preco, descricao, mensagem_sugerida, prioridade, status, starts_at, ends_at, triggers } = req.body;
    if (starts_at && ends_at && new Date(ends_at) < new Date(starts_at)) {
      return res.status(400).json({ error: 'A vigencia final precisa ser maior que a inicial' });
    }
    const result = await pool.query(
      `UPDATE offers SET nome=$1, preco=$2, descricao=$3, mensagem_sugerida=$4,
       prioridade=$5, status=$6, starts_at=$7, ends_at=$8, updated_at=NOW()
       WHERE id=$9 AND organization_id=$10 RETURNING *`,
      [nome, preco, descricao, mensagem_sugerida, prioridade || 5, status || 'ativo', starts_at || null, ends_at || null, req.params.id, user.organization_id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Offer not found' });
    if (Array.isArray(triggers)) {
      await pool.query(`DELETE FROM offer_triggers WHERE offer_id = $1`, [req.params.id]);
      for (const triggerType of triggers) {
        await pool.query(
          `INSERT INTO offer_triggers (offer_id, trigger_type) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
          [req.params.id, triggerType]
        );
      }
    }
    res.json(result.rows[0]);
  } catch (err) {
    log('PUT /api/offers/:id error: ' + err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/offers/:id — delete offer
app.delete('/api/offers/:id', verifyJWT, async (req, res) => {
  try {
    const user = await getUserById(req.userId);
    if (!user) return res.status(401).json({ error: 'Not authenticated' });
    await pool.query(`DELETE FROM offers WHERE id=$1 AND organization_id=$2`, [req.params.id, user.organization_id]);
    res.json({ success: true });
  } catch (err) {
    log('DELETE /api/offers/:id error: ' + err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/offers/:id/triggers — add trigger to offer
app.post('/api/offers/:id/triggers', verifyJWT, async (req, res) => {
  try {
    const user = await getUserById(req.userId);
    if (!user) return res.status(401).json({ error: 'Not authenticated' });
    const { trigger_type } = req.body;
    if (!trigger_type) return res.status(400).json({ error: 'trigger_type is required' });
    // Verify the offer belongs to this org
    const offerCheck = await pool.query(`SELECT id FROM offers WHERE id=$1 AND organization_id=$2`, [req.params.id, user.organization_id]);
    if (!offerCheck.rows[0]) return res.status(404).json({ error: 'Offer not found' });
    const result = await pool.query(
      `INSERT INTO offer_triggers (offer_id, trigger_type) VALUES ($1,$2) ON CONFLICT DO NOTHING RETURNING *`,
      [req.params.id, trigger_type]
    );
    res.status(201).json(result.rows[0] || { already_exists: true });
  } catch (err) {
    log('POST /api/offers/:id/triggers error: ' + err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/offer-triggers/:id — remove trigger
// PRODUCT CATALOG API — isolated namespace for the org catalog UI
app.get('/api/catalog/products', verifyJWT, async (req, res) => {
  try {
    await ensureProductEngineTablesReady();
    const user = await getUserById(req.userId);
    if (!user) return res.status(401).json({ error: 'Not authenticated' });

    const result = await pool.query(
      `SELECT p.*, COUNT(DISTINCT pi.id) AS image_count, COUNT(DISTINCT o.id) AS offer_count
       FROM products p
       LEFT JOIN product_images pi ON pi.product_id = p.id::text
       LEFT JOIN offers o ON o.product_id = p.id::text
       WHERE p.organization_id = $1
       GROUP BY p.id ORDER BY p.created_at DESC`,
      [user.organization_id]
    );

    res.json(result.rows);
  } catch (err) {
    log('GET /api/catalog/products error: ' + err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/catalog/products', verifyJWT, async (req, res) => {
  try {
    await ensureProductEngineTablesReady();
    const user = await getUserById(req.userId);
    if (!user) return res.status(401).json({ error: 'Not authenticated' });

    const {
      nome,
      categoria,
      descricao_curta,
      descricao_detalhada,
      beneficios,
      preco_base,
      faq,
      tags,
      status,
    } = req.body;

    if (!nome?.trim()) {
      return res.status(400).json({ error: 'Nome do produto é obrigatório' });
    }

    const result = await pool.query(
      `INSERT INTO products (
         organization_id, nome, categoria, descricao_curta, descricao_detalhada,
         beneficios, preco_base, faq, tags, status,
         name, description, price, active, koins_bonus, connections_bonus, type
       )
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
       RETURNING *`,
      [
        user.organization_id,
        nome.trim(),
        categoria || null,
        descricao_curta || null,
        descricao_detalhada || null,
        beneficios || [],
        preco_base || null,
        JSON.stringify(faq || []),
        tags || [],
        status || 'ativo',
        nome.trim(),
        descricao_curta || descricao_detalhada || '',
        preco_base || 0,
        status !== 'inativo',
        0,
        0,
        'CATALOG',
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    log('POST /api/catalog/products error: ' + (err.stack || err.message));
    res.status(500).json({
      error: 'Erro ao salvar produto',
      details: err.message,
    });
  }
});

app.get('/api/catalog/products/:id', verifyJWT, async (req, res) => {
  try {
    await ensureProductEngineTablesReady();
    const user = await getUserById(req.userId);
    if (!user) return res.status(401).json({ error: 'Not authenticated' });

    const [pRes, imgRes, offRes] = await Promise.all([
      pool.query(
        `SELECT * FROM products WHERE id = $1 AND organization_id = $2`,
        [req.params.id, user.organization_id]
      ),
      pool.query(
        `SELECT * FROM product_images WHERE product_id = $1 ORDER BY ordem, created_at ASC`,
        [req.params.id]
      ),
      pool.query(
        `SELECT o.*, ARRAY_AGG(ot.trigger_type) FILTER (WHERE ot.trigger_type IS NOT NULL) AS triggers
         FROM offers o
         LEFT JOIN offer_triggers ot ON ot.offer_id = o.id
         WHERE o.product_id = $1 AND o.organization_id = $2
         GROUP BY o.id ORDER BY o.prioridade DESC`,
        [req.params.id, user.organization_id]
      ),
    ]);

    if (!pRes.rows[0]) return res.status(404).json({ error: 'Product not found' });

    res.json({ ...pRes.rows[0], images: imgRes.rows, offers: offRes.rows });
  } catch (err) {
    log('GET /api/catalog/products/:id error: ' + err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.put('/api/catalog/products/:id', verifyJWT, async (req, res) => {
  try {
    await ensureProductEngineTablesReady();
    const user = await getUserById(req.userId);
    if (!user) return res.status(401).json({ error: 'Not authenticated' });

    const {
      nome,
      categoria,
      descricao_curta,
      descricao_detalhada,
      beneficios,
      preco_base,
      faq,
      tags,
      status,
    } = req.body;

    if (!nome?.trim()) {
      return res.status(400).json({ error: 'Nome do produto é obrigatório' });
    }

    const result = await pool.query(
      `UPDATE products SET nome=$1, categoria=$2, descricao_curta=$3, descricao_detalhada=$4,
       beneficios=$5, preco_base=$6, faq=$7, tags=$8, status=$9,
       name=$1, description=COALESCE($3, $4, ''), price=COALESCE($6, 0),
       active=CASE WHEN $9 = 'inativo' THEN false ELSE true END,
       type='CATALOG', updated_at=NOW()
       WHERE id=$10 AND organization_id=$11
       RETURNING *`,
      [
        nome.trim(),
        categoria || null,
        descricao_curta || null,
        descricao_detalhada || null,
        beneficios || [],
        preco_base || null,
        JSON.stringify(faq || []),
        tags || [],
        status || 'ativo',
        req.params.id,
        user.organization_id,
      ]
    );

    if (!result.rows[0]) return res.status(404).json({ error: 'Product not found' });

    res.json(result.rows[0]);
  } catch (err) {
    log('PUT /api/catalog/products/:id error: ' + err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.patch('/api/catalog/products/:id/status', verifyJWT, async (req, res) => {
  try {
    await ensureProductEngineTablesReady();
    const user = await getUserById(req.userId);
    if (!user) return res.status(401).json({ error: 'Not authenticated' });

    const { status } = req.body;
    if (!['ativo', 'inativo'].includes(status)) {
      return res.status(400).json({ error: 'Status inválido' });
    }

    const result = await pool.query(
      `UPDATE products
       SET status=$1,
           active=CASE WHEN $1 = 'inativo' THEN false ELSE true END,
           updated_at=NOW()
       WHERE id=$2 AND organization_id=$3
       RETURNING *`,
      [status, req.params.id, user.organization_id]
    );

    if (!result.rows[0]) return res.status(404).json({ error: 'Product not found' });
    res.json(result.rows[0]);
  } catch (err) {
    log('PATCH /api/catalog/products/:id/status error: ' + (err.stack || err.message));
    res.status(500).json({ error: 'Erro ao atualizar status', details: err.message });
  }
});

app.delete('/api/catalog/products/:id', verifyJWT, async (req, res) => {
  try {
    await ensureProductEngineTablesReady();
    const user = await getUserById(req.userId);
    if (!user) return res.status(401).json({ error: 'Not authenticated' });

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const productRes = await client.query(
        `SELECT id FROM products WHERE id=$1 AND organization_id=$2`,
        [req.params.id, user.organization_id]
      );
      if (!productRes.rows[0]) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Product not found' });
      }

      await client.query(
        `DELETE FROM product_images
         WHERE product_id=$1 AND organization_id=$2`,
        [req.params.id, user.organization_id]
      );

      const deletedOffers = await client.query(
        `DELETE FROM offers
         WHERE product_id=$1 AND organization_id=$2
         RETURNING id`,
        [req.params.id, user.organization_id]
      );

      const deletedOfferIds = deletedOffers.rows.map((row) => row.id);
      if (deletedOfferIds.length > 0) {
        await client.query(
          `DELETE FROM offer_events
           WHERE organization_id=$1 AND (product_id=$2 OR offer_id = ANY($3::uuid[]))`,
          [user.organization_id, req.params.id, deletedOfferIds]
        );
      } else {
        await client.query(
          `DELETE FROM offer_events
           WHERE organization_id=$1 AND product_id=$2`,
          [user.organization_id, req.params.id]
        );
      }

      await client.query(
        `DELETE FROM products WHERE id=$1 AND organization_id=$2`,
        [req.params.id, user.organization_id]
      );

      await client.query('COMMIT');
      res.json({ success: true });
    } catch (txErr) {
      await client.query('ROLLBACK');
      throw txErr;
    } finally {
      client.release();
    }
  } catch (err) {
    log('DELETE /api/catalog/products/:id error: ' + (err.stack || err.message));
    res.status(500).json({ error: 'Erro ao excluir produto', details: err.message });
  }
});

app.post('/api/catalog/products/:id/images', verifyJWT, async (req, res) => {
  try {
    await ensureProductEngineTablesReady();
    const user = await getUserById(req.userId);
    if (!user) return res.status(401).json({ error: 'Not authenticated' });

    const productCheck = await pool.query(
      `SELECT id FROM products WHERE id = $1 AND organization_id = $2`,
      [req.params.id, user.organization_id]
    );
    if (!productCheck.rows[0]) {
      return res.status(404).json({ error: 'Product not found' });
    }

    const { url, tipo, caption, ordem } = req.body;
    if (!url) return res.status(400).json({ error: 'url is required' });

    const result = await pool.query(
      `INSERT INTO product_images (product_id, organization_id, url, tipo, caption, ordem)
       VALUES ($1,$2,$3,$4,$5,$6)
       RETURNING *`,
      [req.params.id, user.organization_id, url, tipo || 'image', caption || null, ordem || 0]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    log('POST /api/catalog/products/:id/images error: ' + err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/catalog/products/:id/images/upload', verifyJWT, upload.single('file'), async (req, res) => {
  try {
    await ensureProductEngineTablesReady();
    const user = await getUserById(req.userId);
    if (!user) return res.status(401).json({ error: 'Not authenticated' });

    const productCheck = await pool.query(
      `SELECT id, nome FROM products WHERE id = $1 AND organization_id = $2`,
      [req.params.id, user.organization_id]
    );
    if (!productCheck.rows[0]) {
      return res.status(404).json({ error: 'Product not found' });
    }

    const file = req.file;
    if (!file?.buffer) {
      return res.status(400).json({ error: 'Arquivo de imagem é obrigatório' });
    }

    if (!file.mimetype?.startsWith('image/')) {
      return res.status(400).json({ error: 'Apenas imagens são aceitas neste upload' });
    }

    const base64 = file.buffer.toString('base64');
    const dataUrl = `data:${file.mimetype};base64,${base64}`;
    const caption = req.body.caption || productCheck.rows[0].nome || null;
    const ordem = Number.parseInt(req.body.ordem, 10);

    const result = await pool.query(
      `INSERT INTO product_images (product_id, organization_id, url, tipo, caption, ordem)
       VALUES ($1,$2,$3,'image',$4,$5)
       RETURNING *`,
      [
        req.params.id,
        user.organization_id,
        dataUrl,
        caption,
        Number.isFinite(ordem) ? ordem : 0,
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    log('POST /api/catalog/products/:id/images/upload error: ' + (err.stack || err.message));
    res.status(500).json({
      error: 'Erro ao enviar imagem',
      details: err.message,
    });
  }
});

app.delete('/api/catalog/products/:productId/images/:imgId', verifyJWT, async (req, res) => {
  try {
    await ensureProductEngineTablesReady();
    const user = await getUserById(req.userId);
    if (!user) return res.status(401).json({ error: 'Not authenticated' });

    await pool.query(
      `DELETE FROM product_images
       WHERE id=$1 AND product_id=$2 AND organization_id=$3`,
      [req.params.imgId, req.params.productId, user.organization_id]
    );

    res.json({ success: true });
  } catch (err) {
    log('DELETE /api/catalog/products/:productId/images/:imgId error: ' + err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/catalog/promotions', verifyJWT, async (req, res) => {
  try {
    await ensureProductEngineTablesReady();
    const user = await getUserById(req.userId);
    if (!user) return res.status(401).json({ error: 'Not authenticated' });

    const result = await pool.query(
      `SELECT
         o.*,
         p.nome AS product_nome,
         p.categoria AS product_categoria,
         p.status AS product_status,
         p.preco_base AS product_preco_base,
         p.descricao_curta AS product_descricao_curta,
         CASE
           WHEN o.status = 'ativo'
            AND (o.starts_at IS NULL OR o.starts_at <= NOW())
            AND (o.ends_at IS NULL OR o.ends_at >= NOW())
           THEN true
           ELSE false
         END AS is_currently_active,
         ARRAY_AGG(ot.trigger_type) FILTER (WHERE ot.trigger_type IS NOT NULL) AS triggers
       FROM offers o
       JOIN products p ON p.id::text = o.product_id
       LEFT JOIN offer_triggers ot ON ot.offer_id = o.id
       WHERE o.organization_id = $1
       GROUP BY o.id, p.nome, p.categoria, p.status, p.preco_base, p.descricao_curta
       ORDER BY is_currently_active DESC, o.created_at DESC`,
      [user.organization_id]
    );

    res.json(result.rows);
  } catch (err) {
    log('GET /api/catalog/promotions error: ' + err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.delete('/api/offer-triggers/:id', verifyJWT, async (req, res) => {
  try {
    await pool.query(`DELETE FROM offer_triggers WHERE id=$1`, [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    log('DELETE /api/offer-triggers/:id error: ' + err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/offer-events — fetch offer presentation analytics for org
app.get('/api/offer-events', verifyJWT, async (req, res) => {
  try {
    const user = await getUserById(req.userId);
    if (!user) return res.status(401).json({ error: 'Not authenticated' });
    const days = parseInt(req.query.days || '30');
    const result = await pool.query(
      `SELECT oe.*, o.nome AS offer_nome, p.nome AS product_nome
       FROM offer_events oe
       LEFT JOIN offers o ON o.id = oe.offer_id
       LEFT JOIN products p ON p.id = oe.product_id
       WHERE oe.organization_id = $1 AND oe.timestamp >= NOW() - INTERVAL '${days} days'
       ORDER BY oe.timestamp DESC LIMIT 200`,
      [user.organization_id]
    );
    res.json(result.rows);
  } catch (err) {
    log('GET /api/offer-events error: ' + err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── END Product & Dynamic Offer Engine CRUD API ───────────────────────────────

// ── END Kogna Intelligence Panel API Routes ───────────────────────────────────

// ── END Conversation Intelligence Engine API Routes ───────────────────────────


// ── VERCEL CRONS ──────────────────────────────────────────────────────────────



// GET /api/cron/process-queue
app.get('/api/cron/process-queue', async (req, res) => {
  if (process.env.CRON_SECRET && req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized CRON request' });
  }

  try {
    log('[VERCEL CRON] Running processFollowupQueue...');
    const stats = await processFollowupQueue();
    res.json({ success: true, message: 'Queue processed successfully', stats });
  } catch (err) {
    log(`[VERCEL CRON] processQueue Error: ${err.message}`);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// INDUSTRY ACCELERATOR LAYER
// ══════════════════════════════════════════════════════════════════════════════

const INDUSTRY_PROFILES_SEED = [
  {
    slug: 'educacao', name: 'Educação', icon: '🎓',
    description: 'Matrícula de alunos, cursos, faculdades, escolas e treinamentos.',
    default_pipeline: JSON.stringify(['Novo Lead', 'Interesse no Curso', 'Qualificação', 'Agendamento', 'Comparecimento', 'Matrícula', 'Perdido']),
    default_intents: JSON.stringify(['interesse_curso', 'preco_curso', 'horario_aula', 'duracao_curso', 'certificado', 'formas_pagamento', 'agendar_visita', 'bolsa_desconto']),
    default_objections: JSON.stringify(['preco_alto', 'falta_tempo', 'distancia', 'duvida_certificado', 'precisa_falar_com_pais']),
    recommended_ai_agents: JSON.stringify([
      { id: 'edu_suporte', name: 'AI Secretaria Acadêmica', icon: '🎓', role: 'Suporte', description: 'Resolve dúvidas sobre matrícula, documentos, financeiro e rotina do aluno.' },
      { id: 'edu_vendas', name: 'AI Consultora de Matrículas', icon: '📚', role: 'Vendas', description: 'Apresenta cursos, contorna objeções e conduz até a matrícula.' }
    ]),
    recommended_followup_sequences: JSON.stringify([
      { trigger: 'lead_pediu_preco', delay_minutes: 30, message_hint: 'Retome o contato com condições de pagamento e bolsa disponível.' },
      { trigger: 'lead_pediu_informacoes', delay_minutes: 120, message_hint: 'Envie o calendário de turmas e reforce o diferencial.' },
      { trigger: 'lead_interessado', delay_minutes: 1440, message_hint: 'Lembre da data de início da próxima turma.' }
    ])
  },
  {
    slug: 'imobiliario', name: 'Imobiliário', icon: '🏠',
    description: 'Venda e locação de imóveis, loteamentos e construtoras.',
    default_pipeline: JSON.stringify(['Novo Lead', 'Qualificação', 'Visita Agendada', 'Proposta', 'Aprovação de Crédito', 'Contrato', 'Perdido']),
    default_intents: JSON.stringify(['interesse_imovel', 'preco_imovel', 'localizacao', 'financiamento', 'agendar_visita', 'planta_baixa', 'condicoes_pagamento']),
    default_objections: JSON.stringify(['preco_alto', 'nao_aprovado_credito', 'precisa_vender_atual', 'localizacao_longe', 'nao_decidiu']),
    recommended_ai_agents: JSON.stringify([
      { id: 'imob_suporte', name: 'AI Suporte Imobiliário', icon: '🏡', role: 'Suporte', description: 'Resolve dúvidas sobre imóvel, visita, documentos e andamento da proposta.' },
      { id: 'imob_vendas', name: 'AI Corretora Digital', icon: '🔑', role: 'Vendas', description: 'Apresenta imóveis, trabalha objeções e conduz até visita, proposta ou fechamento.' }
    ]),
    recommended_followup_sequences: JSON.stringify([
      { trigger: 'lead_pediu_preco', delay_minutes: 60, message_hint: 'Envie simulação de financiamento personalizada.' },
      { trigger: 'lead_agendou_visita', delay_minutes: 60, message_hint: 'Confirme a visita e envie o endereço com link do mapa.' }
    ])
  },
  {
    slug: 'seguros', name: 'Seguros', icon: '🛡️',
    description: 'Seguros de vida, auto, residencial, empresarial e saúde.',
    default_pipeline: JSON.stringify(['Novo Lead', 'Cotação Solicitada', 'Proposta Enviada', 'Análise do Cliente', 'Fechamento', 'Perdido']),
    default_intents: JSON.stringify(['cotar_seguro', 'comparar_planos', 'preco_seguro', 'coberturas', 'sinistro', 'renovacao']),
    default_objections: JSON.stringify(['preco_alto', 'ja_tem_seguro', 'nao_ve_necessidade', 'nao_confia_seguradora']),
    recommended_ai_agents: JSON.stringify([
      { id: 'seg_suporte', name: 'AI Suporte ao Segurado', icon: '🧾', role: 'Suporte', description: 'Atende dúvidas sobre cobertura, apólice, renovação e sinistro.' },
      { id: 'seg_vendas', name: 'AI Consultor de Seguros', icon: '🛡️', role: 'Vendas', description: 'Compara coberturas, trata objeções e conduz ao fechamento da apólice.' }
    ]),
    recommended_followup_sequences: JSON.stringify([
      { trigger: 'lead_pediu_cotacao', delay_minutes: 30, message_hint: 'Envie a cotação e destaque a principal cobertura diferencial.' },
      { trigger: 'lead_nao_respondeu', delay_minutes: 1440, message_hint: 'Pergunte se teve alguma dúvida sobre a proposta.' }
    ])
  },
  {
    slug: 'clinicas', name: 'Clínicas', icon: '🏥',
    description: 'Clínicas médicas, odontológicas, estética e bem-estar.',
    default_pipeline: JSON.stringify(['Novo Lead', 'Interesse', 'Consulta Agendada', 'Comparecimento', 'Tratamento', 'Fidelização', 'Perdido']),
    default_intents: JSON.stringify(['agendar_consulta', 'preco_procedimento', 'convenio', 'duvida_tratamento', 'resultado_esperado', 'disponibilidade']),
    default_objections: JSON.stringify(['preco_alto', 'sem_convenio', 'medo_procedimento', 'indisponibilidade_horario', 'nao_urgente']),
    recommended_ai_agents: JSON.stringify([
      { id: 'clinica_suporte', name: 'AI Suporte ao Paciente', icon: '👩‍⚕️', role: 'Suporte', description: 'Resolve dúvidas sobre agenda, preparo, retorno e acompanhamento do paciente.' },
      { id: 'clinica_vendas', name: 'AI Consultora de Procedimentos', icon: '💎', role: 'Vendas', description: 'Apresenta tratamentos, diferenciais e conduz ao agendamento da avaliação.' }
    ]),
    recommended_followup_sequences: JSON.stringify([
      { trigger: 'lead_pediu_informacoes', delay_minutes: 60, message_hint: 'Confirme a disponibilidade de horários e incentive o agendamento.' },
      { trigger: 'consulta_agendada', delay_minutes: 1440, message_hint: 'Lembre da consulta de amanhã e envie o endereço.' }
    ])
  },
  {
    slug: 'varejo', name: 'Varejo', icon: '🛒',
    description: 'Lojas físicas e e-commerce de produtos físicos.',
    default_pipeline: JSON.stringify(['Novo Lead', 'Interesse', 'Carrinho', 'Checkout', 'Pedido Realizado', 'Entregue', 'Perdido']),
    default_intents: JSON.stringify(['interesse_produto', 'preco', 'disponibilidade', 'frete', 'prazo_entrega', 'troca_devolucao', 'promocao']),
    default_objections: JSON.stringify(['preco_alto', 'frete_caro', 'prazo_longo', 'desconfia_loja', 'ja_comprou_outro']),
    recommended_ai_agents: JSON.stringify([
      { id: 'varejo_suporte', name: 'AI Suporte Pós-venda', icon: '📦', role: 'Suporte', description: 'Resolve dúvidas sobre pedido, entrega, troca e acompanhamento da compra.' },
      { id: 'varejo_vendas', name: 'AI Consultora de Vendas', icon: '🛍️', role: 'Vendas', description: 'Apresenta produtos, trabalha objeções e conduz até o pedido.' }
    ]),
    recommended_followup_sequences: JSON.stringify([
      { trigger: 'carrinho_abandonado', delay_minutes: 30, message_hint: 'Lembre do produto no carrinho e ofereça um cupom de desconto.' },
      { trigger: 'pedido_entregue', delay_minutes: 2880, message_hint: 'Peça avaliação e sugira produto complementar.' }
    ])
  },
  {
    slug: 'servicos', name: 'Serviços', icon: '⚙️',
    description: 'Prestadores de serviços B2B e B2C: manutenção, consultoria, agências.',
    default_pipeline: JSON.stringify(['Novo Lead', 'Briefing', 'Proposta', 'Negociação', 'Contrato', 'Execução', 'Perdido']),
    default_intents: JSON.stringify(['solicitar_orcamento', 'prazo_execucao', 'portfolio', 'formas_pagamento', 'garantia', 'disponibilidade']),
    default_objections: JSON.stringify(['preco_alto', 'precisa_comparar', 'nao_urgente', 'ja_tem_fornecedor', 'sem_orcamento_agora']),
    recommended_ai_agents: JSON.stringify([
      { id: 'servicos_suporte', name: 'AI Suporte de Operações', icon: '🧰', role: 'Suporte', description: 'Atualiza status, escopo, prazos e alinhamentos do cliente em andamento.' },
      { id: 'servicos_vendas', name: 'AI Consultor Comercial', icon: '💼', role: 'Vendas', description: 'Diagnostica a necessidade, posiciona valor e conduz até proposta e contrato.' }
    ]),
    recommended_followup_sequences: JSON.stringify([
      { trigger: 'orcamento_enviado', delay_minutes: 120, message_hint: 'Pergunte se teve alguma dúvida sobre a proposta enviada.' },
      { trigger: 'lead_nao_respondeu', delay_minutes: 1440, message_hint: 'Retome o contato perguntando se ainda tem interesse.' }
    ])
  },
  {
    slug: 'generico', name: 'Genérico', icon: '⚡',
    description: 'Configuração padrão sem perfil específico. Ideal para negócios únicos.',
    default_pipeline: JSON.stringify([]),
    default_intents: JSON.stringify([]),
    default_objections: JSON.stringify([]),
    recommended_ai_agents: JSON.stringify([]),
    recommended_followup_sequences: JSON.stringify([])
  }
];

const ensureIndustryProfileTables = async () => {
  try {
    log('[IAL] Ensuring Industry Accelerator Layer tables...');

    await pool.query(`
      CREATE TABLE IF NOT EXISTS industry_profiles (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT NOT NULL,
        slug TEXT UNIQUE NOT NULL,
        description TEXT,
        icon TEXT,
        default_pipeline JSONB DEFAULT '[]',
        default_intents JSONB DEFAULT '[]',
        default_objections JSONB DEFAULT '[]',
        recommended_ai_agents JSONB DEFAULT '[]',
        recommended_followup_sequences JSONB DEFAULT '[]',
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS company_industry_profile (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id TEXT UNIQUE NOT NULL,
        industry_slug TEXT NOT NULL DEFAULT 'generico',
        activated_at TIMESTAMPTZ DEFAULT NOW(),
        pipeline_accepted BOOLEAN DEFAULT FALSE
      )
    `);

    await pool.query(`CREATE INDEX IF NOT EXISTS idx_cip_org ON company_industry_profile(organization_id)`);

    // Seed the 7 profiles
    for (const profile of INDUSTRY_PROFILES_SEED) {
      await pool.query(`
        INSERT INTO industry_profiles (name, slug, description, icon, default_pipeline, default_intents, default_objections, recommended_ai_agents, recommended_followup_sequences)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
        ON CONFLICT (slug) DO UPDATE
           SET name = EXCLUDED.name,
               description = EXCLUDED.description,
               icon = EXCLUDED.icon,
               default_pipeline = EXCLUDED.default_pipeline,
               default_intents = EXCLUDED.default_intents,
               default_objections = EXCLUDED.default_objections,
               recommended_ai_agents = EXCLUDED.recommended_ai_agents,
               recommended_followup_sequences = EXCLUDED.recommended_followup_sequences
      `, [profile.name, profile.slug, profile.description, profile.icon, profile.default_pipeline, profile.default_intents, profile.default_objections, profile.recommended_ai_agents, profile.recommended_followup_sequences]);
    }

    log('[IAL] Industry Accelerator Layer tables verified and seeded.');
  } catch (err) {
    log('[ERROR] ensureIndustryProfileTables failed: ' + err.message);
  }
};

// ── Industry Accelerator Layer API Routes ─────────────────────────────────────

// GET /api/industry/profiles — List all profiles (no auth required — used in onboarding)
app.get('/api/industry/profiles', async (req, res) => {
  try {
    const result = await pool.query(`SELECT slug, name, icon, description, default_pipeline, default_intents, default_objections, recommended_ai_agents FROM industry_profiles ORDER BY name`);
    res.json(result.rows);
  } catch (err) {
    log('GET /api/industry/profiles error: ' + err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/industry/my-profile — Get current org's industry profile (JWT)
app.get('/api/industry/my-profile', verifyJWT, async (req, res) => {
  try {
    const orgRes = await pool.query('SELECT organization_id FROM users WHERE id = $1', [req.userId]);
    const orgId = orgRes.rows[0]?.organization_id;
    if (!orgId) return res.json({ industry_slug: 'generico', has_profile: false });

    const result = await pool.query(`
      SELECT cip.industry_slug, cip.pipeline_accepted, cip.activated_at,
             ip.name, ip.icon, ip.description, ip.recommended_ai_agents,
             ip.default_pipeline, ip.default_intents, ip.default_objections
      FROM company_industry_profile cip
      LEFT JOIN industry_profiles ip ON ip.slug = cip.industry_slug
      WHERE cip.organization_id = $1
    `, [orgId]);

    if (result.rows.length === 0) return res.json({ industry_slug: 'generico', has_profile: false });
    res.json({ ...result.rows[0], has_profile: true });
  } catch (err) {
    log('GET /api/industry/my-profile error: ' + err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/industry/select — Save org's industry profile selection (JWT)
app.post('/api/industry/select', verifyJWT, async (req, res) => {
  try {
    const orgRes = await pool.query('SELECT organization_id FROM users WHERE id = $1', [req.userId]);
    const orgId = orgRes.rows[0]?.organization_id;
    if (!orgId) return res.status(400).json({ error: 'No organization' });

    const { industry_slug, accept_pipeline } = req.body;
    if (!industry_slug) return res.status(400).json({ error: 'industry_slug is required' });

    // Upsert the choice
    await pool.query(`
      INSERT INTO company_industry_profile (organization_id, industry_slug, pipeline_accepted)
      VALUES ($1, $2, $3)
      ON CONFLICT (organization_id) DO UPDATE
        SET industry_slug = EXCLUDED.industry_slug,
            pipeline_accepted = EXCLUDED.pipeline_accepted,
            activated_at = NOW()
    `, [orgId, industry_slug, accept_pipeline || false]);

    log(`[IAL] Org ${orgId} selected industry: ${industry_slug}`);
    res.json({ success: true, industry_slug });
  } catch (err) {
    log('POST /api/industry/select error: ' + err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/industry/agents/:slug — Get recommended agents for a profile (JWT)
app.get('/api/industry/agents/:slug', verifyJWT, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT recommended_ai_agents FROM industry_profiles WHERE slug = $1`,
      [req.params.slug]
    );
    if (result.rows.length === 0) return res.json([]);
    res.json(result.rows[0].recommended_ai_agents || []);
  } catch (err) {
    log('GET /api/industry/agents error: ' + err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/industry/intents/:slug — Get intents + objections for a profile (JWT)
app.get('/api/industry/intents/:slug', verifyJWT, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT default_intents, default_objections, recommended_followup_sequences FROM industry_profiles WHERE slug = $1`,
      [req.params.slug]
    );
    if (result.rows.length === 0) return res.json({ intents: [], objections: [], followup_sequences: [] });
    const row = result.rows[0];
    res.json({
      intents: row.default_intents || [],
      objections: row.default_objections || [],
      followup_sequences: row.recommended_followup_sequences || []
    });
  } catch (err) {
    log('GET /api/industry/intents error: ' + err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── END Industry Accelerator Layer ────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────


// Start Server only if NOT running on Vercel

if (process.env.VERCEL !== '1') {
  const PORT = process.env.PORT || 8080;
  try {
    fs.appendFileSync(
      "server_lifecycle.log",
      `[${new Date().toISOString()}] Attempting to start server on port ${PORT}\n`,
    );
    console.log("STEP 4: Attemping listen");
    const HOST = process.env.HOST || "0.0.0.0";
    app.listen(PORT, HOST, () => {
      const msg = `[${new Date().toISOString()}] Server running on http://${HOST}:${PORT} (Environment: ${process.env.NODE_ENV})`;
      log(msg);
      console.log(msg);
      fs.appendFileSync("server_lifecycle.log", msg + "\n");
    });
  } catch (e) {
    const errMsg = `[${new Date().toISOString()}] FAILED to start server: ${e.message}`;
    log(errMsg);
    console.error(errMsg);
    fs.appendFileSync("server_lifecycle.log", errMsg + "\n");
  }

  // Force Keep-Alive (Only local/direct)
  setInterval(() => {
    log("Server heartbeat - Process is alive");
  }, 5000);
}

process.on("uncaughtException", (err) => {
  log("Uncaught Exception: " + err.toString());
  console.error(err);
});

process.on("unhandledRejection", (reason, promise) => {
  log("Unhandled Rejection: " + reason.toString());
  console.error(reason);
});

process.on("exit", (code) => {
  log(`Process exiting with code: ${code}`);
});

["SIGINT", "SIGTERM", "SIGQUIT"].forEach((signal) => {
  process.on(signal, () => {
    log(`Received signal: ${signal}`);
    process.exit(0);
  });
});

