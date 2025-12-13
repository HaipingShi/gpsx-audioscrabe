import React, { forwardRef, useState } from 'react';
import { Edit2, Save } from 'lucide-react';

interface ComparePanelProps {
  title: string;
  text: string;
  editable?: boolean;
  onScroll?: () => void;
  actions?: React.ReactNode;
}

export const ComparePanel = forwardRef<HTMLDivElement, ComparePanelProps>(
  ({ title, text, editable = false, onScroll, actions }, ref) => {
    const [isEditing, setIsEditing] = useState(false);
    const [editedText, setEditedText] = useState(text);

    const handleSave = () => {
      // TODO: 保存编辑后的文本到后端
      setIsEditing(false);
    };

    return (
      <div className="bg-slate-800/50 backdrop-blur-sm rounded-lg border border-slate-700 overflow-hidden flex flex-col h-[600px]">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-700">
          <h3 className="text-white font-medium">{title}</h3>
          <div className="flex items-center gap-2">
            {editable && (
              <>
                {isEditing ? (
                  <button
                    onClick={handleSave}
                    className="flex items-center gap-1 px-3 py-1 bg-green-600 hover:bg-green-700 text-white rounded text-sm transition-colors"
                  >
                    <Save className="w-4 h-4" />
                    保存
                  </button>
                ) : (
                  <button
                    onClick={() => setIsEditing(true)}
                    className="flex items-center gap-1 px-3 py-1 bg-purple-600 hover:bg-purple-700 text-white rounded text-sm transition-colors"
                  >
                    <Edit2 className="w-4 h-4" />
                    编辑
                  </button>
                )}
              </>
            )}
            {actions}
          </div>
        </div>

        {/* Content */}
        <div
          ref={ref}
          onScroll={onScroll}
          className="flex-1 overflow-y-auto p-4"
        >
          {isEditing ? (
            <textarea
              value={editedText}
              onChange={(e) => setEditedText(e.target.value)}
              className="w-full h-full bg-slate-900/50 text-white p-4 rounded border border-slate-600 focus:outline-none focus:border-purple-500 resize-none font-mono text-sm"
            />
          ) : (
            <div className="text-slate-200 whitespace-pre-wrap font-mono text-sm leading-relaxed">
              {text}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-slate-700 bg-slate-900/30">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>字符数: {text.length}</span>
            <span>行数: {text.split('\n').length}</span>
          </div>
        </div>
      </div>
    );
  }
);

ComparePanel.displayName = 'ComparePanel';

