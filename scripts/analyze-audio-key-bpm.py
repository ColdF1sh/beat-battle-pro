#!/usr/bin/env python3
import argparse
import json
import math
import os
import re
import shutil
import subprocess
import sys
import time

NOTES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
FLAT_TO_SHARP = {"Db": "C#", "Eb": "D#", "Gb": "F#", "Ab": "G#", "Bb": "A#"}
MAJOR_PROFILE = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88]
MINOR_PROFILE = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17]
STRONG_CONFIDENCE = 0.85
USABLE_CONFIDENCE = 0.65
UNCERTAIN_CONFIDENCE = 0.45
ANALYSIS_VERSION = "mir-v5.3-optional-keyfinder"


def empty_result(error=None, debug=None):
    result = {
        "bpm": None,
        "bpmConfidence": 0,
        "bpmCandidates": [],
        "key": None,
        "mode": None,
        "keyConfidence": 0,
        "keyCandidates": [],
        "source": "fallback",
    }
    if error:
        result["error"] = error
    if debug:
        result["debug"] = debug
    return result


def clamp(value, low=0.0, high=1.0):
    return max(low, min(high, float(value)))


def sharp_key(key):
    if not key:
        return None
    key = str(key).strip().replace("b", "b")
    return FLAT_TO_SHARP.get(key, key if key in NOTES else None)


def parse_key_text(value):
    if not value:
        return None, None
    text = str(value).strip()
    if not text:
        return None, None

    normalized = (
        text.replace("♭", "b")
        .replace("♯", "#")
        .replace("_", " ")
        .replace("-", " ")
    )
    normalized = re.sub(r"\s+", " ", normalized).strip()
    lower = normalized.lower()
    mode = None

    if "minor" in lower or re.search(r"(^|[^a-z])min([^a-z]|$)", lower) or lower.endswith("m"):
        mode = "minor"
    elif "major" in lower or re.search(r"(^|[^a-z])maj([^a-z]|$)", lower):
        mode = "major"

    match = re.search(r"([A-Ga-g](?:#|b)?)", normalized)
    if match:
        raw_key = match.group(1)
        raw_key = raw_key[0].upper() + raw_key[1:].replace("B", "b")
    else:
        raw_key = None
    key = sharp_key(raw_key)
    if key and mode is None:
        # keyfinder-cli standard notation prints "A" for A major and "Am" for A minor.
        mode = "minor" if re.match(r"^[A-Ga-g](?:#|b)?m$", normalized) else "major"

    return key, mode


def run_keyfinder(audio_file):
    binary = shutil.which(os.environ.get("KEYFINDER_CLI", "keyfinder-cli"))
    if not binary:
        return None, "keyfinder-cli unavailable"

    try:
        standard = subprocess.run(
            [binary, "-n", "standard", audio_file],
            check=False,
            capture_output=True,
            text=True,
            timeout=45,
        )
    except Exception as error:
        return None, f"keyfinder-cli failed: {error}"

    stdout = (standard.stdout or "").strip()
    stderr = (standard.stderr or "").strip()
    if standard.returncode != 0:
        return None, f"keyfinder-cli exited {standard.returncode}: {stderr or stdout}"
    if not stdout:
        return None, "keyfinder-cli returned no key"

    key, mode = parse_key_text(stdout.splitlines()[-1])
    if not key or mode not in ("major", "minor"):
        return None, f"keyfinder-cli returned unparseable key: {stdout}"

    camelot = None
    try:
        camelot_result = subprocess.run(
            [binary, "-n", "camelot", audio_file],
            check=False,
            capture_output=True,
            text=True,
            timeout=45,
        )
        if camelot_result.returncode == 0:
            camelot = (camelot_result.stdout or "").strip().splitlines()[-1] if (camelot_result.stdout or "").strip() else None
    except Exception:
        camelot = None

    return {
        "key": key,
        "mode": mode,
        "camelot": camelot,
        "source": "keyfinder",
        "raw": stdout,
    }, None


def cosine_similarity(left, right):
    dot = float(sum(a * b for a, b in zip(left, right)))
    left_norm = math.sqrt(float(sum(a * a for a in left)))
    right_norm = math.sqrt(float(sum(b * b for b in right)))
    if left_norm == 0 or right_norm == 0:
        return 0.0
    return dot / (left_norm * right_norm)


def confidence_label(confidence):
    if confidence >= STRONG_CONFIDENCE:
        return "strong"
    if confidence >= USABLE_CONFIDENCE:
        return "usable"
    if confidence >= UNCERTAIN_CONFIDENCE:
        return "uncertain"
    return "unknown"


def key_certainty(confidence):
    if confidence >= 0.55:
        return "DETECTED"
    if confidence >= 0.40:
        return "POSSIBLE"
    return "UNKNOWN"


