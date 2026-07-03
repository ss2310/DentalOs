"use client";

import { useMemo, useRef, useState } from "react";
import {
  ENTITIES,
  ENTITY_KEYS,
  LIMITS,
  buildRecord,
  parseCsv,
  rowsToObjects,
  type DetectionResult,
  type EntityKey,
  type Mapping,
} from "@/lib/data-migration";
import { detectMapping, importRecords } from "./migration-actions";

type Step = "upload" | "map" | "preview" | "result";

const DONT_IMPORT = "";

// Brief per-step "how it works" guidance (the how-to notes requested).
const STEP_HELP: Record<Step, string> = {
  upload:
    "Export your patients or treatments from your old software as a CSV file, then upload it here. Nothing is imported yet.",
  map: "We used AI to guess what this file is and match its columns to GrowthOS fields. Check each row and fix anything that looks wrong.",
  preview:
    "Here's exactly what will be saved. Rows with a missing name or unreadable value are skipped automatically — everything else imports.",
  result: "All done. You can import another file or close this.",
};

export function DataMigration() {
  const [step, setStep] = useState<Step>("upload");
  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [entity, setEntity] = useState<EntityKey>("patients");
  const [mapping, setMapping] = useState<Mapping>({});
  const [detection, setDetection] = useState<DetectionResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    imported: number;
    skipped: number;
    problems: string[];
  } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const def = ENTITIES[entity];

  function reset() {
    setStep("upload");
    setFileName("");
    setHeaders([]);
    setRows([]);
    setEntity("patients");
    setMapping({});
    setDetection(null);
    setError(null);
    setResult(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    if (file.size > LIMITS.maxFileBytes) {
      setError(`That file is too large (limit ${LIMITS.maxFileBytes / 1024 / 1024} MB).`);
      return;
    }
    const text = await file.text();
    const { headers: h, rows: r } = parseCsv(text);
    if (h.length === 0 || r.length === 0) {
      setError("Couldn't find any rows in that file. Is it a CSV with a header row?");
      return;
    }
    const objs = rowsToObjects(h, r).slice(0, LIMITS.maxRows);
    setFileName(file.name);
    setHeaders(h);
    setRows(objs);

    // Ask the AI to detect the entity + mapping.
    setLoading(true);
    const res = await detectMapping({ headers: h, sampleRows: objs.slice(0, LIMITS.aiSampleRows) });
    setLoading(false);
    if (res.error && !res.result) {
      // Non-fatal: fall through to manual mapping with empty mapping.
      setError(res.error);
      setEntity("patients");
      setMapping(Object.fromEntries(h.map((x) => [x, null])));
    } else if (res.result) {
      setEntity(res.result.entity);
      setMapping(res.result.mapping);
      setDetection(res.result);
    }
    setStep("map");
  }

  // Set a header → field, keeping the field unique (clear it from other headers).
  function setHeaderField(header: string, fieldKey: string) {
    setMapping((prev) => {
      const next: Mapping = { ...prev };
      if (fieldKey === DONT_IMPORT) {
        next[header] = null;
        return next;
      }
      for (const h of Object.keys(next)) {
        if (next[h] === fieldKey) next[h] = null;
      }
      next[header] = fieldKey;
      return next;
    });
  }

  function changeEntity(next: EntityKey) {
    setEntity(next);
    setDetection(null);
    // Field keys differ per entity — reset the mapping for manual re-map.
    setMapping(Object.fromEntries(headers.map((h) => [h, null])));
  }

  // Validation counts across ALL rows (for the preview summary).
  const counts = useMemo(() => {
    let ready = 0;
    let skip = 0;
    for (const row of rows) {
      const { problems } = buildRecord(def, mapping, row);
      if (problems.length > 0) skip++;
      else ready++;
    }
    return { ready, skip };
  }, [rows, mapping, def]);

  const requiredMapped = def.fields
    .filter((f) => f.required)
    .every((f) => Object.values(mapping).includes(f.key));

  async function runImport() {
    setLoading(true);
    setError(null);
    const res = await importRecords({ entity, mapping, rows });
    setLoading(false);
    if (res.error && res.imported === undefined) {
      setError(res.error);
      return;
    }
    setResult({
      imported: res.imported ?? 0,
      skipped: res.skipped ?? 0,
      problems: res.problems ?? [],
    });
    setStep("result");
  }

  return (
    <div className="rounded-card border border-border bg-white p-5 sm:p-6">
      {/* Header + stepper */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-text-primary">
            Data Migration
          </h2>
          <p className="mt-1 text-sm text-text-secondary">
            Bring patients or treatments over from your old software.
          </p>
        </div>
        {step !== "upload" ? (
          <button
            type="button"
            onClick={reset}
            className="h-10 rounded-button px-3 text-sm font-medium text-text-secondary hover:bg-subtle"
          >
            {step === "result" ? "Close" : "Exit"}
          </button>
        ) : null}
      </div>

      <Stepper step={step} />

      {/* Per-step guidance note */}
      <div className="mt-4 rounded-card border border-primary/20 bg-primary/5 px-4 py-3 text-sm text-text-secondary">
        {STEP_HELP[step]}
      </div>

      {error ? (
        <div className="mt-4 rounded-card border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger">
          {error}
        </div>
      ) : null}

      {/* STEP: upload */}
      {step === "upload" ? (
        <div className="mt-5">
          <label
            className={`flex min-h-[140px] cursor-pointer flex-col items-center justify-center gap-2 rounded-card border-2 border-dashed border-border px-4 py-8 text-center transition-colors hover:border-primary/50 ${
              loading ? "pointer-events-none opacity-60" : ""
            }`}
          >
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={onFile}
              disabled={loading}
            />
            <span className="text-[15px] font-medium text-text-primary">
              {loading ? "Analysing your file…" : "Choose a CSV file"}
            </span>
            <span className="text-sm text-text-secondary">
              or drag it onto this box · max {LIMITS.maxFileBytes / 1024 / 1024} MB,{" "}
              {LIMITS.maxRows.toLocaleString("en-IN")} rows
            </span>
          </label>
          <p className="mt-3 text-xs text-text-secondary">
            We currently import <strong>Patients</strong> and{" "}
            <strong>Treatments / Rate card</strong>. Appointments and dues can be
            added once your patients are in.
          </p>
        </div>
      ) : null}

      {/* STEP: map */}
      {step === "map" ? (
        <div className="mt-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-text-primary">
                This file is:
              </label>
              <select
                value={entity}
                onChange={(e) => changeEntity(e.target.value as EntityKey)}
                className="h-10 rounded-button border border-border bg-white px-3 text-sm text-text-primary outline-none focus:border-primary/50"
              >
                {ENTITY_KEYS.map((k) => (
                  <option key={k} value={k}>
                    {ENTITIES[k].label}
                  </option>
                ))}
              </select>
            </div>
            {detection ? (
              <span className="text-xs text-text-secondary">
                AI confidence: <ConfidenceBadge c={detection.confidence} />
              </span>
            ) : null}
          </div>
          {fileName ? (
            <p className="mt-2 text-xs text-text-secondary">
              From <span className="font-medium text-text-primary">{fileName}</span> ·{" "}
              {rows.length.toLocaleString("en-IN")} row
              {rows.length === 1 ? "" : "s"}
            </p>
          ) : null}
          {detection?.note ? (
            <p className="mt-2 text-xs text-text-secondary">{detection.note}</p>
          ) : null}

          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-text-secondary">
                  <th className="py-2 pr-4 font-semibold">Column in your file</th>
                  <th className="py-2 pr-4 font-semibold">Example</th>
                  <th className="py-2 font-semibold">Import as</th>
                </tr>
              </thead>
              <tbody>
                {headers.map((h) => (
                  <tr key={h} className="border-b border-border/60">
                    <td className="py-2.5 pr-4 font-medium text-text-primary">{h}</td>
                    <td className="max-w-[160px] truncate py-2.5 pr-4 text-text-secondary">
                      {rows[0]?.[h] || "—"}
                    </td>
                    <td className="py-2.5">
                      <select
                        value={mapping[h] ?? DONT_IMPORT}
                        onChange={(e) => setHeaderField(h, e.target.value)}
                        className="h-9 w-full min-w-[180px] rounded-button border border-border bg-white px-2 text-sm text-text-primary outline-none focus:border-primary/50"
                      >
                        <option value={DONT_IMPORT}>— Don&apos;t import —</option>
                        {def.fields.map((f) => (
                          <option key={f.key} value={f.key}>
                            {f.label}
                            {f.required ? " (required)" : ""}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {!requiredMapped ? (
            <p className="mt-3 text-sm text-warning">
              Map the required field
              {def.fields.filter((f) => f.required).length > 1 ? "s" : ""} (
              {def.fields
                .filter((f) => f.required)
                .map((f) => f.label)
                .join(", ")}
              ) to continue.
            </p>
          ) : null}

          <div className="mt-5 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setStep("preview")}
              disabled={!requiredMapped}
              className="h-11 rounded-button bg-primary px-5 text-[15px] font-semibold text-white disabled:opacity-40"
            >
              Preview import
            </button>
          </div>
        </div>
      ) : null}

      {/* STEP: preview */}
      {step === "preview" ? (
        <div className="mt-5">
          <div className="flex flex-wrap gap-4">
            <span className="text-sm text-text-primary">
              <strong className="text-success">{counts.ready.toLocaleString("en-IN")}</strong>{" "}
              ready to import
            </span>
            {counts.skip > 0 ? (
              <span className="text-sm text-text-primary">
                <strong className="text-warning">{counts.skip.toLocaleString("en-IN")}</strong>{" "}
                will be skipped
              </span>
            ) : null}
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-text-secondary">
                  <th className="py-2 pr-4 font-semibold">#</th>
                  {def.fields.map((f) => (
                    <th key={f.key} className="py-2 pr-4 font-semibold">
                      {f.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 25).map((row, i) => {
                  const { record, problems } = buildRecord(def, mapping, row);
                  const bad = problems.length > 0;
                  return (
                    <tr
                      key={i}
                      className={`border-b border-border/60 ${bad ? "bg-warning/5" : ""}`}
                    >
                      <td className="py-2 pr-4 text-text-secondary">
                        {bad ? "⚠" : i + 1}
                      </td>
                      {def.fields.map((f) => (
                        <td key={f.key} className="py-2 pr-4 text-text-primary">
                          {record[f.key] === null || record[f.key] === ""
                            ? "—"
                            : String(record[f.key])}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {rows.length > 25 ? (
              <p className="mt-2 text-xs text-text-secondary">
                Showing the first 25 of {rows.length.toLocaleString("en-IN")} rows.
              </p>
            ) : null}
          </div>

          <div className="mt-5 flex justify-between gap-2">
            <button
              type="button"
              onClick={() => setStep("map")}
              className="h-11 rounded-button px-4 text-[15px] font-medium text-text-secondary hover:bg-subtle"
            >
              Back
            </button>
            <button
              type="button"
              onClick={runImport}
              disabled={loading || counts.ready === 0}
              className="h-11 rounded-button bg-primary px-5 text-[15px] font-semibold text-white disabled:opacity-40"
            >
              {loading
                ? "Importing…"
                : `Import ${counts.ready.toLocaleString("en-IN")} ${def.label.toLowerCase()}`}
            </button>
          </div>
        </div>
      ) : null}

      {/* STEP: result */}
      {step === "result" && result ? (
        <div className="mt-5">
          <div className="rounded-card border border-success/30 bg-success/5 px-4 py-4">
            <p className="text-[15px] font-semibold text-text-primary">
              ✓ Imported {result.imported.toLocaleString("en-IN")}{" "}
              {def.label.toLowerCase()}
            </p>
            {result.skipped > 0 ? (
              <p className="mt-1 text-sm text-text-secondary">
                {result.skipped.toLocaleString("en-IN")} row
                {result.skipped === 1 ? "" : "s"} were skipped (missing or
                unreadable values).
              </p>
            ) : null}
          </div>

          {result.problems.length > 0 ? (
            <details className="mt-3">
              <summary className="cursor-pointer text-sm font-medium text-text-secondary">
                Show skipped-row details
              </summary>
              <ul className="mt-2 space-y-1 text-xs text-text-secondary">
                {result.problems.map((p, i) => (
                  <li key={i}>{p}</li>
                ))}
              </ul>
            </details>
          ) : null}

          <div className="mt-5 flex justify-end gap-2">
            <button
              type="button"
              onClick={reset}
              className="h-11 rounded-button bg-primary px-5 text-[15px] font-semibold text-white"
            >
              Import another file
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Stepper({ step }: { step: Step }) {
  const steps: { key: Step; label: string }[] = [
    { key: "upload", label: "Upload" },
    { key: "map", label: "Map fields" },
    { key: "preview", label: "Preview" },
    { key: "result", label: "Done" },
  ];
  const idx = steps.findIndex((s) => s.key === step);
  return (
    <div className="mt-4 flex items-center gap-2">
      {steps.map((s, i) => (
        <div key={s.key} className="flex items-center gap-2">
          <span
            className={`flex h-6 w-6 items-center justify-center rounded-pill text-xs font-semibold ${
              i < idx
                ? "bg-primary text-white"
                : i === idx
                  ? "bg-primary text-white"
                  : "bg-subtle text-text-secondary"
            }`}
          >
            {i < idx ? "✓" : i + 1}
          </span>
          <span
            className={`text-xs ${i === idx ? "font-semibold text-text-primary" : "text-text-secondary"}`}
          >
            {s.label}
          </span>
          {i < steps.length - 1 ? (
            <span className="mx-1 h-px w-5 bg-border" />
          ) : null}
        </div>
      ))}
    </div>
  );
}

function ConfidenceBadge({ c }: { c: "high" | "medium" | "low" }) {
  const tone =
    c === "high"
      ? "bg-success/10 text-success"
      : c === "medium"
        ? "bg-warning/10 text-warning"
        : "bg-danger/10 text-danger";
  return (
    <span className={`rounded-pill px-2 py-0.5 text-xs font-medium ${tone}`}>
      {c}
    </span>
  );
}
