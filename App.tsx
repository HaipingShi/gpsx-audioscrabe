import React, { useState, useEffect, useRef, useMemo } from 'react';
import { FileUpload } from './components/FileUpload';
import { Button } from './components/ui/Button';
import { CognitiveBoard } from './components/CognitiveBoard';
import { AppStatus, ProcessingState, CognitiveTask, AgentPhase } from './types';
import { formatBytes, splitFileIntoChunks } from './utils/fileHelpers';
import { transcribeChunk } from './services/geminiService';
import { polishChunk, consultOnIssue } from './services/deepseekService';
import { preprocessAudio } from './utils/audioProcessor';
import { verifyTranscription, cleanText } from './utils/cognitive';
import { detectSilence } from './utils/audioAnalysis';
import { 
  FileAudio, 
  Play, 
  CheckCircle2, 
  FileText, 
  Download, 
  Copy, 
  RefreshCcw,
  AudioLines,
  Sparkles,
  Loader2,
  FileJson
} from 'lucide-react';

const MAX_RETRIES = 3; 
const WATCHDOG_TIMEOUT_MS = 60000; // Increased to 60s to account for preprocessing time
const CONCURRENCY_LIMIT = 2; // Prevent browser resource exhaustion (AudioContext limit)

const App: React.FC = () => {
  const [file, setFile] = useState<File | null>(null);
  const [activeTab, setActiveTab] = useState<'polished' | 'raw'>('polished');
  
  const [state, setState] = useState<ProcessingState>({
    status: AppStatus.IDLE,
    progress: 0,
    tasks: [],
    totalChunks: 0,
  });

  // Map to store AbortControllers for EACH task individually
  const taskControllers = useRef<Map<number, AbortController>>(new Map());
  const transcriptionEndRef = useRef<HTMLDivElement>(null);

  // --- Dynamic Assembly Engine ---
  const finalPolishedText = useMemo(() => {
    return state.tasks
      .filter(t => t.phase === AgentPhase.COMMITTED && t.polishedText)
      .map(t => t.polishedText)
      .join('\n\n');
  }, [state.tasks]);

  const finalRawText = useMemo(() => {
    return state.tasks
      .filter(t => t.transcription && t.transcription !== "[SILENCE]" && t.phase !== AgentPhase.SKIPPED)
      .map(t => t.transcription)
      .join('\n\n');
  }, [state.tasks]);

  const currentViewText = activeTab === 'polished' ? finalPolishedText : finalRawText;

  useEffect(() => {
    if (transcriptionEndRef.current && state.status === AppStatus.PROCESSING) {
      transcriptionEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [finalPolishedText, state.status]);
  
  // --- Helper to update task state and refresh watchdog timestamp ---
  const updateTask = (id: number, updates: Partial<CognitiveTask>) => {
    setState(prev => ({
      ...prev,
      tasks: prev.tasks.map(t => t.id === id ? { 
        ...t, 
        ...updates,
        lastUpdated: Date.now() // Feed the watchdog
      } : t)
    }));
  };

  const addLogToTask = (id: number, log: string) => {
    setState(prev => ({
      ...prev,
      tasks: prev.tasks.map(t => t.id === id ? { 
        ...t, 
        logs: [...t.logs, log],
        lastUpdated: Date.now() 
      } : t)
    }));
  };

  // --- Watchdog Service ---
  useEffect(() => {
    if (state.status !== AppStatus.PROCESSING) return;

    const interval = setInterval(() => {
      const now = Date.now();
      state.tasks.forEach(task => {
        const isBusy = [
          AgentPhase.PREPROCESSING,
          AgentPhase.PERCEPTION, 
          AgentPhase.ACTION, 
          AgentPhase.VERIFICATION, 
          AgentPhase.CONSULTATION, 
          AgentPhase.POLISHING,
          AgentPhase.REFINEMENT
        ].includes(task.phase);

        if (isBusy && (now - task.lastUpdated > WATCHDOG_TIMEOUT_MS)) {
           console.warn(`Watchdog: Task ${task.id} stalled. Restarting...`);
           
           const controller = taskControllers.current.get(task.id);
           if (controller) {
             controller.abort("Watchdog Timeout");
             taskControllers.current.delete(task.id);
           }

           addLogToTask(task.id, "🐶 Watchdog: Process stalled. Auto-restarting...");
           
           const newController = new AbortController();
           taskControllers.current.set(task.id, newController);
           
           updateTask(task.id, { 
             phase: AgentPhase.IDLE, 
             retryCount: task.retryCount + 1 
           });
           
           // Warning: Auto-restart logic here is simple but might hit concurrency limits if many stall at once.
           processSingleChunk(
             { ...task, phase: AgentPhase.IDLE }, 
             state.totalChunks, 
             newController.signal
           );
        }
      });
    }, 5000);

    return () => clearInterval(interval);
  }, [state.tasks, state.status]);


  const handleFileSelect = (selectedFile: File) => {
    setFile(selectedFile);
    setState({
      status: AppStatus.IDLE,
      progress: 0,
      tasks: [],
      totalChunks: 0,
    });
  };

  const handleReset = () => {
    taskControllers.current.forEach(c => c.abort());
    taskControllers.current.clear();
    setFile(null);
    setState({
      status: AppStatus.IDLE,
      progress: 0,
      tasks: [],
      totalChunks: 0,
    });
  };

  // --- Core Agent Logic ---
  const processSingleChunk = async (task: CognitiveTask, totalChunks: number, signal: AbortSignal) => {
    const taskId = task.id;
    let blob = task.blob;
    const chunkIndex = task.id - 1;

    try {
        // === PHASE 0: PREPROCESSING ===
        // We do this per-chunk to handle large files efficiently and ensure valid WAV headers for each slice.
        updateTask(taskId, { phase: AgentPhase.PREPROCESSING });
        addLogToTask(taskId, "Optimizing audio (16kHz Mono WAV)...");
        
        // This creates an OfflineAudioContext. Concurrency is limited by the caller loop.
        blob = await preprocessAudio(blob);
        
        // === PHASE 1: PERCEPTION (VAD) ===
        updateTask(taskId, { phase: AgentPhase.PERCEPTION });
        const vadResult = await detectSilence(blob);
        
        if (vadResult.isSilent) {
          addLogToTask(taskId, `⛔ Silence (RMS: ${vadResult.score.toFixed(4)}). Skipping.`);
          updateTask(taskId, { phase: AgentPhase.SKIPPED });
          return; 
        }

        let attempts = 0;
        let isValid = false;
        let currentText = "";
        let customTemp: number | undefined = undefined;

        while (attempts <= MAX_RETRIES && !isValid) {
            if (signal.aborted) throw new Error("Aborted");

            if (attempts > 0) {
               updateTask(taskId, { phase: AgentPhase.REFINEMENT, retryCount: attempts });
            } else {
               updateTask(taskId, { phase: AgentPhase.ACTION });
            }

            // === PHASE 2: ACTION ===
            // Note: We send the *processed* blob (WAV) to Gemini
            currentText = await transcribeChunk(blob, chunkIndex, totalChunks, attempts > 0, customTemp);
            currentText = cleanText(currentText);

            // === PHASE 3: VERIFICATION ===
            updateTask(taskId, { phase: AgentPhase.VERIFICATION, transcription: currentText });
            const verification = verifyTranscription(currentText);
            updateTask(taskId, { entropy: verification.entropy });

            if (verification.isValid) {
               isValid = true;
               addLogToTask(taskId, `✓ Valid (Entropy: ${verification.entropy.toFixed(2)})`);
            } else if (verification.suggestedAction === 'DISCARD') {
               addLogToTask(taskId, "Discarding (Empty/Silence).");
               currentText = "[SILENCE]";
               isValid = true;
            } else {
               // === PHASE 4: CONSULTATION ===
               if (attempts < MAX_RETRIES) {
                   updateTask(taskId, { phase: AgentPhase.CONSULTATION });
                   addLogToTask(taskId, `🤔 Suspicious: ${verification.reason}. Consulting Gemini 3 Pro...`);
                   const advice = await consultOnIssue(currentText, verification.reason || "Unknown error");
                   addLogToTask(taskId, `💡 Advisor: ${advice.action} -> ${advice.reasoning}`);
                   
                   if (advice.action === 'KEEP') {
                       isValid = true;
                   } else if (advice.action === 'SKIP') {
                       isValid = true;
                       currentText = "[SILENCE]";
                   } else {
                       customTemp = advice.suggestedTemperature;
                       attempts++;
                   }
               } else {
                   addLogToTask(taskId, "❌ Max retries reached.");
                   attempts++;
               }
            }
        }

        if (signal.aborted) return;

        if (!isValid) {
           updateTask(taskId, { phase: AgentPhase.SKIPPED });
           return;
        }

        if (currentText === "[SILENCE]" || currentText.includes("[SILENCE]")) {
           updateTask(taskId, { phase: AgentPhase.SKIPPED });
           return;
        }

        // === PHASE 5: POLISHING ===
        updateTask(taskId, { phase: AgentPhase.POLISHING });
        const polished = await polishChunk(currentText);
        updateTask(taskId, { polishedText: polished, phase: AgentPhase.COMMITTED });

    } catch (chunkError: any) {
        if (chunkError.message === "Aborted" || chunkError.message === "Watchdog Timeout") {
            addLogToTask(taskId, "Process Aborted.");
            return;
        }
        console.error(`Error processing chunk ${taskId}:`, chunkError);
        addLogToTask(taskId, `🔥 Error: ${chunkError.message}`);
        updateTask(taskId, { phase: AgentPhase.ERROR });
    }
  };

  // --- Batch Execution ---
  const startCognitiveTranscription = async () => {
    if (!file) return;
    
    // Clear old controllers
    taskControllers.current.forEach(c => c.abort());
    taskControllers.current.clear();

    const chunks = splitFileIntoChunks(file);
      
    const initialTasks: CognitiveTask[] = chunks.map((chunk, index) => ({
      id: index + 1,
      blob: chunk,
      phase: AgentPhase.IDLE,
      transcription: '',
      polishedText: '',
      entropy: 0,
      retryCount: 0,
      logs: [],
      lastUpdated: Date.now()
    }));

    setState(prev => ({ 
      ...prev, 
      status: AppStatus.PROCESSING,
      totalChunks: chunks.length,
      tasks: initialTasks,
      progress: 0
    }));

    // --- Concurrency Controlled Loop ---
    const running = new Set<Promise<void>>();
    
    for (let i = 0; i < chunks.length; i++) {
        // If system was reset/aborted mid-loop
        if (taskControllers.current.size === 0 && i > 0) break;

        const controller = new AbortController();
        taskControllers.current.set(i + 1, controller);
        
        const p = processSingleChunk(initialTasks[i], chunks.length, controller.signal).then(() => {
           taskControllers.current.delete(i + 1);
           running.delete(p);
        });
        
        running.add(p);
        
        // Wait if concurrency limit reached
        if (running.size >= CONCURRENCY_LIMIT) {
            await Promise.race(running);
        }
    }
    
    // Wait for remaining
    await Promise.all(running);
  };
  
  // Monitor global completion status
  useEffect(() => {
    if (state.status === AppStatus.PROCESSING) {
      const allDone = state.tasks.every(t => 
        [AgentPhase.COMMITTED, AgentPhase.SKIPPED, AgentPhase.ERROR].includes(t.phase)
      );
      if (allDone && state.tasks.length > 0) {
        setState(prev => ({ ...prev, status: AppStatus.COMPLETED, progress: 100 }));
      }
      
      const completedCount = state.tasks.filter(t => 
        [AgentPhase.COMMITTED, AgentPhase.SKIPPED, AgentPhase.ERROR].includes(t.phase)
      ).length;
      setState(prev => ({ ...prev, progress: Math.round((completedCount / prev.totalChunks) * 100) }));
    }
  }, [state.tasks]);

  const handleTaskRetry = (taskId: number) => {
    const taskIndex = state.tasks.findIndex(t => t.id === taskId);
    if (taskIndex === -1) return;

    const task = state.tasks[taskIndex];
    updateTask(taskId, { 
        phase: AgentPhase.IDLE, 
        logs: [...task.logs, "--- Manual Retry ---"],
        retryCount: 0 
    });

    const controller = new AbortController();
    taskControllers.current.set(taskId, controller);
    processSingleChunk(task, state.totalChunks, controller.signal);
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(currentViewText);
  };

  const downloadTranscription = (type: 'markdown' | 'raw' | 'dual') => {
    let text: string;
    let filename: string;

    if (type === 'dual') {
      // 双轨制格式：同时包含原文和清洗版
      const dualTrackContent = state.tasks
        .filter(t => t.transcription && t.transcription !== "[SILENCE]" && t.phase !== AgentPhase.SKIPPED)
        .map((t, index) => {
          const hasPolished = t.phase === AgentPhase.COMMITTED && t.polishedText;
          return `## 段落 ${index + 1}

**清洗版**:
${hasPolished ? t.polishedText : t.transcription}

<details>
<summary>📝 查看原文</summary>

${t.transcription}

</details>

---
`;
        })
        .join('\n');

      text = `# ${file?.name || '转写文档'} - 双轨制版本

> 本文档采用"保守型清洗"策略，保留原文以确保数据保真度。
> 点击"📝 查看原文"可展开查看未经处理的原始转写文本。

---

${dualTrackContent}`;
      filename = `${file?.name.split('.')[0] || 'transcript'}_DualTrack.md`;
    } else {
      text = type === 'markdown' ? finalPolishedText : finalRawText;
      filename = `${file?.name.split('.')[0] || 'transcript'}_${type === 'markdown' ? 'Polished' : 'Raw'}.md`;
    }

    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 p-4 md:p-8 font-inter">
      <div className="max-w-6xl mx-auto space-y-6">
        
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-indigo-600 rounded-xl shadow-lg shadow-indigo-500/20">
              <AudioLines size={24} className="text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
                AudioScribe <span className="text-indigo-400">FLUX</span>
              </h1>
              <p className="text-slate-400 text-xs uppercase tracking-wide">Self-Correcting Cognitive Agent</p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-[10px] font-medium text-slate-400 bg-slate-900 py-1.5 px-3 rounded border border-slate-800">
             <Sparkles size={12} className="text-yellow-500" />
             <span>Flash (Listen) + Pro (Think)</span>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Left Column: Upload & Controls */}
          <div className="lg:col-span-1 space-y-6">
             {!file ? (
                <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                  <FileUpload onFileSelect={handleFileSelect} />
                </div>
              ) : (
                <div className="bg-slate-900/50 rounded-xl border border-slate-800 p-4">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="h-10 w-10 bg-indigo-500/10 rounded flex items-center justify-center text-indigo-400">
                      {state.status === AppStatus.PROCESSING ? (
                         <Loader2 size={20} className="animate-spin" />
                      ) : (
                         <FileAudio size={20} />
                      )}
                    </div>
                    <div className="overflow-hidden">
                      <h3 className="font-medium text-white truncate text-sm" title={file.name}>{file.name}</h3>
                      <div className="flex items-center gap-2 text-xs text-slate-500">
                        <span>{formatBytes(file.size)}</span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex gap-2">
                    {state.status === AppStatus.IDLE && (
                      <>
                        <Button variant="ghost" onClick={handleReset} className="flex-1">Reset</Button>
                        <Button onClick={startCognitiveTranscription} icon={<Play size={16} />} className="flex-1">
                          Start Agent
                        </Button>
                      </>
                    )}
                    {(state.status === AppStatus.PROCESSING) && (
                       <Button variant="secondary" onClick={handleReset} className="w-full text-red-400 border-red-900/30">
                          Stop System
                       </Button>
                    )}
                    {(state.status === AppStatus.COMPLETED || state.status === AppStatus.ERROR) && (
                      <Button variant="secondary" onClick={handleReset} icon={<RefreshCcw size={16} />} className="w-full">
                        New Task
                      </Button>
                    )}
                  </div>
                </div>
              )}

              {/* Cognitive Board Visualization */}
              {(state.status === AppStatus.PROCESSING || state.tasks.length > 0) && (
                <CognitiveBoard 
                  tasks={state.tasks} 
                  onRetry={handleTaskRetry} 
                  isProcessing={state.status === AppStatus.PROCESSING}
                />
              )}
          </div>

          {/* Right Column: Output */}
          <div className="lg:col-span-2">
            <div className="bg-slate-900/50 backdrop-blur-sm rounded-xl border border-slate-800 h-full min-h-[600px] flex flex-col">
              
              {/* Output Toolbar */}
              <div className="p-4 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                 <div className="flex items-center bg-slate-950 rounded-lg p-1 border border-slate-800">
                    <button 
                      onClick={() => setActiveTab('polished')}
                      className={`flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                        activeTab === 'polished' 
                        ? 'bg-indigo-600 text-white shadow' 
                        : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <Sparkles size={14} />
                      Polished
                    </button>
                    <button 
                       onClick={() => setActiveTab('raw')}
                       className={`flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                        activeTab === 'raw' 
                        ? 'bg-slate-700 text-white shadow' 
                        : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <FileJson size={14} />
                      Raw Draft
                    </button>
                 </div>

                 <div className="flex gap-2">
                    <Button variant="ghost" size="sm" onClick={copyToClipboard} disabled={!currentViewText}>
                      <Copy size={14} />
                    </Button>

                    {/* 下载菜单 */}
                    <div className="relative group">
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={!currentViewText}
                        className="flex items-center gap-1"
                      >
                        <Download size={14} />
                        <span className="text-xs">▼</span>
                      </Button>

                      {/* 下拉菜单 */}
                      <div className="absolute right-0 mt-1 w-48 bg-slate-800 border border-slate-700 rounded-lg shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-10">
                        <button
                          onClick={() => downloadTranscription('dual')}
                          disabled={!currentViewText}
                          className="w-full px-4 py-2 text-left text-sm hover:bg-slate-700 rounded-t-lg flex items-center gap-2 text-slate-200 disabled:opacity-50"
                        >
                          <FileJson size={14} className="text-indigo-400" />
                          <div>
                            <div className="font-medium">双轨制版本</div>
                            <div className="text-xs text-slate-400">原文+清洗版</div>
                          </div>
                        </button>
                        <button
                          onClick={() => downloadTranscription('markdown')}
                          disabled={!finalPolishedText}
                          className="w-full px-4 py-2 text-left text-sm hover:bg-slate-700 flex items-center gap-2 text-slate-200 disabled:opacity-50"
                        >
                          <Download size={14} className="text-green-400" />
                          <div>
                            <div className="font-medium">仅清洗版</div>
                            <div className="text-xs text-slate-400">精校后文本</div>
                          </div>
                        </button>
                        <button
                          onClick={() => downloadTranscription('raw')}
                          disabled={!finalRawText}
                          className="w-full px-4 py-2 text-left text-sm hover:bg-slate-700 rounded-b-lg flex items-center gap-2 text-slate-200 disabled:opacity-50"
                        >
                          <Download size={14} className="text-slate-400" />
                          <div>
                            <div className="font-medium">仅原文</div>
                            <div className="text-xs text-slate-400">未处理文本</div>
                          </div>
                        </button>
                      </div>
                    </div>
                 </div>
              </div>
              
              <div className="flex-1 p-6 overflow-y-auto bg-slate-950/30 max-h-[700px]">
                {currentViewText ? (
                  <div className={`prose prose-invert prose-sm max-w-none whitespace-pre-wrap leading-relaxed ${activeTab === 'raw' ? 'text-slate-400 font-mono text-xs' : 'text-slate-300'}`}>
                    {currentViewText}
                  </div>
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-slate-600 space-y-4">
                    {state.status === AppStatus.PROCESSING || state.status === AppStatus.ANALYZING ? (
                      <>
                        <Loader2 size={32} className="animate-spin text-indigo-500" />
                        <div className="text-center">
                          <p className="text-sm font-medium text-slate-300">Agent is working...</p>
                          <p className="text-xs text-slate-500 mt-1">
                            Processing {state.totalChunks} audio segments
                          </p>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="p-4 rounded-full bg-slate-900 border border-slate-800">
                          <Sparkles size={24} className="text-slate-700" />
                        </div>
                        <p className="text-sm">Ready to transcribe...</p>
                      </>
                    )}
                  </div>
                )}
                <div ref={transcriptionEndRef} />
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};

export default App;