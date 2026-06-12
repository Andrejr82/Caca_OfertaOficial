import { clsx } from "clsx";

export function Badge({
  label,
  tone = "neutral"
}: {
  label: string;
  tone?: "neutral" | "good" | "warn" | "future" | "instagram" | "telegram" | "facebook" | "whatsapp";
}) {
  return (
    <span
      className={clsx(
        "inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider",
        tone === "neutral" && "bg-white/[0.06] text-white/50",
        tone === "good" && "bg-emerald-500/15 text-emerald-400",
        tone === "warn" && "bg-amber-500/15 text-amber-400",
        tone === "future" && "bg-sky-500/15 text-sky-400",
        tone === "instagram" && "bg-pink-500/15 text-pink-400",
        tone === "telegram" && "bg-sky-500/15 text-sky-400",
        tone === "facebook" && "bg-indigo-500/15 text-indigo-400",
        tone === "whatsapp" && "bg-green-500/15 text-green-400"
      )}
    >
      {label}
    </span>
  );
}
