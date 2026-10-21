/*
 * CSV/TSV parsing for Coscine Client.
 * Layout inference is provided by the Apache-2.0 Tabular adaptation documented
 * in THIRD_PARTY_PROVENANCE.md.
 */
import {
  inferLayeredHeaders,
  looksLikeHeaderRow,
  measurementPreambleLength,
  shouldTransposeTable,
} from './tableLayout.js';

function cellText(value) {
  return value == null ? '' : String(value);
}

function isEmptyRow(row) {
  return row.every((cell) => cellText(cell).trim() === '');
}

function effectiveColumnCount(row) {
  for (let index = row.length - 1; index >= 0; index -= 1) {
    if (cellText(row[index]).trim()) return index + 1;
  }
  return 0;
}

function parseDelimitedRows(text, delimiter) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];

    if (quoted) {
      if (character === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        field += character;
      }
      continue;
    }

    if (character === '"') {
      quoted = true;
    } else if (character === delimiter) {
      row.push(field);
      field = '';
    } else if (character === '\n' || character === '\r') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      if (character === '\r' && text[index + 1] === '\n') index += 1;
    } else {
      field += character;
    }
  }

  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }

  if (rows[0]?.[0]?.charCodeAt(0) === 0xfeff) {
    rows[0][0] = rows[0][0].slice(1);
  }

  return rows;
}

function findRecordRanges(text, delimiter) {
  const ranges = [];
  let recordStart = 0;
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '"') {
      if (quoted && text[index + 1] === '"') index += 1;
      else quoted = !quoted;
      continue;
    }

    if (!quoted && (character === '\n' || character === '\r')) {
      if (recordHasContent(text, recordStart, index, delimiter)) {
        ranges.push([recordStart, index]);
      }
      if (character === '\r' && text[index + 1] === '\n') index += 1;
      recordStart = index + 1;
    }
  }

  if (recordStart < text.length && recordHasContent(text, recordStart, text.length, delimiter)) {
    ranges.push([recordStart, text.length]);
  }

  return ranges;
}

function recordHasContent(text, start, end, delimiter) {
  for (let index = start; index < end; index += 1) {
    const character = text[index];
    if (!/\s/.test(character) && character !== '"' && character !== delimiter) return true;
  }
  return false;
}

function parseRecordRanges(text, ranges, delimiter) {
  return ranges.map(([start, end]) => parseDelimitedRows(text.slice(start, end), delimiter)[0] ?? []);
}

function delimiterScore(text, delimiter) {
  const counts = [];
  let count = 0;
  let quoted = false;

  for (let index = 0; index < text.length && counts.length < 20; index += 1) {
    const character = text[index];
    if (character === '"') {
      if (quoted && text[index + 1] === '"') index += 1;
      else quoted = !quoted;
    } else if (!quoted && character === delimiter) {
      count += 1;
    } else if (!quoted && (character === '\n' || character === '\r')) {
      if (count > 0) counts.push(count);
      count = 0;
      if (character === '\r' && text[index + 1] === '\n') index += 1;
    }
  }

  if (count > 0 && counts.length < 20) counts.push(count);
  if (!counts.length) return 0;

  const frequencies = new Map();
  for (const value of counts) frequencies.set(value, (frequencies.get(value) ?? 0) + 1);
  const [columnCount, frequency] = Array.from(frequencies.entries())
    .sort((left, right) => right[1] - left[1] || right[0] - left[0])[0];
  return frequency * 100 + columnCount;
}

function detectDelimiter(text, path) {
  if (/\.tsv$/i.test(path)) return '\t';

  return [',', ';', '\t', '|']
    .map((delimiter) => ({ delimiter, score: delimiterScore(text, delimiter) }))
    .sort((left, right) => right.score - left.score)[0]?.delimiter ?? ',';
}

function transposeRows(rows) {
  const usableRows = rows.filter((row) => !isEmptyRow(row));
  const columnCount = usableRows.reduce(
    (maximum, row) => Math.max(maximum, effectiveColumnCount(row)),
    0,
  );
  return Array.from({ length: columnCount }, (_, columnIndex) =>
    usableRows.map((row) => cellText(row[columnIndex])),
  );
}

export function parseDelimitedPreview(text, path = '') {
  const delimiter = detectDelimiter(text, path);
  const recordRanges = findRecordRanges(text, delimiter);
  const sampleRows = parseRecordRanges(text, recordRanges.slice(0, 40), delimiter);
  const parameterRowCount = measurementPreambleLength(sampleRows);
  const layeredHeaders = parameterRowCount ? null : inferLayeredHeaders(sampleRows);
  const leadingRowCount = parameterRowCount || (layeredHeaders ? layeredHeaders.headerRowIndex : 0);
  const transpose = layeredHeaders ? false : shouldTransposeTable(sampleRows.slice(leadingRowCount));
  const tableRows = transpose
    ? transposeRows(parseRecordRanges(text, recordRanges.slice(leadingRowCount), delimiter))
    : sampleRows.slice(leadingRowCount);
  const effectiveLayeredHeaders = transpose ? null : layeredHeaders;
  const hasHeader = Boolean(effectiveLayeredHeaders) || looksLikeHeaderRow(tableRows);
  const columnCount = tableRows.reduce(
    (maximum, row) => Math.max(maximum, effectiveColumnCount(row)),
    0,
  );
  const headers = Array.from({ length: columnCount }, (_, index) =>
    hasHeader
      ? effectiveLayeredHeaders?.headers[index]
        || cellText(tableRows[0]?.[index]).trim()
        || `Column ${index + 1}`
      : `Column ${index + 1}`,
  );
  const firstDataRow = hasHeader ? 1 : 0;
  const layoutNote = parameterRowCount
    ? `${parameterRowCount} measurement settings before data`
    : effectiveLayeredHeaders
      ? `${effectiveLayeredHeaders.headerRowIndex} header rows interpreted`
      : transpose
        ? 'Rows rotated into columns automatically'
        : '';

  if (transpose) {
    const rows = tableRows.slice(firstDataRow).map((row) =>
      headers.map((_, index) => cellText(row[index])),
    );
    return {
      delimiter,
      headers,
      rows,
      rowCount: rows.length,
      sheetName: path.split('/').pop() || '',
      layoutNote,
    };
  }

  const dataRanges = recordRanges.slice(leadingRowCount + firstDataRow);
  const getPage = (pageNumber, pageSize) => {
    const start = Math.max(0, pageNumber - 1) * pageSize;
    return parseRecordRanges(text, dataRanges.slice(start, start + pageSize), delimiter).map((row) =>
      headers.map((_, index) => cellText(row[index])),
    );
  };

  return {
    delimiter,
    getPage,
    headers,
    rows: getPage(1, 100),
    rowCount: dataRanges.length,
    sheetName: path.split('/').pop() || '',
    layoutNote,
  };
}
