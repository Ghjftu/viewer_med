import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrthographicCamera } from '@react-three/drei';
import type { ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';

interface GizmoProps {
  cameraRef: React.MutableRefObject<THREE.OrthographicCamera | null>;
  controlsRef: React.MutableRefObject<unknown | null>;
  rightInset?: number;
  bottomInset?: number;
}

type ViewerControls = {
  target?: THREE.Vector3;
  update?: (delta?: number) => void;
  _gizmos?: THREE.Group;
  _button?: number;
  _onPointerUp?: (event: PointerEvent) => void;
};

interface StableGizmoContextValue {
  tweenCamera: (direction: THREE.Vector3) => void;
  stopControlsDrag: (event: PointerEvent) => void;
}

const StableGizmoContext = React.createContext<StableGizmoContextValue | null>(null);
const GIZMO_SIZE = 150;
const turnRate = 2 * Math.PI;

const getControlsFocus = (controls?: ViewerControls | null) =>
  controls?._gizmos?.position?.clone() || controls?.target?.clone?.() || new THREE.Vector3();

const Axis: React.FC<{
  scale?: [number, number, number];
  color: string;
  rotation: [number, number, number];
}> = ({ scale = [0.8, 0.05, 0.05], color, rotation }) => (
  <group rotation={rotation}>
    <mesh position={[0.4, 0, 0]}>
      <boxGeometry args={scale} />
      <meshBasicMaterial color={color} toneMapped={false} />
    </mesh>
  </group>
);

const AxisHead: React.FC<{
  label?: string;
  position: [number, number, number];
  arcStyle: string;
  labelColor: string;
  font: string;
  axisHeadScale: number;
}> = ({ label, position, arcStyle, labelColor, font, axisHeadScale }) => {
  const gl = useThree((state) => state.gl);
  const context = React.useContext(StableGizmoContext);
  const [active, setActive] = useState(false);
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.beginPath();
      ctx.arc(32, 32, 16, 0, 2 * Math.PI);
      ctx.closePath();
      ctx.fillStyle = arcStyle;
      ctx.fill();
      if (label) {
        ctx.font = font;
        ctx.textAlign = 'center';
        ctx.fillStyle = labelColor;
        ctx.fillText(label, 32, 41);
      }
    }
    return new THREE.CanvasTexture(canvas);
  }, [arcStyle, font, label, labelColor]);

  useEffect(() => () => texture.dispose(), [texture]);

  const scale = (label ? 1 : 0.75) * (active ? 1.2 : 1) * axisHeadScale;
  const handlePointerDown = (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation();
    event.nativeEvent.stopImmediatePropagation?.();
    context?.stopControlsDrag(event.nativeEvent);
    context?.tweenCamera(new THREE.Vector3(...position).normalize());
  };

  const handlePointerOver = (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation();
    setActive(true);
  };

  const handlePointerOut = (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation();
    setActive(false);
  };

  return (
    <sprite
      position={position}
      scale={[scale, scale, scale]}
      onPointerDown={handlePointerDown}
      onPointerOver={handlePointerOver}
      onPointerOut={handlePointerOut}
    >
      <spriteMaterial
        map={texture}
        map-anisotropy={gl.capabilities.getMaxAnisotropy() || 1}
        alphaTest={0.3}
        opacity={label ? 1 : 0.75}
        toneMapped={false}
      />
    </sprite>
  );
};

const StableGizmoViewport: React.FC<{
  axisColors?: [string, string, string];
  labels?: [string, string, string];
  labelColor?: string;
  font?: string;
  axisHeadScale?: number;
}> = ({
  axisColors = ['#ff2060', '#20df80', '#2080ff'],
  labels = ['X', 'Y', 'Z'],
  labelColor = 'white',
  font = '18px Inter var, Arial, sans-serif',
  axisHeadScale = 1,
}) => {
  const [colorX, colorY, colorZ] = axisColors;
  return (
    <group scale={40}>
      <Axis color={colorX} rotation={[0, 0, 0]} />
      <Axis color={colorY} rotation={[0, 0, Math.PI / 2]} />
      <Axis color={colorZ} rotation={[0, -Math.PI / 2, 0]} />
      <AxisHead arcStyle={colorX} position={[1, 0, 0]} label={labels[0]} font={font} labelColor={labelColor} axisHeadScale={axisHeadScale} />
      <AxisHead arcStyle={colorY} position={[0, 1, 0]} label={labels[1]} font={font} labelColor={labelColor} axisHeadScale={axisHeadScale} />
      <AxisHead arcStyle={colorZ} position={[0, 0, 1]} label={labels[2]} font={font} labelColor={labelColor} axisHeadScale={axisHeadScale} />
      <AxisHead arcStyle={colorX} position={[-1, 0, 0]} font={font} labelColor={labelColor} axisHeadScale={axisHeadScale} />
      <AxisHead arcStyle={colorY} position={[0, -1, 0]} font={font} labelColor={labelColor} axisHeadScale={axisHeadScale} />
      <AxisHead arcStyle={colorZ} position={[0, 0, -1]} font={font} labelColor={labelColor} axisHeadScale={axisHeadScale} />
    </group>
  );
};

