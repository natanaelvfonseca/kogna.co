---
name: creating-kogna-agents
description: Creates custom AI agents for Kogna SaaS tenants, handling multi-tenancy, RAG, and prompt engineering. Use when creating or onboarding a new company's agent.
---

# Kogna Agent Factory

## When to use this skill
- When onboarding a new company to the Kogna platform.
- When a user asks to "create an agent" for a specific tenant.
- When generating a new AI instance with specific RAG requirements.

## Workflow
1.  **Collect Parameters**: Ensure `company_id`, `agent_type`, and `onboarding_data` are provided.
2.  **Initialize Environment**: Run the factory script to set up the tenant's namespace and storage.
3.  **Process RAG**: Ingest provided files into the tenant's isolated vector store.
4.  **Generate Prompt**: Build the system prompt using the appropriate template (SDR, Support, etc.) and custom data.
5.  **Configure Tools**: Attach CRM/Calendar tools based on the plan/permissions.
6.  **Register Agent**: Persist the configuration in the `agent_registry`.

## Instructions
This skill relies on the `factory.js` script located in this directory. 

### Running the Factory
To create an agent, run the following command (ensure `OPENAI_API_KEY` and `DATABASE_URL` are set):

```bash
node .agent/skills/kogna-agent-factory/factory.js --companyId <ID> --type <TYPE> --onboarding <JSON_FILE>
```

### Templates
Templates are stored in `templates/`. Key templates:
- `sdr.md`: Sales Development Rep behavior.
- `suporte.md`: Technical support behavior.
- `onboarding.md`: Customer onboarding specialist.

### Security Rules
- **Isolation**: Never mix data between `company_id` namespaces.
- **Keys**: Do not output API keys in logs.
- **Validation**: Ensure `company_id` exists in the `organizations` table before creation.

## Resources
- [Factory Script](factory.js)
- [Templates](templates/)
- [RAG Module](rag/)
