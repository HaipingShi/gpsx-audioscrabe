/**
 * 转写服务
 *
 * 使用 Gemini Flash 进行音频转写
 */

import { transcribeChunk as transcribeWithGemini } from './geminiService';
import { detectHallucination } from './hallucinationDetector';

export enum TranscriptionEngine {
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
  processingTimeMs: number;
}

/**
 * 使用 Gemini Flash 进行转写
 */
export const smartTranscribe = async (
  audioBlob: Blob,
  chunkIndex: number,
  totalChunks: number,
  isRetry: boolean = false,
  customTemperature?: number
): Promise<TranscriptionResult> => {
  const startTime = Date.now();

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

    console.log(`[Transcribe] ✓ Gemini succeeded (${processingTimeMs}ms)`);

    return {
      text: geminiText,
      engine: TranscriptionEngine.GEMINI,
      hallucinationDetection: {
        isHallucination: detection.isHallucination,
        confidence: detection.confidence,
        reason: detection.reason
      },
      processingTimeMs
    };

  } catch (error) {
    console.error('[Transcribe] Gemini failed:', error);
    throw new Error('转写失败');
  }
};

/**
 * 初始化转写服务
 * 检查 Gemini 可用性
 */
export const initTranscriptionService = async (): Promise<{
  geminiAvailable: boolean;
}> => {
  const geminiAvailable = !!import.meta.env.VITE_GEMINI_API_KEY;

  console.log('[TranscriptionService] Initialization:');
  console.log(`  - Gemini: ${geminiAvailable ? '✓' : '✗'}`);

  if (!geminiAvailable) {
    console.error('[TranscriptionService] ❌ Gemini API Key not configured!');
  }

  return { geminiAvailable };
};

