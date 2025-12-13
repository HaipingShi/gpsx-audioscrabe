# AudioScribe FLUX - 状态机设计

## 状态转换图

```
                    ┌─────────────┐
                    │    IDLE     │ (初始状态)
                    └──────┬──────┘
                           │
                           ▼
                  ┌────────────────┐
                  │ PREPROCESSING  │ (预处理音频)
                  └────────┬───────┘
                           │
                           ▼
                    ┌──────────────┐
                    │  PERCEPTION  │ (VAD 静音检测)
                    └──────┬───────┘
                           │
                    ┌──────┴──────┐
                    │             │
                    ▼             ▼
              ┌─────────┐   ┌─────────┐
              │ SKIPPED │   │ ACTION  │ (转写)
              └─────────┘   └────┬────┘
                                 │
                                 ▼
                          ┌──────────────┐
                          │ VERIFICATION │ (验证)
                          └──────┬───────┘
                                 │
                          ┌──────┴──────┐
                          │             │
                    Valid │             │ Suspicious
                          ▼             ▼
                   ┌──────────┐  ┌──────────────┐
                   │POLISHING │  │CONSULTATION  │ (咨询 DeepSeek)
                   └────┬─────┘  └──────┬───────┘
                        │               │
                        │        ┌──────┴──────┐
                        │        │             │
                        │    KEEP│             │RETRY
                        │        ▼             ▼
                        │   ┌─────────┐  ┌────────────┐
                        │   │POLISHING│  │ REFINEMENT │ (重试)
                        │   └────┬────┘  └─────┬──────┘
                        │        │             │
                        │        │             └──────┐
                        │        │                    │
                        ▼        ▼                    ▼
                   ┌──────────────────────────────────────┐
                   │   HALLUCINATION DETECTION (幻觉检测)  │
                   └──────────────┬───────────────────────┘
                                  │
                           ┌──────┴──────┐
                           │             │
                    No Hallucination     Hallucination Detected
                           │             │ (confidence > 0.7)
                           ▼             ▼
                    ┌──────────┐   ┌─────────────────────┐
                    │COMMITTED │   │HALLUCINATION_DETECTED│
                    └──────────┘   └──────────┬──────────┘
                                              │
                                              ▼
                                      ┌───────────────┐
                                      │ PENDING_RETRY │
                                      └───────┬───────┘
                                              │
                                              │ (After all chunks)
                                              │
                                              ▼
                                        ┌─────────┐
                                        │  IDLE   │ (重新开始)
                                        └─────────┘
```

## 状态说明

### 1. IDLE (空闲)
- **描述**: 初始状态，等待处理
- **下一步**: PREPROCESSING
- **触发条件**: 任务创建或重试

### 2. PREPROCESSING (预处理)
- **描述**: 音频格式优化（16kHz mono WAV）
- **操作**: 
  - 检查是否已是最佳格式
  - 如果是，跳过处理
  - 否则，重采样 + 降噪
- **下一步**: PERCEPTION
- **时间追踪**: `preprocessingMs`

### 3. PERCEPTION (感知)
- **描述**: VAD (Voice Activity Detection) 静音检测
- **操作**: 
  - 计算 RMS 能量
  - 判断是否为静音段
- **下一步**: 
  - 静音 → SKIPPED
  - 有声 → ACTION

### 4. ACTION (行动)
- **描述**: 使用 Gemini Flash 进行音频转写
- **操作**: 
  - 调用 Gemini API
  - 清理文本
- **下一步**: VERIFICATION
- **时间追踪**: `transcriptionMs`

### 5. VERIFICATION (验证)
- **描述**: 本地启发式验证
- **操作**: 
  - 计算熵值
  - 检测重复模式
  - 检测异常长度
- **下一步**: 
  - 有效 → POLISHING
  - 可疑 → CONSULTATION

### 6. CONSULTATION (咨询)
- **描述**: 使用 DeepSeek 分析可疑内容
- **操作**: 
  - 发送可疑文本和原因
  - 获取建议（KEEP/RETRY/SKIP）
- **下一步**: 
  - KEEP → POLISHING
  - RETRY → REFINEMENT
  - SKIP → SKIPPED

### 7. REFINEMENT (精炼)
- **描述**: 根据顾问建议重试转写
- **操作**: 
  - 降低 temperature
  - 增加重试计数
  - 重新调用 Gemini
