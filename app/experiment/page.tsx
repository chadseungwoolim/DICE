import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "experiment" };

const EXPS = [
  {
    n: "E1",
    href: "/experiment/eckart-young",
    title: "Eckart–Young",
    eq: "‖A − Aₖ‖F  vs  √(σ²ₖ₊₁ + … + σ²ᵣ)",
    d: "같은 이미지 행렬에 대해 k를 바꿔 가며 실제 근사 오차와 잘라낸 특이값으로 계산한 이론 오차를 비교합니다.",
  },
  {
    n: "E2",
    href: "/experiment/vectors",
    title: "Singular vectors",
    eq: "Ũ Σₖ Ṽᵀ  vs  Uₖ Σₖ Vₖᵀ",
    d: "특이값 Σ는 그대로 두고 U 또는 V만 바꿔 재구성하여, 크기 정보와 공간 구조 정보의 역할을 비교합니다.",
  },
  {
    n: "E3",
    href: "/experiment/recognition",
    title: "Size vs recognition",
    eq: "bytes(k)  →  P(judged cat)",
    d: "고양이 이미지를 여러 rank로 압축하고 사람 판정 또는 분류 모델 판정으로 형체가 무너지는 용량을 측정합니다.",
  },
];

export default function Page() {
  return (
    <div className="wrap">
      <div className="section-head">
        <div className="h1">Experiment</div>
        <span className="label">all values computed in the browser from uploaded images</span>
      </div>
      <div className="grid-exp">
        {EXPS.map((e) => (
          <Link key={e.n} href={e.href}>
            <div>
              <div className="row">
                <span className="label mono">{e.n}</span>
                <span className="label">→</span>
              </div>
              <div className="h2" style={{ marginTop: 18 }}>{e.title}</div>
              <div className="mono muted" style={{ marginTop: 8 }}>{e.eq}</div>
            </div>
            <p className="note" style={{ marginTop: 24 }}>{e.d}</p>
          </Link>
        ))}
      </div>
      <div style={{ borderTop: "1px solid var(--line)", padding: "16px 0 32px" }}>
        <dl className="kv">
          <dt>svd (E1, E2)</dt>
          <dd>one-sided Jacobi (Hestenes), float64, 1e-15 orthogonality tolerance</dd>
          <dt>svd (codec, E3)</dt>
          <dd>Gram matrix + Householder tridiagonalisation + implicit QL, float64</dd>
          <dt>.ak format</dt>
          <dd>√σᵢuᵢ, √σᵢvᵢ quantised per vector (3 to 7 bits), zigzag delta, deflate-raw; Y full res, CbCr half res</dd>
          <dt>classifier (E3)</dt>
          <dd>ResNet-50 ImageNet (Keras weights, float16), classes 281 to 285 = domestic cat</dd>
        </dl>
      </div>
    </div>
  );
}
