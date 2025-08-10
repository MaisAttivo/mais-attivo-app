"use client";

import { useEffect, useState } from "react";
import { auth, db } from "@/lib/firebase";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { app } from "@/lib/firebase";

export default function DevPage() {
  const [proj, setProj] = useState<string>("");
  const [user, setUser] = useState<any>(null);
  const [claims, setClaims] = useState<any>(null);
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [msg, setMsg] = useState<string>("");

  useEffect(() => {
    setProj((app.options as any)?.projectId ?? "(desconhecido)");

    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      setMsg("");
      if (u) {
        const t = await u.getIdTokenResult(true);
        setClaims(t.claims ?? null);
      } else {
        setClaims(null);
      }
    });
    return () => unsub();
  }, []);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setMsg("A autenticar…");
    try {
      await signInWithEmailAndPassword(auth, email.trim(), pass);
      setMsg("✅ Login OK");
    } catch (e: any) {
      setMsg(`❌ Login falhou: ${e?.code || e?.message}`);
    }
  }

  async function handleLogout() {
    await signOut(auth);
    setMsg("Terminaste sessão.");
  }

  async function testRead() {
    if (!user) return setMsg("Faz login primeiro.");
    setMsg("A ler users/{uid} …");
    try {
      const snap = await getDoc(doc(db, "users", user.uid));
      if (snap.exists()) {
        setMsg("✅ Firestore OK: users/{uid} lido com sucesso.");
      } else {
        setMsg("⚠️ Firestore: users/{uid} não existe, mas permissões OK.");
      }
    } catch (e: any) {
      setMsg(`❌ Firestore BLOQUEADO: ${e?.code || e?.message}`);
    }
  }

  return (
    <div className="max-w-xl mx-auto p-6 space-y-4">
      <h1 className="text-2xl font-semibold">Debug Firebase</h1>

      <div className="border rounded-xl p-4">
        <div><b>projectId:</b> {proj}</div>
        <div><b>auth.currentUser:</b> {user ? `${user.email} (${user.uid})` : "— (não autenticado)"}</div>
        <div><b>claims:</b> <pre className="text-xs bg-gray-100 p-2 rounded">{JSON.stringify(claims, null, 2)}</pre></div>
      </div>

      {!user && (
        <form onSubmit={handleLogin} className="border rounded-xl p-4 space-y-2">
          <div className="font-medium">Login (email/senha)</div>
          <input
            type="email" placeholder="email"
            className="border rounded px-3 py-2 w-full"
            value={email} onChange={e=>setEmail(e.target.value)}
          />
          <input
            type="password" placeholder="senha"
            className="border rounded px-3 py-2 w-full"
            value={pass} onChange={e=>setPass(e.target.value)}
          />
          <button className="border rounded px-4 py-2">Entrar</button>
        </form>
      )}

      {user && (
        <div className="flex gap-2">
          <button onClick={handleLogout} className="border rounded px-4 py-2">Terminar sessão</button>
          <button onClick={testRead} className="border rounded px-4 py-2">Testar leitura users/{`{uid}`}</button>
        </div>
      )}

      {msg && <div className="p-3 border rounded bg-gray-50">{msg}</div>}
    </div>
  );
}
