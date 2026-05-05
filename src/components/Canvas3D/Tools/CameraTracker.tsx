import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';

export const CameraTracker = ({
  cameraRef,
}: {
  cameraRef: React.MutableRefObject<THREE.OrthographicCamera | null>;
}) => {
  const { camera } = useThree();
  useEffect(() => {
    cameraRef.current = camera as THREE.OrthographicCamera;
  }, [camera, cameraRef]);
  return null;
};