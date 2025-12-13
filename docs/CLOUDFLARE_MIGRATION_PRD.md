# AudioScribe FLUX - Cloudflare 迁移 PRD

## 📋 项目概述

### 项目名称
AudioScribe FLUX - Cloudflare 全栈重构

### 项目目标
将现有的纯前端音频转写应用迁移到 Cloudflare 全栈平台，实现：
1. **灵活的 API 配置**：支持用户自定义 LLM API Key 或使用共享后端 API
2. **数据持久化存储**：所有转写记录保存到云端数据库
3. **多用户协作**：支持团队共享和个人使用两种模式
4. **可视化看板**：类似 Wiki/博客的转写记录展示
5. **双窗口对比**：原始转写与精校文本并排对比预览
6. **历史记录查询**：强大的搜索和筛选功能
7. **更好的可扩展性**：模块化架构便于功能扩展

### 当前架构
```
前端 (React + Vite)
  ↓
浏览器端处理:
  - 音频预处理 (Web Audio API)
  - 文件分块
  - 直接调用 Gemini/DeepSeek API (API Key 暴露)
  - LocalStorage 缓存
```

### 目标架构
```
前端 (Cloudflare Pages)
  ├─ 用户自定义 API 模式 → 直接调用 Gemini/DeepSeek API
  └─ 共享 API 模式 ↓ HTTPS
                    ↓
后端 (Cloudflare Workers + Durable Objects)
  ↓
数据层 (D1 + R2)
  - 用户配置（加密存储 API Key）
  - 转写记录
  - 元数据
```

---

## 🎯 核心需求

### 功能需求

#### FR-1: 用户认证（可选，Phase 2）
- 支持邮箱登录
- Session 管理
- 多用户隔离

#### FR-2: 音频上传
- **输入**: 音频文件 (MP3/WAV/M4A, 最大 200MB)
- **处理**: 
  - 前端：文件验证、格式检查
  - 后端：上传到 R2 存储
- **输出**: Job ID

#### FR-3: 音频预处理
- **位置**: 前端（保持现有逻辑）
- **功能**: 
  - 转换为 16kHz Mono WAV
  - 降噪处理
  - 分块（3MB/chunk）
- **原因**: Workers 不支持 Web Audio API

#### FR-4: 转写任务提交
- **输入**: Job ID + 音频 chunks (base64)
- **处理**: 
  - 创建 Durable Object 实例
  - 并发调用 Gemini API
  - 幻觉检测
  - DeepSeek 精校
- **输出**: 任务状态 + 进度

#### FR-5: 实时进度查询
- **接口**: WebSocket 或轮询
- **数据**: 
  - 总进度 (0-100%)
  - 每个 chunk 的状态
  - 错误信息

#### FR-6: 结果持久化
- **存储**: Cloudflare D1
- **数据**: 
  - 原始转写
  - 精校文本
  - 元数据（时间、引擎、质量分数）
  - 状态历史

#### FR-7: 历史记录
- **功能**: 
  - 查看所有转写任务
  - 按日期/状态筛选
  - 重新下载结果

#### FR-8: 结果下载
- **格式**:
  - 双轨制 Markdown
  - 纯精校版
  - 原始转写版
- **元数据**: 包含时间戳、引擎、质量指标

#### FR-9: 用户 API 配置管理 ⭐ 新增
- **功能**:
  - 用户可以设置自己的 Gemini/DeepSeek API Key
  - 支持两种模式切换：
    - **自带 API 模式**：使用用户自己的 API Key，前端直接调用
    - **共享 API 模式**：使用后端配置的团队共享 API Key
  - API Key 加密存储到 D1 数据库
  - 支持 API Key 有效性验证
  - 显示 API 使用统计（调用次数、Token 消耗）
- **安全**:
  - 前端使用 Web Crypto API 加密
  - 后端使用 AES-256-GCM 加密存储
  - 仅用户本人可见和修改

#### FR-10: 可视化看板（类似 Wiki/博客）⭐ 新增
- **布局**:
  - 卡片式网格布局（类似 Notion/Trello）
  - 每个卡片显示：
    - 文件名 + 缩略图（音频波形）
    - 状态标签（处理中/已完成/失败）
    - 创建时间 + 时长
    - 质量评分 + 引擎标识
    - 快速操作按钮（预览/下载/删除）
