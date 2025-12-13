import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  AppState,
  ApiConfig,
  TranscriptionJob,
  DashboardFilters,
} from '../types';

interface AppStore extends AppState {
  // Actions - 用户配置
  setUserId: (userId: string) => void;
  setApiConfig: (config: ApiConfig | null) => void;
  clearApiConfig: () => void;
  
  // Actions - 当前任务
  setCurrentJob: (job: TranscriptionJob | null) => void;
  updateJobProgress: (jobId: string, progress: number) => void;
  
  // Actions - 任务列表
  setJobs: (jobs: TranscriptionJob[]) => void;
  addJob: (job: TranscriptionJob) => void;
  updateJob: (jobId: string, updates: Partial<TranscriptionJob>) => void;
  removeJob: (jobId: string) => void;
  setJobsLoading: (loading: boolean) => void;
  setJobsError: (error: string | null) => void;
  
  // Actions - UI 状态
  setDashboardFilters: (filters: Partial<DashboardFilters>) => void;
  resetDashboardFilters: () => void;
  setCurrentView: (view: AppState['currentView']) => void;
  setPagination: (page: number, pageSize: number, total: number) => void;
}

const initialState: AppState = {
  userId: null,
  apiConfig: null,
  currentJob: null,
  jobs: [],
  jobsLoading: false,
  jobsError: null,
  dashboardFilters: {},
  pagination: {
    page: 1,
    pageSize: 20,
    total: 0,
  },
  currentView: 'upload',
};

export const useAppStore = create<AppStore>()(
  persist(
    (set, get) => ({
      ...initialState,

      // 用户配置
      setUserId: (userId) => set({ userId }),
      
      setApiConfig: (config) => set({ apiConfig: config }),
      
      clearApiConfig: () => set({ apiConfig: null }),

      // 当前任务
      setCurrentJob: (job) => set({ currentJob: job }),
      
      updateJobProgress: (jobId, progress) => {
        const { currentJob } = get();
        if (currentJob?.jobId === jobId) {
          set({ currentJob: { ...currentJob, progress } });
        }
      },

      // 任务列表
      setJobs: (jobs) => set({ jobs, jobsError: null }),
      
      addJob: (job) => set((state) => ({ jobs: [job, ...state.jobs] })),
      
      updateJob: (jobId, updates) =>
        set((state) => ({
          jobs: state.jobs.map((job) =>
            job.jobId === jobId ? { ...job, ...updates } : job
          ),
        })),
      
      removeJob: (jobId) =>
        set((state) => ({
          jobs: state.jobs.filter((job) => job.jobId !== jobId),
        })),
      
      setJobsLoading: (loading) => set({ jobsLoading: loading }),
      
      setJobsError: (error) => set({ jobsError: error }),

      // UI 状态
      setDashboardFilters: (filters) =>
        set((state) => ({
          dashboardFilters: { ...state.dashboardFilters, ...filters },
        })),
      
      resetDashboardFilters: () => set({ dashboardFilters: {} }),
      
      setCurrentView: (view) => set({ currentView: view }),
      
      setPagination: (page, pageSize, total) =>
        set({ pagination: { page, pageSize, total } }),
    }),
    {
      name: 'audioscribe-storage',
      partialize: (state) => ({
        userId: state.userId,
        apiConfig: state.apiConfig,
        currentView: state.currentView,
      }),
    }
  )
);

