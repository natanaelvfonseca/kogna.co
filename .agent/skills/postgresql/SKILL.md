---
name: managing-postgresql
description: Design and manage PostgreSQL schemas using Prisma ORM. Covers best practices, data types, indexing, migrations, and Kogna-specific database configurations.
---

# PostgreSQL & Prisma Skill (Kogna Ecosystem)

## When to use this skill
- When designing or modifying the database schema (`schema.prisma`).
- When running migrations or querying the database.
- When the user asks to "create a table", "add a field", or "check data".
- When optimizing database performance (indexes, constraints).

## 1. Data Source Configuration

**Database credentials for Kogna/Orquestra de Vendas:**
- **Host**: `62.171.145.215`
- **Port**: `5432`
- **Database**: `postgres`
- **User**: `postgres`
- **Password**: `Louiseemel@#&2020`
- **Connection String**: `postgresql://postgres:Louiseemel%40%23%262020@62.171.145.215:5432/postgres?schema=public`

## 2. Tool Mapping & Capabilities

Use these native functions/commands when requested:

- **`migrate-dev`**: Run `npx prisma migrate dev --name <descriptive_name>` whenever `schema.prisma` is modified. Updates the DB and regenerates the client.
- **`migrate-status`**: Run `npx prisma migrate status` to check synchronization between local migrations and the database.
- **`Prisma-Studio`**: Run `npx prisma studio` to visualize/edit data (Leads, Instances, etc.).
- **`migrate-reset`**: ⚠️ **DANGER**. Run `npx prisma migrate reset` only with EXPLICIT user consent.

### Exposed Agent Capabilities
- **`db_introspect`**: Read current schema (`npx prisma db pull` or viewing `schema.prisma`).
- **`safe_query`**: Use `prisma.lead.findMany()` or similar for read-only checks.
- **`sync_whatsapp_status`**: Update `Instance.status` based on Evolution API webhook data.
- **`upsert_lead`**: Logic to create/update leads from SDR interactions.

## 3. Schema Logic & Model Guidelines

### Core Models (SaaS Structure)
1.  **Instance**: Stores connection details from Evolution API.
    - Fields: `id`, `instanceName` (Unique), `status` (open/connecting/close), `apiKey`, `ownerId`.
2.  **Lead**: Stores SDR contact data.
    - Fields: `id`, `name`, `phone` (Unique), `status` (New/Qualified/Converted), `score`, `history` (JSONB).

### Best Practices
- **Type-Safety**: Always use generated Prisma Client types. Validate queries against schema.
- **Safety First**: Ask for confirmation before `DELETE` or `TRUNCATE` operations.
- **Integration**: Ensure query results can be formatted for n8n webhooks if needed.

---

# PostgreSQL Schema Design Guide

## Core Rules
- **Primary Keys**: Use `BIGINT GENERATED ALWAYS AS IDENTITY` or `UUID` (if opaque/distributed).
- **Normalization**: 3NF by default. Denormalize only for proven performance bottlenecks.
- **Nullability**: Use `NOT NULL` wherever possible. Use default values.
- **Indexing**: Index Foreign Keys manually (Prisma handles some, but be explicit). Index frequent filter columns.

## Data Types
- **IDs**: `BigInt` or `String` (UUID).
- **Text**: `String` (maps to `TEXT` in PG). Avoid `Char(n)`.
- **Numbers**: `Int`, `BigInt`, `Float` (Double Precision), `Decimal` (Numeric/Money).
- **Dates**: `DateTime` (maps to `TIMESTAMPTZ`). Use `now()` defaults.
- **JSON**: `Json` (maps to `JSONB`). Use for semi-structured data (e.g., lead history, config).

## Performance "Gotchas"
- **Indexes**: PG doesn't auto-index FKs. Add `@@index([columnName])` in Prisma.
- **JSONB**: efficient but use GIN indexes if querying inside the JSON document.
- **Unique & Nulls**: Standard unique allows multiple nulls.
- **Vacuum**: Be aware of dead tuples in update-heavy tables.

## Example Prisma Schema
```prisma
model User {
  id        BigInt   @id @default(autoincrement())
  email     String   @unique
  name      String
  createdAt DateTime @default(now()) @map("created_at")
  orders    Order[]

  @@map("users")
}

model Order {
  id        BigInt   @id @default(autoincrement())
  userId    BigInt   @map("user_id")
  status    String   @default("PENDING")
  total     Decimal  @db.Decimal(10, 2)
  createdAt DateTime @default(now()) @map("created_at")
  user      User     @relation(fields: [userId], references: [id])

  @@index([userId])
  @@map("orders")
}
```
