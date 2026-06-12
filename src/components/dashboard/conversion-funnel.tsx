interface FunnelStage {
  label: string;
  value: number;
  color: string;
}

export function ConversionFunnel({ stages }: { stages: FunnelStage[] }) {
  if (!stages.length) return null;

  const maxValue = Math.max(...stages.map((s) => s.value), 1);

  return (
    <div className="glass-card p-5">
      <h3 className="text-sm font-bold text-white/50 uppercase tracking-[0.08em] mb-4">
        Funil de Conversão
      </h3>
      <div className="space-y-3">
        {stages.map((stage, index) => {
          const widthPercent = Math.max((stage.value / maxValue) * 100, 3);
          const delay = index * 100;

          return (
            <div
              key={stage.label}
              className="animate-slideRight"
              style={{ animationDelay: `${delay}ms` }}
            >
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2">
                  {/* Step number */}
                  <span
                    className="grid h-5 w-5 place-items-center rounded-md text-[10px] font-extrabold"
                    style={{
                      background: `${stage.color}18`,
                      color: stage.color
                    }}
                  >
                    {index + 1}
                  </span>
                  <span className="text-xs font-semibold text-white/60">
                    {stage.label}
                  </span>
                </div>
                <span className="text-sm font-extrabold tabular-nums" style={{ color: stage.color }}>
                  {stage.value.toLocaleString("pt-BR")}
                </span>
              </div>

              {/* Bar */}
              <div className="h-2 w-full overflow-hidden rounded-full bg-white/[0.03]">
                <div
                  className="h-full rounded-full transition-all duration-700 ease-out"
                  style={{
                    width: `${widthPercent}%`,
                    background: `linear-gradient(90deg, ${stage.color}, ${stage.color}88)`
                  }}
                />
              </div>

              {/* Connector arrow (except last) */}
              {index < stages.length - 1 && (
                <div className="flex justify-center py-1">
                  <svg width="12" height="10" viewBox="0 0 12 10" className="text-white/10">
                    <path d="M6 10L0 0h12z" fill="currentColor" />
                  </svg>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
