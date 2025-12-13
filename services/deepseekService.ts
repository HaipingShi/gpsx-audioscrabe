import OpenAI from 'openai';

// DeepSeek API 使用 OpenAI 兼容接口
const deepseek = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY,
  baseURL: 'https://api.deepseek.com',
  dangerouslyAllowBrowser: true // 允许在浏览器中使用
});

const DEEPSEEK_MODEL = 'deepseek-chat'; // DeepSeek 的推理模型

/**
 * 使用 DeepSeek 对转写文本进行精校润色
 */
export const polishChunk = async (text: string): Promise<string> => {
  if (!text || text.includes("[SILENCE]")) return "";

  try {
    const response = await deepseek.chat.completions.create({
      model: DEEPSEEK_MODEL,
      messages: [
        {
          role: 'system',
          content: 'You are a professional editor specializing in transcription polishing. Your task is to correct and improve raw transcription text while preserving all original content.'
        },
        {
          role: 'user',
          content: `Please polish the following raw transcription text:

Rules:
1. Fix punctuation and capitalization.
2. Remove stuttering (um, uh, like) unless it adds dramatic effect.
3. Fix obvious homophone errors based on context.
4. Do not summarize or omit any content - keep everything.
5. Return ONLY the polished text, no explanations.

Raw Text:
"${text}"`
        }
      ],
      temperature: 0.3, // 较低温度保证稳定输出
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

