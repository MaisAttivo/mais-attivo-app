import { Suspense } from "react";
import PlansClient from "./PlansClient";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <Suspense fallback={<main className="max-w-3xl mx-auto p-6">A carregar…</main>}>
      <PlansClient />
    </Suspense>
  );
}
