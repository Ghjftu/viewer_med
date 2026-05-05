import React, { useMemo } from 'react';
import { useLoader } from '@react-three/fiber';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { PLYLoader } from 'three/examples/jsm/loaders/PLYLoader.js';
import * as THREE from 'three';
import type { ClippingDisplayMode, ModelState, SurfaceMode } from '../../../types';

const CLIPPING_CONTEXT_OPACITY = 0.16;
const SECTION_EPSILON = 1e-5;

interface StlModelProps {
  model: ModelState;
  surfaceMode: SurfaceMode;
  clippingPlanes: THREE.Plane[];
  clippingPlane: THREE.Plane | null;
  clippingActive: boolean;
  clippingDisplayMode: ClippingDisplayMode;
  onTransparentGroupRefChange: (index: number, group: THREE.Group | null) => void;
  index: number;
}

export const StlModel: React.FC<StlModelProps> = (props) => {
  const { model } = props;
  const extension = model.url.split('?')[0].split('.').pop()?.toLowerCase();
  if (extension === 'obj') {
    return <ObjModel {...props} />;
  }
  if (extension === 'ply') {
    return <PlyModel {...props} />;
  }
  return <StlGeometryModel {...props} />;
};

const getMaterial = (
  model: ModelState,
  surfaceMode: SurfaceMode,
  side: THREE.Side,
  clippingPlanes: THREE.Plane[],
  depthWrite = true,
  clippingActive = false,
  clippingDisplayMode: ClippingDisplayMode = 'negative'
) => {
  const baseOpacity = surfaceMode === 'xray' ? Math.min(model.opacity, 0.35) : model.opacity;
  const opacity =
    clippingActive && clippingDisplayMode === 'whole'
      ? Math.min(baseOpacity, CLIPPING_CONTEXT_OPACITY)
      : baseOpacity;
  const material = new THREE.MeshStandardMaterial({
    color: model.color,
    transparent: opacity < 0.99,
    opacity,
    side,
    wireframe: surfaceMode === 'wireframe',
    clippingPlanes,
    depthWrite: clippingActive && clippingDisplayMode === 'whole' ? false : depthWrite,
    depthTest: true,
  });
  return material;
};

const getEffectiveOpacity = (
  model: ModelState,
  surfaceMode: SurfaceMode,
  clippingActive: boolean,
  clippingDisplayMode: ClippingDisplayMode
) => {
  const baseOpacity = surfaceMode === 'xray' ? Math.min(model.opacity, 0.35) : model.opacity;
  return clippingActive && clippingDisplayMode === 'whole'
    ? Math.min(baseOpacity, CLIPPING_CONTEXT_OPACITY)
    : baseOpacity;
};

const getLocalPlane = (model: ModelState, clippingPlane: THREE.Plane) => {
  const rotation = new THREE.Euler(
    THREE.MathUtils.degToRad(model.rotation[0]),
    THREE.MathUtils.degToRad(model.rotation[1]),
    THREE.MathUtils.degToRad(model.rotation[2]),
    'XYZ'
  );
  const modelMatrix = new THREE.Matrix4().compose(
    new THREE.Vector3(...model.position),
    new THREE.Quaternion().setFromEuler(rotation),
    new THREE.Vector3(...model.scale)
  );
  return clippingPlane.clone().applyMatrix4(modelMatrix.clone().invert());
};

const addUniquePoint = (points: THREE.Vector3[], point: THREE.Vector3) => {
  if (!points.some((existing) => existing.distanceToSquared(point) < SECTION_EPSILON * SECTION_EPSILON)) {
    points.push(point);
  }
};

