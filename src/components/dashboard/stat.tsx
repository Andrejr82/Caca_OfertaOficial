export function Stat({ label, value, detail }: { label: string; value: string | number; detail?: string }) {
  return (
    <div className="rounded-lg border border-moss/10 bg-white p-4 shadow-panel">
      <p className="text-xs font-bold uppercase tracking-wide text-ink/50">{label}</p>
      <p className="mt-2 text-3xl font-black text-ink">{value}</p>
      {detail ? <p className="mt-1 text-sm text-ink/60">{detail}</p> : null}
    </div>
  );
}
