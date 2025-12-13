// Chunk size set to 3MB (优化后).
// Rationale:
// - 更小的块 = 更精细的语义分段
// - 3MB MP3 (约 5 分钟) 转换为 ~10MB WAV (16kHz/16bit/Mono)
// - 远低于 Gemini 20MB 限制，留有安全余量
// - 更容易进行语义分块和段落划分
// - 降低单个块的幻觉风险
export const CHUNK_SIZE_BYTES = 3 * 1024 * 1024;

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