import type {
  ApiResponse,
  UserApiConfig,
  TranscriptionJob,
  JobListResponse,
  CompareData,
  ApiConfig,
} from '../types';

// API 基础 URL（开发环境使用 Worker 本地地址）
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8787';

class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string = API_BASE_URL) {
    this.baseUrl = baseUrl;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<ApiResponse<T>> {
    const url = `${this.baseUrl}${endpoint}`;
    
    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
      });

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || data.message || 'Request failed');
      }

      return data;
    } catch (error) {
      console.error('API request failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  // ==================== 用户 API 配置 ====================

  async saveApiConfig(userId: string, config: ApiConfig): Promise<ApiResponse<UserApiConfig>> {
    return this.request<UserApiConfig>('/api/config', {
      method: 'POST',
      body: JSON.stringify({
        userId,
        provider: config.provider,
        apiKey: config.apiKey,
        mode: config.mode,
      }),
    });
  }

  async getApiConfig(userId: string): Promise<ApiResponse<UserApiConfig>> {
    return this.request<UserApiConfig>(`/api/config/${userId}`);
  }

  async validateApiKey(provider: string, apiKey: string): Promise<ApiResponse<{ valid: boolean }>> {
    return this.request<{ valid: boolean }>('/api/config/validate', {
      method: 'POST',
      body: JSON.stringify({ provider, apiKey }),
    });
  }

  // ==================== 转写任务 ====================

  async createJob(
    userId: string,
    fileName: string,
    fileSize: number,
    audioData: string
  ): Promise<ApiResponse<TranscriptionJob>> {
    return this.request<TranscriptionJob>('/api/jobs', {
      method: 'POST',
      body: JSON.stringify({
        userId,
        fileName,
        fileSize,
        audioData,
      }),
    });
  }

  async getJob(jobId: string): Promise<ApiResponse<TranscriptionJob>> {
    return this.request<TranscriptionJob>(`/api/jobs/${jobId}`);
  }

  async getJobs(params: {
    userId?: string;
    status?: string;
    limit?: number;
    offset?: number;
  }): Promise<ApiResponse<JobListResponse>> {
    const queryParams = new URLSearchParams();
    
    if (params.userId) queryParams.append('userId', params.userId);
    if (params.status) queryParams.append('status', params.status);
    if (params.limit) queryParams.append('limit', params.limit.toString());
    if (params.offset) queryParams.append('offset', params.offset.toString());

    return this.request<JobListResponse>(`/api/jobs?${queryParams.toString()}`);
  }

  async getCompareData(jobId: string): Promise<ApiResponse<CompareData>> {
    return this.request<CompareData>(`/api/jobs/${jobId}/compare`);
  }

  // ==================== 健康检查 ====================

  async healthCheck(): Promise<ApiResponse<{ status: string; version: string }>> {
    return this.request<{ status: string; version: string }>('/');
  }
}

// 导出单例
export const apiClient = new ApiClient();
export default apiClient;

