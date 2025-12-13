import { Hono } from 'hono';
import type { Env } from '../index';

export const apiRoutes = new Hono<{ Bindings: Env }>();

// ==================== 用户 API 配置管理 ====================

// 保存用户 API 配置（加密存储）
apiRoutes.post('/config', async (c) => {
  try {
    const body = await c.req.json();
    const { userId, provider, apiKey, mode } = body;

    // TODO: 实现加密存储到 D1
    // TODO: 验证 API Key 有效性

    return c.json({
      success: true,
      message: 'API configuration saved successfully',
      data: {
        userId,
        provider,
        mode,
        // 不返回 API Key
      },
    });
  } catch (error) {
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }, 400);
  }
});

// 获取用户 API 配置（不返回 API Key）
apiRoutes.get('/config/:userId', async (c) => {
  try {
    const userId = c.req.param('userId');

    // TODO: 从 D1 读取配置

    return c.json({
      success: true,
      data: {
        userId,
        provider: 'gemini', // 示例数据
        mode: 'self-hosted',
        hasApiKey: true,
      },
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

    // TODO: 实现 API Key 验证逻辑

    return c.json({
      success: true,
      valid: true,
      provider,
    });
  } catch (error) {
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }, 400);
  }
});

// ==================== 转写任务管理 ====================

// 创建转写任务
apiRoutes.post('/jobs', async (c) => {
  try {
    const body = await c.req.json();
    const { userId, fileName, fileSize, audioData } = body;

    // TODO: 创建 Durable Object 实例
    // TODO: 保存到 D1
    // TODO: 上传音频到 R2

    const jobId = crypto.randomUUID();

    return c.json({
      success: true,
      data: {
        jobId,
        status: 'created',
        createdAt: new Date().toISOString(),
      },
    }, 201);
  } catch (error) {
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }, 400);
  }
});

// 获取任务状态
apiRoutes.get('/jobs/:jobId', async (c) => {
  try {
    const jobId = c.req.param('jobId');

    // TODO: 从 D1 或 Durable Object 获取状态

    return c.json({
      success: true,
      data: {
        jobId,
        status: 'processing',
        progress: 45,
        createdAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }, 400);
  }
});

// 获取用户所有任务
apiRoutes.get('/jobs', async (c) => {
  try {
    const userId = c.req.query('userId');
    const status = c.req.query('status');
    const limit = parseInt(c.req.query('limit') || '20');
    const offset = parseInt(c.req.query('offset') || '0');

    // TODO: 从 D1 查询任务列表

    return c.json({
      success: true,
      data: {
        jobs: [],
        total: 0,
        limit,
        offset,
      },
    });
  } catch (error) {
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }, 400);
  }
});

// 获取对比数据（原始转写 vs 精校文本）
apiRoutes.get('/jobs/:jobId/compare', async (c) => {
  try {
    const jobId = c.req.param('jobId');

    // TODO: 从 D1 获取原始转写和精校文本

    return c.json({
      success: true,
      data: {
        jobId,
        rawTranscription: '',
        polishedText: '',
        diff: [],
      },
    });
  } catch (error) {
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }, 400);
  }
});

