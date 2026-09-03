import { AlertTriangleIcon } from "@/components/icons";

export default function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div
      className="mt-8 rounded-2xl border border-[#F5C6C0] bg-[#FDECEA] p-6"
      role="alert"
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-7 w-7 flex-none items-center justify-center rounded-full bg-[#E11900] text-white">
          <AlertTriangleIcon size={15} />
        </span>
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-[#8C1D18]">
            We couldn't complete that plan
          </h3>
          <p className="mt-1 text-sm leading-relaxed text-[#B3261E]">{message}</p>
          {onRetry && (
            <button
              onClick={onRetry}
              className="mt-3 rounded-lg border border-[#E11900]/30 bg-white px-4 py-2 text-xs font-semibold text-[#B3261E] transition hover:bg-[#FDECEA] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#E11900]/40"
            >
              Try again
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
