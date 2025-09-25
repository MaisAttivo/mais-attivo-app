export type NotifyOptions = {
  title: string;
  message: string;
  uid?: string; // se omitido, envia para todos os subscritos
  url?: string; // página a abrir ao clicar
};

export async function notifyUser(opts: NotifyOptions) {
  if (!opts || !opts.title || !opts.message) throw new Error("Título e mensagem são obrigatórios");
  const res = await fetch("/api/notify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(opts),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || "Falhou enviar notificação");
  return data;
}