- **分组和筛选**:
  - 按状态分组（全部/处理中/已完成/失败）
  - 按日期筛选（今天/本周/本月/自定义）
  - 按引擎筛选（Gemini/DeepSeek）
  - 全文搜索（文件名 + 转写内容）
- **排序**:
  - 按创建时间（默认）
  - 按文件大小
  - 按质量评分
  - 按处理时长

#### FR-11: 双窗口对比预览 ⭐ 新增
- **布局**:
  - 左右分屏显示：
    - **左侧**：原始转写（Raw Transcription）
    - **右侧**：精校文本（Polished Text）
  - 支持调整分屏比例（拖拽中间分隔线）
- **交互功能**:
  - 同步滚动（可开关）
  - 差异高亮显示（类似 Git Diff）
  - 逐段对比（按段落/句子对齐）
  - 点击段落跳转到对应位置
- **编辑功能**:
  - 支持在线编辑精校文本
  - 实时保存到数据库
  - 版本历史记录（可选）
- **导出功能**:
  - 单独导出左侧或右侧
  - 导出对比视图（HTML/PDF）
  - 复制到剪贴板

---

## 🏗️ 技术架构

### 前端 (Cloudflare Pages)

#### 技术栈
- React 19
- TypeScript 5.8
- Vite 6
- TailwindCSS (可选)

#### 核心模块
```typescript
src/
├── components/
│   ├── FileUpload.tsx              // 文件上传
│   ├── AudioProcessor.tsx          // 音频预处理
│   ├── TranscriptionBoard.tsx      // 转写进度看板
│   ├── HistoryList.tsx             // 历史记录列表
│   ├── DashboardView.tsx           // 📊 可视化看板（新增）
│   ├── CompareView.tsx             // 🔄 双窗口对比预览（新增）
│   ├── SettingsPanel.tsx           // ⚙️ 用户设置面板（新增）
│   └── ApiConfigForm.tsx           // 🔑 API 配置表单（新增）
├── services/
│   ├── api.ts                      // 后端 API 调用
│   ├── audioProcessor.ts           // Web Audio API
│   ├── auth.ts                     // 认证（可选）
│   ├── llmClient.ts                // 🆕 LLM API 客户端（支持前端直调）
│   ├── encryption.ts               // 🆕 前端加密工具（Web Crypto API）
│   └── apiConfig.ts                // 🆕 API 配置管理
├── hooks/
│   ├── useTranscription.ts         // 转写状态管理
│   ├── usePolling.ts               // 轮询进度
│   ├── useApiConfig.ts             // 🆕 API 配置钩子
│   └── useCompareView.ts           // 🆕 对比视图钩子
├── store/
│   └── configStore.ts              // 🆕 用户配置状态管理（Zustand/Jotai）
└── types/
    └── index.ts                    // 共享类型
```

#### API 调用层
```typescript
// src/services/api.ts
export class AudioScribeAPI {
  private baseUrl: string;

  // 上传音频
  async uploadAudio(file: File): Promise<{ jobId: string }>;

  // 提交转写任务（支持两种模式）
  async submitTranscription(
    jobId: string,
    chunks: Chunk[],
    mode: 'self' | 'shared'  // 🆕 API 模式
  ): Promise<void>;

  // 查询任务状态
  async getJobStatus(jobId: string): Promise<JobStatus>;

  // 获取历史记录（支持看板视图）
  async getHistory(params?: {
    status?: string;
    dateRange?: [number, number];
    engine?: string;
    search?: string;
    sortBy?: 'createdAt' | 'fileSize' | 'qualityScore' | 'duration';
    sortOrder?: 'asc' | 'desc';
  }): Promise<Job[]>;

  // 下载结果
  async downloadResult(jobId: string, format: 'dual' | 'markdown' | 'raw'): Promise<Blob>;

  // 🆕 API 配置管理
  async saveApiConfig(config: ApiConfig): Promise<void>;
  async getApiConfig(): Promise<ApiConfig | null>;
  async validateApiKey(provider: 'gemini' | 'deepseek', apiKey: string): Promise<boolean>;

  // 🆕 获取对比数据
  async getCompareData(jobId: string): Promise<{
    chunks: Array<{
      index: number;
      raw: string;
      polished: string;
      diff: DiffResult;
    }>;
  }>;

  // 🆕 更新精校文本
  async updatePolishedText(jobId: string, chunkIndex: number, text: string): Promise<void>;
}

// 🆕 前端直调 LLM API 客户端
// src/services/llmClient.ts
export class LLMClient {
  private apiKey: string;
  private provider: 'gemini' | 'deepseek';

  constructor(provider: 'gemini' | 'deepseek', apiKey: string) {
    this.provider = provider;
    this.apiKey = apiKey;
  }

  // 直接调用 Gemini/DeepSeek API
  async transcribe(audioData: string): Promise<string>;
  async polish(text: string): Promise<string>;
  async detectHallucination(text: string): Promise<HallucinationResult>;
}
```

