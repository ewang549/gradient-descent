"""Report charts for the models, in the shared dark theme (analysis/theme.py).

Conventions: series colors follow the fixed categorical order; text is always in ink tokens;
thin marks; a legend whenever there are two or more series. ASCII/Latin-1 text only (Helvetica
lacks glyphs like arrows and square roots).
"""

from __future__ import annotations

from collections.abc import Callable, Sequence
from pathlib import Path

import matplotlib.pyplot as plt
import numpy as np
from matplotlib.cm import ScalarMappable
from matplotlib.colors import LinearSegmentedColormap, Normalize
from matplotlib.lines import Line2D
from matplotlib.patches import FancyBboxPatch, Rectangle
from matplotlib.ticker import PercentFormatter

from analysis import theme


def calibration(curves: Sequence[dict], *, title: str, subtitle: str, source: str, path: Path,
                xlabel: str = "Predicted probability", ylabel: str = "Observed rate") -> Path:
    """Reliability diagram. curves: [{label, pred, obs, color}], pred/obs are per-bin means."""
    theme.apply_theme()
    fig, ax = plt.subplots(figsize=(6.6, 6.2))
    ax.plot([0, 1], [0, 1], color=theme.MUTED, linewidth=1.0, zorder=1)
    handles = [Line2D([], [], color=theme.MUTED, linewidth=1.0, label="Perfect calibration")]
    for c in curves:
        ax.plot(c["pred"], c["obs"], color=c["color"], marker="o", markersize=theme.MARKER_SIZE,
                markeredgecolor=theme.SURFACE, markeredgewidth=2, zorder=3)
        # legend key without the surface ring, which would make the key look dashed
        handles.append(Line2D([], [], color=c["color"], marker="o", markersize=7, markeredgewidth=0, label=c["label"]))
    ax.set_xlim(0, 1)
    ax.set_ylim(0, 1)
    ax.set_aspect("equal")
    ax.grid(axis="both")
    for axis in (ax.xaxis, ax.yaxis):
        axis.set_major_formatter(PercentFormatter(1.0, decimals=0))
    ax.set_xlabel(xlabel)
    ax.set_ylabel(ylabel)
    ax.legend(handles=handles[1:] + handles[:1], loc="upper left", handlelength=2.0)
    theme.headline(fig, title, subtitle, source)
    return theme.save(fig, path)


def _rounded_hbar(ax, y: float, width: float, height: float, color: str, radius_px: float = 4.0) -> None:
    """Horizontal bar with a 4px rounded data end and a square baseline end."""
    if width <= 0:
        return
    (x0, y0), (x1, y1) = ax.transData.transform([(0, 0), (1, 1)])
    rx = min(radius_px / abs(x1 - x0), width / 2)
    ry = radius_px / abs(y1 - y0)
    ax.add_patch(FancyBboxPatch((0, y - height / 2), width, height, boxstyle=f"round,pad=0,rounding_size={rx}",
                                mutation_aspect=ry / rx, linewidth=0, facecolor=color, zorder=2))
    ax.add_patch(Rectangle((0, y - height / 2), min(2 * rx, width), height, linewidth=0, facecolor=color, zorder=2))


def hbars(labels: Sequence[str], values: Sequence[float], *, title: str, subtitle: str, source: str, path: Path,
          value_fmt: Callable[[float], str] = lambda v: f"{v:.0%}", color: str = theme.BLUE) -> Path:
    """Ranked horizontal bars, largest on top, each value labelled at its tip (so no x axis)."""
    theme.apply_theme()
    order = np.argsort(values)
    labels = [labels[i] for i in order]
    values = [values[i] for i in order]
    n = len(values)
    height = 1.0 + 0.36 * n
    fig, ax = plt.subplots(figsize=(7.4, height))
    # margins in inches, not fractions: a tall ranked chart would otherwise open with a big empty band
    fig.subplots_adjust(top=1 - 0.55 / height, bottom=0.15 / height)
    ax.set_xlim(0, max(values) * 1.16)
    ax.set_ylim(-0.6, n - 0.4)
    fig.canvas.draw()  # fix the layout so pixel -> data conversions for the rounded ends are right
    for y, v in enumerate(values):
        _rounded_hbar(ax, y, v, 0.56, color)
        ax.text(v + max(values) * 0.015, y, value_fmt(v), va="center", ha="left", fontsize=9.5, color=theme.INK)
    ax.set_yticks(range(n), labels)
    ax.tick_params(axis="y", labelcolor=theme.INK_2, labelsize=10)
    ax.xaxis.set_visible(False)
    ax.grid(False)
    ax.spines["bottom"].set_visible(False)
    theme.headline(fig, title, subtitle, source)
    return theme.save(fig, path)


def beeswarm(shap_values: np.ndarray, X: np.ndarray, labels: Sequence[str], *, title: str, subtitle: str,
             source: str, path: Path, seed: int = 0) -> Path:
    """SHAP summary: one row per feature (most important on top), dots = plays, x = push on the
    prediction, color = the feature's value (blue low, red high)."""
    theme.apply_theme()
    order = np.argsort(np.abs(shap_values).mean(axis=0))  # ascending -> most important ends up on top
    n = len(order)
    fig, ax = plt.subplots(figsize=(7.8, 1.2 + 0.44 * n))
    cmap = LinearSegmentedColormap.from_list("low_high", [theme.BLUE, theme.MUTED, theme.RED])
    rng = np.random.default_rng(seed)
    for row, j in enumerate(order):
        sv, fv = shap_values[:, j], X[:, j].astype(float)
        lo, hi = np.nanpercentile(fv, [5, 95])
        color_pos = np.clip((fv - lo) / (hi - lo), 0, 1) if hi > lo else np.full_like(fv, 0.5)
        counts, edges = np.histogram(sv, bins=70)
        density = counts[np.clip(np.digitize(sv, edges) - 1, 0, len(counts) - 1)] / counts.max()
        jitter = (rng.random(len(sv)) * 2 - 1) * 0.36 * np.sqrt(density)  # wider where points pile up
        ax.scatter(sv, row + jitter, c=color_pos, cmap=cmap, vmin=0, vmax=1, s=4, linewidths=0, alpha=0.9,
                   rasterized=True, zorder=2)
    ax.axvline(0, color=theme.AXIS, linewidth=1, zorder=1)
    ax.set_yticks(range(n), [labels[j] for j in order])
    ax.tick_params(axis="y", labelcolor=theme.INK_2, labelsize=10)
    ax.set_ylim(-0.7, n - 0.3)
    ax.grid(axis="x")
    ax.grid(axis="y", visible=False)
    ax.set_xlabel("Push on the prediction (SHAP value, log-odds)")
    cbar = fig.colorbar(ScalarMappable(norm=Normalize(0, 1), cmap=cmap), ax=ax, fraction=0.025, pad=0.02, aspect=40)
    cbar.set_ticks([0, 1], labels=["Low", "High"])
    cbar.ax.tick_params(labelsize=8.5, colors=theme.MUTED, length=0)
    cbar.outline.set_visible(False)
    cbar.set_label("Feature value", color=theme.MUTED, fontsize=8.5)
    theme.headline(fig, title, subtitle, source)
    return theme.save(fig, path)
