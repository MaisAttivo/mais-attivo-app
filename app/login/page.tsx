"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth, db } from "@/lib/firebase";
import { collection, getDocs } from "firebase/firestore";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
      const uid = cred.user.uid;

      // Verifica se já existe questionário
      const qSnap = await getDocs(collection(db, `users/${uid}/questionnaire`));
      if (qSnap.empty) router.push("/onboarding");
      else router.push("/client/dashboard");
    } catch (err: any) {
      const msg =
        err?.code === "auth/invalid-credential"
          ? "Email ou password inválidos."
          : "Não foi possível iniciar sessão.";
      setError(msg);
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-xl border p-6">
        <h1 className="text-2xl font-semibold mb-4">Iniciar sessão</h1>
        <form onSubmit={handleLogin} className="grid gap-3">
          <input
            className="border rounded px-3 py-2"
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <input
            className="border rounded px-3 py-2"
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <button
            type="submit"
            disabled={loading}
            className="mt-2 rounded px-3 py-2 border hover:bg-gray-50 disabled:opacity-60"
          >
            {loading ? "A entrar..." : "Entrar"}
          </button>
        </form>
        {error && <p className="text-red-600 mt-3">{error}</p>}
        <p className="mt-4 text-sm">
          Ainda não tens conta? <a className="underline" href="/register">Criar conta</a>
        </p>
      </div>
    </main>
  );
}
