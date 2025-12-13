import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { apiRoutes } from './routes/api';

// 定义环境变量类型
export interface Env {
  // D1 数据库
  DB: D1Database;

  // R2 存储（稍后添加）
  // AUDIO_BUCKET: R2Bucket;

  // KV 缓存（可选）
  // CACHE: KVNamespace;

  // Durable Objects
  TRANSCRIPTION_PROCESSOR: DurableObjectNamespace;

  // 环境变量
  ENVIRONMENT?: string;
  ENCRYPTION_KEY?: string; // 主加密密钥
}

// 创建 Hono 应用
const app = new Hono<{ Bindings: Env }>();

// 中间件
app.use('*', logger());
app.use('*', cors({
  origin: '*', // 生产环境应该限制为特定域名
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
  exposeHeaders: ['Content-Length'],
  maxAge: 600,
  credentials: true,
}));

// 健康检查
app.get('/', (c) => {
  return c.json({
    service: 'AudioScribe FLUX API',
    version: '1.0.0',
    status: 'healthy',
    timestamp: new Date().toISOString(),
  });
});

// API 路由
app.route('/api', apiRoutes);

// 404 处理
app.notFound((c) => {
  return c.json({
    error: 'Not Found',
    message: 'The requested resource was not found',
    path: c.req.path,
  }, 404);
});

// 错误处理
app.onError((err, c) => {
  console.error('Error:', err);
  return c.json({
    error: 'Internal Server Error',
    message: err.message,
    ...(c.env.ENVIRONMENT === 'development' && { stack: err.stack }),
  }, 500);
});

export default app;

// 导出 Durable Object
export { TranscriptionProcessor } from './durable-objects/TranscriptionProcessor';

