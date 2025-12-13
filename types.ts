export enum AppStatus {
  IDLE = 'IDLE',
  ANALYZING = 'ANALYZING',
  PREPARING = 'PREPARING',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  ERROR = 'ERROR',
}

export enum AgentPhase {
  IDLE = 'idle',
  PREPROCESSING = 'preprocessing', // 炼：预处理 (16kHz Mono WAV)
  PERCEPTION = 'perception',   // 观：VAD 静音检测
  ACTION = 'action',           // 行：执行转写
  VERIFICATION = 'verification', // 向：本地启发式验证
  CONSULTATION = 'consultation', // 思：Gemini 3 Pro 深度思考错误原因
  POLISHING = 'polishing',     // 文：润色
  REFINEMENT = 'refinement',   // 生：根据顾问建议修正
  HALLUCINATION_DETECTED = 'hallucination_detected', // 🚨 幻觉检测
  PENDING_RETRY = 'pending_retry', // ⏳ 等待重试
  COMMITTED = 'committed',     // 完成
  SKIPPED = 'skipped',         // 跳过
  ERROR = 'error',             // 错误
}

// 幻觉检测结果
export interface HallucinationDetection {
  isHallucination: boolean;
  confidence: number; // 0-1
  reason: string;
  suggestedAction: 'RETRY' | 'KEEP' | 'MANUAL_REVIEW';
  evidence: string[]; // 证据列表
}

// 状态转换记录（用于追溯）
export interface StateTransition {
  from: AgentPhase;
  to: AgentPhase;
  timestamp: number;
  reason?: string;
  metadata?: Record<string, any>;
}

export interface CognitiveTask {
  id: number;
  blob: Blob;
  phase: AgentPhase;
  transcription: string;
  polishedText: string;
  entropy: number;
  retryCount: number;
  logs: string[];
  lastUpdated: number; // For Watchdog timer

  // 状态机追踪
  stateHistory: StateTransition[]; // 状态转换历史

  // 幻觉检测
  hallucinationDetection?: HallucinationDetection;
  needsRetry: boolean; // 是否需要重试

  // 时间追踪
  timings: {
    preprocessingMs?: number;
    transcriptionMs?: number;
    polishingMs?: number;
    totalMs?: number;
  };

  // 质量指标
  qualityScore?: number; // 0-100
  confidenceScore?: number; // 0-1
}

export interface ProcessingState {
  status: AppStatus;
  progress: number;
  tasks: CognitiveTask[]; 
  totalChunks: number;
  error?: string;
}

export interface AudioChunk {
  blob: Blob;
  index: number;
}