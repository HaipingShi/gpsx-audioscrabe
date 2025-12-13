import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCcw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  private handleReset = () => {
    // 清理 localStorage
    localStorage.removeItem('audioscribe-storage');
    // 重新加载页面
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center p-4">
          <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl border border-red-500/30 p-8 max-w-md w-full">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-12 w-12 bg-red-500/10 rounded-full flex items-center justify-center">
                <AlertTriangle className="text-red-400" size={24} />
              </div>
              <div>
                <h2 className="text-xl font-bold text-white">应用出错了</h2>
                <p className="text-sm text-slate-400">Something went wrong</p>
              </div>
            </div>

            <div className="bg-slate-900/50 rounded-lg p-4 mb-6">
              <p className="text-sm text-slate-300 font-mono">
                {this.state.error?.message || '未知错误'}
              </p>
            </div>

            <button
              onClick={this.handleReset}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors"
            >
              <RefreshCcw size={18} />
              <span>重置应用</span>
            </button>

            <p className="text-xs text-slate-500 text-center mt-4">
              这将清除本地缓存并重新加载页面
            </p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

