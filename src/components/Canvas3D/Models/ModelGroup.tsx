import React, { Suspense } from 'react';
import { useViewerStore } from '../../../store/useViewerStore';
import { StlModel } from './StlModel';
import * as THREE from 'three';
import type { SceneSettings } from '../../../types';
interface ModelGroupProps {
  sceneSettings: SceneSettings;
  onTransparentGroupRefChange: (index: number, group: THREE.Group | null) => void;
  clippingOrigin?: [number, number, number];
}

export const ModelGroup: React.FC<ModelGroupProps> = ({
  sceneSettings,
  onTransparentGroupRefChange,
  clippingOrigin = [0, 0, 0],
}) => {
  const models = useViewerStore((state) => state.models);
  const clippingNormal = (() => {
    if (sceneSettings.clippingMode === 'free') {
      const normal = new THREE.Vector3(...sceneSettings.clippingNormal);
      return normal.lengthSq() > 0 ? normal.normalize() : new THREE.Vector3(0, 0, 1);
    }
    return sceneSettings.clippingAxis === 'x'
      ? new THREE.Vector3(1, 0, 0)
      : sceneSettings.clippingAxis === 'y'
        ? new THREE.Vector3(0, 1, 0)
        : new THREE.Vector3(0, 0, 1);
  })();
  const origin = new THREE.Vector3(...clippingOrigin);
  const clippingPlanePosition = clippingNormal.dot(origin) + sceneSettings.clippingOffset;
  const clippingPlane = sceneSettings.clippingEnabled
    ? new THREE.Plane(clippingNormal, -clippingPlanePosition)
    : null;
  const clippingPlanes =
    clippingPlane && sceneSettings.clippingDisplayMode !== 'whole'
      ? [sceneSettings.clippingDisplayMode === 'positive' ? clippingPlane : clippingPlane.clone().negate()]
      : [];

  return (
    <Suspense fallback={null}>
      <group>
        {models.map((model, idx) => (
          <StlModel
            key={model.id}
            model={model}
            surfaceMode={sceneSettings.surfaceMode}
            clippingPlanes={clippingPlanes}
            clippingPlane={clippingPlane}
            clippingActive={sceneSettings.clippingEnabled}
            clippingDisplayMode={sceneSettings.clippingDisplayMode}
            index={idx}
            onTransparentGroupRefChange={onTransparentGroupRefChange}
          />
        ))}
      </group>
    </Suspense>
  );
};
