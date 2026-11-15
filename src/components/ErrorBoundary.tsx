import React, { Component, ErrorInfo, ReactNode } from "react";
import { AlertCircle } from "lucide-react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
    };
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.warn("FormSync Workspace Captured Error:", error, errorInfo);
  }

  handleResume = () => {
    this.setState({ hasError: false, error: null });
    if (typeof window !== "undefined") {
      window.location.reload();
    }
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4 font-sans select-none">
          <div className="w-full max-w-md bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-4 text-center">
            <div className="w-12 h-12 rounded-xl bg-amber-50 border border-amber-200 text-amber-600 flex items-center justify-center mx-auto">
              <AlertCircle className="w-6 h-6 stroke-[1.75]" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Workspace Session Paused
              </h2>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                The workspace was idle or encountered a temporary connection pause. Your data is safely stored in local cache and spreadsheet.
              </p>
            </div>
            <div className="pt-2">
              <button
                type="button"
                onClick={this.handleResume}
                className="w-full h-10.5 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 active:bg-slate-950 text-white text-[13.5px] font-bold cursor-pointer transition-colors shadow-2xs"
              >
                Resume Workspace
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
