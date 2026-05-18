const DEFAULT_PIPELINE_STAGES = [
  ["Lead novo", 1, 8, "#64748b", false, false, false],
  ["Atendimento iniciado", 2, 15, "#0ea5e9", false, false, false],
  ["Interesse identificado", 3, 25, "#2563eb", false, false, false],
  ["Diagnostico feito", 4, 35, "#4f46e5", false, false, false],
  ["Curso apresentado", 5, 45, "#7c3aed", false, false, false],
  ["Condicao enviada", 6, 55, "#9333ea", false, false, false],
  ["Objecao", 7, 40, "#f97316", false, false, false],
  ["Follow-up", 8, 48, "#eab308", false, false, false],
  ["Dados de matricula enviados", 9, 68, "#14b8a6", false, false, false],
  ["Pagamento pendente", 10, 78, "#06b6d4", false, false, false],
  ["Comprovante recebido", 11, 88, "#22c55e", false, false, false],
  ["Matricula confirmada", 12, 100, "#16a34a", true, true, false],
  ["Perdido", 13, 0, "#ef4444", true, false, true],
  ["Recuperacao", 14, 18, "#f59e0b", false, false, false],
];

const DEFAULT_AI_AGENTS = [
  ["mel", "Mel", "governanca", "Governanca comercial por IA", "active"],
  ["lou", "Lou", "comercial", "Execucao comercial e tarefas", "draft"],
  ["liz", "Liz", "marketing", "Inteligencia de marketing", "draft"],
];

let kognaSchoolsReady = Promise.resolve();

const TASK_TYPES = new Set(["follow-up", "ligacao", "mensagem", "validacao", "cobranca_interna"]);
const TASK_ORIGINS = new Set(["manual", "Mel", "Lou", "sistema"]);
const TASK_STATUS = new Set(["aberta", "em_andamento", "concluida", "cancelada"]);
const ALERT_PRIORITIES = new Set(["baixa", "media", "alta", "critica"]);
const ALERT_STATUS = new Set(["aberto", "em_andamento", "resolvido", "ignorado"]);
const ALERT_TYPES = new Set([
  "lead_sem_resposta",
  "followup_atrasado",
  "lead_quente_parado",
  "dados_bancarios_divergentes",
  "preco_fora_da_regra",
  "vendedor_fora_do_playbook",
  "meta_em_risco",
  "campanha_com_baixa_entrega",
  "comprovante_recebido",
  "conversa_com_risco_alto",
]);

function shouldAutoMigrateSchoolsSchema() {
  if (process.env.KOGNA_SCHOOLS_AUTO_MIGRATE === "true") return true;
  if (process.env.KOGNA_SCHOOLS_AUTO_MIGRATE === "false") return false;
  return process.env.NODE_ENV !== "production" && !process.env.VERCEL;
}

function badRequest(message) {
  const error = new Error(message);
  error.status = 400;
  return error;
}

function requiredString(value, field) {
  const text = String(value || "").trim();
  if (!text) throw badRequest(`${field} e obrigatorio.`);
  return text;
}

function optionalString(value) {
  const text = String(value || "").trim();
  return text || null;
}

function optionalNumber(value, field) {
  if (value === undefined || value === null || value === "") return null;
  const number = Number(value);
  if (!Number.isFinite(number)) throw badRequest(`${field} precisa ser um numero valido.`);
  return number;
}

function optionalInteger(value, field) {
  const number = optionalNumber(value, field);
  return number === null ? null : Math.trunc(number);
}

function jsonValue(value, fallback = {}) {
  if (value === undefined || value === null || value === "") return fallback;
  return value;
}

function mapDb(row) {
  if (!row) return null;
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [
      key.replace(/_([a-z])/g, (_, char) => char.toUpperCase()),
      value,
    ]),
  );
}

function mapRows(result) {
  return result.rows.map(mapDb);
}

