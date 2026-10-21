/*
 * Background file-list preview generation and IndexedDB persistence.
 * This module is original Coscine Client code; no third-party source was copied.
 */

const DATABASE_NAME = 'coscine-client-preview-cache';
const DATABASE_VERSION = 2;
const STORE_NAME = 'file-previews';
const MAX_PREFIX_BYTES = 128 * 1024;
const MAX_TABLE_PREFIX_BYTES = 32 * 1024;
const TABLE_PREVIEW_RECORDS = 6;
const THUMBNAIL_WIDTH = 224;
const THUMBNAIL_HEIGHT = 176;
let databasePromise;

export function filePreviewCacheKey(projectId, resourceId, path) {
  return `${projectId}:${resourceId}:${String(path ?? '').replace(/^\/+/, '')}`;
}

export function filePreviewFingerprint(file, path) {
  const values = [
    path,
    file?.fileSize ?? file?.size ?? file?.contentSize ?? '',
    file?.lastModified ?? file?.modified ?? file?.modifiedAt ?? file?.updatedAt ?? '',
    file?.version ?? file?.eTag ?? file?.etag ?? file?.checksum ?? file?.hash ?? '',
    file?.fileType ?? file?.contentType ?? file?.mimeType ?? '',
  ];
  return values.map((value) => String(value)).join('|');
}

export async function readCachedFilePreviews(descriptors) {
  const database = await openPreviewDatabase();
  if (!database || !descriptors.length) return new Map();

  return new Promise((resolve) => {
    const results = new Map();
    const transaction = database.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);

    for (const descriptor of descriptors) {
      const request = store.get(descriptor.key);
      request.onsuccess = () => {
        const record = request.result;
        if (record?.fingerprint === descriptor.fingerprint && record.blob instanceof Blob) {
          results.set(descriptor.key, record.blob);
        }
      };
    }

    transaction.oncomplete = () => resolve(results);
    transaction.onerror = () => resolve(results);
    transaction.onabort = () => resolve(results);
  });
}

export async function cacheFilePreview({ key, fingerprint, blob }) {
  const database = await openPreviewDatabase();
  if (!database || !(blob instanceof Blob)) return;

  await new Promise((resolve) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    transaction.objectStore(STORE_NAME).put({
      key,
      fingerprint,
      blob,
      cachedAt: Date.now(),
    });
    transaction.oncomplete = resolve;
    transaction.onerror = resolve;
    transaction.onabort = resolve;
  });
}

export async function createFileListPreview({ response, path, kind, contentType }) {
  if (kind === 'image') {
    return createImageThumbnail(await response.blob());
  }

  if (kind === 'tabular' && isDelimitedFile(contentType, path)) {
    const prefix = await readResponsePrefix(response, {
      maxBytes: MAX_TABLE_PREFIX_BYTES,
      maxRecords: TABLE_PREVIEW_RECORDS,
    });
    const { parseDelimitedPreview } = await import('./delimitedPreview.js');
    const preview = parseDelimitedPreview(prefix, path);
    return createTableThumbnail(preview);
  }

  if (kind === 'text') {
    return createTextThumbnail(await readResponsePrefix(response));
  }

  await response.body?.cancel().catch(() => {});
  return createTypeThumbnail(path, kind);
}

export function createTypeThumbnail(path, kind = '') {
  const extension = String(path).split('.').pop()?.slice(0, 5).toUpperCase() || 'FILE';
  const label = kind === 'pdf' ? 'PDF' : extension;
  const color = kind === 'pdf' ? '#c53b45' : '#326b91';
  return svgBlob(`
    <svg xmlns="http://www.w3.org/2000/svg" width="${THUMBNAIL_WIDTH}" height="${THUMBNAIL_HEIGHT}" viewBox="0 0 96 72">
      <rect width="96" height="72" rx="8" fill="#edf3f8"/>
      <path d="M27 10h28l14 14v38H27z" fill="#fff" stroke="#b8c8d8"/>
      <path d="M55 10v14h14" fill="none" stroke="#b8c8d8"/>
      <rect x="18" y="38" width="60" height="22" rx="5" fill="${color}"/>
      <text x="48" y="53" text-anchor="middle" fill="#fff" font-family="system-ui,sans-serif" font-size="11" font-weight="700">${escapeXml(label)}</text>
    </svg>`);
}

async function openPreviewDatabase() {
  if (typeof indexedDB === 'undefined') return null;

  databasePromise ??= new Promise((resolve) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        const store = database.createObjectStore(STORE_NAME, { keyPath: 'key' });
        store.createIndex('cachedAt', 'cachedAt');
        store.createIndex('fingerprint', 'fingerprint');
      } else if (request.oldVersion < 2) {
        request.transaction.objectStore(STORE_NAME).clear();
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  });
  return databasePromise;
}