---

### 后端 (Cloudflare Workers)

#### 技术栈
- Cloudflare Workers (TypeScript)
- Hono (轻量级 Web 框架)
- Cloudflare D1 (SQLite)
- Cloudflare R2 (对象存储)
- Durable Objects (有状态计算)

#### 项目结构
```typescript
workers/
├── src/
│   ├── index.ts                        // API Gateway
│   ├── durable-objects/
│   │   └── TranscriptionProcessor.ts   // 转写任务处理器
│   ├── routes/
│   │   ├── upload.ts                   // POST /api/upload
│   │   ├── transcribe.ts               // POST /api/transcribe
│   │   ├── jobs.ts                     // GET /api/jobs/:id
│   │   ├── history.ts                  // GET /api/history
│   │   ├── config.ts                   // 🆕 GET/POST /api/config (API 配置)
│   │   └── compare.ts                  // 🆕 GET /api/jobs/:id/compare (对比数据)
│   ├── services/
│   │   ├── gemini.ts                   // Gemini API 封装
│   │   ├── deepseek.ts                 // DeepSeek API 封装
│   │   ├── hallucination.ts            // 幻觉检测
│   │   ├── storage.ts                  // D1/R2 操作
│   │   └── encryption.ts               // 🆕 加密服务（AES-256-GCM）
│   ├── db/
│   │   ├── schema.sql                  // 数据库 Schema
│   │   └── queries.ts                  // SQL 查询
│   └── types/
│       └── index.ts                    // 类型定义
├── wrangler.toml                       // Cloudflare 配置
└── package.json
```

#### API 端点设计

##### 1. 上传音频
```
POST /api/upload
Content-Type: multipart/form-data

Request:
{
  file: File
}

Response:
{
  jobId: "uuid-v4",
  uploadUrl: "https://r2.../audio.mp3" (可选)
}
```

##### 2. 提交转写任务
```
POST /api/transcribe
Content-Type: application/json

Request:
{
  jobId: "uuid-v4",
  chunks: [
    {
      index: 0,
      audioData: "base64-encoded-wav",
      size: 3145728
    },
    ...
  ]
}

Response:
{
  jobId: "uuid-v4",
  status: "processing",
  totalChunks: 16
}
```

##### 3. 查询任务状态
```
GET /api/jobs/:jobId

Response:
{
  id: "uuid-v4",
  status: "processing" | "completed" | "failed",
  progress: 75,
  totalChunks: 16,
  completedChunks: 12,
  chunks: [
    {
      id: "chunk-uuid",
      index: 0,
      phase: "COMMITTED",
      rawTranscription: "...",
      polishedText: "...",
      metadata: {
        engine: "Gemini Flash",
        transcriptionMs: 1200,
        polishingMs: 800,
        qualityScore: 95
      }
    },
    ...
  ],
  createdAt: 1702345678000,
  completedAt: 1702345890000
}
```

