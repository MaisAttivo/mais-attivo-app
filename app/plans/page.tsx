"use client";

import { ClientGuard } from "@/lib/auth";

export default function PlansPage() {
  return (
    <ClientGuard>
      <main className="max-w-2xl mx-auto p-6">
        <div className="rounded-2xl bg-white shadow-lg ring-2 ring-slate-400 p-6 text-center">
          <h1 className="text-2xl font-semibold mb-1">Planos</h1>
          <p className="text-sm text-slate-700">Brevemente...</p>
        </div>
      </main>
    </ClientGuard>
  );
}
