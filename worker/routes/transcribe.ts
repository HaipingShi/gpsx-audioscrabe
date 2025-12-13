import { Hono } from 'hono';
import type { Env } from '../index';
import { TranscriptionProcessor } from '../durable-objects/TranscriptionProcessor';

const app = new Hono<{ Bindings: Env }>();

/**
 * POST /api/transcribe
 * 
 * 提交转写任务
 * 
 * 请求体：
 * {
 *   jobId: string;
 *   userId: string;
 *   fileName: string;
 *   audioChunks: string[]; // base64 编码的音频数据
 * }
 */
app.post('/', async (c) => {
  try {
    const { jobId, userId, fileName, audioChunks } = await c.req.json();

    // 验证参数
    if (!jobId || !userId || !fileName || !Array.isArray(audioChunks)) {
      return c.json({ error: 'Invalid parameters' }, 400);
    }

    // 获取 Durable Object 实例
    const id = c.env.TRANSCRIPTION_PROCESSOR.idFromName(jobId);
    const stub = c.env.TRANSCRIPTION_PROCESSOR.get(id);

    // 初始化任务
    await stub.initialize(jobId, userId, fileName, audioChunks.length);

    // 异步开始处理（不等待完成）
    c.executionCtx.waitUntil(
      stub.startProcessing(audioChunks)
    );

    return c.json({
      success: true,
      jobId,
      message: 'Transcription started',
    });

  } catch (error) {
    console.error('Transcription error:', error);
    return c.json({
      error: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

/**
 * GET /api/transcribe/:jobId
 * 
 * 查询任务状态和进度
 */
app.get('/:jobId', async (c) => {
  try {
    const jobId = c.req.param('jobId');

    // 获取 Durable Object 实例
    const id = c.env.TRANSCRIPTION_PROCESSOR.idFromName(jobId);
    const stub = c.env.TRANSCRIPTION_PROCESSOR.get(id);

    // 获取状态
    const state = await stub.getState();

    if (!state) {
      return c.json({ error: 'Job not found' }, 404);
    }

    return c.json({
      jobId: state.jobId,
      status: state.status,
      progress: state.progress,
      fileName: state.fileName,
      rawTranscription: state.rawTranscription,
      polishedText: state.polishedText,
      error: state.error,
      chunks: state.chunks.map(chunk => ({
        id: chunk.id,
        status: chunk.status,
        error: chunk.error,
      })),
      createdAt: state.createdAt,
      updatedAt: state.updatedAt,
    });

  } catch (error) {
    console.error('Query error:', error);
    return c.json({
      error: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

/**
 * DELETE /api/transcribe/:jobId
 * 
 * 取消任务
 */
app.delete('/:jobId', async (c) => {
  try {
    const jobId = c.req.param('jobId');

    // 更新数据库状态为 cancelled
    const stmt = c.env.DB.prepare(`
      UPDATE transcription_jobs
      SET status = 'cancelled', updated_at = ?
      WHERE job_id = ?
    `);

    await stmt.bind(new Date().toISOString(), jobId).run();

    return c.json({
      success: true,
      message: 'Job cancelled',
    });

  } catch (error) {
    console.error('Cancel error:', error);
    return c.json({
      error: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

export default app;

