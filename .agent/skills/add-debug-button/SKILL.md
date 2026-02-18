---
name: add-debug-button
description: Adds a "Debug Info" button and modal to a specific page or component for real-time logging and debugging. Use when the user asks to "debug this page" or "add debug info".
---

# Add Debug Info Button

## When to use this skill
- When the user asks to add a "Debug Info" button to a page.
- When the user wants to see real-time logs (API calls, errors) in the frontend.
- When you need to instrument a component to capture and display execution flow.

## Workflow
- [ ] Verify `src/components/DebugModal.tsx` exists (create if missing).
- [ ] Import `DebugModal`, `DebugLog` and `Bug` icon in the target component.
- [ ] Add state variables for `logs` and `debugOpen`.
- [ ] Create the `addLog` helper function.
- [ ] Instrument key functions (API calls, handlers) with `addLog`.
- [ ] Add the "Debug Info" button to the UI (usually top-right of the main content).
- [ ] Add the `<DebugModal />` component to the JSX.

## Instructions

### 1. Verify `DebugModal` Component
Ensure `src/components/DebugModal.tsx` exists. If not, create it with the standard implementation (see Resources below).

### 2. Implementation Template

In the target component (e.g., `SomePage.tsx`), add the following:

#### Imports
```tsx
import { useState } from 'react';
import { Bug } from 'lucide-react';
import { DebugModal, DebugLog } from '../../components/DebugModal'; // Adjust path as needed
```

#### State and Helper
Inside the component function:
```tsx
    // ... existing state
    const [debugOpen, setDebugOpen] = useState(false);
    const [logs, setLogs] = useState<DebugLog[]>([]);

    const addLog = (type: DebugLog['type'], message: string, details?: any) => {
        const newLog = {
            timestamp: new Date().toLocaleTimeString(),
            type,
            message,
            details
        };
        setLogs(prev => [newLog, ...prev]);
        // Also log to console for redundancy
        console.log(`[Debug] ${message}`, details || '');
    };
```

#### Instrumenting Code
Replace `console.log` or add new logs at critical points:
```tsx
    const handleAction = async () => {
        addLog('info', 'Action started...');
        try {
            // ... logic
            addLog('success', 'Action completed');
        } catch (error) {
            addLog('error', 'Action failed', error);
        }
    };
```

#### UI Elements
Add the button (adjust styling to match the page header):
```tsx
<div className="flex items-center justify-between">
    <h1>Page Title</h1>
    <button
        onClick={() => setDebugOpen(true)}
        className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-muted-foreground bg-muted hover:text-foreground hover:bg-muted/80 rounded-md transition-colors"
    >
        <Bug size={14} />
        Debug Info
    </button>
</div>
```

Add the modal (usually at the end of the return statement):
```tsx
<DebugModal
    isOpen={debugOpen}
    onClose={() => setDebugOpen(false)}
    logs={logs}
    title="Page Name Debug"
/>
```

## Resources

### Standard `DebugModal.tsx`
If the component is missing, create it at `src/components/DebugModal.tsx`:
```tsx
import { X } from 'lucide-react';

interface DebugModalProps {
    isOpen: boolean;
    onClose: () => void;
    logs: DebugLog[];
    title?: string;
}

export interface DebugLog {
    timestamp: string;
    type: 'info' | 'error' | 'success' | 'warning';
    message: string;
    details?: any;
}

export function DebugModal({ isOpen, onClose, logs, title = "Debug" }: DebugModalProps) {
    if (!isOpen) return null;

    const getTypeColor = (type: DebugLog['type']) => {
        switch (type) {
            case 'error': return 'text-red-500 bg-red-500/10 border-red-500/20';
            case 'success': return 'text-green-500 bg-green-500/10 border-green-500/20';
            case 'warning': return 'text-yellow-500 bg-yellow-500/10 border-yellow-500/20';
            default: return 'text-blue-500 bg-blue-500/10 border-blue-500/20';
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="bg-surface border border-border rounded-2xl shadow-2xl max-w-4xl w-full max-h-[80vh] flex flex-col">
                <div className="flex items-center justify-between p-6 border-b border-border">
                    <div>
                        <h2 className="text-xl font-bold text-text-primary">🐛 {title}</h2>
                        <p className="text-sm text-text-secondary mt-1">Logs detalhados da última operação</p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-lg">
                        <X size={20} />
                    </button>
                </div>
                <div className="flex-1 overflow-y-auto p-6 space-y-3">
                    {logs.length === 0 ? (
                        <div className="text-center text-text-secondary py-12">No logs yet.</div>
                    ) : (
                        logs.map((log, idx) => (
                            <div key={idx} className={`border rounded-lg p-4 ${getTypeColor(log.type)}`}>
                                <div className="flex items-center gap-2 mb-2">
                                    <span className="text-xs font-mono opacity-70">{log.timestamp}</span>
                                    <span className="text-xs font-bold uppercase">{log.type}</span>
                                </div>
                                <p className="font-medium mb-2">{log.message}</p>
                                {log.details && (
                                    <pre className="text-xs font-mono bg-black/20 p-3 rounded overflow-x-auto">
                                        {JSON.stringify(log.details, null, 2)}
                                    </pre>
                                )}
                            </div>
                        ))
                    )}
                </div>
                <div className="p-6 border-t border-border flex justify-end">
                    <button onClick={onClose} className="px-4 py-2 bg-primary text-white rounded-lg">Fechar</button>
                </div>
            </div>
        </div>
    );
}
```