async function ensureKognaSchoolsSchema(pool, log = console.log) {
  await pool.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schools (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id TEXT,
      name TEXT NOT NULL,
      document TEXT,
      phone TEXT,
      email TEXT,
      city TEXT,
      state TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      whatsapp_setup_later BOOLEAN NOT NULL DEFAULT FALSE,
      onboarding JSONB NOT NULL DEFAULT '{}'::jsonb,
      preferences JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_schools_org_unique ON schools(organization_id) WHERE organization_id IS NOT NULL`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_schools_status ON schools(status)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_schools_created_at ON schools(created_at DESC)`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS school_users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
      user_id UUID,
      name TEXT,
      email TEXT,
      role TEXT NOT NULL DEFAULT 'owner',
      status TEXT NOT NULL DEFAULT 'active',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_school_users_school_user ON school_users(school_id, user_id) WHERE user_id IS NOT NULL`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_school_users_school ON school_users(school_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_school_users_role ON school_users(role)`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS salespeople (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
      user_id UUID,
      name TEXT NOT NULL,
      whatsapp TEXT,
      email TEXT,
      role TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      monthly_revenue_goal NUMERIC(12,2),
      monthly_enrollment_goal INT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS courses (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      category TEXT,
      description TEXT,
      duration TEXT,
      modality TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS course_offers (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
      course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      price NUMERIC(12,2) NOT NULL DEFAULT 0,
      enrollment_fee NUMERIC(12,2),
      monthly_fee NUMERIC(12,2),
      max_discount_percent NUMERIC(5,2),
      payment_terms TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS official_payment_data (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
      pix_key TEXT,
      bank TEXT,
      agency TEXT,
      account TEXT,
      holder_name TEXT,
      holder_document TEXT,
      payment_links JSONB NOT NULL DEFAULT '[]'::jsonb,
      commercial_notes TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS pipelines (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      is_default BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS pipeline_stages (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
      pipeline_id UUID NOT NULL REFERENCES pipelines(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      order_index INT NOT NULL,
      closing_probability INT NOT NULL DEFAULT 0,
      color TEXT,
      is_final BOOLEAN NOT NULL DEFAULT FALSE,
      counts_as_won BOOLEAN NOT NULL DEFAULT FALSE,
      counts_as_lost BOOLEAN NOT NULL DEFAULT FALSE,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS school_id UUID REFERENCES schools(id) ON DELETE SET NULL`).catch(() => {});
  await pool.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS course_id UUID REFERENCES courses(id) ON DELETE SET NULL`).catch(() => {});
  await pool.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS salesperson_id UUID REFERENCES salespeople(id) ON DELETE SET NULL`).catch(() => {});
  await pool.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS pipeline_id UUID REFERENCES pipelines(id) ON DELETE SET NULL`).catch(() => {});
  await pool.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS pipeline_stage_id UUID REFERENCES pipeline_stages(id) ON DELETE SET NULL`).catch(() => {});
  await pool.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS temperature TEXT DEFAULT 'frio'`).catch(() => {});
  await pool.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS next_action TEXT`).catch(() => {});
  await pool.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()`).catch(() => {});

  await pool.query(`
    CREATE TABLE IF NOT EXISTS conversations (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
      lead_id UUID,
      salesperson_id UUID REFERENCES salespeople(id) ON DELETE SET NULL,
      external_id TEXT,
      origin TEXT NOT NULL DEFAULT 'whatsapp',
      status TEXT NOT NULL DEFAULT 'open',
      last_message TEXT,
      last_message_at TIMESTAMPTZ,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS messages (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
      conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      sender_type TEXT NOT NULL DEFAULT 'lead',
      sender_name TEXT,
      content TEXT NOT NULL,
      external_id TEXT,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS lead_stage_history (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
      lead_id UUID NOT NULL,
      from_stage_id UUID,
      to_stage_id UUID,
      changed_by UUID,
      notes TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS tasks (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
      lead_id UUID,
      salesperson_id UUID REFERENCES salespeople(id) ON DELETE SET NULL,
      title TEXT NOT NULL,
      description TEXT,
      due_at TIMESTAMPTZ NOT NULL,
      priority TEXT NOT NULL DEFAULT 'media',
      status TEXT NOT NULL DEFAULT 'aberta',
      type TEXT NOT NULL DEFAULT 'follow-up',
      origin TEXT NOT NULL DEFAULT 'manual',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS alerts (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
      lead_id UUID,
      salesperson_id UUID REFERENCES salespeople(id) ON DELETE SET NULL,
      type TEXT NOT NULL,
      priority TEXT NOT NULL DEFAULT 'media',
      title TEXT NOT NULL,
      description TEXT,
      recommendation TEXT,
      status TEXT NOT NULL DEFAULT 'aberto',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS goals (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
      salesperson_id UUID REFERENCES salespeople(id) ON DELETE SET NULL,
      course_id UUID REFERENCES courses(id) ON DELETE SET NULL,
      month TEXT NOT NULL,
      revenue_goal NUMERIC(12,2) NOT NULL DEFAULT 0,
      enrollment_goal INT NOT NULL DEFAULT 0,
      average_ticket NUMERIC(12,2),
      expected_conversion_rate NUMERIC(5,2),
      marketing_investment NUMERIC(12,2),
      status TEXT NOT NULL DEFAULT 'active',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ai_agents (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
      key TEXT NOT NULL,
      name TEXT NOT NULL,
      agent_type TEXT NOT NULL,
      description TEXT,
      status TEXT NOT NULL DEFAULT 'draft',
      config JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(school_id, key)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ai_analysis (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
      lead_id UUID,
      conversation_id UUID,
      agent_key TEXT NOT NULL DEFAULT 'mel',
      analysis_type TEXT NOT NULL,
      summary TEXT,
      score NUMERIC(8,2),
      payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ai_recommendations (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
      lead_id UUID,
      agent_key TEXT NOT NULL DEFAULT 'mel',
      title TEXT NOT NULL,
      description TEXT,
      priority TEXT NOT NULL DEFAULT 'media',
      status TEXT NOT NULL DEFAULT 'open',
      payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS agent_commands (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
      source_agent_key TEXT NOT NULL,
      target_agent_key TEXT,
      command_type TEXT NOT NULL,
      payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      status TEXT NOT NULL DEFAULT 'queued',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`ALTER TABLE notifications ADD COLUMN IF NOT EXISTS school_id UUID REFERENCES schools(id) ON DELETE SET NULL`).catch(() => {});
  await pool.query(`ALTER TABLE notifications ADD COLUMN IF NOT EXISTS notification_type TEXT`).catch(() => {});
  await pool.query(`ALTER TABLE notifications ADD COLUMN IF NOT EXISTS priority TEXT DEFAULT 'media'`).catch(() => {});
  await pool.query(`ALTER TABLE notifications ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'unread'`).catch(() => {});

  const indexedTables = [
    "salespeople",
    "courses",
    "course_offers",
    "official_payment_data",
    "pipelines",
    "pipeline_stages",
    "conversations",
    "messages",
    "lead_stage_history",
    "tasks",
    "alerts",
    "goals",
    "ai_agents",
    "ai_analysis",
    "ai_recommendations",
    "agent_commands",
  ];

  for (const table of indexedTables) {
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_${table}_school_id ON ${table}(school_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_${table}_status ON ${table}(status)`).catch(() => {});
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_${table}_created_at ON ${table}(created_at DESC)`).catch(() => {});
  }

  await pool.query(`CREATE INDEX IF NOT EXISTS idx_leads_school_id ON leads(school_id)`).catch(() => {});
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_leads_course_id ON leads(course_id)`).catch(() => {});
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_leads_salesperson_id ON leads(salesperson_id)`).catch(() => {});
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_leads_pipeline_stage_id ON leads(pipeline_stage_id)`).catch(() => {});
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_leads_status_school ON leads(school_id, status)`).catch(() => {});
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_conversations_lead_id ON conversations(lead_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_tasks_lead_id ON tasks(lead_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_alerts_lead_id ON alerts(lead_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_goals_salesperson_id ON goals(salesperson_id)`);

  log("[SCHOOLS] Kogna Escolas schema verified.");
}

async function getUserContext(pool, userId) {
  const result = await pool.query(
    `SELECT id, name, email, organization_id, role FROM users WHERE id = $1`,
    [userId],
  );
  return result.rows[0] || null;
}

async function seedSchoolFoundation(pool, schoolId, userId = null) {
  const pipelineResult = await pool.query(
    `INSERT INTO pipelines (school_id, name, is_default)
     SELECT $1, 'Pipeline de Matriculas', true
     WHERE NOT EXISTS (SELECT 1 FROM pipelines WHERE school_id = $1 AND is_default = true)
     RETURNING id`,
    [schoolId],
  );
  const pipelineId =
    pipelineResult.rows[0]?.id ||
    (await pool.query(`SELECT id FROM pipelines WHERE school_id = $1 AND is_default = true LIMIT 1`, [schoolId]))
      .rows[0]?.id;

  if (pipelineId) {
    for (const [name, order, probability, color, isFinal, won, lost] of DEFAULT_PIPELINE_STAGES) {
      await pool.query(
        `INSERT INTO pipeline_stages (
          school_id, pipeline_id, name, order_index, closing_probability, color, is_final, counts_as_won, counts_as_lost
        )
        SELECT $1, $2, $3, $4, $5, $6, $7, $8, $9
        WHERE NOT EXISTS (
          SELECT 1 FROM pipeline_stages WHERE school_id = $1 AND pipeline_id = $2 AND order_index = $4
        )`,
        [schoolId, pipelineId, name, order, probability, color, isFinal, won, lost],
      );
    }
  }

  for (const [key, name, type, description, status] of DEFAULT_AI_AGENTS) {
    await pool.query(
      `INSERT INTO ai_agents (school_id, key, name, agent_type, description, status)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (school_id, key) DO NOTHING`,
      [schoolId, key, name, type, description, status],
    );
  }

  if (userId) {
    await pool.query(
      `INSERT INTO school_users (school_id, user_id, role, status)
       VALUES ($1, $2, 'owner', 'active')
       ON CONFLICT DO NOTHING`,
      [schoolId, userId],
    );
  }

  return pipelineId;
}

async function ensureDefaultSchoolForUser(pool, user) {
  if (!user) throw badRequest("Usuario nao encontrado.");

  if (user.organization_id) {
    const existing = await pool.query(`SELECT * FROM schools WHERE organization_id = $1 LIMIT 1`, [user.organization_id]);
    if (existing.rows[0]) {
      await seedSchoolFoundation(pool, existing.rows[0].id, user.id);
      return existing.rows[0];
    }

    const org = await pool.query(`SELECT name FROM organizations WHERE id = $1`, [user.organization_id]).catch(() => ({ rows: [] }));
    const name = org.rows[0]?.name || "Minha escola";
    const created = await pool.query(
      `INSERT INTO schools (organization_id, name) VALUES ($1, $2) RETURNING *`,
      [user.organization_id, name],
    );
    await seedSchoolFoundation(pool, created.rows[0].id, user.id);
    return created.rows[0];
  }

  const membership = await pool.query(
    `SELECT s.* FROM schools s
     JOIN school_users su ON su.school_id = s.id
     WHERE su.user_id = $1 AND su.status = 'active'
     ORDER BY s.created_at ASC
     LIMIT 1`,
    [user.id],
  );
  if (membership.rows[0]) {
    await seedSchoolFoundation(pool, membership.rows[0].id, user.id);
    return membership.rows[0];
  }

  const created = await pool.query(
    `INSERT INTO schools (name) VALUES ($1) RETURNING *`,
    [user.name ? `Escola de ${user.name}` : "Minha escola"],
  );
  await seedSchoolFoundation(pool, created.rows[0].id, user.id);
  return created.rows[0];
}

async function requireSchoolAccess(pool, req, schoolId) {
  const user = await getUserContext(pool, req.userId);
  if (!user) {
    const error = new Error("Usuario nao encontrado.");
    error.status = 401;
    throw error;
  }
  if (user.role === "admin") return { user, schoolRole: "admin" };

  const access = await pool.query(
    `SELECT su.role
     FROM school_users su
     WHERE su.school_id = $1 AND su.user_id = $2 AND su.status = 'active'
     UNION
     SELECT 'owner' AS role
     FROM schools s
     WHERE s.id = $1 AND s.organization_id = $3
     LIMIT 1`,
    [schoolId, user.id, user.organization_id],
  );

  if (!access.rows[0]) {
    const error = new Error("Acesso negado para esta escola.");
    error.status = 403;
    throw error;
  }

  return { user, schoolRole: access.rows[0].role };
}

function canSeeAll(role) {
  return ["admin", "owner", "manager", "marketing"].includes(role);
}

function handleRoute(fn, pool, log) {
  return async (req, res) => {
    try {
      await fn(req, res);
    } catch (error) {
      log(`[SCHOOLS] ${req.method} ${req.path}: ${error.message}`);
      res.status(error.status || 500).json({ error: error.message || "Erro interno" });
    }
  };
}

function mountCollectionRoutes({ app, pool, verifyJWT, log, path, table, columns, buildPayload, orderBy = "created_at DESC" }) {
  app.get(path, verifyJWT, handleRoute(async (req, res) => {
    await kognaSchoolsReady;
    const { schoolId } = req.params;
    const access = await requireSchoolAccess(pool, req, schoolId);
    const filters = [`school_id = $1`];
    const values = [schoolId];

    if (table === "leads" && !canSeeAll(access.schoolRole)) {
      const seller = await pool.query(`SELECT id FROM salespeople WHERE school_id = $1 AND user_id = $2 LIMIT 1`, [schoolId, req.userId]);
      if (seller.rows[0]) {
        values.push(seller.rows[0].id);
        filters.push(`salesperson_id = $${values.length}`);
      }
    }

    const result = await pool.query(
      `SELECT * FROM ${table} WHERE ${filters.join(" AND ")} ORDER BY ${orderBy}`,
      values,
    );
    res.json(mapRows(result));
  }, pool, log));

  app.post(path, verifyJWT, handleRoute(async (req, res) => {
    await kognaSchoolsReady;
    const { schoolId } = req.params;
    await requireSchoolAccess(pool, req, schoolId);
    const payload = buildPayload(req.body, schoolId);
    const names = columns.filter((name) => payload[name] !== undefined);
    const values = names.map((name) => payload[name]);
    const placeholders = names.map((_, index) => `$${index + 1}`);
    const result = await pool.query(
      `INSERT INTO ${table} (${names.join(", ")}) VALUES (${placeholders.join(", ")}) RETURNING *`,
      values,
    );
    res.status(201).json(mapDb(result.rows[0]));
  }, pool, log));

  app.put(`${path}/:id`, verifyJWT, handleRoute(async (req, res) => {
    await kognaSchoolsReady;
    const { schoolId, id } = req.params;
    await requireSchoolAccess(pool, req, schoolId);
    const payload = buildPayload(req.body, schoolId, true);
    const names = columns.filter((name) => name !== "school_id" && payload[name] !== undefined);
    if (names.length === 0) throw badRequest("Nenhum campo para atualizar.");
    const values = names.map((name) => payload[name]);
    values.push(id, schoolId);
    const setSql = names.map((name, index) => `${name} = $${index + 1}`).join(", ");
    const result = await pool.query(
      `UPDATE ${table} SET ${setSql}, updated_at = NOW() WHERE id = $${values.length - 1} AND school_id = $${values.length} RETURNING *`,
      values,
    );
    if (!result.rows[0]) throw Object.assign(new Error("Registro nao encontrado."), { status: 404 });
    res.json(mapDb(result.rows[0]));
  }, pool, log));

  app.delete(`${path}/:id`, verifyJWT, handleRoute(async (req, res) => {
    await kognaSchoolsReady;
    const { schoolId, id } = req.params;
    await requireSchoolAccess(pool, req, schoolId);
    const result = await pool.query(
      `UPDATE ${table} SET status = 'inactive', updated_at = NOW() WHERE id = $1 AND school_id = $2 RETURNING *`,
      [id, schoolId],
    ).catch(() => pool.query(`DELETE FROM ${table} WHERE id = $1 AND school_id = $2 RETURNING *`, [id, schoolId]));
    if (!result.rows[0]) throw Object.assign(new Error("Registro nao encontrado."), { status: 404 });
    res.json({ success: true });
  }, pool, log));
}

function coursePayload(body, schoolId) {
  return {
    school_id: schoolId,
    name: requiredString(body.name, "Nome do curso"),
    category: optionalString(body.category),
    description: optionalString(body.description),
    duration: optionalString(body.duration),
    modality: optionalString(body.modality),
    status: optionalString(body.status) || "active",
  };
}

function offerPayload(body, schoolId) {
  return {
    school_id: schoolId,
    course_id: requiredString(body.courseId || body.course_id, "Curso da oferta"),
    name: requiredString(body.name, "Nome da oferta"),
    price: optionalNumber(body.price, "Preco") ?? 0,
    enrollment_fee: optionalNumber(body.enrollmentFee || body.enrollment_fee, "Matricula"),
    monthly_fee: optionalNumber(body.monthlyFee || body.monthly_fee, "Mensalidade"),
    max_discount_percent: optionalNumber(body.maxDiscountPercent || body.max_discount_percent, "Desconto"),
    payment_terms: optionalString(body.paymentTerms || body.payment_terms),
    status: optionalString(body.status) || "active",
  };
}

function paymentPayload(body, schoolId) {
  return {
    school_id: schoolId,
    pix_key: optionalString(body.pixKey || body.pix_key),
    bank: optionalString(body.bank),
    agency: optionalString(body.agency),
    account: optionalString(body.account),
    holder_name: optionalString(body.holderName || body.holder_name),
    holder_document: optionalString(body.holderDocument || body.holder_document),
    payment_links: JSON.stringify(jsonValue(body.paymentLinks || body.payment_links, [])),
    commercial_notes: optionalString(body.commercialNotes || body.commercial_notes),
    status: optionalString(body.status) || "active",
  };
}

function salespersonPayload(body, schoolId) {
  return {
    school_id: schoolId,
    user_id: optionalString(body.userId || body.user_id),
    name: requiredString(body.name, "Nome do vendedor"),
    whatsapp: optionalString(body.whatsapp),
    email: optionalString(body.email),
    role: optionalString(body.role),
    status: optionalString(body.status) || "active",
    monthly_revenue_goal: optionalNumber(body.monthlyRevenueGoal || body.monthly_revenue_goal, "Meta de faturamento"),
    monthly_enrollment_goal: optionalInteger(body.monthlyEnrollmentGoal || body.monthly_enrollment_goal, "Meta de matriculas"),
  };
}

function pipelinePayload(body, schoolId) {
  return {
    school_id: schoolId,
    name: requiredString(body.name, "Nome do pipeline"),
    status: optionalString(body.status) || "active",
    is_default: Boolean(body.isDefault || body.is_default),
  };
}

function stagePayload(body, schoolId) {
  const order = optionalInteger(body.orderIndex || body.order_index, "Ordem");
  if (order === null) throw badRequest("Pipeline stage precisa de ordem.");
  return {
    school_id: schoolId,
    pipeline_id: requiredString(body.pipelineId || body.pipeline_id, "Pipeline"),
    name: requiredString(body.name, "Nome da etapa"),
    order_index: order,
    closing_probability: optionalInteger(body.closingProbability || body.closing_probability, "Probabilidade") ?? 0,
    color: optionalString(body.color),
    is_final: Boolean(body.isFinal || body.is_final),
    counts_as_won: Boolean(body.countsAsWon || body.counts_as_won),
    counts_as_lost: Boolean(body.countsAsLost || body.counts_as_lost),
    status: optionalString(body.status) || "active",
  };
}

function leadPayload(body, schoolId) {
  const name = optionalString(body.name);
  const phone = optionalString(body.phone);
  if (!name && !phone) throw badRequest("Lead precisa de nome ou telefone.");
  return {
    school_id: schoolId,
    name: name || phone,
    phone,
    email: optionalString(body.email),
    source: optionalString(body.source),
    course_id: optionalString(body.courseId || body.course_id),
    salesperson_id: optionalString(body.salespersonId || body.salesperson_id),
    pipeline_id: optionalString(body.pipelineId || body.pipeline_id),
    pipeline_stage_id: optionalString(body.pipelineStageId || body.pipeline_stage_id),
    temperature: optionalString(body.temperature) || "frio",
    status: optionalString(body.status) || "new",
    notes: optionalString(body.notes),
    value: optionalNumber(body.value || body.expectedValue || body.expected_value, "Valor esperado"),
    next_action: optionalString(body.nextAction || body.next_action),
    last_interaction_at: body.lastInteractionAt || body.last_interaction_at || null,
  };
}

function conversationPayload(body, schoolId) {
  return {
    school_id: schoolId,
    lead_id: optionalString(body.leadId || body.lead_id),
    salesperson_id: optionalString(body.salespersonId || body.salesperson_id),
    external_id: optionalString(body.externalId || body.external_id),
    origin: optionalString(body.origin) || "whatsapp",
    status: optionalString(body.status) || "open",
    last_message: optionalString(body.lastMessage || body.last_message),
    last_message_at: body.lastMessageAt || body.last_message_at || null,
    metadata: JSON.stringify(jsonValue(body.metadata, {})),
  };
}

function taskPayload(body, schoolId) {
  const status = optionalString(body.status) || "aberta";
  const type = optionalString(body.type) || "follow-up";
  const origin = optionalString(body.origin) || "manual";
  if (!TASK_STATUS.has(status)) throw badRequest("Status da tarefa invalido.");
  if (!TASK_TYPES.has(type)) throw badRequest("Tipo da tarefa invalido.");
  if (!TASK_ORIGINS.has(origin)) throw badRequest("Origem da tarefa invalida.");
  if (!body.dueAt && !body.due_at) throw badRequest("Tarefa precisa de prazo.");
  return {
    school_id: schoolId,
    lead_id: optionalString(body.leadId || body.lead_id),
    salesperson_id: optionalString(body.salespersonId || body.salesperson_id),
    title: requiredString(body.title, "Tarefa"),
    description: optionalString(body.description),
    due_at: body.dueAt || body.due_at,
    priority: optionalString(body.priority) || "media",
    status,
    type,
    origin,
  };
}

function alertPayload(body, schoolId) {
  const priority = optionalString(body.priority) || "media";
  const status = optionalString(body.status) || "aberto";
  const type = optionalString(body.type) || "lead_sem_resposta";
  if (!ALERT_PRIORITIES.has(priority)) throw badRequest("Prioridade do alerta invalida.");
  if (!ALERT_STATUS.has(status)) throw badRequest("Status do alerta invalido.");
  if (!ALERT_TYPES.has(type)) throw badRequest("Tipo do alerta invalido.");
  return {
    school_id: schoolId,
    lead_id: optionalString(body.leadId || body.lead_id),
    salesperson_id: optionalString(body.salespersonId || body.salesperson_id),
    type,
    priority,
    title: requiredString(body.title, "Titulo do alerta"),
    description: optionalString(body.description),
    recommendation: optionalString(body.recommendation),
    status,
  };
}

function goalPayload(body, schoolId) {
  return {
    school_id: schoolId,
    salesperson_id: optionalString(body.salespersonId || body.salesperson_id),
    course_id: optionalString(body.courseId || body.course_id),
    month: requiredString(body.month, "Mes da meta"),
    revenue_goal: optionalNumber(body.revenueGoal || body.revenue_goal, "Meta de faturamento") ?? 0,
    enrollment_goal: optionalInteger(body.enrollmentGoal || body.enrollment_goal, "Meta de matriculas") ?? 0,
    average_ticket: optionalNumber(body.averageTicket || body.average_ticket, "Ticket medio"),
    expected_conversion_rate: optionalNumber(body.expectedConversionRate || body.expected_conversion_rate, "Conversao esperada"),
    marketing_investment: optionalNumber(body.marketingInvestment || body.marketing_investment, "Investimento de marketing"),
    status: optionalString(body.status) || "active",
  };
}

async function calculateOnboarding(pool, schoolId) {
  const [
    school,
    courses,
    offers,
    payment,
    sellers,
    stages,
    goals,
  ] = await Promise.all([
    pool.query(`SELECT id, name, whatsapp_setup_later FROM schools WHERE id = $1`, [schoolId]),
    pool.query(`SELECT COUNT(*)::int AS count FROM courses WHERE school_id = $1 AND status = 'active'`, [schoolId]),
    pool.query(`SELECT COUNT(*)::int AS count FROM course_offers WHERE school_id = $1 AND status = 'active'`, [schoolId]),
    pool.query(`SELECT COUNT(*)::int AS count FROM official_payment_data WHERE school_id = $1 AND status = 'active'`, [schoolId]),
    pool.query(`SELECT COUNT(*)::int AS count FROM salespeople WHERE school_id = $1 AND status = 'active'`, [schoolId]),
    pool.query(`SELECT COUNT(*)::int AS count FROM pipeline_stages WHERE school_id = $1 AND status = 'active'`, [schoolId]),
    pool.query(`SELECT COUNT(*)::int AS count FROM goals WHERE school_id = $1 AND status = 'active'`, [schoolId]),
  ]);

  const schoolRow = school.rows[0];
  const whatsappConnected = await pool.query(
    `SELECT COUNT(*)::int AS count
     FROM whatsapp_instances wi
     WHERE (wi.organization_id = (SELECT organization_id FROM schools WHERE id = $1) OR wi.user_id::text IN (
       SELECT user_id::text FROM school_users WHERE school_id = $1
     ))
     AND LOWER(COALESCE(wi.status, '')) IN ('open', 'connected')`,
    [schoolId],
  ).catch(() => ({ rows: [{ count: 0 }] }));

  const checklist = [
    { key: "school", label: "Escola cadastrada", done: Boolean(schoolRow?.name) },
    { key: "courses", label: "Pelo menos 1 curso cadastrado", done: courses.rows[0].count > 0 },
    { key: "offers", label: "Pelo menos 1 oferta cadastrada", done: offers.rows[0].count > 0 },
    { key: "payment", label: "Dados financeiros oficiais cadastrados", done: payment.rows[0].count > 0 },
    { key: "salespeople", label: "Pelo menos 1 vendedor cadastrado", done: sellers.rows[0].count > 0 },
    { key: "pipeline", label: "Pipeline configurado", done: stages.rows[0].count >= DEFAULT_PIPELINE_STAGES.length },
    { key: "goals", label: "Metas configuradas", done: goals.rows[0].count > 0 },
    {
      key: "whatsapp",
      label: "WhatsApp conectado ou marcado para depois",
      done: whatsappConnected.rows[0].count > 0 || Boolean(schoolRow?.whatsapp_setup_later),
    },
  ];
  const completed = checklist.filter((item) => item.done).length;
  return {
    progress: Math.round((completed / checklist.length) * 100),
    completed: completed === checklist.length,
    checklist,
  };
}

async function buildDashboard(pool, schoolId) {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const tomorrow = new Date(todayStart);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const daysInMonth = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0).getDate();
  const dayOfMonth = Math.max(1, new Date().getDate());

  const [school, onboarding, today, hot, overdue, confirmed, revenue, goal, alerts, actions, pipeline, sellers] = await Promise.all([
    pool.query(`SELECT * FROM schools WHERE id = $1`, [schoolId]),
    calculateOnboarding(pool, schoolId),
    pool.query(`SELECT COUNT(*)::int AS count FROM leads WHERE school_id = $1 AND created_at >= $2 AND created_at < $3`, [schoolId, todayStart, tomorrow]),
    pool.query(`SELECT COUNT(*)::int AS count FROM leads WHERE school_id = $1 AND LOWER(COALESCE(temperature, '')) IN ('quente', 'hot')`, [schoolId]),
    pool.query(`SELECT COUNT(*)::int AS count FROM tasks WHERE school_id = $1 AND due_at < NOW() AND status NOT IN ('concluida', 'cancelada')`, [schoolId]),
    pool.query(`SELECT COUNT(*)::int AS count FROM leads l LEFT JOIN pipeline_stages ps ON ps.id = l.pipeline_stage_id WHERE l.school_id = $1 AND (ps.counts_as_won = true OR LOWER(COALESCE(l.status, '')) IN ('matricula_confirmada', 'cliente', 'won'))`, [schoolId]),
    pool.query(`SELECT COALESCE(SUM(COALESCE(value, 0)), 0)::numeric AS total FROM leads WHERE school_id = $1 AND created_at >= $2 AND LOWER(COALESCE(status, '')) IN ('matricula_confirmada', 'cliente', 'won')`, [schoolId, monthStart]),
    pool.query(`SELECT COALESCE(SUM(revenue_goal), 0)::numeric AS total FROM goals WHERE school_id = $1 AND month = $2 AND status = 'active'`, [schoolId, monthStart.toISOString().slice(0, 7)]),
    pool.query(`SELECT * FROM alerts WHERE school_id = $1 AND status IN ('aberto', 'em_andamento') ORDER BY CASE priority WHEN 'critica' THEN 1 WHEN 'alta' THEN 2 WHEN 'media' THEN 3 ELSE 4 END, created_at DESC LIMIT 6`, [schoolId]),
    pool.query(`SELECT * FROM ai_recommendations WHERE school_id = $1 AND status = 'open' ORDER BY CASE priority WHEN 'critica' THEN 1 WHEN 'alta' THEN 2 WHEN 'media' THEN 3 ELSE 4 END, created_at DESC LIMIT 6`, [schoolId]),
    pool.query(`SELECT ps.id, ps.name, ps.order_index, ps.color, COUNT(l.id)::int AS leads, COALESCE(SUM(COALESCE(l.value, 0)), 0)::numeric AS value FROM pipeline_stages ps LEFT JOIN leads l ON l.pipeline_stage_id = ps.id AND l.school_id = ps.school_id WHERE ps.school_id = $1 GROUP BY ps.id ORDER BY ps.order_index`, [schoolId]),
    pool.query(`SELECT sp.id, sp.name, COUNT(l.id)::int AS leads, COALESCE(SUM(COALESCE(l.value, 0)), 0)::numeric AS pipeline_value FROM salespeople sp LEFT JOIN leads l ON l.salesperson_id = sp.id AND l.school_id = sp.school_id WHERE sp.school_id = $1 GROUP BY sp.id ORDER BY sp.name`, [schoolId]),
  ]);

  const monthToDate = Number(revenue.rows[0].total || 0);
  const goalValue = Number(goal.rows[0].total || 0);
  const simpleProjection = Math.round((monthToDate / dayOfMonth) * daysInMonth);
  const unansweredLeads = await pool.query(
    `SELECT COUNT(*)::int AS count
     FROM leads l
     LEFT JOIN conversations c ON c.lead_id = l.id AND c.school_id = l.school_id
     WHERE l.school_id = $1 AND (c.last_message_at IS NULL OR c.last_message_at < NOW() - INTERVAL '24 hours')`,
    [schoolId],
  );

  return {
    school: mapDb(school.rows[0]),
    setupProgress: onboarding.progress,
    onboarding,
    today: {
      leads: today.rows[0].count,
      unansweredLeads: unansweredLeads.rows[0].count,
      hotLeads: hot.rows[0].count,
      overdueFollowups: overdue.rows[0].count,
      confirmedEnrollments: confirmed.rows[0].count,
    },
    revenue: {
      monthToDate,
      simpleProjection,
      goal: goalValue,
      gap: Math.max(0, goalValue - monthToDate),
      futurePipelineProjection: null,
    },
    alerts: mapRows(alerts),
    recommendedActions: actions.rows.length
      ? mapRows(actions)
      : [
        { id: "setup", title: "Concluir configuracao da escola", description: "A Mel precisa de cursos, ofertas, vendedores e metas para governar o comercial.", priority: "alta" },
        { id: "pipeline", title: "Revisar leads parados", description: "Use o pipeline para mover leads e registrar proximas acoes.", priority: "media" },
      ],
    pipelineSummary: mapRows(pipeline),
    salesTeamSummary: mapRows(sellers),
  };
}

