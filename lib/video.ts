"use client";
// Grab evenly spaced, downscaled RGBA frames from a video file (input of the .akv codec in /core.js).

export const VIDEO_LIMITS = { maxSide: 192, maxFrames: 64, maxFps: 8, minFps: 4, maxDur: 16 };

export type Frames = { frames: Uint8ClampedArray[]; w: number; h: number; fps: number; duration: number; used: number };

function once(el: HTMLMediaElement, ev: string, ms: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => {
      cleanup();
      reject(new Error(`video ${ev} timeout`));
    }, ms);
    const ok = () => {
      cleanup();
      resolve();
    };
    const bad = () => {
      cleanup();
      reject(new Error("이 영상 형식은 이 기기에서 읽을 수 없습니다."));
    };
    const cleanup = () => {
      clearTimeout(t);
      el.removeEventListener(ev, ok);
      el.removeEventListener("error", bad);
    };
    el.addEventListener(ev, ok, { once: true });
    el.addEventListener("error", bad, { once: true });
  });
}

export async function captureFrames(file: Blob, onProgress?: (f: number) => void, lim = VIDEO_LIMITS): Promise<Frames> {
  const url = URL.createObjectURL(file);
  const v = document.createElement("video");
  v.muted = true;
  v.playsInline = true;
  v.preload = "auto";
  v.src = url;
  try {
    await once(v, "loadedmetadata", 15000);
    let duration = v.duration;
    if (!isFinite(duration) || duration <= 0) {
      // some WebM files report Infinity until the end has been seen
      v.currentTime = 1e7;
      await once(v, "seeked", 8000).catch(() => {});
      duration = isFinite(v.duration) && v.duration > 0 ? v.duration : lim.maxDur;
      v.currentTime = 0;
      await once(v, "seeked", 8000).catch(() => {});
    }
    const used = Math.min(duration, lim.maxDur);
    const fps = Math.max(lim.minFps, Math.min(lim.maxFps, lim.maxFrames / used));
    const T = Math.max(1, Math.min(lim.maxFrames, Math.floor(used * fps)));
    const vw = v.videoWidth, vh = v.videoHeight;
    if (!vw || !vh) throw new Error("영상 크기를 읽을 수 없습니다.");
    const s = Math.min(1, lim.maxSide / Math.max(vw, vh));
    const w = Math.max(2, Math.round((vw * s) / 2) * 2), h = Math.max(2, Math.round((vh * s) / 2) * 2);
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const ctx = c.getContext("2d", { willReadFrequently: true })!;
    ctx.imageSmoothingQuality = "high";
    const frames: Uint8ClampedArray[] = [];
    for (let i = 0; i < T; i++) {
      const t = Math.min(used - 0.001, (i + 0.5) / fps);
      if (Math.abs(v.currentTime - t) > 1e-3) {
        const p = once(v, "seeked", 8000);
        v.currentTime = t;
        await p;
      }
      ctx.drawImage(v, 0, 0, w, h);
      frames.push(ctx.getImageData(0, 0, w, h).data);
      onProgress?.((i + 1) / T);
    }
    return { frames, w, h, fps: T / used, duration, used };
  } finally {
    v.removeAttribute("src");
    v.load();
    URL.revokeObjectURL(url);
  }
}
