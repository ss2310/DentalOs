"use client";

import { useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/components/toast";
import { CameraIcon } from "@/components/icons";
import { uploadPatientPhoto } from "./photo-actions";

// Patient photo avatar + upload. Shows the photo (signed URL) or initials;
// the small camera chip picks a file and uploads via the server action —
// same UX as the brand-logo card in Settings.
export function PatientPhoto({
  patientId,
  patientName,
  photoUrl,
}: {
  patientId: string;
  patientName: string;
  photoUrl: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  const initials = patientName
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  function onPick(file: File | null) {
    if (!file) return;
    const fd = new FormData();
    fd.set("photo", file);
    startTransition(async () => {
      const res = await uploadPatientPhoto(patientId, fd);
      if (res.error) {
        toast(res.error);
        return;
      }
      toast("Photo updated ✓");
      router.refresh();
    });
  }

  return (
    <div className="relative h-16 w-16 shrink-0">
      {photoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- signed URL, not optimizable
        <img
          src={photoUrl}
          alt={patientName}
          className="h-16 w-16 rounded-pill border border-border object-cover"
        />
      ) : (
        <div className="flex h-16 w-16 items-center justify-center rounded-pill bg-primary/10 text-lg font-semibold text-primary">
          {initials || "🙂"}
        </div>
      )}
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={pending}
        aria-label="Upload patient photo"
        className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-pill border border-border bg-white text-text-secondary shadow-card hover:bg-subtle disabled:opacity-50"
      >
        <CameraIcon width={14} height={14} />
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => {
          onPick(e.target.files?.[0] ?? null);
          e.target.value = "";
        }}
      />
    </div>
  );
}