async function readResponsePrefix(response, { maxBytes = MAX_PREFIX_BYTES, maxRecords = 0 } = {}) {
  if (!response.body?.getReader) {
    const text = (await response.text()).slice(0, maxBytes);
    return maxRecords ? firstCompleteRecords(text, maxRecords) : text;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytesRead = 0;
  let text = '';

  try {
    while (bytesRead < maxBytes) {
      const { done, value } = await reader.read();
      if (done) break;
      const remaining = maxBytes - bytesRead;
      const chunk = value.byteLength > remaining ? value.subarray(0, remaining) : value;
      bytesRead += chunk.byteLength;
      text += decoder.decode(chunk, { stream: bytesRead < maxBytes });
      const completeRecords = maxRecords ? firstCompleteRecords(text, maxRecords) : '';
      if (completeRecords) {
        text = completeRecords;
        break;
      }
      if (value.byteLength > remaining) break;
    }
  } finally {
    await reader.cancel().catch(() => {});
  }

  return text + decoder.decode();
}

function firstCompleteRecords(text, recordLimit) {
  let quoted = false;
  let records = 0;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '"') {
      if (quoted && text[index + 1] === '"') index += 1;
      else quoted = !quoted;
    } else if (!quoted && (character === '\n' || character === '\r')) {
      records += 1;
      if (character === '\r' && text[index + 1] === '\n') index += 1;
      if (records >= recordLimit) return text.slice(0, index + 1);
    }
  }

  return '';
}

async function createImageThumbnail(blob) {
  let source;
  let release = () => {};

  if (typeof createImageBitmap === 'function') {
    source = await createImageBitmap(blob);
    release = () => source.close?.();
  } else {
    const url = URL.createObjectURL(blob);
    source = await loadImage(url);
    release = () => URL.revokeObjectURL(url);
  }

  try {
    const sourceWidth = source.width || source.naturalWidth;
    const sourceHeight = source.height || source.naturalHeight;
    const scale = Math.min(THUMBNAIL_WIDTH / sourceWidth, THUMBNAIL_HEIGHT / sourceHeight, 1);
    const width = Math.max(1, Math.round(sourceWidth * scale));
    const height = Math.max(1, Math.round(sourceHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = THUMBNAIL_WIDTH;
    canvas.height = THUMBNAIL_HEIGHT;
    const context = canvas.getContext('2d');
    context.fillStyle = '#edf3f8';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(source, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height);
    return await canvasToBlob(canvas);
  } finally {
    release();
  }
}

function createTableThumbnail(preview) {
  const headers = preview.headers.slice(0, 4);
  const rows = (preview.getPage ? preview.getPage(1, 4) : preview.rows.slice(0, 4));
  const columns = Math.max(1, headers.length);
  const cellWidth = 88 / columns;
  const cells = [];

  for (let rowIndex = 0; rowIndex < Math.min(5, rows.length + 1); rowIndex += 1) {
    for (let columnIndex = 0; columnIndex < columns; columnIndex += 1) {
      const value = rowIndex === 0 ? headers[columnIndex] : rows[rowIndex - 1]?.[columnIndex];
      const x = 4 + columnIndex * cellWidth;
      const y = 5 + rowIndex * 12;
      cells.push(`<rect x="${x}" y="${y}" width="${cellWidth}" height="12" fill="${rowIndex ? '#fff' : '#d9eaf5'}" stroke="#b8c8d8" stroke-width=".6"/>`);
      if (value) cells.push(`<text x="${x + 2}" y="${y + 8.5}" fill="#365268" font-family="system-ui,sans-serif" font-size="5.5">${escapeXml(String(value).slice(0, 12))}</text>`);
    }
  }

  return svgBlob(`<svg xmlns="http://www.w3.org/2000/svg" width="${THUMBNAIL_WIDTH}" height="${THUMBNAIL_HEIGHT}" viewBox="0 0 96 72"><rect width="96" height="72" rx="8" fill="#edf3f8"/>${cells.join('')}<text x="48" y="68" text-anchor="middle" fill="#326b91" font-family="system-ui,sans-serif" font-size="6" font-weight="700">TABLE</text></svg>`);
}

function createTextThumbnail(text) {
  const lines = String(text).split(/\r?\n/).slice(0, 7);
  const renderedLines = lines.map((line, index) =>
    `<text x="7" y="${11 + index * 8}" fill="#49667d" font-family="monospace" font-size="6">${escapeXml(line.slice(0, 25))}</text>`,
  );
  return svgBlob(`<svg xmlns="http://www.w3.org/2000/svg" width="${THUMBNAIL_WIDTH}" height="${THUMBNAIL_HEIGHT}" viewBox="0 0 96 72"><rect width="96" height="72" rx="8" fill="#edf3f8"/><rect x="4" y="4" width="88" height="64" rx="4" fill="#fff" stroke="#c4d1dc"/>${renderedLines.join('')}</svg>`);
}

function isDelimitedFile(contentType, path) {
  const normalizedType = String(contentType ?? '').split(';')[0].trim().toLowerCase();
  return ['text/csv', 'text/tab-separated-values', 'application/csv'].includes(normalizedType)
    || /\.(csv|tsv)$/i.test(String(path ?? ''));
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('The image could not be decoded.'));
    image.src = url;
  });
}

function canvasToBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('The preview image could not be created.')), 'image/webp', 0.78);
  });
}

function svgBlob(svg) {
  return new Blob([svg.trim()], { type: 'image/svg+xml' });
}

function escapeXml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}
