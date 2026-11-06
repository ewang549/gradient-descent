"""X (Twitter) profile header: one real 2026 game's win-probability line, 1500x500 drawn at 2x.

    uv run python -m analysis.x_header [game_id] -> docs/launch/x_header.png

Home-team WP before every snap from exports/games, with team colors swapped for the site's orange -> yellow -> green
gradient along game time, the game's costliest graded 4th downs labeled, and faint yard lines on the site's night
background. No team names or logos. The bottom-left 300x150 stays empty: the profile picture covers it.
"""
from __future__ import annotations

import json
import sys
import tempfile
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
from fontTools.ttLib import TTFont
from matplotlib import font_manager
from matplotlib.collections import LineCollection
from matplotlib.colors import LinearSegmentedColormap, to_rgb
from matplotlib.patches import FancyBboxPatch

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "docs" / "launch" / "x_header.png"
GAME = "2026_03_CIN_PIT"

W, H, SCALE = 1500, 500, 2           # X header size; rendered at 2x
SAFE = (300, 150)                    # bottom-left box the profile picture covers: nothing drawn there
PLOT_X = (40, 1460)                  # game clock 0 -> 60:00 maps here
PLOT_Y = (135, 430)                  # the game's lowest -> highest WP maps here (y up, in 1x pixels); no axis, so
                                     # stretching to the game's own range only changes how tall the swings look

NIGHT, PANEL, LINE = "#0d1321", "#151e33", "#24304a"
INK, INK_2, MUTED = "#eef1f7", "#aab3c7", "#808ba6"
GRADIENT = LinearSegmentedColormap.from_list("gd", ["#ff7a45", "#e5c84a", "#39d98a"])
OPTION = {"go": "GO", "punt": "PUNT", "field_goal": "FG"}


def load_font(stem: str = "instrument-sans-latin-600-normal") -> str:
    """Register one of the site's fonts (woff in web/assets) with matplotlib; returns its family name."""
    font = TTFont(ROOT / "web" / "assets" / "fonts" / f"{stem}.woff")
    font.flavor = None  # woff -> plain sfnt, which matplotlib reads
    path = Path(tempfile.mkdtemp()) / f"{stem}.ttf"
    font.save(path)
    font_manager.fontManager.addfont(str(path))
    return font_manager.FontProperties(fname=str(path)).get_name()


def px(seconds_elapsed, wp, lo: float = 0.0, hi: float = 1.0):
    x = PLOT_X[0] + np.asarray(seconds_elapsed) / 3600 * (PLOT_X[1] - PLOT_X[0])
    y = PLOT_Y[0] + (np.asarray(wp) - lo) / (hi - lo) * (PLOT_Y[1] - PLOT_Y[0])
    return x, y


def label_text(fd: dict) -> str:
    return f"4th & {fd['ydstogo']}  ·  {OPTION[fd['decision']]}  ·  -{fd['wp_lost'] * 100:.1f}% WP"


