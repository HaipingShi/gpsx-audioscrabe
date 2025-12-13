import OpenAI from 'openai';

// DeepSeek API 使用 OpenAI 兼容接口
const deepseek = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY,
  baseURL: 'https://api.deepseek.com',
  dangerouslyAllowBrowser: true // 允许在浏览器中使用
});

const DEEPSEEK_MODEL = 'deepseek-chat'; // DeepSeek 的推理模型

/**
 * 使用 DeepSeek 对转写文本进行"保守型清洗"（Surgical Cleaning）
 *
 * 策略：数据保真度 > 阅读流畅度
 * - 不重写，只清洗
 * - 保留讲者的语言风格、专业术语、金句
 * - 仅删除口水词和明显的识别错误
 */
export const polishChunk = async (text: string): Promise<string> => {
  if (!text || text.includes("[SILENCE]")) return "";

  try {
    const response = await deepseek.chat.completions.create({
      model: DEEPSEEK_MODEL,
      messages: [
        {
          role: 'system',
          content: `# Role
你是一位专业的会议速记整理员。你的任务是对原始录音转写稿进行"微创清洗"。

# Principles (关键原则)
1. **最高保真度**：严禁通过意译、总结或概括来修改讲者的原话。保留讲师独特的语言风格、语气和专业术语。
2. **仅删除噪音**：只删除以下内容：
   - 毫无意义的口癖（如："这个这个"、"那个"、"对吧"、"是不是"、"嗯"、"啊"）
   - 明显的 ASR 识别错误（根据上下文修正同音字）
   - 重复的词语（如："我我我"、"然后然后"）
3. **不要改写**：不要用书面语替换口语表达，不要优化句式结构，不要添加任何原文没有的内容。
4. **保留金句**：对于重要的定义、观点、金句，不要改动任何一个字。

# Output Format
- 直接输出清洗后的文本
- 保持原文的自然语序和口语风格
- 不要添加任何解释、标题或元数据`
        },
        {
          role: 'user',
          content: `请对以下转写文本进行微创清洗：

"${text}"

要求：
1. 只删除口水词（嗯、啊、这个、那个等）
2. 修正明显的同音字错误
3. 修复标点符号，使其符合中文书写规范
4. 保留讲者的原话和语气，不要改写或总结
5. 直接返回清洗后的文本，不要添加任何说明`
        }
      ],
      temperature: 0.2, // 更低温度保证保守清洗
      max_tokens: 4000
    });

    return response.choices[0]?.message?.content || text;
  } catch (error) {
    console.warn("DeepSeek polishing failed, returning raw text", error);
    return text;
  }
};

/**
 * 使用 DeepSeek 进行智能咨询，判断可疑文本的处理方式
 */
export interface ConsultationResult {
  action: 'RETRY' | 'SKIP' | 'KEEP';
  reasoning: string;
  suggestedTemperature?: number;
}

export const consultOnIssue = async (text: string, errorReason: string): Promise<ConsultationResult> => {
  try {
    const response = await deepseek.chat.completions.create({
      model: DEEPSEEK_MODEL,
      messages: [
        {
          role: 'system',
          content: 'You are a supervising AI for a transcription system. Analyze suspicious transcription segments and provide actionable recommendations in JSON format.'
        },
        {
          role: 'user',
          content: `A local heuristic check flagged a transcription segment as suspicious.

Suspicious Text: "${text}"
Flag Reason: "${errorReason}"

Analyze the text and determine the best action:
1. If it's hallucinations (repeating loops, random characters, gibberish) -> ACTION: RETRY (suggest higher temperature 0.5-0.7)
2. If it's just noise/silence/music/unintelligible sounds -> ACTION: SKIP
3. If it's actually valid content (e.g., repeating lyrics, chanting, foreign language, poetry) -> ACTION: KEEP

Return ONLY a JSON object with this exact structure:
{
  "action": "RETRY" | "SKIP" | "KEEP",
  "reasoning": "brief explanation",
  "suggestedTemperature": 0.6 (only if action is RETRY)
}`
        }
      ],
      temperature: 0.2, // 低温度保证稳定的 JSON 输出
      response_format: { type: "json_object" },
      max_tokens: 500
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error("Empty response from DeepSeek");
    }

    const result = JSON.parse(content) as ConsultationResult;
    
    // 验证返回的 action 是否有效
    if (!['RETRY', 'SKIP', 'KEEP'].includes(result.action)) {
      throw new Error(`Invalid action: ${result.action}`);
    }

    return result;
  } catch (error) {
    console.error("DeepSeek consultation failed:", error);
    // 降级策略：默认重试
    return { 
      action: 'RETRY', 
      reasoning: 'DeepSeek consultant failed, defaulting to retry with higher temperature.', 
      suggestedTemperature: 0.6 
    };
  }
};

