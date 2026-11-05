"use client";
/**
 * The field, broadcast style: offense drives left to right. Drag the ball (or focus it and use the
 * arrow keys) to set the line of scrimmage. Blue = line of scrimmage, yellow = line to gain.
 */
import { useRef, useSyncExternalStore, type KeyboardEvent, type PointerEvent } from "react";
import { fieldLabel } from "@/lib/calculator/state";

const YD = 10; // svg units per yard
const W = 120 * YD;
const NARROW = "(max-width: 640px)";

/** Phones get a taller field (same width in yards) so the ball and labels stay thumb-sized. */
function useNarrow(): boolean {
  return useSyncExternalStore(
    (cb) => {
      const m = window.matchMedia(NARROW);
      m.addEventListener("change", cb);
      return () => m.removeEventListener("change", cb);
    },
    () => window.matchMedia(NARROW).matches,
    () => false,
  );
}
const GOAL_RIGHT = 110 * YD;

const GLIDE = { transition: "transform 160ms ease-out", transformOrigin: "0 0" } as const;

/** Center a chip on its line, but keep it inside the field near either end. */
function chipPosition(share: number) {
  const shift = share > 0.9 ? -100 : share < 0.1 ? 0 : -50;
  return { left: `${share * 100}%`, transform: `translateX(${shift}%)` };
}

const xOf =(yardline100: number) => (110 - yardline100) * YD; // yards from the left end line
const yardlineAt = (x: number) => Math.min(99, Math.max(1, Math.round(110 - x / YD)));

interface Props {
  yardline100: number;
  ydstogo: number;
  onChange: (yardline100: number) => void;
}