def draw(game_id: str = GAME, n_labels: int = 3) -> Path:
    body = load_font()
    g = json.loads((ROOT / "exports" / "games" / game_id[:4] / f"{game_id}.json").read_text())
    s = g["series"]
    elapsed = 3600 - np.array(s["game_seconds_remaining"], dtype=float)
    wp = np.array(s["home_wp"], dtype=float)
    lo, hi = float(wp.min()), float(wp.max())
    x, y = px(elapsed, wp, lo, hi)

    fig = plt.figure(figsize=(W / 100, H / 100), dpi=100 * SCALE)
    fig.patch.set_facecolor(NIGHT)
    ax = fig.add_axes((0, 0, 1, 1))
    ax.set_xlim(0, W)
    ax.set_ylim(0, H)
    ax.axis("off")
    lw = 0.72  # 1 px at 1x, in points

    # Yard lines: a 100-yard field across the full width, brighter every 10 yards, fading out toward the bottom.
    fade = np.linspace(0, 1, 60)
    for yard in range(0, 101, 5):
        lx = yard / 100 * W
        alpha = 0.09 if yard % 10 == 0 else 0.04
        ys = np.linspace(0, H, 61)
        segs = [[(lx, ys[i]), (lx, ys[i + 1])] for i in range(60)]
        ax.add_collection(LineCollection(segs, colors=[(*to_rgb(INK), alpha * f ** 1.5) for f in fade], linewidths=lw))
    # 50% line: where the lead in win probability changes hands
    ax.plot([PLOT_X[0], PLOT_X[1]], [px(0, 0.5, lo, hi)[1]] * 2, color=INK, alpha=0.10, lw=lw, dashes=(4, 6))

    # The WP line, colored by game time, with a soft glow.
    pts = np.column_stack([x, y]).reshape(-1, 1, 2)
    segs = np.concatenate([pts[:-1], pts[1:]], axis=1)
    colors = GRADIENT(np.linspace(0, 1, len(segs)))
    for width, alpha in [(26, 0.035), (14, 0.06), (8, 0.12)]:
        glow = colors.copy()
        glow[:, 3] = alpha
        ax.add_collection(LineCollection(segs, colors=glow, linewidths=width * lw, capstyle="round", joinstyle="round"))
    ax.add_collection(LineCollection(segs, colors=colors, linewidths=4 * lw, capstyle="round", joinstyle="round"))

    # The costliest graded 4th downs, labeled.
    seq = {p: i for i, p in enumerate(s["play_seq"])}
    graded = [fd for fd in g["fourth_downs"] if fd["is_graded"] and fd["wp_lost"] > 0 and fd["play_seq"] in seq]
    placed: list = []  # label boxes so far, in data coords
    line_pts = np.column_stack([x, y])
    for k, fd in enumerate(sorted(sorted(graded, key=lambda f: -f["wp_lost"])[:n_labels], key=lambda f: f["play_seq"])):
        i = seq[fd["play_seq"]]
        dx, dy = x[i], y[i]
        color = GRADIENT(i / (len(x) - 1))
        text = ax.text(dx, dy, label_text(fd), ha="center", va="center", color=INK, fontsize=12.5,
                       fontfamily=body, fontweight=600, zorder=8)
        # first offset whose box stays on the canvas, clear of the profile picture, other labels and the line
        sign = 1 if k % 2 == 0 else -1  # alternate above / below so neighbours don't stack
        for off in (78 * sign, -78 * sign, 120 * sign, -120 * sign, 160 * sign, -160 * sign):
            text.set_position((dx, dy + off))
            fig.canvas.draw()
            bb = text.get_window_extent().transformed(ax.transData.inverted())
            box = (bb.x0 - 14, bb.y0 - 10, bb.x1 + 14, bb.y1 + 10)
            inside = lambda b, p: b[0] <= p[0] <= b[2] and b[1] <= p[1] <= b[3]
            clashes = (box[1] < 20 or box[3] > H - 20 or box[0] < 10 or box[2] > W - 10
                       or (box[0] < SAFE[0] and box[1] < SAFE[1])
                       or any(not (box[2] < b[0] or box[0] > b[2] or box[3] < b[1] or box[1] > b[3]) for b in placed)
                       or any(inside(box, p) for p in line_pts))
            if not clashes:
                break
        else:
            raise RuntimeError(f"no room for the label at play {fd['play_seq']}")
        placed.append(box)
        up = off > 0
        ax.plot([dx, dx], [dy + (11 if up else -11), box[1] if up else box[3]], color=INK, alpha=0.35, lw=lw, zorder=4)
        ax.add_patch(FancyBboxPatch((box[0], box[1]), box[2] - box[0], box[3] - box[1],
                                    boxstyle="round,pad=0,rounding_size=9", facecolor=PANEL, edgecolor=LINE,
                                    linewidth=lw, zorder=7))
        ax.scatter([dx], [dy], s=(15 * lw) ** 2, color=NIGHT, zorder=5, linewidths=0)
        ax.scatter([dx], [dy], s=(10 * lw) ** 2, color=color, edgecolors=INK, linewidths=1.8 * lw, zorder=6)

    # Nothing may be drawn in the profile picture's box (yard lines have faded to ~0 there).
    assert not np.any((x < SAFE[0]) & (y < SAFE[1] + 6)), "WP line enters the profile picture's box"

    OUT.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(OUT, dpi=100 * SCALE, facecolor=NIGHT)
    plt.close(fig)
    return OUT


if __name__ == "__main__":
    print(draw(*(sys.argv[1:2] or [GAME])))
