import { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
    children: ReactNode;
}

interface State {
    hasError: boolean;
    error?: Error;
    errorInfo?: ErrorInfo;
}

export class GlobalErrorBoundary extends Component<Props, State> {
    public state: State = {
        hasError: false
    };

    public static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error('Uncaught error caught by GlobalErrorBoundary:', error, errorInfo);
        this.setState({ errorInfo });
    }

    public render() {
        if (this.state.hasError) {
            return (
                <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/90 p-4">
                    <div className="bg-gray-900 border border-red-500/50 rounded-xl p-6 max-w-3xl w-full shadow-2xl max-h-[90vh] overflow-y-auto">
                        <h1 className="text-2xl font-bold text-red-500 mb-2">Erro Crítico na Aplicação</h1>
                        <p className="text-gray-300 mb-4">A aplicação encontrou um erro inesperado e precisou ser interrompida.</p>

                        <div className="bg-black/50 p-4 rounded-lg border border-white/10 mb-6">
                            <h3 className="text-sm font-bold text-red-400 mb-2 font-mono">{this.state.error?.name}: {this.state.error?.message}</h3>
                            <pre className="text-xs text-gray-400 font-mono whitespace-pre-wrap overflow-x-auto">
                                {this.state.errorInfo?.componentStack || this.state.error?.stack}
                            </pre>
                        </div>

                        <div className="flex justify-end gap-3">
                            <button
                                onClick={() => window.location.reload()}
                                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors font-medium text-sm"
                            >
                                Recarregar Página
                            </button>
                        </div>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}
