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
if (!JWT_SECRET) {
  console.error(
    "CRITICAL ERROR: JWT_SECRET not found in environment variables.",
  );
  process.exit(1);
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
  console.error(
    "CRITICAL ERROR: DATABASE_URL not found in environment variables.",
  );
  process.exit(1);
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

initPool();

// Ensure the message_buffer table exists (DB-based debounce for serverless)
const ensureMessageBuffer = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS message_buffer (
        id BIGSERIAL PRIMARY KEY,
        remote_jid TEXT NOT NULL,
        agent_id UUID NOT NULL,
        instance_name TEXT NOT NULL,
        content TEXT,
        image_url TEXT,
        is_audio BOOLEAN DEFAULT false,
        received_at TIMESTAMPTZ DEFAULT NOW(),
        processed BOOLEAN DEFAULT false
      )
    `);
    log('[BUFFER] message_buffer table ready');
  } catch (e) {
    log('[BUFFER] Error ensuring message_buffer table: ' + e.message);
  }
};
setTimeout(ensureMessageBuffer, 3000); // run after DB connection is established

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
    const decoded = jwt.verify(token, JWT_SECRET);
    req.userId = decoded.id;
    req.userRole = decoded.role;
    next();
  } catch (err) {
    return res.status(401).json({ error: "Token inválido ou expirado" });
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

    res.json({ agentId, isPaused });
  } catch (err) {
    log(`GET /api/chat-context error: ${err.message}`);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/chats/toggle-pause - Toggle AI pause
app.post("/api/chats/toggle-pause", verifyJWT, async (req, res) => {
  try {
    const { instanceName, jid, isPaused } = req.body;

    // Find agent
    const agentRes = await pool.query(
      `SELECT a.id FROM agents a
             JOIN whatsapp_instances wi ON a.whatsapp_instance_id = wi.id
             WHERE wi.instance_name = $1`,
      [instanceName],
    );

    const agentId = agentRes.rows[0]?.id;
    if (!agentId)
      return res
        .status(404)
        .json({ error: "Agent not found for this instance" });

    // Upsert session
    await pool.query(
      `INSERT INTO chat_sessions (agent_id, remote_jid, is_paused) 
             VALUES ($1, $2, $3)
             ON CONFLICT (agent_id, remote_jid) 
             DO UPDATE SET is_paused = $3, updated_at = NOW()`,
      [agentId, jid, isPaused],
    );

    res.json({ success: true, isPaused });
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

  let combinedText = "\n\nBASE DE CONHECIMENTO DISPONÍVEL:\n";

  for (const file of files) {
    const filePath = path.resolve(file.path);
    log(`[RAG] Processing file: ${file.originalName} at ${filePath}`);

    if (!fs.existsSync(filePath)) {
      log(`[RAG] File not found: ${filePath}`);
      continue;
    }

    try {
      if (file.mimeType === "application/pdf" || file.path.endsWith(".pdf")) {
        log(`[RAG] Parsing PDF: ${file.originalName}`);
        const dataBuffer = fs.readFileSync(filePath);

        let data;
        try {
          // Lazy load pdf-parse to avoid binary/environment issues on Vercel/startup
          const pdf = require("pdf-parse");
          data = await pdf(dataBuffer);
        } catch (err) {
          log(`[RAG] Error loading/executing pdf-parse: ${err.message}`);
          throw err;
        }
      } else if (file.mimeType === "text/plain" || file.path.endsWith(".txt")) {
        log(`[RAG] Reading TXT: ${file.originalName}`);
        const content = fs.readFileSync(filePath, "utf8");
        combinedText += `\n--- Arquivo: ${file.originalName} ---\n${content}\n`;
      } else {
        log(`[RAG] Unsupported file type: ${file.mimeType} / ${file.path}`);
      }
    } catch (err) {
      log(`[RAG] Error reading file ${file.originalName}: ${err.message}`);
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

// Update Lead/Client API
app.put("/api/leads/:id", verifyJWT, async (req, res) => {
  const { id } = req.params;
  const { name, email, phone, company, value, productId, notes, status } =
    req.body;

  try {
    const userId = req.userId;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const userRes = await pool.query(
      "SELECT organization_id FROM users WHERE id = $1",
      [userId],
    );
    const orgId = userRes.rows[0]?.organization_id;

    if (!orgId) return res.status(403).json({ error: "No organization" });

    const result = await pool.query(
      `UPDATE leads SET 
                name = COALESCE($1, name),
                email = COALESCE($2, email),
                phone = COALESCE($3, phone),
                company = COALESCE($4, company),
                value = COALESCE($5, value),
                product_id = $6,
                notes = COALESCE($7, notes),
                status = COALESCE($8, status),
                last_contact = NOW()
             WHERE id = $9 AND organization_id = $10 RETURNING *`,
      [
        name,
        email,
        phone,
        company,
        value,
        productId || null,
        notes,
        status,
        id,
        orgId,
      ],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Lead/Cliente não encontrado" });
    }

    res.json(result.rows[0]);
  } catch (err) {
    log(`PUT /api/leads/${id} error: ${err.toString()}`);
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
      "SELECT onboarding_completed, organization_id FROM users WHERE id = $1",
      [userId],
    );
    const user = userRes.rows[0];

    if (!user) return res.status(404).json({ error: "User not found" });

    if (user.onboarding_completed) {
      // Idempotent success
      return res.json({ success: true, message: "Already completed" });
    }

    const orgId = user.organization_id;

    // NOTE: Agent creation is handled by POST /api/onboarding/create-agent earlier in the flow.
    // We intentionally do NOT auto-create a fallback agent here to avoid duplicates.

    // Update status and add reward (100 Koins)
    await pool.query(
      "UPDATE users SET onboarding_completed = true, koins_balance = koins_balance + 100 WHERE id = $1",
      [userId],
    );

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
        { model: "gpt-4o-mini", temperature: 0.7 },
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
          JSON.stringify({ model: "gpt-4o-mini", temperature: 0.7 }),
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
    // Aggregate token usage per user (via agents)
    // Link: chat_messages -> agents -> organizations -> users (owner)
    // Note: This assumes simplified ownership model where org owner pays.
    const consumptions = await pool.query(`
            SELECT 
                u.name as user_name,
                COALESCE(SUM(cm.prompt_tokens), 0) as total_prompt_tokens,
                COALESCE(SUM(cm.completion_tokens), 0) as total_completion_tokens,
                COALESCE(SUM(cm.token_cost), 0) as total_cost,
                -- Estimate Koins spent (assuming 1 Koin = $0.0001 roughly, or specific rate)
                -- For display, we can just use a multiplier or track actual koins deducted if we had that log
                -- Let's assume 1000 tokens ~ 100 Koins for visualization
                CAST(COALESCE(SUM(cm.prompt_tokens + cm.completion_tokens) / 10, 0) AS INTEGER) as estimated_koins_spent
            FROM users u
            JOIN organizations o ON u.organization_id = o.id
            JOIN agents a ON a.organization_id = o.id
            JOIN chat_messages cm ON cm.agent_id = a.id
            GROUP BY u.id, u.name
            ORDER BY total_cost DESC
            LIMIT 50
        `);

    res.json(consumptions.rows);
  } catch (err) {
    log("Admin consumption error: " + err.toString());
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

      await pool.query(
        "UPDATE users SET koins_balance = koins_balance + $1 WHERE id = $2",
        [amount, userId],
      );

      log(`Admin adjusted koins for user ${userId} by ${amount}`);
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
      `INSERT INTO users (id, name, email, password, role, created_at, koins_balance, onboarding_completed) 
             VALUES (gen_random_uuid(), $1, $2, $3, $4, NOW(), 50, true) 
             RETURNING id, name, email`,
      [name, email, hashedPassword, role || "user"],
    );

    // Create Org
    const user = newUser.rows[0];
    const newOrg = await pool.query(
      `INSERT INTO organizations (name, owner_id, plan_type) VALUES ($1, $2, 'basic') RETURNING id`,
      [name + "'s Organization", user.id],
    );
    await pool.query("UPDATE users SET organization_id = $1 WHERE id = $2", [
      newOrg.rows[0].id,
      user.id,
    ]);

    log(`Admin created user ${email}. Temp pass: ${tempPassword}`);
    res.json({ user, tempPassword });
  } catch (err) {
    log("Admin create user error: " + err.toString());
    res.status(500).json({ error: "Internal server error" });
  }
});

// Admin: Delete User (full cascade)
app.delete("/api/admin/users/:id", verifyJWT, verifyAdmin, async (req, res) => {
  const userId = req.params.id;
  try {
    log(`[ADMIN-DELETE] Starting cascade delete for user ${userId}`);

    // 1. Find the user's organization
    const userRes = await pool.query("SELECT organization_id FROM users WHERE id = $1", [userId]);
    if (userRes.rows.length === 0) {
      return res.status(404).json({ error: "Usuário não encontrado" });
    }
    const orgId = userRes.rows[0]?.organization_id;

    // 2. Delete chat_messages related to agents of this org
    if (orgId) {
      await pool.query(
        `DELETE FROM chat_messages WHERE agent_id IN (SELECT id FROM agents WHERE organization_id = $1)`,
        [orgId]
      ).catch(e => log(`[ADMIN-DELETE] chat_messages: ${e.message}`));

      // 3. Delete chat_sessions related to agents of this org
      await pool.query(
        `DELETE FROM chat_sessions WHERE agent_id IN (SELECT id FROM agents WHERE organization_id = $1)`,
        [orgId]
      ).catch(e => log(`[ADMIN-DELETE] chat_sessions: ${e.message}`));

      // 4. Delete agents
      await pool.query(`DELETE FROM agents WHERE organization_id = $1`, [orgId])
        .catch(e => log(`[ADMIN-DELETE] agents: ${e.message}`));

      // 5. Delete whatsapp_instances
      await pool.query(`DELETE FROM whatsapp_instances WHERE organization_id = $1 OR user_id = $2`, [orgId, userId])
        .catch(e => log(`[ADMIN-DELETE] whatsapp_instances: ${e.message}`));

      // 6. Delete leads
      await pool.query(`DELETE FROM leads WHERE organization_id = $1`, [orgId])
        .catch(e => log(`[ADMIN-DELETE] leads: ${e.message}`));
    }

    // 7. Delete notifications
    await pool.query(`DELETE FROM notifications WHERE user_id = $1`, [userId])
      .catch(e => log(`[ADMIN-DELETE] notifications: ${e.message}`));

    // 8. Delete billing_history
    await pool.query(`DELETE FROM billing_history WHERE user_id = $1`, [userId])
      .catch(e => log(`[ADMIN-DELETE] billing_history: ${e.message}`));

    // 9. Delete api_keys
    await pool.query(`DELETE FROM api_keys WHERE user_id = $1`, [userId])
      .catch(e => log(`[ADMIN-DELETE] api_keys: ${e.message}`));

    // 10. Delete ia_configs
    await pool.query(`DELETE FROM ia_configs WHERE user_id = $1`, [userId])
      .catch(e => log(`[ADMIN-DELETE] ia_configs: ${e.message}`));

    // 11. Delete followup_sequences
    await pool.query(`DELETE FROM followup_sequences WHERE user_id = $1`, [userId])
      .catch(e => log(`[ADMIN-DELETE] followup_sequences: ${e.message}`));

    // 12. Delete partner data (commissions, clicks, partner record)
    const partnerRes = await pool.query(`SELECT id FROM partners WHERE user_id = $1`, [userId]);
    if (partnerRes.rows.length > 0) {
      const partnerId = partnerRes.rows[0].id;
      await pool.query(`DELETE FROM partner_commissions WHERE partner_id = $1`, [partnerId])
        .catch(e => log(`[ADMIN-DELETE] partner_commissions: ${e.message}`));
      await pool.query(`DELETE FROM partner_clicks WHERE partner_id = $1`, [partnerId])
        .catch(e => log(`[ADMIN-DELETE] partner_clicks: ${e.message}`));
      await pool.query(`DELETE FROM partners WHERE id = $1`, [partnerId])
        .catch(e => log(`[ADMIN-DELETE] partners: ${e.message}`));
    }

    // 13. Delete webhook_subscriptions
    await pool.query(`DELETE FROM webhook_subscriptions WHERE user_id = $1`, [userId])
      .catch(e => log(`[ADMIN-DELETE] webhook_subscriptions: ${e.message}`));

    // 14. Delete the organization
    if (orgId) {
      await pool.query(`DELETE FROM organizations WHERE id = $1`, [orgId])
        .catch(e => log(`[ADMIN-DELETE] organizations: ${e.message}`));
    }

    // 15. Finally delete the user
    await pool.query("DELETE FROM users WHERE id = $1", [userId]);

    log(`[ADMIN-DELETE] User ${userId} and all related data deleted successfully`);
    res.json({ success: true });
  } catch (err) {
    log("Admin delete user error: " + err.toString());
    res.status(500).json({ error: "Internal server error", details: err.message });
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
        `INSERT INTO users (id, name, email, password, created_at, koins_balance) 
                 VALUES (gen_random_uuid(), $1, $2, $3, NOW(), 0) 
                 RETURNING id`,
        [name, email, hashedPassword],
      );
      targetUserId = newUser.rows[0].id;

      // Create Organization for new user
      const newOrg = await pool.query(
        `INSERT INTO organizations (name, owner_id, plan_type) VALUES ($1, $2, 'basic') RETURNING *`,
        [name + "'s Organization", targetUserId],
      );
      await pool.query("UPDATE users SET organization_id = $1 WHERE id = $2", [
        newOrg.rows[0].id,
        targetUserId,
      ]);

      log(
        `Admin created new user ${email} for partnership. Temp pass: ${tempPassword}`,
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
      `INSERT INTO partners (user_id, affiliate_code, commission_percentage, status) 
             VALUES ($1, $2, 10.0, 'active') RETURNING *`,
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
      updates.push(`status = $${i++}`);
      values.push(status);
    }
    if (commissionPercentage !== undefined) {
      updates.push(`commission_percentage = $${i++}`);
      values.push(commissionPercentage);
    }

    if (updates.length === 0)
      return res.status(400).json({ error: "Nada para atualizar" });

    values.push(partnerId);
    const result = await pool.query(
      `UPDATE partners SET ${updates.join(", ")} WHERE id = $${i} RETURNING *`,
      values,
    );

    if (result.rowCount === 0)
      return res.status(404).json({ error: "Parceiro não encontrado" });

    log(`Admin updated partner ${partnerId}: ${JSON.stringify(req.body)}`);
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
      `Commission of R$${commissionAmount.toFixed(2)} created for partner ${partner.id} from user ${userId}`,
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
    log(`Error fetching current user: ${err.message}`);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Update Profile API
app.put("/api/profile/update", verifyJWT, async (req, res) => {
  const { name, email, companyName, personalPhone, companyPhone } = req.body;
  // Log incoming data
  log(`[PROFILE UPDATE] Request Body: ${JSON.stringify(req.body)}`);

  try {
    const userId = req.userId;
    log(`[PROFILE UPDATE] User ID extracted: ${userId}`);

    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    // Update User
    const result = await pool.query(
      `UPDATE users SET 
                name = COALESCE($1, name), 
                email = COALESCE($2, email),
                personal_phone = $3,
                company_phone = $4
             WHERE id = $5 RETURNING *`,
      [name, email, personalPhone, companyPhone, userId],
    );

    log(`[PROFILE UPDATE] Update Result: ${result.rowCount} rows affected.`);
    if (result.rowCount > 0) {
      log(`[PROFILE UPDATE] New Data: ${JSON.stringify(result.rows[0])}`);
    } else {
      log(`[PROFILE UPDATE] WARNING: No rows updated for user ${userId}`);
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
        message: `Limite de ${limit} conex${limit === 1 ? 'ão' : 'ões'} atingido. Compre mais conexões para adicionar.`,
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
  return res.rows[0];
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
      log(`[INIT] User ${userId} has no Org. Creating one...`);
      const orgRes = await pool.query(
        "INSERT INTO organizations (name) VALUES ($1) RETURNING id",
        [`Org for ${user.email}`],
      );
      orgId = orgRes.rows[0].id;
      await pool.query("UPDATE users SET organization_id = $1 WHERE id = $2", [
        orgId,
        userId,
      ]);
      log(`[INIT] Created and assigned Org ${orgId} to User ${userId}`);
    }

    // 2. Check Columns
    const colsRes = await pool.query(
      "SELECT id FROM lead_columns WHERE organization_id = $1 LIMIT 1",
      [orgId],
    );
    if (colsRes.rows.length === 0) {
      log(
        `[INIT] User ${userId} (Org ${orgId}) has no columns. Creating defaults...`,
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
      `[INIT ERROR] ensureUserInitialized failed for ${userId}: ${err.message}`,
    );
  }
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
  log(`[DEBUG] POST /api/agents entry. Body: ${JSON.stringify(req.body)}`);

  if (!name || !type) {
    return res.status(400).json({ error: "Name and type are required" });
  }

  try {
    const userId = req.userId;
    log(`[DEBUG] Authenticated User ID: ${userId}`);

    // Get Org ID
    const userRes = await pool.query(
      "SELECT organization_id FROM users WHERE id = $1",
      [userId],
    );
    let orgId = userRes.rows[0]?.organization_id;

    // Auto-create ORG if missing (for tests/new users)
    if (!orgId) {
      log(`[DEBUG] User ${userId} has no Org. Creating one...`);
      const orgRes = await pool.query(
        "INSERT INTO organizations (name) VALUES ($1) RETURNING id",
        [`Org for ${userId}`],
      );
      orgId = orgRes.rows[0].id;
      await pool.query("UPDATE users SET organization_id = $1 WHERE id = $2", [
        orgId,
        userId,
      ]);
      log(`[DEBUG] Created and assigned Org ${orgId} to User ${userId}`);
    }

    const result = await pool.query(
      `INSERT INTO agents (organization_id, name, type, system_prompt, model_config) 
             VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [orgId, name, type, system_prompt || "", model_config || {}],
    );

    log(`[DEBUG] Agent created successfully: ${result.rows[0].id}`);
    res.json(result.rows[0]);
  } catch (err) {
    log("[ERROR] POST /api/agents error: " + err.toString());
    res.status(500).json({ error: "Database error", details: err.message });
  }
});

