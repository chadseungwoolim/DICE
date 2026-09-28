"use client";
import { useRef, useState } from "react";

type Props = {
  label: string;
  multiple?: boolean;
  onFiles: (f: File[]) => void;
  hint?: string;
  height?: number;
};

export default function FilePick({ label, multiple, onFiles, hint, height = 72 }: Props) {
  const ref = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  return (
    <div
      onClick={() => ref.current?.click()}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const f = Array.from(e.dataTransfer.files).filter((x) => x.type.startsWith("image/"));
        if (f.length) onFiles(multiple ? f : f.slice(0, 1));
      }}
      style={{
        border: "1px dashed var(--mid)",
        height,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        background: over ? "var(--faint)" : "transparent",
        gap: 4,
      }}
    >
      <span className="label" style={{ color: "var(--fg)" }}>{label}</span>
      {hint && <span className="label">{hint}</span>}
      <input
        ref={ref}
        type="file"
        accept="image/*"
        multiple={multiple}
        className="hide"
        onChange={(e) => {
          const f = Array.from(e.target.files || []);
          if (f.length) onFiles(f);
          e.target.value = "";
        }}
      />
    </div>
  );
}
