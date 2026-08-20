// ---------------------------------------------------------------------------
// PDF text extraction. Produces positioned text items so downstream parsers can
// reason about table columns — bank statements encode meaning in x-position
// (withdrawal vs deposit are both positive numbers; only the column tells them
// apart), so a plain text dump is not enough.
// ---------------------------------------------------------------------------

let pdfjsPromise = null;

// Loaded lazily: pdf.js is large and only needed when a PDF is actually opened.
async function getPdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = (async () => {
      const pdfjs = await import("pdfjs-dist");
      const workerUrl = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
      pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
      return pdfjs;
    })();
  }
  return pdfjsPromise;
}

/**
 * @param {ArrayBuffer} buffer
 * @returns {Promise<Array<{pageNumber:number, width:number, height:number, items:Array}>>}
 */
export async function extractPages(buffer, { getDocument } = {}) {
  const load = getDocument || (await getPdfjs()).getDocument;
  const doc = await load({ data: new Uint8Array(buffer), useSystemFonts: true }).promise;
  const pages = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const viewport = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();
    const items = [];
    for (const it of content.items) {
      const str = (it.str || "").trim();
      if (!str) continue;
      const x = it.transform[4];
      const y = it.transform[5];
      items.push({
        str,
        x: Math.round(x * 10) / 10,
        y: Math.round(y * 10) / 10,
        width: Math.round((it.width || 0) * 10) / 10,
        right: Math.round((x + (it.width || 0)) * 10) / 10,
        center: Math.round((x + (it.width || 0) / 2) * 10) / 10,
      });
    }
    pages.push({ pageNumber: p, width: viewport.width, height: viewport.height, items });
    page.cleanup();
  }
  return pages;
}

/**
 * Groups a page's items into visual rows. Items on one printed line can differ
 * slightly in baseline y (e.g. 520.3 vs 520.8), so cluster with a tolerance.
 */
export function buildRows(items, tolerance = 3) {
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);
  const rows = [];
  let current = null;
  for (const it of sorted) {
    if (!current || Math.abs(current.y - it.y) > tolerance) {
      current = { y: it.y, items: [it] };
      rows.push(current);
    } else {
      current.items.push(it);
    }
  }
  for (const row of rows) row.items.sort((a, b) => a.x - b.x);
  return rows;
}
