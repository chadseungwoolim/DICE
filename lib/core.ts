"use client";
// Thin promise wrapper around the /core.js Web Worker (SVD + .ak codec).

type Pending = { resolve: (v: any) => void; reject: (e: Error) => void; onProgress?: (p: any) => void };

export class Core {
  private w: Worker;
  private seq = 0;
  private pending = new Map<number, Pending>();

  constructor() {
    this.w = new Worker("/core.js?v=1");
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