// DELETE Agent
app.delete("/api/agents/:id", verifyJWT, async (req, res) => {
  const { id } = req.params;
  log(`[DEBUG] DELETE /api/agents/:id entry. ID: ${id}`);

  if (!id) return res.status(400).json({ error: "Agent ID is required" });

  try {
    const userId = req.userId;
    log(`[DEBUG] DELETE /api/agents Authenticated User ID: ${userId}`);

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

    log(`[DEBUG] Agent deleted successfully: ${id} from Org ${orgId}`);
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
    model_config,
    status,
    whatsapp_instance_id,
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
      "SELECT id FROM agents WHERE id = $1 AND organization_id = $2",
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
          error: `Esta conexão já está sendo usada pela IA "${otherAgent.name}". Desconecte-a antes de usar aqui.`,
        });
      }
    }

    // Build Update Query dynamic
    const fields = [];
    const values = [];
    let idx = 1;

    if (name) {
      fields.push(`name = $${idx++}`);
      values.push(name);
    }
    if (type) {
      fields.push(`type = $${idx++}`);
      values.push(type);
    }
    if (system_prompt !== undefined) {
      fields.push(`system_prompt = $${idx++}`);
      values.push(system_prompt);
    }
    if (model_config !== undefined) {
      fields.push(`model_config = $${idx++}`);
      values.push(model_config);
    }
    if (status) {
      fields.push(`status = $${idx++}`);
      values.push(status);
    }
    if (whatsapp_instance_id !== undefined) {
      fields.push(`whatsapp_instance_id = $${idx++}`);
      values.push(whatsapp_instance_id);
    }

    fields.push(`updated_at = NOW()`);

    if (fields.length === 1)
      return res.json({ message: "No changes provided" }); // Only updated_at

    values.push(id);
    values.push(orgId);

    const query = `UPDATE agents SET ${fields.join(", ")} WHERE id = $${idx++} AND organization_id = $${idx++} RETURNING *`;

    const result = await pool.query(query, values);
    log(`[DEBUG] Agent updated: ${id}`);
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
        mimeType: file.mimetype,
        size: file.size,
        uploadedAt: new Date().toISOString(),
      }));

      const updatedFiles = [...currentFiles, ...newFiles];

      const result = await pool.query(
        "UPDATE agents SET training_files = $1, updated_at = NOW() WHERE id = $2 RETURNING *",
        [JSON.stringify(updatedFiles), id],
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

    log(`[PAUSE] Agent ${id} is now ${newStatus}`);
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
      `[PAUSE] Chat ${remoteJid} on agent ${agentId} is now ${newPausedState ? "PAUSED" : "ACTIVE"}`,
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
      `${evolutionUrl}/chat/findChats/${instanceName}`,
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
      `${evolutionUrl}/chat/findMessages/${instanceName}`,
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
      "SELECT column_name FROM information_schema.columns WHERE table_name = 'leads' AND column_name IN ('phone', 'email')",
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
  } catch (e) {
    log("[MIGRATION] ensureLeadsColumns error: " + e.message);
  }
}
// Run migration on startup
ensureLeadsColumns();

