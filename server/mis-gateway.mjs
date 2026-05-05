import { createServer } from 'node:http';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PORT = Number(process.env.MIS_GATEWAY_PORT || 4174);
const HOST = process.env.MIS_GATEWAY_HOST || '0.0.0.0';
const STUDIES_ROOT =
  process.env.MIS_STUDIES_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../public');
const ARTIFACT_SUBDIR = process.env.MIS_ARTIFACT_SUBDIR || '';
const SUPPORTED_MODEL_EXTENSIONS = new Set(['.stl', '.obj', '.ply']);

const json = (res, status, payload) => {
  const body = JSON.stringify(payload, null, 2);
  res.writeHead(status, {
    'Content-Type': 'application/json;charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(body);
};

const notFound = (res) => json(res, 404, { error: 'Not found' });

const getMimeType = (filePath) => {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === '.json') return 'application/json;charset=utf-8';
  if (extension === '.png') return 'image/png';
  if (extension === '.obj') return 'text/plain;charset=utf-8';
  return 'application/octet-stream';
};

const getStudyDir = (studyId) => path.resolve(STUDIES_ROOT, studyId);

const resolveInside = (root, relativePath) => {
  const resolved = path.resolve(root, relativePath);
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
    throw new Error('Path traversal is not allowed');
  }
  return resolved;
};

const getPublicBaseUrl = (req) => {
  const host = req.headers.host || `localhost:${PORT}`;
  return `http://${host}`;
};

const findModelFiles = async (studyDir) => {
  const entries = await readdir(studyDir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && SUPPORTED_MODEL_EXTENSIONS.has(path.extname(entry.name).toLowerCase()))
    .map((entry) => entry.name);
};

const readBody = async (req) => {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks);
};

const parseJsonBody = async (req) => {
  const body = await readBody(req);
  if (body.length === 0) return {};
  return JSON.parse(body.toString('utf8'));
};

const extractMultipartFile = (body, contentType) => {
  const boundary = contentType.match(/boundary=([^;]+)/)?.[1];
  if (!boundary) return null;
  const delimiter = Buffer.from(`--${boundary}`);
  const parts = [];
  let start = body.indexOf(delimiter);
  while (start !== -1) {
    start += delimiter.length;
    if (body[start] === 45 && body[start + 1] === 45) break;
    if (body[start] === 13 && body[start + 1] === 10) start += 2;
    const end = body.indexOf(delimiter, start);
    if (end === -1) break;
    parts.push(body.subarray(start, end - 2));
    start = end;
  }

  for (const part of parts) {
    const headerEnd = part.indexOf(Buffer.from('\r\n\r\n'));
    if (headerEnd === -1) continue;
    const headers = part.subarray(0, headerEnd).toString('utf8');
    const name = headers.match(/name="([^"]+)"/)?.[1];
    if (name !== 'file') continue;
    const originalName = headers.match(/filename="([^"]+)"/)?.[1] || `viewer-scene-${Date.now()}.png`;
    return {
      originalName: path.basename(originalName),
      bytes: part.subarray(headerEnd + 4),
    };
  }

  return null;
};

const writeArtifact = async (studyId, fileName, bytes) => {
  const studyDir = getStudyDir(studyId);
  const targetDir = ARTIFACT_SUBDIR ? resolveInside(studyDir, ARTIFACT_SUBDIR) : studyDir;
  await mkdir(targetDir, { recursive: true });
  const targetFile = resolveInside(targetDir, fileName);
  await writeFile(targetFile, bytes);
  return targetFile;
};

const handleManifest = async (req, res, studyId) => {
  const studyDir = getStudyDir(studyId);
  const url = new URL(req.url || '/', getPublicBaseUrl(req));
  const patient = url.searchParams.get('patient') || '';
  const study = url.searchParams.get('study') || studyId;
  const modelFiles = await findModelFiles(studyDir);

  json(res, 200, {
    studyId,
    patient,
    study,
    sourcePath: studyDir,
    outputPath: ARTIFACT_SUBDIR ? path.resolve(studyDir, ARTIFACT_SUBDIR) : studyDir,
    artifactBaseUrl: `${getPublicBaseUrl(req)}/studies/${encodeURIComponent(studyId)}/artifacts`,
    models: modelFiles.map((fileName) => ({
      url: `${getPublicBaseUrl(req)}/studies/${encodeURIComponent(studyId)}/files/${encodeURIComponent(fileName)}`,
      name: path.basename(fileName, path.extname(fileName)),
      group: study,
    })),
  });
};

const handleFile = async (res, studyId, fileName) => {
  const studyDir = getStudyDir(studyId);
  const filePath = resolveInside(studyDir, decodeURIComponent(fileName));
  const bytes = await readFile(filePath);
  res.writeHead(200, {
    'Content-Type': getMimeType(filePath),
    'Access-Control-Allow-Origin': '*',
  });
  res.end(bytes);
};

const handleJsonArtifact = async (req, res, studyId, kind) => {
  const payload = await parseJsonBody(req);
  const savedAt = new Date().toISOString().replace(/[:.]/g, '-');
  const fileName = `viewer-${kind}-${savedAt}.json`;
  const targetFile = await writeArtifact(studyId, fileName, Buffer.from(JSON.stringify(payload, null, 2), 'utf8'));
  json(res, 200, { ok: true, fileName, path: targetFile });
};

const handleScreenshotArtifact = async (req, res, studyId) => {
  const body = await readBody(req);
  const contentType = req.headers['content-type'] || '';
  const file = extractMultipartFile(body, Array.isArray(contentType) ? contentType[0] : contentType);
  if (!file) {
    json(res, 400, { error: 'Multipart field "file" is required' });
    return;
  }

  const savedAt = new Date().toISOString().replace(/[:.]/g, '-');
  const fileName = `viewer-screenshot-${savedAt}-${file.originalName}`;
  const targetFile = await writeArtifact(studyId, fileName, file.bytes);
  json(res, 200, { ok: true, fileName, path: targetFile });
};

const server = createServer(async (req, res) => {
  try {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      });
      res.end();
      return;
    }

    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    const match = url.pathname.match(/^\/studies\/([^/]+)\/(manifest\.json|files\/(.+)|artifacts\/(scene|measurements|screenshot))$/);
    if (!match) {
      notFound(res);
      return;
    }

    const studyId = decodeURIComponent(match[1]);
    const route = match[2];
    if (req.method === 'GET' && route === 'manifest.json') {
      await handleManifest(req, res, studyId);
      return;
    }
    if (req.method === 'GET' && route.startsWith('files/')) {
      await handleFile(res, studyId, match[3]);
      return;
    }
    if (req.method === 'POST' && route === 'artifacts/scene') {
      await handleJsonArtifact(req, res, studyId, 'scene');
      return;
    }
    if (req.method === 'POST' && route === 'artifacts/measurements') {
      await handleJsonArtifact(req, res, studyId, 'measurements');
      return;
    }
    if (req.method === 'POST' && route === 'artifacts/screenshot') {
      await handleScreenshotArtifact(req, res, studyId);
      return;
    }

    notFound(res);
  } catch (error) {
    console.error(error);
    json(res, 500, { error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`MIS gateway listening on http://${HOST}:${PORT}`);
  console.log(`Serving studies from ${STUDIES_ROOT}`);
});
