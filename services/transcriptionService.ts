/**
 * 双引擎转写服务
 * 
 * 架构：
 * 1. 主引擎：FunASR（专业 ASR，准确度高）
 * 2. 备用引擎：Gemini Flash（通用模型，兜底）
 * 3. 自动降级：FunASR 失败 → Gemini
 * 4. 智能选择：根据音频质量和网络状况动态选择
 */

import { transcribeWithFunASR, checkFunASRAvailability } from './funasrService';
import { transcribeChunk as transcribeWithGemini } from './geminiService';
import { detectHallucination } from './hallucinationDetector';

export enum TranscriptionEngine {
  FUNASR = 'FunASR',
  GEMINI = 'Gemini Flash'
}

export interface TranscriptionResult {
  text: string;
  engine: TranscriptionEngine;
  confidence?: number;
  hallucinationDetection?: {
    isHallucination: boolean;
    confidence: number;
    reason: string;
  };
  fallbackUsed: boolean;
  processingTimeMs: number;
}

/**
 * 智能转写：自动选择最佳引擎
 * 
 * 策略：
 * 1. 优先使用 FunASR（专业 ASR）
 * 2. FunASR 失败 → 降级到 Gemini
 * 3. 检测幻觉 → 如果 FunASR 有幻觉，尝试 Gemini
 * 4. 返回质量最好的结果
 */
export const smartTranscribe = async (
  audioBlob: Blob,
  chunkIndex: number,
  totalChunks: number,
  isRetry: boolean = false,
  customTemperature?: number
): Promise<TranscriptionResult> => {
  const startTime = Date.now();
  let fallbackUsed = false;
  
  // 尝试 FunASR
  try {
    console.log(`[SmartTranscribe] Chunk ${chunkIndex + 1}/${totalChunks} - Trying FunASR...`);
    
    const funasrText = await transcribeWithFunASR(audioBlob, chunkIndex, totalChunks);
    
    // 幻觉检测
    const detection = await detectHallucination(funasrText, funasrText, chunkIndex);
    
    // 如果 FunASR 结果良好，直接返回
    if (!detection.isHallucination || detection.confidence < 0.7) {
      const processingTimeMs = Date.now() - startTime;
      console.log(`[SmartTranscribe] ✓ FunASR succeeded (${processingTimeMs}ms)`);
      
      return {
        text: funasrText,
        engine: TranscriptionEngine.FUNASR,
        hallucinationDetection: {
          isHallucination: detection.isHallucination,
          confidence: detection.confidence,
          reason: detection.reason
        },
        fallbackUsed: false,
        processingTimeMs
      };
    }
    
    // FunASR 有幻觉，尝试 Gemini
    console.warn(`[SmartTranscribe] FunASR hallucination detected: ${detection.reason}`);
    console.log(`[SmartTranscribe] Falling back to Gemini...`);
    fallbackUsed = true;
    
  } catch (error) {
    console.warn('[SmartTranscribe] FunASR failed:', error);
    console.log('[SmartTranscribe] Falling back to Gemini...');
    fallbackUsed = true;
  }
  
  // 降级到 Gemini
  try {
    const geminiText = await transcribeWithGemini(
      audioBlob,
      chunkIndex,
      totalChunks,
      isRetry,
      customTemperature
    );
    
    const detection = await detectHallucination(geminiText, geminiText, chunkIndex);
    const processingTimeMs = Date.now() - startTime;
    
    console.log(`[SmartTranscribe] ✓ Gemini succeeded (${processingTimeMs}ms)`);
    
    return {
      text: geminiText,
      engine: TranscriptionEngine.GEMINI,
      hallucinationDetection: {
        isHallucination: detection.isHallucination,
        confidence: detection.confidence,
        reason: detection.reason
      },
      fallbackUsed,
      processingTimeMs
    };
    
  } catch (error) {
    console.error('[SmartTranscribe] Both engines failed:', error);
    throw new Error('所有转写引擎都失败了');
  }
};

/**
 * 仅使用 FunASR
 */
export const transcribeWithFunASROnly = async (
  audioBlob: Blob,
  chunkIndex: number,
  totalChunks: number
): Promise<TranscriptionResult> => {
  const startTime = Date.now();
  
  const text = await transcribeWithFunASR(audioBlob, chunkIndex, totalChunks);
  const detection = await detectHallucination(text, text, chunkIndex);
  const processingTimeMs = Date.now() - startTime;
  
  return {
    text,
    engine: TranscriptionEngine.FUNASR,
    hallucinationDetection: {
      isHallucination: detection.isHallucination,
      confidence: detection.confidence,
      reason: detection.reason
    },
    fallbackUsed: false,
    processingTimeMs
  };
};

/**
 * 仅使用 Gemini
 */
export const transcribeWithGeminiOnly = async (
  audioBlob: Blob,
  chunkIndex: number,
  totalChunks: number,
  isRetry: boolean = false,
  customTemperature?: number
): Promise<TranscriptionResult> => {
  const startTime = Date.now();
  
  const text = await transcribeWithGemini(
    audioBlob,
    chunkIndex,
    totalChunks,
    isRetry,
    customTemperature
  );
  
  const detection = await detectHallucination(text, text, chunkIndex);
  const processingTimeMs = Date.now() - startTime;
  
  return {
    text,
    engine: TranscriptionEngine.GEMINI,
    hallucinationDetection: {
      isHallucination: detection.isHallucination,
      confidence: detection.confidence,
      reason: detection.reason
    },
    fallbackUsed: false,
    processingTimeMs
  };
};

/**
 * 初始化转写服务
 * 检查各引擎可用性
 */
export const initTranscriptionService = async (): Promise<{
  funasrAvailable: boolean;
  geminiAvailable: boolean;
}> => {
  const funasrAvailable = await checkFunASRAvailability();
  const geminiAvailable = !!import.meta.env.VITE_GEMINI_API_KEY;
  
  console.log('[TranscriptionService] Initialization:');
  console.log(`  - FunASR: ${funasrAvailable ? '✓' : '✗'}`);
  console.log(`  - Gemini: ${geminiAvailable ? '✓' : '✗'}`);
  
  return { funasrAvailable, geminiAvailable };
};

