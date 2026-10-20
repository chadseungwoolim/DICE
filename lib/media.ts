"use client";
// Turn a picked file into the bytes that are sent (.ak image / .akv video), and received bytes back into pixels.
import { getCore, IMAGE_AUTO, type EncodeResult, type VideoDecoded, type VideoResult } from "./core";
import { fileToBitmap, rasterize } from "./image";
import { captureFrames } from "./video";

export type Pixels =
  | { kind: "image"; rgba: Uint8ClampedArray; w: number; h: number }
  | { kind: "video"; rgba: Uint8ClampedArray; w: number; h: number; frames: number; fps: number };

export type Prepared = { kind: "image" | "video"; bytes: Uint8Array; pixels: Pixels; meta: Record<string, number>; note?: string };

type Load = { r: number; rc: number };

export async function prepareFile(file: File, onStage: (s: string, f?: number) => void): Promise<Prepared> {
  const core = getCore();
  if (file.type.startsWith("image/")) {
    onStage("사진 읽는 중");
    const bmp = await fileToBitmap(file);
    const r = rasterize(bmp as ImageBitmap, IMAGE_AUTO.size);
    onStage("특이값 분해 중");
    const key = `send-${Date.now()}`;
    const buf = r.rgba.buffer.slice(0) as ArrayBuffer;
    const info = await core.call<Load>("load", { key, rgba: buf, w: r.w, h: r.h }, [buf]);
    const k = Math.min(IMAGE_AUTO.k, info.r), kc = Math.min(IMAGE_AUTO.kc, info.rc);
    const e = await core.call<EncodeResult>("encode", { key, k, kc, bits: IMAGE_AUTO.bits, mono: IMAGE_AUTO.mono });
    core.call("drop", { key }).catch(() => {});
    return {
      kind: "image",
      bytes: e.bytes,
      pixels: { kind: "image", rgba: e.rgba, w: e.w, h: e.h },
      meta: { w: e.w, h: e.h, k: e.k, kc: e.kc, bits: e.bits, orig: file.size, psnr: Math.round(e.psnr * 10) / 10 },
    };
  }
  if (file.type.startsWith("video/")) {
    onStage("영상 프레임 추출 중", 0);
    const fr = await captureFrames(file, (f) => onStage("영상 프레임 추출 중", f));
    onStage("시간축 SVD 계산 중");
    const bufs = fr.frames.map((f) => f.buffer as ArrayBuffer);
    const v = await core.call<VideoResult>("videoEncode", { frames: bufs, w: fr.w, h: fr.h, fps: fr.fps }, bufs);
    return {
      kind: "video",
      bytes: v.bytes,
      pixels: { kind: "video", rgba: v.rgba, w: v.w, h: v.h, frames: v.frames, fps: v.fps },
      meta: { w: v.w, h: v.h, frames: v.frames, fps: Math.round(v.fps * 100) / 100, dur: Math.round(fr.used * 10) / 10, orig: file.size, r: v.ranks[0] ?? 0, psnr: Math.round(v.psnr * 10) / 10 },
      note: fr.duration > fr.used + 0.05 ? `앞 ${Math.round(fr.used)}초만 보냅니다 (최대 16초).` : undefined,
    };
  }
  throw new Error("사진이나 영상 파일만 보낼 수 있습니다.");
}

export async function decodeBytes(kind: "image" | "video", bytes: Uint8Array): Promise<Pixels> {
  const core = getCore();
  const buf = bytes.slice().buffer as ArrayBuffer;
  if (kind === "image") {
    const d = await core.call<{ rgba: Uint8ClampedArray; info: { w: number; h: number } }>("decode", { bytes: buf }, [buf]);
    return { kind: "image", rgba: d.rgba, w: d.info.w, h: d.info.h };
  }
  const v = await core.call<VideoDecoded>("videoDecode", { bytes: buf }, [buf]);
  return { kind: "video", rgba: v.rgba, w: v.w, h: v.h, frames: v.frames, fps: v.fps };
}

/** One frame of a decoded video (or the image) as ImageData. */
export function frameData(p: Pixels, i = 0): ImageData {
  const n = p.w * p.h * 4;
  const off = p.kind === "video" ? Math.min(i, p.frames - 1) * n : 0;
  return new ImageData(new Uint8ClampedArray(p.rgba.buffer, p.rgba.byteOffset + off, n).slice(), p.w, p.h);
}
