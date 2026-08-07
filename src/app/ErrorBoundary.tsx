// Error Boundary（05_Frontend.md 6章。RootLayout の責務）。
import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("Unhandled error", error, info);
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="mx-auto max-w-md p-8 text-center">
          <p className="font-medium">画面の表示中に問題が発生しました</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-4 rounded bg-indigo-600 px-4 py-2 text-white"
          >
            再読み込み
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
