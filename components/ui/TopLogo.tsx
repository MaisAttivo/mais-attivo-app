"use client";

import { usePathname } from "next/navigation";

export default function TopLogo() {
  const pathname = usePathname();
  if (pathname === "/login" || pathname === "/register") return null;
  return (
    <header className="w-full py-3">
      <img
        src="https://cdn.builder.io/api/v1/image/assets%2Fd9f69681ad0a4f6986049fd020072c56%2Fb8f25fb491154d179da1f49a2fc6b90e?format=webp&width=600"
        alt="Mais Attivo"
        className="mx-auto h-10 w-auto"
      />
    </header>
  );
}
