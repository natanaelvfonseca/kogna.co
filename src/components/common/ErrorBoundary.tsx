import { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
    children: ReactNode;
    fallback?: ReactNode;
}

interface State {
    hasError: boolean;
    error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
    public state: State = {
        hasError: false
    };

    public static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error('Uncaught error:', error, errorInfo);
    }

    public render() {
        if (this.state.hasError) {
            if (this.props.fallback) {
                return this.props.fallback;
            }

            return (
                <div className="p-4 bg-red-900/20 border border-red-500/50 rounded-lg m-4">
                    <h2 className="text-xl font-bold text-red-500 mb-2">Ops! Algo deu errado.</h2>
                    <p className="text-text-secondary mb-4">Ocorreu um erro ao renderizar este componente.</p>
                    <pre className="bg-black/30 p-2 rounded text-xs text-red-300 overflow-auto max-h-40">
                        {this.state.error?.message}
                    </pre>
                    <button
                        onClick={() => this.setState({ hasError: false })}
                        className="mt-4 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded transition-colors text-sm"
                    >
                        Tentar novamente
                    </button>
                </div>
            );
        }

        return this.props.children;
    }
}
