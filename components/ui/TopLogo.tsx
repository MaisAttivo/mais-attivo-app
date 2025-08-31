"use client";

import { usePathname } from "next/navigation";

export default function TopLogo() {
  const pathname = usePathname();
  if (pathname === "/login" || pathname === "/register") return null;
  return (
    <header className="w-full py-3">
      <img
        src="https://cdn.builder.io/api/v1/image/assets%2Fd9f69681ad0a4f6986049fd020072c56%2F83d1b8046a0a4d0592f0f582b2fcc9a1?format=webp&width=800"
        alt="Mais Attivo"
        className="mx-auto h-10 w-auto"
      />
    </header>
  );
}
