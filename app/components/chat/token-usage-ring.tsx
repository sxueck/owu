interface TokenUsageRingProps {
  usedTokens: number;
  tokenLimit?: number;
  className?: string;
}

export const DEFAULT_TOKEN_LIMIT = 150_000;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function getRingColor(progress: number): string {
  const hue = 120 * (1 - progress);
  return `hsl(${hue}, 82%, 45%)`;
}

function formatTokenCount(value: number): string {
  return new Intl.NumberFormat("zh-CN").format(value);
}

export function TokenUsageRing({
  usedTokens,
  tokenLimit = DEFAULT_TOKEN_LIMIT,
  className,
}: TokenUsageRingProps) {
  const safeLimit = Math.max(tokenLimit, 1);
  const normalizedUsed = Math.max(usedTokens, 0);
  const clampedUsed = clamp(normalizedUsed, 0, safeLimit);
  const progress = clampedUsed / safeLimit;
  const radius = 9;
  const circumference = 2 * Math.PI * radius;
  const progressOffset = circumference * (1 - progress);
  const progressColor = getRingColor(progress);
  const percentageLabel = `${Math.round(progress * 100)}%`;

  const tooltip = `当前会话 Token: ${formatTokenCount(normalizedUsed)} / ${formatTokenCount(safeLimit)} (${(
    (normalizedUsed / safeLimit) * 100
  ).toFixed(1)}%)`;

  return (
    <div
      className={[
        "relative inline-flex h-7 w-7 items-center justify-center",
        className ?? "",
      ].join(" ")}
      title={tooltip}
      aria-label={tooltip}
    >
      <svg className="h-6 w-6 -rotate-90" viewBox="0 0 24 24" aria-hidden="true">
        <circle
          cx="12"
          cy="12"
          r={radius}
          fill="none"
          stroke="rgba(20,33,28,0.2)"
          strokeWidth="2.6"
        />
        {clampedUsed > 0 ? (
          <circle
            cx="12"
            cy="12"
            r={radius}
            fill="none"
            stroke={progressColor}
            strokeWidth="2.6"
            strokeLinecap="round"
            strokeDasharray={`${circumference} ${circumference}`}
            strokeDashoffset={progressOffset}
          />
        ) : null}
      </svg>
      <span className="pointer-events-none absolute text-[7px] font-semibold leading-none text-[var(--chat-muted)]">
        {percentageLabel}
      </span>
    </div>
  );
}
