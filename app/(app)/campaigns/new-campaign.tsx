"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/modal";
import { toast } from "@/components/toast";
import { SEGMENTS, type SegmentType } from "./segments";
import { previewSegment, createCampaign, draftCampaignMessage } from "./actions";

type RateCard = { id: string; treatment_name: string };

const field =
  "h-11 w-full rounded-button border border-border bg-white px-3 text-[15px] text-text-primary placeholder:text-text-secondary";
const label = "text-sm font-medium text-text-primary";

export function NewCampaign({
  rateCards,
  canUseAI,
}: {
  rateCards: RateCard[];
  canUseAI: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, startSaving] = useTransition();
  const [drafting, startDrafting] = useTransition();

  const [name, setName] = useState("");
  const [segment, setSegment] = useState<SegmentType>("dormant_6mo");
  const [treatmentId, setTreatmentId] = useState("");
  const [message, setMessage] = useState("");

  const [count, setCount] = useState<number | null>(null);
  const [previewing, startPreview] = useTransition();

  const meta = SEGMENTS.find((s) => s.value === segment)!;
  const needsTreatment = !!meta.needsTreatment;
  const treatmentMissing = needsTreatment && !treatmentId;

  // Live preview: recount whenever the segment (or its treatment) changes.
  useEffect(() => {
    if (!open) return;
    if (treatmentMissing) {
      setCount(null);
      return;
    }
    setCount(null);
    startPreview(async () => {
      const res = await previewSegment(segment, treatmentId || undefined);
      setCount(res.count);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, segment, treatmentId]);

  function reset() {
    setName("");
    setSegment("dormant_6mo");
    setTreatmentId("");
    setMessage("");
    setCount(null);
  }

  function onDraft() {
    if (treatmentMissing) return toast("Pick a treatment first.");
    const treatmentName = rateCards.find((r) => r.id === treatmentId)?.treatment_name;
    startDrafting(async () => {
      const res = await draftCampaignMessage(segment, treatmentName);
      if (res.error) return toast(res.error);
      if (res.message) {
        setMessage(res.message);
        toast("AI draft ready — edit as you like ✓");
      }
    });
  }

  function submit() {
    if (!name.trim()) return toast("Give the campaign a name.");
    if (treatmentMissing) return toast("Pick a treatment to follow up on.");
    if (!message.trim()) return toast("Write a message template first.");
    startSaving(async () => {
      const res = await createCampaign({
        name,
        segment,
        treatmentId: treatmentId || undefined,
        message,
      });
      if (res.error) return toast(res.error);
      setOpen(false);
      reset();
      if (res.id) router.push(`/campaigns/${res.id}`);
      else router.refresh();
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-11 items-center gap-1.5 rounded-button bg-primary px-4 text-[15px] font-medium text-white hover:bg-primary/90"
      >
        + New Campaign
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="New Campaign"
      >
        <div className="space-y-4">
          <div>
            <label className={label}>Campaign name</label>
            <input
              className={`mt-1 ${field}`}
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={120}
              placeholder="e.g. Monsoon check-up win-back"
            />
          </div>

          <div>
            <label className={label}>Segment</label>
            <select
              className={`mt-1 ${field}`}
              value={segment}
              onChange={(e) => {
                setSegment(e.target.value as SegmentType);
                setTreatmentId("");
              }}
            >
              {SEGMENTS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-text-secondary">{meta.help}</p>
          </div>

          {needsTreatment ? (
            <div>
              <label className={label}>Treatment</label>
              <select
                className={`mt-1 ${field}`}
                value={treatmentId}
                onChange={(e) => setTreatmentId(e.target.value)}
              >
                <option value="">Select a treatment…</option>
                {rateCards.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.treatment_name}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          {/* Live preview */}
          <div className="rounded-button border border-border bg-subtle px-3 py-2 text-sm text-text-primary">
            {treatmentMissing ? (
              "Pick a treatment to see how many patients this targets."
            ) : previewing || count === null ? (
              "Counting patients…"
            ) : (
              <>
                This will target{" "}
                <span className="font-semibold text-primary">{count}</span>{" "}
                patient{count === 1 ? "" : "s"}.
              </>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between">
              <label className={label}>Message template</label>
              {canUseAI ? (
                <button
                  type="button"
                  onClick={onDraft}
                  disabled={drafting}
                  className="rounded-button border border-primary/30 bg-primary/5 px-2.5 py-1 text-xs font-medium text-primary hover:bg-primary/10 disabled:opacity-60"
                >
                  {drafting ? "Drafting…" : "✨ AI draft (1 credit)"}
                </button>
              ) : null}
            </div>
            <textarea
              className="mt-1 w-full rounded-card border border-border p-3 text-[15px] text-text-primary placeholder:text-text-secondary focus:border-primary focus:outline-none"
              rows={6}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              maxLength={2000}
              placeholder={"Hi {name} ji, aapko {clinic} yaad kar raha hai…"}
            />
            <p className="mt-1 text-xs text-text-secondary">
              Variables:{" "}
              <code className="text-text-primary">{"{name}"}</code>{" "}
              <code className="text-text-primary">{"{clinic}"}</code>{" "}
              <code className="text-text-primary">{"{doctor}"}</code>{" "}
              <code className="text-text-primary">{"{phone}"}</code> — filled per
              patient when you send.
            </p>
          </div>

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="flex h-11 flex-1 items-center justify-center rounded-button border border-border px-4 text-[15px] font-medium text-text-primary hover:bg-subtle"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={saving}
              className="flex h-11 flex-1 items-center justify-center rounded-button bg-primary px-4 text-[15px] font-medium text-white hover:bg-primary/90 disabled:opacity-60"
            >
              {saving ? "Saving…" : "Save as Draft"}
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}
