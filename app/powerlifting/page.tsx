"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { onAuthStateChanged } from "firebase/auth";
import { auth, db } from "@/lib/firebase";
import { doc, getDoc } from "firebase/firestore";

export default function PowerliftingPage() {
  const [uid, setUid] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [allowed, setAllowed] = useState(false);
  const [notes, setNotes] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);

  useEffect(() => {
    if (!auth) { setUid(null); setLoading(false); return; }
    const unsub = onAuthStateChanged(auth, async (u) => {
      try {
        if (!u || !db) { setUid(null); setAllowed(false); setNotes(null); setLink(null); return; }
        setUid(u.uid);
        const snap = await getDoc(doc(db, "users", u.uid));
        const data: any = snap.data() || {};
        const ok = !!data.powerlifting;
        setAllowed(ok);
        setNotes(data.powerliftingNotes ?? null);
        setLink(data.powerliftingLink ?? null);
      } finally {
        setLoading(false);
      }
    });
    return () => unsub();
  }, []);

  if (loading) return <main className="max-w-xl mx-auto p-6">A carregar…</main>;
  if (!uid) return <main className="max-w-xl mx-auto p-6">Inicia sessão.</main>;
  if (!allowed) return <main className="max-w-xl mx-auto p-6">Página indisponível.</main>;

  return (
    <main className="max-w-xl mx-auto p-6 space-y-4">
      <div>
        <Link href="/dashboard" className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900">
          <span>⬅️</span> Voltar à dashboard
        </Link>
      </div>

      <h1 className="text-2xl font-semibold text-center">Powerlifting</h1>

      {link && (
        <div className="rounded-2xl bg-white shadow-lg ring-2 ring-slate-400 p-5">
          <div className="text-sm text-slate-700 mb-2">Plano/folha</div>
          <a href={link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-xl bg-[#D4AF37] px-4 py-2 text-white shadow hover:bg-[#BE9B2F]">Abrir ligação</a>
        </div>
      )}

      {notes && (
        <div className="rounded-2xl bg-white shadow-lg ring-2 ring-slate-400 p-5">
          <div className="text-sm text-slate-700 mb-1">Notas do coach</div>
          <p className="text-slate-900 whitespace-pre-wrap">{notes}</p>
        </div>
      )}

      {!link && !notes && (
        <div className="rounded-2xl bg-white shadow-lg ring-2 ring-slate-400 p-5 text-sm text-slate-600">
          Sem conteúdo disponível para já.
        </div>
      )}
    </main>
  );
}
