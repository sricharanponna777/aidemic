import { MAX_SCAN_EDGE_PX, SCAN_JPEG_QUALITY } from './downscale';

/**
 * Render a PDF of written answers to the same JPEGs a phone photo becomes.
 *
 * Scanner apps on a school photocopier hand out a PDF, not a camera roll, and
 * every layer below the upload only ever deals in images: the bucket allows
 * three image mime types, the attach route insists on a `.jpg` path, and
 * transcription inlines each page as a `data:image/...` part. So the PDF is
 * flattened here, in the browser, and nothing downstream learns it existed.
 *
 * Browser-only: it needs a canvas and pdf.js's worker.
 */

/** Some browsers hand over an empty `type` for a file picked from a network
 *  share, so the extension is checked too. */
export const isPdf = (file: File) =>
  file.type === 'application/pdf' || /\.pdf$/i.test(file.name);

/** A PDF page is vector, so rendering above 1:1 is what makes small type
 *  legible rather than wasted pixels — but a poster-sized page should not be
 *  blown up without limit either. */
const MAX_RENDER_SCALE = 4;

export class PdfPageLimitError extends Error {}

export type PdfRenderResult = {
  pages: Blob[];
  /** 1-based numbers of pages that rendered to nothing. See `isBlank`. */
  blankPageNumbers: number[];
};

/**
 * Did this page render to bare paper?
 *
 * pdf.js decodes JBIG2 and JPEG 2000 — the codecs some office scanners choose
 * for bilevel scans — through WebAssembly, which this app's CSP does not allow
 * (`script-src` carries neither 'unsafe-eval' nor 'wasm-unsafe-eval'). pdf.js
 * warns to the console and leaves the image out, so the page comes back white
 * rather than failing. Silently marking a blank transcript as zero is the one
 * outcome worth going out of the way to avoid, so it is caught and reported.
 *
 * Every 16th pixel is enough: a page with any writing on it fails the test
 * within the first few rows of ink.
 */
const isBlank = (context: CanvasRenderingContext2D, width: number, height: number) => {
  const { data } = context.getImageData(0, 0, width, height);
  for (let offset = 0; offset < data.length; offset += 4 * 16) {
    if (data[offset] < 240 || data[offset + 1] < 240 || data[offset + 2] < 240) return false;
  }
  return true;
};

let workerConfigured = false;

export async function pdfToJpegPages(file: File, maxPages: number): Promise<PdfRenderResult> {
  // Dynamically imported: pdf.js is over a megabyte, and a student who only
  // ever photographs their pages should never download it.
  const pdfjs = await import('pdfjs-dist');

  if (!workerConfigured) {
    // Resolved through the bundler so the worker is emitted as a same-origin
    // asset. A cross-origin or blob: worker would be blocked outright — the
    // CSP has no `worker-src`, so workers fall back to `default-src 'self'`.
    pdfjs.GlobalWorkerOptions.workerSrc = new URL(
      'pdfjs-dist/build/pdf.worker.min.mjs',
      import.meta.url,
    ).toString();
    workerConfigured = true;
  }

  // `destroy()` lives on the loading task, not the document proxy: it is what
  // tears the worker down, so the task has to outlive the render loop.
  const loadingTask = pdfjs.getDocument({ data: await file.arrayBuffer() });
  const document_ = await loadingTask.promise;

  try {
    if (document_.numPages > maxPages) {
      throw new PdfPageLimitError(
        `“${file.name}” has ${document_.numPages} pages, and there is only room for ${maxPages}.`,
      );
    }

    const pages: Blob[] = [];
    const blankPageNumbers: number[] = [];

    for (let pageNumber = 1; pageNumber <= document_.numPages; pageNumber += 1) {
      const page = await document_.getPage(pageNumber);
      const unscaled = page.getViewport({ scale: 1 });
      const scale = Math.min(
        MAX_RENDER_SCALE,
        MAX_SCAN_EDGE_PX / Math.max(unscaled.width, unscaled.height),
      );
      const viewport = page.getViewport({ scale });

      const canvas = window.document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(viewport.width));
      canvas.height = Math.max(1, Math.round(viewport.height));
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context) throw new Error('This browser cannot render a PDF. Photograph your pages instead.');

      // A PDF page has no background of its own; without this the JPEG comes
      // out black wherever the page was simply left blank.
      await page.render({ canvas, viewport, background: '#ffffff' }).promise;
      page.cleanup();

      if (isBlank(context, canvas.width, canvas.height)) blankPageNumbers.push(pageNumber);

      const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob(resolve, 'image/jpeg', SCAN_JPEG_QUALITY);
      });
      if (!blob) throw new Error(`Could not read page ${pageNumber} of “${file.name}”.`);
      pages.push(blob);
    }

    return { pages, blankPageNumbers };
  } finally {
    await loadingTask.destroy();
  }
}
