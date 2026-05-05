import React from 'react';
import { ToolButton } from './ToolButton';
import type { ToolType } from '../../../types/tools';

interface MainToolbarProps {
  activeTool: ToolType;
  onSelectTool: (tool: ToolType) => void;
  onUndo: () => void;
  onClearAll: () => void;
  orientation?: 'horizontal' | 'vertical';
}

const TOOLS: { id: ToolType; icon: string; label: string }[] = [
  { id: 'ruler', icon: '📏', label: 'Линейка' },
  { id: 'angle', icon: '📐', label: 'Угол' },
  { id: 'circle', icon: '◯', label: 'Окружность' },
  { id: 'brush', icon: '✎', label: 'Кисть' },
  { id: 'text', icon: 'T', label: 'Текст' },
];

export const MainToolbar: React.FC<MainToolbarProps> = ({
  activeTool,
  onSelectTool,
  onUndo,
  onClearAll,
  orientation = 'horizontal',
}) => {
  const vertical = orientation === 'vertical';
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: vertical ? 'column' : 'row',
        justifyContent: vertical ? 'space-between' : 'flex-start',
        gap: vertical ? 4 : 8,
        padding: vertical ? 4 : 8,
        width: vertical ? '100%' : undefined,
        height: vertical ? '100%' : undefined,
        backgroundColor: vertical ? 'transparent' : '#111827',
        borderRadius: 0,
        border: vertical ? 'none' : '1px solid rgba(75, 85, 99, 0.5)',
        boxShadow: vertical ? 'none' : '0 4px 12px rgba(0,0,0,0.4)',
      }}
      data-ui-control="true"
    >
      {TOOLS.map((tool) => (
        <ToolButton
          key={tool.id}
          active={activeTool === tool.id}
          icon={tool.icon}
          label={tool.label}
          onClick={() => onSelectTool(tool.id === activeTool ? 'none' : tool.id)}
          compact={vertical}
        />
      ))}
      <div
        style={{
          width: vertical ? 32 : 1,
          height: vertical ? 1 : 40,
          backgroundColor: '#4b5563',
          margin: vertical ? '4px auto' : '0 4px',
          alignSelf: 'center',
        }}
      />
      <button
        onClick={onUndo}
        title="Отменить"
        style={{
          width: vertical ? '100%' : 48,
          height: vertical ? 'clamp(34px, 5.9vh, 52px)' : 48,
          borderRadius: 6,
          backgroundColor: 'rgba(185, 28, 28, 0.5)',
          color: '#f87171',
          fontSize: 24,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          border: 'none',
          cursor: 'pointer',
          alignSelf: 'center',
        }}
      >
        ↶
      </button>
      <button
        onClick={onClearAll}
        title="Очистить"
        style={{
          width: vertical ? '100%' : 48,
          height: vertical ? 'clamp(34px, 5.9vh, 52px)' : 48,
          borderRadius: 6,
          backgroundColor: 'rgba(185, 28, 28, 0.5)',
          color: '#f87171',
          fontSize: 24,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          border: 'none',
          cursor: 'pointer',
          alignSelf: 'center',
        }}
      >
        ✕
      </button>
    </div>
  );
};
