import React from 'react';
import { useAppStore } from './stores/appStore';
import { UploadView } from './components/UploadView';
import { DashboardView } from './components/dashboard/DashboardView';
import { CompareView } from './components/compare/CompareView';
import { SettingsPanel } from './components/settings/SettingsPanel';

const App: React.FC = () => {
  const currentView = useAppStore((state) => state.currentView);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <header className="mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">
            AudioScribe FLUX
          </h1>
          <p className="text-slate-300">
            智能音频转写与精校平台
          </p>
        </header>

        {/* Navigation */}
        <Navigation />

        {/* Main Content */}
        <main className="mt-8">
          {currentView === 'upload' && <UploadView />}
          {currentView === 'dashboard' && <DashboardView />}
          {currentView === 'compare' && <CompareView />}
          {currentView === 'settings' && <SettingsPanel />}
        </main>
      </div>
    </div>
  );
};

// Navigation Component
const Navigation: React.FC = () => {
  const currentView = useAppStore((state) => state.currentView);
  const setCurrentView = useAppStore((state) => state.setCurrentView);

  const navItems = [
    { id: 'upload' as const, label: '上传', icon: '📤' },
    { id: 'dashboard' as const, label: '看板', icon: '📊' },
    { id: 'compare' as const, label: '对比', icon: '🔍' },
    { id: 'settings' as const, label: '设置', icon: '⚙️' },
  ];

  return (
    <nav className="flex gap-2 bg-slate-800/50 backdrop-blur-sm rounded-lg p-2">
      {navItems.map((item) => (
        <button
          key={item.id}
          onClick={() => setCurrentView(item.id)}
          className={`
            flex items-center gap-2 px-4 py-2 rounded-md transition-all
            ${
              currentView === item.id
                ? 'bg-purple-600 text-white shadow-lg'
                : 'text-slate-300 hover:bg-slate-700 hover:text-white'
            }
          `}
        >
          <span>{item.icon}</span>
          <span>{item.label}</span>
        </button>
      ))}
    </nav>
  );
};

export default App;

