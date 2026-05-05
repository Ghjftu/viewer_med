import React, { useRef, useCallback, useEffect, useMemo } from 'react';
import { Canvas, events as fiberEvents } from '@react-three/fiber';
import { OrthographicCamera, ArcballControls } from '@react-three/drei';
import * as THREE from 'three';
import { useViewerStore } from '../../store/useViewerStore';
import { ModelGroup } from './Models/ModelGroup';
import { Lights } from './Environment/Lights';
import { Gizmo } from './Environment/Gizmo';
import { CameraTracker } from './Tools/CameraTracker';
import { TransparencySorter } from './Tools/TransparencySorter';
import { CameraParamsUpdater } from './Tools/CameraParamsUpdater';
import type { CameraParams, SceneSettings } from '../../types';

interface MainSceneProps {
  cameraRef: React.MutableRefObject<THREE.OrthographicCamera | null>;
  onCameraParamsUpdate: (params: CameraParams) => void;
  controlsRef: React.MutableRefObject<React.ElementRef<typeof ArcballControls> | null>;
  sceneSettings: SceneSettings;
  gizmoRightInset?: number;
  gizmoBottomInset?: number;
  autoCenterModels?: boolean;
  controlsLocked?: boolean;
  clippingOrigin?: [number, number, number];
}

type MirrorableArcballControls = {
  getCursorNDC?: (cursorX: number, cursorY: number, canvas: HTMLElement) => THREE.Vector2;
  __baseGetCursorNDC?: (cursorX: number, cursorY: number, canvas: HTMLElement) => THREE.Vector2;
};

type GuardedArcballControls = MirrorableArcballControls & {
  _button?: number;
  _onPointerUp?: (event: PointerEvent) => void;
};

type CanvasEventsFactory = NonNullable<React.ComponentProps<typeof Canvas>['events']>;

const MirrorControlsAdapter: React.FC<
  Pick<SceneSettings, 'mirrorX' | 'mirrorY'> & {
    controlsRef: React.MutableRefObject<React.ElementRef<typeof ArcballControls> | null>;
  }
> = ({ controlsRef, mirrorX, mirrorY }) => {
  useEffect(() => {
    const controls = controlsRef.current as unknown as MirrorableArcballControls | null;
    if (!controls?.getCursorNDC) return;
    if (!controls.__baseGetCursorNDC) controls.__baseGetCursorNDC = controls.getCursorNDC.bind(controls);
    const baseGetCursorNDC = controls.__baseGetCursorNDC;

    controls.getCursorNDC = (cursorX, cursorY, canvas) => {
      const rect = canvas.getBoundingClientRect();
      const nextX = mirrorX ? rect.left + rect.right - cursorX : cursorX;
      const nextY = mirrorY ? rect.top + rect.bottom - cursorY : cursorY;
      return baseGetCursorNDC(nextX, nextY, canvas);
    };

    return () => {
      controls.getCursorNDC = baseGetCursorNDC;
    };
  }, [controlsRef, mirrorX, mirrorY]);

  return null;
};

const ArcballPointerReleaseGuard: React.FC<{
  controlsRef: React.MutableRefObject<React.ElementRef<typeof ArcballControls> | null>;
}> = ({ controlsRef }) => {
  useEffect(() => {
    const releaseIfMouseButtonIsUp = (event: PointerEvent) => {
      const controls = controlsRef.current as unknown as GuardedArcballControls | null;
      if (!controls?._onPointerUp || controls._button === undefined || controls._button < 0) return;
      if (event.pointerType === 'touch' || event.buttons !== 0) return;
      controls._onPointerUp(event);
    };

    window.addEventListener('pointermove', releaseIfMouseButtonIsUp, true);
    return () => window.removeEventListener('pointermove', releaseIfMouseButtonIsUp, true);
  }, [controlsRef]);

  return null;
};

