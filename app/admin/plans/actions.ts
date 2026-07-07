"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireAdminContext, writeAudit } from "@/lib/admin/auth";

// Admin plan & pack management (A2). Every action re-verifies super-admin via
// requireAdminContext (never trusts the route guard), uses the service-role
// client for the cross-tenant catalog write, validates server-side (the client
// checks are courtesy only), writes an admin_audit row, and — for PRICE changes
// — an extra billing_events row. Warns via { error }; never throws to the client.

export type AdminPlanState = { ok?: boolean; error?: string };

export type PlanInput = {
  name: string;
  price_inr: number;
  content_credits: number;
  map_credits: number;
  billing_period: string;
  is_active: boolean;
  sort_order: number;
};

export type PackInput = {
  name: string;
  price_inr: number;
  content_credits: number;
  map_credits: number;
  is_active: boolean;
  sort_order: number;
};

const BILLING_PERIODS = new Set(["trial", "monthly", "annual"]);

function toNumber(v: unknown): number | null {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Money ≥ 0, rounded to paise, or null if invalid. */
function money(v: unknown): number | null {
  const n = toNumber(v);
  if (n === null || n < 0) return null;
  return Math.round(n * 100) / 100;
}

/** Whole number ≥ 0, or null if invalid. */
function count(v: unknown): number | null {
  const n = toNumber(v);
  if (n === null || n < 0 || !Number.isInteger(n)) return null;
  return n;
}

/**
 * Record a price change to billing_events (audit-worthy pricing history). A
 * platform-level event: clinic_id is null, status defaults to 'confirmed' so it
 * never shows in the pending-payments list. No-op when the price is unchanged.
 */
async function logPriceChange(
  db: SupabaseClient,
  adminId: string,
  kind: "plan" | "pack",
  name: string,
  oldPrice: unknown,
  newPrice: number,
): Promise<void> {
  const before = toNumber(oldPrice);
  if (before === null || before === newPrice) return;
  const { error } = await db.from("billing_events").insert({
    clinic_id: null,
    event_type: kind === "plan" ? "plan_price_changed" : "pack_price_changed",
    amount_inr: newPrice,
    actor: adminId,
    note: `${name}: ₹${before} → ₹${newPrice}`,
  });
  if (error) console.error("logPriceChange insert failed:", error);
}

export async function updatePlan(
  id: string,
  input: PlanInput,
): Promise<AdminPlanState> {
  if (!id) return { error: "Missing plan." };
  const name = String(input.name ?? "").trim();
  if (!name) return { error: "Name is required." };
  const price = money(input.price_inr);
  if (price === null) return { error: "Price must be a number ₹0 or more." };
  const content = count(input.content_credits);
  const map = count(input.map_credits);
  if (content === null || map === null) {
    return { error: "Credits must be whole numbers, 0 or more." };
  }
  const sort = count(input.sort_order);
  if (sort === null) return { error: "Sort order must be a whole number." };
  const period = String(input.billing_period ?? "");
  if (!BILLING_PERIODS.has(period)) return { error: "Invalid billing period." };
  const active = input.is_active === true;
  // Mirror the checkout guard: a purchasable plan can't go live at ₹0. The trial
  // plan is exempt — it's the free signup default, never sold.
  if (active && period !== "trial" && price <= 0) {
    return { error: "Set a price above ₹0 before activating this plan." };
  }

  const { adminId, db } = await requireAdminContext();

  const { data: existing } = await db
    .from("plans")
    .select("price_inr")
    .eq("id", id)
    .maybeSingle();
  if (!existing) return { error: "Plan not found." };

  const { error } = await db
    .from("plans")
    .update({
      name,
      price_inr: price,
      content_credits: content,
      map_credits: map,
      billing_period: period,
      is_active: active,
      sort_order: sort,
    })
    .eq("id", id);
  if (error) {
    if (error.code === "23505") {
      return { error: "A plan with that name already exists." };
    }
    console.error("updatePlan failed:", error);
    return { error: "Could not save. Please try again." };
  }

  await writeAudit(db, adminId, "plan.update", { type: "plan", id }, {
    name,
    price_inr: price,
    content_credits: content,
    map_credits: map,
    billing_period: period,
    is_active: active,
    sort_order: sort,
  });
  await logPriceChange(db, adminId, "plan", name, existing.price_inr, price);

  revalidatePath("/admin/plans");
  revalidatePath("/upgrade");
  return { ok: true };
}

export async function updatePack(
  id: string,
  input: PackInput,
): Promise<AdminPlanState> {
  if (!id) return { error: "Missing pack." };
  const name = String(input.name ?? "").trim();
  if (!name) return { error: "Name is required." };
  const price = money(input.price_inr);
  if (price === null) return { error: "Price must be a number ₹0 or more." };
  const content = count(input.content_credits);
  const map = count(input.map_credits);
  if (content === null || map === null) {
    return { error: "Credits must be whole numbers, 0 or more." };
  }
  if (content === 0 && map === 0) {
    return { error: "A pack must grant some content or map credits." };
  }
  const sort = count(input.sort_order);
  if (sort === null) return { error: "Sort order must be a whole number." };
  const active = input.is_active === true;
  if (active && price <= 0) {
    return { error: "Set a price above ₹0 before activating this pack." };
  }

  const { adminId, db } = await requireAdminContext();

  const { data: existing } = await db
    .from("credit_packs")
    .select("price_inr")
    .eq("id", id)
    .maybeSingle();
  if (!existing) return { error: "Pack not found." };

  const { error } = await db
    .from("credit_packs")
    .update({
      name,
      price_inr: price,
      content_credits: content,
      map_credits: map,
      is_active: active,
      sort_order: sort,
    })
    .eq("id", id);
  if (error) {
    if (error.code === "23505") {
      return { error: "A pack with that name already exists." };
    }
    console.error("updatePack failed:", error);
    return { error: "Could not save. Please try again." };
  }

  await writeAudit(db, adminId, "pack.update", { type: "credit_pack", id }, {
    name,
    price_inr: price,
    content_credits: content,
    map_credits: map,
    is_active: active,
    sort_order: sort,
  });
  await logPriceChange(db, adminId, "pack", name, existing.price_inr, price);

  revalidatePath("/admin/plans");
  revalidatePath("/upgrade");
  return { ok: true };
}

export async function addPack(input: PackInput): Promise<AdminPlanState> {
  const name = String(input.name ?? "").trim();
  if (!name) return { error: "Name is required." };
  const price = money(input.price_inr);
  if (price === null) return { error: "Price must be a number ₹0 or more." };
  const content = count(input.content_credits);
  const map = count(input.map_credits);
  if (content === null || map === null) {
    return { error: "Credits must be whole numbers, 0 or more." };
  }
  if (content === 0 && map === 0) {
    return { error: "A pack must grant some content or map credits." };
  }
  const sort = count(input.sort_order);
  if (sort === null) return { error: "Sort order must be a whole number." };
  const active = input.is_active === true;
  if (active && price <= 0) {
    return { error: "Set a price above ₹0 before activating this pack." };
  }

  const { adminId, db } = await requireAdminContext();

  const { data: created, error } = await db
    .from("credit_packs")
    .insert({
      name,
      price_inr: price,
      content_credits: content,
      map_credits: map,
      is_active: active,
      sort_order: sort,
    })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505") {
      return { error: "A pack with that name already exists." };
    }
    console.error("addPack failed:", error);
    return { error: "Could not add the pack. Please try again." };
  }

  await writeAudit(
    db,
    adminId,
    "pack.create",
    { type: "credit_pack", id: created.id },
    { name, price_inr: price, content_credits: content, map_credits: map, is_active: active },
  );

  revalidatePath("/admin/plans");
  revalidatePath("/upgrade");
  return { ok: true };
}

