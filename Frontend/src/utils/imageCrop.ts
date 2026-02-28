export type CropPixels = {
  width: number;
  height: number;
  x: number;
  y: number;
};

async function createImage(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    // Allow cross-origin images (e.g. S3/CDN avatar URLs) so the canvas
    // is not tainted and toBlob() / toDataURL() can succeed.
    image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Failed to load image for cropping'));
    image.src = source;
  });
}

export async function getCroppedImageBlob(
  source: string,
  cropPixels: CropPixels,
  maxSize = 512,
  mimeType = 'image/jpeg',
  quality = 0.92,
): Promise<Blob> {
  const image = await createImage(source);

  const srcCanvas = document.createElement('canvas');
  srcCanvas.width = Math.max(1, Math.floor(cropPixels.width));
  srcCanvas.height = Math.max(1, Math.floor(cropPixels.height));

  const srcCtx = srcCanvas.getContext('2d');
  if (!srcCtx) throw new Error('Unable to initialize crop canvas');

  srcCtx.drawImage(
    image,
    cropPixels.x,
    cropPixels.y,
    cropPixels.width,
    cropPixels.height,
    0,
    0,
    srcCanvas.width,
    srcCanvas.height,
  );

  const outCanvas = document.createElement('canvas');
  outCanvas.width = maxSize;
  outCanvas.height = maxSize;

  const outCtx = outCanvas.getContext('2d');
  if (!outCtx) throw new Error('Unable to initialize output canvas');

  outCtx.drawImage(srcCanvas, 0, 0, maxSize, maxSize);

  return new Promise((resolve, reject) => {
    outCanvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('Failed to generate cropped image'));
        return;
      }
      resolve(blob);
    }, mimeType, quality);
  });
}
