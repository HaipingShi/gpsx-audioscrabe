/**
 * Simple Voice Activity Detection (VAD) using root mean square (RMS).
 * This helps the agent skip chunks that are purely silence.
 */
export const detectSilence = async (blob: Blob): Promise<{ isSilent: boolean; score: number }> => {
  const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
  const arrayBuffer = await blob.arrayBuffer();
  const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
  
  const rawData = audioBuffer.getChannelData(0);
  const samples = rawData.length;
  let sum = 0;

  // Calculate RMS
  for (let i = 0; i < samples; i++) {
    sum += rawData[i] * rawData[i];
  }
  
  const rms = Math.sqrt(sum / samples);
  audioContext.close();

  // Threshold for silence (experimentally determined)
  const SILENCE_THRESHOLD = 0.005; 
  
  return {
    isSilent: rms < SILENCE_THRESHOLD,
    score: rms
  };
};