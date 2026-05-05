import React, { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import * as THREE from 'three';
import { useMeasurements } from '../../hooks/useMeasurements';
import { useViewerStore } from '../../store/useViewerStore';
import { decodeState, encodeState } from '../../utils/base64';
import { postJsonArtifact, postScreenshotArtifact } from '../../utils/misIntegration';
import { MainScene } from '../Canvas3D/MainScene';
import { Rulers } from '../Canvas3D/Tools/Rulers';
import { RulerOverlay } from '../Canvas3D/Tools/RulerOverlay';
import { ModelList } from './Sidebar/ModelList';
import { MainToolbar } from './Toolbar/MainToolbar';
import { ArcballControls } from '@react-three/drei';
import type { ToolType, Point, Drawing, TextNote, WorldPoint } from '../../types/tools';
import type { CameraParams, MisIntegrationInfo, ModelState, SceneSettings, SceneState, SurfaceMode } from '../../types';

// ... остальной код ...
interface LayoutProps {
  patientInfo?: { name: string; study: string };
  integrationInfo?: MisIntegrationInfo;
}

type ProjectionMirror = Pick<SceneSettings, 'mirrorX' | 'mirrorY'>;
type ViewerControls = React.ElementRef<typeof ArcballControls>;
type CenterableViewerControls = {
  enabled: boolean;
  target?: THREE.Vector3;
  update?: () => void;
  saveState?: () => void;
  setStateFromJSON?: (json: string) => void;
  _gizmos?: THREE.Group;
};
type BoundsSnapshot = {
  min: [number, number, number];
  max: [number, number, number];
  center: [number, number, number];
  size: [number, number, number];
};

const DEFAULT_SCENE_SETTINGS: SceneSettings = {
  backgroundColor: '#111111',
  lightIntensity: 1,
  surfaceMode: 'solid',
  mirrorX: false,
  mirrorY: false,
  orientationSystem: 'RAS',
  clippingEnabled: false,
  clippingMode: 'axis',
  clippingAxis: 'z',
  clippingNormal: [0, 0, 1],
  clippingOffset: 0,
  clippingDisplayMode: 'negative',
};

const TOP_FRAME_HEIGHT = 44;
const LEFT_FRAME_WIDTH = 52;
const BOTTOM_FRAME_HEIGHT = 56;
const SCENE_TREE_WIDTH = 312;
const RULER_THICKNESS = 30;

const panelGlassStyle: React.CSSProperties = {
  backgroundColor: '#111827',
  border: '1px solid rgba(75, 85, 99, 0.65)',
  boxShadow: '0 6px 18px rgba(0,0,0,0.28)',
};

const topToolbarStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 6,
  height: TOP_FRAME_HEIGHT,
  padding: '4px 8px',
  borderRadius: 0,
  ...panelGlassStyle,
};

const toolbarClusterStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
};

const sceneToolButtonStyle = (active = false, compact = false): React.CSSProperties => ({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  width: compact ? 38 : 46,
  height: compact ? 38 : 46,
  borderRadius: 6,
  border: `1px solid ${active ? '#60a5fa' : 'rgba(75, 85, 99, 0.8)'}`,
  backgroundColor: active ? '#2563eb' : '#374151',
  color: 'white',
  fontSize: compact ? 15 : 18,
  cursor: 'pointer',
  transition: 'transform 0.1s, background-color 0.2s',
  boxShadow: active ? '0 0 15px rgba(37, 99, 235, 0.5)' : 'none',
});

const textButtonStyle: React.CSSProperties = {
  minHeight: 30,
  padding: '0 9px',
  borderRadius: 6,
  border: '1px solid rgba(75, 85, 99, 0.8)',
  background: '#1f2937',
  color: '#e5e7eb',
  fontWeight: 700,
  fontSize: 12,
  cursor: 'pointer',
};

const sectionLabelStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 800,
  color: '#93c5fd',
  letterSpacing: 0,
  textTransform: 'uppercase',
};

const clippingDisplayModeLabels: Record<SceneSettings['clippingDisplayMode'], string> = {
  whole: 'Вся',
  negative: '- сторона',
  positive: '+ сторона',
};

const getModelMatrix = (model: ModelState) => {
  const rotation = new THREE.Euler(
    THREE.MathUtils.degToRad(model.rotation[0]),
    THREE.MathUtils.degToRad(model.rotation[1]),
    THREE.MathUtils.degToRad(model.rotation[2]),
    'XYZ'
  );
  return new THREE.Matrix4().compose(
    new THREE.Vector3(...model.position),
    new THREE.Quaternion().setFromEuler(rotation),
    new THREE.Vector3(...model.scale)
  );
};

const getGeometryWorldBounds = (geometry: THREE.BufferGeometry, model: ModelState) => {
  geometry.computeBoundingBox();
  if (!geometry.boundingBox) return null;
  return geometry.boundingBox.clone().applyMatrix4(getModelMatrix(model));
};

const getBoundsSnapshot = (bounds: THREE.Box3): BoundsSnapshot => {
  const center = bounds.getCenter(new THREE.Vector3());
  const size = bounds.getSize(new THREE.Vector3());
  return {
    min: [bounds.min.x, bounds.min.y, bounds.min.z],
    max: [bounds.max.x, bounds.max.y, bounds.max.z],
    center: [center.x, center.y, center.z],
    size: [size.x, size.y, size.z],
  };
};

const getClippingNormal = (settings: Pick<SceneSettings, 'clippingMode' | 'clippingAxis' | 'clippingNormal'>) => {
  if (settings.clippingMode === 'free') {
    const normal = new THREE.Vector3(...settings.clippingNormal);
    return normal.lengthSq() > 0 ? normal.normalize() : new THREE.Vector3(0, 0, 1);
  }
  if (settings.clippingAxis === 'x') return new THREE.Vector3(1, 0, 0);
  if (settings.clippingAxis === 'y') return new THREE.Vector3(0, 1, 0);
  return new THREE.Vector3(0, 0, 1);
};

const getBoundsProjectionRange = (bounds: BoundsSnapshot, normal: THREE.Vector3) => {
  const min = new THREE.Vector3(...bounds.min);
  const max = new THREE.Vector3(...bounds.max);
  const corners = [
    new THREE.Vector3(min.x, min.y, min.z),
    new THREE.Vector3(min.x, min.y, max.z),
    new THREE.Vector3(min.x, max.y, min.z),
    new THREE.Vector3(min.x, max.y, max.z),
    new THREE.Vector3(max.x, min.y, min.z),
    new THREE.Vector3(max.x, min.y, max.z),
    new THREE.Vector3(max.x, max.y, min.z),
    new THREE.Vector3(max.x, max.y, max.z),
  ];
  return corners.reduce(
    (range, corner) => {
      const projection = normal.dot(corner);
      return {
        min: Math.min(range.min, projection),
        max: Math.max(range.max, projection),
      };
    },
    { min: Infinity, max: -Infinity }
  );
};

const loadModelWorldBounds = async (model: ModelState) => {
  const extension = model.url.split('?')[0].split('.').pop()?.toLowerCase();
  if (extension === 'obj') {
    const { OBJLoader } = await import('three/examples/jsm/loaders/OBJLoader.js');
    const object = await new OBJLoader().loadAsync(model.url);
    object.applyMatrix4(getModelMatrix(model));
    object.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(object);
    return bounds.isEmpty() ? null : bounds;
  }

  const loader =
    extension === 'ply'
      ? new (await import('three/examples/jsm/loaders/PLYLoader.js')).PLYLoader()
      : new (await import('three/examples/jsm/loaders/STLLoader.js')).STLLoader();
  const geometry = await loader.loadAsync(model.url);
  const bounds = getGeometryWorldBounds(geometry, model);
  geometry.dispose();
  return bounds;
};

const syncArcballState = (
  controls: CenterableViewerControls,
  camera: THREE.OrthographicCamera,
  target: THREE.Vector3,
  saveState = true
) => {
  const gizmoMatrix = new THREE.Matrix4().makeTranslation(target.x, target.y, target.z);
  camera.updateMatrix();
  camera.updateMatrixWorld(true);
  camera.updateProjectionMatrix();
  controls.setStateFromJSON?.(
    JSON.stringify({
      arcballState: {
        cameraFar: camera.far,
        cameraMatrix: { elements: Array.from(camera.matrix.elements) },
        cameraNear: camera.near,
        cameraUp: { x: camera.up.x, y: camera.up.y, z: camera.up.z },
        cameraZoom: camera.zoom,
        gizmoMatrix: { elements: Array.from(gizmoMatrix.elements) },
        target: target.toArray(),
      },
    })
  );
  controls.target?.copy(target);
  if (saveState) controls.saveState?.();
  controls.update?.();
};

const getArcballFocus = (controls: ViewerControls | null) => {
  const runtimeControls = controls as unknown as CenterableViewerControls | null;
  return runtimeControls?._gizmos?.position?.clone() || runtimeControls?.target?.clone?.() || null;
};

