import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="grid gap-2 text-sm font-medium text-white/70">
      <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-white/40">{label}</span>
      {children}
    </label>
  );
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className="glass-input focus-ring w-full rounded-lg px-3.5 py-2.5 text-sm"
      {...props}
    />
  );
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className="glass-input focus-ring w-full rounded-lg px-3.5 py-2.5 text-sm"
      {...props}
    />
  );
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className="glass-input focus-ring min-h-24 w-full rounded-lg px-3.5 py-2.5 text-sm"
      {...props}
    />
  );
}
