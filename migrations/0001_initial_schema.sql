-- AudioScribe FLUX Database Schema
-- Migration: 0001_initial_schema
-- Created: 2025-12-13

-- ==================== 用户 API 配置表 ====================
CREATE TABLE IF NOT EXISTS user_api_configs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL UNIQUE,
  provider TEXT NOT NULL CHECK(provider IN ('gemini', 'deepseek')),
  encrypted_api_key TEXT NOT NULL,
  mode TEXT NOT NULL CHECK(mode IN ('self-hosted', 'shared')),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_user_api_configs_user_id ON user_api_configs(user_id);

-- ==================== 转写任务表 ====================
CREATE TABLE IF NOT EXISTS transcription_jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id TEXT NOT NULL UNIQUE,
  user_id TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  duration REAL,
  
  -- 状态
  status TEXT NOT NULL CHECK(status IN (
    'created', 'uploading', 'processing', 
    'transcribing', 'polishing', 'completed', 'failed'
  )),
  progress INTEGER DEFAULT 0 CHECK(progress >= 0 AND progress <= 100),
  
  -- 音频信息
  audio_url TEXT,
  sample_rate INTEGER,
  channels INTEGER,
  
  -- 转写结果
  raw_transcription TEXT,
  polished_text TEXT,
  
  -- 元数据
  engine TEXT NOT NULL CHECK(engine IN ('gemini', 'deepseek')),
  quality_score REAL,
  
  -- 时间戳
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME,
  
  -- 错误信息
  error TEXT
);

CREATE INDEX idx_transcription_jobs_job_id ON transcription_jobs(job_id);
CREATE INDEX idx_transcription_jobs_user_id ON transcription_jobs(user_id);
CREATE INDEX idx_transcription_jobs_status ON transcription_jobs(status);
CREATE INDEX idx_transcription_jobs_created_at ON transcription_jobs(created_at DESC);

-- ==================== 音频分块表 ====================
CREATE TABLE IF NOT EXISTS audio_chunks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  chunk_data TEXT NOT NULL, -- base64 encoded
  chunk_size INTEGER NOT NULL,
  duration REAL NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('pending', 'processing', 'completed', 'failed')),
  transcription TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (job_id) REFERENCES transcription_jobs(job_id) ON DELETE CASCADE,
  UNIQUE(job_id, chunk_index)
);

CREATE INDEX idx_audio_chunks_job_id ON audio_chunks(job_id);

-- ==================== 文本编辑历史表 ====================
CREATE TABLE IF NOT EXISTS text_edit_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  text_type TEXT NOT NULL CHECK(text_type IN ('raw', 'polished')),
  content TEXT NOT NULL,
  edited_by TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (job_id) REFERENCES transcription_jobs(job_id) ON DELETE CASCADE,
  UNIQUE(job_id, text_type, version)
);

CREATE INDEX idx_text_edit_history_job_id ON text_edit_history(job_id);

-- ==================== 状态转换记录表 ====================
CREATE TABLE IF NOT EXISTS state_transitions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id TEXT NOT NULL,
  from_state TEXT,
  to_state TEXT NOT NULL,
  reason TEXT,
  metadata TEXT, -- JSON
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (job_id) REFERENCES transcription_jobs(job_id) ON DELETE CASCADE
);

CREATE INDEX idx_state_transitions_job_id ON state_transitions(job_id);
CREATE INDEX idx_state_transitions_created_at ON state_transitions(created_at DESC);

-- ==================== 触发器：自动更新 updated_at ====================
CREATE TRIGGER IF NOT EXISTS update_user_api_configs_timestamp 
AFTER UPDATE ON user_api_configs
BEGIN
  UPDATE user_api_configs SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS update_transcription_jobs_timestamp 
AFTER UPDATE ON transcription_jobs
BEGIN
  UPDATE transcription_jobs SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

-- ==================== 视图：任务统计 ====================
CREATE VIEW IF NOT EXISTS job_statistics AS
SELECT 
  user_id,
  COUNT(*) as total_jobs,
  SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_jobs,
  SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed_jobs,
  SUM(CASE WHEN status IN ('processing', 'transcribing', 'polishing') THEN 1 ELSE 0 END) as active_jobs,
  AVG(CASE WHEN status = 'completed' THEN quality_score END) as avg_quality_score,
  SUM(file_size) as total_file_size
FROM transcription_jobs
GROUP BY user_id;

