"use client";

import { Geist, Geist_Mono } from "next/font/google";
import { usePathname } from "next/navigation";
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
  const showHeader = pathname !== "/login" && pathname !== "/register";
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-gradient-to-br from-[#FFF7E8] to-[#F9F0CF] min-h-screen`}
      >
        {showHeader && (
          <header className="w-full py-3">
            <img
              src="https://cdn.builder.io/api/v1/image/assets%2Fd9f69681ad0a4f6986049fd020072c56%2Fb8f25fb491154d179da1f49a2fc6b90e?format=webp&width=600"
              alt="Mais Attivo"
              className="mx-auto h-10 w-auto"
            />
          </header>
        )}
        {children}
      </body>
    </html>
  );
}
