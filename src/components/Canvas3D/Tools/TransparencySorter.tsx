import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

export const TransparencySorter = ({
  transparentGroupRefs,
  cameraRef,
}: {
  transparentGroupRefs: React.MutableRefObject<(THREE.Group | null)[]>;
  cameraRef: React.MutableRefObject<THREE.OrthographicCamera | null>;
}) => {
  useFrame(() => {
    if (!cameraRef.current) return;
    const camPos = cameraRef.current.position;
    const groups = transparentGroupRefs.current.filter((g): g is THREE.Group => g !== null);
    if (groups.length === 0) return;
    groups.sort((a, b) => camPos.distanceTo(b.position) - camPos.distanceTo(a.position));
    groups.forEach((g, i) => {
      g.renderOrder = 100 + i;
    });
  });
  return null;
};