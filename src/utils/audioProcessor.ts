// Audio processing configuration
const TARGET_SAMPLE_RATE = 16000;
const TARGET_CHANNELS = 1; // Mono

/**
 * Encodes AudioBuffer to WAV format (16-bit PCM)
 */
const audioBufferToWav = (buffer: AudioBuffer): Blob => {
  const numChannels = 1; // We forcing mono
  const sampleRate = buffer.sampleRate;
  const format = 1; // PCM
  const bitDepth = 16;
  
  const data = buffer.getChannelData(0);
  
  const bufferLength = data.length * 2 + 44; // data + header
  const arrayBuffer = new ArrayBuffer(bufferLength);
  const view = new DataView(arrayBuffer);
  
  const writeString = (view: DataView, offset: number, string: string) => {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  };

  let offset = 0;

  // RIFF identifier
  writeString(view, offset, 'RIFF'); offset += 4;
  // file length
  view.setUint32(offset, 36 + data.length * 2, true); offset += 4;
  // RIFF type
  writeString(view, offset, 'WAVE'); offset += 4;
  // format chunk identifier
  writeString(view, offset, 'fmt '); offset += 4;
  // format chunk length
  view.setUint32(offset, 16, true); offset += 4;
  // sample format (raw)
  view.setUint16(offset, format, true); offset += 2;
  // channel count
  view.setUint16(offset, numChannels, true); offset += 2;
  // sample rate
  view.setUint32(offset, sampleRate, true); offset += 4;
  // byte rate (sample rate * block align)
  view.setUint32(offset, sampleRate * numChannels * (bitDepth / 8), true); offset += 4;
  // block align (channel count * bytes per sample)
  view.setUint16(offset, numChannels * (bitDepth / 8), true); offset += 2;
  // bits per sample
  view.setUint16(offset, bitDepth, true); offset += 2;
  // data chunk identifier
  writeString(view, offset, 'data'); offset += 4;
  // data chunk length
  view.setUint32(offset, data.length * 2, true); offset += 4;

  // Write the PCM samples
  for (let i = 0; i < data.length; i++) {
    const s = Math.max(-1, Math.min(1, data[i]));
    // Convert float to 16-bit PCM
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    offset += 2;
  }

  return new Blob([view], { type: 'audio/wav' });
};

/**
 * Checks if audio is already in optimal format (16kHz mono WAV)
 */
const isOptimalFormat = async (blob: Blob): Promise<boolean> => {
  // Quick check: if it's a WAV file, check the header
  if (blob.type === 'audio/wav' || blob.type === 'audio/x-wav') {
    try {
      const arrayBuffer = await blob.arrayBuffer();
      const view = new DataView(arrayBuffer);

      // Check RIFF header
      if (view.getUint32(0, false) !== 0x52494646) return false; // 'RIFF'
      if (view.getUint32(8, false) !== 0x57415645) return false; // 'WAVE'

      // Find fmt chunk (usually at offset 12)
      let offset = 12;
      while (offset < Math.min(arrayBuffer.byteLength, 200)) {
        const chunkId = view.getUint32(offset, false);
        const chunkSize = view.getUint32(offset + 4, true);

        if (chunkId === 0x666d7420) { // 'fmt '
          const numChannels = view.getUint16(offset + 8 + 2, true);
          const sampleRate = view.getUint32(offset + 8 + 4, true);

          // Check if it's 16kHz mono
          return sampleRate === 16000 && numChannels === 1;
        }

        offset += 8 + chunkSize;
      }
    } catch (e) {
      console.warn("Failed to parse WAV header:", e);
    }
  }
  return false;
};

/**
 * Preprocesses audio chunk:
 * 1. Resample to 16kHz
 * 2. Downmix to Mono
 * 3. Apply High-pass filter (80Hz) to remove rumble
 * 4. Apply Low-pass filter (8kHz) to remove high freq noise
 *
 * Skips processing if audio is already in optimal format (16kHz mono WAV)
 */
export const preprocessAudio = async (blob: Blob): Promise<Blob> => {
  // Skip processing if already optimal
  if (await isOptimalFormat(blob)) {
    console.log("Audio already in optimal format (16kHz mono WAV), skipping preprocessing");
    return blob;
  }

  // Create an AudioContext to decode the file
  const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
  const audioContext = new AudioContextClass();

  try {
    const arrayBuffer = await blob.arrayBuffer();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

    // Create an OfflineAudioContext for rendering at target specs
    const offlineContext = new OfflineAudioContext(
      TARGET_CHANNELS,
      audioBuffer.duration * TARGET_SAMPLE_RATE,
      TARGET_SAMPLE_RATE
    );

    // Create Source
    const source = offlineContext.createBufferSource();
    source.buffer = audioBuffer;

    // --- Noise Reduction Filters ---

    // 1. High-pass filter @ 80Hz (Removes low rumble, microphone handling noise)
    const highPassFilter = offlineContext.createBiquadFilter();
    highPassFilter.type = 'highpass';
    highPassFilter.frequency.value = 80;

    // 2. Low-pass filter @ 8000Hz (Removes high hiss, unnecessary for speech)
    const lowPassFilter = offlineContext.createBiquadFilter();
    lowPassFilter.type = 'lowpass';
    lowPassFilter.frequency.value = 8000;

    // Connect graph: Source -> HighPass -> LowPass -> Destination
    source.connect(highPassFilter);
    highPassFilter.connect(lowPassFilter);
    lowPassFilter.connect(offlineContext.destination);

    source.start();

    // Render
    const renderedBuffer = await offlineContext.startRendering();

    // Encode to WAV
    return audioBufferToWav(renderedBuffer);

  } catch (error) {
    console.error("Audio preprocessing failed:", error);
    // Return original blob if processing fails, hoping Gemini handles it
    return blob;
  } finally {
    if (audioContext.state !== 'closed') {
      audioContext.close();
    }
  }
};