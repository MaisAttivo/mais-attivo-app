"use client";

import { Geist, Geist_Mono } from "next/font/google";
import { usePathname, useRouter } from "next/navigation";
import { useSession } from "@/lib/auth";
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
  const { uid, role, loading } = useSession();
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
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-gradient-to-br from-[#FFF7E8] to-[#F9F0CF] min-h-screen`}
      >
        {showHeader && (
          <header className="w-full py-3">
            {clickableLogo ? (
              <button type="button" onClick={handleLogoClick} className="block mx-auto">
                <img
                  src="https://cdn.builder.io/api/v1/image/assets%2Fd9f69681ad0a4f6986049fd020072c56%2F83d1b8046a0a4d0592f0f582b2fcc9a1?format=webp&width=800"
                  alt="Mais Attivo"
                  className="mx-auto h-12 sm:h-14 w-auto cursor-pointer"
                />
              </button>
            ) : (
              <img
                src="https://cdn.builder.io/api/v1/image/assets%2Fd9f69681ad0a4f6986049fd020072c56%2F83d1b8046a0a4d0592f0f582b2fcc9a1?format=webp&width=800"
                alt="Mais Attivo"
                className="mx-auto h-12 sm:h-14 w-auto"
              />
            )}
          </header>
        )}
        {children}
      </body>
    </html>
  );
}
