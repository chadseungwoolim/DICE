"use client";
// ResNet-50 (ImageNet, Keras weights converted to TF.js, float16 storage).
// Loaded on demand only in experiment E3 auto mode.

export const MODEL_URL = "/models/resnet50-f16/model.json";
export const MODEL_MB = 51.4;
export const CAT_CLASSES = [281, 282, 283, 284, 285]; // tabby, tiger cat, Persian, Siamese, Egyptian cat

type TF = typeof import("@tensorflow/tfjs-core");
type Model = import("@tensorflow/tfjs-layers").LayersModel;

let tfRef: TF | null = null;
let model: Model | null = null;
let labels: string[] = [];
let backend = "";

export async function loadClassifier(onProgress?: (f: number) => void): Promise<{ backend: string }> {
  if (model && tfRef) return { backend };
  const tf = await import("@tensorflow/tfjs-core");
  await import("@tensorflow/tfjs-backend-cpu");
  await import("@tensorflow/tfjs-backend-webgl");
  const tfl = await import("@tensorflow/tfjs-layers");
  try {
    await tf.setBackend("webgl");
  } catch {
    await tf.setBackend("cpu");
  }
  await tf.ready();
  backend = tf.getBackend();
  const [m, l] = await Promise.all([
    tfl.loadLayersModel(MODEL_URL, { onProgress }),
    fetch("/models/resnet50-f16/labels.json").then((r) => r.json()),
  ]);
  model = m;
  labels = l;
  tfRef = tf;
  return { backend };
}

export type Prediction = { pcat: number; top1: number; top1Label: string; top5: number[]; ms: number };

/** rgba (w x h) -> centre crop -> 224x224 -> Keras "caffe" preprocessing (BGR, mean subtraction). */
export async function classify(rgba: Uint8ClampedArray, w: number, h: number): Promise<Prediction> {
  if (!model || !tfRef) throw new Error("model not loaded");
  await new Promise((r) => setTimeout(r, 0)); // let the UI paint between predictions
  const t0 = performance.now();
  const src = document.createElement("canvas");
  src.width = w;
  src.height = h;
  src.getContext("2d")!.putImageData(new ImageData(new Uint8ClampedArray(rgba), w, h), 0, 0);
  const c = document.createElement("canvas");
  c.width = 224;
  c.height = 224;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.imageSmoothingQuality = "high";
  const s = Math.min(w, h);
  ctx.drawImage(src, (w - s) / 2, (h - s) / 2, s, s, 0, 0, 224, 224);
  const px = ctx.getImageData(0, 0, 224, 224).data;
  const x = new Float32Array(224 * 224 * 3);
  for (let i = 0, j = 0; i < px.length; i += 4, j += 3) {
    x[j] = px[i + 2] - 103.939;
    x[j + 1] = px[i + 1] - 116.779;
    x[j + 2] = px[i] - 123.68;
  }
  const tf = tfRef;
  const input = tf.tensor4d(x, [1, 224, 224, 3]);
  const out = model.predict(input) as import("@tensorflow/tfjs-core").Tensor;
  const p = (await out.data()) as Float32Array;
  input.dispose();
  out.dispose();
  const idx = Array.from(p.keys()).sort((a, b) => p[b] - p[a]);
  let pcat = 0;
  for (const c2 of CAT_CLASSES) pcat += p[c2];
  return { pcat, top1: idx[0], top1Label: labels[idx[0]] || String(idx[0]), top5: idx.slice(0, 5), ms: performance.now() - t0 };
}
