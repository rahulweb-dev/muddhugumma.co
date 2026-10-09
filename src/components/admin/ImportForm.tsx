"use client";
import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { applyImport, previewImport, type ImportApplyResult, type ImportPreview, type ImportRow } from "@/lib/actions/import";

const LABEL: Record<ImportRow["action"], string> = { create: "New", update: "Update", unchanged: "No change", error: "Error" };
type Filter = "all" | ImportRow["action"];

export function ImportForm() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [csv, setCsv] = useState("");
  const [fileName, setFileName] = useState("");
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [result, setResult] = useState<ImportApplyResult | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [pending, start] = useTransition();

  async function pick(files: FileList | null) {
    const file = files?.[0];
    setPreview(null);
    setResult(null);
    if (!file) return;
    if (file.size > 3 * 1024 * 1024) {
      setPreview({ ok: false, error: "The file is larger than 3 MB. Split it into smaller files." });
      return;
    }
    const text = await file.text();
    setCsv(text);
    setFileName(file.name);
    start(async () => setPreview(await previewImport(text)));
  }

  function apply() {
    start(async () => {
      const res = await applyImport(csv);
      setResult(res);
      if (res.ok) {
        setPreview(null);
        setCsv("");
        if (fileRef.current) fileRef.current.value = "";
        router.refresh();
      }
    });
  }

  const rows = preview?.ok ? preview.rows.filter((r) => filter === "all" || r.action === filter) : [];
  const toApply = preview?.ok ? preview.counts.create + preview.counts.update : 0;

  return (
    <div className="adm-stack">
      <section className="adm-card">
        <h2 className="h3">1 · Choose the file</h2>
        <div className="adm-upload">
          <label className={`btn ghost adm-btn ${pending ? "is-busy" : ""}`}>
            <Icon name="upload" size={16} /> {pending && !preview ? "Reading…" : "Choose CSV file"}
            <input ref={fileRef} type="file" accept=".csv,text/csv" hidden onChange={(e) => pick(e.target.files)} />
          </label>
          {fileName ? <span className="muted adm-small">{fileName}</span> : <span className="muted adm-small">Nothing is saved until you press Apply.</span>}
        </div>
        {result ? <p className={`notice ${result.ok ? "ok" : "err"}`} role="status">{result.ok ? result.message : result.error}</p> : null}
        {result?.ok ? <p className="adm-small"><Link className="adm-a" href="/admin/products">Go to products</Link></p> : null}
      </section>

      {preview && !preview.ok ? <p className="notice err" role="alert">{preview.error}</p> : null}

      {preview?.ok ? (
        <section className="adm-card">
          <div className="adm-card-head">
            <h2 className="h3">2 · Check the preview</h2>
            <span className="muted adm-small">{preview.rows.length} rows</span>
          </div>
          {preview.unknownColumns.length ? (
            <p className="notice adm-small">These columns aren&apos;t recognised and will be ignored: {preview.unknownColumns.join(", ")}.</p>
          ) : null}
          {preview.missingColumns.length && preview.missingColumns.length < 32 ? (
            <p className="muted adm-small">Not in this file (left unchanged on existing products): {preview.missingColumns.join(", ")}.</p>
          ) : null}
          <nav className="adm-tabs" aria-label="Filter rows">
            {(["all", "create", "update", "unchanged", "error"] as Filter[]).map((f) => (
              <a
                key={f}
                href="#"
                aria-current={filter === f ? "page" : undefined}
                onClick={(e) => {
                  e.preventDefault();
                  setFilter(f);
                }}
              >
                {f === "all" ? "All" : LABEL[f]} <span>{f === "all" ? preview.rows.length : preview.counts[f]}</span>
              </a>
            ))}
          </nav>
          <div className="table-wrap adm-scroll-y">
            <table className="t adm-t">
              <thead>
                <tr><th className="num">Line</th><th>Slug</th><th>Name</th><th>Result</th><th>Details</th></tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.line}>
                    <td className="num">{r.line}</td>
                    <td><code>{r.slug || "—"}</code></td>
                    <td>{r.name || <span className="muted">—</span>}</td>
                    <td><span className={`status imp-${r.action}`}>{LABEL[r.action]}</span></td>
                    <td className="adm-small">
                      {r.action === "error" ? (
                        <ul className="adm-errlist">{r.errors.map((e) => <li key={e}>{e}</li>)}</ul>
                      ) : r.action === "update" ? (
                        <>Changes: {r.changes.join(", ")}</>
                      ) : r.action === "create" ? (
                        "New product"
                      ) : (
                        <span className="muted">Same as the store</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!rows.length ? <p className="muted adm-empty">No rows in this view.</p> : null}
        </section>
      ) : null}

      {preview?.ok ? (
        <div className="adm-savebar">
          <span className="adm-small">
            {toApply ? (
              <>
                <b>{preview.counts.create}</b> new and <b>{preview.counts.update}</b> updated products will be saved.
                {preview.counts.error ? <> <span className="adm-low">{preview.counts.error} rows with errors will be skipped.</span></> : null}
              </>
            ) : (
              "Nothing to save: fix the errors in your file and choose it again."
            )}
          </span>
          <div className="adm-row">
            <button type="button" className="btn ghost adm-btn" onClick={() => { setPreview(null); setCsv(""); setFileName(""); if (fileRef.current) fileRef.current.value = ""; }} disabled={pending}>
              Start again
            </button>
            <button type="button" className="btn adm-btn" onClick={apply} disabled={pending || !toApply}>{pending ? "Saving…" : `Apply ${toApply} change${toApply === 1 ? "" : "s"}`}</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
