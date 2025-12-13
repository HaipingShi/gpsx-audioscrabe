import React, { useRef, useState } from 'react';
import { Upload, FileAudio, AlertCircle } from 'lucide-react';
import { formatBytes } from '../utils/fileHelpers';
import { SUPPORTED_MIME_TYPES } from '../constants';

interface FileUploadProps {
  onFileSelect: (file: File) => void;
  disabled?: boolean;
}

export const FileUpload: React.FC<FileUploadProps> = ({ onFileSelect, disabled }) => {
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (!disabled) setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const validateAndSelect = (file: File) => {
    setError(null);
    // Rough check for mime type, though some MP3s have weird types depending on browser
    // We will be lenient but warn if it looks completely wrong.
    const isAudio = file.type.startsWith('audio/') || file.name.endsWith('.mp3') || file.name.endsWith('.wav');
    
    if (!isAudio) {
      setError("Please select a valid audio file (MP3, WAV, etc.)");
      return;
    }

    onFileSelect(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (disabled) return;
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      validateAndSelect(e.dataTransfer.files[0]);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      validateAndSelect(e.target.files[0]);
    }
  };

  return (
    <div className="w-full">
      <div
        onClick={() => !disabled && inputRef.current?.click()}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`
          relative group cursor-pointer
          flex flex-col items-center justify-center
          w-full h-64 rounded-2xl
          border-2 border-dashed transition-all duration-300
          ${isDragging 
            ? 'border-indigo-500 bg-indigo-500/10 scale-[1.02]' 
            : 'border-slate-700 hover:border-indigo-400 hover:bg-slate-800/50 bg-slate-900/50'
          }
          ${disabled ? 'opacity-50 cursor-not-allowed hover:border-slate-700 hover:bg-slate-900/50' : ''}
        `}
      >
        <div className="flex flex-col items-center justify-center pt-5 pb-6 text-center px-4">
          <div className={`
            p-4 rounded-full mb-4 transition-colors duration-300
            ${isDragging ? 'bg-indigo-500 text-white' : 'bg-slate-800 text-indigo-400 group-hover:bg-indigo-500 group-hover:text-white'}
          `}>
            {isDragging ? <Upload size={32} /> : <FileAudio size={32} />}
          </div>
          <p className="mb-2 text-lg font-medium text-slate-200">
            {isDragging ? "Drop audio file here" : "Click to upload or drag and drop"}
          </p>
          <p className="text-sm text-slate-400 max-w-xs mx-auto">
            Supports MP3, WAV, FLAC. Optimized for large files (up to 200MB).
          </p>
        </div>
        <input 
          ref={inputRef}
          type="file" 
          className="hidden" 
          accept="audio/*"
          onChange={handleChange}
          disabled={disabled}
        />
      </div>
      
      {error && (
        <div className="mt-4 flex items-center p-3 text-red-400 bg-red-900/20 border border-red-900/50 rounded-lg">
          <AlertCircle size={18} className="mr-2 flex-shrink-0" />
          <span className="text-sm">{error}</span>
        </div>
      )}
    </div>
  );
};