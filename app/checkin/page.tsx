import { Suspense } from "react";
import CheckinClient from "./CheckinClient";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <Suspense fallback={<div className="p-6">A carregar…</div>}>
      <CheckinClient />
    </Suspense>
  );
}
