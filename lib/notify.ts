export async function notifyUser(uid: string, title: string, message: string, url?: string) {
  const res = await fetch("/api/notify", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${process.env.NEXT_PUBLIC_NOTIFY_BEARER ?? ""}`, // ver nota abaixo
    },
    body: JSON.stringify({ uid, title, message, url }),
  });
  if (!res.ok) throw new Error((await res.json()).error || "notify failed");
}
