"""Ekspor data eksperimen SCARA dari SQLite ke CSV yang seragam."""

from __future__ import annotations

import argparse
import csv
import math
import re
import sqlite3
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, Iterator


CSV_FIELDS = [
    "experiment_id",
    "source_experiment_id",
    "source_table",
    "run_id",
    "run_name",
    "condition",
    "direction",
    "tilt_deg",
    "repetition",
    "shared_baseline",
    "sample_index",
    "time_s",
    "phase",
    "x_reference_mm",
    "y_reference_mm",
    "x_actual_mm",
    "y_actual_mm",
    "eef_error_mm",
    "cross_track_error_mm",
    "along_track_error_mm",
    "theta1_reference_rad",
    "theta1_actual_rad",
    "theta1_error_deg",
    "theta2_reference_rad",
    "theta2_actual_rad",
    "theta2_error_deg",
    "pwm1",
    "control_effort_j1",
]

EXPERIMENT_FILES = {
    "EXP-1": "exp1_tracking_differentiator.csv",
    "EXP-2": "exp2_inertia_compensation.csv",
    "EXP-3": "exp3_coriolis_compensation.csv",
    "EXP-4": "exp4_gravity_compensation.csv",
    "EXP-5": "exp5_trapezoidal_profile.csv",
}

GRAVITY_NAME = re.compile(
    r"^g(?P<state>on|of)(?P<direction>f|b)?(?P<angle>10|5)?(?P<rep>[12])$"
)


@dataclass(frozen=True)
class RunSelection:
    experiment_id: str
    source_experiment_id: str
    source_table: str
    run_id: str
    run_name: str
    condition: str
    direction: str
    tilt_deg: int
    repetition: int
    shared_baseline: int = 0


def parse_args() -> argparse.Namespace:
    default_output = Path(__file__).resolve().parents[1] / "data" / "experiments"
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("database", type=Path, help="Jalur menuju tugasakhir.db")
    parser.add_argument("--output", type=Path, default=default_output)
    return parser.parse_args()


def direction_label(value: object, x0: float, y0: float, xf: float, yf: float) -> str:
    text = str(value or "").strip().lower()
    if text in {"forward", "maju", "f"}:
        return "forward"
    if text in {"return", "backward", "balik", "b"}:
        return "return"
    return "forward" if xf < x0 and yf > y0 else "return"


def parse_gravity_name(name: str) -> tuple[int, str, str, int] | None:
    match = GRAVITY_NAME.fullmatch(name.lower().replace("-", "").replace("_", ""))
    if not match:
        return None
    tilt = int(match.group("angle") or 15)
    state = match.group("state")
    compensation_on = state == "of" if tilt in {5, 10} else state == "on"
    direction = "forward" if match.group("direction") == "f" else "return"
    return tilt, "on" if compensation_on else "off", direction, int(match.group("rep"))


def experiment_selection(
    row: sqlite3.Row,
    target: str,
    condition: str,
    shared_baseline: int = 0,
) -> RunSelection:
    direction = direction_label(
        row["direction"], row["p0_x"], row["p0_y"], row["pf_x"], row["pf_y"]
    )
    return RunSelection(
        experiment_id=target,
        source_experiment_id=row["experiment_id"],
        source_table="experiment_samples",
        run_id=row["id"],
        run_name=f"{row['experiment_id']}-{row['run_number']}",
        condition=condition,
        direction=direction,
        tilt_deg=0,
        repetition=int(row["run_number"]),
        shared_baseline=shared_baseline,
    )


