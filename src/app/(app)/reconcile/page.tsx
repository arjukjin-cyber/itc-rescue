import { Suspense } from "react";
import { ReconcileScreen, ReconcileSkeleton } from "@/components/ReconcileScreen";

/** Reconcile › Runs and its ITC views (?view=…). ReconcileScreen reads ?view / ?new via useSearchParams → Suspense. */
export default function ReconcilePage() {
  return (
    <Suspense fallback={<ReconcileSkeleton />}>
      <ReconcileScreen />
    </Suspense>
  );
}