- **下一步**: VERIFICATION (循环)
- **最大重试**: 3 次

### 8. POLISHING (精校)
- **描述**: 使用 DeepSeek 进行保守型清洗
- **操作**: 
  - 删除口水词
  - 修正错别字
  - 保留原话
- **下一步**: HALLUCINATION_DETECTION
- **时间追踪**: `polishingMs`
- **异步执行**: 不阻塞下一个 chunk

### 9. HALLUCINATION_DETECTION (幻觉检测)
- **描述**: 检测转写文本中的幻觉
- **操作**: 
  - 本地启发式检查
  - DeepSeek AI 深度分析
  - 计算置信度
- **下一步**: 
  - 无幻觉 → COMMITTED
  - 有幻觉 (confidence > 0.7) → HALLUCINATION_DETECTED

### 10. HALLUCINATION_DETECTED (检测到幻觉)
- **描述**: 标记为需要重试
- **操作**: 
  - 设置 `needsRetry = true`
  - 记录幻觉证据
  - 等待所有 chunks 完成
- **下一步**: PENDING_RETRY

### 11. PENDING_RETRY (等待重试)
- **描述**: 等待自动重试
- **操作**: 
  - 在所有 chunks 完成后触发
  - 重新进入 IDLE 状态
  - 开始新的处理循环
- **下一步**: IDLE

### 12. COMMITTED (已提交)
- **描述**: 成功完成，结果已确认
- **操作**: 
  - 保存最终结果
  - 记录总时间
- **终态**: 是

### 13. SKIPPED (已跳过)
- **描述**: 静音段或无效内容
- **操作**: 
  - 标记为 `[SILENCE]`
  - 不参与最终输出
- **终态**: 是

### 14. ERROR (错误)
- **描述**: 处理失败
- **操作**: 
  - 记录错误信息
  - 可手动重试
- **终态**: 是

## 状态转换追踪

每次状态转换都会记录：

```typescript
interface StateTransition {
  from: AgentPhase;        // 起始状态
  to: AgentPhase;          // 目标状态
  timestamp: number;       // 时间戳
  reason?: string;         // 转换原因
  metadata?: {             // 元数据
    retryCount?: number;
    entropy?: number;
    hallucinationConfidence?: number;
  };
}
```

## 示例状态历史

```json
{
  "id": 1,
  "stateHistory": [
    {
      "from": "idle",
      "to": "preprocessing",
      "timestamp": 1702345678000,
      "reason": "Starting preprocessing"
    },
    {
      "from": "preprocessing",
      "to": "perception",
      "timestamp": 1702345680000,
      "reason": "Preprocessing completed"
    },
    {
      "from": "perception",
      "to": "action",
      "timestamp": 1702345681000,
      "reason": "Voice detected"
    },
    {
      "from": "action",
      "to": "verification",
      "timestamp": 1702345690000,
      "reason": "Transcription completed"
    },
    {
      "from": "verification",
      "to": "polishing",
      "timestamp": 1702345691000,
      "reason": "Validation passed",
      "metadata": { "entropy": 3.5 }
    },
    {
      "from": "polishing",
      "to": "hallucination_detected",
      "timestamp": 1702345695000,
      "reason": "Hallucination: 重复字符: 说说说说说",
      "metadata": { "hallucinationConfidence": 0.85 }
    },
    {
      "from": "hallucination_detected",
      "to": "pending_retry",
      "timestamp": 1702345696000,
      "reason": "Auto-retry for hallucination"
    },
    {
      "from": "pending_retry",
      "to": "idle",
      "timestamp": 1702345700000,
      "reason": "Retry attempt 1",
      "metadata": { "retryCount": 1 }
    }
  ]
}
```

## 监控指标

### 状态分布
- COMMITTED: 成功率
- HALLUCINATION_DETECTED: 幻觉率
- SKIPPED: 静音率
- ERROR: 错误率

### 时间指标
- 平均 preprocessingMs
- 平均 transcriptionMs
- 平均 polishingMs
- 平均 totalMs

### 质量指标
- 平均熵值
- 平均幻觉置信度
- 重试率
- 最终成功率

## 最佳实践

1. **监控状态转换**: 异常的状态跳转可能表示系统问题
2. **分析重试模式**: 高重试率可能需要调整参数
3. **追踪时间分布**: 识别性能瓶颈
4. **审查幻觉检测**: 调整置信度阈值（当前 0.7）

