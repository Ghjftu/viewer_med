import React, { useEffect, useMemo, useState } from 'react';
import { Layout } from './components/UI/Layout';
import { useViewerStore } from './store/useViewerStore';
import { parseViewerData, decodeState } from './utils/base64'; // обычный импорт
import type { MisIntegrationInfo, ModelInput, ModelState, ViewerData } from './types';

const MODEL_COLORS = ['#ef4444', '#3b82f6', '#22c55e', '#eab308', '#a855f7', '#06b6d4', '#f97316'];
const DEFAULT_MODEL_OPACITY = 1;
const DEMO_MODELS: ModelState[] = [
  {
    id: 'demo-liver',
    url: 'liver.stl',
    name: 'Печень',
    color: '#b4533a',
    opacity: 1,
    visible: true,
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
    group: 'Demo',
  },
  {
    id: 'demo-tumor',
    url: 'tumor.stl',
    name: 'Опухоль',
    color: '#ef4444',
    opacity: 1,
    visible: true,
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
    group: 'Demo',
  },
];

const getDefaultModelColor = (index: number) => MODEL_COLORS[index % MODEL_COLORS.length];

const normalizeOpacity = (opacity: unknown) => {
  if (typeof opacity !== 'number' || !Number.isFinite(opacity)) return DEFAULT_MODEL_OPACITY;
  return Math.max(0, Math.min(1, opacity));
};

const getModelNameFromUrl = (url: string) => {
  const fileName = decodeURIComponent(url.split('/').pop()?.split('?')[0] || '3D модель');
  return fileName.replace(/\.[^.]+$/, '') || '3D модель';
};

const normalizeModel = (model: ModelInput, index: number, defaultGroup: string): ModelState => {
  const data = typeof model === 'string' ? { url: model } : model;
  return {
    id: data.id || `url-model-${index + 1}`,
    url: data.url,
    name: data.name || getModelNameFromUrl(data.url),
    color: data.color || getDefaultModelColor(index),
    opacity: normalizeOpacity(data.opacity),
    visible: data.visible ?? true,
    position: data.position || [0, 0, 0],
    rotation: data.rotation || [0, 0, 0],
    scale: data.scale || [1, 1, 1],
    group: data.group || defaultGroup,
  };
};

const normalizeViewerModels = (data: ViewerData) => {
  const inputs: ModelInput[] = data.models?.length ? data.models : data.model ? [data.model] : [];
  return inputs.map((model, index) => normalizeModel(model, index, data.study || 'External'));
};

const isViewerData = (value: unknown): value is ViewerData =>
  Boolean(
    value &&
      typeof value === 'object' &&
      ('model' in value ||
        'models' in value ||
        'patient' in value ||
        'study' in value ||
        'studyId' in value ||
        'artifactBaseUrl' in value)
  );

const getAbsoluteUrl = (url: string) => {
  try {
    return new URL(url, window.location.href).toString();
  } catch {
    return url;
  }
};

const getIntegrationInfoFromViewerData = (data: ViewerData, manifestUrl?: string): MisIntegrationInfo => ({
  studyId: data.studyId,
  sourcePath: data.sourcePath,
  outputPath: data.outputPath,
  artifactBaseUrl: data.artifactBaseUrl,
  manifestUrl: data.manifestUrl || manifestUrl,
});

const getHashParam = (name: string) => {
  const hash = window.location.hash.startsWith('#') ? window.location.hash.slice(1) : window.location.hash;
  return new URLSearchParams(hash).get(name);
};

const getInitialPatientInfo = () => {
  const urlParams = new URLSearchParams(window.location.search);
  const encodedData = urlParams.get('data');
  if (encodedData) {
    const decoded = parseViewerData(encodedData);
    if (decoded) return { name: decoded.patient || '', study: decoded.study || '' };
  }

  const stateParam = urlParams.get('state') || getHashParam('state');
  if (stateParam) {
    const sceneState = decodeState(stateParam);
    if (sceneState?.patientInfo) return sceneState.patientInfo;
  }

  if (!urlParams.get('fileUrl') && !urlParams.get('configUrl') && !urlParams.get('manifestUrl')) {
    return { name: 'Демо-пациент', study: 'Тестовая сцена: печень и опухоль' };
  }

  return undefined;
};

const getInitialIntegrationInfo = (): MisIntegrationInfo | undefined => {
  const urlParams = new URLSearchParams(window.location.search);
  const encodedData = urlParams.get('data');
  if (encodedData) {
    const decoded = parseViewerData(encodedData);
    if (decoded) return getIntegrationInfoFromViewerData(decoded);
  }

  const stateParam = urlParams.get('state') || getHashParam('state');
  if (stateParam) {
    const sceneState = decodeState(stateParam);
    if (sceneState) {
      return {
        studyId: sceneState.studyId,
        sourcePath: sceneState.sourcePath,
        outputPath: sceneState.outputPath,
        artifactBaseUrl: sceneState.artifactBaseUrl,
        manifestUrl: sceneState.manifestUrl,
      };
    }
  }

  return undefined;
};

class ViewerErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'grid',
          placeItems: 'center',
          padding: 24,
          background: '#111827',
          color: '#e5e7eb',
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        <div style={{ maxWidth: 680 }}>
          <h1 style={{ margin: '0 0 12px', color: '#fecaca', fontSize: 24 }}>Не удалось загрузить сцену</h1>
          <p style={{ margin: '0 0 10px', lineHeight: 1.5 }}>
            Проверьте, что URL модели или manifest доступны с этого web-сервера. Для запуска без параметров в
            сборке должны лежать demo-файлы <code>liver.stl</code> и <code>tumor.stl</code>.
          </p>
          <pre
            style={{
              whiteSpace: 'pre-wrap',
              padding: 12,
              borderRadius: 8,
              background: '#0f172a',
              color: '#fca5a5',
              fontSize: 13,
            }}
          >
            {this.state.error.message}
          </pre>
        </div>
      </div>
    );
  }
}

const App: React.FC = () => {
  const { addModel, setModels } = useViewerStore();
  const initialPatientInfo = useMemo(() => getInitialPatientInfo(), []);
  const initialIntegrationInfo = useMemo(() => getInitialIntegrationInfo(), []);
  const [patientInfo, setPatientInfo] = useState<{ name: string; study: string } | undefined>(initialPatientInfo);
  const [integrationInfo, setIntegrationInfo] = useState<MisIntegrationInfo | undefined>(initialIntegrationInfo);

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    console.log('[App] URL search params:', Object.fromEntries(urlParams.entries()));

    // 0. Production-вариант: короткая ссылка на JSON-манифест от МИС.
    const configUrl = urlParams.get('configUrl') || urlParams.get('manifestUrl');
    if (configUrl) {
      const manifestUrl = getAbsoluteUrl(configUrl);
      console.log('[App] Found config URL:', manifestUrl);
      fetch(manifestUrl)
        .then((response) => {
          if (!response.ok) throw new Error(`Config request failed: ${response.status}`);
          return response.json();
        })
        .then((payload: unknown) => {
          if (!isViewerData(payload)) throw new Error('Config JSON has unsupported format');
          setPatientInfo({ name: payload.patient || '', study: payload.study || '' });
          setIntegrationInfo(getIntegrationInfoFromViewerData(payload, manifestUrl));
          const models = normalizeViewerModels(payload);
          if (models.length > 0) setModels(models);
        })
        .catch((error) => console.error('[App] Failed to load configUrl:', error));
      return;
    }

    // 1. Старый формат: ?data=...
    const encodedData = urlParams.get('data');
    if (encodedData) {
      console.log('[App] Found "data" param');
      const decoded: ViewerData | null = parseViewerData(encodedData);
      console.log('[App] Decoded data:', decoded);
      if (decoded) {
        const models = normalizeViewerModels(decoded);
        if (models.length > 0) setModels(models);
      }
      return;
    }

    // 2. Прямая ссылка: ?fileUrl=...
    const fileUrl = urlParams.get('fileUrl');
    if (fileUrl) {
      console.log('[App] Found "fileUrl" param:', fileUrl);
      addModel({
        url: fileUrl,
        name: 'Загруженная модель',
        color: '#ffffff',
        opacity: 1,
        visible: true,
        position: [0, 0, 0],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
        group: 'External',
      });
    }

    // 3. Полная сцена: ?state=...
    const stateParam = urlParams.get('state') || getHashParam('state');
    if (stateParam) {
      console.log('[App] Found "state" param');
      const sceneState = decodeState(stateParam);
      console.log('[App] Decoded scene state:', sceneState);
      if (sceneState?.models) {
        console.log('[App] Setting', sceneState.models.length, 'models from state');
        setModels(sceneState.models);
      }
    }

    // 4. Демо-режим (без параметров)
    if (!encodedData && !fileUrl && !stateParam && !configUrl) {
      console.log('[App] No URL params, loading demo scene');
      setModels(DEMO_MODELS);
    }
  }, [addModel, setModels]);

  return (
    <div style={{ width: '100%', height: '100vh', overflow: 'hidden', backgroundColor: '#111' }}>
      <ViewerErrorBoundary>
        <Layout patientInfo={patientInfo} integrationInfo={integrationInfo} />
      </ViewerErrorBoundary>
    </div>
  );
};

export default App;
