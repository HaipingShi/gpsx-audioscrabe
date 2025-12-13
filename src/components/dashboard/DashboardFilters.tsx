import React from 'react';
import { useAppStore } from '../../stores/appStore';
import { Search, Filter, X } from 'lucide-react';
import type { JobStatus } from '../../types';

export const DashboardFilters: React.FC = () => {
  const dashboardFilters = useAppStore((state) => state.dashboardFilters);
  const setDashboardFilters = useAppStore((state) => state.setDashboardFilters);
  const resetDashboardFilters = useAppStore((state) => state.resetDashboardFilters);

  const statusOptions: { value: JobStatus; label: string }[] = [
    { value: 'created', label: '已创建' },
    { value: 'uploading', label: '上传中' },
    { value: 'processing', label: '处理中' },
    { value: 'transcribing', label: '转写中' },
    { value: 'polishing', label: '精校中' },
    { value: 'completed', label: '已完成' },
    { value: 'failed', label: '失败' },
  ];

  const sortOptions = [
    { value: 'createdAt', label: '创建时间' },
    { value: 'updatedAt', label: '更新时间' },
    { value: 'fileName', label: '文件名' },
    { value: 'fileSize', label: '文件大小' },
  ];

  const hasActiveFilters =
    dashboardFilters.status ||
    dashboardFilters.searchQuery ||
    dashboardFilters.dateFrom ||
    dashboardFilters.dateTo;

  return (
    <div className="bg-slate-800/50 backdrop-blur-sm rounded-lg p-4 border border-slate-700">
      <div className="flex items-center gap-2 mb-4">
        <Filter className="w-5 h-5 text-purple-400" />
        <h3 className="text-white font-medium">筛选和排序</h3>
        {hasActiveFilters && (
          <button
            onClick={resetDashboardFilters}
            className="ml-auto flex items-center gap-1 text-sm text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
            清除筛选
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="搜索文件名或任务ID..."
            value={dashboardFilters.searchQuery || ''}
            onChange={(e) => setDashboardFilters({ searchQuery: e.target.value })}
            className="w-full pl-10 pr-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:border-purple-500"
          />
        </div>

        {/* Status Filter */}
        <select
          value={dashboardFilters.status || ''}
          onChange={(e) =>
            setDashboardFilters({
              status: e.target.value ? (e.target.value as JobStatus) : undefined,
            })
          }
          className="px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-purple-500"
        >
          <option value="">所有状态</option>
          {statusOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        {/* Sort By */}
        <select
          value={dashboardFilters.sortBy || 'createdAt'}
          onChange={(e) =>
            setDashboardFilters({
              sortBy: e.target.value as any,
            })
          }
          className="px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-purple-500"
        >
          {sortOptions.map((option) => (
            <option key={option.value} value={option.value}>
              排序: {option.label}
            </option>
          ))}
        </select>

        {/* Sort Order */}
        <select
          value={dashboardFilters.sortOrder || 'desc'}
          onChange={(e) =>
            setDashboardFilters({
              sortOrder: e.target.value as 'asc' | 'desc',
            })
          }
          className="px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-purple-500"
        >
          <option value="desc">降序</option>
          <option value="asc">升序</option>
        </select>
      </div>

      {/* Date Range */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
        <div>
          <label className="block text-sm text-slate-400 mb-1">开始日期</label>
          <input
            type="date"
            value={dashboardFilters.dateFrom || ''}
            onChange={(e) => setDashboardFilters({ dateFrom: e.target.value })}
            className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-purple-500"
          />
        </div>
        <div>
          <label className="block text-sm text-slate-400 mb-1">结束日期</label>
          <input
            type="date"
            value={dashboardFilters.dateTo || ''}
            onChange={(e) => setDashboardFilters({ dateTo: e.target.value })}
            className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-purple-500"
          />
        </div>
      </div>
    </div>
  );
};

