import { Suspense } from "react";
import { ReconcileScreen, ReconcileSkeleton } from "@/components/ReconcileScreen";

/** Reconcile › Runs. ReconcileScreen reads ?new=1 via useSearchParams → Suspense boundary. */
export default function ReconcilePage() {
  return (
    <Suspense fallback={<ReconcileSkeleton />}>
      <ReconcileScreen view={null} />
    </Suspense>
  );
}
