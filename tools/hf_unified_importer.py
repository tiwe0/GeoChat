#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
import re
import sqlite3
import sys
import time
from pathlib import Path
from typing import Any, Callable, Iterable


USAGES = {"production", "external", "reasoning", "evaluation"}
ANSWER_TYPES = {"label", "free_form", "numeric", "expression", "multi_label", "unknown"}


def main() -> int:
    args = parse_args()
    input_root = Path(args.input_root).resolve()
    db_path = Path(args.db).resolve()
    manifest_path = input_root / "manifest.json"
    if not manifest_path.exists():
        raise SystemExit(f"manifest not found: {manifest_path}")

    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    db_path.parent.mkdir(parents=True, exist_ok=True)

    if args.pyarrow_path:
        sys.path.insert(0, str(Path(args.pyarrow_path).resolve()))

    conn = sqlite3.connect(str(db_path), timeout=30)
    configure_sqlite(conn)
    create_schema(conn)
    if args.reset:
        conn.execute("DELETE FROM unified_problem_records")
        conn.execute("DELETE FROM unified_problem_sources")
        conn.commit()

    totals: dict[str, int] = {}
    started = time.time()
    for dataset in manifest["datasets"]:
        count = import_dataset(conn, dataset, args.limit_per_dataset, args.batch_size)
        totals[dataset["repoId"]] = count
        print(f"{dataset['repoId']}: imported {count}", flush=True)

    elapsed = time.time() - started
    total = sum(totals.values())
    print(json.dumps({"db": str(db_path), "records": total, "seconds": round(elapsed, 2), "datasets": totals}, ensure_ascii=False, indent=2))
    return 0


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Import downloaded Hugging Face math datasets into unified SQLite tables.")
    parser.add_argument("--input-root", default="data/raw/huggingface")
    parser.add_argument("--db", default="data/huggingface-unified-problems.sqlite")
    parser.add_argument("--pyarrow-path", default="/tmp/geochat-hf-profiler-py")
    parser.add_argument("--limit-per-dataset", type=int, default=0)
    parser.add_argument("--batch-size", type=int, default=1000)
    parser.add_argument("--reset", action="store_true")
    return parser.parse_args()


def configure_sqlite(conn: sqlite3.Connection) -> None:
    conn.execute("PRAGMA busy_timeout = 30000")
    conn.execute("PRAGMA journal_mode = WAL")
    conn.execute("PRAGMA synchronous = NORMAL")
    conn.execute("PRAGMA temp_store = MEMORY")


