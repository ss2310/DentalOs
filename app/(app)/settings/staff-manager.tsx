"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/modal";
import { toast } from "@/components/toast";
import { addStaff, removeStaff, type AddStaffInput } from "./staff-actions";

export type StaffMember = {
  id: string;
  full_name: string;
  role: "clinic_owner" | "doctor" | "receptionist";
};

const ROLE_LABEL: Record<StaffMember["role"], string> = {
  clinic_owner: "Owner",
  doctor: "Doctor",
  receptionist: "Receptionist",
};

const inputClass =
  "h-11 w-full rounded-button border border-border px-3 text-[15px] text-text-primary placeholder:text-text-secondary focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20";
const labelClass = "mb-1.5 block text-sm font-medium text-text-primary";
const btnBase =
  "flex h-11 items-center justify-center rounded-button px-3.5 text-sm font-medium disabled:opacity-50";
const btnPrimary = `${btnBase} bg-primary text-white hover:bg-primary/90`;
const btnOutline = `${btnBase} border border-border text-text-primary hover:bg-subtle`;

function empty(): AddStaffInput {
  return { full_name: "", email: "", password: "", role: "receptionist" };
}

export function StaffManager({
  staff,
  currentUserId,
}: {
  staff: StaffMember[];
  currentUserId: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<AddStaffInput>(empty());

  function openAdd() {
    setForm(empty());
    setModalOpen(true);
  }

  function save() {
    startTransition(async () => {
      const res = await addStaff(form);
      if (res?.error) {
        toast(res.error);
        return;
      }
      toast("Teammate added ✓");
      setModalOpen(false);
      router.refresh();
    });
  }

  function remove(m: StaffMember) {
    if (
      !window.confirm(
        `Remove ${m.full_name || "this teammate"}? They'll lose access immediately.`,
      )
    ) {
      return;
    }
    startTransition(async () => {
      const res = await removeStaff(m.id);
      if (res?.error) {
        toast(res.error);
        return;
      }
      toast("Teammate removed");
      router.refresh();
    });
  }

  const canAdd =
    form.full_name.trim() !== "" &&
    form.email.trim() !== "" &&
    form.password.length >= 6;

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-text-secondary">
          {staff.length} team member{staff.length === 1 ? "" : "s"}
        </p>
        <button type="button" className={btnPrimary} onClick={openAdd}>
          + Add Staff
        </button>
      </div>

      <div className="mt-4 overflow-hidden rounded-card border border-border bg-white">
        {staff.length === 0 ? (
          <p className="p-6 text-center text-sm text-text-secondary">
            No team members yet.
          </p>
        ) : (
          staff.map((m) => {
            const isSelf = m.id === currentUserId;
            const canRemove = !isSelf && m.role !== "clinic_owner";
            return (
              <div
                key={m.id}
                className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 last:border-0"
              >
                <div className="min-w-0">
                  <p className="truncate text-[15px] font-medium text-text-primary">
                    {m.full_name || "Unnamed"}
                    {isSelf ? (
                      <span className="text-text-secondary"> (You)</span>
                    ) : null}
                  </p>
                  <span className="mt-1 inline-block rounded-pill bg-subtle px-2 py-0.5 text-xs font-medium text-text-secondary">
                    {ROLE_LABEL[m.role]}
                  </span>
                </div>
                {canRemove ? (
                  <button
                    type="button"
                    className={`${btnBase} border border-danger/30 text-danger hover:bg-danger/5`}
                    disabled={pending}
                    onClick={() => remove(m)}
                  >
                    Remove
                  </button>
                ) : null}
              </div>
            );
          })
        )}
      </div>

      <p className="mt-3 text-sm text-text-secondary">
        Receptionists see the front-desk tools only. Owners and doctors see
        everything, including Settings, Marketing and Revenue.
      </p>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Add Staff">
        <div className="space-y-4">
          <div>
            <label className={labelClass}>
              Full name <span className="text-danger">*</span>
            </label>
            <input
              className={inputClass}
              value={form.full_name}
              onChange={(e) =>
                setForm((f) => ({ ...f, full_name: e.target.value }))
              }
              placeholder="e.g. Priya Sharma"
            />
          </div>
          <div>
            <label className={labelClass}>
              Email <span className="text-danger">*</span>
            </label>
            <input
              type="email"
              className={inputClass}
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              placeholder="priya@clinic.com"
            />
          </div>
          <div>
            <label className={labelClass}>
              Temporary password <span className="text-danger">*</span>
            </label>
            <input
              className={inputClass}
              value={form.password}
              onChange={(e) =>
                setForm((f) => ({ ...f, password: e.target.value }))
              }
              placeholder="At least 6 characters"
            />
            <p className="mt-1 text-xs text-text-secondary">
              Share this with them to sign in. They can change it later.
            </p>
          </div>
          <div>
            <label className={labelClass}>Role</label>
            <select
              className={inputClass}
              value={form.role}
              onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
            >
              <option value="receptionist">Receptionist — front desk only</option>
              <option value="doctor">Doctor — full access</option>
            </select>
          </div>

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
              disabled={pending || !canAdd}
              className={`${btnPrimary} flex-1`}
            >
              {pending ? "Adding…" : "Add"}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
