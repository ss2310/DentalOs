"use client";

import { useEffect, useState } from "react";

// Minimal toast: a module-level pub/sub so any client component can call
// `toast("...")` without threading context. Render <Toaster /> once, high in
// the tree (done in AppShell).

type ToastItem = { id: number; message: string };

let listeners: ((t: ToastItem) => void)[] = [];
let counter = 0;

export function toast(message: string) {
  const item = { id: ++counter, message };
  listeners.forEach((l) => l(item));
}

export function Toaster() {
  const [items, setItems] = useState<ToastItem[]>([]);

  useEffect(() => {
    const listener = (t: ToastItem) => {
      setItems((prev) => [...prev, t]);
      setTimeout(() => {
        setItems((prev) => prev.filter((x) => x.id !== t.id));
      }, 3000);
    };
    listeners.push(listener);
    return () => {
      listeners = listeners.filter((l) => l !== listener);
    };
  }, []);

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4">
      {items.map((t) => (
        <div
          key={t.id}
          role="status"
          className="pointer-events-auto rounded-pill bg-[#1D1D1F]/90 px-4 py-2.5 text-sm font-medium text-white shadow-card backdrop-blur-sm"
        >
          {t.message}
        </div>
      ))}
    </div>
  );
}
