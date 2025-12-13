import React from 'react';
import { AgentPhase, CognitiveTask } from '../types';
import { Activity, BrainCircuit, CheckCircle2, AlertTriangle, Loader2, Ear, RefreshCw, Sparkles, VolumeX, RotateCw, Microscope, Filter } from 'lucide-react';

interface CognitiveBoardProps {
  tasks: CognitiveTask[];
  onRetry: (id: number) => void;
  isProcessing: boolean;
}

export const CognitiveBoard: React.FC<CognitiveBoardProps> = ({ tasks, onRetry, isProcessing }) => {
  const getStatusIcon = (phase: AgentPhase) => {
    switch (phase) {
      case AgentPhase.PREPROCESSING: return <Filter size={14} className="animate-pulse text-cyan-400" />;
      case AgentPhase.PERCEPTION: return <Ear size={14} className="animate-pulse text-blue-400" />;
      case AgentPhase.ACTION: return <Activity size={14} className="animate-pulse text-indigo-400" />;
      case AgentPhase.VERIFICATION: return <BrainCircuit size={14} className="text-purple-400" />;
      case AgentPhase.CONSULTATION: return <Microscope size={14} className="animate-bounce text-yellow-400" />;
      case AgentPhase.POLISHING: return <Sparkles size={14} className="animate-pulse text-pink-400" />;
      case AgentPhase.REFINEMENT: return <RefreshCw size={14} className="animate-spin text-orange-400" />;
      case AgentPhase.COMMITTED: return <CheckCircle2 size={14} className="text-emerald-400" />;
      case AgentPhase.SKIPPED: return <VolumeX size={14} className="text-slate-500" />;
      case AgentPhase.ERROR: return <AlertTriangle size={14} className="text-red-500" />;
      default: return <Loader2 size={14} className="text-slate-600" />;
    }
  };

  const getStatusColor = (phase: AgentPhase) => {
    switch (phase) {
      case AgentPhase.PREPROCESSING: return "border-cyan-500/30 bg-cyan-500/5";
      case AgentPhase.PERCEPTION: return "border-blue-500/30 bg-blue-500/5";
      case AgentPhase.ACTION: return "border-indigo-500/30 bg-indigo-500/5";
      case AgentPhase.VERIFICATION: return "border-purple-500/30 bg-purple-500/5";
      case AgentPhase.CONSULTATION: return "border-yellow-500/30 bg-yellow-500/5";
      case AgentPhase.POLISHING: return "border-pink-500/30 bg-pink-500/5";
      case AgentPhase.REFINEMENT: return "border-orange-500/30 bg-orange-500/5";
      case AgentPhase.COMMITTED: return "border-emerald-500/30 bg-emerald-500/5";
      case AgentPhase.SKIPPED: return "border-slate-800 bg-slate-900/50 opacity-50";
      case AgentPhase.ERROR: return "border-red-500/30 bg-red-500/5";
      default: return "border-slate-800 bg-slate-900";
    }
  };

  return (
    <div className="w-full bg-slate-900/50 rounded-xl border border-slate-800 overflow-hidden flex flex-col max-h-[600px]">
      <div className="p-3 border-b border-slate-800 bg-slate-900 flex justify-between items-center">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-2">
          <BrainCircuit size={16} />
          Agent Cognitive Board
        </h3>
        <span className="text-[10px] bg-slate-800 px-2 py-1 rounded text-slate-500">
          GPS-X Architecture
        </span>
      </div>
      
      <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
        {tasks.map((task) => (
          <div 
            key={task.id}
            className={`relative p-3 rounded-lg border transition-all duration-300 ${getStatusColor(task.phase)}`}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono text-slate-500">#{task.id}</span>
                <span className="text-xs font-medium text-slate-300 uppercase">{task.phase}</span>
                {/* 显示转写引擎 */}
                {task.transcriptionEngine && (
                  <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                    task.transcriptionEngine === 'FunASR'
                      ? 'bg-blue-500/20 text-blue-300'
                      : 'bg-purple-500/20 text-purple-300'
                  }`}>
                    {task.transcriptionEngine}
                    {task.engineFallbackUsed && ' ⚠️'}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2">
                {getStatusIcon(task.phase)}
                {(task.phase === AgentPhase.SKIPPED || task.phase === AgentPhase.ERROR || task.phase === AgentPhase.COMMITTED) && (
                   <button
                     onClick={() => onRetry(task.id)}
                     className="text-slate-500 hover:text-white transition-colors"
                     title="Manual Retry Chunk"
                   >
                     <RotateCw size={12} />
                   </button>
                )}
              </div>
            </div>

            <div className="text-xs text-slate-400 font-mono">
              {task.polishedText ? (
                 <p className="line-clamp-2 text-slate-200">{task.polishedText}</p>
              ) : task.transcription ? (
                 <p className="line-clamp-2 italic text-slate-400 line-through Decoration-slate-600">{task.transcription}</p>
              ) : task.phase === AgentPhase.SKIPPED ? (
                 <p className="italic text-slate-600">[Silence/Refused - Skipped]</p>
              ) : task.phase === AgentPhase.ERROR ? (
                 <p className="italic text-red-400">[Processing Error]</p>
              ) : (
                 <p className="opacity-50">Processing audio data...</p>
              )}
            </div>

            {task.phase !== AgentPhase.SKIPPED && task.phase !== AgentPhase.ERROR && (
              <div className="mt-2 flex items-center gap-4 text-[10px] text-slate-500 border-t border-slate-800/50 pt-2">
                 <div className="flex items-center gap-1">
                   <span>Entropy:</span>
                   <span className={`${task.entropy > 0.5 ? 'text-red-400' : 'text-emerald-400'}`}>
                     {task.entropy.toFixed(2)}
                   </span>
                 </div>
                 {task.retryCount > 0 && (
                   <div className="text-orange-400">
                     Retries: {task.retryCount}
                   </div>
                 )}
              </div>
            )}
            
            {task.logs.length > 0 && task.phase !== AgentPhase.COMMITTED && task.phase !== AgentPhase.SKIPPED && (
              <div className="mt-2 text-[10px] font-mono text-indigo-300 animate-in fade-in duration-300">
                &gt; {task.logs[task.logs.length - 1]}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};