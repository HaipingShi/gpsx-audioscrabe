# AudioScribe FLUX - 架构设计文档

## 系统架构

### 双模型协作架构

```
┌─────────────────────────────────────────────────────────────┐
│                     音频文件 (MP3/WAV)                        │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
         ┌───────────────────────┐
         │  分块 (6MB chunks)     │
         └───────────┬───────────┘
                     │
         ┌───────────▼───────────┐
         │  并发处理 (限制2个)    │
         └───────────┬───────────┘
                     │
    ┌────────────────┴────────────────┐
    │                                 │
    ▼                                 ▼
┌─────────────┐              ┌─────────────┐
│ Chunk 1     │              │ Chunk 2     │
└──────┬──────┘              └──────┬──────┘
       │                            │
       ▼                            ▼
┌──────────────────────────────────────────┐
│  Phase 1: 预处理 (Preprocessing)          │
│  - 检测格式 (16kHz mono WAV?)            │
│  - 跳过已优化文件                         │
│  - 否则：重采样 + 降噪                    │
└──────────────┬───────────────────────────┘
               ▼
┌──────────────────────────────────────────┐
│  Phase 2: 感知 (Perception - VAD)        │
│  - RMS 能量检测                          │
│  - 跳过静音段                            │
└──────────────┬───────────────────────────┘
               ▼
┌──────────────────────────────────────────┐
│  Phase 3: 转写 (Transcription)           │
│  - Gemini Flash 2.5 (音频原生)           │
│  - 最多重试 3 次                         │
└──────────────┬───────────────────────────┘
               │
               ▼
┌──────────────────────────────────────────┐
│  Phase 4: 验证 (Verification)            │
│  - 熵值检测 (Entropy)                    │
│  - 重复模式检测                          │
│  - 可疑内容咨询 DeepSeek                 │
└──────────────┬───────────────────────────┘
               │
               ├─────────────────────────────┐
               │                             │
               ▼                             ▼
    ┌──────────────────┐         ┌──────────────────┐
    │ 转写完成          │         │ 异步 Polish       │
    │ 立即释放并发槽位   │         │ (后台执行)        │
    │ 开始下一个 chunk  │         │ DeepSeek Chat    │
    └──────────────────┘         └─────────┬────────┘
                                           │
                                           ▼
                                 ┌──────────────────┐
                                 │ 保守型清洗        │
                                 │ - 删除口水词      │
                                 │ - 修正错别字      │
                                 │ - 保留原话        │
                                 └─────────┬────────┘
                                           │
                                           ▼
                                 ┌──────────────────┐
                                 │ 持久化存储        │
                                 │ (LocalStorage)   │
                                 └──────────────────┘
```

## 关键技术决策

### 1. 异步 Polishing 架构

**问题**: 转写等待 Polish 完成才能开始下一个 chunk，效率低下

**解决方案**:
```typescript
// ❌ 旧方案：同步等待
const polished = await polishChunk(currentText);
updateTask(taskId, { polishedText: polished, phase: COMMITTED });
// 阻塞在这里，下一个 chunk 无法开始

// ✅ 新方案：异步执行
updateTask(taskId, { transcription: currentText, phase: POLISHING });
// 立即释放并发槽位，下一个 chunk 可以开始

polishChunk(currentText)
  .then(polished => updateTask(taskId, { polishedText: polished }))
  .catch(err => updateTask(taskId, { polishedText: currentText }));
```

**性能提升**: 
- 2.5 小时音频：从 ~5 小时处理时间 → ~2.5 小时
- 转写和 Polish 完全并行，互不阻塞

### 2. 状态冲突修复

**问题**: 下一个 chunk 的更新会覆盖上一个 chunk 的 Polish 结果

**根本原因**: React 状态批量更新 + 竞态条件

**解决方案**:
```typescript
// ❌ 错误：直接修改可能导致覆盖
setState({ ...state, tasks: newTasks });

// ✅ 正确：函数式更新保证原子性
setState(prev => ({
  ...prev,
  tasks: prev.tasks.map(t => 
    t.id === id ? { ...t, ...updates } : t
  )
}));
```

### 3. 持久化存储

**问题**: 长文本处理中断 → 数据丢失

**解决方案**: LocalStorage 自动保存
```typescript
const updateTask = (id, updates) => {
  setState(prev => {
    const newState = { ...prev, tasks: [...] };
    
    // 异步保存，不阻塞 UI
    setTimeout(() => {
      localStorage.setItem('audioscribe_state', JSON.stringify({
        tasks: newState.tasks.map(t => ({
          id: t.id,
          transcription: t.transcription,
          polishedText: t.polishedText,
          phase: t.phase
        })),
        timestamp: Date.now()
      }));
    }, 0);
    
    return newState;
  });
};
```

**特性**:
- ✅ 自动保存每次更新
- ✅ 页面刷新后自动恢复
- ✅ 24 小时过期机制
- ✅ 非阻塞（setTimeout）
- ✅ 显示缓存大小

## 并发控制

### 限制并发数量 = 2

**原因**:
1. **浏览器限制**: AudioContext 数量有限
2. **内存压力**: 每个 chunk 需要解码音频到内存
3. **API 限流**: 避免触发 Gemini/DeepSeek 限流

**实现**:
```typescript
const CONCURRENCY_LIMIT = 2;
const running = new Set<Promise<void>>();

for (let i = 0; i < chunks.length; i++) {
  // 等待有空闲槽位
  while (running.size >= CONCURRENCY_LIMIT) {
    await Promise.race(running);
  }
  
  const p = processSingleChunk(task, signal)
    .then(() => running.delete(p));
  
  running.add(p);
}
```

## 数据流

### 输入
- 音频文件：MP3, WAV, FLAC, OGG, M4A, AAC
- 最大 200MB（推荐预处理为 16kHz mono）

### 处理
1. **分块**: 6MB chunks（避免 Gemini 20MB 限制）
2. **预处理**: 16kHz mono WAV（如果需要）
3. **VAD**: 跳过静音段
4. **转写**: Gemini Flash 2.5
5. **验证**: 熵值 + 重复检测
6. **咨询**: DeepSeek（可疑内容）
7. **精校**: DeepSeek（保守型清洗）

### 输出
- **双轨制 Markdown**: 原文 + 清洗版（推荐）
- **仅清洗版**: 精校后文本
- **仅原文**: 未处理文本

## 性能指标

| 指标 | 数值 |
|------|------|
| 并发数 | 2 chunks |
| 分块大小 | 6MB |
| 最大重试 | 3 次 |
| Watchdog 超时 | 60 秒 |
| 缓存过期 | 24 小时 |
| 预期速度 | ~1x 实时（2.5h 音频 → 2.5h 处理） |

## 容错机制

1. **Watchdog**: 60 秒超时自动重启
2. **重试逻辑**: 最多 3 次，动态调整 temperature
3. **降级策略**: Polish 失败 → 使用原文
4. **持久化**: 自动保存，防止数据丢失
5. **AbortController**: 可中断任务

## 未来优化方向

1. **IndexedDB**: 替代 LocalStorage，支持更大数据
2. **Web Worker**: 音频处理移到后台线程
3. **流式输出**: 实时显示转写结果
4. **断点续传**: 支持暂停/恢复
5. **批量导出**: 支持导出为 JSON/CSV

