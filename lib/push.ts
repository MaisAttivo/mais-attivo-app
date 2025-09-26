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

// atalhos prontos
export async function pushPagamento(uid: string) {
  return notifyUser({ uid, title: "Pagamento pendente", message: "Há um pagamento por regularizar. Obrigado!" });
}
export async function pushMarcarCheckin(uid: string) {
  return notifyUser({ uid, title: "Marcar Check-in", message: "Está na hora! Marca o teu próximo Check-in!", url: "/checkins" });
}
export async function pushRegistosDiarios(uid: string) {
  return notifyUser({ uid, title: "Registos diários", message: "Não tens preenchido os feedbacks diários! Não te esqueças do diário de hoje!", url: "/daily" });
}
export async function pushRegistoSemanal(uid: string) {
  return notifyUser({ uid, title: "Registo semanal", message: "Não chegaste a preencher o teu feedback semanal! Manda mensagem com feedback, por favor.", url: "/weekly" });
}
export async function pushFotos(uid: string) {
  return notifyUser({ uid, title: "Fotos", message: "Assim que possível, envia as tuas fotos de atualização!", url: "/photos" });
}
export async function pushHidratacao(uid: string) {
  return notifyUser({ uid, title: "Hidratação", message: "Tens andado a falhar com a água! Vamos atingir a meta de água diária!", url: "/daily" });
}
export async function pushPlanosAnexados(uid: string) {
  return notifyUser({ uid, title: "Planos Atualizados!", message: "Planos Atualizados! Qualquer dúvida não hesites em contactar!", url: "/plans" });
}
