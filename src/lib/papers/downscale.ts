/** Long-edge cap. Handwriting stays legible well below a phone's full sensor. */
export const MAX_SCAN_EDGE_PX = 1600;
export const SCAN_JPEG_QUALITY = 0.8;

/**
 * Downscale a photographed page to a JPEG before it is uploaded.
 *
 * A modern phone camera produces 3-5 MB per shot, and a paper can be twelve
 * pages. Left alone that is a slow upload on school wifi, a bucket that grows
 * far faster than it needs to, and -- because transcription inlines each image
 * as base64 -- a vision request several times larger than it has to be for no
 * gain in readability.
 *
 * Browser-only: it needs createImageBitmap and a canvas.
 */
export async function downscaleToJpeg(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);

  try {
    const scale = Math.min(1, MAX_SCAN_EDGE_PX / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext('2d');
    if (!context) return file;

    // Photographs of paper are mostly white; without this the JPEG picks up
    // black wherever the source had transparency (a PNG screenshot, say).
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, width, height);
    context.drawImage(bitmap, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, 'image/jpeg', SCAN_JPEG_QUALITY);
    });

    return blob ?? file;
  } finally {
    bitmap.close();
  }
}
