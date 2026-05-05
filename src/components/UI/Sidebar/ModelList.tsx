import React from 'react';
import { useViewerStore } from '../../../store/useViewerStore';
import { ModelItem } from './ModelItem';
import type { ModelId, ModelState } from '../../../types';

interface ModelListProps {
  selectedModelId?: string | null;
  onSelectModel?: (id: string) => void;
  onModelContextMenu?: (event: React.MouseEvent, model: ModelState) => void;
}

export const ModelList: React.FC<ModelListProps> = ({ selectedModelId, onSelectModel, onModelContextMenu }) => {
  const { models, updateModel } = useViewerStore();

  const groups = models.reduce<Record<string, typeof models>>((acc, m) => {
    const group = m.group || 'Без группы';
    if (!acc[group]) acc[group] = [];
    acc[group].push(m);
    return acc;
  }, {});

  const toggleGroupVisibility = (group: string) => {
    const groupModels = groups[group];
    const anyVisible = groupModels.some((m) => m.visible);
    groupModels.forEach((m) => updateModel(m.id, { visible: !anyVisible }));
  };

  const handleToggleVisibility = (id: ModelId, visible: boolean) => {
    updateModel(id, { visible });
  };

  const handleChangeColor = (id: ModelId, color: string) => {
    updateModel(id, { color });
  };

  const handleChangeOpacity = (id: ModelId, opacity: number) => {
    updateModel(id, { opacity });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {Object.entries(groups).map(([group, groupModels]) => {
        const anyVisible = groupModels.some((m) => m.visible);
        return (
          <div key={group}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 8,
                backgroundColor: '#374151',
                padding: 8,
                borderRadius: 4,
              }}
            >
              <h4 style={{ fontWeight: 'bold', color: '#a5b4fc' }}>{group}</h4>
              <button
                onClick={() => toggleGroupVisibility(group)}
                style={{ background: 'none', border: 'none', color: 'white', fontSize: 20, cursor: 'pointer' }}
              >
                {anyVisible ? '👁️' : '🚫'}
              </button>
            </div>
            <div style={{ paddingLeft: 8, borderLeft: '2px solid #4b5563' }}>
              {groupModels.map((model) => (
                <ModelItem
                  key={model.id}
                  model={model}
                  selected={selectedModelId === model.id}
                  onSelect={() => onSelectModel?.(model.id)}
                  onContextMenu={(event) => onModelContextMenu?.(event, model)}
                  onToggleVisibility={handleToggleVisibility}
                  onChangeColor={handleChangeColor}
                  onChangeOpacity={handleChangeOpacity}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
};