const getTrianglePlaneSegment = (
  a: THREE.Vector3,
  b: THREE.Vector3,
  c: THREE.Vector3,
  plane: THREE.Plane
) => {
  const vertices = [a, b, c];
  const distances = vertices.map((vertex) => plane.distanceToPoint(vertex));
  if (distances.every((distance) => distance > SECTION_EPSILON) || distances.every((distance) => distance < -SECTION_EPSILON)) {
    return null;
  }

  const points: THREE.Vector3[] = [];
  for (let i = 0; i < 3; i += 1) {
    const j = (i + 1) % 3;
    const start = vertices[i];
    const end = vertices[j];
    const startDistance = distances[i];
    const endDistance = distances[j];

    if (Math.abs(startDistance) <= SECTION_EPSILON) addUniquePoint(points, start.clone());
    if (startDistance * endDistance < -SECTION_EPSILON * SECTION_EPSILON) {
      const t = startDistance / (startDistance - endDistance);
      addUniquePoint(points, start.clone().lerp(end, t));
    }
  }

  if (points.length < 2) return null;
  if (points.length === 2) return [points[0], points[1]] as const;

  let bestPair: readonly [THREE.Vector3, THREE.Vector3] = [points[0], points[1]];
  let bestDistance = bestPair[0].distanceToSquared(bestPair[1]);
  for (let i = 0; i < points.length; i += 1) {
    for (let j = i + 1; j < points.length; j += 1) {
      const distance = points[i].distanceToSquared(points[j]);
      if (distance > bestDistance) {
        bestDistance = distance;
        bestPair = [points[i], points[j]];
      }
    }
  }
  return bestPair;
};

const createSectionRibbonGeometry = (sourceGeometry: THREE.BufferGeometry, localPlane: THREE.Plane) => {
  const position = sourceGeometry.getAttribute('position');
  if (!(position instanceof THREE.BufferAttribute)) return null;

  const bounds = sourceGeometry.boundingBox || new THREE.Box3().setFromBufferAttribute(position);
  const ribbonWidth = THREE.MathUtils.clamp(bounds.getSize(new THREE.Vector3()).length() * 0.004, 0.8, 3);
  const index = sourceGeometry.index;
  const vertices: number[] = [];
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();

  const readVertex = (vertexIndex: number, target: THREE.Vector3) => target.fromBufferAttribute(position, vertexIndex);
  const pushRibbon = (start: THREE.Vector3, end: THREE.Vector3) => {
    const direction = end.clone().sub(start);
    if (direction.lengthSq() < SECTION_EPSILON * SECTION_EPSILON) return;
    direction.normalize();
    const offset = new THREE.Vector3().crossVectors(localPlane.normal, direction);
    if (offset.lengthSq() < SECTION_EPSILON * SECTION_EPSILON) return;
    offset.normalize().multiplyScalar(ribbonWidth * 0.5);

    const p1 = start.clone().add(offset);
    const p2 = start.clone().sub(offset);
    const p3 = end.clone().add(offset);
    const p4 = end.clone().sub(offset);
    vertices.push(
      p1.x, p1.y, p1.z,
      p2.x, p2.y, p2.z,
      p3.x, p3.y, p3.z,
      p3.x, p3.y, p3.z,
      p2.x, p2.y, p2.z,
      p4.x, p4.y, p4.z
    );
  };

  const triangleCount = index ? index.count / 3 : position.count / 3;
  for (let triangleIndex = 0; triangleIndex < triangleCount; triangleIndex += 1) {
    const i0 = index ? index.getX(triangleIndex * 3) : triangleIndex * 3;
    const i1 = index ? index.getX(triangleIndex * 3 + 1) : triangleIndex * 3 + 1;
    const i2 = index ? index.getX(triangleIndex * 3 + 2) : triangleIndex * 3 + 2;
    const segment = getTrianglePlaneSegment(readVertex(i0, a), readVertex(i1, b), readVertex(i2, c), localPlane);
    if (segment) pushRibbon(segment[0], segment[1]);
  }

  if (vertices.length === 0) return null;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.computeVertexNormals();
  return geometry;
};

const SectionCutOverlay: React.FC<{
  geometries: THREE.BufferGeometry[];
  model: ModelState;
  clippingPlane: THREE.Plane | null;
  clippingActive: boolean;
}> = ({ geometries, model, clippingPlane, clippingActive }) => {
  const ribbonGeometries = useMemo(() => {
    if (!clippingActive || !clippingPlane) return [];
    return geometries
      .map((geometry) => {
        const localPlane = getLocalPlane(model, clippingPlane);
        return createSectionRibbonGeometry(geometry, localPlane);
      })
      .filter((geometry): geometry is THREE.BufferGeometry => geometry !== null);
  }, [clippingActive, clippingPlane, geometries, model]);

  const overlayMaterial = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
      color: model.color,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.98,
      depthWrite: false,
      depthTest: false,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -4,
    }),
    [model.color]
  );

  if (ribbonGeometries.length === 0) return null;

  return (
    <>
      {ribbonGeometries.map((geometry, geometryIndex) => (
        <mesh
          key={geometryIndex}
          geometry={geometry}
          material={overlayMaterial}
          renderOrder={20 + geometryIndex}
        />
      ))}
    </>
  );
};