def create_schema(conn: sqlite3.Connection) -> None:
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS unified_problem_sources (
          id TEXT PRIMARY KEY,
          requested_id TEXT,
          repo_id TEXT NOT NULL,
          group_name TEXT NOT NULL CHECK (group_name IN ('production', 'external', 'reasoning', 'evaluation')),
          commit_sha TEXT,
          license TEXT,
          local_dir TEXT,
          source_hash TEXT NOT NULL,
          imported_at INTEGER NOT NULL,
          raw_metadata TEXT NOT NULL,
          UNIQUE (repo_id, group_name)
        );

        CREATE TABLE IF NOT EXISTS unified_problem_records (
          id TEXT PRIMARY KEY,
          source_id TEXT NOT NULL,
          source_item_id TEXT,
          source_file TEXT NOT NULL,
          source_index INTEGER NOT NULL,
          source_split TEXT,
          dataset_id TEXT NOT NULL,
          group_name TEXT NOT NULL CHECK (group_name IN ('production', 'external', 'reasoning', 'evaluation')),
          modality TEXT NOT NULL CHECK (modality IN ('text', 'image', 'multimodal')),
          construction TEXT NOT NULL CHECK (construction IN ('open_ended', 'multiple_choice', 'fill_blank', 'worked_solution', 'reasoning_trace')),
          prompt TEXT NOT NULL,
          answer_final TEXT,
          answer_type TEXT CHECK (answer_type IN ('label', 'free_form', 'numeric', 'expression', 'multi_label', 'unknown')),
          subject TEXT,
          grade TEXT,
          difficulty TEXT,
          language TEXT,
          license TEXT,
          media_count INTEGER NOT NULL DEFAULT 0,
          choice_count INTEGER NOT NULL DEFAULT 0,
          record_payload TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          UNIQUE (source_id, source_file, source_index)
        );

        CREATE UNIQUE INDEX IF NOT EXISTS unified_problem_sources_repo_uidx ON unified_problem_sources (repo_id, group_name);
        CREATE INDEX IF NOT EXISTS unified_problem_sources_group_idx ON unified_problem_sources (group_name);
        CREATE UNIQUE INDEX IF NOT EXISTS unified_problem_records_source_item_uidx ON unified_problem_records (source_id, source_file, source_index);
        CREATE INDEX IF NOT EXISTS unified_problem_records_dataset_split_idx ON unified_problem_records (dataset_id, source_split);
        CREATE INDEX IF NOT EXISTS unified_problem_records_group_idx ON unified_problem_records (group_name, dataset_id);
        CREATE INDEX IF NOT EXISTS unified_problem_records_shape_idx ON unified_problem_records (construction, modality);
        CREATE INDEX IF NOT EXISTS unified_problem_records_taxonomy_idx ON unified_problem_records (subject, grade);
        """
    )
    conn.commit()


def import_dataset(conn: sqlite3.Connection, dataset: dict[str, Any], limit: int, batch_size: int) -> int:
    repo_id = dataset["repoId"]
    group = dataset["group"]
    if group not in USAGES:
        raise ValueError(f"unknown dataset group: {group}")
    local_dir = Path(dataset["localDir"]).resolve()
    source_id = source_slug(repo_id)
    imported_at = now_ms()
    source_hash = dataset.get("sha") or hash_json(dataset)
    license_value = license_from_dataset(dataset)

    conn.execute(
        """
        INSERT INTO unified_problem_sources (
          id, requested_id, repo_id, group_name, commit_sha, license, local_dir, source_hash, imported_at, raw_metadata
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          requested_id = excluded.requested_id,
          repo_id = excluded.repo_id,
          group_name = excluded.group_name,
          commit_sha = excluded.commit_sha,
          license = excluded.license,
          local_dir = excluded.local_dir,
          source_hash = excluded.source_hash,
          imported_at = excluded.imported_at,
          raw_metadata = excluded.raw_metadata
        """,
        (
            source_id,
            dataset.get("requestedId"),
            repo_id,
            group,
            dataset.get("sha"),
            license_value,
            str(local_dir),
            source_hash,
            imported_at,
            json_dumps(sanitize(dataset)),
        ),
    )
    conn.commit()

    specs = dataset_specs(repo_id, local_dir)
    rows: list[tuple[Any, ...]] = []
    total = 0
    for spec in specs:
        for source_index, row in read_rows(spec["path"], spec["format"]):
            if limit and total >= limit:
                break
            record = spec["mapper"](
                row,
                {
                    "dataset": dataset,
                    "sourceId": source_id,
                    "sourceFile": relative_path(spec["path"], local_dir),
                    "sourceIndex": source_index,
                    "sourceSplit": spec["split"],
                    "license": license_value,
                },
            )
            if record is None:
                continue
            rows.append(record_to_row(record, imported_at))
            total += 1
            if len(rows) >= batch_size:
                write_records(conn, rows)
                rows.clear()
        if limit and total >= limit:
            break
    if rows:
        write_records(conn, rows)
    return total


def dataset_specs(repo_id: str, local_dir: Path) -> list[dict[str, Any]]:
    if repo_id == "THU-KEG/MM_Math":
        return [{"path": local_dir / "MM_Math" / "MM_Math.jsonl", "format": "jsonl", "split": "train", "mapper": map_mm_math}]
    if repo_id == "FanqingM/MMK12":
        return [
            {"path": path, "format": "parquet", "split": split_from_name(path.name), "mapper": map_mmk12}
            for path in sorted((local_dir / "data").glob("*.parquet"))
        ]
    if repo_id == "aslawliet/cn-k12":
        return [{"path": local_dir / "train-00001-of-00001.json", "format": "json", "split": "train", "mapper": map_cn_k12}]
    if repo_id == "ecnu-icalk/cmm-math":
        return [
            {"path": local_dir / "train_data.jsonl", "format": "jsonl", "split": "train", "mapper": map_cmm_math},
            {"path": local_dir / "test_data.jsonl", "format": "jsonl", "split": "test", "mapper": map_cmm_math},
        ]
    if repo_id == "lizhongzhi2022/cmmath":
        return [{"path": local_dir / "cmmath.json", "format": "json", "split": "all", "mapper": map_cmmath}]
    if repo_id == "AI-MO/NuminaMath-CoT":
        return [
            {"path": path, "format": "parquet", "split": split_from_name(path.name), "mapper": map_numina_math}
            for path in sorted((local_dir / "data").glob("*.parquet"))
        ]
    if repo_id == "openai/gsm8k":
        specs: list[dict[str, Any]] = []
        for subset in ("main", "socratic"):
            for path in sorted((local_dir / subset).glob("*.parquet")):
                specs.append({"path": path, "format": "parquet", "split": f"{subset}/{split_from_name(path.name)}", "mapper": map_gsm8k})
        return specs
    if repo_id == "brucewlee1/mmlu-high-school-mathematics":
        return [
            {"path": local_dir / "dev.json", "format": "jsonl", "split": "dev", "mapper": map_mmlu_math},
            {"path": local_dir / "test.json", "format": "jsonl", "split": "test", "mapper": map_mmlu_math},
        ]
    return []


def read_rows(path: Path, fmt: str) -> Iterable[tuple[int, Any]]:
    if not path.exists():
        return
    if fmt == "jsonl":
        with path.open("r", encoding="utf-8") as handle:
            for index, line in enumerate(handle):
                line = line.strip()
                if line:
                    yield index, json.loads(line)
        return
    if fmt == "json":
        with path.open("r", encoding="utf-8") as handle:
            data = json.load(handle)
        if isinstance(data, list):
            for index, row in enumerate(data):
                yield index, row
        else:
            yield 0, data
        return
    if fmt == "parquet":
        try:
            import pyarrow.parquet as pq  # type: ignore
        except Exception as exc:
            raise RuntimeError(
                "pyarrow is required for parquet imports. Set GEOCHAT_PYARROW_PATH or run the profiler setup first."
            ) from exc
        parquet_file = pq.ParquetFile(path)
        index = 0
        for batch in parquet_file.iter_batches(batch_size=1024):
            for row in batch.to_pylist():
                yield index, row
                index += 1
        return
    raise ValueError(f"unsupported format: {fmt}")


def map_mm_math(row: dict[str, Any], ctx: dict[str, Any]) -> dict[str, Any] | None:
    prompt = clean_text(row.get("question"))
    if not prompt:
        return None
    file_name = clean_text(row.get("file_name"))
    media = [{"kind": "image", "path": f"MM_Math/MM_Math.zip::{file_name}", "alt": file_name}] if file_name else []
    return make_record(
        ctx,
        item_id=file_name or str(ctx["sourceIndex"]),
        prompt=prompt,
        modality="multimodal" if media else "text",
        construction="worked_solution",
        answer={"type": "unknown", "solution": clean_text(row.get("solution"))},
        media=media,
        taxonomy={
            "language": "en",
            "subject": "math",
            "grade": clean_text(row.get("year")),
            "difficulty": clean_text(row.get("difficult")),
            "knowledge": flatten_knowledge(row.get("knowledge")),
        },
        raw=row,
    )


def map_mmk12(row: dict[str, Any], ctx: dict[str, Any]) -> dict[str, Any] | None:
    prompt = clean_text(row.get("question"))
    if not prompt:
        return None
    choices = extract_choices_from_prompt(prompt)
    answer = clean_text(row.get("answer"))
    image = row.get("image") if isinstance(row.get("image"), dict) else None
    image_path = clean_text(image.get("path") if image else None)
    media = [{"kind": "image", "path": image_path, "alt": image_path}] if image_path else []
    construction = "multiple_choice" if choices else infer_construction(prompt, answer, None)
    return make_record(
        ctx,
        item_id=clean_text(row.get("id")) or str(ctx["sourceIndex"]),
        prompt=prompt,
        modality="multimodal" if media else "text",
        construction=construction,
        answer={"final": answer, "type": "label" if is_label_answer(answer) else "free_form", "choices": choices or None},
        media=media,
        taxonomy={"language": "en", "subject": clean_text(row.get("subject"))},
        raw=row,
    )


def map_cn_k12(row: dict[str, Any], ctx: dict[str, Any]) -> dict[str, Any] | None:
    prompt = clean_text(row.get("problem"))
    if not prompt:
        return None
    return make_record(
        ctx,
        item_id=str(ctx["sourceIndex"]),
        prompt=prompt,
        modality="text",
        construction="worked_solution",
        answer={"type": "unknown", "solution": clean_text(row.get("solution"))},
        media=[],
        taxonomy={"language": "en", "subject": "math", "tags": ["non-commercial-license"]},
        raw=row,
    )


def map_cmm_math(row: dict[str, Any], ctx: dict[str, Any]) -> dict[str, Any] | None:
    prompt = clean_text(row.get("question"))
    if not prompt:
        return None
    options = clean_text(row.get("options"))
    choices = parse_options(options)
    answer = clean_text(row.get("answer"))
    images = row.get("image") if isinstance(row.get("image"), list) else []
    media = [{"kind": "image", "path": clean_text(item), "alt": clean_text(item)} for item in images if clean_text(item)]
    return make_record(
        ctx,
        item_id=clean_text(row.get("id")) or str(ctx["sourceIndex"]),
        prompt=prompt,
        modality="multimodal" if media else "text",
        construction="multiple_choice" if choices else infer_construction(prompt, answer, None),
        answer={
            "final": answer,
            "type": "label" if is_label_answer(answer) else "free_form",
            "choices": choices or None,
            "solution": nullish_to_none(row.get("solution")),
            "analysis": clean_text(row.get("analysis")),
        },
        media=media,
        taxonomy={"language": "zh", "subject": clean_text(row.get("subject")), "grade": clean_text(row.get("level"))},
        raw=row,
    )


def map_cmmath(row: dict[str, Any], ctx: dict[str, Any]) -> dict[str, Any] | None:
    prompt = clean_text(row.get("question"))
    if not prompt:
        return None
    image_urls = row.get("image_url") if isinstance(row.get("image_url"), list) else []
    image_paths = row.get("image") if isinstance(row.get("image"), list) else []
    img_info = []
    metadata = row.get("metadata") if isinstance(row.get("metadata"), dict) else {}
    if isinstance(metadata.get("img_info"), list):
        img_info = metadata.get("img_info")
    media = []
    max_len = max(len(image_urls), len(image_paths), len(img_info), 0)
    for index in range(max_len):
        info = img_info[index] if index < len(img_info) and isinstance(img_info[index], dict) else {}
        image_path = clean_text(image_paths[index]) if index < len(image_paths) else None
        image_url = clean_text(image_urls[index]) if index < len(image_urls) else None
        media.append(
            {
                "kind": "image",
                "path": f"CMMaTH.zip::{image_path}" if image_path else None,
                "url": image_url,
                "width": int(info["width"]) if str(info.get("width", "")).isdigit() else None,
                "height": int(info["height"]) if str(info.get("height", "")).isdigit() else None,
                "alt": image_path or image_url,
            }
        )
    answer_type = normalize_answer_type(row.get("answer_type"))
    tags = [clean_text(metadata.get("source")), clean_text(metadata.get("multimodal-category")), clean_text(metadata.get("task-target"))]
    return make_record(
        ctx,
        item_id=clean_text(row.get("problem_id")) or str(ctx["sourceIndex"]),
        prompt=prompt,
        modality="multimodal" if media else "text",
        construction=infer_construction(prompt, clean_text(row.get("answer")), answer_type),
        answer={
            "final": clean_text(row.get("answer")),
            "type": answer_type,
            "analysis": clean_text(row.get("analysis")),
        },
        media=media,
        taxonomy={
            "language": "zh",
            "subject": "math",
            "grade": scalar_to_text(row.get("grade_id")),
            "gradeGroup": scalar_to_text(row.get("grade_group")),
            "knowledge": split_knowledge_path(row.get("knowledge_point")),
            "skills": compact_list([clean_text(row.get("skill"))]),
            "tags": compact_list(tags),
        },
        raw=row,
    )


def map_numina_math(row: dict[str, Any], ctx: dict[str, Any]) -> dict[str, Any] | None:
    prompt = clean_text(row.get("problem"))
    if not prompt:
        return None
    source = clean_text(row.get("source"))
    return make_record(
        ctx,
        item_id=f"{ctx['sourceFile']}:{ctx['sourceIndex']}",
        prompt=prompt,
        modality="text",
        construction="reasoning_trace",
        answer={
            "type": "unknown",
            "solution": clean_text(row.get("solution")),
            "reasoningTrace": sanitize(row.get("messages")),
        },
        media=[],
        taxonomy={"language": "en", "subject": "math", "tags": compact_list([source])},
        raw=row,
    )


def map_gsm8k(row: dict[str, Any], ctx: dict[str, Any]) -> dict[str, Any] | None:
    prompt = clean_text(row.get("question"))
    if not prompt:
        return None
    solution = clean_text(row.get("answer"))
    final = None
    if solution:
        match = re.search(r"####\s*([^\n]+)", solution)
        final = match.group(1).strip() if match else None
    return make_record(
        ctx,
        item_id=f"{ctx['sourceSplit']}:{ctx['sourceIndex']}",
        prompt=prompt,
        modality="text",
        construction="worked_solution",
        answer={"final": final, "type": "numeric" if final else "unknown", "solution": solution},
        media=[],
        taxonomy={"language": "en", "subject": "math"},
        raw=row,
    )


def map_mmlu_math(row: dict[str, Any], ctx: dict[str, Any]) -> dict[str, Any] | None:
    prompt = clean_text(row.get("centerpiece"))
    if not prompt:
        return None
    options = row.get("options") if isinstance(row.get("options"), list) else []
    correct_indexes = row.get("correct_options_idx") if isinstance(row.get("correct_options_idx"), list) else []
    correct_labels = [index_to_label(int(index)) for index in correct_indexes if isinstance(index, int)]
    choices = [
        {"label": index_to_label(index), "text": clean_text(option) or "", "isCorrect": index in correct_indexes}
        for index, option in enumerate(options)
    ]
    final = ",".join(correct_labels) if correct_labels else clean_text(row.get("correct_options"))
    return make_record(
        ctx,
        item_id=f"{ctx['sourceSplit']}:{ctx['sourceIndex']}",
        prompt=prompt,
        modality="text",
        construction="multiple_choice",
        answer={
            "final": final,
            "type": "multi_label" if len(correct_labels) > 1 else "label",
            "choices": choices,
            "analysis": clean_text(row.get("correct_options_literal")),
        },
        media=[],
        taxonomy={"language": "en", "subject": "math", "grade": "high-school"},
        raw=row,
    )


def make_record(
    ctx: dict[str, Any],
    *,
    item_id: str,
    prompt: str,
    modality: str,
    construction: str,
    answer: dict[str, Any],
    media: list[dict[str, Any]],
    taxonomy: dict[str, Any],
    raw: Any,
) -> dict[str, Any]:
    dataset = ctx["dataset"]
    item_id = safe_item_id(item_id)
    record_id = stable_record_id(dataset["repoId"], ctx["sourceSplit"], ctx["sourceFile"], ctx["sourceIndex"], item_id)
    clean_answer = drop_none(answer)
    clean_media = [drop_none(item) for item in media if drop_none(item)]
    clean_taxonomy = drop_empty_taxonomy(taxonomy)
    return {
        "id": record_id,
        "source": {
            "datasetId": dataset["repoId"],
            "requestedId": dataset.get("requestedId"),
            "group": dataset["group"],
            "commit": dataset.get("sha"),
            "license": ctx.get("license"),
            "sourceFile": ctx["sourceFile"],
            "sourceIndex": ctx["sourceIndex"],
            "sourceSplit": ctx["sourceSplit"],
            "sourceItemId": item_id,
        },
        "modality": modality,
        "construction": construction,
        "prompt": prompt,
        "answer": clean_answer,
        "media": clean_media,
        "taxonomy": clean_taxonomy,
        "raw": sanitize(raw),
    }


def record_to_row(record: dict[str, Any], timestamp: int) -> tuple[Any, ...]:
    source = record["source"]
    answer = record.get("answer") or {}
    taxonomy = record.get("taxonomy") or {}
    return (
        record["id"],
        source_id_from_repo(source["datasetId"]),
        source.get("sourceItemId"),
        source["sourceFile"],
        int(source.get("sourceIndex") or 0),
        source.get("sourceSplit"),
        source["datasetId"],
        source["group"],
        record["modality"],
        record["construction"],
        record["prompt"],
        scalar_to_text(answer.get("final")),
        normalize_answer_type(answer.get("type")),
        scalar_to_text(taxonomy.get("subject")),
        scalar_to_text(taxonomy.get("grade")),
        scalar_to_text(taxonomy.get("difficulty")),
        scalar_to_text(taxonomy.get("language")),
        source.get("license"),
        len(record.get("media") or []),
        len(answer.get("choices") or []),
        json_dumps(record),
        timestamp,
        timestamp,
    )


def write_records(conn: sqlite3.Connection, rows: list[tuple[Any, ...]]) -> None:
    conn.executemany(
        """
        INSERT INTO unified_problem_records (
          id, source_id, source_item_id, source_file, source_index, source_split,
          dataset_id, group_name, modality, construction, prompt, answer_final,
          answer_type, subject, grade, difficulty, language, license, media_count,
          choice_count, record_payload, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(source_id, source_file, source_index) DO UPDATE SET
          id = excluded.id,
          source_item_id = excluded.source_item_id,
          source_split = excluded.source_split,
          dataset_id = excluded.dataset_id,
          group_name = excluded.group_name,
          modality = excluded.modality,
          construction = excluded.construction,
          prompt = excluded.prompt,
          answer_final = excluded.answer_final,
          answer_type = excluded.answer_type,
          subject = excluded.subject,
          grade = excluded.grade,
          difficulty = excluded.difficulty,
          language = excluded.language,
          license = excluded.license,
          media_count = excluded.media_count,
          choice_count = excluded.choice_count,
          record_payload = excluded.record_payload,
          updated_at = excluded.updated_at
        """,
        rows,
    )
    conn.commit()


def sanitize(value: Any) -> Any:
    if isinstance(value, bytes):
        return {"__bytes__": len(value)}
    if isinstance(value, dict):
        return {str(key): sanitize(inner) for key, inner in value.items()}
    if isinstance(value, list):
        return [sanitize(inner) for inner in value]
    return value


def drop_none(value: dict[str, Any]) -> dict[str, Any]:
    return {key: inner for key, inner in value.items() if inner is not None and inner != [] and inner != {}}


def drop_empty_taxonomy(value: dict[str, Any]) -> dict[str, Any]:
    return {key: inner for key, inner in value.items() if inner not in (None, "", [], {})}


def clean_text(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, (list, dict)):
        if not value:
            return None
        return json_dumps(sanitize(value))
    text = str(value).strip()
    if not text or text.lower() in {"null", "none", "nan"}:
        return None
    return text


def nullish_to_none(value: Any) -> str | None:
    return clean_text(value)


def scalar_to_text(value: Any) -> str | None:
    return clean_text(value)


def compact_list(values: Iterable[str | None]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for value in values:
        if not value or value in seen:
            continue
        seen.add(value)
        result.append(value)
    return result


def flatten_knowledge(value: Any) -> list[str]:
    if isinstance(value, dict):
        return compact_list(clean_text(item) for item in value.values())
    if isinstance(value, list):
        return compact_list(clean_text(item) for item in value)
    text = clean_text(value)
    return [text] if text else []


def split_knowledge_path(value: Any) -> list[str]:
    text = clean_text(value)
    if not text:
        return []
    parts = re.split(r"[()/\\\\>]+", text.replace("(", "/").replace(")", "/").replace("（", "/").replace("）", "/"))
    return compact_list(part.strip() for part in parts if part.strip())


def parse_options(options: str | None) -> list[dict[str, Any]]:
    if not options:
        return []
    result = []
    for match in re.finditer(r"(^|\n)\s*([A-Z])[\.\)]\s*([^\n]+)", options):
        result.append({"label": match.group(2), "text": match.group(3).strip()})
    return result


def extract_choices_from_prompt(prompt: str) -> list[dict[str, Any]]:
    result = []
    for match in re.finditer(r"(^|\n)\s*([A-D])[\.\)]\s*([^\n]+)", prompt):
        result.append({"label": match.group(2), "text": match.group(3).strip()})
    return result


def infer_construction(prompt: str, answer: str | None, answer_type: str | None) -> str:
    if answer_type == "label" or is_label_answer(answer):
        return "multiple_choice"
    if re.search(r"(_{2,}|\\underline\{\}|fill\s+in|blank|\(\s*\))", prompt, re.IGNORECASE):
        return "fill_blank"
    return "open_ended"


def normalize_answer_type(value: Any) -> str | None:
    text = clean_text(value)
    if not text:
        return None
    normalized = text.lower().replace("-", "_").replace(" ", "_")
    if normalized in ANSWER_TYPES:
        return normalized
    if normalized in {"choice", "single_choice", "multiple_choice"}:
        return "label"
    return "unknown"


def is_label_answer(value: str | None) -> bool:
    return bool(value and re.fullmatch(r"[A-Z](\s*,\s*[A-Z])*", value.strip()))


def index_to_label(index: int) -> str:
    return chr(ord("A") + index)


def source_slug(repo_id: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", repo_id.lower()).strip("-")


def source_id_from_repo(repo_id: str) -> str:
    return source_slug(repo_id)


def stable_record_id(repo_id: str, split: str | None, source_file: str, source_index: int, item_id: str) -> str:
    slug = source_slug(repo_id)
    split_piece = re.sub(r"[^a-zA-Z0-9]+", "-", split or "all").strip("-").lower()
    item_piece = safe_item_id(item_id)[:80]
    digest = hashlib.sha1(f"{repo_id}|{source_file}|{source_index}|{item_id}".encode("utf-8")).hexdigest()[:12]
    return f"{slug}:{split_piece}:{item_piece}:{digest}"


def safe_item_id(value: str) -> str:
    text = clean_text(value) or "row"
    return re.sub(r"[^a-zA-Z0-9_.:-]+", "-", text).strip("-") or "row"


def split_from_name(name: str) -> str:
    if name.startswith("train"):
        return "train"
    if name.startswith("test"):
        return "test"
    if name.startswith("dev"):
        return "dev"
    return Path(name).stem


def relative_path(path: Path, root: Path) -> str:
    return str(path.resolve().relative_to(root.resolve()))


def license_from_dataset(dataset: dict[str, Any]) -> str | None:
    if dataset.get("license"):
        return dataset["license"]
    for tag in dataset.get("tags") or []:
        if isinstance(tag, str) and tag.startswith("license:"):
            return tag.split(":", 1)[1]
    return None


def hash_json(value: Any) -> str:
    return hashlib.sha1(json_dumps(sanitize(value)).encode("utf-8")).hexdigest()


def json_dumps(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def now_ms() -> int:
    return int(time.time() * 1000)


if __name__ == "__main__":
    raise SystemExit(main())