def collect_selections(connection: sqlite3.Connection) -> dict[str, list[RunSelection]]:
    rows = list(
        connection.execute(
            "SELECT * FROM experiment_runs ORDER BY experiment_id, run_number, id"
        )
    )
    by_id: dict[str, list[sqlite3.Row]] = {}
    for row in rows:
        by_id.setdefault(row["experiment_id"], []).append(row)

    selected: dict[str, list[RunSelection]] = {key: [] for key in EXPERIMENT_FILES}

    for row in by_id.get("EXP-1", []):
        condition = "on" if int(row["td_enabled"] or 0) else "off"
        selected["EXP-1"].append(experiment_selection(row, "EXP-1", condition))

    for row in by_id.get("BASELINE", []):
        selected["EXP-2"].append(experiment_selection(row, "EXP-2", "off", 1))
    for row in by_id.get("EXP-2", []):
        selected["EXP-2"].append(experiment_selection(row, "EXP-2", "on"))

    for row in by_id.get("EXP-2", []):
        selected["EXP-3"].append(experiment_selection(row, "EXP-3", "off", 1))
    for row in by_id.get("EXP-3", []):
        selected["EXP-3"].append(experiment_selection(row, "EXP-3", "on"))

    for row in by_id.get("EXP-5", []):
        condition = "on" if int(row["trap_enabled"] or 0) else "off"
        selected["EXP-5"].append(experiment_selection(row, "EXP-5", condition))

    for condition in ("off", "on"):
        for row in by_id.get("BASELINE", []):
            selected["EXP-4"].append(experiment_selection(row, "EXP-4", condition, 1))

    for row in connection.execute("SELECT * FROM runs ORDER BY name, id"):
        parsed = parse_gravity_name(row["name"] or "")
        if parsed is None:
            continue
        tilt, condition, direction, repetition = parsed
        selected["EXP-4"].append(
            RunSelection(
                experiment_id="EXP-4",
                source_experiment_id="EXP-4",
                source_table="trajectory_points",
                run_id=row["id"],
                run_name=row["name"],
                condition=condition,
                direction=direction,
                tilt_deg=tilt,
                repetition=repetition,
            )
        )

    return selected


def clean_number(value: object, digits: int = 6) -> str:
    if value is None:
        return ""
    number = float(value)
    if not math.isfinite(number):
        return ""
    return f"{number:.{digits}f}".rstrip("0").rstrip(".")


def path_errors(
    x_ref: float,
    y_ref: float,
    x_actual: float,
    y_actual: float,
    start: tuple[float, float],
    target: tuple[float, float],
) -> tuple[float, float, float]:
    dx = target[0] - start[0]
    dy = target[1] - start[1]
    length = math.hypot(dx, dy)
    if length == 0:
        return math.nan, math.nan, math.nan
    tx, ty = dx / length, dy / length
    nx, ny = -ty, tx
    eef = math.hypot(x_actual - x_ref, y_actual - y_ref)
    cte = abs((x_actual - start[0]) * nx + (y_actual - start[1]) * ny)
    actual_along = (x_actual - start[0]) * tx + (y_actual - start[1]) * ty
    reference_along = (x_ref - start[0]) * tx + (y_ref - start[1]) * ty
    return eef, cte, abs(actual_along - reference_along)


def base_record(selection: RunSelection, sample_index: int) -> dict[str, object]:
    record: dict[str, object] = {field: "" for field in CSV_FIELDS}
    record.update(
        {
            "experiment_id": selection.experiment_id,
            "source_experiment_id": selection.source_experiment_id,
            "source_table": selection.source_table,
            "run_id": selection.run_id,
            "run_name": selection.run_name,
            "condition": selection.condition,
            "direction": selection.direction,
            "tilt_deg": selection.tilt_deg,
            "repetition": selection.repetition,
            "shared_baseline": selection.shared_baseline,
            "sample_index": sample_index,
        }
    )
    return record


def experiment_rows(
    connection: sqlite3.Connection, selection: RunSelection
) -> Iterator[dict[str, object]]:
    run = connection.execute(
        "SELECT p0_x, p0_y, pf_x, pf_y FROM experiment_runs WHERE id = ?",
        (selection.run_id,),
    ).fetchone()
    if run is None:
        raise ValueError(f"Run tidak ditemukan: {selection.run_id}")
    start = (float(run["p0_x"]), float(run["p0_y"]))
    target = (float(run["pf_x"]), float(run["pf_y"]))
    samples = connection.execute(
        """
        SELECT id, t_ms, phase, x_desired, y_desired, x_actual, y_actual,
               theta1_d, theta1, theta2_d, theta2, pwm1, u1_total
        FROM experiment_samples
        WHERE run_id = ?
        ORDER BY t_ms, id
        """,
        (selection.run_id,),
    )
    for index, sample in enumerate(samples):
        x_ref = float(sample["x_desired"])
        y_ref = float(sample["y_desired"])
        x_actual = float(sample["x_actual"])
        y_actual = float(sample["y_actual"])
        eef, cte, ate = path_errors(x_ref, y_ref, x_actual, y_actual, start, target)
        record = base_record(selection, index)
        record.update(
            {
                "time_s": clean_number(float(sample["t_ms"]) / 1000.0, 3),
                "phase": sample["phase"] or "",
                "x_reference_mm": clean_number(x_ref, 4),
                "y_reference_mm": clean_number(y_ref, 4),
                "x_actual_mm": clean_number(x_actual, 4),
                "y_actual_mm": clean_number(y_actual, 4),
                "eef_error_mm": clean_number(eef, 4),
                "cross_track_error_mm": clean_number(cte, 4),
                "along_track_error_mm": clean_number(ate, 4),
                "theta1_reference_rad": clean_number(sample["theta1_d"]),
                "theta1_actual_rad": clean_number(sample["theta1"]),
                "theta1_error_deg": clean_number(
                    math.degrees(float(sample["theta1"]) - float(sample["theta1_d"])), 4
                ),
                "theta2_reference_rad": clean_number(sample["theta2_d"]),
                "theta2_actual_rad": clean_number(sample["theta2"]),
                "theta2_error_deg": clean_number(
                    math.degrees(float(sample["theta2"]) - float(sample["theta2_d"])), 4
                ),
                "pwm1": clean_number(sample["pwm1"], 0),
                "control_effort_j1": clean_number(sample["u1_total"]),
            }
        )
        yield record


