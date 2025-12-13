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
  COMMITTED = 'committed',     // 完成
  SKIPPED = 'skipped',         // 跳过
  ERROR = 'error',             // 错误
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