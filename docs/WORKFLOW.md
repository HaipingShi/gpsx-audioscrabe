# AudioScribe 完整工作流程

## 📋 当前流程说明

### 1️⃣ 上传阶段（前端）

**位置**: `src/components/UploadView.tsx`

```typescript
用户选择文件
  ↓
预处理音频（降噪、重采样）
  ↓
转换为 base64
  ↓
调用 POST /api/jobs 创建任务
  ↓
跳转到看板视图
```

**关键代码**:
```typescript
// 创建任务
const response = await apiClient.createJob(
  userId,
  file.name,
  file.size,
  base64Audio
);

// 跳转到看板
setCurrentView('dashboard');
```

---

### 2️⃣ 任务创建（Worker）

**位置**: `worker/routes/api.ts` - `POST /api/jobs`

```typescript
接收上传请求
  ↓
创建任务记录（状态：created）
  ↓
异步调用 POST /api/transcribe 启动转写
  ↓
立即返回任务信息
```

**关键代码**:
```typescript
// 1. 创建任务记录
await db.createJob({
  jobId,
  userId,
  fileName,
  fileSize,
  status: 'created',
  progress: 0,
});

// 2. 异步启动转写
c.executionCtx.waitUntil(
  fetch('/api/transcribe', {
    method: 'POST',
    body: JSON.stringify({
      jobId,
      userId,
      fileName,
      audioChunks: chunks,
    }),
  })
);
```

---

### 3️⃣ 转写处理（Durable Object）

**位置**: `worker/routes/transcribe.ts` + `worker/durable-objects/TranscriptionProcessor.ts`

```typescript
接收转写请求
  ↓
获取 Durable Object 实例
  ↓
初始化任务状态
  ↓
异步开始处理
  ↓
状态流转：created → processing → transcribing → polishing → completed
```

**状态机流程**:
```
created (0%)
  ↓
processing (10-20%)  - 音频预处理
  ↓
transcribing (20-70%) - 调用 Gemini API
  ↓
polishing (70-99%)    - 调用 DeepSeek API
  ↓
completed (100%)      - 完成
```

---

### 4️⃣ 看板轮询（前端）

**位置**: `src/components/dashboard/DashboardView.tsx`

```typescript
加载任务列表
  ↓
检测是否有进行中的任务
  ↓
如果有，每 2 秒轮询一次
  ↓
更新任务状态和进度
```

**关键代码**:
```typescript
// 轮询逻辑
useEffect(() => {
  const hasActiveJobs = jobs.some(
    (job) => job.status === 'processing' || 
             job.status === 'transcribing' || 
             job.status === 'polishing'
  );

  if (!hasActiveJobs) return;

  const interval = setInterval(() => {
    loadJobs(); // 重新加载任务列表
  }, 2000);

  return () => clearInterval(interval);
}, [jobs]);
```

---

## 🎯 用户操作流程

### 正常流程

1. **上传文件**
   - 用户在"上传"页面选择音频文件
   - 点击"开始转写"按钮
   - 等待预处理完成（进度条 0-100%）

2. **自动跳转到看板**
   - 上传完成后自动跳转
   - 看到任务卡片，状态为"已创建"
   - 进度为 0%

3. **自动开始处理**
   - 后台自动启动转写
   - 状态变为"处理中" → "转写中" → "精校中"
   - 进度条实时更新

4. **查看结果**
   - 状态变为"已完成"，进度 100%
   - 点击"查看详情"按钮
   - 跳转到对比视图查看结果

### 异常流程

1. **上传失败**
   - 显示错误信息
   - 用户可以重新上传

2. **处理失败**
   - 任务卡片显示"失败"状态
   - 显示错误原因
   - 用户可以重新上传

---

## 🔧 当前问题和解决方案

### ❌ 问题：任务一直停留在"已创建"状态

**原因**:
1. ~~创建任务后没有调用 Durable Object~~ ✅ 已修复
2. ~~看板没有轮询更新~~ ✅ 已修复
3. Durable Object 的 LLM API 还未实现（模拟延迟）

**解决方案**:
1. ✅ 在 `POST /api/jobs` 中异步调用 `/api/transcribe`
2. ✅ 在看板中添加轮询逻辑
3. ⏳ 实现真实的 LLM API 调用

---

## 🚀 下一步工作

### 1. 测试当前流程
```bash
# 启动 Worker
npm run dev:worker

# 启动前端
npm run dev

# 上传文件，观察：
# - 是否自动跳转到看板
# - 任务状态是否从 created 变为 processing
# - 进度条是否更新
```

### 2. 实现 LLM API
- Gemini API 转写
- DeepSeek API 精校
- 幻觉检测逻辑

### 3. 优化用户体验
- 添加 Toast 通知
- 优化轮询策略（WebSocket）
- 添加任务取消功能

