import React from 'react';
import { useAppStore } from '../../stores/appStore';
import type { TranscriptionJob } from '../../types';
import {
  FileAudio,
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
  Eye,
} from 'lucide-react';

interface JobCardProps {
  job: TranscriptionJob;
}

export const JobCard: React.FC<JobCardProps> = ({ job }) => {
  const setCurrentJob = useAppStore((state) => state.setCurrentJob);
  const setCurrentView = useAppStore((state) => state.setCurrentView);

  const handleViewDetails = () => {
    setCurrentJob(job);
    setCurrentView('compare');
  };

  const getStatusIcon = () => {
    switch (job.status) {
      case 'completed':
        return <CheckCircle2 className="w-5 h-5 text-green-400" />;
      case 'failed':
        return <XCircle className="w-5 h-5 text-red-400" />;
      case 'processing':
      case 'transcribing':
      case 'polishing':
        return <Loader2 className="w-5 h-5 text-purple-400 animate-spin" />;
      default:
        return <Clock className="w-5 h-5 text-slate-400" />;
    }
  };

  const getStatusText = () => {
    const statusMap = {
      created: '已创建',
      uploading: '上传中',
      processing: '处理中',
      transcribing: '转写中',
      polishing: '精校中',
      completed: '已完成',
      failed: '失败',
    };
    return statusMap[job.status] || job.status;
  };

  const getStatusColor = () => {
    switch (job.status) {
      case 'completed':
        return 'bg-green-900/30 border-green-500/50 text-green-300';
      case 'failed':
        return 'bg-red-900/30 border-red-500/50 text-red-300';
      case 'processing':
      case 'transcribing':
      case 'polishing':
        return 'bg-purple-900/30 border-purple-500/50 text-purple-300';
      default:
        return 'bg-slate-700/50 border-slate-500/50 text-slate-300';
    }
  };

  return (
    <div className="bg-slate-800/50 backdrop-blur-sm rounded-lg p-4 border border-slate-700 hover:border-purple-500/50 transition-all">
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <FileAudio className="w-5 h-5 text-purple-400" />
          <h3 className="text-white font-medium truncate max-w-[200px]">
            {job.fileName}
          </h3>
        </div>
        {getStatusIcon()}
      </div>

      {/* Status Badge */}
      <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm border mb-3 ${getStatusColor()}`}>
        {getStatusText()}
      </div>

      {/* Progress Bar */}
      {job.status !== 'completed' && job.status !== 'failed' && (
        <div className="mb-3">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
            <span>进度</span>
            <span>{job.progress}%</span>
          </div>
          <div className="w-full bg-slate-700 rounded-full h-1.5">
            <div
              className="bg-purple-600 h-1.5 rounded-full transition-all duration-300"
              style={{ width: `${job.progress}%` }}
            />
          </div>
        </div>
      )}

      {/* Metadata */}
      <div className="space-y-1 text-sm text-slate-400 mb-3">
        <div className="flex items-center justify-between">
          <span>大小</span>
          <span>{(job.fileSize / 1024 / 1024).toFixed(2)} MB</span>
        </div>
        {job.duration && (
          <div className="flex items-center justify-between">
            <span>时长</span>
            <span>{Math.floor(job.duration / 60)}:{(job.duration % 60).toString().padStart(2, '0')}</span>
          </div>
        )}
        <div className="flex items-center justify-between">
          <span>创建时间</span>
          <span>{new Date(job.createdAt).toLocaleDateString()}</span>
        </div>
      </div>

      {/* Actions */}
      {job.status === 'completed' && (
        <button
          onClick={handleViewDetails}
          className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors"
        >
          <Eye className="w-4 h-4" />
          查看详情
        </button>
      )}

      {/* Error Message */}
      {job.error && (
        <div className="mt-3 p-2 bg-red-900/20 border border-red-500/30 rounded text-xs text-red-300">
          {job.error}
        </div>
      )}
    </div>
  );
};

