"use client";

import { useEffect, useState } from "react";
import { useFormState } from "react-dom";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/modal";
import { SubmitButton } from "@/components/submit-button";
import { toast } from "@/components/toast";
import { normalizeIndianPhone } from "@/lib/validation";
import type { Patient } from "@/lib/types";
import {
  addPatient,
  updatePatient,
  type PatientFormState,
} from "./actions";

const initialState: PatientFormState = {};

const inputClass =
  "h-11 w-full rounded-button border border-border px-3 text-[15px] text-text-primary placeholder:text-text-secondary focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20";
const errInputClass =
  "h-11 w-full rounded-button border border-danger px-3 text-[15px] text-text-primary placeholder:text-text-secondary focus:outline-none focus:ring-2 focus:ring-danger/20";
const labelClass = "mb-1.5 block text-sm font-medium text-text-primary";

export function PatientFormModal({
  open,
  onClose,
  patient,
}: {
  open: boolean;
  onClose: () => void;
  patient?: Patient;
}) {
  const isEdit = Boolean(patient?.id);
  const action = isEdit ? updatePatient : addPatient;
  const [state, formAction] = useFormState(action, initialState);
  const router = useRouter();

  const [whatsapp, setWhatsapp] = useState(patient?.whatsapp_number ?? "");
  const [whatsappTouched, setWhatsappTouched] = useState(false);

  // Keep the controlled field in sync when opening for a different patient.
  useEffect(() => {
    if (open) {
      setWhatsapp(patient?.whatsapp_number ?? "");
      setWhatsappTouched(false);
    }
  }, [open, patient?.id, patient?.whatsapp_number]);

  const whatsappOk = normalizeIndianPhone(whatsapp) !== null;
  const whatsappError =
    whatsappTouched && !whatsappOk
      ? whatsapp.trim()
        ? "Enter a valid 10-digit number."
        : "WhatsApp number is required."
      : null;

  // On success: toast, close, refresh the server-rendered data.
  useEffect(() => {
    if (state.ok) {
      toast(isEdit ? "Patient updated ✓" : "Patient added ✓");
      onClose();
      router.refresh();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? "Edit Patient" : "Add Patient"}
    >
      <form action={formAction} className="space-y-4">
        {isEdit ? <input type="hidden" name="id" value={patient!.id} /> : null}

        {state.error ? (
          <p className="rounded-button border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">
            {state.error}
          </p>
        ) : null}

        <div>
          <label htmlFor="full_name" className={labelClass}>
            Full name <span className="text-danger">*</span>
          </label>
          <input
            id="full_name"
            name="full_name"
            type="text"
            required
            defaultValue={patient?.full_name ?? ""}
            className={inputClass}
            placeholder="Rahul Verma"
          />
        </div>

        <div>
          <label htmlFor="whatsapp_number" className={labelClass}>
            WhatsApp number <span className="text-danger">*</span>
          </label>
          <input
            id="whatsapp_number"
            name="whatsapp_number"
            type="tel"
            inputMode="numeric"
            required
            value={whatsapp}
            onChange={(e) => setWhatsapp(e.target.value)}
            onBlur={() => setWhatsappTouched(true)}
            aria-invalid={whatsappError ? true : undefined}
            className={whatsappError ? errInputClass : inputClass}
            placeholder="98XXXXXXXX"
          />
          {whatsappError ? (
            <p className="mt-1 text-sm text-danger">{whatsappError}</p>
          ) : null}
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="phone" className={labelClass}>
              Phone
            </label>
            <input
              id="phone"
              name="phone"
              type="tel"
              inputMode="numeric"
              defaultValue={patient?.phone ?? ""}
              className={inputClass}
              placeholder="Optional"
            />
          </div>
          <div>
            <label htmlFor="date_of_birth" className={labelClass}>
              Date of birth
            </label>
            <input
              id="date_of_birth"
              name="date_of_birth"
              type="date"
              defaultValue={patient?.date_of_birth ?? ""}
              className={inputClass}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="gender" className={labelClass}>
              Gender
            </label>
            <select
              id="gender"
              name="gender"
              defaultValue={patient?.gender ?? ""}
              className={inputClass}
            >
              <option value="">Select…</option>
              <option value="Male">Male</option>
              <option value="Female">Female</option>
              <option value="Other">Other</option>
            </select>
          </div>
          <div>
            <label htmlFor="area" className={labelClass}>
              Area
            </label>
            <input
              id="area"
              name="area"
              type="text"
              defaultValue={patient?.area ?? ""}
              className={inputClass}
              placeholder="Andheri West"
            />
          </div>
        </div>

        <div>
          <label htmlFor="referral_source" className={labelClass}>
            How did they hear about you?
          </label>
          <select
            id="referral_source"
            name="referral_source"
            defaultValue={patient?.referral_source ?? ""}
            className={inputClass}
          >
            <option value="">Select…</option>
            <option value="Google">Google</option>
            <option value="Instagram / Facebook">Instagram / Facebook</option>
            <option value="Friend or Family">Friend or Family</option>
            <option value="Doctor referral">Doctor referral</option>
            <option value="Walk-in">Walk-in</option>
            <option value="Other">Other</option>
          </select>
        </div>

        <div>
          <label htmlFor="notes" className={labelClass}>
            Notes
          </label>
          <textarea
            id="notes"
            name="notes"
            rows={3}
            defaultValue={patient?.notes ?? ""}
            className="w-full rounded-button border border-border px-3 py-2 text-[15px] text-text-primary placeholder:text-text-secondary focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            placeholder="Allergies, preferences, etc."
          />
        </div>

        <div className="flex gap-3 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="flex h-11 flex-1 items-center justify-center rounded-button border border-border px-4 text-[15px] font-medium text-text-primary hover:bg-subtle"
          >
            Cancel
          </button>
          <div className="flex-1">
            <SubmitButton
              pendingText="Saving…"
              disabled={whatsappTouched && !whatsappOk}
            >
              Save
            </SubmitButton>
          </div>
        </div>
      </form>
    </Modal>
  );
}
