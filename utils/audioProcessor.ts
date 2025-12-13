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
 * Preprocesses audio chunk:
 * 1. Resample to 16kHz
 * 2. Downmix to Mono
 * 3. Apply High-pass filter (80Hz) to remove rumble
 * 4. Apply Low-pass filter (8kHz) to remove high freq noise
 */
export const preprocessAudio = async (blob: Blob): Promise<Blob> => {
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