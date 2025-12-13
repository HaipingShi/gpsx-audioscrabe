import { HallucinationDetection } from '../types';
import OpenAI from 'openai';

const deepseek = new OpenAI({
  apiKey: import.meta.env.VITE_DEEPSEEK_API_KEY,
  baseURL: 'https://api.deepseek.com',
  dangerouslyAllowBrowser: true,
});

/**
 * 使用 DeepSeek 检测转写文本中的幻觉
 *
 * 幻觉类型：
 * 1. 重复循环（如：说说说说说...）
 * 2. 无意义字符串（如：啊啊啊啊...）
 * 3. 不连贯的句子
 * 4. 明显的识别错误
 * 5. 语义崩溃
 */
export const detectHallucination = async (
  transcription: string,
  polishedText: string,
  chunkIndex: number
): Promise<HallucinationDetection> => {
  try {
    // 本地快速检测（启发式规则）
    const localDetection = localHallucinationCheck(transcription);

    // 如果本地检测高度可疑，直接返回
    if (localDetection.confidence > 0.9) {
      return localDetection;
    }

    // 使用 DeepSeek 进行深度分析
    const response = await deepseek.chat.completions.create({
      model: 'deepseek-chat',
      messages: [
        {
          role: 'system',
          content: `你是一个专业的音频转写质量检测专家。你的任务是检测转写文本中的"幻觉"（Hallucination）。

# 幻觉定义
幻觉是指 ASR 模型产生的不真实、不合理的输出，包括：
1. **重复循环**：同一个字/词重复超过 5 次（如：说说说说说...）
2. **无意义字符**：大量口水词或无意义音节（如：啊啊啊啊啊...、嗯嗯嗯嗯...）
3. **语义崩溃**：句子完全不连贯，无法理解
4. **明显错误**：与上下文完全无关的内容
5. **异常模式**：不符合人类语言习惯的输出

# 你的任务
1. 分析原始转写文本和清洗后文本
2. 判断是否存在幻觉
3. 给出置信度（0-1）
4. 提供证据和建议

# 输出格式（JSON）
{
  "isHallucination": true/false,
  "confidence": 0.0-1.0,
  "reason": "简短说明",
  "suggestedAction": "RETRY" | "KEEP" | "MANUAL_REVIEW",
  "evidence": ["证据1", "证据2"]
}

# 原则
- 保守判断：只有明确的幻觉才标记为 true
- 口语化表达不算幻觉（如：嗯、啊、这个、那个）
- 重复 2-3 次是正常的强调，不算幻觉
- 置信度 > 0.7 才建议 RETRY`
        },
        {
          role: 'user',
          content: `请检测以下转写文本是否存在幻觉：

**原始转写**:
${transcription}

**清洗后文本**:
${polishedText}

**块编号**: ${chunkIndex}

请以 JSON 格式返回检测结果。`
        }
      ],
      temperature: 0.1, // 低温度，更确定性的判断
      response_format: { type: 'json_object' }
    });

    const result = JSON.parse(response.choices[0].message.content || '{}');

    return {
      isHallucination: result.isHallucination || false,
      confidence: result.confidence || 0,
      reason: result.reason || 'No hallucination detected',
      suggestedAction: result.suggestedAction || 'KEEP',
      evidence: result.evidence || []
    };

  } catch (error) {
    console.error('Hallucination detection failed:', error);
    // 失败时返回保守结果（不标记为幻觉）
    return {
      isHallucination: false,
      confidence: 0,
      reason: 'Detection failed, assuming valid',
      suggestedAction: 'KEEP',
      evidence: []
    };
  }
};

/**
 * 本地启发式幻觉检测（快速，不需要 API 调用）
 */
function localHallucinationCheck(text: string): HallucinationDetection {
  const evidence: string[] = [];
  let score = 0;

  // 规则 1: 检测重复字符（如：说说说说说）
  const repeatedChars = text.match(/(.)\1{4,}/g);
  if (repeatedChars && repeatedChars.length > 0) {
    evidence.push(`重复字符: ${repeatedChars.join(', ')}`);
    score += 0.4;
  }

  // 规则 2: 检测重复词语（如：然后然后然后然后）
  const repeatedWords = text.match(/(\S{2,})\1{3,}/g);
  if (repeatedWords && repeatedWords.length > 0) {
    evidence.push(`重复词语: ${repeatedWords.join(', ')}`);
    score += 0.5;
  }

  // 规则 3: 检测异常长度的口水词序列
  const fillerPattern = /(嗯|啊|呃|额|这个|那个){8,}/g;
  if (fillerPattern.test(text)) {
    evidence.push('异常多的口水词');
    score += 0.3;
  }

  // 规则 4: 检测文本长度异常（太短或太长）
  if (text.length < 10) {
    evidence.push('文本过短');
    score += 0.2;
  }

  // 规则 5: 检测字符多样性（熵值过低）
  const uniqueChars = new Set(text).size;
  const diversity = uniqueChars / text.length;
  if (diversity < 0.1 && text.length > 20) {
    evidence.push(`字符多样性过低: ${(diversity * 100).toFixed(1)}%`);
    score += 0.4;
  }

  const confidence = Math.min(score, 1.0);
  const isHallucination = confidence > 0.7;

  return {
    isHallucination,
    confidence,
    reason: isHallucination
      ? `本地检测发现幻觉特征 (置信度: ${(confidence * 100).toFixed(0)}%)`
      : '本地检测未发现明显幻觉',
    suggestedAction: isHallucination ? 'RETRY' : 'KEEP',
    evidence
  };
}