def trajectory_rows(
    connection: sqlite3.Connection, selection: RunSelection
) -> Iterator[dict[str, object]]:
    samples = list(
        connection.execute(
            """
            SELECT seq, xi, yi, xa, ya
            FROM trajectory_points
            WHERE run_id = ?
            ORDER BY seq, id
            """,
            (selection.run_id,),
        )
    )
    if not samples:
        raise ValueError(f"Run gravitasi tanpa sampel posisi: {selection.run_name}")
    start = (float(samples[0]["xi"]), float(samples[0]["yi"]))
    target = (float(samples[-1]["xi"]), float(samples[-1]["yi"]))
    for index, sample in enumerate(samples):
        x_ref = float(sample["xi"])
        y_ref = float(sample["yi"])
        x_actual = float(sample["xa"])
        y_actual = float(sample["ya"])
        eef, cte, ate = path_errors(x_ref, y_ref, x_actual, y_actual, start, target)
        record = base_record(selection, index)
        record.update(
            {
                "x_reference_mm": clean_number(x_ref, 4),
                "y_reference_mm": clean_number(y_ref, 4),
                "x_actual_mm": clean_number(x_actual, 4),
                "y_actual_mm": clean_number(y_actual, 4),
                "eef_error_mm": clean_number(eef, 4),
                "cross_track_error_mm": clean_number(cte, 4),
                "along_track_error_mm": clean_number(ate, 4),
            }
        )
        yield record


def selection_rows(
    connection: sqlite3.Connection, selection: RunSelection
) -> Iterable[dict[str, object]]:
    if selection.source_table == "experiment_samples":
        return experiment_rows(connection, selection)
    return trajectory_rows(connection, selection)


def export_csvs(
    connection: sqlite3.Connection,
    selections: dict[str, list[RunSelection]],
    output: Path,
) -> None:
    output.mkdir(parents=True, exist_ok=True)
    manifest: list[dict[str, object]] = []

    for experiment_id, filename in EXPERIMENT_FILES.items():
        path = output / filename
        row_count = 0
        run_ids: set[str] = set()
        references = selections[experiment_id]
        with path.open("w", encoding="utf-8", newline="") as handle:
            writer = csv.DictWriter(handle, fieldnames=CSV_FIELDS)
            writer.writeheader()
            for selection in references:
                run_ids.add(selection.run_id)
                for record in selection_rows(connection, selection):
                    writer.writerow(record)
                    row_count += 1
        manifest.append(
            {
                "experiment_id": experiment_id,
                "file_name": filename,
                "run_references": len(references),
                "unique_runs": len(run_ids),
                "sample_rows": row_count,
                "notes": "BASELINE digunakan bersama" if any(s.shared_baseline for s in references) else "",
            }
        )

    manifest_path = output / "dataset_manifest.csv"
    fields = ["experiment_id", "file_name", "run_references", "unique_runs", "sample_rows", "notes"]
    with manifest_path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        writer.writerows(manifest)


def main() -> None:
    args = parse_args()
    database = args.database.resolve()
    if not database.is_file():
        raise SystemExit(f"Basis data tidak ditemukan: {database}")

    uri = f"file:{database.as_posix()}?mode=ro"
    with sqlite3.connect(uri, uri=True) as connection:
        connection.row_factory = sqlite3.Row
        selections = collect_selections(connection)
        export_csvs(connection, selections, args.output.resolve())

    print(f"CSV selesai dibuat pada {args.output.resolve()}")


if __name__ == "__main__":
    main()
