import { type LucideIcon } from "lucide-react";
import { Sparkline } from "@/components/ui/sparkline";

interface MetricCardProps {
  label: string;
  value: string | number;
  detail?: string;
  trend?: { value: number; isPositive: boolean };
  sparkData?: number[];
  accentColor?: string;
  icon?: LucideIcon;
}

export function MetricCard({
  label,
  value,
  detail,
  trend,
  sparkData,
  accentColor = "#10b981",
  icon: Icon
}: MetricCardProps) {
  return (
    <div className="glass-card group relative overflow-hidden p-5">
      {/* Subtle glow effect on top-right */}
      <div
        className="pointer-events-none absolute -right-6 -top-6 h-20 w-20 rounded-full opacity-20 blur-2xl transition-opacity group-hover:opacity-40"
        style={{ background: accentColor }}
      />

      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          {/* Label */}
          <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-white/40">
            {label}
          </p>

          {/* Value */}
          <p className="mt-2 text-2xl font-extrabold tracking-tight text-white tabular-nums">
            {value}
          </p>

          {/* Trend & Detail */}
          <div className="mt-1.5 flex items-center gap-2">
            {trend && (
              <span
                className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                  trend.isPositive
                    ? "bg-emerald-500/10 text-emerald-400"
                    : "bg-red-500/10 text-red-400"
                }`}
              >
                {trend.isPositive ? "↑" : "↓"} {Math.abs(trend.value).toFixed(1)}%
              </span>
            )}
            {detail && (
              <span className="truncate text-xs text-white/35">{detail}</span>
            )}
          </div>
        </div>

        {/* Icon */}
        {Icon && (
          <span
            className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-xl transition-colors"
            style={{
              background: `${accentColor}15`,
              color: accentColor
            }}
          >
            <Icon size={19} strokeWidth={2} />
          </span>
        )}
      </div>

      {/* Sparkline */}
      {sparkData && sparkData.length > 1 && (
        <div className="mt-3 -mx-1">
          <Sparkline data={sparkData} color={accentColor} width={200} height={28} />
        </div>
      )}
    </div>
  );
}
