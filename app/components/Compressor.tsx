"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import ImageCompressor from "./ImageCompressor";
import VideoCompressor from "./VideoCompressor";

export default function Compressor() {
  const [file, setFile] = useState<File | null>(null);
  const [over, setOver] = useState(false);
  const [err, setErr] = useState("");
  const input = useRef<HTMLInputElement>(null);

  const accept = useCallback((f: File | undefined | null) => {
    if (!f) return;
    if (!/^image\/|^video\//.test(f.type)) {
      setErr(`unsupported type: ${f.type || "unknown"}`);
      return;
    }
    setErr("");
    setFile(f);
  }, []);

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const f = Array.from(e.clipboardData?.files || [])[0];
      if (f) accept(f);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [accept]);

  if (file) {
    const reset = () => setFile(null);
    return file.type.startsWith("image/") ? (
      <ImageCompressor key={file.name + file.size} file={file} onReset={reset} />
    ) : (
      <VideoCompressor key={file.name + file.size} file={file} onReset={reset} />
    );
  }

  return (
    <>
      <div
        className="drop"
        data-over={over ? "1" : "0"}
        onClick={() => input.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          accept(e.dataTransfer.files[0]);
        }}
      >
        <span className="corner" style={{ left: 10, top: 8 }}>input</span>
        <span className="corner" style={{ right: 10, top: 8 }}>image / video</span>
        <span className="corner cb" style={{ left: 10, bottom: 8 }}>image → rank-k SVD (.ak)</span>
        <span className="corner cb" style={{ right: 10, bottom: 8 }}>video → low bitrate re-encode</span>
        <div className="inner">
          <div className="h2">Drop a file</div>
          <div className="label" style={{ marginTop: 8 }}>click to select / paste</div>
        </div>
        <input
          ref={input}
          type="file"
          accept="image/*,video/*"
          className="hide"
          onChange={(e) => accept(e.target.files?.[0])}
        />
      </div>
      {err && <div className="err">{err}</div>}
      <div className="row" style={{ borderTop: "1px solid var(--line)", padding: "14px 0 28px", alignItems: "flex-start", flexWrap: "wrap" }}>
        <p className="note" style={{ maxWidth: 560 }}>
          사진은 브라우저에서 행렬 A로 변환 후 특이값 분해 A = UΣV<sup>T</sup>, 상위 k개 특이값만 남긴 A<sub>k</sub> = U<sub>k</sub>Σ<sub>k</sub>V<sub>k</sub><sup>T</sup>의 인수만 저장합니다.
          영상은 해상도, 프레임레이트, 비트레이트를 낮춰 재인코딩합니다. 원본은 서버로 전송되지 않습니다.
        </p>
        <span className="label">01 compress → 02 share → 03 open link</span>
      </div>
    </>
  );
}
