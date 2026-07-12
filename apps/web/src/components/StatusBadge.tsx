import type { EvalRunDetail, Execution } from "../api/client";

// Status is dot + label, never color alone. Success stays quiet (zinc); red is
// reserved for errors and the accent for active/in-flight states.
export interface StatusMeta {
  dot: string;
  text: string;
  pulse?: boolean;
}

export const executionStatus: Record<Execution["status"], StatusMeta> = {
  pending: { dot: "bg-zinc-600", text: "text-zinc-500" },
  running: { dot: "bg-accent", text: "text-accent", pulse: true },
  success: { dot: "bg-zinc-400", text: "text-zinc-400" },
  error: { dot: "bg-red-400", text: "text-red-400" },
};

export const runStatus: Record<EvalRunDetail["status"], StatusMeta> = {
  pending: { dot: "bg-zinc-600", text: "text-zinc-500" },
  running: { dot: "bg-accent", text: "text-accent", pulse: true },
  completed: { dot: "bg-zinc-400", text: "text-zinc-400" },
  failed: { dot: "bg-red-400", text: "text-red-400" },
};

export function StatusBadge({ label, meta }: { label: string; meta: StatusMeta }) {
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${meta.text}`}>
      <span className={`size-1.5 rounded-full ${meta.dot} ${meta.pulse ? "animate-pulse" : ""}`} />
      {label}
    </span>
  );
}
