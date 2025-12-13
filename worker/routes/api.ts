import { Hono } from 'hono';
import type { Env } from '../index';
import { DatabaseService } from '../services/database';
import { encrypt, decrypt, generateId } from '../services/encryption';
import transcribeRoutes from './transcribe';

export const apiRoutes = new Hono<{ Bindings: Env }>();

// 转写任务路由
apiRoutes.route('/transcribe', transcribeRoutes);

// ==================== 用户 API 配置管理 ====================

// 保存用户 API 配置（加密存储）
apiRoutes.post('/config', async (c) => {
  try {
    const body = await c.req.json();
    const { userId, provider, apiKey, mode } = body;

    if (!userId || !provider || !mode) {
      return c.json({
        success: false,
        error: 'Missing required fields',
      }, 400);
    }

    const db = new DatabaseService(c.env.DB);
    const masterKey = c.env.ENCRYPTION_KEY || 'default-key-change-in-production';

    // 加密 API Key
    const encryptedApiKey = await encrypt(apiKey, masterKey);

    // 保存到数据库
    await db.saveUserApiConfig({
      userId,
      provider,
      encryptedApiKey,
      mode,
    });

    return c.json({
      success: true,
      message: 'API configuration saved successfully',
      data: {
        userId,
        provider,
        mode,
        hasApiKey: true,
      },
    });
  } catch (error) {
    console.error('Save config error:', error);
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

// 获取用户 API 配置（不返回 API Key）
apiRoutes.get('/config/:userId', async (c) => {
  try {
    const userId = c.req.param('userId');
    const db = new DatabaseService(c.env.DB);

    const config = await db.getUserApiConfig(userId);

    if (!config) {
      return c.json({
        success: false,
        error: 'Configuration not found',
      }, 404);
    }

    return c.json({
      success: true,
      data: config,
    });
  } catch (error) {
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }, 400);
  }
});

// 验证 API Key
apiRoutes.post('/config/validate', async (c) => {
  try {
    const body = await c.req.json();
    const { provider, apiKey } = body;

    if (!provider || !apiKey) {
      return c.json({
        success: false,
        error: 'Missing provider or apiKey',
      }, 400);
    }

    // 简单验证：检查 API Key 格式
    // 实际生产环境应该调用对应的 API 进行验证
    const isValid = apiKey.length > 10;

    return c.json({
      success: true,
      data: {
        valid: isValid,
        provider,
      },
    });
  } catch (error) {
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

// ==================== 转写任务管理 ====================

// 创建转写任务
apiRoutes.post('/jobs', async (c) => {
  try {
    const body = await c.req.json();
    const { userId, fileName, fileSize, audioData } = body;

    if (!userId || !fileName || !fileSize) {
      return c.json({
        success: false,
        error: 'Missing required fields',
      }, 400);
    }

    const db = new DatabaseService(c.env.DB);
    const jobId = generateId(16);

    // 获取用户配置以确定使用哪个引擎
    const userConfig = await db.getUserApiConfig(userId);
    const engine = userConfig?.provider || 'gemini';

    // 创建任务记录
    await db.createJob({
      jobId,
      userId,
      fileName,
      fileSize,
      status: 'created',
      progress: 0,
      engine,
    });

    // 记录状态转换
    await db.recordStateTransition({
      jobId,
      fromState: null,
      toState: 'created',
      reason: 'Job created',
    });

    // TODO: 上传音频到 R2

    // 🆕 异步启动转写处理
    if (audioData) {
      c.executionCtx.waitUntil(
        (async () => {
          try {
            // 简单分块（每 30 秒一块，假设 16kHz 采样率）
            const chunkSize = 16000 * 30 * 2; // 30 秒 * 2 字节（16-bit）
            const audioBuffer = Buffer.from(audioData, 'base64');
            const chunks: string[] = [];

            for (let i = 0; i < audioBuffer.length; i += chunkSize) {
              const chunk = audioBuffer.slice(i, Math.min(i + chunkSize, audioBuffer.length));
              chunks.push(chunk.toString('base64'));
            }

            // 调用转写 API
            await fetch(`${c.req.url.split('/api')[0]}/api/transcribe`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                jobId,
                userId,
                fileName,
                audioChunks: chunks,
              }),
            });
          } catch (error) {
            console.error('Failed to start transcription:', error);
          }
        })()
      );
    }

    return c.json({
      success: true,
      data: {
        jobId,
        userId,
        fileName,
        fileSize,
        status: 'created',
        progress: 0,
        engine,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    }, 201);
  } catch (error) {
    console.error('Create job error:', error);
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

// 获取任务状态
apiRoutes.get('/jobs/:jobId', async (c) => {
  try {
    const jobId = c.req.param('jobId');
    const db = new DatabaseService(c.env.DB);

    const job = await db.getJob(jobId);

    if (!job) {
      return c.json({
        success: false,
        error: 'Job not found',
      }, 404);
    }

    return c.json({
      success: true,
      data: job,
    });
  } catch (error) {
    console.error('Get job error:', error);
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

// 获取用户所有任务
apiRoutes.get('/jobs', async (c) => {
  try {
    const userId = c.req.query('userId');
    const status = c.req.query('status');
    const limit = parseInt(c.req.query('limit') || '20');
    const offset = parseInt(c.req.query('offset') || '0');

    const db = new DatabaseService(c.env.DB);

    const result = await db.listJobs({
      userId,
      status,
      limit,
      offset,
    });

    return c.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('List jobs error:', error);
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

// 获取对比数据（原始转写 vs 精校文本）
apiRoutes.get('/jobs/:jobId/compare', async (c) => {
  try {
    const jobId = c.req.param('jobId');
    const db = new DatabaseService(c.env.DB);

    const job = await db.getJob(jobId);

    if (!job) {
      return c.json({
        success: false,
        error: 'Job not found',
      }, 404);
    }

    if (!job.rawTranscription || !job.polishedText) {
      return c.json({
        success: false,
        error: 'Transcription not completed yet',
      }, 400);
    }

    // 简单的差异计算（实际应该使用更复杂的 diff 算法）
    const diff = [];

    return c.json({
      success: true,
      data: {
        jobId,
        rawTranscription: job.rawTranscription,
        polishedText: job.polishedText,
        diff,
      },
    });
  } catch (error) {
    console.error('Get compare data error:', error);
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

