// ==================== 用户 API 配置 ====================

export interface UserApiConfig {
  userId: string;
  provider: 'gemini' | 'deepseek';
  apiKey: string; // 加密存储
  mode: 'self-hosted' | 'shared';
  createdAt: string;
  updatedAt: string;
}

// ==================== 转写任务 ====================

export type JobStatus = 
  | 'created'
  | 'uploading'
  | 'processing'
  | 'transcribing'
  | 'polishing'
  | 'completed'
  | 'failed';

export interface TranscriptionJob {
  jobId: string;
  userId: string;
  fileName: string;
  fileSize: number;
  duration?: number;
  status: JobStatus;
  progress: number; // 0-100
  
  // 音频信息
  audioUrl?: string; // R2 URL
  sampleRate?: number;
  channels?: number;
  
  // 转写结果
  rawTranscription?: string;
  polishedText?: string;
  
  // 元数据
  engine: 'gemini' | 'deepseek';
  qualityScore?: number;
  
  // 时间戳
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  
  // 错误信息
  error?: string;
}

// ==================== 音频块 ====================

export interface AudioChunk {
  chunkId: string;
  jobId: string;
  index: number;
  data: string; // base64
  size: number;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  transcription?: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

// ==================== 文本编辑历史 ====================

export interface TextEditHistory {
  historyId: string;
  jobId: string;
  userId: string;
  version: number;
  content: string;
  changeType: 'manual' | 'auto';
  createdAt: string;
}

// ==================== 状态转换 ====================

export interface StateTransition {
  transitionId: string;
  jobId: string;
  fromStatus: JobStatus;
  toStatus: JobStatus;
  reason?: string;
  metadata?: Record<string, any>;
  createdAt: string;
}

// ==================== API 请求/响应 ====================

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface CreateJobRequest {
  userId: string;
  fileName: string;
  fileSize: number;
  audioData: string; // base64
}

export interface CreateJobResponse {
  jobId: string;
  status: JobStatus;
  createdAt: string;
}

export interface JobListQuery {
  userId?: string;
  status?: JobStatus;
  limit?: number;
  offset?: number;
  sortBy?: 'createdAt' | 'updatedAt' | 'fileName';
  sortOrder?: 'asc' | 'desc';
}

export interface JobListResponse {
  jobs: TranscriptionJob[];
  total: number;
  limit: number;
  offset: number;
}

export interface CompareData {
  jobId: string;
  rawTranscription: string;
  polishedText: string;
  diff: DiffItem[];
}

export interface DiffItem {
  type: 'add' | 'remove' | 'unchanged';
  value: string;
  lineNumber?: number;
}

