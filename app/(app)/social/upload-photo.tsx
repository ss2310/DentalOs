"use client";

import { useRef, useState } from "react";
import { toast } from "@/components/toast";

// Upload-your-own-photo panel, shown inside ImageStudio. Doctor / team / clinic
// photos compose freely; a photo marked as a patient / before-after shot needs
// the written-consent attestation ticked before it can be used (the server
// re-checks — the checkbox is not the only gate).
export function UploadPhoto({
  postId,
  onUploaded,
}: {
  postId: string;
  onUploaded: (urls: string[]) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [isPatient, setIsPatient] = useState(false);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);

  const consentMissing = isPatient && !consent;
  const canUpload = !!file && !consentMissing && !busy;

  const upload = async () => {
    if (!file) {
      toast("Choose a photo first.");
      return;
    }
    if (consentMissing) {
      toast("Tick the consent box to use a patient photo.");
      return;
    }
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("postId", postId);
      fd.append("file", file);
      fd.append("isPatient", isPatient ? "1" : "0");
      fd.append("consent", consent ? "1" : "0");
      const res = await fetch("/api/social/upload-image", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) {
        toast(data.error ?? "Upload failed.");
        return;
      }
      onUploaded(data.urls ?? []);
      toast("Your photo is on the post ✓");
      setFile(null);
      setIsPatient(false);
      setConsent(false);
      if (inputRef.current) inputRef.current.value = "";
    } catch {
      toast("Upload failed. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <details className="mt-3 rounded-button border border-border">
      <summary className="min-h-[44px] cursor-pointer px-3 py-3 text-[14px] font-medium text-text-primary">
        Or upload your own photo
      </summary>
      <div className="space-y-3 border-t border-border p-3">
        <p className="text-xs text-text-secondary">
          A doctor, team, or clinic photo — or a patient/before-after photo you
          have consent for. We&apos;ll lay it into a clean branded post.
        </p>
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="block w-full text-sm file:mr-3 file:h-10 file:cursor-pointer file:rounded-button file:border-0 file:bg-subtle file:px-4 file:text-sm file:font-medium"
        />
        <label className="flex items-start gap-2 text-sm text-text-primary">
          <input
            type="checkbox"
            checked={isPatient}
            onChange={(e) => {
              setIsPatient(e.target.checked);
              if (!e.target.checked) setConsent(false);
            }}
            className="mt-1 h-4 w-4 accent-primary"
          />
          <span>This photo shows a patient or a treatment result (before/after).</span>
        </label>
        {isPatient ? (
          <label className="flex items-start gap-2 rounded-button border border-warning/30 bg-warning/5 p-2.5 text-sm text-text-primary">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              className="mt-1 h-4 w-4 accent-primary"
            />
            <span>
              I have this patient&apos;s <strong>written consent</strong> to use this
              image publicly.
            </span>
          </label>
        ) : null}
        <button
          type="button"
          onClick={upload}
          disabled={!canUpload}
          className="flex h-11 w-full items-center justify-center rounded-button bg-primary px-4 text-[15px] font-medium text-white disabled:opacity-50"
        >
          {busy ? "Adding photo…" : "Add photo"}
        </button>
      </div>
    </details>
  );
}
