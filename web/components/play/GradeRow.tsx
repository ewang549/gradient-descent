import type { Grade } from "@/lib/play/game";

const BG: Record<Grade, string> = { 0: "bg-green", 1: "bg-orange", 2: "bg-red" };
const NAME: Record<Grade, string> = { 0: "model's call", 1: "small loss", 2: "big loss" };

/** One square per call, Wordle style: green = the model's call, orange = under 2 WP points lost, red = 2+. */
export function GradeRow({ grades, label }: { grades: Grade[]; label: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-16 shrink-0 text-xs font-semibold uppercase tracking-[0.15em] text-ink-2">{label}</span>
      <ol className="flex gap-1.5" aria-label={`${label}: ${grades.map((g) => NAME[g]).join(", ")}`}>
        {grades.map((g, k) => <li key={k} className={`h-6 w-6 rounded-md sm:h-7 sm:w-7 ${BG[g]}`} />)}
      </ol>
    </div>
  );
}
