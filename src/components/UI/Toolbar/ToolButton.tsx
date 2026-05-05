import React from 'react';

interface ToolButtonProps {
  active: boolean;
  icon: string;
  label: string;
  onClick: () => void;
  compact?: boolean;
}

export const ToolButton: React.FC<ToolButtonProps> = ({ active, icon, label, onClick, compact = false }) => {
  return (
    <button
      onClick={onClick}
      title={label}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        width: compact ? '100%' : 64,
        height: compact ? 'clamp(34px, 5.9vh, 52px)' : 64,
        borderRadius: 6,
        border: 'none',
        backgroundColor: active ? '#2563eb' : '#374151',
        color: 'white',
        fontSize: compact ? 15 : 28,
        cursor: 'pointer',
        transition: 'transform 0.1s, background-color 0.2s',
        boxShadow: active ? '0 0 15px rgba(37, 99, 235, 0.5)' : 'none',
      }}
    >
      <span>{icon}</span>
      <span style={{ fontSize: compact ? 7 : 9, marginTop: 2, fontWeight: 'bold', textTransform: 'uppercase' }}>
        {label}
      </span>
    </button>
  );
};
