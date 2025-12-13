// Chunk size set to 6MB. 
// Rationale: A 6MB MP3 (approx 10 mins) converts to ~20MB WAV (16kHz/16bit/Mono).
// We must stay under Gemini's 20MB inline payload limit.
export const CHUNK_SIZE_BYTES = 6 * 1024 * 1024; 

export const SUPPORTED_MIME_TYPES = [
  'audio/mp3',
  'audio/mpeg',
  'audio/wav',
  'audio/x-wav',
  'audio/ogg',
  'audio/flac',
  'audio/x-m4a',
  'audio/aac'
];

// === 双模型架构 ===
// Gemini Flash: 快速音频转写（粗写）
export const AUDIO_MODEL = 'gemini-2.5-flash';

// Gemini Pro: 智能咨询和验证（已弃用，改用 DeepSeek）
export const REASONING_MODEL = 'gemini-3-pro-preview';

// DeepSeek: 文本精校和智能咨询（精校）
export const DEEPSEEK_MODEL = 'deepseek-chat';