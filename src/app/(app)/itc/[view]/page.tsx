import { Suspense } from "react";
import { notFound } from "next/navigation";
import { ReconcileScreen, ReconcileSkeleton } from "@/components/ReconcileScreen";
import { ITC_VIEWS, viewFromSlug } from "@/lib/views";

/** ITC views of the latest recon (nav-ia-v1.md): /itc/at-risk · mismatches · unclaimed · matched */
export function generateStaticParams() {
  return ITC_VIEWS.map((d) => ({ view: d.slug }));
}

export const dynamicParams = false;

export default async function ItcViewPage({ params }: { params: Promise<{ view: string }> }) {
  const { view } = await params;
  const key = viewFromSlug(view);
  if (!key) notFound();
  return (
    <Suspense fallback={<ReconcileSkeleton />}>
      <ReconcileScreen view={key} />
    </Suspense>
  );
}
