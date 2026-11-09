import { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle } from '@/components/icons';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export default class AdminErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[AdminErrorBoundary]', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center p-8">
          <AlertTriangle className="w-12 h-12 text-destructive" />
          <h2 className="font-display text-xl text-foreground">Une erreur est survenue</h2>
          <p className="font-body text-sm text-muted-foreground max-w-md">
            {this.state.error.message || 'Erreur inattendue sur cette page.'}
          </p>
          <button
            onClick={() => this.setState({ error: null })}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-body hover:bg-primary/90 transition-colors"
          >
            Réessayer
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
