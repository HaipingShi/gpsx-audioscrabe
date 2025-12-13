import React, { useEffect, useState } from 'react';
import { useAppStore } from '../../stores/appStore';
import { apiClient } from '../../services/apiClient';
import { JobCard } from './JobCard';
import { DashboardFilters } from './DashboardFilters';
import { Loader2, FolderOpen } from 'lucide-react';
import type { TranscriptionJob } from '../../types';

export const DashboardView: React.FC = () => {
  const userId = useAppStore((state) => state.userId);
  const jobs = useAppStore((state) => state.jobs);
  const jobsLoading = useAppStore((state) => state.jobsLoading);
  const jobsError = useAppStore((state) => state.jobsError);
  const setJobs = useAppStore((state) => state.setJobs);
  const setJobsLoading = useAppStore((state) => state.setJobsLoading);
  const setJobsError = useAppStore((state) => state.setJobsError);
  const dashboardFilters = useAppStore((state) => state.dashboardFilters);
  const pagination = useAppStore((state) => state.pagination);
  const setPagination = useAppStore((state) => state.setPagination);

  const [refreshing, setRefreshing] = useState(false);

  // 加载任务列表
  const loadJobs = async () => {
    if (!userId) return;

    setJobsLoading(true);
    setJobsError(null);

    try {
      const response = await apiClient.getJobs({
        userId,
        status: dashboardFilters.status,
        limit: pagination.pageSize,
        offset: (pagination.page - 1) * pagination.pageSize,
      });

      if (response.success && response.data) {
        setJobs(response.data.jobs);
        setPagination(
          pagination.page,
          pagination.pageSize,
          response.data.total
        );
      } else {
        throw new Error(response.error || '加载失败');
      }
    } catch (error) {
      console.error('Failed to load jobs:', error);
      setJobsError(error instanceof Error ? error.message : '加载失败');
    } finally {
      setJobsLoading(false);
    }
  };

  // 刷新任务列表
  const handleRefresh = async () => {
    setRefreshing(true);
    await loadJobs();
    setRefreshing(false);
  };

  // 初始加载
  useEffect(() => {
    loadJobs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, dashboardFilters.status, pagination.page]);

  // 🆕 轮询更新进行中的任务
  useEffect(() => {
    // 检查是否有进行中的任务
    const hasActiveJobs = jobs.some(
      (job) =>
        job.status === 'processing' ||
        job.status === 'transcribing' ||
        job.status === 'polishing' ||
        job.status === 'uploading'
    );

    if (!hasActiveJobs) return;

    // 每 2 秒轮询一次
    const interval = setInterval(() => {
      loadJobs();
    }, 2000);

    return () => clearInterval(interval);
  }, [jobs]);

  // 过滤和排序任务
  const filteredJobs = React.useMemo(() => {
    let filtered = [...jobs];

    // 搜索过滤
    if (dashboardFilters.searchQuery) {
      const query = dashboardFilters.searchQuery.toLowerCase();
      filtered = filtered.filter(
        (job) =>
          job.fileName.toLowerCase().includes(query) ||
          job.jobId.toLowerCase().includes(query)
      );
    }

    // 日期过滤
    if (dashboardFilters.dateFrom) {
      filtered = filtered.filter(
        (job) => new Date(job.createdAt) >= new Date(dashboardFilters.dateFrom!)
      );
    }
    if (dashboardFilters.dateTo) {
      filtered = filtered.filter(
        (job) => new Date(job.createdAt) <= new Date(dashboardFilters.dateTo!)
      );
    }

    // 排序
    if (dashboardFilters.sortBy) {
      filtered.sort((a, b) => {
        const aValue = a[dashboardFilters.sortBy!];
        const bValue = b[dashboardFilters.sortBy!];
        const order = dashboardFilters.sortOrder === 'desc' ? -1 : 1;
        return aValue > bValue ? order : -order;
      });
    }

    return filtered;
  }, [jobs, dashboardFilters]);

  return (
    <div className="max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-white">转写任务看板</h2>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-slate-600 text-white rounded-lg transition-colors"
        >
          <Loader2 className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          刷新
        </button>
      </div>

      {/* Filters */}
      <DashboardFilters />

      {/* Content */}
      <div className="mt-6">
        {jobsLoading && !refreshing ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 text-purple-400 animate-spin" />
          </div>
        ) : jobsError ? (
          <div className="p-6 bg-red-900/30 border border-red-500/50 rounded-lg">
            <p className="text-red-300">{jobsError}</p>
          </div>
        ) : filteredJobs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-slate-400">
            <FolderOpen className="w-16 h-16 mb-4" />
            <p className="text-lg">暂无任务</p>
            <p className="text-sm">上传音频文件开始转写</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredJobs.map((job) => (
              <JobCard key={job.jobId} job={job} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

