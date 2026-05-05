import React, { useEffect, useState } from 'react';
import * as THREE from 'three';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { PLYLoader } from 'three/examples/jsm/loaders/PLYLoader.js';
import type { ModelState } from '../../../types';
import { clampOpacity } from '../../../utils/math';

interface ModelItemProps {
  model: ModelState;
  selected?: boolean;
  onSelect?: () => void;
  onContextMenu?: (event: React.MouseEvent) => void;
  onToggleVisibility: (id: string, visible: boolean) => void;
  onChangeColor: (id: string, color: string) => void;
  onChangeOpacity: (id: string, opacity: number) => void;
}

interface ModelStats {
  size: [number, number, number];
  area: number;
  volume: number;
}

type StatsState =
  | { modelId: string; status: 'loading'; stats: null }
  | { modelId: string; status: 'ready'; stats: ModelStats }
  | { modelId: string; status: 'error'; stats: null };

const formatNumber = (value: number) => {
  if (!Number.isFinite(value)) return '—';
  if (Math.abs(value) >= 1000) return value.toFixed(0);
  if (Math.abs(value) >= 10) return value.toFixed(1);
  return value.toFixed(2);
};

const triangleArea = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3) =>
  b.clone().sub(a).cross(c.clone().sub(a)).length() / 2;

const geometryStats = (geometry: THREE.BufferGeometry, scale: [number, number, number]) => {
  const geom = geometry.index ? geometry.toNonIndexed() : geometry.clone();
  geom.applyMatrix4(new THREE.Matrix4().makeScale(scale[0], scale[1], scale[2]));
  geom.computeBoundingBox();
  const box = geom.boundingBox || new THREE.Box3();
  const size = box.getSize(new THREE.Vector3());
  const position = geom.getAttribute('position');
  let area = 0;
  let volume = 0;
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  for (let i = 0; i < position.count; i += 3) {
    a.fromBufferAttribute(position, i);
    b.fromBufferAttribute(position, i + 1);
    c.fromBufferAttribute(position, i + 2);
    area += triangleArea(a, b, c);
    volume += a.dot(b.clone().cross(c)) / 6;
  }
  geom.dispose();
  return { size: [size.x, size.y, size.z] as [number, number, number], area, volume: Math.abs(volume) };
};

const loadModelStats = async (model: ModelState): Promise<ModelStats> => {
  const extension = model.url.split('?')[0].split('.').pop()?.toLowerCase();
  if (extension === 'obj') {
    const object = await new OBJLoader().loadAsync(model.url);
    object.updateMatrixWorld(true);
    const box = new THREE.Box3();
    let area = 0;
    let volume = 0;
    object.traverse((child) => {
      if (!(child instanceof THREE.Mesh) || !(child.geometry instanceof THREE.BufferGeometry)) return;
      const geom = child.geometry.clone();
      geom.applyMatrix4(child.matrixWorld);
      geom.applyMatrix4(new THREE.Matrix4().makeScale(model.scale[0], model.scale[1], model.scale[2]));
      const stats = geometryStats(geom, [1, 1, 1]);
      area += stats.area;
      volume += stats.volume;
      box.union(new THREE.Box3().setFromBufferAttribute(geom.getAttribute('position') as THREE.BufferAttribute));
      geom.dispose();
    });
    const size = box.getSize(new THREE.Vector3());
    return { size: [size.x, size.y, size.z], area, volume };
  }
  const geometry =
    extension === 'ply'
      ? await new PLYLoader().loadAsync(model.url)
      : await new STLLoader().loadAsync(model.url);
  return geometryStats(geometry, model.scale);
};

export const ModelItem: React.FC<ModelItemProps> = ({
  model,
  selected = false,
  onSelect,
  onContextMenu,
  onToggleVisibility,
  onChangeColor,
  onChangeOpacity,
}) => {
  const [statsState, setStatsState] = useState<StatsState>({
    modelId: model.id,
    status: 'loading',
    stats: null,
  });
  const stats = statsState.modelId === model.id && statsState.status === 'ready' ? statsState.stats : null;
  const statsError = statsState.modelId === model.id && statsState.status === 'error';
  const statsLoading = statsState.modelId !== model.id || statsState.status === 'loading';

  useEffect(() => {
    let cancelled = false;
    loadModelStats(model)
      .then((nextStats) => {
        if (!cancelled) setStatsState({ modelId: model.id, status: 'ready', stats: nextStats });
      })
      .catch(() => {
        if (!cancelled) setStatsState({ modelId: model.id, status: 'error', stats: null });
      });
    return () => {
      cancelled = true;
    };
  }, [model]);

  return (
    <div
      onClick={onSelect}
      onContextMenu={onContextMenu}
      style={{
        backgroundColor: selected ? 'rgba(37, 99, 235, 0.28)' : '#374151',
        border: `1px solid ${selected ? '#60a5fa' : 'rgba(75, 85, 99, 0.75)'}`,
        borderRadius: 8,
        padding: 10,
        marginBottom: 10,
        cursor: 'pointer',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div
          style={{
            minWidth: 0,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            fontSize: 13,
            fontWeight: 700,
            color: 'white',
          }}
          title={model.name}
        >
          {model.name}
        </div>
        <button
          type="button"
          onClick={() => onToggleVisibility(model.id, !model.visible)}
          style={{ background: 'none', border: 'none', color: 'white', fontSize: 18, cursor: 'pointer' }}
        >
          {model.visible ? '👁️' : '🚫'}
        </button>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
        <span style={{ width: 48, fontSize: 12, color: '#9ca3af' }}>Цвет</span>
        <input
          type="color"
          value={model.color}
          onChange={(e) => onChangeColor(model.id, e.target.value)}
          style={{ width: 48, height: 32, borderRadius: 4, border: '1px solid #4b5563', background: '#111' }}
        />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ width: 48, fontSize: 12, color: '#9ca3af' }}>Прозр.</span>
        <input
          type="range"
          min="0"
          max="1"
          step="0.1"
          value={model.opacity}
          onChange={(e) => onChangeOpacity(model.id, clampOpacity(parseFloat(e.target.value)))}
          style={{ flex: 1 }}
        />
        <span style={{ width: 32, fontSize: 12, color: '#d1d5db' }}>{Math.round(model.opacity * 100)}%</span>
      </div>
      <div
        style={{
          marginTop: 10,
          paddingTop: 10,
          borderTop: '1px solid #4b5563',
          display: 'grid',
          gap: 4,
          color: '#d1d5db',
          fontSize: 11,
        }}
      >
        {statsLoading && <span style={{ color: '#9ca3af' }}>Расчет параметров...</span>}
        {statsError && <span style={{ color: '#fca5a5' }}>Параметры недоступны</span>}
        {stats && (
          <>
            <span>
              Размеры: {formatNumber(stats.size[0])} × {formatNumber(stats.size[1])} × {formatNumber(stats.size[2])} мм
            </span>
            <span>Площадь: {formatNumber(stats.area)} мм²</span>
            <span>Объем: {formatNumber(stats.volume)} мм³</span>
          </>
        )}
      </div>
    </div>
  );
};
