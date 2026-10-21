# Third-party provenance

## Tabular preview

- Component: tabular-data parsing and layout inference used by the file preview
- Upstream project: [jyrkioraskari/Tabular](https://github.com/jyrkioraskari/Tabular)
- Revision: `79e84c799dd9eb09eb91a98e6bba3ff40113c256`
- Upstream files:
  - `src/services/tabularWorkbook.js`
  - `src/services/tableLayout.js`
  - `src/nodes/PreviewTabularDataNode.jsx` (interaction and presentation reference)
- Destination files:
  - `src/delimitedPreview.js`
  - `src/tabularPreview.js`
  - `src/tableLayout.js`
  - Integration and presentation in `src/main.jsx` and `src/styles.css`
- License: Apache License 2.0
- Notice: no upstream `NOTICE` file was present at the inspected revision

The code was adapted into preview-only browser modules. The adaptation adds
lazy loading, integration with Coscine file downloads, paginated rendering,
on-demand CSV/TSV page parsing, a 50 MB browser-preview safety limit, and
presentation within the combined file selection and inspector view. The
original project remains the authoritative source for its code and history.

The background file-list thumbnail cache in `src/filePreviewCache.js` is
original Coscine Client code. It uses the adapted delimited-data parser above
only to turn the first few CSV/TSV records into a small cached table image.

Tabular uses the `xlsx` 0.18.5 package. This adaptation vendors SheetJS Community
Edition 0.20.3 from its official distribution instead, avoiding known security
issues in the npm-registry release while preserving the workbook API used by the
upstream preview. The vendored archive is `vendor/xlsx-0.20.3.tgz` and is covered
by its included Apache License 2.0 terms.

- Official archive: `https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`
- SHA-256: `8dc73fc3b00203e72d176e85b50938627c7b086e607c682e8d3c22c02bb99fe8`
