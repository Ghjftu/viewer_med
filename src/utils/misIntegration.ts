import type { MisIntegrationInfo } from '../types';

export type MisArtifactKind = 'scene' | 'measurements' | 'screenshot';

export interface MeasurementsArtifact {
  patientInfo?: { name: string; study: string };
  studyId?: string;
  sourcePath?: string;
  outputPath?: string;
  drawings: unknown[];
  textNotes: unknown[];
  exportedAt: string;
}

export const hasMisIntegration = (integration?: MisIntegrationInfo | null) =>
  Boolean(getMisArtifactBaseUrl(integration));

export const getMisArtifactBaseUrl = (integration?: MisIntegrationInfo | null) => {
  if (!integration) return null;
  if (integration.artifactBaseUrl) return integration.artifactBaseUrl.replace(/\/+$/, '');
  if (!integration.studyId || !integration.manifestUrl) return null;

  try {
    return new URL(`/studies/${encodeURIComponent(integration.studyId)}/artifacts`, integration.manifestUrl)
      .toString()
      .replace(/\/+$/, '');
  } catch {
    return null;
  }
};

export const getMisArtifactUrl = (integration: MisIntegrationInfo | undefined, kind: MisArtifactKind) => {
  const baseUrl = getMisArtifactBaseUrl(integration);
  return baseUrl ? `${baseUrl}/${kind}` : null;
};

export const postJsonArtifact = async (
  integration: MisIntegrationInfo | undefined,
  kind: Extract<MisArtifactKind, 'scene' | 'measurements'>,
  payload: unknown
) => {
  const url = getMisArtifactUrl(integration, kind);
  if (!url) return false;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) throw new Error(`MIS ${kind} upload failed: ${response.status}`);
  return true;
};

export const postScreenshotArtifact = async (
  integration: MisIntegrationInfo | undefined,
  image: Blob,
  fileName: string,
  metadata: Record<string, unknown>
) => {
  const url = getMisArtifactUrl(integration, 'screenshot');
  if (!url) return false;

  const formData = new FormData();
  formData.append('file', image, fileName);
  formData.append('metadata', JSON.stringify(metadata));

  const response = await fetch(url, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) throw new Error(`MIS screenshot upload failed: ${response.status}`);
  return true;
};
