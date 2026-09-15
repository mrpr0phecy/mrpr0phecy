#!/usr/bin/env python3
"""Validate the staff measurement contract.

This is deliberately a schema/content gate, not a fake analytics system. It
ensures every metric has an instrument, cadence, owner and decision use, while
allowing the honest state "not-measured". No numbers are derived or invented
here.
"""
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCOREBOARD = ROOT / "staff" / "scoreboard.json"
ROSTER = ROOT / "scripts" / "ai-staff.json"

VALID_STATUS = {"not-measured", "owner-measurement-required", "measured-by-gates"}
VALID_DIRECTION = {"higher", "lower", "contextual", "higher quality", "lower without quality loss"}
REQUIRED_METRIC_KEYS = {
    "id", "name", "unit", "source", "cadence", "status", "direction", "decision", "guardrail"
}


def fail(message: str) -> None:
    raise SystemExit(f"SCOREBOARD FAIL: {message}")


def non_empty(value, label: str) -> None:
    if not isinstance(value, str) or not value.strip():
        fail(f"{label} must be non-empty text")


def main() -> int:
    try:
        data = json.loads(SCOREBOARD.read_text(encoding="utf-8"))
        roster = json.loads(ROSTER.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        fail(f"cannot read JSON: {exc}")

    if data.get("version") != 2:
        fail("staff/scoreboard.json must use version 2")
    non_empty(data.get("updated"), "updated")
    non_empty(data.get("purpose"), "purpose")

    owners = {member.get("id") for member in roster.get("members", [])}
    if "measurement" not in owners:
        fail("measurement owner is missing from scripts/ai-staff.json")

    north_stars = data.get("northStars")
    if not isinstance(north_stars, list) or {row.get("product") for row in north_stars} != {"tools", "music"}:
        fail("northStars must contain separate tools and music outcomes")
    for index, row in enumerate(north_stars):
        for key in ("product", "metric", "definition", "status", "owner"):
            non_empty(row.get(key), f"northStars[{index}].{key}")
        if row["status"] not in VALID_STATUS:
            fail(f"northStars[{index}] has unsupported status {row['status']!r}")
        if row["owner"] not in owners:
            fail(f"northStars[{index}] has unknown owner {row['owner']!r}")

    decision_rules = data.get("decisionRules")
    if not isinstance(decision_rules, dict):
        fail("decisionRules must be an object")
    if decision_rules.get("workInProgressLimitPerSession") != 1:
        fail("decisionRules must keep one primary work item per session")
    for key, minimum in (("hardGates", 3), ("selectionOrder", 5), ("tieBreakers", 3)):
        values = decision_rules.get(key)
        if not isinstance(values, list) or len(values) < minimum:
            fail(f"decisionRules.{key} must contain at least {minimum} rules")
        for index, value in enumerate(values):
            non_empty(value, f"decisionRules.{key}[{index}]")

    groups = data.get("metricGroups")
    if not isinstance(groups, list) or len(groups) < 5:
        fail("at least five metric groups are required")

    group_ids: set[str] = set()
    metric_ids: set[str] = set()
    metrics = []
    for group_index, group in enumerate(groups):
        group_id = group.get("id")
        non_empty(group_id, f"metricGroups[{group_index}].id")
        if group_id in group_ids:
            fail(f"duplicate metric group {group_id}")
        group_ids.add(group_id)
        non_empty(group.get("name"), f"metricGroups[{group_index}].name")
        non_empty(group.get("product"), f"metricGroups[{group_index}].product")
        if group.get("owner") not in owners:
            fail(f"metric group {group_id} has unknown owner {group.get('owner')!r}")
        rows = group.get("metrics")
        if not isinstance(rows, list) or not rows:
            fail(f"metric group {group_id} has no metrics")
        for metric_index, metric in enumerate(rows):
            missing = REQUIRED_METRIC_KEYS - metric.keys()
            if missing:
                fail(f"{group_id}[{metric_index}] missing {', '.join(sorted(missing))}")
            metric_id = metric["id"]
            non_empty(metric_id, f"{group_id}[{metric_index}].id")
            if metric_id in metric_ids:
                fail(f"duplicate metric {metric_id}")
            metric_ids.add(metric_id)
            for key in ("name", "unit", "source", "cadence", "decision"):
                non_empty(metric[key], f"{metric_id}.{key}")
            if metric["status"] not in VALID_STATUS:
                fail(f"{metric_id} has unsupported status {metric['status']!r}")
            if metric["direction"] not in VALID_DIRECTION:
                fail(f"{metric_id} has unsupported direction {metric['direction']!r}")
            if not isinstance(metric["guardrail"], bool):
                fail(f"{metric_id}.guardrail must be boolean")
            metrics.append(metric)

    if len(metrics) < 20:
        fail("the scoreboard must cover at least 20 decision-useful metrics")
    if not any(metric["guardrail"] for metric in metrics):
        fail("at least one guardrail metric is required")

    rules = data.get("experimentRules")
    if not isinstance(rules, list) or len(rules) < 5:
        fail("at least five experiment rules are required")
    for index, rule in enumerate(rules):
        non_empty(rule, f"experimentRules[{index}]")

    print(
        f"scoreboard OK — {len(groups)} metric groups, {len(metrics)} metrics, "
        f"{len(rules)} experiment rules, one-item decision ladder; no invented baselines"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
