"use client";

import { useEffect, useState } from "react";

// Client toggle between the existing List view and the new Board view. Both are
// passed in as already-rendered nodes; only the selected one is mounted. The
// choice is remembered per browser.
export function PipelineTabs({
  list,
  board,
}: {
  list: React.ReactNode;
  board: React.ReactNode;
}) {
  const [view, setView] = useState<"list" | "board">("list");

  useEffect(() => {
    const saved = window.localStorage.getItem("pipeline-view");
    if (saved === "board" || saved === "list") setView(saved);
  }, []);

  function choose(v: "list" | "board") {
    setView(v);
    window.localStorage.setItem("pipeline-view", v);
  }

  const seg = (v: "list" | "board", label: string) => (
    <button
      type="button"
      onClick={() => choose(v)}
      aria-pressed={view === v}
      className={`h-9 rounded-[8px] px-4 text-sm font-medium transition-colors ${
        view === v
          ? "bg-primary text-white"
          : "text-text-secondary hover:text-text-primary"
      }`}
    >
      {label}
    </button>
  );

  return (
    <>
      <div className="mb-4 mt-6 flex justify-end">
        <div className="inline-flex items-center gap-0.5 rounded-button border border-border bg-white p-0.5">
          {seg("list", "List")}
          {seg("board", "Board")}
        </div>
      </div>
      {view === "list" ? list : board}
    </>
  );
}