##### 4. 获取历史记录
```
GET /api/history?limit=20&offset=0

Response:
{
  jobs: [
    {
      id: "uuid-v4",
      filename: "meeting.mp3",
      status: "completed",
      totalChunks: 16,
      createdAt: 1702345678000
    },
    ...
  ],
  total: 100
}
```

##### 5. 下载结果
```
GET /api/jobs/:jobId/download?format=dual

Response:
Content-Type: text/markdown
Content-Disposition: attachment; filename="meeting_DualTrack.md"

# 转写结果...
```

##### 6. 保存 API 配置 🆕
```
POST /api/config
Content-Type: application/json

Request:
{
  "provider": "gemini" | "deepseek",
  "apiKey": "encrypted-api-key",  // 前端已加密
  "mode": "self" | "shared"
}

Response:
{
  "success": true,
  "message": "API 配置已保存"
}
```

##### 7. 获取 API 配置 🆕
```
GET /api/config

Response:
{
  "gemini": {
    "hasKey": true,  // 不返回实际 Key
    "mode": "self"
  },
  "deepseek": {
    "hasKey": false,
    "mode": "shared"
  }
}
```

##### 8. 验证 API Key 🆕
```
POST /api/config/validate
Content-Type: application/json

Request:
{
  "provider": "gemini",
  "apiKey": "your-api-key"
}

Response:
{
  "valid": true,
  "message": "API Key 有效"
}
```

##### 9. 获取对比数据 🆕
```
GET /api/jobs/:jobId/compare

Response:
{
  "jobId": "uuid-v4",
  "chunks": [
    {
      "index": 0,
      "raw": "原始转写文本...",
      "polished": "精校后文本...",
      "diff": {
        "additions": ["新增内容"],
        "deletions": ["删除内容"],
        "modifications": [
          {
            "before": "修改前",
            "after": "修改后"
          }
        ]
      }
    },
    ...
  ]
}
```

##### 10. 更新精校文本 🆕
```
PUT /api/jobs/:jobId/chunks/:chunkIndex
Content-Type: application/json

Request:
{
  "polishedText": "用户编辑后的文本..."
}

Response:
{
  "success": true,
  "updatedAt": 1702345678000
}
```

---

### 数据库设计 (Cloudflare D1)

```sql
-- 用户表（Phase 2）
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- 🆕 用户 API 配置表
CREATE TABLE user_api_configs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  provider TEXT NOT NULL CHECK(provider IN ('gemini', 'deepseek')),
  encrypted_api_key TEXT NOT NULL,  -- AES-256-GCM 加密
  encryption_iv TEXT NOT NULL,      -- 初始化向量
  mode TEXT NOT NULL CHECK(mode IN ('self', 'shared')),
  is_active INTEGER DEFAULT 1,

  -- 使用统计
  total_calls INTEGER DEFAULT 0,
  total_tokens INTEGER DEFAULT 0,
  last_used_at INTEGER,

  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,

  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE(user_id, provider)
);

-- 转写任务表
CREATE TABLE transcription_jobs (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  filename TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  file_url TEXT,
  status TEXT NOT NULL CHECK(status IN ('pending', 'processing', 'completed', 'failed')),
  total_chunks INTEGER NOT NULL,
  completed_chunks INTEGER DEFAULT 0,
  error_message TEXT,

  -- 🆕 API 模式标识
  api_mode TEXT CHECK(api_mode IN ('self', 'shared')),

  -- 🆕 质量统计（用于看板展示）
  average_quality_score REAL,
  total_duration_ms INTEGER,

  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  completed_at INTEGER,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- 音频块表
CREATE TABLE audio_chunks (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  phase TEXT NOT NULL,
  raw_transcription TEXT,
  polished_text TEXT,
  transcription_engine TEXT DEFAULT 'Gemini Flash',

  -- 质量指标
  entropy REAL,
  quality_score REAL,
  confidence_score REAL,
  retry_count INTEGER DEFAULT 0,

  -- 幻觉检测
  hallucination_detected INTEGER DEFAULT 0,
  hallucination_confidence REAL,
  hallucination_reason TEXT,

  -- 时间统计
  preprocessing_ms INTEGER,
  transcription_ms INTEGER,
  polishing_ms INTEGER,
  total_ms INTEGER,

  -- 🆕 编辑历史（用于对比视图）
  edit_count INTEGER DEFAULT 0,
  last_edited_at INTEGER,
  last_edited_by TEXT,

  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,

  FOREIGN KEY (job_id) REFERENCES transcription_jobs(id) ON DELETE CASCADE,
  UNIQUE(job_id, chunk_index)
);

-- 🆕 文本编辑历史表（用于版本控制）
CREATE TABLE text_edit_history (
  id TEXT PRIMARY KEY,
  chunk_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  polished_text TEXT NOT NULL,
  edited_by TEXT,
  edit_reason TEXT,
  created_at INTEGER NOT NULL,

  FOREIGN KEY (chunk_id) REFERENCES audio_chunks(id) ON DELETE CASCADE,
  UNIQUE(chunk_id, version)
);

-- 状态转换历史
CREATE TABLE state_transitions (
  id TEXT PRIMARY KEY,
  chunk_id TEXT NOT NULL,
  from_phase TEXT,
  to_phase TEXT NOT NULL,
  log_message TEXT,
  timestamp INTEGER NOT NULL,
  FOREIGN KEY (chunk_id) REFERENCES audio_chunks(id) ON DELETE CASCADE
);

-- 索引
CREATE INDEX idx_jobs_user_status ON transcription_jobs(user_id, status);
CREATE INDEX idx_jobs_created ON transcription_jobs(created_at DESC);
CREATE INDEX idx_chunks_job ON audio_chunks(job_id, chunk_index);
CREATE INDEX idx_transitions_chunk ON state_transitions(chunk_id, timestamp);

-- 🆕 新增索引
CREATE INDEX idx_api_configs_user ON user_api_configs(user_id, provider);
CREATE INDEX idx_edit_history_chunk ON text_edit_history(chunk_id, version DESC);
CREATE INDEX idx_jobs_quality ON transcription_jobs(average_quality_score DESC);
CREATE INDEX idx_jobs_duration ON transcription_jobs(total_duration_ms);
```