const getArcballState = (camera: THREE.OrthographicCamera | null, controls: ViewerControls | null): SceneState['arcballState'] => {
  const runtimeControls = controls as unknown as CenterableViewerControls | null;
  const focus = runtimeControls?._gizmos?.position || runtimeControls?.target;
  if (!camera || !focus) return undefined;
  camera.updateMatrix();
  camera.updateMatrixWorld(true);
  const gizmoMatrix = runtimeControls?._gizmos?.matrix.clone() || new THREE.Matrix4().makeTranslation(focus.x, focus.y, focus.z);
  return {
    cameraFar: camera.far,
    cameraMatrix: { elements: Array.from(camera.matrix.elements) },
    cameraNear: camera.near,
    cameraUp: { x: camera.up.x, y: camera.up.y, z: camera.up.z },
    cameraZoom: camera.zoom,
    gizmoMatrix: { elements: Array.from(gizmoMatrix.elements) },
    target: focus.toArray(),
  };
};

const getBrowserViewportSize = () => ({
  width: Math.max(1, window.innerWidth || document.documentElement.clientWidth || 1),
  height: Math.max(1, window.innerHeight || document.documentElement.clientHeight || 1),
});

const scalePoint = (point: Point, scaleX: number, scaleY: number): Point => ({
  x: point.x * scaleX,
  y: point.y * scaleY,
});

const scaleDrawing = (drawing: Drawing, scaleX: number, scaleY: number): Drawing => {
  if (drawing.type === 'text') {
    return {
      ...drawing,
      target: scalePoint(drawing.target, scaleX, scaleY),
      labelPos: scalePoint(drawing.labelPos, scaleX, scaleY),
    };
  }
  return {
    ...drawing,
    points: drawing.points.map((point) => scalePoint(point, scaleX, scaleY)),
  };
};

const scaleInitialDrawings = (state: SceneState | null) => {
  const drawings = state?.drawings || [];
  if (
    drawings.some((drawing) =>
      drawing.type === 'text' ? Boolean(drawing.worldTarget && drawing.worldLabelPos) : Boolean(drawing.worldPoints?.length)
    )
  ) {
    return drawings;
  }
  if (!state?.viewportSize?.width || !state.viewportSize.height) return drawings;
  const current = getBrowserViewportSize();
  const scaleX = current.width / state.viewportSize.width;
  const scaleY = current.height / state.viewportSize.height;
  if (Math.abs(scaleX - 1) < 0.001 && Math.abs(scaleY - 1) < 0.001) return drawings;
  return drawings.map((drawing) => scaleDrawing(drawing, scaleX, scaleY));
};

const rounded = (value: number, precision = 3) => Number(value.toFixed(precision));

const roundedWorldPoint = (point: WorldPoint): WorldPoint => [
  rounded(point[0]),
  rounded(point[1]),
  rounded(point[2]),
];

const perpendicularDistance = (point: Point, lineStart: Point, lineEnd: Point) => {
  const dx = lineEnd.x - lineStart.x;
  const dy = lineEnd.y - lineStart.y;
  if (Math.abs(dx) < 1e-6 && Math.abs(dy) < 1e-6) return Math.hypot(point.x - lineStart.x, point.y - lineStart.y);
  return Math.abs(dy * point.x - dx * point.y + lineEnd.x * lineStart.y - lineEnd.y * lineStart.x) / Math.hypot(dx, dy);
};

const simplifyPoints = (points: Point[], epsilon = 2.25): Point[] => {
  if (points.length <= 2) return points;
  let maxDistance = 0;
  let maxIndex = 0;
  const first = points[0];
  const last = points[points.length - 1];

  for (let i = 1; i < points.length - 1; i += 1) {
    const distance = perpendicularDistance(points[i], first, last);
    if (distance > maxDistance) {
      maxDistance = distance;
      maxIndex = i;
    }
  }

  if (maxDistance <= epsilon) return [first, last];
  const left = simplifyPoints(points.slice(0, maxIndex + 1), epsilon);
  const right = simplifyPoints(points.slice(maxIndex), epsilon);
  return [...left.slice(0, -1), ...right];
};

const getProjectionPoint = (point: Point, rect: DOMRect, mirror: ProjectionMirror): Point => ({
  x: mirror.mirrorX ? rect.width - point.x : point.x,
  y: mirror.mirrorY ? rect.height - point.y : point.y,
});

const getScreenPoint = (point: Point, rect: DOMRect, mirror: ProjectionMirror): Point => ({
  x: mirror.mirrorX ? rect.width - point.x : point.x,
  y: mirror.mirrorY ? rect.height - point.y : point.y,
});

const screenPointToWorldPoint = (point: Point, camera: THREE.Camera, rect: DOMRect, mirror: ProjectionMirror): WorldPoint => {
  const projectionPoint = getProjectionPoint(point, rect, mirror);
  const ndcX = (projectionPoint.x / rect.width) * 2 - 1;
  const ndcY = -(projectionPoint.y / rect.height) * 2 + 1;
  const world = new THREE.Vector3(ndcX, ndcY, 0.5).unproject(camera);
  return roundedWorldPoint([world.x, world.y, world.z]);
};

const worldPointToScreenPoint = (point: WorldPoint, camera: THREE.Camera, rect: DOMRect, mirror: ProjectionMirror): Point => {
  const projected = new THREE.Vector3(...point).project(camera);
  const pointOnCanvas = {
    x: ((projected.x + 1) / 2) * rect.width,
    y: ((-projected.y + 1) / 2) * rect.height,
  };
  return getScreenPoint(pointOnCanvas, rect, mirror);
};

const attachWorldPointsToDrawing = (
  drawing: Drawing,
  camera: THREE.Camera,
  rect: DOMRect,
  mirror: ProjectionMirror,
  compact = false
): Drawing => {
  if (drawing.type === 'text') {
    return {
      ...drawing,
      worldTarget: screenPointToWorldPoint(drawing.target, camera, rect, mirror),
      worldLabelPos: screenPointToWorldPoint(drawing.labelPos, camera, rect, mirror),
    };
  }
  const points = drawing.type === 'brush' ? simplifyPoints(drawing.points) : drawing.points;
  return {
    ...drawing,
    points: compact && drawing.type === 'brush' ? [] : points,
    worldPoints: points.map((point) => screenPointToWorldPoint(point, camera, rect, mirror)),
  };
};

const projectDrawingFromWorld = (
  drawing: Drawing,
  camera: THREE.Camera,
  rect: DOMRect,
  mirror: ProjectionMirror
): Drawing => {
  if (drawing.type === 'text') {
    if (!drawing.worldTarget || !drawing.worldLabelPos) return drawing;
    return {
      ...drawing,
      target: worldPointToScreenPoint(drawing.worldTarget, camera, rect, mirror),
      labelPos: worldPointToScreenPoint(drawing.worldLabelPos, camera, rect, mirror),
    };
  }
  if (!drawing.worldPoints?.length) return drawing;
  return {
    ...drawing,
    points: drawing.worldPoints.map((point) => worldPointToScreenPoint(point, camera, rect, mirror)),
  };
};

const hasWorldAnchoredDrawings = (drawings: Drawing[]) =>
  drawings.some((drawing) =>
    drawing.type === 'text' ? Boolean(drawing.worldTarget && drawing.worldLabelPos) : Boolean(drawing.worldPoints?.length)
  );

const copyTextToClipboard = async (text: string) => {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fall through to the selection-based fallback used by embedded browsers.
    }
  }

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', 'true');
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  textarea.style.top = '0';
  document.body.appendChild(textarea);
  textarea.select();
  textarea.setSelectionRange(0, textarea.value.length);
  const copied = document.execCommand('copy');
  document.body.removeChild(textarea);
  return copied;
};

const canvasToBlob = (canvas: HTMLCanvasElement, type = 'image/png') =>
  new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Canvas export failed'));
    }, type);
  });

const getStateFromLocation = () => {
  const searchState = new URLSearchParams(window.location.search).get('state');
  if (searchState) return searchState;
  const hash = window.location.hash.startsWith('#') ? window.location.hash.slice(1) : window.location.hash;
  return new URLSearchParams(hash).get('state');
};

