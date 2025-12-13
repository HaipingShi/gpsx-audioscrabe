import { GoogleGenAI, Type } from "@google/genai";
import { AUDIO_MODEL, REASONING_MODEL } from '../constants';
import { blobToBase64 } from '../utils/fileHelpers';

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const transcribeChunk = async (
  blob: Blob, 
  chunkIndex: number, 
  totalChunks: number,
  isRetry: boolean = false,
  customTemperature?: number
): Promise<string> => {
  try {
    const base64Data = await blobToBase64(blob);
    
    // Default low temp for accuracy, higher for retries to break loops
    const temperature = customTemperature !== undefined ? customTemperature : (isRetry ? 0.5 : 0.2);
    
    const prompt = `
      Transcribe the audio exactly.
      Context: Part ${chunkIndex + 1} of ${totalChunks}.
      Rules:
      1. No preamble. No "Here is the text".
      2. If silence/noise, return "[SILENCE]".
      3. Do not repeat words endlessly.
    `;

    const response = await ai.models.generateContent({
      model: AUDIO_MODEL, // Flash for Speed
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: blob.type || 'audio/wav',
              data: base64Data
            }
          },
          { text: prompt }
        ]
      },
      config: {
        temperature: temperature,
      }
    });

    return response.text || "";
  } catch (error) {
    console.error(`Error transcribing chunk ${chunkIndex + 1}:`, error);
    throw error;
  }
};

export const polishChunk = async (text: string): Promise<string> => {
  if (!text || text.includes("[SILENCE]")) return "";

  try {
    const response = await ai.models.generateContent({
      model: REASONING_MODEL, // Pro for Reasoning
      contents: {
        parts: [{ 
          text: `
            You are a professional editor. Correct the following raw transcription text.
            1. Fix punctuation and capitalization.
            2. Remove stuttering (um, uh) unless it adds dramatic effect.
            3. Fix obvious homophone errors based on context.
            4. Do not summarize. Keep all content.
            5. Return ONLY the polished text.

            Raw Text:
            "${text}"
          ` 
        }]
      }
    });

    return response.text || text;
  } catch (error) {
    console.warn("Polishing failed, returning raw text", error);
    return text;
  }
};

// New: Agent Consultation (The "Reaction" logic)
export interface ConsultationResult {
  action: 'RETRY' | 'SKIP' | 'KEEP';
  reasoning: string;
  suggestedTemperature?: number;
}

export const consultOnIssue = async (text: string, errorReason: string): Promise<ConsultationResult> => {
  try {
    const response = await ai.models.generateContent({
      model: REASONING_MODEL,
      contents: {
        parts: [{
          text: `
            You are the Supervising AI for a transcription system. 
            A local heuristic check flagged a transcription segment as suspicious.
            
            Suspicious Text: "${text}"
            Flag Reason: "${errorReason}"

            Analyze the text. 
            1. Is it hallucinations (repeating loops, random characters)? -> ACTION: RETRY (suggest higher temperature).
            2. Is it just noise/silence/music? -> ACTION: SKIP.
            3. Is it actually valid (e.g., repeating lyrics, chanting, foreign language)? -> ACTION: KEEP.

            Return JSON.
          `
        }]
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            action: { type: Type.STRING, enum: ["RETRY", "SKIP", "KEEP"] },
            reasoning: { type: Type.STRING },
            suggestedTemperature: { type: Type.NUMBER }
          },
          required: ["action", "reasoning"]
        }
      }
    });

    if (response.text) {
        return JSON.parse(response.text) as ConsultationResult;
    }
    throw new Error("Empty response from consultant");
  } catch (error) {
    console.error("Consultation failed:", error);
    // Fallback default
    return { action: 'RETRY', reasoning: 'Consultant failed, defaulting to retry.', suggestedTemperature: 0.6 };
  }
};