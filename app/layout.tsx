"use client";

import { Geist, Geist_Mono } from "next/font/google";
import { usePathname, useRouter } from "next/navigation";
import { useSession } from "@/lib/auth";
import { signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});


export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const pathname = usePathname();
  const router = useRouter();
  const { uid, role, active, loading } = useSession();
  const showHeader = pathname !== "/login" && pathname !== "/register";
  const clickableLogo = pathname !== "/onboarding";

  function handleLogoClick() {
    if (loading) return;
    if (!uid) { router.replace("/login"); return; }
    if (role === "coach") { router.replace("/coach"); return; }
    router.replace("/dashboard");
  }

  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased attivo-bg min-h-screen`}
      >
        {showHeader && (
          <header className="w-full py-3">
            {clickableLogo ? (
              <button type="button" onClick={handleLogoClick} className="block mx-auto">
                <img
                  src="https://cdn.builder.io/api/v1/image/assets%2Fd9f69681ad0a4f6986049fd020072c56%2F83d1b8046a0a4d0592f0f582b2fcc9a1?format=webp&width=800"
                  alt="Mais Attivo"
                  className="mx-auto h-[144px] sm:h-[168px] w-auto cursor-pointer"
                />
              </button>
            ) : (
              <img
                src="https://cdn.builder.io/api/v1/image/assets%2Fd9f69681ad0a4f6986049fd020072c56%2F83d1b8046a0a4d0592f0f582b2fcc9a1?format=webp&width=800"
                alt="Mais Attivo"
                className="mx-auto h-[144px] sm:h-[168px] w-auto"
              />
            )}
          </header>
        )}
        {uid && role !== "coach" && active === false ? (
          <>
            <main className="max-w-xl mx-auto p-6">
              <div
                className="rounded-2xl bg-white shadow-lg ring-2 ring-rose-400 p-6 text-center"
                role="button"
                tabIndex={0}
                aria-label="Terminar sessão"
                onClick={() => { signOut(auth).finally(() => router.replace("/login")); }}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); signOut(auth).finally(() => router.replace("/login")); } }}
                title="Clicar para terminar sessão"
              >
                <h2 className="text-xl font-semibold text-rose-700 mb-2">Conta inativa</h2>
                <p className="text-sm text-rose-700">A tua conta está inativa. Fala com o teu coach para voltar a ativá-la.</p>
                <div className="mt-4 flex justify-center">
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); signOut(auth).finally(() => router.replace("/login")); }}
                    className="rounded-[20px] overflow-hidden border-[3px] border-[#706800] text-[#706800] bg-white px-4 py-2 shadow hover:bg-[#FFF4D1]"
                  >
                    Terminar sessão
                  </button>
                </div>
              </div>
            </main>
          </>
        ) : (
          children
        )}
      </body>
    </html>
  );
}