const GeometryModel: React.FC<StlModelProps & { geometries: THREE.BufferGeometry[] }> = ({
  model,
  surfaceMode,
  clippingPlanes,
  clippingPlane,
  clippingActive,
  clippingDisplayMode,
  onTransparentGroupRefChange,
  index,
  geometries,
}) => {
  const opacity = getEffectiveOpacity(model, surfaceMode, clippingActive, clippingDisplayMode);
  const isTransparent = opacity < 0.99;

  const rotationInRadians: [number, number, number] = [
    THREE.MathUtils.degToRad(model.rotation[0]),
    THREE.MathUtils.degToRad(model.rotation[1]),
    THREE.MathUtils.degToRad(model.rotation[2]),
  ];

  return (
    <group
      position={model.position}
      rotation={rotationInRadians}
      scale={model.scale}
      visible={model.visible}
      userData={{ transparent: isTransparent }}
      ref={(el) => {
        onTransparentGroupRefChange(index, isTransparent ? el : null);
      }}
    >
      <SectionCutOverlay
        geometries={geometries}
        model={model}
        clippingPlane={clippingPlane}
        clippingActive={clippingActive}
      />
      {geometries.map((geometry, i) =>
        isTransparent ? (
          <React.Fragment key={i}>
            <mesh geometry={geometry} renderOrder={1}>
              <primitive
                object={getMaterial(model, surfaceMode, THREE.BackSide, clippingPlanes, true, clippingActive, clippingDisplayMode)}
                attach="material"
              />
            </mesh>
            <mesh geometry={geometry} renderOrder={2}>
              <primitive
                object={getMaterial(model, surfaceMode, THREE.FrontSide, clippingPlanes, false, clippingActive, clippingDisplayMode)}
                attach="material"
              />
            </mesh>
          </React.Fragment>
        ) : (
          <mesh key={i} geometry={geometry} renderOrder={isTransparent ? 2 : undefined}>
            <primitive
              object={getMaterial(model, surfaceMode, THREE.DoubleSide, clippingPlanes, !isTransparent, clippingActive, clippingDisplayMode)}
              attach="material"
            />
          </mesh>
        )
      )}
    </group>
  );
};

const StlGeometryModel: React.FC<StlModelProps> = (props) => {
  const loaded = useLoader(STLLoader, props.model.url);
  const geometries = Array.isArray(loaded) ? loaded : [loaded];
  return <GeometryModel {...props} geometries={geometries} />;
};

const PlyModel: React.FC<StlModelProps> = (props) => {
  const geometry = useLoader(PLYLoader, props.model.url);
  geometry.computeVertexNormals();
  return <GeometryModel {...props} geometries={[geometry]} />;
};

const ObjModel: React.FC<StlModelProps> = ({
  model,
  surfaceMode,
  clippingPlanes,
  clippingActive,
  clippingDisplayMode,
  onTransparentGroupRefChange,
  index,
}) => {
  const object = useLoader(OBJLoader, model.url);
  const renderedObject = useMemo(() => {
    const clone = object.clone();
    clone.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.material = getMaterial(
          model,
          surfaceMode,
          THREE.DoubleSide,
          clippingPlanes,
          model.opacity >= 0.99,
          clippingActive,
          clippingDisplayMode
        );
      }
    });
    return clone;
  }, [clippingActive, clippingDisplayMode, clippingPlanes, model, object, surfaceMode]);

  const isTransparent = getEffectiveOpacity(model, surfaceMode, clippingActive, clippingDisplayMode) < 0.99;
  const rotationInRadians: [number, number, number] = [
    THREE.MathUtils.degToRad(model.rotation[0]),
    THREE.MathUtils.degToRad(model.rotation[1]),
    THREE.MathUtils.degToRad(model.rotation[2]),
  ];

  return (
    <group
      position={model.position}
      rotation={rotationInRadians}
      scale={model.scale}
      visible={model.visible}
      userData={{ transparent: isTransparent }}
      ref={(el) => {
        onTransparentGroupRefChange(index, isTransparent ? el : null);
      }}
    >
      <primitive object={renderedObject} />
    </group>
  );
};
