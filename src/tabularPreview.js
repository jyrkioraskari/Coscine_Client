/*
 * Adapted from Tabular's src/services/tabularWorkbook.js at commit
 * 79e84c799dd9eb09eb91a98e6bba3ff40113c256 (Apache-2.0).
 * Modified to return preview-only data for Coscine Client.
 */
import * as XLSX from 'xlsx';
import {
  inferLayeredHeaders,
  looksLikeHeaderRow,
  measurementPreambleLength,
  shouldTransposeTable,
} from './tableLayout.js';

function normalizeCellValue(value) {
  if (value == null) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value);
}

function isEmptyRow(row) {
  return row.every((cell) => normalizeCellValue(cell).trim().length === 0);
}

function getEffectiveColumnCount(row) {
  for (let index = row.length - 1; index >= 0; index -= 1) {
    if (normalizeCellValue(row[index]).trim().length > 0) return index + 1;
  }
  return 0;
}

function readWorksheetRows(worksheet, transpose = false, skipRows = 0) {
  const rows = XLSX.utils.sheet_to_json(worksheet, {
    header: 1,
    blankrows: transpose,
    defval: '',
    raw: false,
  });
  let usableRows;

  if (transpose) {
    let remainingRowsToSkip = skipRows;
    let firstDataIndex = rows.findIndex((row) => !isEmptyRow(row));
    while (firstDataIndex >= 0 && remainingRowsToSkip > 0) {
      firstDataIndex = rows.findIndex((row, index) => index > firstDataIndex && !isEmptyRow(row));
      remainingRowsToSkip -= 1;
    }
    const contiguousRows = firstDataIndex < 0 ? [] : rows.slice(firstDataIndex);
    const initialColumnCount = getEffectiveColumnCount(contiguousRows[0] ?? []);
    const stopIndex = contiguousRows.findIndex(
      (row) => isEmptyRow(row) || getEffectiveColumnCount(row) !== initialColumnCount,
    );
    usableRows = contiguousRows.slice(0, stopIndex < 0 ? contiguousRows.length : stopIndex);
  } else {
    usableRows = rows.filter((row) => Array.isArray(row) && !isEmptyRow(row)).slice(skipRows);
  }

  if (!transpose || usableRows.length === 0) return usableRows;

  const columnCount = usableRows.reduce(
    (maxColumns, row) => Math.max(maxColumns, row.length),
    0,
  );
  return Array.from({ length: columnCount }, (_, columnIndex) =>
    usableRows.map((row) => normalizeCellValue(row[columnIndex])),
  );
}

export function parseTabularPreview(buffer) {
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
  if (workbook.SheetNames.length === 0) {
    return { headers: [], rows: [], rowCount: 0, sheetName: '', layoutNote: '' };
  }

  const analyzedSheets = workbook.SheetNames.map((name) => {
    const sheet = workbook.Sheets[name];
    const rawRows = readWorksheetRows(sheet);
    const parameterRowCount = measurementPreambleLength(rawRows);
    const layeredHeaders = parameterRowCount ? null : inferLayeredHeaders(rawRows);
    const leadingRowCount = parameterRowCount || (layeredHeaders ? layeredHeaders.headerRowIndex : 0);
    const transpose = layeredHeaders ? false : shouldTransposeTable(rawRows.slice(leadingRowCount));
    const effectiveLayeredHeaders = transpose ? null : layeredHeaders;
    const tableRows = readWorksheetRows(sheet, transpose, leadingRowCount);
    const hasHeader = Boolean(effectiveLayeredHeaders) || looksLikeHeaderRow(tableRows);
    const columnCount = tableRows.reduce(
      (maxColumns, row) => Math.max(maxColumns, row.length),
      0,
    );
    const headers = Array.from({ length: columnCount }, (_, index) =>
      hasHeader
        ? effectiveLayeredHeaders?.headers[index] ||
          normalizeCellValue(tableRows[0]?.[index]).trim() || `Column ${index + 1}`
        : `Column ${index + 1}`,
    );

    return {
      name,
      rawRows,
      tableRows,
      headers,
      firstDataRow: hasHeader ? 1 : 0,
      hasHeader,
      transpose,
      parameterRowCount,
      layeredHeaders: effectiveLayeredHeaders,
    };
  });

  const firstSheet = analyzedSheets[0];
  const firstSheetLooksLikeReport =
    firstSheet.rawRows[0]?.filter((cell) => normalizeCellValue(cell).trim()).length <= 1 &&
    !firstSheet.hasHeader && !firstSheet.layeredHeaders;
  const selectedSheet = firstSheetLooksLikeReport
    ? analyzedSheets.slice(1)
      .filter((sheet) =>
        sheet.rawRows.length > firstSheet.rawRows.length * 2 &&
        (sheet.hasHeader || sheet.layeredHeaders),
      )
      .sort((a, b) => b.tableRows.length - a.tableRows.length)[0] || firstSheet
    : firstSheet;

  const {
    name: sheetName,
    tableRows,
    headers,
    firstDataRow,
    transpose,
    parameterRowCount,
    layeredHeaders,
  } = selectedSheet;
  const layoutNote = parameterRowCount
    ? `${parameterRowCount} measurement settings before data`
    : layeredHeaders
      ? `${layeredHeaders.headerRowIndex} header rows interpreted`
      : transpose
        ? 'Rows rotated into columns automatically'
        : '';
  const rowCount = Math.max(tableRows.length - firstDataRow, 0);
  const rows = tableRows.slice(firstDataRow).map((row) =>
    headers.map((_, index) => normalizeCellValue(row[index])),
  );

  return { headers, rows, rowCount, sheetName, layoutNote };
}