const GizmoScene: React.FC<{
  cameraRef: React.MutableRefObject<THREE.OrthographicCamera | null>;
  controlsRef: React.MutableRefObject<unknown | null>;
}> = ({ cameraRef, controlsRef }) => {
  const invalidate = useThree((state) => state.invalidate);
  const gizmoRef = useRef<THREE.Group>(null);
  const animatingRef = useRef(false);
  const radiusRef = useRef(0);
  const focusPointRef = useRef(new THREE.Vector3());
  const defaultUpRef = useRef(new THREE.Vector3(0, 1, 0));
  const q1Ref = useRef(new THREE.Quaternion());
  const q2Ref = useRef(new THREE.Quaternion());
  const dummyRef = useRef(new THREE.Object3D());
  const matrixRef = useRef(new THREE.Matrix4());

  const stopControlsDrag = useCallback(
    (event: PointerEvent) => {
      const controls = controlsRef.current as ViewerControls | null;
      if (controls?._button !== undefined && controls._button >= 0) controls._onPointerUp?.(event);
    },
    [controlsRef]
  );

  const tweenCamera = useCallback(
    (direction: THREE.Vector3) => {
      const mainCamera = cameraRef.current;
      if (!mainCamera) return;
      const controls = controlsRef.current as ViewerControls | null;
      const focus = getControlsFocus(controls);
      defaultUpRef.current.copy(mainCamera.up);
      focusPointRef.current.copy(focus);
      radiusRef.current = Math.max(mainCamera.position.distanceTo(focus), 1);
      q1Ref.current.copy(mainCamera.quaternion);

      const targetPosition = direction.clone().normalize().multiplyScalar(radiusRef.current);
      dummyRef.current.position.set(0, 0, 0);
      dummyRef.current.up.copy(defaultUpRef.current);
      dummyRef.current.lookAt(targetPosition);
      q2Ref.current.copy(dummyRef.current.quaternion);
      animatingRef.current = true;
      invalidate();
    },
    [cameraRef, controlsRef, invalidate]
  );

  useFrame((_, delta) => {
    const mainCamera = cameraRef.current;
    if (!mainCamera || !gizmoRef.current) return;

    if (animatingRef.current) {
      if (q1Ref.current.angleTo(q2Ref.current) < 0.01) {
        animatingRef.current = false;
      } else {
        q1Ref.current.rotateTowards(q2Ref.current, delta * turnRate);
        mainCamera.position
          .set(0, 0, 1)
          .applyQuaternion(q1Ref.current)
          .multiplyScalar(radiusRef.current)
          .add(focusPointRef.current);
        mainCamera.up.set(0, 1, 0).applyQuaternion(q1Ref.current).normalize();
        mainCamera.quaternion.copy(q1Ref.current);
        const controls = controlsRef.current as ViewerControls | null;
        controls?.target?.copy(focusPointRef.current);
        controls?.update?.(delta);
        mainCamera.updateMatrixWorld(true);
        invalidate();
      }
    }

    matrixRef.current.copy(mainCamera.matrix).invert();
    gizmoRef.current.quaternion.setFromRotationMatrix(matrixRef.current);
  });

  const contextValue = useMemo<StableGizmoContextValue>(
    () => ({ tweenCamera, stopControlsDrag }),
    [stopControlsDrag, tweenCamera]
  );

  return (
    <StableGizmoContext.Provider value={contextValue}>
      <OrthographicCamera makeDefault position={[0, 0, 200]} left={-GIZMO_SIZE / 2} right={GIZMO_SIZE / 2} top={GIZMO_SIZE / 2} bottom={-GIZMO_SIZE / 2} near={0.1} far={1000} />
      <group ref={gizmoRef}>
        <StableGizmoViewport axisColors={['#ff2060', '#20df80', '#2080ff']} labelColor="white" />
      </group>
    </StableGizmoContext.Provider>
  );
};

export const Gizmo: React.FC<GizmoProps> = ({
  cameraRef,
  controlsRef,
  rightInset = 72,
  bottomInset = 42,
}) => {
  const right = Math.max(0, rightInset - GIZMO_SIZE / 2);
  const bottom = Math.max(0, bottomInset - GIZMO_SIZE / 2);

  return (
    <Canvas
      style={{
        position: 'absolute',
        width: GIZMO_SIZE,
        height: GIZMO_SIZE,
        right,
        bottom,
        zIndex: 12,
        pointerEvents: 'auto',
        touchAction: 'none',
        background: 'transparent',
      }}
      gl={{ alpha: true, antialias: true }}
      onCreated={({ gl }) => gl.setClearColor(0x000000, 0)}
    >
      <GizmoScene cameraRef={cameraRef} controlsRef={controlsRef} />
    </Canvas>
  );
};
