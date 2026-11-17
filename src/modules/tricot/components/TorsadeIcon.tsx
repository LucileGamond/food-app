import type { SVGProps } from "react";
import { plyAlong, toPoints, type Palette, type Point } from "../lib/knitIconGeometry";

// Icône du module Tricot, « T de Torsade » : une aiguille pour la barre du T, une torsade de deux brins bleus pour le
// jambage, sur fond blanc, cadrée serré pour rester lisible en petit.

const INDIGO: Palette = ["#161c46", "#2f3b80", "#3f4fa0", "#5566bb", "#161c46"];
const CIEL: Palette = ["#2a4a8f", "#5b86d6", "#79a0e6", "#9bbcf2", "#2a4a8f"];
const WOOD = ["#c08a52", "#e0b07a", "#8a5a2e"] as const;
const BG = "#ffffff";

/** Jambage : de y = 30 à 100, un croisement tous les 18 (toujours dans le même sens, comme une vraie torsade). */
const CABLE = { cx: 50, amp: 12, y0: 26, y1: 90, period: 22, width: 15 };

function cablePoints(phase: number, from: number, to: number): Point[] {
  const { cx, amp, y0, period } = CABLE;
  const pts: Point[] = [];
  for (let y = from; y <= to + 0.01; y += 1)
    pts.push([cx + amp * Math.sin((Math.PI * (y - y0)) / period + phase), y]);
  return pts;
}

function strand(points: Point[], pal: Palette) {
  const pieces = plyAlong(points, CABLE.width);
  return {
    points: toPoints(points),
    pal,
    back: pieces.filter((p) => !p.front),
    front: pieces.filter((p) => p.front),
  };
}

// Brin indigo, brin ciel, puis l'indigo repasse devant un croisement sur deux. Calculés une fois.
const STRANDS = [
  strand(cablePoints(0, CABLE.y0, CABLE.y1), INDIGO),
  strand(cablePoints(Math.PI, CABLE.y0, CABLE.y1), CIEL),
  ...Array.from(
    { length: Math.floor((CABLE.y1 - CABLE.y0) / CABLE.period) + 1 },
    (_, k) => k,
  )
    .filter((k) => k % 2 === 0)
    .map((k) => {
      const y = CABLE.y0 + k * CABLE.period;
      return strand(
        cablePoints(
          0,
          Math.max(CABLE.y0, y - CABLE.period * 0.42),
          Math.min(CABLE.y1, y + CABLE.period * 0.42),
        ),
        INDIGO,
      );
    }),
];

/** Aiguille : du bouton (12, 20) à la pointe (94, 20), 10 d'épaisseur. */
const NEEDLE = { x1: 12, x2: 94, y: 20, w: 10 };

export function TorsadeIcon(props: SVGProps<SVGSVGElement>) {
  const { x1, x2, y, w } = NEEDLE;
  const tip = w * 2.2;
  const end = x2 - tip;
  return (
    <svg viewBox="0 0 100 100" fill="none" data-icon="torsade" {...props}>
      <rect
        x={0.5}
        y={0.5}
        width={99}
        height={99}
        rx={22}
        fill={BG}
        stroke="#d9d6cf"
      />
      <g transform="translate(50 50) scale(0.92) translate(-50 -50)">
        <g strokeLinecap="round" strokeLinejoin="round">
          {STRANDS.map((s, i) => (
            <g key={i}>
              <polyline
                points={s.points}
                stroke={s.pal[4]}
                strokeWidth={CABLE.width}
              />
              {s.back.map((p, j) => (
                <polyline
                  key={`b${j}`}
                  points={p.points}
                  stroke={s.pal[1]}
                  strokeWidth={CABLE.width * 0.55}
                />
              ))}
              {s.front.map((p, j) => (
                <polyline
                  key={`f${j}`}
                  points={p.points}
                  stroke={s.pal[2 + (p.ply % 2)]}
                  strokeWidth={CABLE.width * 0.55}
                />
              ))}
            </g>
          ))}
        </g>
        <g strokeLinecap="round">
          <line
            x1={x1}
            y1={y}
            x2={end}
            y2={y}
            stroke={WOOD[2]}
            strokeWidth={w + 1.2}
          />
          <line
            x1={x1}
            y1={y}
            x2={end}
            y2={y}
            stroke={WOOD[0]}
            strokeWidth={w}
          />
          <line
            x1={x1 + 2}
            y1={y - w * 0.2}
            x2={end - 2}
            y2={y - w * 0.2}
            stroke={WOOD[1]}
            strokeWidth={w * 0.3}
          />
          <path
            d={`M${end} ${y + w / 2}L${x2} ${y}L${end} ${y - w / 2}Z`}
            fill={WOOD[0]}
            stroke={WOOD[2]}
            strokeWidth={0.8}
            strokeLinejoin="round"
          />
          <circle
            cx={x1}
            cy={y}
            r={w * 1.05}
            fill="#a33a26"
            stroke="#4f1a11"
            strokeWidth={0.8}
          />
        </g>
      </g>
    </svg>
  );
}
