"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { retryLeadSync } from "./actions";

export function RetryLeadButton({ leadId }: { leadId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={isPending}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const result = await retryLeadSync(leadId);
            if (!result.ok) setError(result.error);
            else router.refresh();
          });
        }}
        className="h-8 cursor-pointer rounded-full border border-black bg-white px-3.5 text-xs font-semibold transition-colors hover:bg-black hover:text-white disabled:opacity-50"
      >
        {isPending ? "Reintentando…" : "Reintentar envío"}
      </button>
      {error ? <span className="text-[11px] font-semibold text-[#b42318]">{error}</span> : null}
    </div>
  );
}
