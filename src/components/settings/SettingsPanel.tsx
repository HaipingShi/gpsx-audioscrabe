import React, { useState, useEffect } from 'react';
import { useAppStore } from '../../stores/appStore';
import { apiClient } from '../../services/apiClient';
import { encryptText } from '../../utils/encryption';
import { Settings, Key, Save, CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import type { LLMProvider, ApiMode } from '../../types';

export const SettingsPanel: React.FC = () => {
  const userId = useAppStore((state) => state.userId);
  const apiConfig = useAppStore((state) => state.apiConfig);
  const setUserId = useAppStore((state) => state.setUserId);
  const setApiConfig = useAppStore((state) => state.setApiConfig);

  const [formData, setFormData] = useState({
    userId: userId || '',
    provider: (apiConfig?.provider || 'gemini') as LLMProvider,
    apiKey: '',
    mode: (apiConfig?.mode || 'self-hosted') as ApiMode,
  });

  const [saving, setSaving] = useState(false);
  const [validating, setValidating] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (userId) {
      setFormData((prev) => ({ ...prev, userId }));
    }
  }, [userId]);

  const handleValidateApiKey = async () => {
    if (!formData.apiKey) {
      setError('请输入 API Key');
      return;
    }

    setValidating(true);
    setError(null);

    try {
      const response = await apiClient.validateApiKey(
        formData.provider,
        formData.apiKey
      );

      if (response.success && response.data?.valid) {
        setSaveStatus('success');
        setTimeout(() => setSaveStatus('idle'), 2000);
      } else {
        throw new Error('API Key 验证失败');
      }
    } catch (err) {
      console.error('Validation failed:', err);
      setError(err instanceof Error ? err.message : '验证失败');
      setSaveStatus('error');
    } finally {
      setValidating(false);
    }
  };

  const handleSave = async () => {
    if (!formData.userId) {
      setError('请输入用户 ID');
      return;
    }

    if (!formData.apiKey && formData.mode === 'self-hosted') {
      setError('请输入 API Key');
      return;
    }

    setSaving(true);
    setError(null);
    setSaveStatus('idle');

    try {
      // 保存用户 ID
      setUserId(formData.userId);

      // 如果是自托管模式，保存 API 配置
      if (formData.mode === 'self-hosted' && formData.apiKey) {
        // 加密 API Key
        const encryptedApiKey = await encryptText(formData.apiKey, formData.userId);

        // 保存到后端
        const response = await apiClient.saveApiConfig(formData.userId, {
          provider: formData.provider,
          apiKey: encryptedApiKey,
          mode: formData.mode,
        });

        if (!response.success) {
          throw new Error(response.error || '保存失败');
        }
      }

      // 更新本地状态
      setApiConfig({
        provider: formData.provider,
        apiKey: formData.apiKey,
        mode: formData.mode,
      });

      setSaveStatus('success');
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch (err) {
      console.error('Save failed:', err);
      setError(err instanceof Error ? err.message : '保存失败');
      setSaveStatus('error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl p-8 shadow-2xl">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <Settings className="w-8 h-8 text-purple-400" />
          <h2 className="text-2xl font-bold text-white">设置</h2>
        </div>

        {/* Form */}
        <div className="space-y-6">
          {/* User ID */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              用户 ID
            </label>
            <input
              type="text"
              value={formData.userId}
              onChange={(e) => setFormData({ ...formData, userId: e.target.value })}
              placeholder="输入您的用户 ID"
              className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:border-purple-500"
            />
            <p className="mt-1 text-xs text-slate-400">
              用于标识您的账户和加密 API Key
            </p>
          </div>

          {/* API Mode */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              API 模式
            </label>
            <div className="grid grid-cols-2 gap-4">
              <button
                onClick={() => setFormData({ ...formData, mode: 'self-hosted' })}
                className={`p-4 rounded-lg border-2 transition-all ${
                  formData.mode === 'self-hosted'
                    ? 'border-purple-500 bg-purple-900/30'
                    : 'border-slate-600 bg-slate-700/30 hover:border-slate-500'
                }`}
              >
                <div className="text-white font-medium mb-1">自托管</div>
                <div className="text-xs text-slate-400">使用您自己的 API Key</div>
              </button>
              <button
                onClick={() => setFormData({ ...formData, mode: 'shared' })}
                className={`p-4 rounded-lg border-2 transition-all ${
                  formData.mode === 'shared'
                    ? 'border-purple-500 bg-purple-900/30'
                    : 'border-slate-600 bg-slate-700/30 hover:border-slate-500'
                }`}
              >
                <div className="text-white font-medium mb-1">共享</div>
                <div className="text-xs text-slate-400">使用团队共享 API</div>
              </button>
            </div>
          </div>

          {/* Provider (only for self-hosted) */}
          {formData.mode === 'self-hosted' && (
            <>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  LLM 提供商
                </label>
                <select
                  value={formData.provider}
                  onChange={(e) =>
                    setFormData({ ...formData, provider: e.target.value as LLMProvider })
                  }
                  className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-purple-500"
                >
                  <option value="gemini">Google Gemini</option>
                  <option value="deepseek">DeepSeek</option>
                </select>
              </div>

              {/* API Key */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  <Key className="inline w-4 h-4 mr-1" />
                  API Key
                </label>
                <div className="flex gap-2">
                  <input
                    type="password"
                    value={formData.apiKey}
                    onChange={(e) => setFormData({ ...formData, apiKey: e.target.value })}
                    placeholder="输入您的 API Key"
                    className="flex-1 px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:border-purple-500"
                  />
                  <button
                    onClick={handleValidateApiKey}
                    disabled={validating || !formData.apiKey}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-600 text-white rounded-lg transition-colors flex items-center gap-2"
                  >
                    {validating ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      '验证'
                    )}
                  </button>
                </div>
                <p className="mt-1 text-xs text-slate-400">
                  🔒 API Key 将使用 AES-256-GCM 加密存储
                </p>
              </div>
            </>
          )}

          {/* Error Message */}
          {error && (
            <div className="p-4 bg-red-900/30 border border-red-500/50 rounded-lg">
              <p className="text-red-300">{error}</p>
            </div>
          )}

          {/* Save Button */}
          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-purple-600 hover:bg-purple-700 disabled:bg-slate-600 text-white rounded-lg transition-colors font-medium"
          >
            {saving ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                保存中...
              </>
            ) : saveStatus === 'success' ? (
              <>
                <CheckCircle2 className="w-5 h-5" />
                保存成功
              </>
            ) : saveStatus === 'error' ? (
              <>
                <XCircle className="w-5 h-5" />
                保存失败
              </>
            ) : (
              <>
                <Save className="w-5 h-5" />
                保存设置
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

