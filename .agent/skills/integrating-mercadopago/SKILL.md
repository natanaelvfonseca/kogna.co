---
name: integrating-mercadopago
description: Manages Mercado Pago API integration, specifically credential management, authentication, and security best practices. Use when the user asks to integrate payments or configure Mercado Pago.
---

# Integrating Mercado Pago

## When to use this skill
- When the user asks to integrate Mercado Pago payments.
- When configuring API credentials (Access Tokens, Public Keys).
- When troubleshooting authentication errors with Mercado Pago.
- When the user asks about "Public Key", "Access Token", "Client ID", or "Client Secret" in the context of payments.

## Workflow
1.  **Identify Environment**: Determine if the goal is **Sandbox (Test)** or **Production**.
    -   *Test*: Use credentials from the "Test" tab (starting with `TEST-`).
    -   *Production*: Use credentials from the "Production" tab (starting with `APP_USR-` usually).
2.  **Locate Credentials**:
    -   Do NOT hardcode credentials.
    -   Check/Add variable to `.env`:
        -   `MERCADOPAGO_ACCESS_TOKEN` (Backend)
        -   `MERCADOPAGO_PUBLIC_KEY` (Frontend)
3.  **Configure Client**:
    -   If using Node.js, prefer the official SDK or `fetch` with headers.
    -   Ensure `Authorization: Bearer <ACCESS_TOKEN>` is present in API calls.

## Instructions

### 1. Types of Credentials

| Credential | Scope | Description |
| :--- | :--- | :--- |
| **Public Key** | **Frontend** | Used in client-side code (JS/React) to tokenize cards and access payment methods. Safe to expose. |
| **Access Token** | **Backend** | Used in server-side code to create payments, customers, and subscriptions. **NEVER EXPOSE THIS.** |
| **Client ID / Secret** | **OAuth** | Used for OAuth flows (Marketplace setups) where you act on behalf of another seller. |

### 2. Obtaining Credentials
1.  Go to [Mercado Pago Developers > Your Integrations](https://www.mercadopago.com.br/developers/panel/app).
2.  Select or create an Application.
3.  Navigate to **Production > Production Credentials** or **Test > Test Credentials**.
    -   *Note*: Production credentials require activation (business info). Test credentials work immediately.

### 3. Security Best Practices
-   **Header Authentication**: Always send the Access Token in the header, never as a query parameter.
    ```javascript
    const response = await fetch('https://api.mercadopago.com/v1/payments', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${process.env.MERCADOPAGO_ACCESS_TOKEN}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ ... })
    });
    ```
-   **OAuth**: Use OAuth for managing third-party credentials. Do not ask users to share their raw token manually; use the `Client Credentials` flow if acting as a platform.
-   **Renewal**: If credentials are compromised, renew them in the panel. **Immediately update your `.env`** as the old ones will stop working.

### 4. Code Snippets

#### Node.js (Fetch)
```javascript
const createPayment = async (data) => {
    const response = await fetch('https://api.mercadolibre.com/checkout/preferences', { // Or specific endpoint
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${process.env.MERCADOPAGO_ACCESS_TOKEN}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(data)
    });
    return response.json();
};
```
