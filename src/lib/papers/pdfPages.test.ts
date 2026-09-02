import { describe, expect, it } from 'vitest';
import { isPdf } from './pdfPages';

/** The real render path needs a canvas and pdf.js's worker, so it belongs in a
 *  browser rather than here. What is worth pinning is the branch that decides
 *  whether a file goes down that path at all: send a photo to pdf.js and it
 *  throws InvalidPDFException; send a PDF to `downscaleToJpeg` and
 *  `createImageBitmap` throws. Either way the upload fails. */
const asFile = (name: string, type: string) => ({ name, type }) as File;

describe('isPdf', () => {
  it('recognises a PDF by mime type', () => {
    expect(isPdf(asFile('answers.pdf', 'application/pdf'))).toBe(true);
  });

  // Files picked from a network share or some scanner apps arrive with no
  // type at all, which would otherwise send a PDF to createImageBitmap.
  it('falls back to the extension when the browser gives no type', () => {
    expect(isPdf(asFile('answers.pdf', ''))).toBe(true);
    expect(isPdf(asFile('ANSWERS.PDF', ''))).toBe(true);
  });

  it('leaves photographs on the image path', () => {
    expect(isPdf(asFile('IMG_0421.jpg', 'image/jpeg'))).toBe(false);
    expect(isPdf(asFile('page1.png', 'image/png'))).toBe(false);
    expect(isPdf(asFile('scan.heic', ''))).toBe(false);
  });

  // "notes.pdf.jpg" is a photo, not a PDF.
  it('only matches a trailing .pdf', () => {
    expect(isPdf(asFile('notes.pdf.jpg', 'image/jpeg'))).toBe(false);
  });
});