export const MainScene: React.FC<MainSceneProps> = ({
  cameraRef,
  onCameraParamsUpdate,
  controlsRef,
  sceneSettings,
  gizmoRightInset,
  gizmoBottomInset,
  autoCenterModels = false,
  controlsLocked = false,
  clippingOrigin,
}) => {
  const models = useViewerStore((state) => state.models);
  const transparentGroupRefs = useRef<(THREE.Group | null)[]>([]);
  const setTransparentGroupRef = useCallback((index: number, group: THREE.Group | null) => {
    transparentGroupRefs.current[index] = group;
  }, []);
  const canvasStyle = useMemo<React.CSSProperties>(
    () => ({
      position: 'absolute',
      top: 0,
      left: 0,
      width: '100%',
      height: '100%',
      touchAction: 'none',
      transform: `scale(${sceneSettings.mirrorX ? -1 : 1}, ${sceneSettings.mirrorY ? -1 : 1})`,
      transformOrigin: 'center center',
    }),
    [sceneSettings.mirrorX, sceneSettings.mirrorY]
  );
  const mirroredEvents = useMemo<CanvasEventsFactory>(
    () => (store) => {
      const defaultEvents = fiberEvents(store);
      return {
        ...defaultEvents,
        compute(event, state, previous) {
          if (!('clientX' in event) || !('clientY' in event)) {
            defaultEvents.compute?.(event, state, previous);
            return;
          }
          const rect = state.gl.domElement.getBoundingClientRect();
          const clientX = sceneSettings.mirrorX ? rect.left + rect.right - event.clientX : event.clientX;
          const clientY = sceneSettings.mirrorY ? rect.top + rect.bottom - event.clientY : event.clientY;
          state.pointer.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
          state.raycaster.setFromCamera(state.pointer, state.camera);
        },
      };
    },
    [sceneSettings.mirrorX, sceneSettings.mirrorY]
  );

  // Центрирование моделей при первом появлении
  const isCenteringRef = useRef(false);
  const hasCentered = useRef(false);
  const userInteracted = useRef(false);

  const centerModelsAtOrigin = useCallback(async () => {
    if (!autoCenterModels || models.length === 0 || isCenteringRef.current || hasCentered.current || userInteracted.current) return;
    isCenteringRef.current = true;
    const loader = new (await import('three/examples/jsm/loaders/STLLoader.js')).STLLoader();
    try {
      const results = await Promise.allSettled(
        models.map(async (model) => {
          if (userInteracted.current) throw new Error('Cancelled');
          const geom = await new Promise<THREE.BufferGeometry>((res, rej) =>
            loader.load(model.url, res, undefined, rej)
          );
          if (userInteracted.current) throw new Error('Cancelled');
          geom.computeBoundingBox();
          if (!geom.boundingBox) return null;
          const pos = new THREE.Vector3(...model.position);
          const rot = new THREE.Euler(
            THREE.MathUtils.degToRad(model.rotation[0]),
            THREE.MathUtils.degToRad(model.rotation[1]),
            THREE.MathUtils.degToRad(model.rotation[2]),
            'XYZ'
          );
          const mat = new THREE.Matrix4().compose(pos, new THREE.Quaternion().setFromEuler(rot), new THREE.Vector3(1, 1, 1));
          const center = geom.boundingBox.getCenter(new THREE.Vector3()).applyMatrix4(mat);
          return center;
        })
      );
      if (userInteracted.current) return;
      const centers = results
        .filter((r): r is PromiseFulfilledResult<THREE.Vector3> => r.status === 'fulfilled' && r.value !== null)
        .map((r) => r.value);
      if (centers.length === 0) return;
      const avg = centers.reduce((s, v) => s.add(v), new THREE.Vector3()).divideScalar(centers.length);
      const updatedModels = models.map((m) => ({
        ...m,
        position: [m.position[0] - avg.x, m.position[1] - avg.y, m.position[2] - avg.z] as [number, number, number],
      }));
      useViewerStore.getState().setModels(updatedModels);
      hasCentered.current = true;
      if (cameraRef.current && controlsRef.current) {
        cameraRef.current.position.set(0, 0, 150);
        cameraRef.current.zoom = 2;
        cameraRef.current.updateProjectionMatrix();
        controlsRef.current.target?.set(0, 0, 0);
        controlsRef.current.update?.();
      }
    } catch (e) {
      if (e instanceof Error && e.message !== 'Cancelled') console.error('Centering failed', e);
    } finally {
      isCenteringRef.current = false;
    }
  }, [autoCenterModels, models, cameraRef, controlsRef]);

  useEffect(() => {
    if (!autoCenterModels || models.length === 0) return;
    let attempts = 0;
    const tryCenter = () => {
      if (cameraRef.current && controlsRef.current) centerModelsAtOrigin().catch(() => {});
      else if (attempts++ < 30) setTimeout(tryCenter, 100);
      else console.warn('Failed to center models');
    };
    tryCenter();
    return () => {
      userInteracted.current = true;
    };
  }, [autoCenterModels, models, centerModelsAtOrigin, cameraRef, controlsRef]);

  useEffect(() => {
    userInteracted.current = false;
    hasCentered.current = false;
    transparentGroupRefs.current = [];
  }, [models]);

  useEffect(() => {
    if (!controlsRef.current) return;
    controlsRef.current.enabled = !controlsLocked;
  }, [controlsLocked, controlsRef]);

  return (
    <>
    <Canvas
      style={canvasStyle}
      events={mirroredEvents}
      gl={{ antialias: true, alpha: false, preserveDrawingBuffer: true, stencil: true }}
      onCreated={({ gl }) => {
        gl.localClippingEnabled = true;
        gl.setClearColor(sceneSettings.backgroundColor);
      }}
    >
      <OrthographicCamera makeDefault position={[0, 0, 150]} zoom={2} />
      <CameraTracker cameraRef={cameraRef} />
      <ArcballControls
        ref={controlsRef}
        makeDefault
        enabled={!controlsLocked}
        enablePan={!controlsLocked}
        enableRotate={!controlsLocked}
        enableZoom={!controlsLocked}
        cursorZoom={false}
        enableAnimations
        focusAnimationTime={0.1}
      />
      <color attach="background" args={[sceneSettings.backgroundColor]} />
      <MirrorControlsAdapter controlsRef={controlsRef} mirrorX={sceneSettings.mirrorX} mirrorY={sceneSettings.mirrorY} />
      <ArcballPointerReleaseGuard controlsRef={controlsRef} />
      <Lights intensity={sceneSettings.lightIntensity} />
      <ModelGroup
        sceneSettings={sceneSettings}
        clippingOrigin={clippingOrigin}
        onTransparentGroupRefChange={setTransparentGroupRef}
      />
      <TransparencySorter transparentGroupRefs={transparentGroupRefs} cameraRef={cameraRef} />
      <CameraParamsUpdater cameraRef={cameraRef} onUpdate={onCameraParamsUpdate} />
    </Canvas>
      <Gizmo cameraRef={cameraRef} controlsRef={controlsRef} rightInset={gizmoRightInset} bottomInset={gizmoBottomInset} />
    </>
  );
};
