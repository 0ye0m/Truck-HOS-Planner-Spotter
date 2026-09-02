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
      className="mt-8 rounded-xl border border-red-200 bg-red-50 p-6"
      role="alert"
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-7 w-7 flex-none items-center justify-center rounded-full bg-red-500 text-white">
          <AlertTriangleIcon size={15} />
        </span>
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-red-800">
            We couldn't complete that plan
          </h3>
          <p className="mt-1 text-sm leading-relaxed text-red-700">{message}</p>
          {onRetry && (
            <button
              onClick={onRetry}
              className="mt-3 rounded-lg border border-red-300 bg-white px-4 py-2 text-xs font-semibold text-red-700 transition hover:bg-red-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
            >
              Try again
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
