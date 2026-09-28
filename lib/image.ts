"use client";
// Decode a user file into RGBA pixels at a bounded working size.

export type Raster = { rgba: Uint8ClampedArray; w: number; h: number };

export async function fileToBitmap(file: Blob): Promise<ImageBitmap | HTMLImageElement> {
  try {
    return await createImageBitmap(file, { imageOrientation: "from-image" } as ImageBitmapOptions);
  } catch {
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.decoding = "async";
      img.src = url;
      await img.decode();
      return img;
    } finally {
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  }
}

export function dims(src: ImageBitmap | HTMLImageElement) {
  const w = "naturalWidth" in src ? src.naturalWidth : src.width;
  const h = "naturalHeight" in src ? src.naturalHeight : src.height;
  return { w, h };
}

/** Resample to fit inside maxSide (never upscales). square=true center-crops first. Alpha is flattened onto white. */
export function rasterize(src: CanvasImageSource & (ImageBitmap | HTMLImageElement), maxSide: number, square = false): Raster {
  const { w: W, h: H } = dims(src);
  let sx = 0, sy = 0, sw = W, sh = H;
  if (square) {
    const s = Math.min(W, H);
    sx = Math.floor((W - s) / 2);
    sy = Math.floor((H - s) / 2);
    sw = sh = s;
  }
  const scale = Math.min(1, maxSide / Math.max(sw, sh));
  const w = Math.max(1, Math.round(sw * scale));
  const h = Math.max(1, Math.round(sh * scale));
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, w, h);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  // two-step downscale for large reductions to limit aliasing
  if (scale < 0.5) {
    const mw = Math.round(sw * scale * 2), mh = Math.round(sh * scale * 2);
    const m = document.createElement("canvas");
    m.width = mw;
    m.height = mh;
    const mctx = m.getContext("2d")!;
    mctx.imageSmoothingQuality = "high";
    mctx.drawImage(src, sx, sy, sw, sh, 0, 0, mw, mh);
    ctx.drawImage(m, 0, 0, mw, mh, 0, 0, w, h);
  } else {
    ctx.drawImage(src, sx, sy, sw, sh, 0, 0, w, h);
  }
  const data = ctx.getImageData(0, 0, w, h).data;
  return { rgba: data, w, h };
}

export function toGray(r: Raster): Float64Array {
  const N = r.w * r.h, g = new Float64Array(N), d = r.rgba;
  for (let i = 0; i < N; i++) g[i] = 0.299 * d[4 * i] + 0.587 * d[4 * i + 1] + 0.114 * d[4 * i + 2];
  return g;
}

export function paint(canvas: HTMLCanvasElement | null, rgba: Uint8ClampedArray, w: number, h: number) {
  if (!canvas) return;
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.putImageData(new ImageData(new Uint8ClampedArray(rgba), w, h), 0, 0);
}

export function thumbnail(source: CanvasImageSource, sw: number, sh: number, max = 64): string {
  const s = Math.min(1, max / Math.max(sw, sh));
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(sw * s));
  c.height = Math.max(1, Math.round(sh * s));
  const ctx = c.getContext("2d")!;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, 0, 0, sw, sh, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", 0.5);
}

export function rgbaCanvas(rgba: Uint8ClampedArray, w: number, h: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  paint(c, rgba, w, h);
  return c;
}

export function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