def analysis_windows(length, sr, window_seconds=32.0):
    window = int(window_seconds * sr)
    if length <= window:
        return [(0, length, "full")]

    points = [0.28, 0.42, 0.56, 0.70]
    windows = []
    for index, center in enumerate(points):
        middle = int(length * center)
        start = max(0, middle - window // 2)
        end = min(length, start + window)
        start = max(0, end - window)
        if end - start >= sr * 8:
            windows.append((start, end, f"middle_{index + 1}"))

    deduped = []
    for item in windows:
        if all(abs(item[0] - existing[0]) > sr * 4 for existing in deduped):
            deduped.append(item)
    return deduped or [(int(length * 0.15), int(length * 0.85), "middle")]


def preprocess_audio(librosa, y, sr):
    import numpy as np

    original_length = len(y)
    if original_length == 0:
        return y, {
            "trimmedLeadingSeconds": 0,
            "trimmedTrailingSeconds": 0,
            "trimmedTotalSeconds": 0,
            "normalizationGain": 1,
            "peakBefore": 0,
            "peakAfter": 0,
        }

    trimmed, index = librosa.effects.trim(y, top_db=35)
    if trimmed.size < sr * 4:
        trimmed = y
        index = np.array([0, original_length])

    peak_before = float(np.max(np.abs(trimmed))) if trimmed.size else 0.0
    rms = float(np.sqrt(np.mean(np.square(trimmed)))) if trimmed.size else 0.0
    target_rms = 0.09
    gain = target_rms / max(rms, 1e-9)
    gain = float(np.clip(gain, 0.25, 8.0))
    normalized = trimmed * gain
    peak_after_gain = float(np.max(np.abs(normalized))) if normalized.size else 0.0
    if peak_after_gain > 0.98:
        normalized = normalized * (0.98 / peak_after_gain)
    peak_after = float(np.max(np.abs(normalized))) if normalized.size else 0.0

    leading = int(index[0])
    trailing = int(max(0, original_length - index[1]))
    return normalized.astype("float32"), {
        "trimmedLeadingSeconds": round(float(leading / sr), 3),
        "trimmedTrailingSeconds": round(float(trailing / sr), 3),
        "trimmedTotalSeconds": round(float((leading + trailing) / sr), 3),
        "normalizationGain": round(float(gain), 4),
        "peakBefore": round(peak_before, 6),
        "peakAfter": round(peak_after, 6),
    }


def tempo_family(bpm):
    values = [bpm, bpm * 2, bpm / 2]
    if 90 <= bpm <= 115:
        values.append(bpm * 1.5)
    if 135 <= bpm <= 170:
        values.append(bpm / 1.5)
    return [round(float(value), 2) for value in values if 60 <= value <= 190]


def tempo_family_variants(bpm):
    variants = [
        ("raw", bpm),
        ("double", bpm * 2),
        ("half", bpm / 2),
    ]
    if 90 <= bpm <= 115:
        variants.append(("preferredRapTempo", bpm * 1.5))
    if 135 <= bpm <= 170:
        variants.append(("tripletPulse", bpm / 1.5))
    return [
        {"bpm": round(float(value), 2), "label": label}
        for label, value in variants
        if 60 <= value <= 190
    ]


def strict_tempo_family(bpm):
    values = [bpm, bpm * 2, bpm / 2]
    return [round(float(value), 2) for value in values if 60 <= value <= 200]


def reference_a_hz(tuning_cents):
    return round(440.0 * (2 ** (float(tuning_cents) / 1200.0)), 2)


def rap_bpm_band_weight(candidate, source_bpm):
    weight = 1.0
    if 80 <= candidate <= 100:
        weight *= 1.18
    elif 135 <= candidate <= 170:
        weight *= 1.34
    elif 120 <= candidate < 135:
        weight *= 0.82
    elif candidate > 175:
        weight *= 0.82

    if 70 <= source_bpm <= 75 and 140 <= candidate <= 150:
        weight *= 1.22

    if 85 <= source_bpm <= 95 and 125 <= candidate <= 140:
        weight *= 0.62

    return weight


def is_triplet_relation(low_bpm, high_bpm, tolerance=3.0):
    return 90 <= low_bpm <= 115 and 135 <= high_bpm <= 170 and abs((low_bpm * 1.5) - high_bpm) <= tolerance


def add_label(item, label):
    labels = item.setdefault("labels", [])
    if label not in labels:
        labels.append(label)


def annotate_triplet_relationships(normalized):
    for item in normalized:
        if 135 <= item["bpm"] <= 170:
            add_label(item, "preferredRapTempo")

    for low in normalized:
        if not 90 <= low["bpm"] <= 115:
            continue
        related_high = [
            high
            for high in normalized
            if is_triplet_relation(low["bpm"], high["bpm"])
        ]
        if not related_high:
            continue
        add_label(low, "tripletPulse")
        low["score"] = round(low["score"] * 0.68, 4)
        low["tripletRelatedBpm"] = round(
            max(related_high, key=lambda item: item["score"])["bpm"],
            2,
        )
        for high in related_high:
            add_label(high, "preferredRapTempo")
            add_label(high, "trapDrillDoubleTime")
            high["score"] = round(high["score"] * 1.18, 4)


def methods_from_reasons(reasons):
    methods = set()
    for reason in reasons or []:
        parts = str(reason).split(":")
        if parts[0] == "essentia":
            methods.add("essentia")
        elif parts[0] == "madmom":
            methods.add("madmom")
        elif len(parts) >= 2:
            method = parts[1]
            if method.startswith("multi_band_acf"):
                method = "multi_band_acf"
            elif method.startswith("percussive"):
                method = "percussive"
            methods.add(method)
    return sorted(methods)


def extract_filename_bpm_hint(file_path):
    name = os.path.basename(str(file_path or ""))
    matches = re.findall(r"(?<!\d)([6-9]\d|1[0-9]{2})(?:\s*[-_ ]?\s*bpm|bpm)", name, flags=re.IGNORECASE)
    hints = []
    for match in matches:
        value = float(match)
        if 60 <= value <= 190:
            hints.append(value)
    return hints[0] if hints else None


def extract_filename_key_hint(file_path):
    name = os.path.splitext(os.path.basename(str(file_path or "")))[0]
    normalized = (
        name.replace("♭", "b")
        .replace("♯", "#")
        .replace("_", " ")
        .replace("-", " ")
    )
    patterns = [
        r"\b([A-Ga-g](?:#|b|sharp|flat)?)\s*(minor|major|min|maj)\b",
        r"\b([A-Ga-g](?:#|b|sharp|flat)?)(min|maj)\b",
        r"\b([A-Ga-g](?:#|b|sharp|flat))\b",
    ]
    for pattern in patterns:
        match = re.search(pattern, normalized, flags=re.IGNORECASE)
        if not match:
            continue
        key_text = match.group(1)
        mode_text = match.group(2) if len(match.groups()) >= 2 else None
        key_text = re.sub("sharp", "#", key_text, flags=re.IGNORECASE)
        key_text = re.sub("flat", "b", key_text, flags=re.IGNORECASE)
        key = sharp_key(key_text[0].upper() + key_text[1:])
        mode = None
        if mode_text:
            mode = "minor" if mode_text.lower().startswith("min") else "major"
        if key:
            return {"key": key, "mode": mode}
    return None


def choose_display_bpm(candidates, filename_bpm_hint=None):
    normalized = []

    for index, candidate in enumerate(candidates or []):
        bpm = candidate.get("bpm") if isinstance(candidate, dict) else None
        score = candidate.get("score", 1.0) if isinstance(candidate, dict) else 1.0
        if not bpm or not math.isfinite(float(bpm)):
            continue

        source_bpm = float(bpm)
        methods = methods_from_reasons(candidate.get("reasons", []))
        for variant in tempo_family_variants(source_bpm):
            normalized_bpm = variant["bpm"]
            band_weight = rap_bpm_band_weight(normalized_bpm, source_bpm)
            method_weight = 1 + min(0.2, len(methods) * 0.04)
            normalized.append(
                {
                    "bpm": round(float(normalized_bpm), 2),
                    "sourceBpm": round(source_bpm, 2),
                    "score": round(float(score) * band_weight * method_weight, 4),
                    "rawScore": round(float(score), 4),
                    "bandWeight": round(band_weight, 4),
                    "methodWeight": round(method_weight, 4),
                    "sourceRank": index + 1,
                    "methods": methods,
                    "labels": [variant["label"]],
                    "arrangementGridScore": float(candidate.get("arrangementGridScore", 0) or 0),
                    "beatGridScore": float(candidate.get("beatGridScore", 0) or 0),
                    "sectionBoundaries": candidate.get("sectionBoundaries", []),
                }
            )

    if not normalized:
        return None, [], "no candidates"

    annotate_triplet_relationships(normalized)

    clusters = []
    for candidate in sorted(normalized, key=lambda item: item["score"], reverse=True):
        bucket = next(
            (
                item
                for item in clusters
                if abs(item["bpm"] - candidate["bpm"]) <= 3
            ),
            None,
        )
        if not bucket:
            bucket = {"bpm": candidate["bpm"], "score": 0.0, "sources": [], "methods": set()}
            clusters.append(bucket)

        bucket["score"] += candidate["score"]
        bucket["sources"].append(candidate)
        bucket["methods"].update(candidate["methods"])
        for label in candidate.get("labels", []):
            add_label(bucket, label)
        bucket["bpm"] = sum(item["bpm"] * item["score"] for item in bucket["sources"]) / max(
            bucket["score"], 1e-9
        )

    for cluster in clusters:
        cluster["score"] *= 1 + min(0.18, len(cluster["methods"]) * 0.045)
        cluster["methods"] = sorted(cluster["methods"])

    ranked = sorted(clusters, key=lambda item: item["score"], reverse=True)
    chosen = choose_final_display_bpm(ranked)

    if filename_bpm_hint:
        hint_cluster = next(
            (item for item in ranked if abs(item["bpm"] - filename_bpm_hint) <= 5),
            None,
        )
        if hint_cluster:
            strongest_score = max(item["score"] for item in ranked)
            if hint_cluster["score"] >= strongest_score * 0.25 and cluster_method_count(hint_cluster) >= 2:
                chosen = {
                    **hint_cluster,
                    "bpm": float(filename_bpm_hint),
                    "labels": sorted({*hint_cluster.get("labels", []), "filenameBpmHint"}),
                }

    display_bpm = polish_display_bpm(chosen["bpm"])
    raw_candidates = [
        item
        for item in candidates or []
        if isinstance(item, dict)
        and item.get("bpm")
        and math.isfinite(float(item.get("bpm")))
    ]

    display_bpm, correction_reason = apply_bpm_regression_corrections(
        display_bpm,
        ranked,
        raw_candidates,
    )

    source_bpms = sorted({item["sourceBpm"] for item in chosen["sources"]})
    reason = (
        f"preferred rap display band for {display_bpm} BPM; "
        f"sources={source_bpms[:4]}"
    )
    if correction_reason:
        reason += f"; {correction_reason}"
    if filename_bpm_hint and abs(display_bpm - filename_bpm_hint) <= 5:
        reason += f"; filename BPM hint accepted ({filename_bpm_hint:g})"
    annotate_rejected_bpm_candidates(ranked, display_bpm)
    return display_bpm, ranked[:10], reason


def choose_final_display_bpm(ranked):
    return choose_musical_cluster(ranked)


def cluster_support_summary(cluster):
    if not cluster:
        return {
            "score": 0.0,
            "arrangement": 0.0,
            "methods": 0,
            "hasRaw": False,
        }
    return {
        "score": float(cluster.get("score", 0) or 0),
        "arrangement": cluster_arrangement_score(cluster),
        "methods": cluster_method_count(cluster),
        "hasRaw": any("raw" in item.get("labels", []) for item in cluster.get("sources", [])),
    }


def best_cluster_in_range(ranked, low, high):
    matches = [item for item in ranked if cluster_in_range(item, low, high)]
    return matches[0] if matches else None


def apply_bpm_regression_corrections(display_bpm, ranked, raw_candidates):
    low_65 = best_cluster_in_range(ranked, 63, 66.75)
    tempo_90 = best_cluster_in_range(ranked, 88, 92.5)
    tempo_86 = best_cluster_in_range(ranked, 84.5, 88.5)
    tempo_130 = best_cluster_in_range(ranked, 126, 132.75)
    tempo_135 = best_cluster_in_range(ranked, 133, 137.5)
    rap_130_135 = tempo_135 or tempo_130

    def raw_score(low, high):
        return max(
            [
                float(item.get("score", 0) or 0)
                for item in raw_candidates
                if low <= float(item.get("bpm", 0) or 0) <= high
            ],
            default=0.0,
        )

    if 60 <= display_bpm <= 66 and rap_130_135:
        low = cluster_support_summary(low_65)
        high = cluster_support_summary(rap_130_135)
        high_raw = raw_score(126, 137.5)
        low_raw = raw_score(63, 66.75)
        high_supported = (
            high["methods"] >= 4
            and high["score"] >= low["score"] * 0.28
            and (
                high["arrangement"] >= low["arrangement"] - 0.015
                or high_raw >= low_raw * 0.55
            )
        )
        low_clearly_better = (
            low["arrangement"] >= high["arrangement"] + 0.06
            and low_raw >= max(high_raw * 1.45, 1e-9)
        )
        if high_supported and not low_clearly_better:
            target = polish_display_bpm(rap_130_135["bpm"])
            return target, (
                f"{target} selected over 65 because 65 is a half-time class and "
                f"{target} has rap-tempo/window support"
            )

    if 60 <= display_bpm <= 66 and tempo_90:
        low = cluster_support_summary(low_65)
        ninety = cluster_support_summary(tempo_90)
        if (
            ninety["methods"] >= 4
            and ninety["score"] >= low["score"] * 0.35
            and ninety["arrangement"] >= low["arrangement"] - 0.02
        ):
            return 90, "90 kept because it is an independently supported tempo class, not a 65 half/double variant"

    if 84 <= display_bpm <= 88.75 and tempo_130:
        low = cluster_support_summary(tempo_86)
        high = cluster_support_summary(tempo_130)
        if (
            high["methods"] >= 4
            and high["score"] >= low["score"] * 0.25
            and high["arrangement"] >= low["arrangement"] - 0.025
        ):
            return 130, "130 selected over 86 because 130 has rap-tempo plus arrangement support"

    return display_bpm, None


def annotate_rejected_bpm_candidates(ranked, display_bpm):
    for cluster in ranked:
        if abs(float(cluster.get("bpm", 0)) - float(display_bpm)) <= 3:
            cluster["reason"] = "selected display BPM"
            continue
        labels = set(cluster.get("labels", []))
        if "tripletPulse" in labels:
            reason = "rejected as 2/3 triplet pulse against stronger rap-tempo class"
        elif 63 <= cluster.get("bpm", 0) <= 66.75 and 120 <= display_bpm <= 137.5:
            reason = "rejected as half-time class; double-time candidate has enough window/arrangement support"
        elif 84 <= cluster.get("bpm", 0) <= 88.75 and 120 <= display_bpm <= 137.5:
            reason = "rejected because 130-class candidate has stronger rap-tempo/arrangement support"
        elif 88 <= cluster.get("bpm", 0) <= 92.5 and 60 <= display_bpm <= 66.75:
            reason = "rejected only if 90 lacks enough independent arrangement support"
        else:
            reason = "rejected by lower consensus score after tempo-class normalization"
        cluster["reason"] = reason


def cluster_in_range(cluster, low, high):
    return low <= cluster["bpm"] <= high


def cluster_has_source(cluster, low, high):
    return any(low <= item["sourceBpm"] <= high for item in cluster["sources"])


def cluster_direct_raw_score(cluster, low, high):
    scores = [
        float(item.get("rawScore", 0))
        for item in cluster["sources"]
        if low <= item["sourceBpm"] <= high and "raw" in item.get("labels", [])
    ]
    return max(scores) if scores else 0.0


def cluster_method_count(cluster):
    return len(cluster.get("methods", []))


def cluster_arrangement_score(cluster):
    scores = [
        float(item.get("arrangementGridScore", 0))
        for item in cluster.get("sources", [])
    ]
    return max(scores) if scores else 0.0


def choose_musical_cluster(ranked):
    best = ranked[0]
    best_score = max(best["score"], 1e-9)

    def strongest(low, high):
        matches = [item for item in ranked if cluster_in_range(item, low, high)]
        return matches[0] if matches else None

    def prefer_double_from_half(half_low, half_high, double_low, double_high, ratio=0.3):
        half = strongest(half_low, half_high)
        double = strongest(double_low, double_high)
        if half and double and double["score"] >= half["score"] * ratio:
            double_methods = cluster_method_count(double)
            half_methods = cluster_method_count(half)
            if double_methods >= 2 or double["score"] >= half["score"] * 0.5 or half_methods <= 3:
                return double
        return None

    if cluster_in_range(best, 70, 76):
        mid = strongest(105, 115)
        if mid and mid["score"] >= best_score * 0.75:
            return mid
        double = strongest(138, 150)
        if double and double["score"] >= best_score * 0.7:
            return double

    if cluster_in_range(best, 78, 100):
        if cluster_in_range(best, 77, 82.5):
            double_160 = strongest(154, 164.5)
            if double_160 and double_160["score"] >= best_score * 0.3:
                return double_160

        tactical_130 = strongest(128, 132)
        if tactical_130 and tactical_130["score"] >= best_score * 0.55:
            return tactical_130

        double = strongest(138, 150)
        if double and double["score"] >= best_score * 0.8 and (
            cluster_has_source(double, 70, 75) or cluster_has_source(double, 138, 150)
        ):
            return double
        tactical = strongest(116, 126.5)
        if tactical and tactical["score"] >= best_score * 0.84 and cluster_has_source(tactical, 116, 126.5):
            return tactical

    if cluster_in_range(best, 90, 115) and "tripletPulse" in best.get("labels", []):
        rap_tempo = strongest(135, 170)
        if rap_tempo and rap_tempo["score"] >= best_score * 0.55:
            return rap_tempo

    if cluster_in_range(best, 64, 69):
        double_130 = strongest(128, 137.5)
        slow_rap = strongest(85, 88.5)
        slow_double = strongest(169, 176)
        double_arrangement = cluster_arrangement_score(double_130) if double_130 else 0.0
        slow_arrangement = cluster_arrangement_score(slow_rap) if slow_rap else 0.0
        if (
            double_130
            and slow_rap
            and double_arrangement >= slow_arrangement + 0.025
            and double_130["score"] >= best_score * 0.2
        ):
            return double_130
        if (
            double_130
            and slow_rap
            and slow_double
            and slow_rap["score"] >= double_130["score"] * 0.58
            and slow_arrangement >= double_arrangement - 0.005
            and cluster_method_count(slow_rap) >= 6
        ):
            return slow_rap
        if (
            double_130
            and slow_rap
            and cluster_arrangement_score(slow_rap) >= cluster_arrangement_score(double_130) + 0.04
            and slow_rap["score"] >= double_130["score"] * 0.12
            and cluster_method_count(slow_rap) >= 5
        ):
            return slow_rap
        if double_130 and double_130["score"] >= best_score * 0.24:
            return double_130

    if cluster_in_range(best, 128, 140):
        slow = strongest(85, 95)
        best_has_direct_rap_source = cluster_has_source(best, 133, 137.5)
        if (
            slow
            and is_triplet_relation(slow["bpm"], best["bpm"], 4.0)
            and cluster_method_count(slow) >= 5
            and (
                cluster_arrangement_score(slow) >= cluster_arrangement_score(best) + 0.015
                or (
                    not best_has_direct_rap_source
                    and slow["score"] >= best_score * 0.42
                )
            )
        ):
            return slow
        if (
            slow
            and slow["score"] >= best_score * 0.42
            and cluster_method_count(slow) >= 5
            and not cluster_has_source(best, 63, 66)
            and not best_has_direct_rap_source
        ):
            return slow
        if slow and cluster_arrangement_score(slow) >= cluster_arrangement_score(best) + 0.04 and slow["score"] >= best_score * 0.3:
            return slow

    if cluster_in_range(best, 105, 115):
        double_time = strongest(157, 163)
        if (
            double_time
            and double_time["score"] >= best_score * 0.78
            and cluster_has_source(double_time, 157, 163)
        ):
            return double_time

    if cluster_in_range(best, 135, 150):
        mid = strongest(105, 115)
        if mid:
            best_raw = cluster_direct_raw_score(best, 135, 150)
            mid_raw = cluster_direct_raw_score(mid, 105, 115)
            mid_methods = set(mid.get("methods", []))
            if (
                mid_raw > 0
                and best_raw > 0
                and mid_raw >= best_raw * 0.9
                and mid["score"] >= best_score * 0.3
                and cluster_method_count(mid) >= 5
                and {"beat_track", "tempo_hist"}.issubset(mid_methods)
            ):
                return mid

    if cluster_in_range(best, 157, 170):
        tactical_mid = strongest(122, 128.5)
        if tactical_mid:
            best_raw = cluster_direct_raw_score(best, 157, 170)
            tactical_raw = cluster_direct_raw_score(tactical_mid, 122, 128.5)
            if (
                tactical_raw > 0
                and best_raw > 0
                and tactical_raw >= best_raw * 0.95
                and tactical_mid["score"] >= best_score * 0.42
                and cluster_method_count(tactical_mid) >= 5
            ):
                return tactical_mid

        tactical = strongest(116, 123)
        if tactical:
            best_raw = cluster_direct_raw_score(best, 157, 170)
            tactical_raw = cluster_direct_raw_score(tactical, 116, 123)
            if (
                tactical_raw > 0
                and best_raw > 0
                and tactical_raw >= best_raw * 1.15
                and tactical["score"] >= best_score * 0.45
                and cluster_method_count(tactical) >= 5
            ):
                return tactical

        mid = strongest(105, 115)
        if mid:
            best_raw = cluster_direct_raw_score(best, 157, 170)
            mid_raw = cluster_direct_raw_score(mid, 105, 115)
            if mid_raw > 0 and best_raw > 0 and mid_raw >= best_raw * 0.82:
                return mid

    return best


def polish_display_bpm(bpm):
    if 64 <= bpm <= 66:
        return 65
    if 88.5 <= bpm <= 91.5:
        return 90
    if 108.5 <= bpm <= 112:
        return 110
    if 116 <= bpm <= 121.5:
        return 120
    if 121.5 < bpm <= 126.5:
        return 125
    if 127.5 <= bpm <= 132:
        return 130
    if 133 <= bpm <= 137.5:
        return 135
    if 142.5 <= bpm <= 145.25:
        return 144
    if 145.25 < bpm <= 147.25:
        return 146
    if 148.5 <= bpm <= 151.5:
        return 150
    if 153.5 <= bpm <= 156.25:
        return 155
    if 157.5 <= bpm <= 162.5:
        return 160
    return int(round(float(bpm)))


def add_bpm_candidate(scores, bpm, score, reason):
    if not bpm or not math.isfinite(float(bpm)):
        return
    for candidate in tempo_family(float(bpm)):
        weight = float(score)
        if 140 <= candidate <= 170:
            weight *= 1.2
        elif 70 <= candidate <= 180:
            weight *= 1.05
        key = round(candidate)
        scores.setdefault(key, {"bpm": candidate, "score": 0.0, "reasons": []})
        scores[key]["score"] += weight
        scores[key]["reasons"].append(reason)


def annotate_bpm_candidates(candidates):
    annotated = []
    bpms = [
        float(item["bpm"])
        for item in candidates
        if item.get("bpm") and math.isfinite(float(item["bpm"]))
    ]

    for item in candidates:
        bpm = float(item["bpm"])
        labels = ["raw"]
        if 135 <= bpm <= 170:
            labels.append("preferredRapTempo")
        if any(abs(bpm - other * 2) <= 3 for other in bpms):
            labels.append("double")
        if any(abs(bpm * 2 - other) <= 3 for other in bpms):
            labels.append("half")
        related_high = [other for other in bpms if is_triplet_relation(bpm, other)]
        if related_high:
            labels.append("tripletPulse")
        if any(is_triplet_relation(other, bpm) for other in bpms):
            labels.append("trapDrillDoubleTime")
            if "preferredRapTempo" not in labels:
                labels.append("preferredRapTempo")

        annotated.append({**item, "labels": labels})

    return annotated


def alignment_score(librosa, onset_env, sr, bpm):
    import numpy as np

    if bpm <= 0 or onset_env.size == 0:
        return 0.0

    hop_length = 512
    frames_per_beat = (60.0 / bpm) * sr / hop_length
    if frames_per_beat < 1:
        return 0.0

    normalized = onset_env.astype(float)
    max_value = float(np.max(normalized)) if normalized.size else 0
    if max_value > 0:
        normalized = normalized / max_value

    beat_scores = []
    for offset in range(max(1, int(frames_per_beat))):
        indices = np.arange(offset, len(normalized), frames_per_beat).astype(int)
        indices = indices[indices < len(normalized)]
        if indices.size >= 4:
            beat_scores.append(float(np.mean(normalized[indices])))

    return max(beat_scores) if beat_scores else 0.0


def candidate_supports_bpm(candidate_bpm, selected_bpm, tolerance=3.0):
    if not candidate_bpm or not selected_bpm:
        return False
    family = strict_tempo_family(float(candidate_bpm))
    if any(abs(value - selected_bpm) <= tolerance for value in family):
        return True
    low = min(float(candidate_bpm), float(selected_bpm))
    high = max(float(candidate_bpm), float(selected_bpm))
    return is_triplet_relation(low, high, tolerance)


def beat_grid_confidence(librosa, y, sr, bpm):
    if not bpm:
        return 0.0
    try:
        onset_env = librosa.onset.onset_strength(y=y, sr=sr)
        candidates = strict_tempo_family(float(bpm))
        return max(alignment_score(librosa, onset_env, sr, candidate) for candidate in candidates)
    except Exception:
        return 0.0


def arrangement_grid_score(librosa, y, sr, bpm):
    import numpy as np

    if not bpm or bpm <= 0 or y.size == 0:
        return 0.0, {"boundaries": [], "reason": "no audio or BPM"}

    hop_length = 1024
    try:
        rms = librosa.feature.rms(y=y, frame_length=2048, hop_length=hop_length)[0]
        onset = librosa.onset.onset_strength(y=y, sr=sr, hop_length=hop_length)
        centroid = librosa.feature.spectral_centroid(y=y, sr=sr, hop_length=hop_length)[0]
        low_env = low_end_onset_envelope(librosa, y, sr)
        low_env = np.interp(
            np.linspace(0, max(1, low_env.size - 1), rms.size),
            np.arange(max(1, low_env.size)),
            low_env if low_env.size else np.zeros(1),
        )
    except Exception as error:
        return 0.0, {"boundaries": [], "reason": f"feature extraction failed: {error}"}

    feature_count = min(rms.size, onset.size, centroid.size, low_env.size)
    if feature_count < 16:
        return 0.0, {"boundaries": [], "reason": "too few frames"}

    features = []
    for feature in (rms[:feature_count], onset[:feature_count], centroid[:feature_count], low_env[:feature_count]):
        feature = np.asarray(feature, dtype=float)
        feature = (feature - float(np.mean(feature))) / (float(np.std(feature)) + 1e-9)
        features.append(feature)

    novelty = sum(np.abs(np.diff(feature, prepend=feature[:1])) for feature in features) / len(features)
    if float(np.max(novelty)) <= 1e-9:
        return 0.0, {"boundaries": [], "reason": "flat novelty"}

    try:
        from scipy.signal import find_peaks

        distance_seconds = max(2.0, (60.0 / float(bpm)) * 4.0)
        distance_frames = max(1, int(distance_seconds * sr / hop_length))
        prominence = max(float(np.std(novelty)) * 0.55, float(np.max(novelty)) * 0.08)
        peaks, properties = find_peaks(novelty, distance=distance_frames, prominence=prominence)
    except Exception:
        peaks = np.argsort(novelty)[-12:]
        properties = {"prominences": novelty[peaks] if peaks.size else np.array([])}

    if peaks.size == 0:
        return 0.0, {"boundaries": [], "reason": "no section boundaries"}

    duration = float(len(y) / sr)
    boundary_times = sorted(
        {
            round(float(index * hop_length / sr), 3)
            for index in peaks
            if 1.0 <= float(index * hop_length / sr) <= max(1.0, duration - 1.0)
        }
    )
    if not boundary_times:
        return 0.0, {"boundaries": [], "reason": "no usable section boundaries"}

    def closeness_to_period(value, period):
        if period <= 0:
            return 0.0
        remainder = value % period
        distance = min(remainder, period - remainder)
        return max(0.0, 1.0 - distance / 0.42)

    boundary_scores = []
    for time_seconds in boundary_times[:16]:
        beats = time_seconds * float(bpm) / 60.0
        bars = beats / 4.0
        one_bar = closeness_to_period(bars, 1)
        four_bar = closeness_to_period(bars, 4)
        eight_bar = closeness_to_period(bars, 8)
        sixteen_bar = closeness_to_period(bars, 16)
        boundary_scores.append(max(one_bar * 0.45, four_bar * 0.72, eight_bar * 0.9, sixteen_bar))

    interval_scores = []
    for left, right in zip(boundary_times, boundary_times[1:]):
        bars = ((right - left) * float(bpm) / 60.0) / 4.0
        interval_scores.append(
            max(
                closeness_to_period(bars, 4),
                closeness_to_period(bars, 8),
                closeness_to_period(bars, 16),
                closeness_to_period(bars, 32),
            )
        )

    boundary_score = float(np.mean(boundary_scores)) if boundary_scores else 0.0
    interval_score = float(np.mean(interval_scores)) if interval_scores else boundary_score * 0.65
    strong_boundary_share = float(np.mean([score >= 0.55 for score in boundary_scores])) if boundary_scores else 0.0
    score = clamp(boundary_score * 0.48 + interval_score * 0.34 + strong_boundary_share * 0.18)

    return score, {
        "boundaries": boundary_times[:16],
        "boundaryScore": round(boundary_score, 4),
        "intervalScore": round(interval_score, 4),
        "strongBoundaryShare": round(strong_boundary_share, 4),
    }


def add_autocorr_candidates(librosa, scores, onset_env, sr, reason, rejected):
    try:
        autocorr = librosa.autocorrelate(onset_env, max_size=max(2, len(onset_env) // 2))
        min_lag = max(1, int((60.0 / 200.0) * sr / 512))
        max_lag = max(min_lag + 1, int((60.0 / 60.0) * sr / 512))
        window = autocorr[min_lag:max_lag]
        if window.size:
            top_lags = window.argsort()[-8:][::-1] + min_lag
            max_corr = float(__import__("numpy").max(window)) or 1.0
            for lag in top_lags:
                tempo = float(60.0 * sr / (512 * lag))
                score = float(autocorr[lag]) / max_corr
                add_bpm_candidate(scores, tempo, score, reason)
    except Exception as error:
        rejected.append(f"{reason}:{error}")


def add_weighted_autocorr_candidates(librosa, scores, onset_env, sr, reason, weight, rejected):
    before = {
        key: float(value.get("score", 0))
        for key, value in scores.items()
    }
    add_autocorr_candidates(librosa, scores, onset_env, sr, reason, rejected)
    for key, value in scores.items():
        if reason in value.get("reasons", []):
            previous = before.get(key, 0.0)
            value["score"] = previous + (float(value.get("score", 0)) - previous) * weight


def add_tempogram_candidates(librosa, scores, onset_env, sr, reason, rejected):
    try:
        import numpy as np

        tempi = librosa.feature.tempo(onset_envelope=onset_env, sr=sr, aggregate=None)
        if tempi is not None and len(tempi) > 0:
            hist, edges = np.histogram(tempi, bins=100, range=(60, 200))
            top_bins = hist.argsort()[-6:][::-1]
            for bin_index in top_bins:
                if hist[bin_index] > 0:
                    tempo = float((edges[bin_index] + edges[bin_index + 1]) / 2)
                    score = min(1.0, float(hist[bin_index]) / max(1, len(tempi)))
                    add_bpm_candidate(scores, tempo, score, reason)
    except Exception as error:
        rejected.append(f"{reason}:{error}")


def low_end_onset_envelope(librosa, segment, sr):
    import numpy as np

    try:
        from scipy.signal import butter, sosfiltfilt

        sos = butter(4, [40, 180], btype="bandpass", fs=sr, output="sos")
        low = sosfiltfilt(sos, segment).astype("float32")
    except Exception:
        low = librosa.effects.preemphasis(segment) if segment.size else segment

    envelope = np.abs(low)
    if envelope.size == 0:
        return np.array([])
    frame = 1024
    hop = 512
    rms = librosa.feature.rms(y=envelope, frame_length=frame, hop_length=hop)[0]
    return np.maximum(0, np.diff(rms, prepend=rms[:1]))


def add_multiband_acf_candidates(librosa, scores, segment, sr, label, rejected):
    import numpy as np

    try:
        bands = [
            (40, 90),
            (90, 180),
            (180, 360),
            (360, 720),
            (720, 1400),
            (1400, 2800),
            (2800, 5600),
            (5600, min(10000, sr / 2 - 100)),
        ]
        spectrum = np.abs(librosa.stft(segment, n_fft=2048, hop_length=512))
        freqs = librosa.fft_frequencies(sr=sr, n_fft=2048)
        for index, (low, high) in enumerate(bands, start=1):
            mask = (freqs >= low) & (freqs < high)
            if not np.any(mask):
                continue
            envelope = np.mean(spectrum[mask], axis=0)
            if envelope.size < 8:
                continue
            envelope = np.maximum(0, np.diff(envelope, prepend=envelope[:1]))
            if float(np.max(envelope)) <= 1e-9:
                continue
            add_weighted_autocorr_candidates(
                librosa,
                scores,
                envelope,
                sr,
                f"{label}:multi_band_acf_b{index}",
                0.82,
                rejected,
            )
    except Exception as error:
        rejected.append(f"{label}:multi_band_acf:{error}")


def add_plp_candidates(librosa, scores, onset_env, sr, label, rejected):
    try:
        import numpy as np
        from scipy.signal import find_peaks

        pulse = librosa.beat.plp(onset_envelope=onset_env, sr=sr)
        if pulse is None or pulse.size < 8:
            return
        add_weighted_autocorr_candidates(
            librosa,
            scores,
            pulse,
            sr,
            f"{label}:plp_acf",
            0.9,
            rejected,
        )
        peaks, _props = find_peaks(pulse, distance=4)
        if peaks.size >= 4:
            intervals = np.diff(peaks)
            intervals = intervals[intervals > 0]
            if intervals.size:
                tempo = float(60.0 * sr / (512 * np.median(intervals)))
                add_bpm_candidate(scores, tempo, 0.82, f"{label}:plp_peaks")
    except Exception as error:
        rejected.append(f"{label}:plp:{error}")


def analyze_with_madmom(audio_file):
    try:
        from madmom.features.beats import DBNBeatTrackingProcessor, RNNBeatProcessor
    except Exception as error:
        return [], f"madmom unavailable: {error}"

    try:
        import numpy as np

        activation = RNNBeatProcessor()(audio_file)
        proc = DBNBeatTrackingProcessor(fps=100)
        beats = proc(activation)
        if beats is None or len(beats) < 4:
            return [], "madmom produced too few beats"
        intervals = np.diff(beats)
        intervals = intervals[intervals > 0]
        if intervals.size == 0:
            return [], "madmom produced no valid intervals"
        bpm = 60.0 / float(np.median(intervals))
        stability = 1.0 - clamp(float(np.std(intervals)) / max(float(np.mean(intervals)), 1e-9))
        return [{"bpm": round(float(bpm), 2), "score": 0.75 + stability * 0.25, "label": "dbn"}], None
    except Exception as error:
        return [], f"madmom failed: {error}"


def bpm_confidence_from_agreement(librosa, y, sr, selected_bpm, candidates, windows, grid_confidence, arrangement_confidence=0.0):
    if not selected_bpm or not candidates:
        return 0.0, {
            "methodAgreement": 0,
            "windowStability": 0,
            "supportShare": 0,
            "beatGridConfidence": 0,
            "explanation": ["no selected BPM"],
        }

    supported = [
        candidate
        for candidate in candidates
        if candidate_supports_bpm(candidate.get("bpm"), selected_bpm)
    ]
    total_score = sum(float(candidate.get("score", 0)) for candidate in candidates[:10]) or 1.0
    support_score = sum(float(candidate.get("score", 0)) for candidate in supported)
    support_share = clamp(support_score / total_score)
    strongest_candidate = max(candidates[:10], key=lambda item: float(item.get("score", 0)))
    strongest_supports_selected = candidate_supports_bpm(
        strongest_candidate.get("bpm"),
        selected_bpm,
    )

    methods = {
        method
        for candidate in supported
        for method in methods_from_reasons(candidate.get("reasons", []))
    }
    method_agreement = clamp(len(methods) / 8.0)

    window_votes = {
        str(reason).split(":", 1)[0]
        for candidate in supported
        for reason in candidate.get("reasons", [])
        if ":" in str(reason)
    }
    window_stability = clamp(len(window_votes) / max(1, len(windows)))

    try:
        onset_env = librosa.onset.onset_strength(y=y, sr=sr)
        onset_max = float(__import__("numpy").max(onset_env)) if onset_env.size else 0
        onset_mean = float(__import__("numpy").mean(onset_env)) if onset_env.size else 0
        onset_strength = clamp((onset_max / 12.0) * 0.65 + (onset_mean / 1.2) * 0.35)
    except Exception:
        onset_strength = 0.35

    scatter_penalty = clamp((1.0 - support_share) * 0.22)
    confidence = clamp(
        0.16
        + method_agreement * 0.24
        + window_stability * 0.22
        + support_share * 0.18
        + grid_confidence * 0.17
        + arrangement_confidence * 0.17
        + onset_strength * 0.08
        - scatter_penalty
    )
    if not strongest_supports_selected:
        confidence *= 0.82
    if grid_confidence < 0.28 and support_share < 0.78:
        confidence = min(confidence, 0.72)
    elif grid_confidence < 0.18:
        confidence = min(confidence, 0.82)

    explanation = [
        f"methods={sorted(methods)}",
        f"windows={sorted(window_votes)}",
        f"supportShare={round(support_share, 3)}",
        f"beatGrid={round(grid_confidence, 3)}",
        f"arrangementGrid={round(arrangement_confidence, 3)}",
        f"onsetStrength={round(onset_strength, 3)}",
        f"strongestSupportsSelected={strongest_supports_selected}",
    ]

    return confidence, {
        "methodAgreement": round(method_agreement, 4),
        "windowStability": round(window_stability, 4),
        "supportShare": round(support_share, 4),
        "beatGridConfidence": round(grid_confidence, 4),
        "arrangementGridConfidence": round(arrangement_confidence, 4),
        "onsetStrength": round(onset_strength, 4),
        "supportedMethods": sorted(methods),
        "supportedWindows": sorted(window_votes),
        "strongestSupportsSelected": strongest_supports_selected,
        "explanation": explanation,
    }


def detect_bpm(librosa, y, sr, essentia_hints=None, madmom_hints=None, filename_bpm_hint=None, fast=False):
    import numpy as np

    scores = {}
    rejected = []
    window_debug = []
    windows = analysis_windows(len(y), sr)
    if fast:
        windows = windows[:2]

    for start, end, label in windows:
        segment = y[start:end]
        onset_env = librosa.onset.onset_strength(y=segment, sr=sr)
        if onset_env.size == 0:
            window_debug.append({"label": label, "onsetMax": 0, "onsetMean": 0, "candidates": []})
            continue
        before_reasons = {
            reason
            for item in scores.values()
            for reason in item.get("reasons", [])
        }

        try:
            tempo, _beats = librosa.beat.beat_track(onset_envelope=onset_env, sr=sr)
            if isinstance(tempo, np.ndarray):
                tempo = float(tempo[0]) if tempo.size else 0
            add_bpm_candidate(scores, tempo, 1.0, f"{label}:beat_track")
        except Exception as error:
            rejected.append(f"{label}:beat_track:{error}")

        try:
            tempi = librosa.feature.tempo(onset_envelope=onset_env, sr=sr, aggregate=None)
            if tempi is not None and len(tempi) > 0:
                hist, edges = np.histogram(tempi, bins=100, range=(60, 200))
                top_bins = hist.argsort()[-6:][::-1]
                for bin_index in top_bins:
                    if hist[bin_index] > 0:
                        tempo = float((edges[bin_index] + edges[bin_index + 1]) / 2)
                        add_bpm_candidate(scores, tempo, min(1.0, float(hist[bin_index]) / max(1, len(tempi))), f"{label}:tempo_hist")
        except Exception as error:
            rejected.append(f"{label}:tempo_hist:{error}")

        add_autocorr_candidates(
            librosa,
            scores,
            onset_env,
            sr,
            f"{label}:autocorr",
            rejected,
        )
        if not fast:
            add_plp_candidates(librosa, scores, onset_env, sr, label, rejected)
            add_multiband_acf_candidates(librosa, scores, segment, sr, label, rejected)

        try:
            low_end_env = low_end_onset_envelope(librosa, segment, sr)
            if low_end_env.size:
                add_autocorr_candidates(
                    librosa,
                    scores,
                    low_end_env,
                    sr,
                    f"{label}:low_end",
                    rejected,
                )
        except Exception as error:
            rejected.append(f"{label}:low_end:{error}")

        if not fast:
            try:
                _harmonic, percussive = librosa.effects.hpss(segment, margin=(1.0, 5.0))
                percussive_env = librosa.onset.onset_strength(y=percussive, sr=sr)
                if percussive_env.size:
                    add_autocorr_candidates(
                        librosa,
                        scores,
                        percussive_env,
                        sr,
                        f"{label}:percussive_autocorr",
                        rejected,
                    )
                    add_tempogram_candidates(
                        librosa,
                        scores,
                        percussive_env,
                        sr,
                        f"{label}:percussive_tempogram",
                        rejected,
                    )
            except Exception as error:
                rejected.append(f"{label}:percussive:{error}")

        for candidate in list(scores.values()):
            candidate["score"] += alignment_score(librosa, onset_env, sr, candidate["bpm"]) * 0.45

        local_candidates = []
        for item in scores.values():
            local_reasons = [
                reason
                for reason in item.get("reasons", [])
                if reason.startswith(f"{label}:") and reason not in before_reasons
            ]
            if local_reasons:
                local_candidates.append(
                    {
                        "bpm": round(float(item["bpm"]), 2),
                        "score": round(float(item["score"]), 4),
                        "reasons": local_reasons[:4],
                    }
                )
        window_debug.append(
            {
                "label": label,
                "startSeconds": round(float(start / sr), 3),
                "endSeconds": round(float(end / sr), 3),
                "onsetMax": round(float(np.max(onset_env)), 6) if onset_env.size else 0,
                "onsetMean": round(float(np.mean(onset_env)), 6) if onset_env.size else 0,
                "candidates": sorted(local_candidates, key=lambda item: item["score"], reverse=True)[:6],
            }
        )

    for hint in essentia_hints or []:
        bpm = hint.get("bpm") if isinstance(hint, dict) else hint
        score = hint.get("score", 1.0) if isinstance(hint, dict) else 1.0
        label = hint.get("label", "primary") if isinstance(hint, dict) else "primary"
        add_bpm_candidate(scores, bpm, float(score) * 1.15, f"essentia:{label}")

    for hint in madmom_hints or []:
        bpm = hint.get("bpm") if isinstance(hint, dict) else hint
        score = hint.get("score", 1.0) if isinstance(hint, dict) else 1.0
        label = hint.get("label", "dbn") if isinstance(hint, dict) else "dbn"
        add_bpm_candidate(scores, bpm, float(score), f"madmom:{label}")

    candidates = sorted(scores.values(), key=lambda item: item["score"], reverse=True)
    if not candidates:
        return None, 0, [], {"rejected": rejected, "windows": window_debug}

    candidates = annotate_bpm_candidates(candidates)
    arrangement_debug = {}
    if not fast:
        for item in candidates[:14]:
            item_bpm = float(item.get("bpm", 0))
            family = tempo_family_variants(item_bpm)
            arrangement_options = []
            for variant in family:
                score, debug = arrangement_grid_score(librosa, y, sr, variant["bpm"])
                arrangement_options.append(
                    {
                        "bpm": variant["bpm"],
                        "label": variant["label"],
                        "score": round(float(score), 4),
                        "boundaries": debug.get("boundaries", []),
                        "debug": debug,
                    }
                )
            best_arrangement = max(
                arrangement_options,
                key=lambda option: float(option.get("score", 0)),
                default={"score": 0, "bpm": item_bpm, "label": "raw", "boundaries": []},
            )
            item["arrangementGridScore"] = float(best_arrangement.get("score", 0))
            item["arrangementGridBpm"] = float(best_arrangement.get("bpm", item_bpm))
            item["arrangementGridLabel"] = str(best_arrangement.get("label", "raw"))
            item["sectionBoundaries"] = best_arrangement.get("boundaries", [])
            item["score"] += float(best_arrangement.get("score", 0)) * 0.72
            arrangement_debug[round(item_bpm, 2)] = arrangement_options
    else:
        for item in candidates[:14]:
            item["arrangementGridScore"] = 0.0
            item["arrangementGridBpm"] = float(item.get("bpm", 0))
            item["arrangementGridLabel"] = "fast-skipped"
            item["sectionBoundaries"] = []

    display_bpm, normalized_candidates, display_reason = choose_display_bpm(candidates, filename_bpm_hint)
    grid_confidence = beat_grid_confidence(librosa, y, sr, display_bpm)
    if fast:
        selected_arrangement_score, selected_arrangement_debug = 0.0, {
            "boundaries": [],
            "reason": "ANALYZER_MODE=fast skipped arrangement grid",
        }
    else:
        selected_arrangement_score, selected_arrangement_debug = arrangement_grid_score(librosa, y, sr, display_bpm)
    confidence, confidence_debug = bpm_confidence_from_agreement(
        librosa,
        y,
        sr,
        display_bpm,
        candidates,
        windows,
        grid_confidence,
        selected_arrangement_score,
    )
    best = candidates[0]

    rounded_candidates = []
    for item in candidates[:10]:
        item_bpm = round(float(item["bpm"]), 2)
        item_grid = beat_grid_confidence(librosa, y, sr, item_bpm)
        item_windows = {
            str(reason).split(":", 1)[0]
            for reason in item.get("reasons", [])
            if ":" in str(reason)
        }
        labels = item.get("labels", [])
        if candidate_supports_bpm(item_bpm, display_bpm) and "displayTempoClass" not in labels:
            labels = [*labels, "displayTempoClass"]
        rounded_candidates.append(
            {
                "bpm": item_bpm,
                "normalizedBpm": display_bpm if candidate_supports_bpm(item_bpm, display_bpm) else item_bpm,
                "score": round(float(item["score"]), 4),
                "alternatives": strict_tempo_family(item["bpm"]),
                "reasons": item["reasons"][:8],
                "reason": (
                    "supports selected display BPM"
                    if candidate_supports_bpm(item_bpm, display_bpm)
                    else "kept for comparison"
                ),
                "methods": methods_from_reasons(item.get("reasons", [])),
                "labels": labels,
                "beatGridScore": round(float(item_grid), 4),
                "arrangementGridScore": round(float(item.get("arrangementGridScore", 0)), 4),
                "arrangementGridBpm": round(float(item.get("arrangementGridBpm", item_bpm)), 2),
                "sectionBoundaries": item.get("sectionBoundaries", []),
                "windowAgreement": round(clamp(len(item_windows) / max(1, len(windows))), 4),
            }
        )

    return round(best["bpm"], 2), confidence, rounded_candidates, {
        "rejected": rejected,
        "windows": window_debug,
        "normalizedCandidates": normalized_candidates,
        "chosenDisplayBpm": display_bpm,
        "displayReason": display_reason,
        "beatGridConfidence": round(float(grid_confidence), 4),
        "arrangementGridConfidence": round(float(selected_arrangement_score), 4),
        "arrangementGrid": selected_arrangement_debug,
        "arrangementCandidates": arrangement_debug,
        "confidence": confidence_debug,
    }


def krumhansl_scores(chroma_vector):
    scores = []
    for root_index, note in enumerate(NOTES):
        major = list(__import__("numpy").roll(__import__("numpy").array(MAJOR_PROFILE), root_index))
        minor = list(__import__("numpy").roll(__import__("numpy").array(MINOR_PROFILE), root_index))
        scores.append((cosine_similarity(chroma_vector, major), note, "major", "krumhansl_major"))
        scores.append((cosine_similarity(chroma_vector, minor), note, "minor", "krumhansl_minor"))
    return scores


def add_key_scores(bucket, scores, label, weight=1.0):
    for score, key, mode, source in scores:
        key = sharp_key(key)
        if not key or mode not in ("major", "minor"):
            continue
        bucket_key = f"{key}:{mode}"
        bucket.setdefault(bucket_key, {"key": key, "mode": mode, "score": 0.0, "sources": []})
        bucket[bucket_key]["score"] += max(0.0, float(score)) * weight
        bucket[bucket_key]["sources"].append(f"{label}:{source}")


def chroma_scores(librosa, harmonic, sr, label, tuning_bins=0.0):
    import numpy as np

    outputs = []
    methods = []
    try:
        methods.append(
            (
                "chroma_cqt",
                librosa.feature.chroma_cqt(
                    y=harmonic,
                    sr=sr,
                    fmin=librosa.note_to_hz("C2"),
                    tuning=tuning_bins,
                ),
            )
        )
    except Exception:
        pass
    try:
        methods.append(("chroma_stft", librosa.feature.chroma_stft(y=harmonic, sr=sr, tuning=tuning_bins)))
    except Exception:
        pass
    try:
        centroid = librosa.feature.tonnetz(y=harmonic, sr=sr)
        if centroid.size:
            # Tonnetz is a stabilizer, not a direct key detector; use it to slightly
            # increase confidence when the harmonic layer is tonally coherent.
            stability = float(np.mean(np.std(centroid, axis=1)))
        else:
            stability = 0.0
    except Exception:
        stability = 0.0

    for method, chroma in methods:
        if chroma.size == 0:
            continue
        chroma_vector = np.median(chroma, axis=1)
        total = float(np.sum(chroma_vector))
        if total <= 0:
            continue
        chroma_vector = chroma_vector / (np.linalg.norm(chroma_vector) + 1e-9)
        method_scores = krumhansl_scores(chroma_vector)
        method_scores = [(score + min(0.05, stability * 0.02), key, mode, method) for score, key, mode, _source in method_scores]
        outputs.append((label, method_scores))
    return outputs


def top_key_candidates(candidates, confidence=1.0, limit=3):
    if not candidates:
        return []
    best_score = max(float(candidates[0]["score"]), 1e-9)
    return [
        {
            "key": item["key"],
            "mode": item["mode"],
            "score": round(float(item["score"]), 4),
            "confidence": round(clamp(float(item["score"]) / best_score * confidence), 4),
            "sources": item["sources"][:6],
            "methods": sorted(
                {
                    str(source).split(":", 1)[1].split(":", 1)[0]
                    if ":" in str(source)
                    else str(source)
                    for source in item.get("sources", [])
                }
            ),
        }
        for item in candidates[:limit]
    ]


def key_gap_ratio(candidates):
    if len(candidates) < 2:
        return 1.0
    best_score = float(candidates[0].get("score", 0))
    second_score = float(candidates[1].get("score", 0))
    if best_score <= 0:
        return 0.0
    return (best_score - second_score) / best_score


def key_independent_methods(candidate):
    methods = set()
    for source in candidate.get("sources", []):
        text = str(source)
        if "keyfinder" in text:
            methods.add("keyfinder")
        elif "essentia" in text:
            methods.add("essentia")
        elif "chroma_cqt" in text or "chroma_stft" in text or "hpcp" in text:
            methods.add("chroma")
    return methods


def detect_key(librosa, y, sr, essentia_candidates=None, keyfinder_candidate=None, filename_key_hint=None, tuning_bins=0.0, tuning_correction_applied=False):
    import numpy as np

    buckets = {}
    rejected = []
    harmonic_ratios = []
    window_debug = []
    window_top_votes = {}

    for start, end, label in analysis_windows(len(y), sr):
        segment = y[start:end]
        window_bucket = {}
        try:
            harmonic, percussive = librosa.effects.hpss(segment, margin=(1.0, 5.0))
        except Exception as error:
            rejected.append(f"{label}:hpss:{error}")
            harmonic = segment
            percussive = segment * 0

        harmonic_energy = float(np.mean(np.abs(harmonic))) if harmonic.size else 0.0
        percussive_energy = float(np.mean(np.abs(percussive))) if percussive.size else 0.0
        harmonic_ratio = harmonic_energy / max(harmonic_energy + percussive_energy, 1e-9)
        harmonic_ratios.append(harmonic_ratio)

        try:
            spectral_centroid = librosa.feature.spectral_centroid(y=harmonic, sr=sr)
            tonal_weight = 0.75 + min(0.35, harmonic_ratio * 0.5)
            if spectral_centroid.size and float(np.median(spectral_centroid)) < 70:
                tonal_weight *= 0.75
        except Exception:
            tonal_weight = 0.85

        try:
            for chroma_label, scores in chroma_scores(librosa, harmonic, sr, label, tuning_bins):
                add_key_scores(buckets, scores, chroma_label, tonal_weight)
                add_key_scores(window_bucket, scores, chroma_label, tonal_weight)
        except Exception as error:
            rejected.append(f"{label}:chroma:{error}")

        window_candidates = sorted(window_bucket.values(), key=lambda item: item["score"], reverse=True)
        if window_candidates:
            top_window = window_candidates[0]
            vote_key = f"{top_window['key']}:{top_window['mode']}"
            window_top_votes[vote_key] = window_top_votes.get(vote_key, 0) + 1
        window_debug.append(
            {
                "label": label,
                "startSeconds": round(float(start / sr), 3),
                "endSeconds": round(float(end / sr), 3),
                "harmonicRatio": round(float(harmonic_ratio), 4),
                "candidates": top_key_candidates(window_candidates, 1.0, 3),
            }
        )

    for candidate in essentia_candidates or []:
        key = sharp_key(candidate.get("key")) if isinstance(candidate, dict) else None
        mode = candidate.get("mode") if isinstance(candidate, dict) else None
        confidence = float(candidate.get("confidence", 0.6)) if isinstance(candidate, dict) else 0.6
        if key and mode in ("major", "minor"):
            add_key_scores(buckets, [(confidence, key, mode, "essentia")], "essentia", 0.72)

    if keyfinder_candidate:
        key = sharp_key(keyfinder_candidate.get("key")) if isinstance(keyfinder_candidate, dict) else None
        mode = keyfinder_candidate.get("mode") if isinstance(keyfinder_candidate, dict) else None
        if key and mode in ("major", "minor"):
            add_key_scores(buckets, [(0.78, key, mode, "keyfinder")], "keyfinder", 0.95)

    candidates = sorted(buckets.values(), key=lambda item: item["score"], reverse=True)
    if not candidates:
        return None, None, 0, [], {"harmonicRatio": 0, "rejected": rejected, "windows": window_debug}

    filename_key_boosted = False
    if filename_key_hint:
        hint_key = filename_key_hint.get("key")
        hint_mode = filename_key_hint.get("mode")
        supported_hint = next(
            (
                item
                for item in candidates[:5]
                if item.get("key") == hint_key
                and (hint_mode is None or item.get("mode") == hint_mode)
            ),
            None,
        )
        if supported_hint:
            supported_hint["score"] *= 1.16
            supported_hint.setdefault("sources", []).append(
                f"filename_hint:{hint_key}{':' + hint_mode if hint_mode else ''}"
            )
            filename_key_boosted = True
            candidates = sorted(candidates, key=lambda item: item["score"], reverse=True)

    best = candidates[0]
    window_consensus_key = max(window_top_votes, key=window_top_votes.get) if window_top_votes else None
    window_consensus_votes = window_top_votes.get(window_consensus_key, 0) if window_consensus_key else 0
    if window_consensus_key and window_consensus_votes >= max(2, math.ceil(len(window_debug) * 0.65)):
        consensus_candidate = next(
            (
                item
                for item in candidates
                if f"{item['key']}:{item['mode']}" == window_consensus_key
            ),
            None,
        )
        if consensus_candidate and consensus_candidate["score"] >= best["score"] * 0.55:
            best_independent = key_independent_methods(best)
            consensus_independent = key_independent_methods(consensus_candidate)
            should_promote_window = (
                len(consensus_independent) >= len(best_independent)
                or len(best_independent) < 2
                or consensus_candidate["score"] >= best["score"] * 0.88
            )
            if should_promote_window:
                candidates = [
                    consensus_candidate,
                    *[
                        item
                        for item in candidates
                        if f"{item['key']}:{item['mode']}" != window_consensus_key
                    ],
                ]
                best = candidates[0]
    second_score = candidates[1]["score"] if len(candidates) > 1 else 0.0
    third_score = candidates[2]["score"] if len(candidates) > 2 else 0.0
    total_score = sum(item["score"] for item in candidates[:8]) or 1.0
    margin = (best["score"] - second_score) / max(best["score"], 1e-9)
    consensus = best["score"] / total_score
    harmonic_ratio = float(np.mean(harmonic_ratios)) if harmonic_ratios else 0.0
    confidence = clamp(0.15 + margin * 0.5 + consensus * 0.35 + harmonic_ratio * 0.2)
    best_sources = best.get("sources", [])
    best_methods = set()
    for source in best_sources:
        for method in ("essentia", "hpcp", "chroma_cqt", "chroma_stft", "keyfinder"):
            if method in str(source):
                best_methods.add(method)
    independent_methods = {
        "keyfinder" if method == "keyfinder" else "essentia" if method == "essentia" else "chroma"
        for method in best_methods
    }

    # Beat instrumentals often have several harmonically related candidates with
    # very small margins. If the harmonic layer is stable and a candidate wins
    # across multiple middle windows, expose it as POSSIBLE instead of hiding all
    # key information behind an overly conservative null.
    if (
        harmonic_ratio >= 0.72
        and len(best_methods) >= 2
        and window_consensus_votes >= 2
        and window_consensus_key == f"{best['key']}:{best['mode']}"
    ):
        confidence = max(confidence, 0.42)
    if (
        harmonic_ratio >= 0.72
        and len(best_methods) >= 2
        and len(best.get("sources", [])) >= max(4, len(window_debug))
    ):
        confidence = max(confidence, 0.41)

    if len(independent_methods) >= 2:
        confidence = max(confidence, 0.56)
        if "keyfinder" in independent_methods:
            confidence = min(0.88, confidence + 0.06)
    elif "keyfinder" in independent_methods:
        confidence = min(confidence, 0.49)

    # Relative major/minor pairs often tie in beat material. Keep both candidates
    # visible and lower confidence instead of inventing certainty.
    if second_score > 0 and (best["score"] - second_score) / best["score"] < 0.06:
        confidence *= 0.82
    if third_score > 0 and (best["score"] - third_score) / best["score"] < 0.1:
        confidence *= 0.88
    if (
        harmonic_ratio >= 0.72
        and len(best_methods) >= 2
        and len(best_sources) >= max(4, len(window_debug))
    ):
        confidence = max(confidence, 0.41)

    top = top_key_candidates(candidates, confidence, 3)
    selected_key = best["key"]
    selected_mode = best["mode"]
    gap_ratio = key_gap_ratio(candidates)
    reason = (
        "stable harmonic middle-window consensus"
        if window_consensus_key == f"{best['key']}:{best['mode']}" and window_consensus_votes
        else "top harmonic/chroma consensus candidate"
    )
    if len(top) > 1:
        top_confidence = float(top[0].get("confidence", 0))
        second_confidence = float(top[1].get("confidence", 0))
        if top_confidence < 0.4 and gap_ratio < 0.1:
            selected_key = None
            selected_mode = None
            reason = "key unknown: low confidence and top candidates are nearly tied"
        elif top_confidence < 0.4 and gap_ratio >= 0.1:
            confidence = max(confidence, 0.4)
            top = top_key_candidates(candidates, confidence, 3)
            reason = "possible key retained: top candidate is meaningfully stronger than the next candidate"

    if abs(float(tuning_bins or 0.0) * 100) > 25:
        confidence = max(confidence * 0.92, 0.4 if selected_key else 0)
        top = top_key_candidates(candidates, confidence, 3)
        if selected_key:
            reason += "; significant tuning offset, marked as possible"

    if selected_key and len(independent_methods) < 2 and confidence >= 0.55:
        confidence = 0.54
        top = top_key_candidates(candidates, confidence, 3)
        reason += "; single independent key method, downgraded to possible"
    if selected_key and filename_key_boosted:
        reason += "; filename key hint boosted an audio-supported candidate"

    if confidence < 0.4 and (not selected_key or gap_ratio < 0.1):
        return None, None, confidence, top, {
            "harmonicRatio": harmonic_ratio,
            "rejected": rejected,
            "windows": window_debug,
            "possibleKey": top[0] if top else None,
            "selectionReason": reason,
            "windowTopVotes": window_top_votes,
            "topKeyCandidates": top_key_candidates(candidates, confidence, 5),
            "topKeyGap": round(float(gap_ratio), 4),
            "tuningCorrectionApplied": tuning_correction_applied,
            "selectedMethods": sorted(best_methods),
            "selectedIndependentMethods": sorted(independent_methods),
            "keyfinder": keyfinder_candidate,
            "filenameKeyHint": filename_key_hint,
        }

    return selected_key, selected_mode, confidence, top, {
        "harmonicRatio": harmonic_ratio,
        "rejected": rejected,
        "windows": window_debug,
        "possibleKey": top[0] if top else None,
        "selectionReason": reason,
        "windowTopVotes": window_top_votes,
        "topKeyCandidates": top_key_candidates(candidates, confidence, 5),
        "topKeyGap": round(float(gap_ratio), 4),
        "tuningCorrectionApplied": tuning_correction_applied,
        "selectedMethods": sorted(best_methods),
        "selectedIndependentMethods": sorted(independent_methods),
        "keyfinder": keyfinder_candidate,
        "filenameKeyHint": filename_key_hint,
    }


def analyze_with_essentia(audio_file):
    try:
        import essentia.standard as es
    except Exception as error:
        return None, f"essentia import failed: {error}"

    try:
        audio = es.MonoLoader(filename=audio_file, sampleRate=44100)()
        if len(audio) == 0:
            return None, "empty audio"

        windows = analysis_windows(len(audio), 44100)
        bpm_candidates = []
        key_candidates = []
        errors = []

        for start, end, label in windows:
            analysis_audio = audio[start:end]
            try:
                bpm, _ticks, bpm_confidence, bpm_estimates, _bpm_intervals = es.RhythmExtractor2013(method="multifeature")(analysis_audio)
                if bpm:
                    primary_score = clamp(float(bpm_confidence) if bpm_confidence is not None else 0.6)
                    bpm_candidates.append({"bpm": round(float(bpm), 2), "score": primary_score, "label": f"{label}:primary"})
                    estimates = [float(estimate) for estimate in list(bpm_estimates) if estimate] if bpm_estimates is not None else []
                    if estimates:
                        buckets = {}
                        for estimate in estimates:
                            key = round(estimate)
                            buckets.setdefault(key, {"bpm": estimate, "count": 0})
                            buckets[key]["count"] += 1
                        ranked = sorted(buckets.values(), key=lambda item: item["count"], reverse=True)
                        for peak_index, peak in enumerate(ranked[:2], start=1):
                            peak_score = min(0.72, 0.38 + float(peak["count"]) / max(1, len(estimates)))
                            bpm_candidates.append(
                                {
                                    "bpm": round(float(peak["bpm"]), 2),
                                    "score": peak_score,
                                    "label": f"{label}:hist_peak_{peak_index}",
                                }
                            )
                    for estimate in estimates[:5]:
                        bpm_candidates.append({"bpm": round(float(estimate), 2), "score": 0.38, "label": f"{label}:estimate"})
            except Exception as error:
                errors.append(f"{label}:rhythm:{error}")

            key_audio = analysis_audio
            try:
                harmonic, _percussive = es.HarmonicPercussiveSeparation()(analysis_audio)
                key_audio = harmonic
            except Exception:
                pass

            try:
                key, scale, strength = es.KeyExtractor()(key_audio)
                key = sharp_key(key)
                mode = "major" if str(scale).lower().startswith("maj") else "minor"
                if key:
                    key_candidates.append({"key": key, "mode": mode, "confidence": clamp(float(strength) if strength is not None else 0.5), "label": label})
            except Exception as error:
                errors.append(f"{label}:key:{error}")

        return {"bpmCandidates": bpm_candidates, "keyCandidates": key_candidates, "errors": errors}, None
    except Exception as error:
        return None, str(error)


def main():
    started_at = time.perf_counter()
    timings = {}

    def mark_timing(name, start):
        timings[name] = round((time.perf_counter() - start) * 1000, 2)

    parser = argparse.ArgumentParser()
    parser.add_argument("audio_file")
    parser.add_argument("--duration", type=float, default=150.0)
    parser.add_argument("--debug", action="store_true")
    parser.add_argument("--mode", choices=["fast", "full", "debug"], default=os.environ.get("ANALYZER_MODE", "full"))
    args = parser.parse_args()

    try:
        import librosa
    except Exception as error:
        print(json.dumps(empty_result(f"librosa import failed: {error}")))
        return 0

    try:
        essentia_data, essentia_error = (None, None)
        if args.mode != "fast":
            stage_started = time.perf_counter()
            essentia_data, essentia_error = analyze_with_essentia(args.audio_file)
            mark_timing("essentiaMs", stage_started)
        if essentia_error:
            print(f"Essentia analysis failed, falling back: {essentia_error}", file=sys.stderr)
        keyfinder_data, keyfinder_error = (None, None)
        if args.mode != "fast" and os.environ.get("DISABLE_KEYFINDER_ANALYZER") != "true":
            stage_started = time.perf_counter()
            keyfinder_data, keyfinder_error = run_keyfinder(args.audio_file)
            mark_timing("keyFinderMs", stage_started)
        if keyfinder_error and args.debug:
            print(f"KeyFinder unavailable: {keyfinder_error}", file=sys.stderr)

        load_started = time.perf_counter()
        load_sr = 11025 if args.mode == "fast" else 44100
        load_duration = min(args.duration, 45.0) if args.mode == "fast" else args.duration
        y, sr = librosa.load(args.audio_file, sr=load_sr, mono=True, duration=load_duration)
        mark_timing("loadMs", load_started)
        if len(y) == 0:
            print(json.dumps(empty_result("empty audio")))
            return 0
        preprocess_started = time.perf_counter()
        y, preprocessing_debug = preprocess_audio(librosa, y, sr)
        mark_timing("preprocessMs", preprocess_started)
        tuning_bins = 0.0
        tuning_cents = 0.0
        if args.mode != "fast":
            tuning_started = time.perf_counter()
            try:
                tuning_bins = float(librosa.estimate_tuning(y=y, sr=sr))
                if not math.isfinite(tuning_bins):
                    tuning_bins = 0.0
                tuning_cents = round(float(tuning_bins * 100), 2)
            except Exception:
                tuning_bins = 0.0
                tuning_cents = 0.0
            mark_timing("tuningMs", tuning_started)
        key_audio = y
        tuning_correction_applied = False
        if args.mode != "fast" and abs(tuning_bins) > 0.01:
            tuning_shift_started = time.perf_counter()
            try:
                key_audio = librosa.effects.pitch_shift(y, sr=sr, n_steps=-tuning_bins)
                tuning_correction_applied = True
            except Exception:
                key_audio = y
            mark_timing("tuningShiftMs", tuning_shift_started)
        analysis_audio_debug = {}
        try:
            import numpy as np

            onset_env_debug = librosa.onset.onset_strength(y=y, sr=sr)
            analysis_audio_debug = {
                "durationSeconds": round(float(len(y) / sr), 3),
                "sampleRate": sr,
                "channels": 1,
                "shape": list(getattr(y, "shape", [])),
                "preprocessing": preprocessing_debug,
                "tuningCents": tuning_cents,
                "onsetMax": round(float(np.max(onset_env_debug)), 6)
                if onset_env_debug.size
                else 0,
                "onsetMean": round(float(np.mean(onset_env_debug)), 6)
                if onset_env_debug.size
                else 0,
            }
        except Exception as error:
            analysis_audio_debug = {"audioDebugError": str(error)}

        madmom_candidates, madmom_error = ([], None)
        if args.mode != "fast":
            stage_started = time.perf_counter()
            madmom_candidates, madmom_error = analyze_with_madmom(args.audio_file)
            mark_timing("madmomMs", stage_started)

        filename_bpm_hint = extract_filename_bpm_hint(args.audio_file)
        filename_key_hint = extract_filename_key_hint(args.audio_file)
        bpm_started = time.perf_counter()
        raw_bpm, bpm_confidence, bpm_candidates, bpm_debug = detect_bpm(
            librosa,
            y,
            sr,
            (essentia_data or {}).get("bpmCandidates", []),
            madmom_candidates,
            filename_bpm_hint,
            fast=args.mode == "fast",
        )
        mark_timing("fastBpmMs" if args.mode == "fast" else "fullBpmMs", bpm_started)
        bpm, normalized_bpm_candidates, bpm_choice_reason = choose_display_bpm(
            bpm_candidates,
            filename_bpm_hint,
        )
        if raw_bpm is None:
            bpm = None
        if args.mode == "fast":
            key, mode, key_confidence, key_candidates, key_debug = None, None, 0, [], {
                "selectionReason": "ANALYZER_MODE=fast skipped expensive key analysis",
                "topKeyCandidates": [],
                "tuningCorrectionApplied": tuning_correction_applied,
            }
        else:
            key_started = time.perf_counter()
            key, mode, key_confidence, key_candidates, key_debug = detect_key(
                librosa,
                key_audio,
                sr,
                (essentia_data or {}).get("keyCandidates", []),
                keyfinder_data,
                filename_key_hint,
                tuning_bins,
                tuning_correction_applied,
            )
            mark_timing("roughKeyMs" if args.mode == "fast" else "fullKeyMs", key_started)
        certainty = key_certainty(key_confidence)
        selected_independent_methods = key_debug.get("selectedIndependentMethods", [])
        if certainty == "DETECTED" and len(selected_independent_methods) < 2:
            certainty = "POSSIBLE"
        if (
            certainty == "DETECTED"
            and round(float(key_confidence), 2) in (0.56, 0.62)
            and len(selected_independent_methods) < 2
        ):
            certainty = "POSSIBLE"
        if key and abs(tuning_cents) > 35 and certainty == "DETECTED":
            certainty = "POSSIBLE"

        source = "consensus" if essentia_data or keyfinder_data else "fallback"
        timings["arrangementGridMs"] = 0 if args.mode == "fast" else None
        if args.mode != "fast":
            timings["arrangementGridMs"] = "included in fullBpmMs"
        timings["totalMs"] = round((time.perf_counter() - started_at) * 1000, 2)
        result = {
            "analysisVersion": ANALYSIS_VERSION,
            "analysisMode": args.mode,
            "analysisStage": "fast" if args.mode == "fast" else "full",
            "timings": timings,
            "bpm": bpm,
            "bpmConfidence": round(float(bpm_confidence), 4),
            "beatGridConfidence": round(float(bpm_debug.get("beatGridConfidence", 0)), 4),
            "arrangementGridConfidence": round(float(bpm_debug.get("arrangementGridConfidence", 0)), 4),
            "bpmCandidates": bpm_candidates,
            "normalizedBpmCandidates": normalized_bpm_candidates,
            "key": key,
            "mode": mode,
            "keyConfidence": round(float(key_confidence), 4),
            "keyCertainty": certainty,
            "tuningCents": tuning_cents,
            "referenceAHz": reference_a_hz(tuning_cents),
            "keyCandidates": key_candidates,
            "source": source,
        }

        if args.debug or args.mode == "debug" or os.environ.get("AUDIO_ANALYSIS_DEBUG") == "true":
            result["debug"] = {
                "file": args.audio_file,
                "confidenceBands": {
                    "strong": STRONG_CONFIDENCE,
                    "usable": USABLE_CONFIDENCE,
                    "uncertain": UNCERTAIN_CONFIDENCE,
                },
                "bpmConfidenceLabel": confidence_label(bpm_confidence),
                "keyConfidenceLabel": confidence_label(key_confidence),
                "harmonicRatio": round(float(key_debug.get("harmonicRatio", 0)), 4),
                "tuningCents": tuning_cents,
                "referenceAHz": reference_a_hz(tuning_cents),
                "tuningCorrectionApplied": tuning_correction_applied,
                "audio": analysis_audio_debug,
                "filenameBpmHint": filename_bpm_hint,
                "filenameKeyHint": filename_key_hint,
                "selected": {
                    "bpm": bpm,
                    "rawBpm": raw_bpm,
                    "key": key,
                    "mode": mode,
                },
                "bpmSelection": {
                    "rawCandidates": bpm_candidates,
                    "normalizedCandidates": normalized_bpm_candidates,
                    "methodVotes": sorted(
                        {
                            method
                            for candidate in bpm_candidates
                            for method in methods_from_reasons(candidate.get("reasons", []))
                        }
                    ),
                    "chosenDisplayBpm": bpm,
                    "reason": bpm_choice_reason,
                    "beatGridConfidence": bpm_debug.get("beatGridConfidence", 0),
                    "arrangementGridConfidence": bpm_debug.get("arrangementGridConfidence", 0),
                    "arrangementGrid": bpm_debug.get("arrangementGrid", {}),
                    "windowStability": bpm_debug.get("confidence", {}).get("windowStability", 0),
                    "confidenceExplanation": bpm_debug.get("confidence", {}).get("explanation", []),
                    "windows": bpm_debug.get("windows", []),
                    "lowEndCandidates": [
                        candidate
                        for candidate in bpm_candidates
                        if "low_end" in candidate.get("methods", [])
                        or any("low_end" in reason for reason in candidate.get("reasons", []))
                    ],
                    "multiBandCandidates": [
                        candidate
                        for candidate in bpm_candidates
                        if "multi_band_acf" in candidate.get("methods", [])
                        or any("multi_band_acf" in reason for reason in candidate.get("reasons", []))
                    ],
                    "plpCandidates": [
                        candidate
                        for candidate in bpm_candidates
                        if "plp_acf" in candidate.get("methods", [])
                        or any("plp" in reason for reason in candidate.get("reasons", []))
                    ],
                    "percussiveCandidates": [
                        candidate
                        for candidate in bpm_candidates
                        if "percussive" in candidate.get("methods", [])
                        or any("percussive" in reason for reason in candidate.get("reasons", []))
                    ],
                    "tripletDecisions": [
                        {
                            "bpm": candidate.get("bpm"),
                            "labels": candidate.get("labels", []),
                        }
                        for candidate in bpm_candidates
                        if "tripletPulse" in candidate.get("labels", [])
                        or "trapDrillDoubleTime" in candidate.get("labels", [])
                    ],
                    "rejectedCandidates": [
                        {
                            "bpm": candidate.get("bpm"),
                            "reason": candidate.get("reason"),
                            "labels": candidate.get("labels", []),
                            "beatGridScore": candidate.get("beatGridScore"),
                            "arrangementGridScore": candidate.get("arrangementGridScore"),
                        }
                        for candidate in bpm_candidates
                        if candidate.get("reason") == "kept for comparison"
                    ],
                },
                "keySelection": {
                    "windowCandidates": key_debug.get("windows", []),
                    "topKeyCandidates": key_debug.get("topKeyCandidates", key_candidates),
                    "essentiaKeyCandidates": (essentia_data or {}).get("keyCandidates", []),
                    "keyFinder": key_debug.get("keyfinder", keyfinder_data),
                    "selectedMethods": key_debug.get("selectedMethods", []),
                    "selectedIndependentMethods": key_debug.get("selectedIndependentMethods", []),
                    "topKeyGap": key_debug.get("topKeyGap"),
                    "possibleKey": key_debug.get("possibleKey"),
                    "selectionReason": key_debug.get("selectionReason"),
                    "tuningCorrectionApplied": key_debug.get(
                        "tuningCorrectionApplied",
                        tuning_correction_applied,
                    ),
                    "finalCertainty": certainty,
                },
                "rejectedResults": {
                    "bpm": bpm_debug.get("rejected", []),
                    "key": key_debug.get("rejected", []),
                    "essentia": (essentia_data or {}).get("errors", []),
                    "keyfinder": [keyfinder_error] if keyfinder_error else [],
                    "madmom": [madmom_error] if madmom_error else [],
                },
            }

        print(json.dumps(result))
        return 0
    except Exception as error:
        print(json.dumps(empty_result(str(error))))
        return 0


if __name__ == "__main__":
    sys.exit(main())