export function Field({ yardline100, ydstogo, onChange }: Props) {
  const narrow = useNarrow();
  const H = narrow ? 520 : 240;
  const numSize = narrow ? 64 : 30;
  const svg = useRef<SVGSVGElement>(null);
  const dragging = useRef(false);
  const ballX = xOf(yardline100);
  const goalToGo = ydstogo >= yardline100;
  const lineToGain = goalToGo ? GOAL_RIGHT : ballX + ydstogo * YD;

  const fromPointer = (e: PointerEvent) => {
    const r = svg.current!.getBoundingClientRect();
    onChange(yardlineAt(((e.clientX - r.left) / r.width) * W));
  };
  const onKey = (e: KeyboardEvent) => {
    const step = e.shiftKey ? 5 : 1;
    if (e.key === "ArrowRight" || e.key === "ArrowUp") onChange(Math.max(1, yardline100 - step));
    else if (e.key === "ArrowLeft" || e.key === "ArrowDown") onChange(Math.min(99, yardline100 + step));
    else return;
    e.preventDefault();
  };

  return (
    <div className="relative select-none">
      <svg
        ref={svg}
        viewBox={`0 0 ${W} ${H}`}
        className="block w-full cursor-grab touch-none rounded-xl active:cursor-grabbing"
        onPointerDown={(e) => {
          dragging.current = true;
          (e.target as Element).setPointerCapture?.(e.pointerId);
          fromPointer(e);
        }}
        onPointerMove={(e) => dragging.current && fromPointer(e)}
        onPointerUp={() => (dragging.current = false)}
        onPointerCancel={() => (dragging.current = false)}
        aria-hidden
      >
        <defs>
          <linearGradient id="turf-shade" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#000" stopOpacity="0" />
            <stop offset="1" stopColor="#000" stopOpacity="0.35" />
          </linearGradient>
          <radialGradient id="ball-glow">
            <stop offset="0" stopColor="#e5c84a" stopOpacity="0.55" />
            <stop offset="1" stopColor="#e5c84a" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="gain-zone" x1="0" x2="1">
            <stop offset="0" stopColor="#e5c84a" stopOpacity="0.02" />
            <stop offset="1" stopColor="#e5c84a" stopOpacity="0.16" />
          </linearGradient>
        </defs>

        {/* turf in 5-yard mowing stripes */}
        {Array.from({ length: 20 }, (_, i) => (
          <rect key={i} x={(10 + i * 5) * YD} y={0} width={5 * YD} height={H} fill={i % 2 ? "#12301f" : "#10291c"} />
        ))}
        {/* end zones */}
        <rect x={0} y={0} width={10 * YD} height={H} fill="#16213a" />
        <rect x={GOAL_RIGHT} y={0} width={10 * YD} height={H} fill="#2a1d1a" />
        <text x={5 * YD} y={H / 2} fill="#6b7690" fontSize={numSize} fontWeight={800} textAnchor="middle" dominantBaseline="middle"
          transform={`rotate(-90 ${5 * YD} ${H / 2})`} className="font-display" letterSpacing={6}>OWN</text>
        <text x={115 * YD} y={H / 2} fill="#ff7a45" fillOpacity={0.75} fontSize={numSize} fontWeight={800} textAnchor="middle"
          dominantBaseline="middle" transform={`rotate(90 ${115 * YD} ${H / 2})`} className="font-display" letterSpacing={6}>
          END ZONE
        </text>

        {/* yard lines, hash ticks, numbers */}
        {Array.from({ length: 21 }, (_, i) => (
          <line key={i} x1={(10 + i * 5) * YD} x2={(10 + i * 5) * YD} y1={0} y2={H} stroke="#fff"
            strokeOpacity={i === 0 || i === 20 ? 0.55 : 0.16} strokeWidth={i === 0 || i === 20 ? 3 : 1.5} />
        ))}
        {Array.from({ length: 99 }, (_, i) => i + 11).filter((y) => y % 5).map((y) => (
          <g key={y} stroke="#fff" strokeOpacity={0.14} strokeWidth={1.5}>
            <line x1={y * YD} x2={y * YD} y1={H * 0.36} y2={H * 0.36 + 8} />
            <line x1={y * YD} x2={y * YD} y1={H * 0.64 - 8} y2={H * 0.64} />
          </g>
        ))}
        {[10, 20, 30, 40, 50, 60, 70, 80, 90].map((y) => (
          <text key={y} x={(10 + y) * YD} y={H * 0.8} fill="#fff" fillOpacity={0.3} fontSize={numSize} fontWeight={800}
            textAnchor="middle" className="font-display">{y <= 50 ? y : 100 - y}</text>
        ))}
        <rect x={0} y={0} width={W} height={H} fill="url(#turf-shade)" />

        {/* the yards to gain, then the broadcast lines */}
        {/* everything that moves is positioned with CSS transforms so it glides together */}
        <rect x={0} y={0} width={1} height={H} fill="url(#gain-zone)"
          style={{ transform: `translateX(${ballX}px) scaleX(${Math.max(lineToGain - ballX, 0)})`, ...GLIDE }} />
        <g style={{ transform: `translateX(${lineToGain}px)`, ...GLIDE }}>
          <line x1={0} x2={0} y1={0} y2={H} stroke="#e5c84a" strokeWidth={5}
            style={{ filter: "drop-shadow(0 0 6px rgb(229 200 74 / 0.7))" }} />
        </g>

        {/* line of scrimmage + the ball */}
        <g style={{ transform: `translateX(${ballX}px)`, ...GLIDE }}>
          <line x1={0} x2={0} y1={0} y2={H} stroke="#4c8dff" strokeWidth={4} />
          <g transform={`translate(0 ${H / 2}) scale(${narrow ? 2 : 1})`}>
            <circle cx={0} cy={0} r={46} fill="url(#ball-glow)" />
            <ellipse cx={0} cy={0} rx={25} ry={15} fill="#7a3f1d" stroke="#2b1408" strokeWidth={2} />
            <line x1={-11} x2={11} y1={0} y2={0} stroke="#f4efe6" strokeWidth={2.4} />
            {[-7, -2.5, 2, 6.5].map((dx) => (
              <line key={dx} x1={dx} x2={dx} y1={-4} y2={4} stroke="#f4efe6" strokeWidth={2} />
            ))}
          </g>
        </g>
      </svg>

      {/* label chips that ride with the lines */}
      <div
        className="pointer-events-none absolute top-2 whitespace-nowrap rounded-md bg-los px-2 py-0.5 font-display text-sm font-extrabold tracking-wider text-white shadow-lg transition-[left] duration-150 ease-out sm:text-base"
        style={chipPosition(ballX / W)}
      >
        {fieldLabel(yardline100)}
      </div>
      <div
        className="pointer-events-none absolute bottom-2 whitespace-nowrap rounded-md bg-yellow px-2 py-0.5 font-display text-sm font-extrabold tracking-wider text-night shadow-lg transition-[left] duration-150 ease-out sm:text-base"
        style={chipPosition(lineToGain / W)}
      >
        {goalToGo ? "GOAL" : `${ydstogo} TO GO`}
      </div>

      {/* keyboard / screen-reader handle */}
      <div
        role="slider"
        tabIndex={0}
        aria-label="Line of scrimmage"
        aria-valuemin={1}
        aria-valuemax={99}
        aria-valuenow={yardline100}
        aria-valuetext={fieldLabel(yardline100)}
        onKeyDown={onKey}
        className="absolute inset-0 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-yellow/70"
        style={{ pointerEvents: "none" }}
      />
    </div>
  );
}
