import type { ViewerData, SceneState } from '../types';

const toBase64Url = (base64: string) => base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const fromBase64Url = (base64Url: string) => {
  let sanitized = base64Url.replace(/\s/g, '').replace(/-/g, '+').replace(/_/g, '/');
  while (sanitized.length % 4 !== 0) sanitized += '=';
  return sanitized;
};

const bytesToBase64 = (bytes: Uint8Array) => {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.slice(i, i + chunkSize));
  }
  return btoa(binary);
};

const base64ToBytes = (base64: string) => Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));

export const encodeJsonToBase64Url = (value: unknown): string => {
  const json = JSON.stringify(value);
  return toBase64Url(bytesToBase64(new TextEncoder().encode(json)));
};

export const decodeJsonFromBase64Url = <T>(base64String: string): T | null => {
  try {
    const decoded = new TextDecoder().decode(base64ToBytes(fromBase64Url(base64String)));
    const json = decoded.trim().startsWith('%') ? decodeURIComponent(decoded) : decoded;
    return JSON.parse(json) as T;
  } catch (primaryError) {
    try {
      const legacy = atob(fromBase64Url(base64String));
      const json = decodeURIComponent(legacy);
      return JSON.parse(json) as T;
    } catch {
      console.error('Ошибка декодирования данных из URL:', primaryError);
      return null;
    }
  }
};

// Декодирование данных от МИС/внешней системы.
export const parseViewerData = (base64String: string): ViewerData | null =>
  decodeJsonFromBase64Url<ViewerData>(base64String);

// Кодирование состояния сцены.
export const encodeState = (state: SceneState): string => encodeJsonToBase64Url(state);

// Декодирование состояния сцены.
export const decodeState = (base64String: string): SceneState | null =>
  decodeJsonFromBase64Url<SceneState>(base64String);

// Алиасы для совместимости с остальным кодом.
export const encodeStateToBase64 = encodeState;
export const decodeStateFromBase64 = decodeState;
