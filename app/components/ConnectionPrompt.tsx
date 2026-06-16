"use client";

// Reusable centered prompt for "someone wants to connect" and
// "someone wants to start video".
export default function ConnectionPrompt({
  title,
  subtitle,
  acceptLabel,
  declineLabel,
  onAccept,
  onDecline,
}: {
  title: string;
  subtitle?: string;
  acceptLabel: string;
  declineLabel: string;
  onAccept: () => void;
  onDecline: () => void;
}) {
  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-[#1d1d1f]/40 p-6 backdrop-blur-sm dark:bg-black/60">
      <div className="w-full max-w-xs rounded-2xl bg-[#f5f5f7] p-6 text-center text-[#1d1d1f] shadow-xl dark:bg-[#1d1d1f] dark:text-[#f5f5f7]">
        <h2 className="text-lg font-semibold">{title}</h2>
        {subtitle && <p className="mt-1 text-sm text-[#1d1d1f]/60 dark:text-[#f5f5f7]/60">{subtitle}</p>}
        <div className="mt-5 flex gap-3">
          <button
            onClick={onDecline}
            className="flex-1 rounded-full border border-[#1d1d1f]/20 px-4 py-2 text-sm font-medium text-[#1d1d1f]/75 transition-colors duration-200 hover:border-[#1d1d1f]/45 dark:border-[#f5f5f7]/20 dark:text-[#f5f5f7]/75 dark:hover:border-[#f5f5f7]/45"
          >
            {declineLabel}
          </button>
          <button
            onClick={onAccept}
            className="flex-1 rounded-full bg-[#1d1d1f] px-4 py-2 text-sm font-semibold text-[#f5f5f7] transition-colors duration-200 hover:bg-black dark:bg-[#f5f5f7] dark:text-[#1d1d1f] dark:hover:bg-white"
          >
            {acceptLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
