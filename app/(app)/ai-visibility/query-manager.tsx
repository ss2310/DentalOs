"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/modal";
import { toast } from "@/components/toast";
import {
  QUERY_LAYERS,
  LAYER_LABEL,
  type AiQueryRow,
} from "@/lib/ai-visibility";
import {
  generateQuerySet,
  addQuery,
  updateQuery,
  setQueryActive,
  deleteQuery,
} from "./actions";

const inputClass =
  "h-11 w-full rounded-button border border-border px-3 text-[15px] text-text-primary placeholder:text-text-secondary focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20";
const labelClass = "mb-1.5 block text-sm font-medium text-text-primary";
const btnBase =
  "flex h-11 items-center justify-center rounded-button px-3.5 text-sm font-medium disabled:opacity-50";
const btnPrimary = `${btnBase} bg-primary text-white hover:bg-primary/90`;
const btnOutline = `${btnBase} border border-border text-text-primary hover:bg-subtle`;

export function QueryManager({ queries }: { queries: AiQueryRow[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<AiQueryRow | null>(null);
  const [text, setText] = useState("");
  const [layer, setLayer] = useState<string>("direct_brand");

  function generate() {
    startTransition(async () => {
      const res = await generateQuerySet();
      if (res?.error) {
        toast(res.error);
        return;
      }
      toast(
        res.count ? `Added ${res.count} queries ✓` : "Query set already complete",
      );
      router.refresh();
    });
  }

  function openAdd() {
    setEditing(null);
    setText("");
    setLayer("direct_brand");
    setModalOpen(true);
  }

  function openEdit(q: AiQueryRow) {
    setEditing(q);
    setText(q.query_text);
    setLayer(q.query_layer ?? "direct_brand");
    setModalOpen(true);
  }

  function save() {
    startTransition(async () => {
      const res = editing
        ? await updateQuery(editing.id, text)
        : await addQuery({ query_text: text, query_layer: layer });
      if (res?.error) {
        toast(res.error);
        return;
      }
      toast(editing ? "Query updated ✓" : "Query added ✓");
      setModalOpen(false);
      router.refresh();
    });
  }

  function toggle(q: AiQueryRow) {
    startTransition(async () => {
      const res = await setQueryActive(q.id, !q.is_active);
      if (res?.error) {
        toast(res.error);
        return;
      }
      router.refresh();
    });
  }

  function remove(q: AiQueryRow) {
    if (!window.confirm(`Delete "${q.query_text}"? Its check history goes too.`)) {
      return;
    }
    startTransition(async () => {
      const res = await deleteQuery(q.id);
      if (res?.error) {
        toast(res.error);
        return;
      }
      toast("Query deleted");
      router.refresh();
    });
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-text-secondary">
          {queries.length} quer{queries.length === 1 ? "y" : "ies"} ·{" "}
          {queries.filter((q) => q.is_active).length} active
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            className={btnOutline}
            disabled={pending}
            onClick={generate}
          >
            Generate Query Set
          </button>
          <button
            type="button"
            className={btnPrimary}
            disabled={pending}
            onClick={openAdd}
          >
            + Add Query
          </button>
        </div>
      </div>

      {queries.length === 0 ? (
        <div className="mt-4 rounded-card border border-border bg-white p-8 text-center">
          <p className="text-[15px] font-medium text-text-primary">
            No queries yet
          </p>
          <p className="mt-1 text-sm text-text-secondary">
            Generate a starter set of the searches patients actually ask AI
            assistants — tuned to your clinic, area and city.
          </p>
          <button
            type="button"
            className={`${btnPrimary} mx-auto mt-4`}
            disabled={pending}
            onClick={generate}
          >
            Generate Query Set
          </button>
        </div>
      ) : (
        <div className="mt-4 overflow-hidden rounded-card border border-border bg-white">
          {queries.map((q) => (
            <div
              key={q.id}
              className="flex items-center gap-3 border-b border-border px-4 py-3 last:border-0"
            >
              <div className="min-w-0 flex-1">
                <p
                  className={`truncate text-[15px] ${
                    q.is_active ? "text-text-primary" : "text-text-secondary line-through"
                  }`}
                >
                  {q.query_text}
                </p>
                {q.query_layer ? (
                  <span className="mt-0.5 inline-block rounded-pill bg-subtle px-2 py-0.5 text-xs font-medium text-text-secondary">
                    {LAYER_LABEL[q.query_layer] ?? q.query_layer}
                  </span>
                ) : null}
              </div>
              <button
                type="button"
                className="shrink-0 rounded-button px-2 py-1 text-xs font-medium text-text-secondary hover:bg-subtle"
                disabled={pending}
                onClick={() => toggle(q)}
              >
                {q.is_active ? "Pause" : "Activate"}
              </button>
              <button
                type="button"
                className="shrink-0 rounded-button px-2 py-1 text-xs font-medium text-primary hover:bg-subtle"
                disabled={pending}
                onClick={() => openEdit(q)}
              >
                Edit
              </button>
              <button
                type="button"
                className="shrink-0 rounded-button px-2 py-1 text-xs font-medium text-danger hover:bg-danger/5"
                disabled={pending}
                onClick={() => remove(q)}
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? "Edit Query" : "Add Query"}
      >
        <div className="space-y-4">
          <div>
            <label className={labelClass}>
              Query text <span className="text-danger">*</span>
            </label>
            <input
              className={inputClass}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="e.g. best dentist for kids in Andheri"
            />
          </div>
          {!editing ? (
            <div>
              <label className={labelClass}>Layer</label>
              <select
                className={inputClass}
                value={layer}
                onChange={(e) => setLayer(e.target.value)}
              >
                {QUERY_LAYERS.map((l) => (
                  <option key={l.key} value={l.key}>
                    {l.label}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className={`${btnOutline} flex-1`}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={save}
              disabled={pending || !text.trim()}
              className={`${btnPrimary} flex-1`}
            >
              {pending ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
