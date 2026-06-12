import { clsx } from "clsx";
import type { ButtonHTMLAttributes, ReactNode } from "react";

export function Button({
  children,
  variant = "primary",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  variant?: "primary" | "secondary" | "ghost" | "glass" | "gradient";
}) {
  return (
    <button
      className={clsx(
        "focus-ring inline-flex min-h-10 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-40",
        variant === "primary" && "bg-emerald-600 text-white shadow-lg shadow-emerald-600/20 hover:bg-emerald-500 hover:shadow-emerald-500/30 active:scale-[0.98]",
        variant === "secondary" && "border border-white/10 bg-white/[0.04] text-white/70 hover:bg-white/[0.08] hover:text-white hover:border-white/15",
        variant === "ghost" && "text-white/50 hover:bg-white/[0.04] hover:text-white/80",
        variant === "glass" && "border border-white/10 bg-white/[0.06] text-white/80 backdrop-blur-sm hover:bg-white/[0.1] hover:border-white/15 active:scale-[0.98]",
        variant === "gradient" && "bg-gradient-to-r from-emerald-600 to-emerald-500 text-white shadow-lg shadow-emerald-600/25 hover:from-emerald-500 hover:to-emerald-400 hover:shadow-emerald-500/35 active:scale-[0.98]",
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}
