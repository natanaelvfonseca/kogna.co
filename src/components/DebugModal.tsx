import { X } from 'lucide-react';

export interface DebugLog {
    timestamp: string;
    type: 'info' | 'error' | 'success' | 'warning';
    message: string;
    details?: any;
}

interface DebugModalProps {
    isOpen: boolean;
    onClose: () => void;
    logs: DebugLog[];
    title?: string;
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
                                    <pre className="text-xs font-mono bg-black/20 p-3 rounded overflow-x-auto whitespace-pre-wrap">
                                        {typeof log.details === 'object' ? JSON.stringify(log.details, null, 2) : log.details}
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
