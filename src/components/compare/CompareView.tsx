import React, { useEffect, useState, useRef } from 'react';
import { useAppStore } from '../../stores/appStore';
import { apiClient } from '../../services/apiClient';
import { ComparePanel } from './ComparePanel';
import { Loader2, ArrowLeft, Download, Copy } from 'lucide-react';
import type { CompareData } from '../../types';

export const CompareView: React.FC = () => {
  const { currentJob, setCurrentView } = useAppStore((state) => ({
    currentJob: state.currentJob,
    setCurrentView: state.setCurrentView,
  }));

  const [compareData, setCompareData] = useState<CompareData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncScroll, setSyncScroll] = useState(true);

  const leftPanelRef = useRef<HTMLDivElement>(null);
  const rightPanelRef = useRef<HTMLDivElement>(null);

  // 加载对比数据
  useEffect(() => {
    if (!currentJob) {
      setCurrentView('dashboard');
      return;
    }

    const loadCompareData = async () => {
      setLoading(true);
      setError(null);

      try {
        const response = await apiClient.getCompareData(currentJob.jobId);

        if (response.success && response.data) {
          setCompareData(response.data);
        } else {
          throw new Error(response.error || '加载失败');
        }
      } catch (err) {
        console.error('Failed to load compare data:', err);
        setError(err instanceof Error ? err.message : '加载失败');
      } finally {
        setLoading(false);
      }
    };

    loadCompareData();
  }, [currentJob]);

  // 同步滚动
  const handleScroll = (source: 'left' | 'right') => {
    if (!syncScroll) return;

    const sourcePanel = source === 'left' ? leftPanelRef.current : rightPanelRef.current;
    const targetPanel = source === 'left' ? rightPanelRef.current : leftPanelRef.current;

    if (sourcePanel && targetPanel) {
      targetPanel.scrollTop = sourcePanel.scrollTop;
    }
  };

  // 导出文本
  const handleExport = (type: 'raw' | 'polished') => {
    if (!compareData) return;

    const text = type === 'raw' ? compareData.rawTranscription : compareData.polishedText;
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${currentJob?.fileName}_${type}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // 复制文本
  const handleCopy = (type: 'raw' | 'polished') => {
    if (!compareData) return;

    const text = type === 'raw' ? compareData.rawTranscription : compareData.polishedText;
    navigator.clipboard.writeText(text);
  };

  if (!currentJob) {
    return null;
  }

  return (
    <div className="max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <button
            onClick={() => setCurrentView('dashboard')}
            className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
            返回看板
          </button>
          <h2 className="text-2xl font-bold text-white">{currentJob.fileName}</h2>
        </div>

        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 text-slate-300">
            <input
              type="checkbox"
              checked={syncScroll}
              onChange={(e) => setSyncScroll(e.target.checked)}
              className="rounded"
            />
            同步滚动
          </label>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 text-purple-400 animate-spin" />
        </div>
      ) : error ? (
        <div className="p-6 bg-red-900/30 border border-red-500/50 rounded-lg">
          <p className="text-red-300">{error}</p>
        </div>
      ) : compareData ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Left Panel - Raw Transcription */}
          <ComparePanel
            ref={leftPanelRef}
            title="原始转写"
            text={compareData.rawTranscription}
            onScroll={() => handleScroll('left')}
            actions={
              <>
                <button
                  onClick={() => handleCopy('raw')}
                  className="p-2 text-slate-400 hover:text-white transition-colors"
                  title="复制"
                >
                  <Copy className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handleExport('raw')}
                  className="p-2 text-slate-400 hover:text-white transition-colors"
                  title="导出"
                >
                  <Download className="w-4 h-4" />
                </button>
              </>
            }
          />

          {/* Right Panel - Polished Text */}
          <ComparePanel
            ref={rightPanelRef}
            title="精校文本"
            text={compareData.polishedText}
            onScroll={() => handleScroll('right')}
            editable
            actions={
              <>
                <button
                  onClick={() => handleCopy('polished')}
                  className="p-2 text-slate-400 hover:text-white transition-colors"
                  title="复制"
                >
                  <Copy className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handleExport('polished')}
                  className="p-2 text-slate-400 hover:text-white transition-colors"
                  title="导出"
                >
                  <Download className="w-4 h-4" />
                </button>
              </>
            }
          />
        </div>
      ) : null}
    </div>
  );
};

