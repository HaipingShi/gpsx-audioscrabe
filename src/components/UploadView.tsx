import React, { useState } from 'react';
import { FileUpload } from './FileUpload';
import { Button } from './ui/Button';
import { useAppStore } from '../stores/appStore';
import { apiClient } from '../services/apiClient';
import { preprocessAudio } from '../utils/audioProcessor';
import { FileAudio, Loader2, CheckCircle2 } from 'lucide-react';

export const UploadView: React.FC = () => {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const { userId, apiConfig, setCurrentJob, setCurrentView } = useAppStore((state) => ({
    userId: state.userId,
    apiConfig: state.apiConfig,
    setCurrentJob: state.setCurrentJob,
    setCurrentView: state.setCurrentView,
  }));

  const handleFileSelect = (selectedFile: File) => {
    setFile(selectedFile);
    setError(null);
  };

  const handleUpload = async () => {
    if (!file) return;

    // 检查是否配置了 API
    if (!apiConfig && !userId) {
      setError('请先在设置中配置 API Key');
      return;
    }

    setUploading(true);
    setError(null);
    setProgress(0);

    try {
      // 1. 预处理音频
      setProgress(10);
      const audioBuffer = await file.arrayBuffer();
      const processedAudio = await preprocessAudio(audioBuffer);
      
      setProgress(30);

      // 2. 转换为 base64
      const base64Audio = btoa(
        String.fromCharCode(...new Uint8Array(processedAudio))
      );

      setProgress(50);

      // 3. 创建转写任务
      const response = await apiClient.createJob(
        userId || 'anonymous',
        file.name,
        file.size,
        base64Audio
      );

      setProgress(80);

      if (response.success && response.data) {
        // 4. 保存当前任务到状态
        setCurrentJob(response.data);
        
        setProgress(100);

        // 5. 跳转到看板视图
        setTimeout(() => {
          setCurrentView('dashboard');
        }, 500);
      } else {
        throw new Error(response.error || '创建任务失败');
      }
    } catch (err) {
      console.error('Upload failed:', err);
      setError(err instanceof Error ? err.message : '上传失败');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto">
      <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl p-8 shadow-2xl">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <FileAudio className="w-8 h-8 text-purple-400" />
          <h2 className="text-2xl font-bold text-white">上传音频文件</h2>
        </div>

        {/* File Upload */}
        <FileUpload onFileSelect={handleFileSelect} />

        {/* File Info */}
        {file && (
          <div className="mt-6 p-4 bg-slate-700/50 rounded-lg">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-white font-medium">{file.name}</p>
                <p className="text-slate-400 text-sm">
                  {(file.size / 1024 / 1024).toFixed(2)} MB
                </p>
              </div>
              {!uploading && (
                <Button onClick={handleUpload}>
                  开始转写
                </Button>
              )}
            </div>
          </div>
        )}

        {/* Progress */}
        {uploading && (
          <div className="mt-6">
            <div className="flex items-center gap-3 mb-2">
              <Loader2 className="w-5 h-5 text-purple-400 animate-spin" />
              <span className="text-white">处理中... {progress}%</span>
            </div>
            <div className="w-full bg-slate-700 rounded-full h-2">
              <div
                className="bg-purple-600 h-2 rounded-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        {/* Success */}
        {progress === 100 && !uploading && (
          <div className="mt-6 p-4 bg-green-900/30 border border-green-500/50 rounded-lg">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="w-5 h-5 text-green-400" />
              <span className="text-green-300">上传成功！正在跳转到看板...</span>
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="mt-6 p-4 bg-red-900/30 border border-red-500/50 rounded-lg">
            <p className="text-red-300">{error}</p>
          </div>
        )}

        {/* Tips */}
        <div className="mt-8 p-4 bg-blue-900/20 border border-blue-500/30 rounded-lg">
          <h3 className="text-blue-300 font-medium mb-2">💡 使用提示</h3>
          <ul className="text-blue-200 text-sm space-y-1">
            <li>• 支持 MP3、WAV、M4A 格式</li>
            <li>• 文件大小限制：200MB</li>
            <li>• 音频会自动转换为 16kHz 单声道</li>
            <li>• 首次使用请先在设置中配置 API Key</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

