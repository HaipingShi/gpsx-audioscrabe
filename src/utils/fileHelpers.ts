import { CHUNK_SIZE_BYTES } from '../constants';

export const formatBytes = (bytes: number, decimals = 2): string => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
};

export const blobToBase64 = (blob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      // Remove the Data URL prefix (e.g., "data:audio/mp3;base64,")
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};

export const splitFileIntoChunks = (file: File): Blob[] => {
  const chunks: Blob[] = [];
  let offset = 0;
  
  while (offset < file.size) {
    const end = Math.min(offset + CHUNK_SIZE_BYTES, file.size);
    // Slice the file. Note: For strict MP3s, splitting by bytes might corrupt 
    // the frame at the boundary, but Gemini is generally robust enough to handle 
    // a fraction of a second of noise.
    const chunk = file.slice(offset, end, file.type);
    chunks.push(chunk);
    offset = end;
  }
  
  return chunks;
};