"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "./Button";
import { Note } from "./Note";

type Props = {
  children: ReactNode;
  fallbackTitle?: string;
  onReset?: () => void;
};

type State = { error: Error | null };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("ErrorBoundary", error, info.componentStack);
  }

  private reset = () => {
    this.setState({ error: null });
    this.props.onReset?.();
  };

  render() {
    if (this.state.error) {
      return (
        <div className="p-4">
          <Note tone="danger" className="mb-3">
            {this.props.fallbackTitle ?? "حدث خطأ غير متوقع في هذه الشاشة."}
          </Note>
          <p className="m-0 mb-3 text-xs text-text-3">{this.state.error.message}</p>
          <Button type="button" size="sm" variant="primary" onClick={this.reset}>
            إعادة المحاولة
          </Button>
        </div>
      );
    }
    return this.props.children;
  }
}