// POST /api/leads - Create a new lead
app.post("/api/leads", verifyJWT, async (req, res) => {
  const { name, company, phone, email, value, status, tags, source } = req.body;

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
      "INSERT INTO leads (user_id, organization_id, name, company, phone, email, value, status, tags, source) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *",
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
  const { name, phone, email, value, source } = req.body;

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
      `UPDATE leads SET name = $1, phone = $2, email = $3, value = $4, source = $5, last_contact = NOW()
             WHERE id = $6 AND organization_id = $7 RETURNING *`,
      [name, phone || "", email || "", value || 0, source || "", id, orgId],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Lead not found" });
    }

    const row = result.rows[0];
    const updatedLead = {
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
    };

    res.json(updatedLead);
  } catch (err) {
    log("PUT /api/leads/:id error: " + err.toString());
    res.status(500).json({ error: "Failed to update lead" });
  }
});

// WhatsApp Connection Endpoint (Automated)
app.post("/api/whatsapp/connect", verifyJWT, async (req, res) => {
  const { instanceLabel } = req.body;
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
            log(
              `Instance ${instanceName} connect call returned no QR (likely connected). Updated local DB.`,
            );
            return res.json({
              exists: true,
              instance: instance,
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

      // --- MULTIMODAL HANDLING (AUDIO & VISION) ---
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
        log(`[AI] Audio message detected from ${remoteJid}`);
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
                `[AI] Failed to convert audio base64 to buffer: ${e.message}`,
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
                log(`[AI] Failed to fetch audio URL: ${response.statusText}`);
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
              `[AI] Audio MimeType: ${mimeType}, formatting as .${extension}`,
            );

            // Write to temp file to ensure correct format handling by OpenAI
            const tempFileName = `audio_${Date.now()}.${extension}`;
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
          log(`[AI] Transcription failed: ${transcribeError.message}`);
          return res.json({ success: true, error: "Transcription failed" });
        } finally {
          if (tempFilePath && fs.existsSync(tempFilePath)) {
            fs.unlinkSync(tempFilePath);
          }
        }
      }
      // 2. VISION HANDLING (SEEING)
      else if (isImageMessage) {
        log(`[AI] Image message detected from ${remoteJid}`);

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

          imageUrl = `data:${mimeType};base64,${cleanBase64}`;
          log(
            `[AI] Image prepared. MimeType: ${mimeType}, Base64 length: ${cleanBase64.length}, Starts with: ${cleanBase64.substring(0, 30)}...`,
          );
        } else if (mediaUrl) {
          imageUrl = mediaUrl;
          log(`[AI] Using image URL: ${mediaUrl.substring(0, 80)}...`);
        }

        if (imageUrl) {
          reductionAmount = 10;
        } else {
          log(`[AI] Image data not found (No Base64 or URL).`);
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
              `[AI] Insufficient Koins for multimodal processing. Need ${reductionAmount}, has ${user.koins_balance}.`,
            );
            return res.json({ success: true }); // Stop processing
          }

          await pool.query(
            "UPDATE users SET koins_balance = koins_balance - $1 WHERE id = $2",
            [reductionAmount, user.id],
          );
          log(
            `[KOINS] Deducted ${reductionAmount} for Multimodal Input. Balance: ${user.koins_balance - reductionAmount}`,
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
        `INSERT INTO message_buffer (remote_jid, agent_id, instance_name, content, image_url, is_audio)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
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
        "SELECT * FROM whatsapp_instances WHERE user_id = $1 ORDER BY created_at DESC",
        [userId],
      );
      return res.json(fallback.rows);
    }

    const instancesQuery =
      "SELECT * FROM whatsapp_instances WHERE organization_id = $1 ORDER BY created_at DESC";
    let result = await pool.query(instancesQuery, [orgId]);

    if (result.rows.length === 0) {
      const userInstances = await pool.query(
        "SELECT * FROM whatsapp_instances WHERE user_id = $1 AND (organization_id IS NULL OR organization_id != $2)",
        [userId, orgId],
      );

      if (userInstances.rows.length > 0) {
        await pool.query(
          "UPDATE whatsapp_instances SET organization_id = $1 WHERE user_id = $2",
          [orgId, userId],
        );
        result = await pool.query(
          "SELECT * FROM whatsapp_instances WHERE organization_id = $1 ORDER BY created_at DESC",
          [orgId],
        );
      }
    }

    res.json(result.rows);
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
    log(`[REPAIR] Error: ${e.message}`);
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
      `[DELETE_INSTANCE] Found instance: ${instanceName}, owner: ${instance.user_id}, org: ${instance.organization_id}`,
    );

    // Verify ownership
    if (instance.user_id !== userId && instance.organization_id !== orgId) {
      log(
        `[DELETE_INSTANCE] Access denied for user ${userId} to instance ${id}`,
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
      log(`[DELETE_INSTANCE] Calling Evolution logout for: ${instanceName}`);
      const logoutRes = await fetch(
        `${evolutionApiUrl}/instance/logout/${instanceName}`,
        { method: "DELETE", headers: { apikey: evolutionApiKey } }
      );
      const logoutBody = await logoutRes.text().catch(() => "(no body)");
      log(`[DELETE_INSTANCE] Evolution logout ${instanceName}: ${logoutRes.status} — ${logoutBody}`);
    } catch (evoErr) {
      log(`[DELETE_INSTANCE] Evolution logout error for ${instanceName}: ${evoErr.message}`);
    }

    try {
      log(`[DELETE_INSTANCE] Calling Evolution delete for: ${instanceName}`);
      const deleteRes = await fetch(
        `${evolutionApiUrl}/instance/delete/${instanceName}`,
        { method: "DELETE", headers: { apikey: evolutionApiKey } }
      );
      const deleteBody = await deleteRes.text().catch(() => "(no body)");
      log(`[DELETE_INSTANCE] Evolution delete ${instanceName}: ${deleteRes.status} — ${deleteBody}`);
    } catch (evoErr) {
      log(`[DELETE_INSTANCE] Evolution delete error for ${instanceName}: ${evoErr.message}`);
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
      "SELECT * FROM leads WHERE organization_id = $1 ORDER BY created_at DESC",
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
      value: Number(row.value), // Decimal comes as string from PG
      status: row.status,
      tags: row.tags || [],
      lastContact: row.last_contact, // mappings
      // created_at is available if needed
    }));

    res.json(leads);
  } catch (err) {
    log("GET /api/leads error: " + err.toString());
    res.status(500).json({ error: "Failed to fetch leads" });
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

    const result = await pool.query(
      "UPDATE leads SET status = $1, last_contact = NOW() WHERE id = $2 AND organization_id = $3 RETURNING *",
      [status, id, orgId],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Lead not found" });
    }

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

// DELETE /api/leads/:id - Delete a lead
app.delete("/api/leads/:id", verifyJWT, async (req, res) => {
  const { id } = req.params;

  try {
    const userId = req.userId;
    const userRes = await pool.query(
      "SELECT organization_id FROM users WHERE id = $1",
      [userId],
    );
    const orgId = userRes.rows[0]?.organization_id;

    if (!orgId) return res.status(403).json({ error: "No organization" });

    const result = await pool.query(
      "DELETE FROM leads WHERE id = $1 AND organization_id = $2 RETURNING id",
      [id, orgId],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Lead not found or unauthorized" });
    }

    res.json({ success: true, id: result.rows[0].id });
  } catch (err) {
    log("DELETE /api/leads/:id error: " + err.toString());
    res.status(500).json({ error: "Failed to delete lead" });
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

    log(
      `[WEBHOOK] Message from ${remoteJid} (${pushName}): ${content.substring(0, 50)}...`,
    );

    // 3. Find the Agent linked to this Instance
    // We need to find which agent is using this `instanceName`.
    // The `whatsapp_instances` table maps instanceName -> user_id
    // The `agents` table maps whatsapp_instance_id -> agent details

    // However, the `instanceName` from webhook might match the `instance_name` column in `whatsapp_instances`.

    const instanceRes = await pool.query(
      "SELECT id, user_id FROM whatsapp_instances WHERE instance_name = $1",
      [instanceName],
    );
    if (instanceRes.rows.length === 0) {
      log(`[WEBHOOK] Instance '${instanceName}' not found in DB.`);
      return res.status(200).send("OK");
    }

    const instanceId = instanceRes.rows[0].id;
    const userId = instanceRes.rows[0].user_id;

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

    // 4. Log User Message to DB
    // Check if message already exists (dedup by ID if possible, but simplest is just insert)
    // Evolution sends 'id' in data.key.id
    const msgId = data.key.id;

    // Optional: Check duplication
    // const dupCheck = await pool.query('SELECT id FROM chat_messages WHERE metadata->>\'whatsapp_id\' = $1', [msgId]);

    const inputMessage = {
      role: "user",
      content: content,
      imageUrl: imageUrl, // logic TBD
      isAudio: isAudio,
      metadata: { pushName, whatsapp_id: msgId },
    };

    await pool.query(
      `INSERT INTO chat_messages (agent_id, remote_jid, role, content) 
             VALUES ($1, $2, 'user', $3)`,
      [agent.id, remoteJid, content],
    );

    // 5. Trigger AI Processing
    // We pass the message content directly to `processAIResponse`
    // Note: `processAIResponse` fetches history, so we just inserted it.
    // But we should pass it as `inputMessages` argument to let it know what triggered it.

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

// ─── VENDEDORES CRUD ──────────────────────────────────────

// GET /api/vendedores
app.get("/api/vendedores", async (req, res) => {
  try {
    const orgId = await getOrgId(req);
    if (!orgId) return res.status(401).json({ error: "Unauthorized" });

    const result = await pool.query(
      "SELECT * FROM vendedores WHERE organization_id = $1 ORDER BY created_at",
      [orgId],
    );
    res.json(result.rows);
  } catch (err) {
    log("GET /api/vendedores error: " + err.toString());
    res.status(500).json({ error: "Failed to fetch vendedores" });
  }
});

// POST /api/vendedores
app.post("/api/vendedores", async (req, res) => {
  const { nome, email, whatsapp, porcentagem } = req.body;
  if (!nome || !email)
    return res.status(400).json({ error: "nome and email are required" });

  try {
    const orgId = await getOrgId(req);
    if (!orgId) return res.status(401).json({ error: "Unauthorized" });

    const result = await pool.query(
      "INSERT INTO vendedores (organization_id, nome, email, whatsapp, porcentagem) VALUES ($1, $2, $3, $4, $5) RETURNING *",
      [orgId, nome, email, whatsapp || null, porcentagem || 50],
    );
    log(`[VENDEDORES] Created: ${nome} (org: ${orgId})`);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    log("POST /api/vendedores error: " + err.toString());
    res.status(500).json({ error: "Failed to create vendedor" });
  }
});

// PUT /api/vendedores/:id
app.put("/api/vendedores/:id", async (req, res) => {
  const { id } = req.params;
  const { nome, email, whatsapp, porcentagem, ativo } = req.body;

  try {
    const orgId = await getOrgId(req);
    if (!orgId) return res.status(401).json({ error: "Unauthorized" });

    const result = await pool.query(
      `UPDATE vendedores SET nome = COALESCE($1, nome), email = COALESCE($2, email), 
             whatsapp = COALESCE($3, whatsapp), porcentagem = COALESCE($4, porcentagem),
             ativo = COALESCE($5, ativo)
             WHERE id = $6 AND organization_id = $7 RETURNING *`,
      [nome, email, whatsapp, porcentagem, ativo, id, orgId],
    );

    if (result.rows.length === 0)
      return res.status(404).json({ error: "Vendedor not found" });
    res.json(result.rows[0]);
  } catch (err) {
    log("PUT /api/vendedores/:id error: " + err.toString());
    res.status(500).json({ error: "Failed to update vendedor" });
  }
});

// DELETE /api/vendedores/:id
app.delete("/api/vendedores/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const orgId = await getOrgId(req);
    if (!orgId) return res.status(401).json({ error: "Unauthorized" });

    const result = await pool.query(
      "DELETE FROM vendedores WHERE id = $1 AND organization_id = $2 RETURNING id",
      [id, orgId],
    );
    if (result.rows.length === 0)
      return res.status(404).json({ error: "Vendedor not found" });
    res.json({ success: true });
  } catch (err) {
    log("DELETE /api/vendedores/:id error: " + err.toString());
    res.status(500).json({ error: "Failed to delete vendedor" });
  }
});

// ─── DISPONIBILIDADE ──────────────────────────────────────

// GET /api/vendedores/:id/disponibilidade
app.get("/api/vendedores/:id/disponibilidade", async (req, res) => {
  try {
    const orgId = await getOrgId(req);
    if (!orgId) return res.status(401).json({ error: "Unauthorized" });

    const result = await pool.query(
      `SELECT dv.* FROM disponibilidade_vendedor dv 
             JOIN vendedores v ON dv.vendedor_id = v.id 
             WHERE dv.vendedor_id = $1 AND v.organization_id = $2 
             ORDER BY dv.dia_semana, dv.hora_inicio`,
      [req.params.id, orgId],
    );
    res.json(result.rows);
  } catch (err) {
    log("GET disponibilidade error: " + err.toString());
    res.status(500).json({ error: "Failed to fetch disponibilidade" });
  }
});

// POST /api/vendedores/:id/disponibilidade
app.post("/api/vendedores/:id/disponibilidade", async (req, res) => {
  const { diaSemana, horaInicio, horaFim, intervalo } = req.body;
  if (diaSemana === undefined || !horaInicio || !horaFim) {
    return res
      .status(400)
      .json({ error: "diaSemana, horaInicio and horaFim are required" });
  }

  try {
    const orgId = await getOrgId(req);
    if (!orgId) return res.status(401).json({ error: "Unauthorized" });

    // Verify vendedor belongs to org
    const vCheck = await pool.query(
      "SELECT id FROM vendedores WHERE id = $1 AND organization_id = $2",
      [req.params.id, orgId],
    );
    if (vCheck.rows.length === 0)
      return res.status(404).json({ error: "Vendedor not found" });

    const result = await pool.query(
      "INSERT INTO disponibilidade_vendedor (vendedor_id, dia_semana, hora_inicio, hora_fim, intervalo) VALUES ($1, $2, $3, $4, $5) RETURNING *",
      [req.params.id, diaSemana, horaInicio, horaFim, intervalo || 30],
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    log("POST disponibilidade error: " + err.toString());
    res.status(500).json({ error: "Failed to create disponibilidade" });
  }
});

// DELETE /api/disponibilidade/:id
app.delete("/api/disponibilidade/:id", async (req, res) => {
  try {
    const orgId = await getOrgId(req);
    if (!orgId) return res.status(401).json({ error: "Unauthorized" });

    const result = await pool.query(
      `DELETE FROM disponibilidade_vendedor dv USING vendedores v 
             WHERE dv.id = $1 AND dv.vendedor_id = v.id AND v.organization_id = $2 RETURNING dv.id`,
      [req.params.id, orgId],
    );
    if (result.rows.length === 0)
      return res.status(404).json({ error: "Not found" });
    res.json({ success: true });
  } catch (err) {
    log("DELETE disponibilidade error: " + err.toString());
    res.status(500).json({ error: "Failed to delete disponibilidade" });
  }
});

// ─── BLOQUEIOS DE AGENDA ──────────────────────────────────

// GET /api/vendedores/:id/bloqueios
app.get("/api/vendedores/:id/bloqueios", async (req, res) => {
  try {
    const orgId = await getOrgId(req);
    if (!orgId) return res.status(401).json({ error: "Unauthorized" });

    const result = await pool.query(
      `SELECT b.* FROM bloqueios_agenda b
             JOIN vendedores v ON b.vendedor_id = v.id
             WHERE b.vendedor_id = $1 AND v.organization_id = $2
             ORDER BY b.data_inicio`,
      [req.params.id, orgId],
    );
    res.json(result.rows);
  } catch (err) {
    log("GET bloqueios error: " + err.toString());
    res.status(500).json({ error: "Failed to fetch bloqueios" });
  }
});

// POST /api/vendedores/:id/bloqueios
app.post("/api/vendedores/:id/bloqueios", async (req, res) => {
  const { dataInicio, dataFim, motivo } = req.body;
  if (!dataInicio || !dataFim)
    return res
      .status(400)
      .json({ error: "dataInicio and dataFim are required" });

  try {
    const orgId = await getOrgId(req);
    if (!orgId) return res.status(401).json({ error: "Unauthorized" });

    const vCheck = await pool.query(
      "SELECT id FROM vendedores WHERE id = $1 AND organization_id = $2",
      [req.params.id, orgId],
    );
    if (vCheck.rows.length === 0)
      return res.status(404).json({ error: "Vendedor not found" });

    const result = await pool.query(
      "INSERT INTO bloqueios_agenda (vendedor_id, data_inicio, data_fim, motivo) VALUES ($1, $2, $3, $4) RETURNING *",
      [req.params.id, dataInicio, dataFim, motivo || null],
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    log("POST bloqueios error: " + err.toString());
    res.status(500).json({ error: "Failed to create bloqueio" });
  }
});

// DELETE /api/bloqueios/:id
app.delete("/api/bloqueios/:id", async (req, res) => {
  try {
    const orgId = await getOrgId(req);
    if (!orgId) return res.status(401).json({ error: "Unauthorized" });

    const result = await pool.query(
      `DELETE FROM bloqueios_agenda b USING vendedores v
             WHERE b.id = $1 AND b.vendedor_id = v.id AND v.organization_id = $2 RETURNING b.id`,
      [req.params.id, orgId],
    );
    if (result.rows.length === 0)
      return res.status(404).json({ error: "Not found" });
    res.json({ success: true });
  } catch (err) {
    log("DELETE bloqueios error: " + err.toString());
    res.status(500).json({ error: "Failed to delete bloqueio" });
  }
});

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

  try {
    // Prevent deleting self (optional but good practice)
    // Middleware provides req.userId
    const requesterId = req.userId;
    if (id === requesterId) {
      return res.status(400).json({ error: "Cannot delete yourself" });
    }

    const result = await pool.query(
      "DELETE FROM users WHERE id = $1 RETURNING id",
      [id],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    log(`[ADMIN] Deleted user: ${id}`);
    res.json({ success: true, message: "User deleted successfully" });
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
  }
});

app.patch("/api/admin/users/:id/koins", verifyAdmin, async (req, res) => {
  const { id } = req.params;
  const { amount } = req.body; // e.g., +100 or -50
  try {
    const update = await pool.query(
      "UPDATE users SET koins_balance = koins_balance + $1 WHERE id = $2 RETURNING koins_balance",
      [amount, id],
    );
    res.json({ success: true, newBalance: update.rows[0].koins_balance });
  } catch (err) {
    log("PATCH /api/admin/users/:id/koins error: " + err.toString());
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/api/admin/consumption", verifyAdmin, async (req, res) => {
  try {
    const stats = await pool.query(`
            SELECT 
                u.name as user_name,
                SUM(cm.prompt_tokens) as total_prompt_tokens,
                SUM(cm.completion_tokens) as total_completion_tokens,
                SUM(cm.token_cost) as total_cost,
                COUNT(cm.id) * 5 as estimated_koins_spent
            FROM chat_messages cm
            JOIN agents a ON a.id = cm.agent_id
            JOIN organizations o ON o.id = a.organization_id
            JOIN users u ON u.organization_id = o.id
            GROUP BY u.name
        `);
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

    const result = await pool.query(
      "UPDATE users SET koins_balance = koins_balance + $1 WHERE id = $2 RETURNING koins_balance",
      [amount, userId],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    log(
      `[PAYMENT] Added ${amount} koins to user ${userId}. New balance: ${result.rows[0].koins_balance}`,
    );
    res.json({ success: true, newBalance: result.rows[0].koins_balance });
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

        await pool.query(
          "UPDATE users SET koins_balance = koins_balance + $1 WHERE id = $2",
          [koinsToCredit, userId],
        );
        log(
          `[KOINS] Credited ${koinsToCredit} koins to user ${userId} for payment of R$${paymentAmount}`,
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
    const updateResult = await pool.query(
      "UPDATE users SET koins_balance = koins_balance + $1 WHERE id = $2 RETURNING koins_balance",
      [koinsToCredit, userId],
    );

    if (updateResult.rows.length === 0) {
      log(`[MP-IPN] User ${userId} not found in database. Cannot credit Koins.`);
      return res.status(200).send("OK");
    }

    log(
      `[MP-IPN] ✅ Credited ${koinsToCredit} Koins to user ${userId}. New balance: ${updateResult.rows[0].koins_balance}`,
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

    const updateResult = await pool.query(
      "UPDATE users SET koins_balance = koins_balance + $1 WHERE id = $2 RETURNING koins_balance",
      [koinsToCredit, userId],
    );

    if (updateResult.rows.length > 0) {
      log(
        `[PAYMENT-VERIFY] ✅ Credited ${koinsToCredit} Koins to user ${userId}. New balance: ${updateResult.rows[0].koins_balance}`,
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
      const deductRes = await pool.query(
        "UPDATE users SET koins_balance = koins_balance - 2 WHERE id = $1 RETURNING koins_balance",
        [user.id],
      );
      log(
        `[KOINS] Deducted 2 koins for part ${index + 1}. New balance: ${deductRes.rows[0].koins_balance}`,
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

    // --- Compose the unified system prompt ---
    let systemPrompt = `Você é uma Inteligência Artificial de alta performance operando exclusivamente via WhatsApp.
A sua identidade, tom de voz, missão principal e informações da empresa estão definidas no [TEMPLATE DE IDENTIDADE] abaixo.

INFORMAÇÕES DE CONTEXTO:
Data atual: ${currentDate}
Hora atual: ${currentTime} (horário de Brasília)

[TEMPLATE DE IDENTIDADE]
${agent.system_prompt || "Você é um assistente virtual prestativo."}
[/TEMPLATE DE IDENTIDADE]`;

    // --- Inject Knowledge Base (conditional) ---
    if (knowledgeBase) {
      systemPrompt += `

[BASE DE CONHECIMENTO]
Utilize EXCLUSIVAMENTE as informações abaixo para responder perguntas sobre produtos, serviços e processos da empresa.
NÃO diga que não tem acesso a arquivos — o conteúdo deles está transcrito aqui.
Se a resposta estiver neste contexto, use-a. Se não estiver, execute o comportamento padrão definido no template.
${knowledgeBase}
[/BASE DE CONHECIMENTO]`;
    }

    // --- Scheduling Module (always active) ---
    systemPrompt += `

[MÓDULO DE AGENDAMENTO]
Quando o assunto for marcar, reagendar ou consultar horários, siga RIGOROSAMENTE estas regras:
1. USE A FERRAMENTA disponível para consultar slots antes de qualquer sugestão.
2. OFEREÇA APENAS 2 (DUAS) opções por vez — nunca envie a lista completa.
   Formato: "Tenho disponível na *[dia] às [hora1]* ou na *[dia] às [hora2]*. Algum funciona pra você?"
3. SE O CLIENTE RECUSAR: Ofereça outros 2 horários diferentes.
4. SE O CLIENTE SUGERIR UM HORÁRIO: Verifique se ele existe em "available_slots". Se sim, agende. Se não, explique e dê as opções mais próximas.
5. PERSISTÊNCIA: Só transfira para um humano se o cliente pedir explicitamente OU após pelo menos 3 rodadas sem acordo.
6. FILTRO TEMPORAL: NUNCA ofereça horários que já passaram.
[/MÓDULO DE AGENDAMENTO]`;

    // --- Global System Directives (Inviolable) ---
    systemPrompt += `

=========================================
DIRETRIZES GLOBAIS DE SISTEMA (INVIOLÁVEIS)
Independentemente da sua missão acima, você DEVE obedecer rigorosamente a este motor cognitivo e tático:

1. MODO DE COMPORTAMENTO (Dinâmico):
${agent.id === "sdr" || agent.id === "vendedor"
        ? `→ MODO ATIVO (SDR/Vendedor): Você não espera, você lidera. Conduza cada mensagem em direção ao objetivo. É PROIBIDO perguntar "Como posso ajudar?" ou "Qual sua dúvida?". Use os gatilhos de dor e abertura obrigatória do seu template.`
        : `→ MODO RECEPTIVO (Suporte/Atendente): Ouça o problema, acolha a dúvida e resolva de forma eficiente.`
      }

2. AS 3 LEIS:
- Lei 1 (Clareza > Criatividade): Nunca invente dados. Se não souber, execute o comportamento padrão definido no [TEMPLATE DE IDENTIDADE].
- Lei 2 (Direção > Informação): Não seja apenas um dicionário de dúvidas. Conduza ativamente o usuário em direção ao objetivo (venda/reunião).
- Lei 3 (Fluxo Guiado): Cada mensagem sua deve mover o usuário 1 passo adiante. NUNCA envie uma mensagem que não termine com uma provocação ou direcionamento claro.

3. FORMATAÇÃO WHATSAPP FIRST:
- Textos altamente escaneáveis (máximo 3 linhas por parágrafo).
- Use *negrito* para destacar dores, benefícios ou o Call to Action (CTA).
- Pule uma linha entre parágrafos (espaçamento duplo).
- Use emojis de forma leve e natural. Nunca em excesso.
- Regra do Espelhamento: Adapte sua energia. Se o lead responde curto, responda curto.

4. MOTOR ANTI-PROCRASTINAÇÃO (PSICOLOGIA COMPORTAMENTAL):
- Micro-passos: NUNCA envie blocos longos de informação. NUNCA faça mais de UMA pergunta por vez.
- Morte da Fadiga de Decisão (Alternative Close): NUNCA faça perguntas abertas como "Qual o melhor horário?" ou "O que você acha?". SEMPRE dê escolhas binárias (Ex: "Você prefere na terça de manhã ou na quinta à tarde?").
- Gatilho da Urgência: Faça o lead perceber que "adiar" tem um custo. Mostre o que ele perde a cada dia que não resolve o problema.

5. APRESENTAÇÃO DE VALOR (MÉTODO FAB):
- Nunca liste apenas funcionalidades (Features). Sempre conecte com a Vantagem (Advantage) e, principalmente, com o Benefício (Benefit). Foque na transformação e no "destino", não na viagem.

6. GESTÃO AVANÇADA DE OBJEÇÕES (MÉTODO LAER):
Se o cliente apresentar uma objeção, NUNCA discuta, NUNCA diminua o problema e NUNCA dê descontos de imediato. Siga a estrutura: Ouvir → Reconhecer → Explorar → Responder.
- "TÁ CARO": Responda: "Entendo. Deixe-me perguntar: se o preço não fosse um problema, é isso que você faria hoje?" Desloque o foco do custo para o Retorno sobre o Investimento (ROI).
- "PRECISO PENSAR": Responda: "Concordo, é uma decisão importante. Mas me diga — além do tempo para pensar, existe algo mais que te impede de fecharmos hoje? O que mais está pesando?"
- "NÃO TENHO TEMPO": Responda: "Exatamente por isso estou falando com você. Essa solução foi feita para quem não tem tempo. Quanto tempo esse problema atual já rouba da sua rotina?"
- "ESTOU SATISFEITO COM O CONCORRENTE": Responda: "Fico feliz que já esteja sendo atendido. Mas me tire uma dúvida: o que faria sua experiência atual passar de 'satisfatória' para 'perfeita'? Existe algo que seu fornecedor atual não resolve 100%?"

7. A REGRA DA ÚLTIMA FRASE (FECHAMENTO CONSTANTE):
- ABSOLUTAMENTE TODAS as suas mensagens devem terminar com uma pergunta direcionadora ou um Call to Action claro. Assuma que a ação já é certa. Nunca deixe a conversa "morrer".
- Se o usuário responder a uma mensagem de follow-up, RETOME o contexto imediatamente e tente atingir o objetivo.

8. RESTRIÇÕES DO SISTEMA:
- NUNCA revele que é uma IA. Aja 100% dentro da sua persona.
- Obedeça todas as restrições específicas definidas no [TEMPLATE DE IDENTIDADE].
=========================================`;

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

    // 1.7 Fetch Chat History for this contact
    // We fetch history, but we need to EXCLUDE the messages we just buffered (inputMessages),
    // because we want to construct the latest message manually with Multimodal support (images).
    // The webhook already inserted them into DB as text.
    // So we fetch history, remove the last N items (where N = inputMessages.length), and append our rich version.

    // 1. Fetch History from DB
    const historyResult = await pool.query(
      "SELECT role, content FROM chat_messages WHERE agent_id = $1 AND remote_jid = $2 ORDER BY created_at DESC LIMIT 20", // Limit 20 interactions
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

    // Decide Model
    // If hasImage, MUST use gpt-4o or gpt-4o-mini (vision supported).
    // We are already using gpt-4o-mini.
    const model = "gpt-4o-mini";

    // Prepare messages for OpenAI
    const apiMessages = [
      { role: "system", content: systemPrompt },
      ...coalescedHistory,
      currentUserMessage,
    ];

    // 2. Generate AI Response (with Tool Calling)
    const schedulingTools = [
      {
        type: "function",
        function: {
          name: "consultar_horarios_disponiveis",
          description:
            "Consulta horários disponíveis para agendamento em uma data específica.",
          parameters: {
            type: "object",
            properties: {
              date: {
                type: "string",
                description: "Data no formato YYYY-MM-DD",
              },
              vendedorId: {
                type: "string",
                description: "ID opcional do vendedor específico",
              },
            },
            required: ["date"],
          },
        },
      },
      {
        type: "function",
        function: {
          name: "confirmar_agendamento",
          description:
            "Confirma e realiza o agendamento de uma reunião ou demonstração.",
          parameters: {
            type: "object",
            properties: {
              date: {
                type: "string",
                description: "Data no formato YYYY-MM-DD",
              },
              time: { type: "string", description: "Horário no formato HH:MM" },
              vendedorId: {
                type: "string",
                description:
                  "O UUID do vendedor (NÃO o nome) retornado na consulta.",
              },
              notas: {
                type: "string",
                description: "Notas adicionais sobre o agendamento",
              },
            },
            required: ["date", "time", "vendedorId"],
          },
        },
      },
      {
        type: "function",
        function: {
          name: "cancelar_agendamento",
          description:
            "Cancela qualquer agendamento ativo (status 'agendado') que o lead possua atualmente.",
          parameters: {
            type: "object",
            properties: {
              confirmacion: {
                type: "boolean",
                description: "Confirmação de que o usuário deseja cancelar.",
              },
            },
            required: ["confirmacion"],
          },
        },
      },
    ];

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
        tools: schedulingTools,
        tool_choice: "auto",
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
          log(
            `[AI - TOOL] Calling ${functionName} with ${JSON.stringify(args)}`,
          );

          let toolResult;
          try {
            const orgId = user.organization_id;
            log(`[AI - TOOL] Executing ${functionName} for Org: ${orgId}`);

            if (functionName === "consultar_horarios_disponiveis") {
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
          const deductRes = await pool.query(
            "UPDATE users SET koins_balance = koins_balance - 10 WHERE id = $1 RETURNING koins_balance",
            [user.id],
          );
          log(
            `[KOINS] Deducted 10 koins for audio response.New balance: ${deductRes.rows[0].koins_balance} `,
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
    const userId = req.userId;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const { id } = req.params;
    await pool.query(
      "DELETE FROM followup_sequences WHERE id = $1 AND user_id = $2",
      [id, userId],
    );

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

      log(`Follow-up sequence updated for user ${userId}. ID: ${id}`);
      res.json(updatedSeq.rows[0]);
    } catch (err) {
      log("Update Sequence error: " + err.toString());
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

// --- CRON JOB (Every hour) ---
// Using setInterval for simplicity as node-cron might not be installed
const ONE_HOUR = 60 * 60 * 1000;
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
          await pool.query(
            "UPDATE users SET koins_balance = koins_balance - 5 WHERE id = $1",
            [seq.user_id],
          );
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


// ─────────────────────────────────────────────────────────────────────────────
// AGENDA API ROUTES
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/vendedores – list all vendors for the user's organization
app.get("/api/vendedores", verifyJWT, async (req, res) => {
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
