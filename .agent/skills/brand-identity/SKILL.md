---
name: brand-identity
description: Acts as the Single Source of Truth for Kogna's design system, tech stack, and copy guidelines.
---

# Brand Identity & Design System

## When to use this skill
- When generating UI components or frontend code.
- When writing copy, messages, or content.
- When making design decisions (colors, fonts, spacing).
- When the user references "Kogna Brand", "Design System", or "Style Guide".

## Workflow
1.  **Identify the need**:
    -   **Visuals/Design**: Read `resources/design-tokens.json` to get colors, fonts, and spacing.
    -   **Code/Implementation**: Read `resources/tech-stack.md` to ensure correct framework and library usage.
    -   **Copy/Text**: Read `resources/voice-tone.md` to adopt the correct persona and terminology.
2.  **Apply strict rules**: Use the specific values and constraints found in these files. Do not guess.

## Instructions
-   **Always** prioritize the values in `design-tokens.json` over generic Tailwind colors unless mapped.
-   **Always** follow the "Golden Rule" in `tech-stack.md`: No custom CSS.
-   **Always** check `voice-tone.md` for banned words (e.g., "User") before finalizing text.

## Resources
- [Design Tokens](resources/design-tokens.json)
- [Tech Stack](resources/tech-stack.md)
- [Voice & Tone](resources/voice-tone.md)
