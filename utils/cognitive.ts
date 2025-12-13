/**
 * Simple heuristics to detect obvious hallucinations without burning API tokens.
 * High entropy usually means random character generation or repetition loops.
 */
export const calculateEntropy = (text: string): number => {
  if (!text) return 0;
  
  // Check for Repetition Loops (common hallucination)
  const len = text.length;
  if (len > 50) {
    const half = text.substring(0, Math.floor(len / 2));
    const rest = text.substring(Math.floor(len / 2));
    if (half === rest) return 1.0; // Perfect repetition
  }

  // Check for character diversity
  const uniqueChars = new Set(text).size;
  const diversityRatio = uniqueChars / len;
  
  // If diversity is extremely low (e.g. "aaaaaaaa"), entropy is bad (high score for badness)
  if (diversityRatio < 0.05) return 0.9;

  return 0.1; // Default low "bad entropy"
};

export const verifyTranscription = (text: string): { isValid: boolean; reason?: string; entropy: number; suggestedAction?: 'RETRY' | 'DISCARD' | 'KEEP' } => {
  const entropy = calculateEntropy(text);

  // 1. Local Heuristics
  if (text.trim().length === 0) return { isValid: false, reason: "Empty response", entropy, suggestedAction: 'RETRY' };
  
  if (entropy > 0.8) {
    return { isValid: false, reason: "High entropy detected (Repetition loop or gibberish)", entropy, suggestedAction: 'RETRY' };
  }

  // 2. Length Check
  if (text.length < 5) {
     // Sometimes silence results in " " or "."
     return { isValid: true, reason: "Silence or short utterance", entropy, suggestedAction: 'DISCARD' };
  }

  return { isValid: true, entropy, suggestedAction: 'KEEP' };
};

export const cleanText = (text: string): string => {
  return text
    .replace(/\n\n+/g, '\n') // Remove excessive newlines
    .trim();
};