export const Layout: React.FC<LayoutProps> = ({ patientInfo, integrationInfo }) => {
  const viewportRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const cameraRef = useRef<THREE.OrthographicCamera | null>(null);
  const controlsRef = useRef<ViewerControls | null>(null);
  const clippingPanelRef = useRef<HTMLDivElement>(null);
  const modelFileInputRef = useRef<HTMLInputElement>(null);
  const initialSceneState = useMemo(() => {
    const encoded = getStateFromLocation();
    return encoded ? decodeState(encoded) : null;
  }, []);
  const initialDrawings = useMemo(() => scaleInitialDrawings(initialSceneState), [initialSceneState]);
  const initialProjectionMirror = useMemo<ProjectionMirror>(
    () => ({
      mirrorX: initialSceneState?.sceneSettings?.mirrorX ?? DEFAULT_SCENE_SETTINGS.mirrorX,
      mirrorY: initialSceneState?.sceneSettings?.mirrorY ?? DEFAULT_SCENE_SETTINGS.mirrorY,
    }),
    [initialSceneState]
  );
 

  const [activeTool, setActiveTool] = useState<ToolType>('none');
  const [drawings, setDrawings] = useState<Drawing[]>(() => initialDrawings);
  const [currentPoints, setCurrentPoints] = useState<Point[]>([]);
  const [isDrawingBrush, setIsDrawingBrush] = useState(false);
  const [textNotes, setTextNotes] = useState<TextNote[]>(() => initialSceneState?.textNotes || []);
  const [textCounter, setTextCounter] = useState(() =>
    initialSceneState?.textNotes?.reduce((max, note) => Math.max(max, note.id), 0) || 0
  );
  const [showClippingPanel, setShowClippingPanel] = useState(false);
  const [sectionLineMode, setSectionLineMode] = useState(false);
  const [sectionLinePoints, setSectionLinePoints] = useState<Point[]>([]);
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
  const [sceneTreeOpen, setSceneTreeOpen] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [annotationsCommitted, setAnnotationsCommitted] = useState(false);
  const [shareNotice, setShareNotice] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    model: ModelState;
  } | null>(null);
  const [cameraParams, setCameraParams] = useState<CameraParams | null>(null);
  const [sceneSettings, setSceneSettings] = useState<SceneSettings>(() => ({
    ...DEFAULT_SCENE_SETTINGS,
    ...initialSceneState?.sceneSettings,
  }));
  const [modelBounds, setModelBounds] = useState<BoundsSnapshot | null>(null);
  const models = useViewerStore((state) => state.models);
  const addModel = useViewerStore((state) => state.addModel);
  const updateModel = useViewerStore((state) => state.updateModel);
  const removeModel = useViewerStore((state) => state.removeModel);

  const measurementProjectionOptions = useMemo(
    () => ({ mirrorX: sceneSettings.mirrorX, mirrorY: sceneSettings.mirrorY }),
    [sceneSettings.mirrorX, sceneSettings.mirrorY]
  );
  const { unprojectPoint, calculateAngle, calculateCircleDiameter, calculatePolylineDistance } = useMeasurements(
    cameraRef,
    viewportRef,
    measurementProjectionOptions
  );

  const hasAnnotationDraft =
    activeTool !== 'none' ||
    sectionLineMode ||
    currentPoints.length > 0 ||
    sectionLinePoints.length > 0 ||
    isDrawingBrush;
  const hasAnnotations = drawings.length > 0 || textNotes.length > 0;
  const controlsLocked = hasAnnotationDraft || (hasAnnotations && !annotationsCommitted);
  const controlsLockedRef = useRef(controlsLocked);

  const currentPointsRef = useRef<Point[]>([]);
  const activePointerIdRef = useRef<number | null>(null);
  const activeTouchPointersRef = useRef<Set<number>>(new Set());
  const gestureModeRef = useRef<'none' | 'tool' | 'controls'>('none');
  const lastTouchEndTimeRef = useRef(0);
  const userInteracted = useRef(false);
  const hasAutoFramedRef = useRef(Boolean(initialSceneState?.cameraPosition));

  useEffect(() => {
    currentPointsRef.current = currentPoints;
  }, [currentPoints]);

  useEffect(() => {
    controlsLockedRef.current = controlsLocked;
    if (controlsRef.current) controlsRef.current.enabled = !controlsLocked;
  }, [controlsLocked]);

  const getPointFromClient = useCallback((clientX: number, clientY: number): Point | null => {
    const rect = viewportRef.current?.getBoundingClientRect();
    if (!rect) return null;
    return { x: clientX - rect.left, y: clientY - rect.top };
  }, []);

  const applyCameraView = useCallback((position: THREE.Vector3, target = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), zoom = 2) => {
    const camera = cameraRef.current;
    const controls = controlsRef.current as CenterableViewerControls | null;
    if (!camera || !controls) return;
    controls.enabled = false;
    camera.position.copy(position);
    camera.up.copy(up);
    camera.zoom = zoom;
    camera.lookAt(target);
    camera.near = 0.1;
    camera.far = Math.max(position.distanceTo(target) * 4, 1000);
    syncArcballState(controls, camera, target);
    window.requestAnimationFrame(() => {
      controls.enabled = !controlsLockedRef.current;
    });
  }, []);

  const frameModels = useCallback(async (targetModels: ModelState[], options?: { cancelIfUserInteracted?: boolean }) => {
    const visibleModels = targetModels.filter((model) => model.visible);
    const boundsResults = await Promise.allSettled(visibleModels.map((model) => loadModelWorldBounds(model)));
    if (options?.cancelIfUserInteracted && userInteracted.current) return;
    const bounds = new THREE.Box3();
    boundsResults.forEach((result) => {
      if (result.status === 'fulfilled' && result.value) bounds.union(result.value);
    });

    const target = bounds.isEmpty() ? new THREE.Vector3() : bounds.getCenter(new THREE.Vector3());
    const size = bounds.isEmpty() ? new THREE.Vector3(100, 100, 100) : bounds.getSize(new THREE.Vector3());
    const camera = cameraRef.current;
    const viewport = viewportRef.current?.getBoundingClientRect();
    const viewWidth = camera ? Math.abs(camera.right - camera.left) : viewport?.width || 1000;
    const viewHeight = camera ? Math.abs(camera.top - camera.bottom) : viewport?.height || 1000;
    const framedSize = Math.max(size.x, size.y, size.z, 1);
    const zoom = Math.max(0.01, Math.min(viewWidth / framedSize, viewHeight / framedSize) * 0.75);
    const distance = Math.max(size.length() * 1.5, 150);

    applyCameraView(new THREE.Vector3(target.x, target.y, target.z + distance), target, new THREE.Vector3(0, 1, 0), zoom);
  }, [applyCameraView]);

  const centerCamera = useCallback(async () => {
    await frameModels(models);
  }, [frameModels, models]);

  useEffect(() => {
    let cancelled = false;
    const visibleModels = models.filter((model) => model.visible);
    if (visibleModels.length === 0) {
      const timeoutId = window.setTimeout(() => {
        if (!cancelled) setModelBounds(null);
      }, 0);
      return () => {
        cancelled = true;
        window.clearTimeout(timeoutId);
      };
    }

    Promise.allSettled(visibleModels.map((model) => loadModelWorldBounds(model))).then((boundsResults) => {
      if (cancelled) return;
      const bounds = new THREE.Box3();
      boundsResults.forEach((result) => {
        if (result.status === 'fulfilled' && result.value) bounds.union(result.value);
      });
      setModelBounds(bounds.isEmpty() ? null : getBoundsSnapshot(bounds));
    });

    return () => {
      cancelled = true;
    };
  }, [models]);

  const clippingNormal = useMemo(() => getClippingNormal(sceneSettings), [sceneSettings]);
  const clippingSliderLimit = useMemo(() => {
    if (!modelBounds) return Math.max(120, Math.ceil(Math.abs(sceneSettings.clippingOffset)));
    const range = getBoundsProjectionRange(modelBounds, clippingNormal);
    const centerProjection = clippingNormal.dot(new THREE.Vector3(...modelBounds.center));
    const halfRange = Math.max(centerProjection - range.min, range.max - centerProjection);
    return Math.max(10, Math.ceil(halfRange * 1.1), Math.ceil(Math.abs(sceneSettings.clippingOffset)));
  }, [clippingNormal, modelBounds, sceneSettings.clippingOffset]);
  const clippingStep = useMemo(() => Math.max(1, Math.round(clippingSliderLimit / 240)), [clippingSliderLimit]);

  const updateSceneSetting = useCallback(<K extends keyof SceneSettings>(key: K, value: SceneSettings[K]) => {
    setSceneSettings((prev) => ({ ...prev, [key]: value }));
  }, []);

  const selectClippingAxis = useCallback((axis: SceneSettings['clippingAxis']) => {
    setSceneSettings((prev) => ({ ...prev, clippingMode: 'axis', clippingAxis: axis, clippingOffset: 0 }));
  }, []);

  const toggleBackground = useCallback(() => {
    setSceneSettings((prev) => ({
      ...prev,
      backgroundColor: prev.backgroundColor.toLowerCase() === '#ffffff' ? '#111111' : '#ffffff',
    }));
  }, []);

  const cycleClippingAxis = useCallback(() => {
    setSceneSettings((prev) => {
      const nextAxis: Record<SceneSettings['clippingAxis'], SceneSettings['clippingAxis']> = {
        x: 'y',
        y: 'z',
        z: 'x',
      };
      return { ...prev, clippingMode: 'axis', clippingAxis: nextAxis[prev.clippingAxis], clippingOffset: 0 };
    });
  }, []);

  const adjustClippingOffset = useCallback((delta: number) => {
    setSceneSettings((prev) => ({
      ...prev,
      clippingOffset: Math.max(-clippingSliderLimit, Math.min(clippingSliderLimit, prev.clippingOffset + delta)),
    }));
  }, [clippingSliderLimit]);

  const applySectionLine = useCallback(
    (points: Point[]) => {
      const camera = cameraRef.current;
      if (!camera || points.length < 2) return;
      const worldA = unprojectPoint(points[0]);
      const worldB = unprojectPoint(points[1]);
      const lineDirection = worldB.clone().sub(worldA);
      const cameraDirection = new THREE.Vector3();
      camera.getWorldDirection(cameraDirection);
      const normal = lineDirection.cross(cameraDirection).normalize();
      if (normal.lengthSq() < 1e-8) return;
      const midpoint = worldA.clone().add(worldB).multiplyScalar(0.5);
      const centerProjection = modelBounds ? normal.dot(new THREE.Vector3(...modelBounds.center)) : 0;
      const clippingOffset = normal.dot(midpoint) - centerProjection;
      setSceneSettings((prev) => ({
        ...prev,
        clippingEnabled: true,
        clippingMode: 'free',
        clippingNormal: [normal.x, normal.y, normal.z],
        clippingOffset,
      }));
      setSectionLineMode(false);
      setSectionLinePoints([]);
      setShowClippingPanel(true);
    },
    [modelBounds, unprojectPoint]
  );

  const handleSectionLinePoint = useCallback(
    (point: Point) => {
      const nextPoints = [...sectionLinePoints, point];
      if (nextPoints.length >= 2) {
        applySectionLine(nextPoints);
      } else {
        setSectionLinePoints(nextPoints);
      }
    },
    [applySectionLine, sectionLinePoints]
  );

  const showNotice = useCallback((message: string) => {
    setShareNotice(message);
    window.setTimeout(() => setShareNotice(null), 2600);
  }, []);

  const createSceneState = useCallback((): SceneState => {
    const camera = cameraRef.current;
    const target = getArcballFocus(controlsRef.current);
    const viewport = viewportRef.current?.getBoundingClientRect();
    const shareDrawings = camera && viewport
      ? drawings.map((drawing) => attachWorldPointsToDrawing(drawing, camera, viewport, sceneSettings, true))
      : drawings;
    return {
      models,
      drawings: shareDrawings,
      textNotes,
      patientInfo,
      studyId: integrationInfo?.studyId,
      sourcePath: integrationInfo?.sourcePath,
      outputPath: integrationInfo?.outputPath,
      artifactBaseUrl: integrationInfo?.artifactBaseUrl,
      manifestUrl: integrationInfo?.manifestUrl,
      sceneSettings,
      viewportSize: viewport
        ? { width: Math.round(viewport.width), height: Math.round(viewport.height) }
        : getBrowserViewportSize(),
      arcballState: getArcballState(camera, controlsRef.current),
      cameraPosition: camera ? ([camera.position.x, camera.position.y, camera.position.z] as [number, number, number]) : undefined,
      targetPosition: target ? ([target.x, target.y, target.z] as [number, number, number]) : undefined,
      cameraZoom: camera?.zoom,
    };
  }, [drawings, integrationInfo, models, patientInfo, sceneSettings, textNotes]);

  const copySceneLink = useCallback(async () => {
    const encoded = encodeState(createSceneState());
    const url = `${window.location.origin}${window.location.pathname}#state=${encoded}`;
    const copied = await copyTextToClipboard(url);
    if (copied) setAnnotationsCommitted(true);
    showNotice(copied ? 'Ссылка скопирована' : 'Не удалось скопировать ссылку');
  }, [createSceneState, showNotice]);

  const importModelFiles = useCallback(
    (files: FileList | null) => {
      if (!files) return;
      Array.from(files).forEach((file) => {
        const extension = file.name.split('.').pop()?.toLowerCase();
        if (!extension || !['stl', 'obj', 'ply'].includes(extension)) return;
        addModel({
          url: URL.createObjectURL(file),
          name: file.name,
          color: '#3b82f6',
          opacity: 1,
          visible: true,
          position: [0, 0, 0],
          rotation: [0, 0, 0],
          scale: [1, 1, 1],
          group: 'Imported',
        });
      });
    },
    [addModel]
  );

  const openModelFilePicker = useCallback(() => {
    modelFileInputRef.current?.click();
  }, []);

  const downloadBlob = useCallback((name: string, blob: Blob) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    link.click();
    URL.revokeObjectURL(url);
  }, []);

  const downloadJson = useCallback(
    (name: string, data: unknown) => {
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' });
      downloadBlob(name, blob);
    },
    [downloadBlob]
  );

  const exportSceneJson = useCallback(async () => {
    const fileName = `viewer-scene-${Date.now()}.json`;
    const sceneState = createSceneState();
    try {
      const uploaded = await postJsonArtifact(integrationInfo, 'scene', sceneState);
      if (uploaded) {
        showNotice('Сцена сохранена в МИС');
        setAnnotationsCommitted(true);
        return;
      }
    } catch (error) {
      console.warn('[MIS] Scene save failed, falling back to download', error);
      showNotice('МИС недоступна, сцена скачана');
    }
    downloadJson(fileName, sceneState);
    setAnnotationsCommitted(true);
  }, [createSceneState, downloadJson, integrationInfo, showNotice]);

  const exportMeasurementsJson = useCallback(async () => {
    const fileName = `viewer-measurements-${Date.now()}.json`;
    const payload = {
      patientInfo,
      studyId: integrationInfo?.studyId,
      sourcePath: integrationInfo?.sourcePath,
      outputPath: integrationInfo?.outputPath,
      drawings,
      textNotes,
      exportedAt: new Date().toISOString(),
    };
    try {
      const uploaded = await postJsonArtifact(integrationInfo, 'measurements', payload);
      if (uploaded) {
        showNotice('Замеры сохранены в МИС');
        setAnnotationsCommitted(true);
        return;
      }
    } catch (error) {
      console.warn('[MIS] Measurements save failed, falling back to download', error);
      showNotice('МИС недоступна, замеры скачаны');
    }
    downloadJson(fileName, payload);
    setAnnotationsCommitted(true);
  }, [downloadJson, drawings, integrationInfo, patientInfo, showNotice, textNotes]);

  const captureScreenshot = useCallback(async () => {
    const view = viewportRef.current;
    const webglCanvas = view?.querySelector('canvas');
    if (!view || !webglCanvas || !svgRef.current) return;
    const rect = view.getBoundingClientRect();
    const output = document.createElement('canvas');
    output.width = Math.round(rect.width);
    output.height = Math.round(rect.height);
    const ctx = output.getContext('2d');
    if (!ctx) return;

    ctx.save();
    if (sceneSettings.mirrorX || sceneSettings.mirrorY) {
      ctx.translate(sceneSettings.mirrorX ? output.width : 0, sceneSettings.mirrorY ? output.height : 0);
      ctx.scale(sceneSettings.mirrorX ? -1 : 1, sceneSettings.mirrorY ? -1 : 1);
    }
    ctx.drawImage(webglCanvas, 0, 0, output.width, output.height);
    ctx.restore();

    const svgClone = svgRef.current.cloneNode(true) as SVGSVGElement;
    svgClone.setAttribute('width', String(output.width));
    svgClone.setAttribute('height', String(output.height));
    svgClone.setAttribute('viewBox', `0 0 ${output.width} ${output.height}`);
    const svgBlob = new Blob([new XMLSerializer().serializeToString(svgClone)], { type: 'image/svg+xml;charset=utf-8' });
    const objectUrl = URL.createObjectURL(svgBlob);
    try {
      const image = new Image();
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error('Screenshot annotations failed to render'));
        image.src = objectUrl;
      });
      ctx.drawImage(image, 0, 0);
    } finally {
      URL.revokeObjectURL(objectUrl);
    }

    const fileName = `viewer-scene-${Date.now()}.png`;
    const imageBlob = await canvasToBlob(output);
    try {
      const uploaded = await postScreenshotArtifact(integrationInfo, imageBlob, fileName, {
        patientInfo,
        studyId: integrationInfo?.studyId,
        sourcePath: integrationInfo?.sourcePath,
        outputPath: integrationInfo?.outputPath,
        exportedAt: new Date().toISOString(),
      });
      if (uploaded) {
        showNotice('Скриншот сохранен в МИС');
        setAnnotationsCommitted(true);
        return;
      }
    } catch (error) {
      console.warn('[MIS] Screenshot save failed, falling back to download', error);
      showNotice('МИС недоступна, скриншот скачан');
    }
    downloadBlob(fileName, imageBlob);
    setAnnotationsCommitted(true);
  }, [downloadBlob, integrationInfo, patientInfo, sceneSettings.mirrorX, sceneSettings.mirrorY, showNotice]);

  const recordRotationVideo = useCallback(async () => {
    const view = viewportRef.current;
    const canvas = view?.querySelector('canvas');
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!canvas || !camera || !controls || !('captureStream' in canvas) || !window.MediaRecorder) return;

    const stream = canvas.captureStream(30);
    const recorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
    const chunks: BlobPart[] = [];
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    };
    const done = new Promise<void>((resolve) => {
      recorder.onstop = () => resolve();
    });

    const start = performance.now();
    const duration = 4000;
    const target = controls.target?.clone?.() || new THREE.Vector3(0, 0, 0);
    const offset = camera.position.clone().sub(target);
    recorder.start();

    const animate = (now: number) => {
      const progress = Math.min((now - start) / duration, 1);
      const angle = progress * Math.PI * 2;
      const rotated = offset.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), angle);
      camera.position.copy(target.clone().add(rotated));
      camera.lookAt(target);
      camera.updateProjectionMatrix();
      controls.update?.();
      if (progress < 1) requestAnimationFrame(animate);
      else recorder.stop();
    };

    requestAnimationFrame(animate);
    await done;
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob(chunks, { type: 'video/webm' }));
    link.download = `viewer-rotation-${Date.now()}.webm`;
    link.click();
    URL.revokeObjectURL(link.href);
  }, []);

  const finishRuler = useCallback(
    (points: Point[]) => {
      const normalizedPoints = points.filter((point, index) => {
        const prev = points[index - 1];
        return !prev || Math.hypot(point.x - prev.x, point.y - prev.y) > 1;
      });
      if (normalizedPoints.length < 2) return;
      const value = calculatePolylineDistance(normalizedPoints);
      setAnnotationsCommitted(false);
      setDrawings((prev) => [...prev, { type: 'ruler', points: normalizedPoints, value: +value.toFixed(1) }]);
      setCurrentPoints([]);
    },
    [calculatePolylineDistance]
  );

  const handleToolPoint = useCallback(
    (point: Point) => {
      if (activeTool === 'none' || activeTool === 'brush') return;

      if (activeTool === 'text') {
        if (currentPoints.length === 0) {
          setCurrentPoints([point]);
          return;
        }
        const userText = window.prompt('Введите текст заметки');
        if (userText?.trim()) {
          const newId = textCounter + 1;
          setAnnotationsCommitted(false);
          setTextCounter(newId);
          setTextNotes((prev) => [...prev, { id: newId, text: userText }]);
          setDrawings((prev) => [
            ...prev,
            {
              type: 'text',
              target: currentPoints[0],
              labelPos: point,
              textId: newId,
              color: '#ff0000',
              fontSize: 16,
            },
          ]);
        }
        setCurrentPoints([]);
        return;
      }

      if (activeTool === 'ruler') {
        setCurrentPoints((prev) => [...prev, point]);
        return;
      }

      if (activeTool === 'circle') {
        const pts = [...currentPoints, point];
        setCurrentPoints(pts);
        if (pts.length === 3) {
          const dia = calculateCircleDiameter(pts[0], pts[1], pts[2]);
          if (dia > 0) {
            setAnnotationsCommitted(false);
            setDrawings((prev) => [...prev, { type: 'circle', points: pts, value: +dia.toFixed(1) }]);
          }
          setCurrentPoints([]);
        }
        return;
      }

      if (activeTool === 'angle') {
        const pts = [...currentPoints, point];
        if (pts.length < 3) {
          setCurrentPoints(pts);
        } else {
          const ang = calculateAngle(pts[0], pts[1], pts[2]);
          setAnnotationsCommitted(false);
          setDrawings((prev) => [...prev, { type: 'angle', points: pts, value: +ang.toFixed(1) }]);
          setCurrentPoints([]);
        }
      }
    },
    [activeTool, calculateAngle, calculateCircleDiameter, currentPoints, textCounter]
  );

  const selectTool = useCallback((tool: ToolType) => {
    setActiveTool(tool);
    setCurrentPoints([]);
    setIsDrawingBrush(false);
    activePointerIdRef.current = null;
    gestureModeRef.current = 'none';
  }, []);

  const handleUndoDraw = useCallback(() => {
    if (currentPoints.length > 0) {
      setCurrentPoints([]);
      setIsDrawingBrush(false);
      return;
    }
    const last = drawings[drawings.length - 1];
    if (last?.type === 'text') setTextNotes((prev) => prev.filter((n) => n.id !== last.textId));
    if (last) setAnnotationsCommitted(false);
    setDrawings((prev) => prev.slice(0, -1));
  }, [currentPoints.length, drawings]);

  const handleClearAll = useCallback(() => {
    if (!window.confirm('Очистить все пометки?')) return;
    setDrawings([]);
    setCurrentPoints([]);
    setTextNotes([]);
    setIsDrawingBrush(false);
    setAnnotationsCommitted(false);
  }, []);

  const handleModelContextMenu = useCallback((e: React.MouseEvent, model: ModelState) => {
    e.preventDefault();
    e.stopPropagation();
    setSelectedModelId(model.id);
    setContextMenu({ x: e.clientX, y: e.clientY, model });
  }, []);

  const isInteractiveUiTarget = (target: EventTarget | null) => {
    if (!(target instanceof HTMLElement)) return false;
    return Boolean(target.closest('button, input, select, textarea, [data-ui-control="true"]'));
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isInteractiveUiTarget(e.target)) return;
    if (controlsLocked && activeTool === 'none' && !sectionLineMode) {
      showNotice('Сначала сохраните, поделитесь или очистите разметку');
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    userInteracted.current = true;
    if (sectionLineMode) {
      const pt = getPointFromClient(e.clientX, e.clientY);
      if (!pt) return;
      activePointerIdRef.current = e.pointerId;
      gestureModeRef.current = 'tool';
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    if (e.pointerType === 'touch') activeTouchPointersRef.current.add(e.pointerId);
    if (activeTool === 'none') {
      gestureModeRef.current = 'controls';
      return;
    }
    if (e.pointerType === 'touch' && activeTouchPointersRef.current.size > 1) {
      gestureModeRef.current = 'controls';
      return;
    }
    const pt = getPointFromClient(e.clientX, e.clientY);
    if (!pt) return;
    activePointerIdRef.current = e.pointerId;
    gestureModeRef.current = 'tool';
    if (activeTool === 'brush') {
      setIsDrawingBrush(true);
      setCurrentPoints([pt]);
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    e.preventDefault();
    e.stopPropagation();
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (gestureModeRef.current !== 'tool' || activeTool !== 'brush' || !isDrawingBrush) return;
    if (activePointerIdRef.current !== e.pointerId) return;
    const pt = getPointFromClient(e.clientX, e.clientY);
    if (!pt) return;
    setCurrentPoints((prev) => [...prev, pt]);
    e.preventDefault();
    e.stopPropagation();
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'touch') activeTouchPointersRef.current.delete(e.pointerId);
    if (gestureModeRef.current !== 'tool' || activePointerIdRef.current !== e.pointerId) {
      if (activeTouchPointersRef.current.size === 0)
        gestureModeRef.current = activeTool === 'none' ? 'controls' : 'none';
      return;
    }
    const pt = getPointFromClient(e.clientX, e.clientY);
    if (!pt) return;
    if (sectionLineMode) {
      handleSectionLinePoint(pt);
      e.preventDefault();
      e.stopPropagation();
      activePointerIdRef.current = null;
      gestureModeRef.current = 'none';
      return;
    }
    if (activeTool === 'brush') {
      setIsDrawingBrush(false);
      setAnnotationsCommitted(false);
      setDrawings((prev) => [...prev, { type: 'brush', points: [...currentPointsRef.current, pt], color: 'red' }]);
      setCurrentPoints([]);
      e.preventDefault();
      e.stopPropagation();
    } else {
      if (activeTool === 'ruler' && e.detail > 1) {
        finishRuler([...currentPointsRef.current, pt]);
      } else if (!(e.pointerType === 'mouse' && Date.now() - lastTouchEndTimeRef.current < 300)) {
        handleToolPoint(pt);
      }
      if (e.pointerType === 'touch') lastTouchEndTimeRef.current = Date.now();
      e.preventDefault();
      e.stopPropagation();
    }
    activePointerIdRef.current = null;
    gestureModeRef.current = activeTouchPointersRef.current.size > 0 ? 'controls' : activeTool === 'none' ? 'controls' : 'none';
  };

  const handlePointerCancel = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'touch') activeTouchPointersRef.current.delete(e.pointerId);
    if (activePointerIdRef.current === e.pointerId) {
      activePointerIdRef.current = null;
      setIsDrawingBrush(false);
      setCurrentPoints([]);
    }
    if (activeTouchPointersRef.current.size === 0) gestureModeRef.current = activeTool === 'none' ? 'controls' : 'none';
  };

  useEffect(() => {
    const view = viewportRef.current;
    if (!view) return;
    const onWheel = () => {
      userInteracted.current = true;
    };
    view.addEventListener('wheel', onWheel, { passive: true });
    return () => view.removeEventListener('wheel', onWheel);
  }, []);

  useEffect(() => {
    const state = initialSceneState;
    if (!state?.cameraPosition && !state?.arcballState) return;
    let projectedDrawings = false;
    let attempts = 0;
    const restoreCamera = () => {
      const camera = cameraRef.current;
      const controls = controlsRef.current;
      if (!camera || !controls) {
        if (attempts++ < 30) window.setTimeout(restoreCamera, 100);
        return;
      }
      const runtimeControls = controls as unknown as CenterableViewerControls;
      if (state.arcballState) {
        runtimeControls.setStateFromJSON?.(JSON.stringify({ arcballState: state.arcballState }));
        runtimeControls.saveState?.();
        runtimeControls.update?.();
        if (!projectedDrawings && hasWorldAnchoredDrawings(state.drawings || [])) {
          projectedDrawings = true;
          window.requestAnimationFrame(() => {
            const rect = viewportRef.current?.getBoundingClientRect();
            const restoredCamera = cameraRef.current;
            if (!rect || !restoredCamera) return;
            setDrawings((state.drawings || []).map((drawing) => projectDrawingFromWorld(drawing, restoredCamera, rect, initialProjectionMirror)));
          });
        }
        return;
      }
      const target = state.targetPosition
        ? new THREE.Vector3(...state.targetPosition)
        : controls.target?.clone?.() || new THREE.Vector3();
      if (state.cameraPosition) camera.position.set(...state.cameraPosition);
      camera.lookAt(target);
      camera.zoom = state.cameraZoom || 2;
      camera.updateMatrix();
      camera.updateMatrixWorld(true);
      camera.updateProjectionMatrix();
      syncArcballState(runtimeControls, camera, target);
    };
    restoreCamera();
  }, [initialProjectionMirror, initialSceneState]);

  useEffect(() => {
    if (hasAutoFramedRef.current || models.length === 0) return;
    const timeoutId = window.setTimeout(() => {
      if (userInteracted.current || hasAutoFramedRef.current) return;
      hasAutoFramedRef.current = true;
      frameModels(models, { cancelIfUserInteracted: true }).catch(() => {});
    }, 250);
    return () => window.clearTimeout(timeoutId);
  }, [frameModels, models]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target;
      if (
        target instanceof HTMLElement &&
        (target.closest('input, select, textarea') || target.isContentEditable)
      ) {
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        handleUndoDraw();
        return;
      }
      if (e.key === ' ') {
        e.preventDefault();
        centerCamera().catch(() => {});
        return;
      }
      if (!e.ctrlKey && !e.metaKey && e.key.toLowerCase() === 'm') {
        e.preventDefault();
        selectTool(activeTool === 'ruler' ? 'none' : 'ruler');
        return;
      }
      if (!e.ctrlKey && !e.metaKey && e.key.toLowerCase() === 's') {
        e.preventDefault();
        captureScreenshot().catch(() => {});
        return;
      }
      if (e.key === 'Enter') {
        if (activeTool !== 'ruler') return;
        finishRuler(currentPointsRef.current);
      }
      if (e.key === 'Escape') {
        setCurrentPoints([]);
        setSectionLineMode(false);
        setSectionLinePoints([]);
        setContextMenu(null);
        selectTool('none');
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeTool, captureScreenshot, centerCamera, finishRuler, handleUndoDraw, selectTool]);

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (e.target instanceof HTMLElement && e.target.closest('[data-ui-control="true"]')) return;
      if (showClippingPanel && clippingPanelRef.current && !clippingPanelRef.current.contains(e.target as Node)) {
        setShowClippingPanel(false);
      }
      setContextMenu(null);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [showClippingPanel]);

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (e.dataTransfer.types.includes('Files')) setDragActive(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
    setDragActive(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setDragActive(false);
      importModelFiles(e.dataTransfer.files);
    },
    [importModelFiles]
  );

  const effectiveSelectedModelId =
    selectedModelId && models.some((model) => model.id === selectedModelId) ? selectedModelId : models[0]?.id || null;
  const rightFrameInset = sceneTreeOpen ? SCENE_TREE_WIDTH : 0;

  return (
    <div
      ref={viewportRef}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        touchAction: 'none',
        overscrollBehavior: 'none',
        backgroundColor: '#111',
      }}
      onPointerDownCapture={handlePointerDown}
      onPointerMoveCapture={handlePointerMove}
      onPointerUpCapture={handlePointerUp}
      onPointerCancelCapture={handlePointerCancel}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <MainScene
        cameraRef={cameraRef}
        onCameraParamsUpdate={setCameraParams}
        controlsRef={controlsRef}
        sceneSettings={sceneSettings}
        gizmoRightInset={sceneTreeOpen ? SCENE_TREE_WIDTH + 90 : 90}
        gizmoBottomInset={BOTTOM_FRAME_HEIGHT + RULER_THICKNESS + 92}
        controlsLocked={controlsLocked}
        clippingOrigin={modelBounds?.center}
      />

      <div
        style={{ position: 'absolute', top: 0, left: 0, right: rightFrameInset, zIndex: 24, transition: 'right 180ms ease' }}
        data-ui-control="true"
      >
        <div style={topToolbarStyle}>
          <div style={toolbarClusterStyle}>
            <button type="button" onClick={openModelFilePicker} style={textButtonStyle}>
              Файл · Импорт
            </button>
            <button type="button" onClick={exportSceneJson} style={textButtonStyle}>
              Сохранить сцену
            </button>
            <button type="button" onClick={exportMeasurementsJson} style={textButtonStyle}>
              Экспорт замеров
            </button>
            <button type="button" onClick={captureScreenshot} style={textButtonStyle}>
              Скриншот
            </button>
            <button type="button" onClick={recordRotationVideo} style={textButtonStyle}>
              Видео
            </button>
            <button type="button" onClick={copySceneLink} style={textButtonStyle}>
              Поделиться
            </button>
          </div>
          {patientInfo && (
            <div style={{ minWidth: 180, textAlign: 'right', color: '#d1d5db', fontSize: 12 }}>
              <strong style={{ color: '#bfdbfe' }}>{patientInfo.name}</strong>
              <span style={{ margin: '0 8px', color: '#64748b' }}>|</span>
              <span>{patientInfo.study}</span>
            </div>
          )}
        </div>
      </div>

      <div
        style={{
          position: 'absolute',
          left: LEFT_FRAME_WIDTH + RULER_THICKNESS + 8,
          top: TOP_FRAME_HEIGHT + 8,
          zIndex: 20,
          padding: '8px 10px',
          borderRadius: 6,
          backgroundColor: 'rgba(17, 24, 39, 0.82)',
          border: '1px solid rgba(75, 85, 99, 0.65)',
          color: '#e5e7eb',
          fontFamily: 'monospace',
          fontSize: 12,
          lineHeight: 1.35,
          pointerEvents: 'none',
        }}
      >
        <div>{sceneSettings.orientationSystem}</div>
        <div>
          X {sceneSettings.orientationSystem === 'RAS' ? 'R/L' : 'L/R'} · Y{' '}
          {sceneSettings.orientationSystem === 'RAS' ? 'A/P' : 'P/A'} · Z S/I
        </div>
      </div>

      <input
        ref={modelFileInputRef}
        type="file"
        accept=".stl,.obj,.ply"
        multiple
        onChange={(e) => {
          importModelFiles(e.target.files);
          e.target.value = '';
        }}
        style={{ display: 'none' }}
      />

      <div
        style={{
          position: 'absolute',
          left: 0,
          bottom: 0,
          zIndex: 18,
          width: LEFT_FRAME_WIDTH + RULER_THICKNESS,
          height: BOTTOM_FRAME_HEIGHT,
          background: '#111827',
        }}
      />
      {sceneTreeOpen && (
        <>
          <div
            style={{
              position: 'absolute',
              top: 0,
              right: 0,
              zIndex: 18,
              width: SCENE_TREE_WIDTH,
              height: TOP_FRAME_HEIGHT,
              background: '#111827',
            }}
          />
          <div
            style={{
              position: 'absolute',
              right: 0,
              bottom: 0,
              zIndex: 18,
              width: SCENE_TREE_WIDTH,
              height: BOTTOM_FRAME_HEIGHT,
              background: '#111827',
            }}
          />
        </>
      )}

      <div
        style={{
          position: 'absolute',
          left: 0,
          top: TOP_FRAME_HEIGHT,
          bottom: BOTTOM_FRAME_HEIGHT,
          zIndex: 22,
          width: LEFT_FRAME_WIDTH,
          display: 'grid',
          gridTemplateRows: '1fr 0.72fr',
          gap: 0,
          background: '#111827',
          borderRight: '1px solid rgba(75, 85, 99, 0.65)',
        }}
        data-ui-control="true"
      >
        <MainToolbar
          activeTool={activeTool}
          orientation="vertical"
          onSelectTool={selectTool}
          onUndo={handleUndoDraw}
          onClearAll={handleClearAll}
        />
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            gap: 4,
            padding: 4,
            borderRadius: 0,
          }}
        >
          <button
            type="button"
            title="Сечение"
            onClick={() => setShowClippingPanel((v) => !v)}
            style={{
              ...sceneToolButtonStyle(showClippingPanel || sceneSettings.clippingEnabled, true),
              width: '100%',
              height: 'clamp(34px, 5.9vh, 52px)',
            }}
          >
            <span>◫</span>
            <span style={{ fontSize: 7, marginTop: 2, fontWeight: 800 }}>Сеч.</span>
          </button>
          <button
            type="button"
            title="Сброс камеры"
            onClick={() => centerCamera().catch(() => {})}
            style={{ ...sceneToolButtonStyle(false, true), width: '100%', height: 'clamp(34px, 5.9vh, 52px)' }}
          >
            <span>⌖</span>
            <span style={{ fontSize: 7, marginTop: 2, fontWeight: 800 }}>Центр</span>
          </button>
          <button
            type="button"
            title="Зеркало X"
            onClick={() => updateSceneSetting('mirrorX', !sceneSettings.mirrorX)}
            style={{
              ...sceneToolButtonStyle(sceneSettings.mirrorX, true),
              width: '100%',
              height: 'clamp(34px, 5.9vh, 52px)',
            }}
          >
            <span>⇄</span>
            <span style={{ fontSize: 7, marginTop: 2, fontWeight: 800 }}>X</span>
          </button>
          <button
            type="button"
            title="Зеркало Y"
            onClick={() => updateSceneSetting('mirrorY', !sceneSettings.mirrorY)}
            style={{
              ...sceneToolButtonStyle(sceneSettings.mirrorY, true),
              width: '100%',
              height: 'clamp(34px, 5.9vh, 52px)',
            }}
          >
            <span>⇅</span>
            <span style={{ fontSize: 7, marginTop: 2, fontWeight: 800 }}>Y</span>
          </button>
          <button
            type="button"
            title="RAS / LPS"
            onClick={() =>
              updateSceneSetting('orientationSystem', sceneSettings.orientationSystem === 'RAS' ? 'LPS' : 'RAS')
            }
            style={{ ...sceneToolButtonStyle(false, true), width: '100%', height: 'clamp(34px, 5.9vh, 52px)' }}
          >
            <span style={{ fontSize: 11 }}>{sceneSettings.orientationSystem}</span>
            <span style={{ fontSize: 7, marginTop: 2, fontWeight: 800 }}>Оси</span>
          </button>
        </div>
      </div>

      {showClippingPanel && (
        <div
          ref={clippingPanelRef}
          style={{
            position: 'absolute',
            top: TOP_FRAME_HEIGHT,
            left: LEFT_FRAME_WIDTH + RULER_THICKNESS,
            zIndex: 30,
            width: 320,
            backgroundColor: 'rgba(31, 41, 55, 0.95)',
            backdropFilter: 'blur(8px)',
            borderRadius: 8,
            border: '1px solid #374151',
            padding: 16,
            color: 'white',
            boxShadow: '0 10px 25px rgba(0,0,0,0.5)',
          }}
          data-ui-control="true"
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 'bold' }}>Сечение</h3>
            <button
              type="button"
              onClick={() => updateSceneSetting('clippingEnabled', !sceneSettings.clippingEnabled)}
              style={{
                minHeight: 32,
                minWidth: 80,
                border: '1px solid #4b5563',
                borderRadius: 4,
                background: sceneSettings.clippingEnabled ? '#2563eb' : '#111827',
                color: 'white',
                cursor: 'pointer',
                fontSize: 12,
              }}
            >
              {sceneSettings.clippingEnabled ? 'Вкл' : 'Выкл'}
            </button>
          </div>
          <div style={{ display: 'grid', gap: 12 }}>
            <div style={{ display: 'grid', gap: 6, color: '#d1d5db', fontSize: 12 }}>
              Отображение
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
                {(['whole', 'negative', 'positive'] as SceneSettings['clippingDisplayMode'][]).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => updateSceneSetting('clippingDisplayMode', mode)}
                    style={{
                      minHeight: 32,
                      borderRadius: 4,
                      border: `1px solid ${
                        sceneSettings.clippingDisplayMode === mode ? '#60a5fa' : '#4b5563'
                      }`,
                      background: sceneSettings.clippingDisplayMode === mode ? '#2563eb' : '#111827',
                      color: 'white',
                      cursor: 'pointer',
                      fontSize: 12,
                      fontWeight: 700,
                    }}
                  >
                    {clippingDisplayModeLabels[mode]}
                  </button>
                ))}
              </div>
            </div>
            <label style={{ display: 'grid', gap: 6, color: '#d1d5db', fontSize: 12 }}>
              Ось сечения
              <select
                value={sceneSettings.clippingAxis}
                onChange={(e) => selectClippingAxis(e.target.value as SceneSettings['clippingAxis'])}
                style={{ minHeight: 32, background: '#111827', color: 'white', border: '1px solid #4b5563', borderRadius: 4 }}
              >
                <option value="x">X</option>
                <option value="y">Y</option>
                <option value="z">Z</option>
              </select>
            </label>
            <label style={{ display: 'grid', gap: 6, color: '#d1d5db', fontSize: 12 }}>
              Положение от центра: {Math.round(sceneSettings.clippingOffset)}
              <input
                type="range"
                min={-clippingSliderLimit}
                max={clippingSliderLimit}
                step={clippingStep}
                value={sceneSettings.clippingOffset}
                onChange={(e) => updateSceneSetting('clippingOffset', Number(e.target.value))}
              />
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
              <button type="button" onClick={() => adjustClippingOffset(-1)} style={sceneToolButtonStyle()}>
                <span>-</span>
                <span style={{ fontSize: 11, marginTop: 4, fontWeight: 'bold', textTransform: 'uppercase' }}>
                  Сдвиг
                </span>
              </button>
              <button type="button" onClick={cycleClippingAxis} style={sceneToolButtonStyle()}>
                <span>{sceneSettings.clippingAxis.toUpperCase()}</span>
                <span style={{ fontSize: 11, marginTop: 4, fontWeight: 'bold', textTransform: 'uppercase' }}>
                  Ось
                </span>
              </button>
              <button type="button" onClick={() => adjustClippingOffset(1)} style={sceneToolButtonStyle()}>
                <span>+</span>
                <span style={{ fontSize: 11, marginTop: 4, fontWeight: 'bold', textTransform: 'uppercase' }}>
                  Сдвиг
                </span>
              </button>
            </div>
            <button
              type="button"
              onClick={() => {
                setSectionLineMode(true);
                setSectionLinePoints([]);
                setShowClippingPanel(false);
              }}
              style={{
                minHeight: 42,
                border: '1px solid #60a5fa',
                borderRadius: 6,
                background: sectionLineMode ? '#2563eb' : 'rgba(37, 99, 235, 0.18)',
                color: '#bfdbfe',
                cursor: 'pointer',
                fontSize: 13,
                fontWeight: 700,
              }}
            >
              Задать линию по двум точкам
            </button>
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => setSceneTreeOpen((open) => !open)}
        style={{
          position: 'absolute',
          top: TOP_FRAME_HEIGHT + 10,
          right: sceneTreeOpen ? SCENE_TREE_WIDTH : 0,
          zIndex: 32,
          width: 26,
          height: 58,
          borderRadius: '6px 0 0 6px',
          border: '1px solid rgba(75, 85, 99, 0.75)',
          borderRight: 'none',
          background: '#111827',
          color: '#e5e7eb',
          cursor: 'pointer',
          transition: 'right 180ms ease',
          boxShadow: '-4px 4px 12px rgba(0,0,0,0.25)',
        }}
        data-ui-control="true"
        title={sceneTreeOpen ? 'Скрыть объекты' : 'Показать объекты'}
      >
        {sceneTreeOpen ? '›' : '‹'}
      </button>

      <div
        style={{
          position: 'absolute',
          top: TOP_FRAME_HEIGHT,
          right: 0,
          bottom: BOTTOM_FRAME_HEIGHT,
          zIndex: 21,
          width: SCENE_TREE_WIDTH,
          display: 'grid',
          gridTemplateRows: 'auto 1fr auto',
          gap: 10,
          padding: 10,
          borderRadius: 0,
          color: '#e5e7eb',
          transform: sceneTreeOpen ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 180ms ease',
          ...panelGlassStyle,
        }}
        data-ui-control="true"
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <div>
            <div style={sectionLabelStyle}>Scene Tree</div>
            <h3 style={{ margin: '2px 0 0', fontSize: 18, lineHeight: 1.15 }}>Объекты</h3>
          </div>
          <button type="button" onClick={openModelFilePicker} style={{ ...textButtonStyle, minHeight: 34 }}>
            Импорт
          </button>
        </div>
        <div style={{ minHeight: 0, overflowY: 'auto', paddingRight: 2 }}>
          <ModelList
            selectedModelId={effectiveSelectedModelId}
            onSelectModel={setSelectedModelId}
            onModelContextMenu={handleModelContextMenu}
          />
        </div>
        <div
          style={{
            borderTop: '1px solid rgba(75, 85, 99, 0.75)',
            paddingTop: 12,
            display: 'grid',
            gap: 8,
          }}
        >
          <div style={sectionLabelStyle}>Properties</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 6, fontSize: 12, color: '#cbd5e1' }}>
            <span>Выбранный объект</span>
            <strong style={{ color: '#f8fafc', textAlign: 'right' }}>
              {models.find((model) => model.id === effectiveSelectedModelId)?.name || '—'}
            </strong>
            <span>Кол-во моделей</span>
            <strong style={{ color: '#f8fafc', textAlign: 'right' }}>{models.length}</strong>
            <span>Привязка к сетке</span>
            <strong style={{ color: '#fbbf24', textAlign: 'right' }}>Snap</strong>
          </div>
        </div>
      </div>

      <div
        style={{
          position: 'absolute',
          left: LEFT_FRAME_WIDTH + RULER_THICKNESS,
          right: rightFrameInset,
          bottom: 0,
          zIndex: 22,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          minHeight: BOTTOM_FRAME_HEIGHT,
          padding: '6px 8px',
          borderRadius: 0,
          color: '#e5e7eb',
          transition: 'right 180ms ease',
          ...panelGlassStyle,
        }}
        data-ui-control="true"
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={sectionLabelStyle}>Окружение</span>
          <button
            type="button"
            onClick={toggleBackground}
            style={sceneToolButtonStyle(sceneSettings.backgroundColor === '#ffffff', true)}
            title="Фон"
          >
            <span>{sceneSettings.backgroundColor === '#ffffff' ? '□' : '■'}</span>
            <span style={{ fontSize: 7, marginTop: 2, fontWeight: 800 }}>Фон</span>
          </button>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#cbd5e1' }}>
            Свет
            <input
              type="range"
              min="0.2"
              max="2"
              step="0.1"
              value={sceneSettings.lightIntensity}
              onChange={(e) => updateSceneSetting('lightIntensity', Number(e.target.value))}
              style={{ width: 96 }}
            />
            <span style={{ width: 26 }}>{sceneSettings.lightIntensity.toFixed(1)}</span>
          </label>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={sectionLabelStyle}>Отрисовка</span>
          {(['solid', 'wireframe', 'xray'] as SurfaceMode[]).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => updateSceneSetting('surfaceMode', mode)}
              style={{
                ...textButtonStyle,
                minHeight: 30,
                background: sceneSettings.surfaceMode === mode ? '#2563eb' : '#1f2937',
                borderColor: sceneSettings.surfaceMode === mode ? '#60a5fa' : 'rgba(75, 85, 99, 0.8)',
              }}
            >
              {mode === 'solid' ? 'Поверхность' : mode === 'wireframe' ? 'Каркас' : 'Точки'}
            </button>
          ))}
        </div>
      </div>

      {contextMenu && (
        <div
          style={{
            position: 'fixed',
            left: contextMenu.x,
            top: contextMenu.y,
            zIndex: 60,
            minWidth: 160,
            padding: 6,
            borderRadius: 8,
            color: '#e5e7eb',
            ...panelGlassStyle,
          }}
          data-ui-control="true"
        >
          <button
            type="button"
            style={{ ...textButtonStyle, width: '100%', justifyContent: 'flex-start', marginBottom: 4 }}
            onClick={() => {
              updateModel(contextMenu.model.id, { visible: false });
              setContextMenu(null);
            }}
          >
            Скрыть
          </button>
          <button
            type="button"
            style={{ ...textButtonStyle, width: '100%', justifyContent: 'flex-start', marginBottom: 4 }}
            onClick={() => {
              updateModel(contextMenu.model.id, { visible: true });
              frameModels([{ ...contextMenu.model, visible: true }]).catch(() => {});
              setContextMenu(null);
            }}
          >
            Фокус на объекте
          </button>
          <button
            type="button"
            style={{ ...textButtonStyle, width: '100%', justifyContent: 'flex-start', color: '#fecaca' }}
            onClick={() => {
              removeModel(contextMenu.model.id);
              setContextMenu(null);
            }}
          >
            Удалить
          </button>
        </div>
      )}

      {dragActive && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 55,
            display: 'grid',
            placeItems: 'center',
            background: 'rgba(15, 23, 42, 0.5)',
            color: '#dbeafe',
            fontSize: 22,
            fontWeight: 800,
            pointerEvents: 'none',
          }}
        >
          Перетащите STL / OBJ / PLY сюда
        </div>
      )}

      {shareNotice && (
        <div
          style={{
            position: 'absolute',
            top: TOP_FRAME_HEIGHT + 12,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 80,
            minWidth: 220,
            padding: '10px 14px',
            borderRadius: 8,
            background: '#0f172a',
            border: '1px solid #38bdf8',
            color: '#e0f2fe',
            boxShadow: '0 10px 24px rgba(0,0,0,0.35)',
            fontSize: 14,
            fontWeight: 800,
            textAlign: 'center',
            pointerEvents: 'none',
          }}
        >
          {shareNotice}
          <div style={{ marginTop: 3, color: '#bae6fd', fontSize: 11, fontWeight: 600 }}>
            Откройте ее в браузере или отправьте коллеге
          </div>
        </div>
      )}

      {/* Tool hint */}
      {activeTool !== 'none' && (
        <div
          data-ui-control="true"
          style={{
            position: 'absolute',
            top: 80,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 20,
            padding: '4px 16px',
            backgroundColor: 'rgba(37, 99, 235, 0.2)',
            border: '1px solid rgba(59, 130, 246, 0.5)',
            borderRadius: 8,
            color: '#bfdbfe',
            fontSize: 12,
            fontWeight: 'bold',
            textAlign: 'center',
            pointerEvents: 'auto',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <span>
            {activeTool === 'text' && currentPoints.length === 0 && 'Нажмите точку для привязки заметки'}
            {activeTool === 'text' && currentPoints.length === 1 && 'Нажмите вторую точку для текста'}
            {activeTool === 'ruler' &&
              (currentPoints.length === 0
                ? 'Нажмите точки ломаной'
                : 'Enter или Готово завершит измерение')}
            {activeTool !== 'text' && activeTool !== 'ruler' && `Инструмент: ${
              { ruler: 'Линейка', angle: 'Угол', circle: 'Окружность', brush: 'Кисть', text: 'Текст' }[activeTool]
            }`}
          </span>
          {activeTool === 'ruler' && currentPoints.length >= 2 && (
            <button
              type="button"
              onClick={() => finishRuler(currentPoints)}
              style={{
                height: 26,
                padding: '0 10px',
                borderRadius: 6,
                border: '1px solid rgba(147, 197, 253, 0.75)',
                background: '#2563eb',
                color: '#eff6ff',
                fontSize: 12,
                fontWeight: 800,
                cursor: 'pointer',
              }}
            >
              Готово
            </button>
          )}
        </div>
      )}
      {sectionLineMode && (
        <div
          style={{
            position: 'absolute',
            top: 80,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 20,
            padding: '4px 16px',
            backgroundColor: 'rgba(34, 197, 94, 0.2)',
            border: '1px solid rgba(34, 197, 94, 0.55)',
            borderRadius: 20,
            color: '#bbf7d0',
            fontSize: 12,
            fontWeight: 'bold',
            textAlign: 'center',
            pointerEvents: 'none',
            backdropFilter: 'blur(4px)',
          }}
        >
          {sectionLinePoints.length === 0 ? 'Укажите первую точку линии сечения' : 'Укажите вторую точку линии сечения'}
        </div>
      )}

      <RulerOverlay
        drawings={drawings}
        textNotes={textNotes}
        activeTool={activeTool}
        currentPoints={currentPoints}
        svgRef={svgRef}
        sectionLinePoints={sectionLinePoints}
      />

      <Rulers
        cameraParams={cameraParams}
        viewportRef={viewportRef}
        leftOffset={LEFT_FRAME_WIDTH}
        rightOffset={rightFrameInset}
        topOffset={TOP_FRAME_HEIGHT}
        bottomOffset={BOTTOM_FRAME_HEIGHT}
      />
    </div>
  );
};
