import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { CameraParams } from '../../../types';

export const CameraParamsUpdater = ({
  cameraRef,
  onUpdate,
}: {
  cameraRef: React.MutableRefObject<THREE.OrthographicCamera | null>;
  onUpdate: (params: CameraParams) => void;
}) => {
  const lastRef = useRef('');
  useFrame(() => {
    if (!cameraRef.current) return;
    const cam = cameraRef.current;
    const w = Math.abs(cam.right - cam.left) / cam.zoom;
    const h = Math.abs(cam.top - cam.bottom) / cam.zoom;
    const key = `${w.toFixed(4)},${h.toFixed(4)},${cam.zoom.toFixed(4)}`;
    if (key === lastRef.current) return;
    lastRef.current = key;
    onUpdate({ worldWidth: w, worldHeight: h, zoom: cam.zoom });
  });
  return null;
};