# Kogna Escolas Frontend

Frontend oficial da vertical Kogna Escolas, baseado no visual Lovable aprovado.

Este app vive no mesmo repositório do backend real (`natanaelvfonseca/kogna.co`) e consome a API existente do Kogna.

## Responsabilidades

- Visual, layout e experiência do usuário da Kogna Escolas.
- Login real via `POST /api/login`.
- Sessão JWT com `Authorization: Bearer`.
- Seleção da escola atual via `GET /api/schools`.
- Central da Mel, Pipeline, Leads, Alertas e Tarefas conectados aos endpoints reais.

## Ambiente

Crie `.env.local` a partir de `.env.example`:

```bash
VITE_API_BASE_URL=http://localhost:8080/api
VITE_APP_NAME=Kogna Escolas
VITE_APP_ENV=development
```

## Rodando localmente

Na raiz do repositório:

```bash
npm --prefix apps/kogna-escolas install --no-package-lock
npm run schools:dev
```

Backend em outro terminal:

```bash
node server.js
```

## Build

```bash
npm run schools:build
```

As chaves OpenAI, Mercado Pago e Evolution API continuam somente no backend.