---

## 🔧 Durable Objects 设计

### TranscriptionProcessor

```typescript
export class TranscriptionProcessor implements DurableObject {
  private state: DurableObjectState;
  private env: Env;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    switch (url.pathname) {
      case '/process':
        return this.processChunks(request);
      case '/status':
        return this.getStatus();
      default:
        return new Response('Not found', { status: 404 });
    }
  }

  private async processChunks(request: Request): Promise<Response> {
    const { jobId, chunks } = await request.json();

    // 并发处理 chunks（限制并发数为 2）
    const results = await this.processConcurrently(chunks, 2);

    // 保存到 D1
    await this.saveResults(jobId, results);

    return Response.json({ status: 'completed' });
  }

  private async processConcurrently(
    chunks: Chunk[],
    concurrency: number
  ): Promise<ChunkResult[]> {
    // 实现并发控制逻辑
  }

  private async processChunk(chunk: Chunk): Promise<ChunkResult> {
    // 1. 调用 Gemini 转写
    const transcription = await this.transcribeWithGemini(chunk);

    // 2. 幻觉检测
    const hallucination = await this.detectHallucination(transcription);

    // 3. DeepSeek 精校
    const polished = await this.polishWithDeepSeek(transcription);

    return { transcription, polished, hallucination };
  }
}
```

---

## 📊 数据流

### 完整流程

#### 流程 A: 用户自带 API 模式（前端直调）🆕

```
1. 用户配置 API Key
   - 前端：设置页面输入 Gemini/DeepSeek API Key
   - 前端：使用 Web Crypto API 加密
   - 调用 POST /api/config 保存到 D1
   ↓
2. 用户上传音频
   ↓
3. 前端：文件验证 + 预处理
   - 转换为 16kHz Mono WAV
   - 分块（3MB/chunk）
   ↓
4. 前端：调用 POST /api/upload
   ↓
5. 后端：创建 Job 记录（标记为 api_mode='self'）
   ↓
6. 前端：直接调用 LLM API（使用用户自己的 Key）
   - 并发处理 chunks
   - 调用 Gemini API 转写
   - 幻觉检测
   - 调用 DeepSeek API 精校
   ↓
7. 前端：将结果保存到后端
   - 调用 PUT /api/jobs/:id/chunks/:index
   - 保存到 D1
   ↓
8. 前端：显示实时进度
   ↓
9. 完成：查看结果
   - 可视化看板展示
   - 双窗口对比预览
   - 下载结果
```

