/**
 * 数据库服务层
 * 提供所有数据库操作的封装
 */

import type { D1Database } from '@cloudflare/workers-types';
import type {
  UserApiConfig,
  TranscriptionJob,
  AudioChunk,
  TextEditHistory,
  StateTransition,
} from '../types';

export class DatabaseService {
  constructor(private db: D1Database) {}

  // ==================== 用户 API 配置 ====================

  async saveUserApiConfig(config: {
    userId: string;
    provider: string;
    encryptedApiKey: string;
    mode: string;
  }): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO user_api_configs (user_id, provider, encrypted_api_key, mode)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(user_id) DO UPDATE SET
           provider = excluded.provider,
           encrypted_api_key = excluded.encrypted_api_key,
           mode = excluded.mode,
           updated_at = CURRENT_TIMESTAMP`
      )
      .bind(config.userId, config.provider, config.encryptedApiKey, config.mode)
      .run();
  }

  async getUserApiConfig(userId: string): Promise<UserApiConfig | null> {
    const result = await this.db
      .prepare('SELECT * FROM user_api_configs WHERE user_id = ?')
      .bind(userId)
      .first();

    if (!result) return null;

    return {
      userId: result.user_id as string,
      provider: result.provider as any,
      mode: result.mode as any,
      hasApiKey: !!result.encrypted_api_key,
      createdAt: result.created_at as string,
      updatedAt: result.updated_at as string,
    };
  }

  async getEncryptedApiKey(userId: string): Promise<string | null> {
    const result = await this.db
      .prepare('SELECT encrypted_api_key FROM user_api_configs WHERE user_id = ?')
      .bind(userId)
      .first();

    return result?.encrypted_api_key as string | null;
  }

  // ==================== 转写任务 ====================

  async createJob(job: Omit<TranscriptionJob, 'id' | 'createdAt' | 'updatedAt'>): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO transcription_jobs (
          job_id, user_id, file_name, file_size, duration,
          status, progress, audio_url, sample_rate, channels,
          engine
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        job.jobId,
        job.userId,
        job.fileName,
        job.fileSize,
        job.duration || null,
        job.status,
        job.progress,
        job.audioUrl || null,
        job.sampleRate || null,
        job.channels || null,
        job.engine
      )
      .run();
  }

  async getJob(jobId: string): Promise<TranscriptionJob | null> {
    const result = await this.db
      .prepare('SELECT * FROM transcription_jobs WHERE job_id = ?')
      .bind(jobId)
      .first();

    if (!result) return null;

    return this.mapJobFromDb(result);
  }

  async updateJob(
    jobId: string,
    updates: Partial<TranscriptionJob>
  ): Promise<void> {
    const fields: string[] = [];
    const values: any[] = [];

    if (updates.status !== undefined) {
      fields.push('status = ?');
      values.push(updates.status);
    }
    if (updates.progress !== undefined) {
      fields.push('progress = ?');
      values.push(updates.progress);
    }
    if (updates.rawTranscription !== undefined) {
      fields.push('raw_transcription = ?');
      values.push(updates.rawTranscription);
    }
    if (updates.polishedText !== undefined) {
      fields.push('polished_text = ?');
      values.push(updates.polishedText);
    }
    if (updates.error !== undefined) {
      fields.push('error = ?');
      values.push(updates.error);
    }
    if (updates.qualityScore !== undefined) {
      fields.push('quality_score = ?');
      values.push(updates.qualityScore);
    }
    if (updates.status === 'completed') {
      fields.push('completed_at = CURRENT_TIMESTAMP');
    }

    if (fields.length === 0) return;

    values.push(jobId);

    await this.db
      .prepare(
        `UPDATE transcription_jobs SET ${fields.join(', ')} WHERE job_id = ?`
      )
      .bind(...values)
      .run();
  }

  async listJobs(params: {
    userId?: string;
    status?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ jobs: TranscriptionJob[]; total: number }> {
    const conditions: string[] = [];
    const values: any[] = [];

    if (params.userId) {
      conditions.push('user_id = ?');
      values.push(params.userId);
    }
    if (params.status) {
      conditions.push('status = ?');
      values.push(params.status);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Get total count
    const countResult = await this.db
      .prepare(`SELECT COUNT(*) as count FROM transcription_jobs ${whereClause}`)
      .bind(...values)
      .first();

    const total = (countResult?.count as number) || 0;

    // Get jobs
    const limit = params.limit || 20;
    const offset = params.offset || 0;

    const results = await this.db
      .prepare(
        `SELECT * FROM transcription_jobs ${whereClause} 
         ORDER BY created_at DESC LIMIT ? OFFSET ?`
      )
      .bind(...values, limit, offset)
      .all();

    const jobs = results.results.map(this.mapJobFromDb);

    return { jobs, total };
  }

  private mapJobFromDb(row: any): TranscriptionJob {
    return {
      jobId: row.job_id,
      userId: row.user_id,
      fileName: row.file_name,
      fileSize: row.file_size,
      duration: row.duration,
      status: row.status,
      progress: row.progress,
      audioUrl: row.audio_url,
      sampleRate: row.sample_rate,
      channels: row.channels,
      rawTranscription: row.raw_transcription,
      polishedText: row.polished_text,
      engine: row.engine,
      qualityScore: row.quality_score,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      completedAt: row.completed_at,
      error: row.error,
    };
  }

  // ==================== 状态转换记录 ====================

  async recordStateTransition(transition: {
    jobId: string;
    fromState: string | null;
    toState: string;
    reason?: string;
    metadata?: any;
  }): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO state_transitions (job_id, from_state, to_state, reason, metadata)
         VALUES (?, ?, ?, ?, ?)`
      )
      .bind(
        transition.jobId,
        transition.fromState,
        transition.toState,
        transition.reason || null,
        transition.metadata ? JSON.stringify(transition.metadata) : null
      )
      .run();
  }

  async getStateTransitions(jobId: string): Promise<StateTransition[]> {
    const results = await this.db
      .prepare('SELECT * FROM state_transitions WHERE job_id = ? ORDER BY created_at ASC')
      .bind(jobId)
      .all();

    return results.results.map((row: any) => ({
      jobId: row.job_id,
      fromState: row.from_state,
      toState: row.to_state,
      reason: row.reason,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
      timestamp: row.created_at,
    }));
  }

  // ==================== 文本编辑历史 ====================

  async saveTextEdit(edit: {
    jobId: string;
    version: number;
    textType: 'raw' | 'polished';
    content: string;
    editedBy?: string;
  }): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO text_edit_history (job_id, version, text_type, content, edited_by)
         VALUES (?, ?, ?, ?, ?)`
      )
      .bind(edit.jobId, edit.version, edit.textType, edit.content, edit.editedBy || null)
      .run();
  }

  async getTextEditHistory(
    jobId: string,
    textType: 'raw' | 'polished'
  ): Promise<TextEditHistory[]> {
    const results = await this.db
      .prepare(
        'SELECT * FROM text_edit_history WHERE job_id = ? AND text_type = ? ORDER BY version DESC'
      )
      .bind(jobId, textType)
      .all();

    return results.results.map((row: any) => ({
      jobId: row.job_id,
      version: row.version,
      textType: row.text_type,
      content: row.content,
      editedBy: row.edited_by,
      createdAt: row.created_at,
    }));
  }

  // ==================== 音频分块 ====================

  async saveAudioChunk(chunk: {
    jobId: string;
    chunkIndex: number;
    chunkData: string;
    chunkSize: number;
    duration: number;
  }): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO audio_chunks (job_id, chunk_index, chunk_data, chunk_size, duration, status)
         VALUES (?, ?, ?, ?, ?, 'pending')`
      )
      .bind(chunk.jobId, chunk.chunkIndex, chunk.chunkData, chunk.chunkSize, chunk.duration)
      .run();
  }

  async updateChunkTranscription(
    jobId: string,
    chunkIndex: number,
    transcription: string,
    status: 'completed' | 'failed'
  ): Promise<void> {
    await this.db
      .prepare(
        'UPDATE audio_chunks SET transcription = ?, status = ? WHERE job_id = ? AND chunk_index = ?'
      )
      .bind(transcription, status, jobId, chunkIndex)
      .run();
  }

  async getAudioChunks(jobId: string): Promise<AudioChunk[]> {
    const results = await this.db
      .prepare('SELECT * FROM audio_chunks WHERE job_id = ? ORDER BY chunk_index ASC')
      .bind(jobId)
      .all();

    return results.results.map((row: any) => ({
      index: row.chunk_index,
      data: row.chunk_data,
      size: row.chunk_size,
      duration: row.duration,
    }));
  }
}

