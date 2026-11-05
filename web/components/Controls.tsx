"use client";
/** Situation inputs. Each control is a small, thumb-sized primitive; the panel composes them. */
import type { ReactNode } from "react";
import { fieldLabel, fmtClock, scoreLabel, type CalcState, type Venue } from "@/lib/calculator/state";

type Set = (patch: Partial<CalcState>) => void;

function Label({ children, value }: { children: ReactNode; value?: ReactNode }) {
  return (
    <div className="mb-1.5 flex items-baseline justify-between gap-2">
      <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">{children}</span>
      {value !== undefined && <span className="font-display text-lg font-extrabold tracking-wide text-ink num">{value}</span>}
    </div>
  );
}

function Stepper({ value, onChange, min, max, step = 1, display }: {
  value: number; onChange: (v: number) => void; min: number; max: number; step?: number; display: ReactNode;
}) {
  const btn = "grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-night text-xl font-bold text-ink-2 transition hover:bg-line hover:text-ink active:scale-95 disabled:opacity-30";
  return (
    <div className="flex items-center gap-2">
      <button type="button" className={btn} aria-label="decrease" disabled={value <= min}
        onClick={() => onChange(Math.max(min, value - step))}>−</button>
      <div className="flex-1 text-center font-display text-2xl font-extrabold tracking-wide num">{display}</div>
      <button type="button" className={btn} aria-label="increase" disabled={value >= max}
        onClick={() => onChange(Math.min(max, value + step))}>+</button>
    </div>
  );
}

function Segmented<T extends string | number>({ options, value, onChange, label, disabled }: {
  options: { value: T; label: string }[]; value: T; onChange: (v: T) => void; label: string; disabled?: boolean;
}) {
  return (
    <div role="radiogroup" aria-label={label} aria-disabled={disabled || undefined} className="flex rounded-lg bg-night p-1">
      {options.map((o) => (
        <button key={String(o.value)} type="button" role="radio" aria-checked={o.value === value} onClick={() => onChange(o.value)} disabled={disabled}
          className={`flex-1 rounded-md px-2 py-1.5 font-display text-base font-extrabold uppercase tracking-wider transition ${
            o.value === value ? "bg-ink text-night shadow" : "text-ink-2 hover:text-ink"}`}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Timeouts({ value, onChange, label }: { value: number; onChange: (v: number) => void; label: string }) {
  return (
    <div>
      <Label value={value}>{label}</Label>
      <div className="flex gap-1.5" role="radiogroup" aria-label={label}>
        {[0, 1, 2, 3].map((n) => (
          <button key={n} type="button" role="radio" aria-checked={n === value} aria-label={`${n} timeouts`}
            onClick={() => onChange(n)}
            className={`h-8 flex-1 rounded-md text-xs font-bold transition ${
              n === 0 ? (value === 0 ? "bg-orange/80 text-night" : "bg-night text-muted hover:text-ink-2")
                : n <= value ? "bg-yellow text-night" : "bg-night text-muted hover:text-ink-2"}`}>
            {n === 0 ? "0" : ""}
          </button>
        ))}
      </div>
    </div>
  );
}

const card = "rounded-2xl border border-line bg-panel/70 p-4 backdrop-blur-sm";

export function Controls({ s, set }: { s: CalcState; set: Set }) {
  const spreadText = s.spread === 0 ? "Pick'em" : s.spread > 0 ? `Fav by ${s.spread}` : `Dog by ${-s.spread}`;
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className={card}>
        <Label>Line of scrimmage</Label>
        <Stepper value={100 - s.yardline100} min={1} max={99} display={fieldLabel(s.yardline100)}
          onChange={(v) => set({ yardline100: 100 - v })} />
      </div>
      <div className={card}>
        <Label>Yards to go</Label>
        <Stepper value={s.ydstogo} min={1} max={Math.min(s.yardline100, 30)}
          display={s.ydstogo >= s.yardline100 ? `& Goal` : `4th & ${s.ydstogo}`} onChange={(v) => set({ ydstogo: v })} />
      </div>
      <div className={card}>
        <Label>Score (offense)</Label>
        <Stepper value={s.scoreDiff} min={-35} max={35} display={scoreLabel(s.scoreDiff)} onChange={(v) => set({ scoreDiff: v })} />
        <div className="mt-3 grid grid-cols-6 gap-1">
          {[-8, -7, -3, 0, 3, 7].map((d) => (
            <button key={d} type="button" onClick={() => set({ scoreDiff: d })}
              className={`rounded-md py-1 font-display text-sm font-extrabold transition num ${
                d === s.scoreDiff ? "bg-ink text-night" : "bg-night text-ink-2 hover:text-ink"}`}>
              {d === 0 ? "TIE" : d > 0 ? `+${d}` : d}
            </button>
          ))}
        </div>
      </div>
      <div className={card}>
        <Label value={`Q${s.qtr} ${fmtClock(s.clock)}`}>Clock</Label>
        <Segmented label="Quarter" value={s.qtr} onChange={(v) => set({ qtr: v })}
          options={[1, 2, 3, 4].map((q) => ({ value: q, label: `Q${q}` }))} />
        <input type="range" min={1} max={900} value={s.clock} aria-label="Time left in the quarter"
          onChange={(e) => set({ clock: Number(e.target.value) })} className="mt-2"
          style={{ direction: "rtl" }} />
      </div>
      <div className={`${card} grid grid-cols-2 gap-3`}>
        <Timeouts label="Your timeouts" value={s.posTimeouts} onChange={(v) => set({ posTimeouts: v })} />
        <Timeouts label="Their timeouts" value={s.defTimeouts} onChange={(v) => set({ defTimeouts: v })} />
      </div>
      <div className={card}>
        <Label value={spreadText}>Vegas spread</Label>
        <input type="range" min={-14} max={14} step={0.5} value={s.spread} aria-label="Point spread, positive = offense favored"
          onChange={(e) => set({ spread: Number(e.target.value) })} />
        <div className="flex justify-between text-[11px] text-muted"><span>Underdog</span><span>Favorite</span></div>
      </div>
      <div className={`${card} sm:col-span-2`}>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label>Offense is</Label>
            <Segmented<Venue> label="Venue" value={s.venue} onChange={(v) => set({ venue: v })}
              options={[{ value: "home", label: "Home" }, { value: "away", label: "Away" }, { value: "neutral", label: "Neutral" }]} />
          </div>
          {/* only matters before halftime; disabled (not just faded) so it's skipped by keyboard and screen readers */}
          <div className={s.qtr <= 2 ? "" : "opacity-35"}>
            <Label>Gets the 2nd-half kickoff</Label>
            <Segmented<"yes" | "no"> label="Gets the 2nd-half kickoff" value={s.receives2hKickoff ? "yes" : "no"} disabled={s.qtr > 2}
              onChange={(v) => set({ receives2hKickoff: v === "yes" })}
              options={[{ value: "yes", label: "Yes" }, { value: "no", label: "No" }]} />
          </div>
        </div>
      </div>
    </div>
  );
}
