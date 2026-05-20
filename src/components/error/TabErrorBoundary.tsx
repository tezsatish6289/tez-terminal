"use client";

import { Component, type ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

/**
 * Local error boundary used to wrap individual tab contents on the
 * simulator page. The global `app/error.tsx` boundary kicks the user
 * out of the whole page; we want failures inside the trade list /
 * score-outcome panel to stay contained so they (a) don't blank the
 * page and (b) surface the actual error message + stack so the next
 * report includes something the engineer can act on.
 *
 * Use case: legacy / partial trade docs occasionally crash a renderer
 * when a field is `undefined` and the formatter wasn't defensive.
 * Wrapping the tab keeps the rest of the cockpit usable.
 */
interface TabErrorBoundaryProps {
  label: string;
  children: ReactNode;
}

interface TabErrorBoundaryState {
  error: Error | null;
}

export class TabErrorBoundary extends Component<
  TabErrorBoundaryProps,
  TabErrorBoundaryState
> {
  state: TabErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): TabErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack?: string }): void {
    // Log to the browser console for the user to copy/paste back if
    // the on-screen panel isn't enough context.
    console.error(`[${this.props.label}] crashed:`, error);
    if (info.componentStack) {
      console.error(`[${this.props.label}] component stack:`, info.componentStack);
    }
  }

  reset = () => this.setState({ error: null });

  render() {
    if (this.state.error) {
      return (
        <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-rose-400" />
            <span className="text-[11px] font-bold uppercase tracking-wider text-rose-400">
              {this.props.label} crashed
            </span>
          </div>
          <pre className="text-[10px] text-rose-300/80 bg-black/40 border border-rose-500/15 rounded-lg p-3 max-h-48 overflow-auto whitespace-pre-wrap break-all">
            {this.state.error.message}
            {this.state.error.stack ? `\n\n${this.state.error.stack}` : ""}
          </pre>
          <button
            onClick={this.reset}
            className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-rose-400 hover:text-rose-300 border border-rose-500/30 rounded-md px-3 py-1.5"
          >
            <RefreshCw className="h-3 w-3" />
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