/**
 * Create the Growth Annual plan if none exists yet (₹24,990, credits copied
 * from Growth Monthly, billing_period 'annual'). Created INACTIVE so the admin
 * reviews it before it appears on /upgrade.
 */
export async function createAnnualPlan(): Promise<AdminPlanState> {
  const { adminId, db } = await requireAdminContext();

  const { data: existingAnnual } = await db
    .from("plans")
    .select("id")
    .eq("billing_period", "annual")
    .limit(1)
    .maybeSingle();
  if (existingAnnual) return { error: "An annual plan already exists." };

  const { data: monthly } = await db
    .from("plans")
    .select("content_credits, map_credits, sort_order")
    .eq("name", "Growth Monthly")
    .maybeSingle();
  const content = monthly?.content_credits ?? 100;
  const map = monthly?.map_credits ?? 20;
  const sort = (monthly?.sort_order ?? 1) + 1;

  const { data: created, error } = await db
    .from("plans")
    .insert({
      name: "Growth Annual",
      price_inr: 24990,
      content_credits: content,
      map_credits: map,
      billing_period: "annual",
      is_active: false,
      sort_order: sort,
    })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505") {
      return { error: "A plan named “Growth Annual” already exists." };
    }
    console.error("createAnnualPlan failed:", error);
    return { error: "Could not create the annual plan. Please try again." };
  }

  await writeAudit(db, adminId, "plan.create", { type: "plan", id: created.id }, {
    name: "Growth Annual",
    price_inr: 24990,
    content_credits: content,
    map_credits: map,
    billing_period: "annual",
    is_active: false,
  });

  revalidatePath("/admin/plans");
  return { ok: true };
}
