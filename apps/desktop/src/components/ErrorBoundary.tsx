import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button, EmptyState, Icon } from "@koklo/ui";

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * Last-resort render guard: React unmounts the whole tree on an uncaught render
 * exception, which the user experiences as the app "crashing" to a white window.
 * This boundary keeps the shell alive, surfaces the real error message, and logs
 * the component stack so the failure is diagnosable instead of silent.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("desktop render error:", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <EmptyState
          icon={<Icon name="AlertTriangle" size={28} aria-hidden />}
          title="Something went wrong"
          description={`The view failed to render: ${this.state.error.message}. Your sessions keep running in the background — reload to recover the interface.`}
          action={
            <Button variant="primary" onClick={() => window.location.reload()}>
              Reload
            </Button>
          }
        />
      );
    }
    return this.props.children;
  }
}
