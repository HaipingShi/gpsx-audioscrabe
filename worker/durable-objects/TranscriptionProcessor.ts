import { DurableObject } from 'cloudflare:workers';
import type { Env } from '../index';

/**
 * 转写任务处理器 - Durable Object
 * 
 * 职责：
 * 1. 管理单个转写任务的完整生命周期
 * 2. 实现状态机：created → uploading → processing → transcribing → polishing → completed/failed
 * 3. 协调音频分块处理
 * 4. 调用 LLM API 进行转写和精校
 * 5. 实时更新进度
 */

export interface JobState {
  jobId: string;
  userId: string;
  fileName: string;
  status: 'created' | 'uploading' | 'processing' | 'transcribing' | 'polishing' | 'completed' | 'failed';
  progress: number;
  chunks: ChunkState[];
  rawTranscription: string;
  polishedText: string;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ChunkState {
  id: number;
  status: 'pending' | 'transcribing' | 'polishing' | 'completed' | 'failed';
  transcription: string | null;
  polishedText: string | null;
  error: string | null;
}

export class TranscriptionProcessor extends DurableObject<Env> {
  private jobState: JobState | null = null;

  constructor(state: DurableObjectState, env: Env) {
    super(state, env);
  }

  /**
   * 初始化任务
   */
  async initialize(jobId: string, userId: string, fileName: string, chunkCount: number): Promise<void> {
    this.jobState = {
      jobId,
      userId,
      fileName,
      status: 'created',
      progress: 0,
      chunks: Array.from({ length: chunkCount }, (_, i) => ({
        id: i,
        status: 'pending',
        transcription: null,
        polishedText: null,
        error: null,
      })),
      rawTranscription: '',
      polishedText: '',
      error: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await this.ctx.storage.put('jobState', this.jobState);
    await this.updateDatabase();
  }

  /**
   * 开始处理任务
   */
  async startProcessing(audioChunks: string[]): Promise<void> {
    if (!this.jobState) {
      this.jobState = await this.ctx.storage.get<JobState>('jobState') || null;
      if (!this.jobState) {
        throw new Error('Job not initialized');
      }
    }

    // 状态转换：created → processing
    await this.transitionState('processing');

    // 并发处理所有音频块
    const promises = audioChunks.map((chunk, index) => 
      this.processChunk(index, chunk)
    );

    try {
      await Promise.all(promises);
      
      // 所有块处理完成，组装最终文本
      this.assembleFinalText();
      
      // 状态转换：processing → completed
      await this.transitionState('completed');
    } catch (error) {
      console.error('Processing failed:', error);
      this.jobState.error = error instanceof Error ? error.message : 'Unknown error';
      await this.transitionState('failed');
    }
  }

  /**
   * 处理单个音频块
   */
  private async processChunk(chunkId: number, audioData: string): Promise<void> {
    if (!this.jobState) return;

    const chunk = this.jobState.chunks[chunkId];
    if (!chunk) return;

    try {
      // 1. 转写阶段
      chunk.status = 'transcribing';
      await this.updateProgress();

      const transcription = await this.transcribeChunk(audioData);
      chunk.transcription = transcription;

      // 2. 精校阶段
      chunk.status = 'polishing';
      await this.updateProgress();

      const polished = await this.polishText(transcription);
      chunk.polishedText = polished;

      // 3. 完成
      chunk.status = 'completed';
      await this.updateProgress();

    } catch (error) {
      console.error(`Chunk ${chunkId} failed:`, error);
      chunk.status = 'failed';
      chunk.error = error instanceof Error ? error.message : 'Unknown error';
      await this.updateProgress();
    }
  }

  /**
   * 调用 LLM API 进行转写
   */
  private async transcribeChunk(audioData: string): Promise<string> {
    // TODO: 调用 Gemini API
    // 这里需要根据用户配置选择使用哪个 API
    await new Promise(resolve => setTimeout(resolve, 1000)); // 模拟 API 调用
    return `[转写文本 ${Date.now()}]`;
  }

  /**
   * 调用 DeepSeek 进行精校
   */
  private async polishText(text: string): Promise<string> {
    // TODO: 调用 DeepSeek API
    await new Promise(resolve => setTimeout(resolve, 500)); // 模拟 API 调用
    return `[精校后: ${text}]`;
  }

  /**
   * 组装最终文本
   */
  private assembleFinalText(): void {
    if (!this.jobState) return;

    // 按顺序组装原始转写文本
    this.jobState.rawTranscription = this.jobState.chunks
      .map(chunk => chunk.transcription || '')
      .join('\n');

    // 按顺序组装精校后文本
    this.jobState.polishedText = this.jobState.chunks
      .map(chunk => chunk.polishedText || '')
      .join('\n');
  }

  /**
   * 状态转换
   */
  private async transitionState(newStatus: JobState['status']): Promise<void> {
    if (!this.jobState) return;

    const oldStatus = this.jobState.status;
    this.jobState.status = newStatus;
    this.jobState.updatedAt = new Date().toISOString();

    // 更新进度
    if (newStatus === 'completed') {
      this.jobState.progress = 100;
    } else if (newStatus === 'failed') {
      // 保持当前进度
    }

    // 持久化到 Durable Object Storage
    await this.ctx.storage.put('jobState', this.jobState);

    // 记录状态转换到数据库
    await this.recordStateTransition(oldStatus, newStatus);

    // 更新数据库中的任务状态
    await this.updateDatabase();
  }

  /**
   * 更新进度
   */
  private async updateProgress(): Promise<void> {
    if (!this.jobState) return;

    // 计算总进度
    const totalChunks = this.jobState.chunks.length;
    const completedChunks = this.jobState.chunks.filter(c => c.status === 'completed').length;
    const transcribingChunks = this.jobState.chunks.filter(c => c.status === 'transcribing').length;
    const polishingChunks = this.jobState.chunks.filter(c => c.status === 'polishing').length;

    // 进度计算：转写占 60%，精校占 40%
    const transcriptionProgress = (completedChunks + transcribingChunks * 0.5) / totalChunks * 60;
    const polishingProgress = (completedChunks + polishingChunks * 0.5) / totalChunks * 40;

    this.jobState.progress = Math.min(99, Math.round(transcriptionProgress + polishingProgress));
    this.jobState.updatedAt = new Date().toISOString();

    // 持久化
    await this.ctx.storage.put('jobState', this.jobState);

    // 更新数据库
    await this.updateDatabase();
  }

  /**
   * 更新数据库中的任务记录
   */
  private async updateDatabase(): Promise<void> {
    if (!this.jobState) return;

    try {
      const stmt = this.env.DB.prepare(`
        UPDATE transcription_jobs
        SET status = ?, progress = ?, raw_transcription = ?, polished_text = ?, error = ?, updated_at = ?
        WHERE job_id = ?
      `);

      await stmt.bind(
        this.jobState.status,
        this.jobState.progress,
        this.jobState.rawTranscription,
        this.jobState.polishedText,
        this.jobState.error,
        this.jobState.updatedAt,
        this.jobState.jobId
      ).run();
    } catch (error) {
      console.error('Failed to update database:', error);
    }
  }

  /**
   * 记录状态转换
   */
  private async recordStateTransition(fromState: string, toState: string): Promise<void> {
    if (!this.jobState) return;

    try {
      const stmt = this.env.DB.prepare(`
        INSERT INTO state_transitions (job_id, from_state, to_state, reason)
        VALUES (?, ?, ?, ?)
      `);

      await stmt.bind(
        this.jobState.jobId,
        fromState,
        toState,
        `State changed from ${fromState || 'null'} to ${toState}`
      ).run();
    } catch (error) {
      console.error('Failed to record state transition:', error);
    }
  }

  /**
   * 获取当前状态
   */
  async getState(): Promise<JobState | null> {
    if (!this.jobState) {
      this.jobState = await this.ctx.storage.get<JobState>('jobState') || null;
    }
    return this.jobState;
  }

  /**
   * HTTP 请求处理（用于 WebSocket 或轮询）
   */
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // 获取状态
    if (url.pathname === '/state' || request.method === 'GET') {
      const state = await this.getState();
      return new Response(JSON.stringify(state), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 初始化任务
    if (url.pathname === '/initialize' && request.method === 'POST') {
      const { jobId, userId, fileName, chunkCount } = await request.json() as {
        jobId: string;
        userId: string;
        fileName: string;
        chunkCount: number;
      };
      await this.initialize(jobId, userId, fileName, chunkCount);
      return new Response(JSON.stringify({ success: true }));
    }

    // 开始处理
    if (url.pathname === '/start' && request.method === 'POST') {
      const { audioChunks } = await request.json() as { audioChunks: string[] };

      // 异步处理，立即返回
      this.ctx.waitUntil(this.startProcessing(audioChunks));

      return new Response(JSON.stringify({ success: true }));
    }

    return new Response('Not found', { status: 404 });
  }
}

