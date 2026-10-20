"use client";
// Thin promise wrapper around the /core.js Web Worker (SVD + .ak codec).

type Pending = { resolve: (v: any) => void; reject: (e: Error) => void; onProgress?: (p: any) => void };

export class Core {
  private w: Worker;
  private seq = 0;
  private pending = new Map<number, Pending>();

  constructor() {
    this.w = new Worker("/core.js?v=2");
    this.w.onmessage = (e: MessageEvent) => {
      const { id, ok, r, error, progress } = e.data;
      const p = this.pending.get(id);
      if (!p) return;
      if (progress !== undefined) {
        p.onProgress?.(progress);
        return;
      }
      this.pending.delete(id);
      if (ok) p.resolve(r);
      else p.reject(new Error(error));
    };
    this.w.onerror = (e) => {
      const err = new Error(e.message || "worker error");
      this.pending.forEach((p) => p.reject(err));
      this.pending.clear();
    };
  }

  call<T = any>(type: string, p: any, transfer: Transferable[] = [], onProgress?: (p: any) => void): Promise<T> {
    const id = ++this.seq;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve, reject, onProgress });
      this.w.postMessage({ id, type, p }, transfer);
    });
  }

  terminate() {
    this.w.terminate();
    this.pending.clear();
  }
}

let shared: Core | null = null;
/** Long-lived worker for decoding received messages and encoding outgoing ones. */
export function getCore(): Core {
  if (!shared) shared = new Core();
  return shared;
}

/** Fixed settings of the sharing flow (measured: 384 px, k = 16, k_c = 4, 5 bit ≈ 4–5 KB, PSNR 20–27 dB). */
export const IMAGE_AUTO = { size: 384, k: 16, kc: 4, bits: 5, mono: false };

export type VideoResult = {
  bytes: Uint8Array;
  rgba: Uint8ClampedArray;
  w: number;
  h: number;
  frames: number;
  fps: number;
  ranks: number[];
  rmse: number;
  psnr: number;
};
export type VideoDecoded = { rgba: Uint8ClampedArray; w: number; h: number; frames: number; fps: number; nch: number; ranks: number[] };

export type EncodeResult = {
  bytes: Uint8Array;
  rgba: Uint8ClampedArray;
  w: number;
  h: number;
  k: number;
  kc: number;
  bits: number;
  mono: boolean;
  rmse: number;
  psnr: number;
  energy: number;
  params: number;
  rawBytes: number;
};