export function registerKognaSchoolsRoutes({ app, pool, verifyJWT, log = console.log }) {
  const ready = shouldAutoMigrateSchoolsSchema()
    ? ensureKognaSchoolsSchema(pool, log).catch((error) => {
      log(`[SCHOOLS] schema startup error: ${error.message}`);
    })
    : Promise.resolve().then(() => {
      log("[SCHOOLS] runtime schema verification skipped. Set KOGNA_SCHOOLS_AUTO_MIGRATE=true to enable it.");
    });
  kognaSchoolsReady = ready;
  const withReady = (fn) => handleRoute(async (req, res) => {
    await ready;
    await fn(req, res);
  }, pool, log);

  app.get("/api/schools", verifyJWT, withReady(async (req, res) => {
    const user = await getUserContext(pool, req.userId);
    const school = await ensureDefaultSchoolForUser(pool, user);
    const schools = await pool.query(
      user.role === "admin"
        ? `SELECT * FROM schools ORDER BY created_at DESC`
        : `SELECT DISTINCT s.* FROM schools s
           LEFT JOIN school_users su ON su.school_id = s.id
           WHERE s.id = $1 OR su.user_id = $2 OR s.organization_id = $3
           ORDER BY s.created_at DESC`,
      user.role === "admin" ? [] : [school.id, user.id, user.organization_id],
    );
    res.json(mapRows(schools));
  }));

  app.post("/api/schools", verifyJWT, withReady(async (req, res) => {
    const user = await getUserContext(pool, req.userId);
    const name = requiredString(req.body.name, "Nome da escola");
    const created = await pool.query(
      `INSERT INTO schools (organization_id, name, document, phone, email, city, state, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'active') RETURNING *`,
      [
        user?.organization_id || null,
        name,
        optionalString(req.body.document),
        optionalString(req.body.phone),
        optionalString(req.body.email),
        optionalString(req.body.city),
        optionalString(req.body.state),
      ],
    );
    await seedSchoolFoundation(pool, created.rows[0].id, req.userId);
    res.status(201).json(mapDb(created.rows[0]));
  }));

  app.get("/api/schools/:schoolId", verifyJWT, withReady(async (req, res) => {
    await requireSchoolAccess(pool, req, req.params.schoolId);
    const result = await pool.query(`SELECT * FROM schools WHERE id = $1`, [req.params.schoolId]);
    if (!result.rows[0]) throw Object.assign(new Error("Escola nao encontrada."), { status: 404 });
    res.json(mapDb(result.rows[0]));
  }));

  app.put("/api/schools/:schoolId", verifyJWT, withReady(async (req, res) => {
    await requireSchoolAccess(pool, req, req.params.schoolId);
    const result = await pool.query(
      `UPDATE schools
       SET name = $1, document = $2, phone = $3, email = $4, city = $5, state = $6,
           status = $7, updated_at = NOW()
       WHERE id = $8
       RETURNING *`,
      [
        requiredString(req.body.name, "Nome da escola"),
        optionalString(req.body.document),
        optionalString(req.body.phone),
        optionalString(req.body.email),
        optionalString(req.body.city),
        optionalString(req.body.state),
        optionalString(req.body.status) || "active",
        req.params.schoolId,
      ],
    );
    res.json(mapDb(result.rows[0]));
  }));

  app.get("/api/schools/:schoolId/onboarding", verifyJWT, withReady(async (req, res) => {
    await requireSchoolAccess(pool, req, req.params.schoolId);
    res.json(await calculateOnboarding(pool, req.params.schoolId));
  }));

  app.patch("/api/schools/:schoolId/onboarding", verifyJWT, withReady(async (req, res) => {
    await requireSchoolAccess(pool, req, req.params.schoolId);
    const result = await pool.query(
      `UPDATE schools
       SET whatsapp_setup_later = COALESCE($1, whatsapp_setup_later),
           onboarding = onboarding || $2::jsonb,
           updated_at = NOW()
       WHERE id = $3
       RETURNING *`,
      [
        typeof req.body.whatsappSetupLater === "boolean" ? req.body.whatsappSetupLater : null,
        JSON.stringify(req.body.onboarding || {}),
        req.params.schoolId,
      ],
    );
    res.json({ school: mapDb(result.rows[0]), onboarding: await calculateOnboarding(pool, req.params.schoolId) });
  }));

  app.get("/api/schools/:schoolId/dashboard", verifyJWT, withReady(async (req, res) => {
    await requireSchoolAccess(pool, req, req.params.schoolId);
    res.json(await buildDashboard(pool, req.params.schoolId));
  }));

  mountCollectionRoutes({
    app,
    pool,
    verifyJWT,
    log,
    path: "/api/schools/:schoolId/courses",
    table: "courses",
    columns: ["school_id", "name", "category", "description", "duration", "modality", "status"],
    buildPayload: coursePayload,
  });
  mountCollectionRoutes({
    app,
    pool,
    verifyJWT,
    log,
    path: "/api/schools/:schoolId/course-offers",
    table: "course_offers",
    columns: ["school_id", "course_id", "name", "price", "enrollment_fee", "monthly_fee", "max_discount_percent", "payment_terms", "status"],
    buildPayload: offerPayload,
  });
  mountCollectionRoutes({
    app,
    pool,
    verifyJWT,
    log,
    path: "/api/schools/:schoolId/payment-data",
    table: "official_payment_data",
    columns: ["school_id", "pix_key", "bank", "agency", "account", "holder_name", "holder_document", "payment_links", "commercial_notes", "status"],
    buildPayload: paymentPayload,
  });
  mountCollectionRoutes({
    app,
    pool,
    verifyJWT,
    log,
    path: "/api/schools/:schoolId/salespeople",
    table: "salespeople",
    columns: ["school_id", "user_id", "name", "whatsapp", "email", "role", "status", "monthly_revenue_goal", "monthly_enrollment_goal"],
    buildPayload: salespersonPayload,
  });
  mountCollectionRoutes({
    app,
    pool,
    verifyJWT,
    log,
    path: "/api/schools/:schoolId/pipelines",
    table: "pipelines",
    columns: ["school_id", "name", "status", "is_default"],
    buildPayload: pipelinePayload,
  });
  mountCollectionRoutes({
    app,
    pool,
    verifyJWT,
    log,
    path: "/api/schools/:schoolId/pipeline-stages",
    table: "pipeline_stages",
    columns: ["school_id", "pipeline_id", "name", "order_index", "closing_probability", "color", "is_final", "counts_as_won", "counts_as_lost", "status"],
    buildPayload: stagePayload,
    orderBy: "order_index ASC",
  });
  mountCollectionRoutes({
    app,
    pool,
    verifyJWT,
    log,
    path: "/api/schools/:schoolId/leads",
    table: "leads",
    columns: ["school_id", "name", "phone", "email", "source", "course_id", "salesperson_id", "pipeline_id", "pipeline_stage_id", "temperature", "status", "notes", "value", "next_action", "last_interaction_at"],
    buildPayload: leadPayload,
  });
  mountCollectionRoutes({
    app,
    pool,
    verifyJWT,
    log,
    path: "/api/schools/:schoolId/conversations",
    table: "conversations",
    columns: ["school_id", "lead_id", "salesperson_id", "external_id", "origin", "status", "last_message", "last_message_at", "metadata"],
    buildPayload: conversationPayload,
  });
  mountCollectionRoutes({
    app,
    pool,
    verifyJWT,
    log,
    path: "/api/schools/:schoolId/tasks",
    table: "tasks",
    columns: ["school_id", "lead_id", "salesperson_id", "title", "description", "due_at", "priority", "status", "type", "origin"],
    buildPayload: taskPayload,
  });
  mountCollectionRoutes({
    app,
    pool,
    verifyJWT,
    log,
    path: "/api/schools/:schoolId/alerts",
    table: "alerts",
    columns: ["school_id", "lead_id", "salesperson_id", "type", "priority", "title", "description", "recommendation", "status"],
    buildPayload: alertPayload,
  });
  mountCollectionRoutes({
    app,
    pool,
    verifyJWT,
    log,
    path: "/api/schools/:schoolId/goals",
    table: "goals",
    columns: ["school_id", "salesperson_id", "course_id", "month", "revenue_goal", "enrollment_goal", "average_ticket", "expected_conversion_rate", "marketing_investment", "status"],
    buildPayload: goalPayload,
  });

  app.patch("/api/schools/:schoolId/leads/:leadId/stage", verifyJWT, withReady(async (req, res) => {
    const { schoolId, leadId } = req.params;
    await requireSchoolAccess(pool, req, schoolId);
    const nextStageId = requiredString(req.body.pipelineStageId || req.body.pipeline_stage_id, "Nova etapa");
    const current = await pool.query(`SELECT pipeline_stage_id FROM leads WHERE id = $1 AND school_id = $2`, [leadId, schoolId]);
    if (!current.rows[0]) throw Object.assign(new Error("Lead nao encontrado."), { status: 404 });
    const stage = await pool.query(`SELECT pipeline_id FROM pipeline_stages WHERE id = $1 AND school_id = $2`, [nextStageId, schoolId]);
    if (!stage.rows[0]) throw badRequest("Etapa invalida para esta escola.");
    const updated = await pool.query(
      `UPDATE leads SET pipeline_stage_id = $1, pipeline_id = $2, updated_at = NOW() WHERE id = $3 AND school_id = $4 RETURNING *`,
      [nextStageId, stage.rows[0].pipeline_id, leadId, schoolId],
    );
    await pool.query(
      `INSERT INTO lead_stage_history (school_id, lead_id, from_stage_id, to_stage_id, changed_by, notes)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [schoolId, leadId, current.rows[0].pipeline_stage_id, nextStageId, req.userId, optionalString(req.body.notes)],
    );
    res.json(mapDb(updated.rows[0]));
  }));

  app.get("/api/schools/:schoolId/conversations/:conversationId/messages", verifyJWT, withReady(async (req, res) => {
    await requireSchoolAccess(pool, req, req.params.schoolId);
    const result = await pool.query(
      `SELECT * FROM messages WHERE school_id = $1 AND conversation_id = $2 ORDER BY created_at ASC`,
      [req.params.schoolId, req.params.conversationId],
    );
    res.json(mapRows(result));
  }));

  app.post("/api/schools/:schoolId/conversations/:conversationId/messages", verifyJWT, withReady(async (req, res) => {
    await requireSchoolAccess(pool, req, req.params.schoolId);
    const content = requiredString(req.body.content, "Mensagem");
    const result = await pool.query(
      `INSERT INTO messages (school_id, conversation_id, sender_type, sender_name, content, external_id, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [
        req.params.schoolId,
        req.params.conversationId,
        optionalString(req.body.senderType || req.body.sender_type) || "school",
        optionalString(req.body.senderName || req.body.sender_name),
        content,
        optionalString(req.body.externalId || req.body.external_id),
        JSON.stringify(jsonValue(req.body.metadata, {})),
      ],
    );
    await pool.query(
      `UPDATE conversations SET last_message = $1, last_message_at = NOW(), updated_at = NOW()
       WHERE id = $2 AND school_id = $3`,
      [content, req.params.conversationId, req.params.schoolId],
    );
    res.status(201).json(mapDb(result.rows[0]));
  }));
}
