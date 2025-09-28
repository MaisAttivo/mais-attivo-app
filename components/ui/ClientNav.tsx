"use client";

"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { signOut } from "firebase/auth";
import { auth, db } from "@/lib/firebase";
import { doc, getDoc } from "firebase/firestore";
import { useSession } from "@/lib/auth";

export default function ClientNav() {
  const router = useRouter();
  const { uid } = useSession();
  const [showPowerlifting, setShowPowerlifting] = useState(false);
  const DEFAULT_COACH_WHATSAPP = "351963032907";

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        if (!uid || !db) { setShowPowerlifting(false); return; }
        const snap = await getDoc(doc(db, "users", uid));
        const data: any = snap.data() || {};
        if (mounted) setShowPowerlifting(!!data.powerlifting);
      } catch {
        if (mounted) setShowPowerlifting(false);
      }
    })();
    return () => { mounted = false; };
  }, [uid]);

  function openCoachWhatsApp() {
    const phone = (process.env.NEXT_PUBLIC_WHATSAPP_PHONE as string | undefined) || DEFAULT_COACH_WHATSAPP;
    const url = `https://wa.me/${phone}?text=${encodeURIComponent("Olá! Tenho uma dúvida:")}`;
    window.open(url, "_blank", "noopener,noreferrer");
  }

  // Safety net: hide legacy items if some cached bundle still renders them
  useEffect(() => {
    const hide = () => {
      document.querySelectorAll('[data-slot="dropdown-menu-content"] [data-slot="dropdown-menu-item"]').forEach((el) => {
        const txt = (el as HTMLElement).textContent?.toLowerCase().trim() || '';
        const attr = (el as HTMLElement).getAttribute('data-radix-collection-item') || '';
        const keep = (el as HTMLElement).getAttribute('data-keep') === 'true';
        // Esconder apenas itens legados do InBody; preservar itens marcados com data-keep
        if (!keep && (txt.includes('inbody') || /InBody/i.test(attr))) {
          (el as HTMLElement).remove();
        }
      });
    };
    hide();
    const ob = new MutationObserver(hide);
    const root = document.body;
    ob.observe(root, { childList: true, subtree: true });
    return () => ob.disconnect();
  }, []);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" aria-label="Menu">
            <Menu className="h-5 w-5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel>Navegação</DropdownMenuLabel>
          <DropdownMenuItem onClick={() => router.push("/dashboard")}>Painel Principal</DropdownMenuItem>
          <DropdownMenuItem onClick={() => router.push("/daily")}>Feedback Diário</DropdownMenuItem>
          <DropdownMenuItem onClick={() => router.push("/weekly")}>Feedback Semanal</DropdownMenuItem>
          <DropdownMenuItem onClick={() => router.push("/plans")}>Planos</DropdownMenuItem>
          <DropdownMenuItem onClick={() => router.push("/evolucao")}>Evolução</DropdownMenuItem>
          <DropdownMenuItem data-keep="true" onClick={() => router.push("/fotos")}>Atualização Fotos</DropdownMenuItem>
          <DropdownMenuItem data-keep="true" onClick={() => router.push("/inbody")}>InBody</DropdownMenuItem>
          {showPowerlifting && (
            <DropdownMenuItem onClick={() => router.push("/powerlifting")}>Powerlifting</DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={openCoachWhatsApp}>Contactar Treinador</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            onClick={() => {
              signOut(auth).finally(() => router.replace("/login"));
            }}
          >
            Terminar Sessão
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <InbodyModal open={showInbody} onClose={() => setShowInbody(false)} />
    </>
  );
}
