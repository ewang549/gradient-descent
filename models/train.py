"""Train and evaluate the Phase 2 models: `python -m models.train [wp|conversion|fg|punt ...]`.

With no arguments, every model is trained. Each one writes its artifact to models/artifacts/
and its metrics + plots to models/reports/.
"""

from __future__ import annotations

import sys
import time
import warnings

from models import wp

STEPS = {"wp": wp.run}


def main(argv: list[str]) -> int:
    warnings.filterwarnings("ignore", category=FutureWarning)
    selected = argv or list(STEPS)
    unknown = [s for s in selected if s not in STEPS]
    if unknown:
        print(f"unknown model(s): {unknown}; choose from {list(STEPS)}")
        return 2
    for name in selected:
        started = time.perf_counter()
        STEPS[name]()
        print(f"[{name}] done in {time.perf_counter() - started:.0f}s\n")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
