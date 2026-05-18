# Kogna.co - AI-Powered CRM & Automation Platform

Kogna is a premium SaaS application designed for high-conversion leads management, AI-driven automation, and WhatsApp integration.

## 🚀 Features

- **WhatsApp CRM**: Multi-instance WhatsApp management via Evolution API.
- **AI Agents**: Custom AI agents for lead qualification and support.
- **Dynamic Checkout**: Integration with Mercado Pago for seamless payments.
- **Partner Dashboard**: Affiliate system with commission tracking.
- **Modern UI**: Dark-mode primary dashboard built with Vite, React, and Tailwind CSS.

## 🛠️ Tech Stack

- **Frontend**: Vite, React, TypeScript, Tailwind CSS, Framer Motion, Lucide Icons.
- **Backend**: Node.js, Express, JWT Authentication, RBAC.
- **Database**: PostgreSQL with Prisma ORM.
- **Integrations**: Mercado Pago API, Evolution API.

## 📦 Installation

1. **Clone the repository**:
   ```bash
   git clone https://github.com/your-username/kogna-co.git
   cd kogna-co
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Configure Environment Variables**:
   Copy `.env.example` to `.env` and fill in your credentials:
   ```bash
   cp .env.example .env
   ```

4. **Database Setup**:
   ```bash
   npx prisma generate
   npx prisma db push
   ```

5. **Run Development Server**:
   ```bash
   npm run dev
   ```

## 🔐 Security

- **JWT Auth**: Standardized JWT verification across all API endpoints.
- **RBAC**: Admin and Partner roles with strict route permissions.
- **Hardened Production**: Secure cookie handling and stripped debug logs.

## 📄 License

This project is licensed under the MIT License.

## Kogna Escolas Frontend

O frontend Lovable aprovado da Kogna Escolas está em `apps/kogna-escolas`.

Ele é o app visual oficial da vertical de escolas profissionalizantes e consome o backend real deste repositório:

- `POST /api/login`
- `GET /api/me`
- `GET /api/schools`
- `GET /api/schools/:schoolId/dashboard`
- rotas escolares de leads, pipeline, alertas e tarefas.

Rodar frontend Kogna Escolas:

```bash
npm --prefix apps/kogna-escolas install --no-package-lock
npm run schools:dev
```

Rodar backend real:

```bash
node server.js
```

Variáveis do frontend:

```bash
VITE_API_BASE_URL=http://localhost:8080/api
VITE_APP_NAME=Kogna Escolas
VITE_APP_ENV=development
```
