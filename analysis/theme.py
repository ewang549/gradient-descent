"""Shared dark chart theme for every PNG this repo produces (sanity checks, model reports).

Colors are the dataviz skill's validated dark palette: categorical slots in a fixed order
(colorblind-checked as adjacent pairs), recessive hairline grid, and text in ink tokens, never
in series colors. Change the look here once and every chart follows.
"""

from __future__ import annotations

from pathlib import Path

import matplotlib

matplotlib.use("Agg")  # render to files; no display needed (works in CI too)
import matplotlib.pyplot as plt

SURFACE = "#1a1a19"
INK = "#f0efec"        # titles, primary labels
INK_2 = "#c3c2b7"      # subtitles, secondary labels
MUTED = "#898781"      # axis ticks, footnotes
GRID = "#2c2c2a"       # hairline gridlines
AXIS = "#383835"       # baseline / reference rules

# Categorical slots, dark-mode steps. Use in this order; never cycle past 8.
SERIES = ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#008300", "#9085e9", "#e66767"]
BLUE, ORANGE, AQUA, YELLOW, MAGENTA, GREEN, VIOLET, RED = SERIES
DIVERGING = (BLUE, AXIS, RED)  # cool pole, neutral midpoint, warm pole

LINE_WIDTH = 2.0
MARKER_SIZE = 8  # points; >= 8px end markers with a surface ring


def apply_theme() -> None:
    plt.rcParams.update({
        "figure.facecolor": SURFACE,
        "axes.facecolor": SURFACE,
        "savefig.facecolor": SURFACE,
        "font.family": "sans-serif",
        "font.sans-serif": ["Helvetica Neue", "Helvetica", "Arial", "DejaVu Sans"],
        "font.size": 10.5,
        "text.color": INK,
        "axes.labelcolor": INK_2,
        "axes.edgecolor": AXIS,
        "axes.linewidth": 1.0,
        "axes.spines.top": False,
        "axes.spines.right": False,
        "axes.spines.left": False,
        "axes.grid": True,
        "axes.grid.axis": "y",
        "axes.axisbelow": True,
        "grid.color": GRID,
        "grid.linewidth": 1.0,
        "grid.linestyle": "-",
        "xtick.color": MUTED,
        "ytick.color": MUTED,
        "xtick.labelcolor": MUTED,
        "ytick.labelcolor": MUTED,
        "xtick.major.size": 0,
        "ytick.major.size": 0,
        "xtick.major.pad": 6,
        "ytick.major.pad": 6,
        "lines.linewidth": LINE_WIDTH,
        "lines.solid_capstyle": "round",
        "lines.solid_joinstyle": "round",
        "legend.frameon": False,
        "legend.labelcolor": INK_2,
        "legend.fontsize": 9.5,
    })


def headline(fig, title: str, subtitle: str | None = None, source: str | None = None) -> None:
    """Left-aligned title + subtitle above the plot and a source line below it."""
    fig.text(0.0, 1.0, title, ha="left", va="bottom", fontsize=15, fontweight="bold", color=INK,
             transform=fig.transFigure)
    if subtitle:
        # fixed 0.07in below the title, whatever the figure height (a fraction drifts on tall charts)
        fig.text(0.0, 1.0 - 0.07 / fig.get_figheight(), subtitle, ha="left", va="top", fontsize=10.5, color=INK_2,
                 transform=fig.transFigure)
    if source:
        fig.text(0.0, -0.02, source, ha="left", va="top", fontsize=8, color=MUTED, transform=fig.transFigure)


def end_marker(ax, x, y, color) -> None:
    """Filled end dot with a 2px surface ring so it stays legible where it crosses other marks."""
    ax.plot([x], [y], marker="o", markersize=MARKER_SIZE, color=color,
            markeredgecolor=SURFACE, markeredgewidth=2, zorder=5)


def save(fig, path: Path) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(path, dpi=200, bbox_inches="tight", pad_inches=0.35)
    plt.close(fig)
    return path
