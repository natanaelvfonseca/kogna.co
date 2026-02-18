---
name: frontend-debugging
description: Debugs frontend black screens and reliability issues by implementing a Global Error Boundary to capture stack traces. Use when the user reports a "black screen", "blank page", or uncaught frontend exception.
---

# Frontend Debugging Skill

## When to use this skill
- When the user reports a "black screen", "white screen of death", or blank page.
- When the frontend crashes without a visible error message.
- When the user mentions "Application Critical Error" or similar React crashes.

## Workflow

1.  **Diagnosis**: Confirm if the issue is a rendering crash (black/white screen).
2.  **Implementation**:
    -   Create `src/components/common/GlobalErrorBoundary.tsx` using the resource template.
    -   Wrap the application root (usually `main.tsx` or `index.tsx`) with `GlobalErrorBoundary`.
3.  **Capture**:
    -   Ask the user to refresh the page.
    -   **CRITICAL**: Ask the user to copy and paste the *exact* error message and component stack trace displayed by the Error Boundary.
4.  **Analysis & Fix**:
    -   Read the stack trace to identify the crashing component and line number.
    -   Fix the specific error (e.g., missing import, undefined property, hook violation).

## Instructions

### 1. Create the Error Boundary
Use the `GlobalErrorBoundary` component which captures unhandled errors and displays them in a high-contrast modal overlay. This bypasses the crash and allows the user to see what went wrong.

Reference file: `resources/GlobalErrorBoundary.tsx`

### 2. Wrap the Application Root
Locate the entry point (e.g., `src/main.tsx`). Import the `GlobalErrorBoundary` and wrap the `<App />` component.

```tsx
import { GlobalErrorBoundary } from './components/common/GlobalErrorBoundary';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <GlobalErrorBoundary>
      <App />
    </GlobalErrorBoundary>
  </React.StrictMode>,
)
```

### 3. Analyze Traces
When the user provides the stack trace, look for:
- **ReferenceError**: Missing imports or variables (e.g., `useEffect is not defined`).
- **TypeError**: Reading properties of undefined (e.g., `cannot read properties of undefined (reading 'map')`).
- **Invariant Violation**: Hook rules broken (e.g., hooks inside loops/conditions).

## Resources
- [Global Error Boundary Template](resources/GlobalErrorBoundary.tsx)
