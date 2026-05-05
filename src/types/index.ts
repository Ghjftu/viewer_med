export type Vector3Tuple = [number, number, number];
export type ModelId = string;

export interface ModelState {
  id: string;
  url: string;
  name: string;
  color: string;
  opacity: number;
  visible: boolean;
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number]; // ← добавлено
  group?: string;
}

export type ModelInput =
  | string
  | {
      id?: string;
      url: string;
      name?: string;
      color?: string;
      opacity?: number;
      visible?: boolean;
      position?: [number, number, number];
      rotation?: [number, number, number];
      scale?: [number, number, number];
      group?: string;
    };

export type SurfaceMode = 'solid' | 'wireframe' | 'xray';
export type ClippingDisplayMode = 'whole' | 'positive' | 'negative';

export interface SceneSettings {
  backgroundColor: string;
  lightIntensity: number;
  surfaceMode: SurfaceMode;
  mirrorX: boolean;
  mirrorY: boolean;
  orientationSystem: 'RAS' | 'LPS';
  clippingEnabled: boolean;
  clippingMode: 'axis' | 'free';
  clippingAxis: 'x' | 'y' | 'z';
  clippingNormal: [number, number, number];
  clippingOffset: number;
  clippingDisplayMode: ClippingDisplayMode;
}

export interface SceneState {
  models: ModelState[];
  patientInfo?: { name: string; study: string };
  studyId?: string;
  sourcePath?: string;
  outputPath?: string;
  artifactBaseUrl?: string;
  manifestUrl?: string;
  drawings?: import('./tools').Drawing[];
  textNotes?: import('./tools').TextNote[];
  sceneSettings?: SceneSettings;
  viewportSize?: { width: number; height: number };
  arcballState?: {
    cameraFar: number;
    cameraMatrix: { elements: number[] };
    cameraNear: number;
    cameraUp: { x: number; y: number; z: number };
    cameraZoom: number;
    gizmoMatrix: { elements: number[] };
    target: number[];
  };
  cameraPosition?: [number, number, number];
  targetPosition?: [number, number, number];
  cameraZoom?: number;
}

export interface ViewerData {
  studyId?: string;
  patient?: string;
  study?: string;
  sourcePath?: string;
  outputPath?: string;
  artifactBaseUrl?: string;
  manifestUrl?: string;
  model?: string;
  models?: ModelInput[];
}

export interface MisIntegrationInfo {
  studyId?: string;
  sourcePath?: string;
  outputPath?: string;
  artifactBaseUrl?: string;
  manifestUrl?: string;
}

export interface CameraParams {
  worldWidth: number;
  worldHeight: number;
  zoom: number;
}