#### 流程 B: 共享 API 模式（后端处理）

```
1. 用户上传音频
   ↓
2. 前端：文件验证 + 预处理
   - 转换为 16kHz Mono WAV
   - 分块（3MB/chunk）
   ↓
3. 前端：调用 POST /api/upload
   ↓
4. 后端：保存到 R2（可选）+ 创建 Job 记录（api_mode='shared'）
   ↓
5. 前端：调用 POST /api/transcribe
   - 发送所有 chunks (base64)
   ↓
6. 后端：创建 Durable Object 实例
   ↓
7. Durable Object：并发处理
   - 调用 Gemini API（使用后端 Key）
   - 幻觉检测
   - DeepSeek 精校
   - 保存到 D1
   ↓
8. 前端：轮询 GET /api/jobs/:id
   - 显示实时进度
   ↓
9. 完成：查看结果
   - 可视化看板展示
   - 双窗口对比预览
   - 下载结果
```

---

## 🚀 实施计划

### Phase 1: 基础架构（2 周）

#### Week 1: 后端基础
- [ ] 创建 Cloudflare Workers 项目
- [ ] 配置 wrangler.toml
- [ ] 实现 API Gateway (Hono)
- [ ] 创建 D1 数据库 + Schema
- [ ] 实现基础 CRUD 操作

#### Week 2: 核心功能
- [ ] 实现 Durable Object
- [ ] 集成 Gemini API
- [ ] 集成 DeepSeek API
- [ ] 实现幻觉检测逻辑
- [ ] 单元测试

### Phase 2: 前端迁移（1.5 周）

#### Week 3: 基础功能
- [ ] 创建 API 调用层
- [ ] 重构文件上传组件
- [ ] 实现进度轮询
- [ ] 更新 UI 显示逻辑
- [ ] 集成测试

#### Week 4 (前半): 新增功能 🆕
- [ ] 实现用户设置面板
- [ ] 实现 API 配置表单
- [ ] 实现前端加密工具（Web Crypto API）
- [ ] 实现 LLM 客户端（支持前端直调）
- [ ] 实现 API 模式切换逻辑

### Phase 3: 可视化功能（1.5 周）🆕

#### Week 4 (后半): 看板视图
- [ ] 实现卡片式布局组件
- [ ] 实现筛选和排序功能
- [ ] 实现全文搜索
- [ ] 实现音频波形缩略图
- [ ] 响应式设计优化

#### Week 5: 对比预览
- [ ] 实现双窗口分屏布局
- [ ] 实现同步滚动
- [ ] 实现差异高亮算法
- [ ] 实现在线编辑功能
- [ ] 实现版本历史（可选）

### Phase 4: 数据持久化（1 周）

- [ ] 实现结果保存到 D1
- [ ] 实现历史记录查询（支持高级筛选）
- [ ] 实现结果下载（多格式）
- [ ] 实现 API 配置加密存储
- [ ] 性能优化

### Phase 5: 优化与部署（1 周）

- [ ] R2 音频存储（可选）
- [ ] 错误处理优化
- [ ] 日志和监控
- [ ] 安全审计（API Key 加密）
- [ ] 生产环境部署
- [ ] 用户文档编写

---

## 💰 成本估算

### Cloudflare 免费额度
```
✅ Workers: 100,000 请求/天
✅ D1: 5GB 存储 + 500 万行读取/天
✅ R2: 10GB 存储 + 1000 万次读取/天
✅ Pages: 无限请求
```

### 预估月成本（中等使用）
```
假设：每天 100 个文件，每个 44MB，16 chunks

Workers:
- 100 × 16 × 3 = 4,800 请求/天
- 免费额度内

D1:
- 100 × 16 = 1,600 行写入/天
- 免费额度内

R2（可选）:
- 100 × 44MB = 4.4GB/天
- 成本: ~$2/月

外部 API:
- Gemini: 按 token 计费
- DeepSeek: 按 token 计费
- 预估: $10-20/月

总计: $12-22/月
```

