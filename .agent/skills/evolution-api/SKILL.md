---
name: managing-evolution-api
description: Manage WhatsApp instances using Evolution API v2.3 (Kogna SaaS). Use this skill to create instances, connect QR codes, send messages/media, and configure webhooks.
---

# Evolution API v2.3 Skill

## When to use this skill
- When the user wants to integrate WhatsApp features.
- When the user asks to "connect instance", "send message", "configure webhook", or "manage WhatsApp".
- When working with the Kogna SaaS Evolution API (tech.kogna.online).

## Workflow
1.  **Authentication**: Use the global API Key `17311a888b37eb2797bf84cc83e1ca40` for all requests.
2.  **Instance Context**: Identify the `activeInstance` (client's instance name) and use it for all operations.
3.  **Operation**: Execute the requested action (Create, Connect, Send, etc.) using the appropriate endpoint.
4.  **Polling (UI Logic)**: If connecting, poll `connectionState` every 5s until `open`.

## API Configuration

**Base URL**: `https://tech.kogna.online`
**Manager URL**: `https://tech.kogna.online/manager`
**Headers**:
- `apikey`: `17311a888b37eb2797bf84cc83e1ca40`
- `Content-Type`: `application/json`

## Modules & Endpoints

### A. Instance Management (Core)

#### Create Instance
- **Endpoint**: `POST /instance/create`
- **Body**:
  ```json
  {
    "instanceName": "<instance_name>",
    "token": "<optional_token>",
    "qrcode": true,
    "integration": "WHATSAPP-BAILEYS"
  }
  ```

#### Connect / Generate QR
- **Endpoint**: `GET /instance/connect/{instance}`
- **Description**: Returns base64 QR Code or pairing code.

#### Connection Status
- **Endpoint**: `GET /instance/connectionState/{instance}`
- **Response**: `{ "instance": { "state": "open" | "connecting" | "close" } }`

#### Logout / Delete
- **Logout**: `DELETE /instance/logout/{instance}`
- **Delete**: `DELETE /instance/delete/{instance}`

#### Set Presence
- **Endpoint**: `POST /instance/setPresence/{instance}`
- **Body**:
  ```json
  {
    "presence": "composing" | "recording" | "available" | "unavailable"
  }
  ```

#### Set Proxy
- **Endpoint**: `POST /proxy/set/{instance}`
- **Body**:
  ```json
  {
    "proxy": "http://user:pass@host:port"
  }
  ```

### B. Messaging (Interaction)

#### Send Text
- **Endpoint**: `POST /message/sendText/{instance}`
- **Body**:
  ```json
  {
    "number": "5511999999999",
    "text": "Hello World",
    "delay": 1200
  }
  ```

#### Send Media
- **Endpoint**: `POST /message/sendMedia/{instance}`
- **Body**:
  ```json
  {
    "number": "5511999999999",
    "mediatype": "image", // or video, audio, document
    "media": "https://url.to/media.jpg",
    "caption": "Media Caption", // optional
    "fileName": "file.jpg" // optional
  }
  ```

#### Send WhatsApp Business
- **Endpoint**: `POST /message/sendWhatsAppBusiness/{instance}`
- **Body**: (Structure depends on template/interactive message type)

### C. Webhooks & Integrations

#### Set Webhook
- **Endpoint**: `POST /webhook/set/{instance}`
- **Body**:
  ```json
  {
    "url": "https://n8n.webhook.url",
    "enabled": true,
    "events": ["MESSAGES_UPSERT", "CONNECTION_UPDATE", "MESSAGES_UPDATE"]
  }
  ```

#### Typebot / Chatwoot
- **Endpoint**: `POST /integrations/{integration_name}/{instance}`
- **Body**: Configuration specific to the integration (enable/disable, url, etc.).

## UI Logic & Implementation Guide

When building UI components for this skill in the React App:

1.  **Global Instance Context**: Store `activeInstance` in a React Context or Global Store (e.g., Zustand) to avoid asking for the instance name repeatedly.
2.  **Connection Modal**:
    - When "Connect" is clicked, call `GET /instance/connect/{instance}`.
    - Display the QR Code (base64 image).
    - **Start a Poller**: call `GET /instance/connectionState/{instance}` every 5 seconds.
    - **Auto-Close**: If state becomes `open`, close the modal and show success toast.
3.  **Humanization**:
    - Before sending a message, call `setPresence` with `composing` or `recording` for a few seconds to simulate human behavior.

## Example Usage (React/Fetch)

```typescript
const API_KEY = '17311a888b37eb2797bf84cc83e1ca40';
const BASE_URL = 'https://tech.kogna.online';

async function fetchEvolution(endpoint: string, method: string = 'GET', body?: any) {
  const headers = {
    'apikey': API_KEY,
    'Content-Type': 'application/json'
  };
  
  const config: RequestInit = {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  };

  const response = await fetch(`${BASE_URL}${endpoint}`, config);
  return response.json();
}

// Usage
// await fetchEvolution('/instance/create', 'POST', { instanceName: 'client-01', integration: 'WHATSAPP-BAILEYS' });
```
