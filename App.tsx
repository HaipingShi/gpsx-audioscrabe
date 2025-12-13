import React, { useState, useEffect, useRef, useMemo } from 'react';
import { FileUpload } from './components/FileUpload';
import { Button } from './components/ui/Button';
import { CognitiveBoard } from './components/CognitiveBoard';
import { AppStatus, ProcessingState, CognitiveTask, AgentPhase, StateTransition } from './types';
import { formatBytes, splitFileIntoChunks } from './utils/fileHelpers';
import { smartTranscribe, initTranscriptionService, TranscriptionEngine } from './services/transcriptionService';
import { polishChunk, consultOnIssue } from './services/deepseekService';
import { preprocessAudio } from './utils/audioProcessor';
import { verifyTranscription, cleanText } from './utils/cognitive';
import { detectSilence } from './utils/audioAnalysis';
import { detectHallucination } from './services/hallucinationDetector';
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

  // 初始化转写服务并从 LocalStorage 恢复状态
  useEffect(() => {
    // 检查转写引擎可用性
    initTranscriptionService().then(({ funasrAvailable, geminiAvailable }) => {
      if (!funasrAvailable && !geminiAvailable) {
        console.error('❌ No transcription engine available!');
      } else if (funasrAvailable) {
        console.log('✅ FunASR is primary engine');
      } else {
        console.log('⚠️ Only Gemini available (FunASR unavailable)');
      }
    });

    // 恢复之前的状态
    try {
      const saved = localStorage.getItem('audioscribe_state');
      if (saved) {
        const parsed = JSON.parse(saved);
        const age = Date.now() - (parsed.timestamp || 0);

        // 只恢复 24 小时内的数据
        if (age < 24 * 60 * 60 * 1000 && parsed.tasks?.length > 0) {
          console.log(`Restored ${parsed.tasks.length} tasks from localStorage`);
          // 注意：这里只恢复文本数据，不恢复 blob 和运行状态
          setState(prev => ({
            ...prev,
            tasks: parsed.tasks.map((t: any) => ({
              ...t,
              blob: new Blob(), // 空 blob，无法重新处理
              logs: t.logs || [],
              lastUpdated: Date.now(),
              stateHistory: t.stateHistory || [], // 确保是数组
              timings: t.timings || {},
              needsRetry: t.needsRetry || false
            }))
          }));
        }
      }
    } catch (e) {
      console.warn('Failed to restore from localStorage:', e);
    }
  }, []);

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
  const updateTask = (id: number, updates: Partial<CognitiveTask>, reason?: string) => {
    setState(prev => {
      const task = prev.tasks.find(t => t.id === id);
      if (!task) return prev;

      // 记录状态转换
      const stateTransition: StateTransition | null =
        updates.phase && updates.phase !== task.phase
          ? {
              from: task.phase,
              to: updates.phase,
              timestamp: Date.now(),
              reason,
              metadata: {
                retryCount: updates.retryCount ?? task.retryCount,
                entropy: updates.entropy ?? task.entropy
              }
            }
          : null;

      const newState = {
        ...prev,
        tasks: prev.tasks.map(t => t.id === id ? {
          ...t,
          ...updates,
          lastUpdated: Date.now(), // Feed the watchdog
          stateHistory: stateTransition
            ? [...t.stateHistory, stateTransition]
            : t.stateHistory
        } : t)
      };

      // 持久化到 LocalStorage（异步，不阻塞 UI）
      setTimeout(() => {
        try {
          localStorage.setItem('audioscribe_state', JSON.stringify({
            tasks: newState.tasks.map(t => ({
              id: t.id,
              phase: t.phase,
              transcription: t.transcription,
              polishedText: t.polishedText,
              entropy: t.entropy,
              retryCount: t.retryCount,
              needsRetry: t.needsRetry,
              hallucinationDetection: t.hallucinationDetection,
              stateHistory: t.stateHistory
            })),
            timestamp: Date.now()
          }));
        } catch (e) {
          console.warn('Failed to save to localStorage:', e);
        }
      }, 0);

      return newState;
    });
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
        // 注意：POLISHING 是异步的，不应该被 Watchdog 监控
        // 因为 Polish 在后台执行，不占用并发槽位
        const isBusy = [
          AgentPhase.PREPROCESSING,
          AgentPhase.PERCEPTION,
          AgentPhase.ACTION,
          AgentPhase.VERIFICATION,
          AgentPhase.CONSULTATION,
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

    // 时间追踪
    const startTime = Date.now();
    let preprocessingStart: number;
    let transcriptionStart: number;

    try {
        // === PHASE 0: PREPROCESSING ===
        // We do this per-chunk to handle large files efficiently and ensure valid WAV headers for each slice.
        preprocessingStart = Date.now();
        updateTask(taskId, { phase: AgentPhase.PREPROCESSING }, 'Starting preprocessing');
        addLogToTask(taskId, "Optimizing audio (16kHz Mono WAV)...");

        // This creates an OfflineAudioContext. Concurrency is limited by the caller loop.
        blob = await preprocessAudio(blob);

        const preprocessingMs = Date.now() - preprocessingStart;
        updateTask(taskId, {
          timings: { ...task.timings, preprocessingMs }
        });
        
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
               updateTask(taskId, { phase: AgentPhase.REFINEMENT, retryCount: attempts }, `Retry attempt ${attempts}`);
            } else {
               transcriptionStart = Date.now();
               updateTask(taskId, { phase: AgentPhase.ACTION }, 'Starting transcription');
            }

            // === PHASE 2: ACTION ===
            // 使用智能双引擎转写（FunASR 优先，Gemini 兜底）
            const transcriptionResult = await smartTranscribe(
              blob,
              chunkIndex,
              totalChunks,
              attempts > 0,
              customTemp
            );

            currentText = cleanText(transcriptionResult.text);

            // 记录使用的引擎并保存到 task
            addLogToTask(taskId, `🎯 Engine: ${transcriptionResult.engine}${transcriptionResult.fallbackUsed ? ' (fallback)' : ''}`);

            if (attempts === 0) {
              const transcriptionMs = Date.now() - transcriptionStart;
              updateTask(taskId, {
                timings: { ...task.timings, transcriptionMs },
                transcriptionEngine: transcriptionResult.engine,
                engineFallbackUsed: transcriptionResult.fallbackUsed
              });
            }

            // === PHASE 3: VERIFICATION ===
            updateTask(taskId, { phase: AgentPhase.VERIFICATION, transcription: currentText });
            const verification = verifyTranscription(currentText);
            updateTask(taskId, { entropy: verification.entropy });

            // === PHASE 3.5: EARLY HALLUCINATION DETECTION ===
            // 使用转写结果中的幻觉检测数据（已在 smartTranscribe 中完成）
            const earlyDetection = transcriptionResult.hallucinationDetection!;

            if (earlyDetection.isHallucination && earlyDetection.confidence > 0.8) {
              // 高置信度幻觉，立即重试
              addLogToTask(taskId, `🚨 Transcription hallucination: ${earlyDetection.reason}`);

              if (attempts < MAX_RETRIES) {
                addLogToTask(taskId, `🔄 Retrying transcription (attempt ${attempts + 1}/${MAX_RETRIES})...`);
                customTemp = Math.max(0.1, 0.3 - attempts * 0.1); // 降低 temperature
                attempts++;
                continue; // 重新转写
              } else {
                addLogToTask(taskId, "❌ Max retries reached. Marking as hallucination.");
                updateTask(taskId, {
                  phase: AgentPhase.HALLUCINATION_DETECTED,
                  hallucinationDetection: earlyDetection,
                  needsRetry: true
                }, `Hallucination: ${earlyDetection.reason}`);
                return;
              }
            }

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
                   addLogToTask(taskId, `🤔 Suspicious: ${verification.reason}. Consulting DeepSeek...`);
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

        // === PHASE 5: POLISHING (异步执行，不阻塞下一个转写) ===
        // 先标记转写完成，立即释放并发槽位
        updateTask(taskId, {
          transcription: currentText,
          phase: AgentPhase.POLISHING
        }, 'Starting polishing');

        // Polish 在后台异步执行，不阻塞主流程
        const polishingStart = Date.now();
        polishChunk(currentText)
          .then(async (polished) => {
            const polishingMs = Date.now() - polishingStart;
            const totalMs = Date.now() - startTime;

            // === PHASE 6: HALLUCINATION DETECTION ===
            addLogToTask(taskId, "🔍 Detecting hallucinations...");

            const detection = await detectHallucination(
              currentText,
              polished,
              chunkIndex
            );

            if (detection.isHallucination && detection.confidence > 0.7) {
              // 检测到幻觉！
              addLogToTask(taskId, `🚨 Hallucination detected! ${detection.reason}`);
              addLogToTask(taskId, `Evidence: ${detection.evidence.join(', ')}`);

              updateTask(taskId, {
                polishedText: polished,
                phase: AgentPhase.HALLUCINATION_DETECTED,
                hallucinationDetection: detection,
                needsRetry: detection.suggestedAction === 'RETRY',
                timings: { ...task.timings, polishingMs, totalMs }
              }, `Hallucination: ${detection.reason}`);

              if (detection.suggestedAction === 'RETRY') {
                addLogToTask(taskId, "⏳ Marked for retry after all chunks complete");
              }
            } else {
              // 正常完成
              updateTask(taskId, {
                polishedText: polished,
                phase: AgentPhase.COMMITTED,
                hallucinationDetection: detection,
                needsRetry: false,
                timings: { ...task.timings, polishingMs, totalMs }
              }, 'Polishing completed successfully');
              addLogToTask(taskId, `✨ Polishing completed (${(totalMs / 1000).toFixed(1)}s)`);
            }
          })
          .catch(err => {
            console.warn(`Polish failed for chunk ${taskId}:`, err);
            // Polish 失败不影响转写结果，使用原文
            updateTask(taskId, {
              polishedText: currentText,
              phase: AgentPhase.COMMITTED,
              needsRetry: false
            }, 'Polish failed, using raw text');
            addLogToTask(taskId, "⚠️ Polish failed, using raw text");
          });

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
      lastUpdated: Date.now(),
      stateHistory: [],
      needsRetry: false,
      timings: {}
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

    // === PHASE 7: AUTO-RETRY HALLUCINATED CHUNKS ===
    // 等待所有 Polish 完成（包括幻觉检测）
    await new Promise(resolve => setTimeout(resolve, 2000));

    const tasksNeedingRetry = state.tasks.filter(t =>
      t.needsRetry &&
      t.phase === AgentPhase.HALLUCINATION_DETECTED &&
      t.retryCount < MAX_RETRIES
    );

    if (tasksNeedingRetry.length > 0) {
      console.log(`🔄 Auto-retrying ${tasksNeedingRetry.length} hallucinated chunks...`);

      for (const task of tasksNeedingRetry) {
        addLogToTask(task.id, "🔄 Auto-retry triggered by hallucination detection");

        updateTask(task.id, {
          phase: AgentPhase.PENDING_RETRY,
          retryCount: task.retryCount + 1
        }, 'Auto-retry for hallucination');

        const controller = new AbortController();
        taskControllers.current.set(task.id, controller);

        await processSingleChunk(task, state.totalChunks, controller.signal);
        taskControllers.current.delete(task.id);
      }
    }
  };

  // Monitor global completion status
  useEffect(() => {
    if (state.status === AppStatus.PROCESSING) {
      const allDone = state.tasks.every(t =>
        [AgentPhase.COMMITTED, AgentPhase.SKIPPED, AgentPhase.ERROR, AgentPhase.HALLUCINATION_DETECTED].includes(t.phase)
      );
      if (allDone && state.tasks.length > 0) {
        setState(prev => ({ ...prev, status: AppStatus.COMPLETED, progress: 100 }));
      }

      const completedCount = state.tasks.filter(t =>
        [AgentPhase.COMMITTED, AgentPhase.SKIPPED, AgentPhase.ERROR, AgentPhase.HALLUCINATION_DETECTED].includes(t.phase)
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

  const clearCache = () => {
    if (confirm('确定要清除所有缓存数据吗？这将删除所有已保存的转写结果。')) {
      localStorage.removeItem('audioscribe_state');
      setState({
        status: AppStatus.IDLE,
        progress: 0,
        tasks: [],
        totalChunks: 0,
      });
      setFile(null);
      alert('缓存已清除');
    }
  };

  // 计算缓存大小
  const getCacheSize = () => {
    try {
      const saved = localStorage.getItem('audioscribe_state');
      if (!saved) return '0 KB';
      const bytes = new Blob([saved]).size;
      return formatBytes(bytes);
    } catch {
      return 'Unknown';
    }
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

          // 格式化时间戳
          const formatTime = (ms?: number) => {
            if (!ms) return '未知';
            const seconds = (ms / 1000).toFixed(1);
            return `${seconds}s`;
          };

          // 元数据
          const metadata = [
            `#${t.id}`,
            t.transcriptionEngine || '未知引擎',
            t.engineFallbackUsed ? '⚠️ 降级' : '',
            t.timings?.transcriptionMs ? `转写: ${formatTime(t.timings.transcriptionMs)}` : '',
            t.timings?.polishingMs ? `精校: ${formatTime(t.timings.polishingMs)}` : '',
            t.phase
          ].filter(Boolean).join(' | ');

          return `## 段落 ${index + 1}

> ${metadata}

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
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-[10px] font-medium text-slate-400 bg-slate-900 py-1.5 px-3 rounded border border-slate-800">
               <Sparkles size={12} className="text-yellow-500" />
               <span>FunASR + Gemini + DeepSeek</span>
            </div>

            {/* 缓存状态 */}
            {state.tasks.length > 0 && (
              <div className="flex items-center gap-2">
                <div className="text-[10px] text-slate-500">
                  💾 {getCacheSize()}
                </div>
                <button
                  onClick={clearCache}
                  className="text-[10px] text-red-400 hover:text-red-300 underline"
                  title="清除缓存"
                >
                  清除
                </button>
              </div>
            )}
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