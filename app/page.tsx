// app/page.tsx
import { redirect } from "next/navigation";

export default function Home() {
  redirect("/login"); // envia logo para a página de login
}