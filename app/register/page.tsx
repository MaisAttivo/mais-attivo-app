"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { auth, db } from "@/lib/firebase";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";

export default function RegisterPage() {
  const router = useRouter();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      // 1) Criar conta no Auth
      const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);

      // 2) Guardar documento em /users/{uid}
      await setDoc(doc(db, "users", cred.user.uid), {
        name: name.trim(),
        email: email.trim().toLowerCase(),
        role: "client",                // bloqueado: ninguém escolhe "coach" no frontend
        createdAt: serverTimestamp(),
        notificationsEnabled: true,
        devicePlatform: "web",
      });

      // 3) Ir para o onboarding (questionário inicial)
      router.push("/onboarding");
    } catch (err: any) {
      // Mensagens mais amigáveis
      const msg =
        err?.code === "auth/email-already-in-use"
          ? "Este email já está a ser usado."
          : err?.code === "auth/invalid-email"
          ? "Email inválido."
          : err?.code === "auth/weak-password"
          ? "Password fraca (mínimo 6 caracteres)."
          : "Ocorreu um erro a criar a conta.";
      setError(msg);
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-xl border p-6">
        <h1 className="text-2xl font-semibold mb-4">Criar conta</h1>

        <form onSubmit={handleRegister} className="grid gap-3">
          <input
            className="border rounded px-3 py-2"
            placeholder="Nome"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
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
            placeholder="Password (mín. 6)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
          />

          <button
            type="submit"
            disabled={loading}
            className="mt-2 rounded px-3 py-2 border hover:bg-gray-50 disabled:opacity-60"
          >
            {loading ? "A criar..." : "Criar conta"}
          </button>
        </form>

        {error && <p className="text-red-600 mt-3">{error}</p>}

        <p className="mt-4 text-sm">
          Já tens conta?{" "}
          <a className="underline" href="/login">
            Inicia sessão
          </a>
        </p>
      </div>
    </main>
  );
}
