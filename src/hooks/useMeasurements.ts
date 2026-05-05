import { useCallback } from 'react';
import * as THREE from 'three';
import type { Point } from '../types/tools';

interface ProjectionOptions {
  mirrorX?: boolean;
  mirrorY?: boolean;
}

const pointToNdc = (point: Point, rect: DOMRect, options: ProjectionOptions = {}) => {
  const x = options.mirrorX ? rect.width - point.x : point.x;
  const y = options.mirrorY ? rect.height - point.y : point.y;
  return {
    x: (x / rect.width) * 2 - 1,
    y: -(y / rect.height) * 2 + 1,
  };
};

export const useMeasurements = (
  cameraRef: React.MutableRefObject<THREE.OrthographicCamera | null>,
  viewportRef: React.RefObject<HTMLDivElement | null>,
  options: ProjectionOptions = {}
) => {
  const unprojectPoint = useCallback(
    (point: Point): THREE.Vector3 => {
      if (!cameraRef.current || !viewportRef.current) return new THREE.Vector3();
      const rect = viewportRef.current.getBoundingClientRect();
      const ndc = pointToNdc(point, rect, options);
      return new THREE.Vector3(ndc.x, ndc.y, 0.5).unproject(cameraRef.current);
    },
    [cameraRef, viewportRef, options]
  );

  const calculateDistance = useCallback(
    (a: Point, b: Point) => unprojectPoint(a).distanceTo(unprojectPoint(b)),
    [unprojectPoint]
  );

  const calculatePolylineDistance = useCallback(
    (points: Point[]): number => {
      if (points.length < 2) return 0;
      return points.slice(1).reduce((total, point, index) => total + calculateDistance(points[index], point), 0);
    },
    [calculateDistance]
  );

  const calculateAngle = useCallback(
    (a: Point, b: Point, c: Point) => {
      const va = unprojectPoint(a).sub(unprojectPoint(b));
      const vb = unprojectPoint(c).sub(unprojectPoint(b));
      return THREE.MathUtils.radToDeg(va.angleTo(vb));
    },
    [unprojectPoint]
  );

  const calculateCircleDiameter = useCallback(
    (a: Point, b: Point, c: Point): number => {
      const va = unprojectPoint(a),
        vb = unprojectPoint(b),
        vc = unprojectPoint(c);
      const sa = vb.distanceTo(vc),
        sb = va.distanceTo(vc),
        sc = va.distanceTo(vb);
      const p = (sa + sb + sc) / 2;
      const area = Math.sqrt(p * (p - sa) * (p - sb) * (p - sc));
      if (area < 1e-6) return 0;
      return (sa * sb * sc) / (2 * area);
    },
    [unprojectPoint]
  );

  return { unprojectPoint, calculateDistance, calculatePolylineDistance, calculateAngle, calculateCircleDiameter };
};