---

## 🔒 安全考虑

### API Key 管理

#### 后端共享 API Key
```bash
# 使用 Cloudflare Secrets
wrangler secret put GEMINI_API_KEY
wrangler secret put DEEPSEEK_API_KEY
```

#### 用户自定义 API Key 🆕
```typescript
// 前端加密（Web Crypto API）
async function encryptApiKey(apiKey: string): Promise<{
  encrypted: string;
  iv: string;
}> {
  const encoder = new TextEncoder();
  const data = encoder.encode(apiKey);

  // 生成随机 IV
  const iv = crypto.getRandomValues(new Uint8Array(12));

  // 使用用户密码派生密钥（PBKDF2）
  const key = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: encoder.encode(userId), // 使用用户 ID 作为 salt
      iterations: 100000,
      hash: 'SHA-256'
    },
    await crypto.subtle.importKey(
      'raw',
      encoder.encode(userPassword),
      'PBKDF2',
      false,
      ['deriveKey']
    ),
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt']
  );

  // 加密
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    data
  );

  return {
    encrypted: btoa(String.fromCharCode(...new Uint8Array(encrypted))),
    iv: btoa(String.fromCharCode(...iv))
  };
}

// 后端加密（AES-256-GCM）
async function encryptApiKeyBackend(apiKey: string, env: Env): Promise<{
  encrypted: string;
  iv: string;
}> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(env.ENCRYPTION_KEY),
    { name: 'AES-GCM' },
    false,
    ['encrypt']
  );

  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(apiKey)
  );

  return {
    encrypted: btoa(String.fromCharCode(...new Uint8Array(encrypted))),
    iv: btoa(String.fromCharCode(...iv))
  };
}
```

### CORS 配置
```typescript
// 仅允许自己的域名
const allowedOrigins = [
  'https://audioscribe.pages.dev',
  'http://localhost:3000'
];
```

### 速率限制
```typescript
// 每个 IP 每分钟最多 10 个请求
const rateLimiter = new RateLimiter({
  limit: 10,
  window: 60000
});

// 🆕 用户自带 API 模式不受速率限制（前端直调）
// 共享 API 模式受速率限制保护
```

### 数据隔离 🆕
```typescript
// 确保用户只能访问自己的数据
async function validateUserAccess(userId: string, jobId: string, env: Env): Promise<boolean> {
  const job = await env.DB.prepare(
    'SELECT user_id FROM transcription_jobs WHERE id = ?'
  ).bind(jobId).first();

  return job?.user_id === userId;
}
```

---

## 📈 监控指标

### 关键指标
- 转写成功率
- 平均处理时间
- 幻觉检测率
- API 错误率
- 用户活跃度

### 日志
```typescript
// 使用 Cloudflare Analytics
console.log({
  event: 'transcription_completed',
  jobId,
  duration: totalMs,
  chunks: totalChunks,
  hallucinationRate: detected / total
});
```

---

## 🎯 成功标准

### 功能完整性
- ✅ 所有现有功能正常工作
- ✅ 支持用户自定义 API Key 和共享 API 两种模式 🆕
- ✅ API Key 安全加密存储（前端 + 后端双重加密）🆕
- ✅ 数据持久化到 D1
- ✅ 历史记录可查询（支持高级筛选）🆕
- ✅ 可视化看板展示（卡片式布局）🆕
- ✅ 双窗口对比预览（支持在线编辑）🆕

### 性能指标
- ✅ 转写速度不低于现有版本
- ✅ 前端直调模式性能更优（减少网络跳转）🆕
- ✅ 99% 可用性
- ✅ P95 响应时间 < 5s
- ✅ 看板加载时间 < 2s 🆕
- ✅ 对比视图渲染时间 < 1s 🆕

### 用户体验 🆕
- ✅ API 配置流程简单直观
- ✅ 看板视图美观易用
- ✅ 对比预览交互流畅
- ✅ 支持移动端响应式布局

