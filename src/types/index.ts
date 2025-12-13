// ==================== API 配置 ====================

export type LLMProvider = 'gemini' | 'deepseek';
export type ApiMode = 'self-hosted' | 'shared';

export interface ApiConfig {
  provider: LLMProvider;
  apiKey: string;
  mode: ApiMode;
}

export interface UserApiConfig {
  userId: string;
  provider: LLMProvider;
  mode: ApiMode;
  hasApiKey: boolean;
  createdAt?: string;
  updatedAt?: string;
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
  audioUrl?: string;
  sampleRate?: number;
  channels?: number;
  
  // 转写结果
  rawTranscription?: string;
  polishedText?: string;
  
  // 元数据
  engine: LLMProvider;
  qualityScore?: number;
  
  // 时间戳
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  
  // 错误信息
  error?: string;
}

// ==================== 音频处理 ====================

export interface AudioChunk {
  index: number;
  data: string; // base64
  size: number;
  duration: number;
}

export interface AudioMetadata {
  duration: number;
  sampleRate: number;
  channels: number;
  bitDepth: number;
  size: number;
}

// ==================== 对比数据 ====================

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

// ==================== UI 状态 ====================

export interface DashboardFilters {
  status?: JobStatus;
  dateFrom?: string;
  dateTo?: string;
  searchQuery?: string;
  sortBy?: 'createdAt' | 'updatedAt' | 'fileName' | 'fileSize';
  sortOrder?: 'asc' | 'desc';
}

export interface PaginationState {
  page: number;
  pageSize: number;
  total: number;
}

// ==================== API 响应 ====================

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface JobListResponse {
  jobs: TranscriptionJob[];
  total: number;
  limit: number;
  offset: number;
}

// ==================== 应用状态 ====================

export interface AppState {
  // 用户配置
  userId: string | null;
  apiConfig: ApiConfig | null;
  
  // 当前任务
  currentJob: TranscriptionJob | null;
  
  // 任务列表
  jobs: TranscriptionJob[];
  jobsLoading: boolean;
  jobsError: string | null;
  
  // UI 状态
  dashboardFilters: DashboardFilters;
  pagination: PaginationState;
  
  // 视图状态
  currentView: 'upload' | 'dashboard' | 'compare' | 'settings';
}

