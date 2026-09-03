import { useMutation } from "@tanstack/react-query";
import { planTrip } from "@/services/api";
import type { PlanPayload, PlanRequest } from "@/types";

export function usePlanTrip(onSuccess: (payload: PlanPayload) => void) {
  return useMutation<PlanPayload, Error, PlanRequest>({
    mutationFn: planTrip,
    onSuccess,
  });
}