### 安全性 🆕
- ✅ API Key 加密存储（AES-256-GCM）
- ✅ 用户数据隔离
- ✅ CORS 和速率限制保护
- ✅ 通过安全审计

### 成本控制
- ✅ 用户自带 API 模式：零成本（用户自付）🆕
- ✅ 共享 API 模式：月成本 < $50（中等使用）
- ✅ 充分利用免费额度

---

## 📚 参考资料

- [Cloudflare Workers 文档](https://developers.cloudflare.com/workers/)
- [Cloudflare D1 文档](https://developers.cloudflare.com/d1/)
- [Durable Objects 文档](https://developers.cloudflare.com/durable-objects/)
- [Hono 框架](https://hono.dev/)

---

## 🤝 团队协作

### 角色分工
- **前端开发**:
  - React 组件开发
  - API 集成（双模式支持）🆕
  - 可视化看板实现 🆕
  - 对比预览功能 🆕
  - 加密工具开发 🆕
- **后端开发**:
  - Workers + Durable Objects
  - API 端点开发
  - 加密服务实现 🆕
  - 数据库优化
- **UI/UX 设计**: 🆕
  - 看板视图设计
  - 对比预览交互设计
  - 移动端适配
- **DevOps**:
  - 部署 + 监控
  - 安全审计 🆕

### 沟通渠道
- 每日站会
- GitHub Issues
- 技术文档
- 设计评审会 🆕

### 关键里程碑 🆕
- **Week 2 结束**: 后端核心功能完成，可进行 API 测试
- **Week 4 结束**: 前端基础功能 + API 配置完成
- **Week 5 结束**: 可视化功能完成，进入测试阶段
- **Week 6 结束**: 全部功能完成，准备上线

---

## 📝 附录

### A. 技术选型对比 🆕

#### 前端状态管理
| 方案 | 优点 | 缺点 | 选择 |
|------|------|------|------|
| Zustand | 轻量、简单、TypeScript 友好 | 生态较小 | ✅ 推荐 |
| Jotai | 原子化、性能好 | 学习曲线 | 可选 |
| Redux Toolkit | 成熟、生态丰富 | 过于复杂 | ❌ |

#### 加密方案
| 方案 | 优点 | 缺点 | 选择 |
|------|------|------|------|
| Web Crypto API | 原生、安全、性能好 | 浏览器兼容性 | ✅ 前端 |
| AES-256-GCM | 行业标准、安全性高 | 需要密钥管理 | ✅ 后端 |

#### 对比视图实现
| 方案 | 优点 | 缺点 | 选择 |
|------|------|------|------|
| react-diff-viewer | 开箱即用 | 定制性差 | 可选 |
| 自定义实现 | 完全可控 | 开发成本高 | ✅ 推荐 |

### B. 数据迁移计划 🆕

如果已有 LocalStorage 数据：

```typescript
// 迁移脚本
async function migrateLocalStorageToCloud() {
  const localJobs = JSON.parse(localStorage.getItem('transcription_jobs') || '[]');

  for (const job of localJobs) {
    // 上传到云端
    await api.createJob({
      filename: job.filename,
      chunks: job.chunks,
      createdAt: job.createdAt
    });
  }

  // 清理本地数据
  localStorage.removeItem('transcription_jobs');
}
```

### C. 性能优化建议 🆕

1. **看板视图**:
   - 虚拟滚动（react-window）
   - 图片懒加载
   - 分页加载（每页 20 条）

2. **对比预览**:
   - 使用 Web Worker 计算差异
   - 虚拟化长文本渲染
   - 防抖编辑保存

3. **API 调用**:
   - 请求去重（SWR/React Query）
   - 乐观更新
   - 缓存策略

---

**文档版本**: v2.0 🆕
**创建日期**: 2025-12-13
**最后更新**: 2025-12-13
**负责人**: [Your Name]
**变更说明**:
- 新增用户自定义 API 配置功能
- 新增可视化看板视图
- 新增双窗口对比预览
- 调整实施计划（5 周 → 6 周）
- 新增安全加密方案
- 新增性能优化建议

