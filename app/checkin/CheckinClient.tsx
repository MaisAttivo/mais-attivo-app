"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { auth, db } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  where,
  writeBatch,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";

/** ===== Helpers de datas em UTC ===== */
function ymdUTC(d: Date) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function fromYMDToUTCDate(ymd: string) {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 0, 0, 0));
}
function addDaysUTC(ymd: string, days: number) {
  const d = fromYMDToUTCDate(ymd);
  d.setUTCDate(d.getUTCDate() + days);
  return ymdUTC(d);
}

type UserLite = {
  id: string;
  email?: string;
  name?: string;
  role?: string;
};

export default function CheckinClient() {
  const router = useRouter();
  const search = useSearchParams();

  const editClientIdQP = search.get("clientId") || "";
  const editCheckinIdQP = search.get("checkinId") || "";

  const [isCoach, setIsCoach] = useState<boolean | null>(null);
  const [uid, setUid] = useState<string | null>(null);

  const [loadingClients, setLoadingClients] = useState(true);
  const [clients, setClients] = useState<UserLite[]>([]);
  const [clientId, setClientId] = useState(editClientIdQP);

  const todayYMD = useMemo(() => ymdUTC(new Date()), []);
  const [lastDate, setLastDate] = useState(todayYMD);
  const [nextDate, setNextDate] = useState(addDaysUTC(todayYMD, 21));
  const [type, setType] = useState<"online" | "presencial">("presencial");
  const [comment, setComment] = useState("");
  const [privateComment, setPrivateComment] = useState("");

  const [peso, setPeso] = useState<string>("");
  const [massaMuscular, setMassaMuscular] = useState<string>("");
  const [massaGorda, setMassaGorda] = useState<string>("");
  const [gorduraVisceral, setGorduraVisceral] = useState<string>("");

  const [objetivoPeso, setObjetivoPeso] = useState<"perda" | "ganho">("perda");

  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (lastDate) setNextDate(addDaysUTC(lastDate, 21));
  }, [lastDate]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!u) {
        setIsCoach(null);
        setUid(null);
        router.push("/login");
        return;
      }
      setUid(u.uid);
      try {
        const snap = await getDoc(doc(db, "users", u.uid));
        const role = snap.exists() ? (snap.get("role") as string | undefined) : undefined;
        const ok = role === "coach" || role === "admin";
        setIsCoach(ok);
        if (!ok) setMsg("Sem acesso (coach apenas).");
      } catch {
        setIsCoach(false);
        setMsg("Sem acesso (coach apenas).");
      }
    });
    return () => unsub();
  }, [router]);

  useEffect(() => {
    async function loadClients() {
      try {
        setLoadingClients(true);
        let qy = query(
          collection(db, "users"),
          where("role", "==", "client"),
          orderBy("email", "asc"),
          limit(100)
        );
        let snap = await getDocs(qy);
        if (snap.empty) {
          const q2 = query(collection(db, "users"), orderBy("email", "asc"), limit(100));
          snap = await getDocs(q2);
        }
        const rows: UserLite[] = [];
        snap.forEach((d) => {
          const data: any = d.data();
          if (data?.role === "coach") return;
          rows.push({
            id: d.id,
            email: data?.email || "",
            name: data?.name || "",
            role: data?.role || "",
          });
        });
        setClients(rows);
        if (!clientId && rows.length) setClientId(rows[0].id);
      } catch (e) {
        console.error(e);
        setMsg("Falha a carregar clientes.");
      } finally {
        setLoadingClients(false);
      }
    }
    if (isCoach) loadClients();
  }, [isCoach, clientId]);

  useEffect(() => {
    async function loadForEdit() {
      if (!isCoach || !clientId || !editCheckinIdQP) return;

      try {
        const checkinRef = doc(db, `users/${clientId}/checkins/${editCheckinIdQP}`);
        const snap = await getDoc(checkinRef);
        if (snap.exists()) {
          const d: any = snap.data();

          if (d.date instanceof Timestamp) {
            setLastDate(ymdUTC(d.date.toDate()));
          }
          if (d.nextDate instanceof Timestamp) {
            setNextDate(ymdUTC(d.nextDate.toDate()));
          }

          setType((d.type as "online" | "presencial") ?? "presencial");
          setComment(d.commentPublic ?? "");
          setPeso(d.peso != null ? String(d.peso) : "");
          setMassaMuscular(d.massaMuscular != null ? String(d.massaMuscular) : "");
          setMassaGorda(d.massaGorda != null ? String(d.massaGorda) : "");
          setGorduraVisceral(d.gorduraVisceral != null ? String(d.gorduraVisceral) : "");
          setObjetivoPeso((d.objetivoPeso as "perda" | "ganho") ?? "perda");
        }

        const coachNoteRef = doc(db, `users/${clientId}/checkins/${editCheckinIdQP}/coachNotes/default`);
        const note = await getDoc(coachNoteRef);
        if (note.exists()) {
          const nd: any = note.data();
          setPrivateComment(nd.privateComment ?? "");
        } else {
          setPrivateComment("");
        }
      } catch (e) {
        console.error(e);
        setMsg("Falha a carregar o check-in para edição.");
      }
    }
    loadForEdit();
  }, [isCoach, clientId, editCheckinIdQP]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!uid || !isCoach) return;
    if (!clientId) return setMsg("Seleciona um cliente.");
    if (!lastDate) return setMsg("Seleciona a data do último check-in.");

    setSaving(true);
    setMsg(null);

    try {
      const batch = writeBatch(db);

      const checkinsCol = collection(db, `users/${clientId}/checkins`);
      const editing = Boolean(editCheckinIdQP);
      const checkinRef = editing ? doc(checkinsCol, editCheckinIdQP) : doc(checkinsCol);

      const lastDateTs = Timestamp.fromDate(fromYMDToUTCDate(lastDate));
      const nextDateTs = Timestamp.fromDate(fromYMDToUTCDate(nextDate));

      const payload: any = {
        date: lastDateTs,
        nextDate: nextDateTs,
        type,
        commentPublic: comment.trim(),
        peso: peso === "" ? null : Number(peso),
        massaMuscular: massaMuscular === "" ? null : Number(massaMuscular),
        massaGorda: massaGorda === "" ? null : Number(massaGorda),
        gorduraVisceral: gorduraVisceral === "" ? null : Number(gorduraVisceral),
        objetivoPeso,
      };

      if (editing) {
        payload.updatedAt = serverTimestamp();
        batch.update(checkinRef, payload);
      } else {
        payload.createdAt = serverTimestamp();
        payload.createdBy = uid;
        batch.set(checkinRef, payload);
      }

      if (privateComment.trim().length > 0) {
        const coachNoteRef = doc(collection(checkinRef, "coachNotes"), "default");
        batch.set(
          coachNoteRef,
          {
            privateComment: privateComment.trim(),
            coachId: uid,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
      }

      const userRef = doc(db, "users", clientId);
      const numericPeso = Number(peso);
      const updates: any = {
        lastCheckinDate: lastDate,
        nextCheckinDate: nextDate,
        objetivoPeso,
        updatedAt: serverTimestamp(),
      };
      if (Number.isFinite(numericPeso) && numericPeso > 0) {
        updates.metaAgua = Number((numericPeso * 0.05).toFixed(2));
      }
      batch.update(userRef, updates);

      await batch.commit();

      setMsg(editing ? "✅ Check-in atualizado!" : "✅ Check-in guardado com sucesso!");
      if (!editing) {
        setComment("");
        setPrivateComment("");
        setPeso("");
        setMassaMuscular("");
        setMassaGorda("");
        setGorduraVisceral("");
      }
    } catch (e: any) {
      console.error(e);
      setMsg(`❌ Falha a guardar: ${e?.message || e?.code || "erro desconhecido"}`);
    } finally {
      setSaving(false);
    }
  }

  if (isCoach === null) {
    return <div className="p-6 text-center">A verificar sessão…</div>;
  }
  if (isCoach === false) {
    return <div className="p-6 text-center text-red-600">Sem acesso (coach apenas).</div>;
  }

  const editingUI = Boolean(editCheckinIdQP);

  return (
    <main className="max-w-3xl mx-auto p-6 space-y-6">
      <h1 className="text-2xl font-semibold">
        {editingUI ? "Editar Check-in (Coach)" : "Check-in (Coach)"}
      </h1>

      <form onSubmit={handleSubmit} className="rounded-2xl bg-white shadow-lg ring-2 ring-slate-400 p-5 space-y-5">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Cliente</label>
          <select
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            className="w-full rounded-xl border border-slate-400 bg-white shadow-sm px-3 py-2"
            disabled={loadingClients || !!editClientIdQP}
          >
            {loadingClients && <option>Carregando…</option>}
            {!loadingClients &&
              clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name ? `${c.name} — ${c.email}` : c.email}
                </option>
              ))}
          </select>
          {!loadingClients && clients.length === 0 && (
            <p className="text-sm text-slate-500 mt-1">Não há clientes (role=client) para listar.</p>
          )}
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Data do último check-in</label>
            <input
              type="date"
              value={lastDate}
              onChange={(e) => setLastDate(e.target.value)}
              className="w-full rounded-xl border border-slate-400 bg-white shadow-sm px-3 py-2"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Próximo check-in (auto +21 dias)</label>
            <input
              type="date"
              value={nextDate}
              onChange={(e) => setNextDate(e.target.value)}
              className="w-full rounded-xl border border-slate-400 bg-white shadow-sm px-3 py-2"
            />
            <p className="text-xs text-slate-500 mt-1">É calculado automaticamente quando alteras a data anterior, mas podes ajustar.</p>
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Tipo de check-in</label>
            <select value={type} onChange={(e) => setType(e.target.value as any)} className="w-full rounded-xl border border-slate-400 bg-white shadow-sm px-3 py-2">
              <option value="presencial">Presencial</option>
              <option value="online">Online</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Objetivo de peso</label>
            <select value={objetivoPeso} onChange={(e) => setObjetivoPeso(e.target.value as any)} className="w-full rounded-xl border border-slate-400 bg-white shadow-sm px-3 py-2">
              <option value="perda">Perda</option>
              <option value="ganho">Ganho</option>
            </select>
            <p className="text-xs text-slate-500 mt-1">
              Este valor também fica guardado em <code>users/{'{uid}'}</code> para o dashboard.
            </p>
          </div>
        </div>

        <div className="grid sm:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Peso (kg)</label>
            <input type="number" step="0.1" value={peso} onChange={(e) => setPeso(e.target.value)} placeholder="ex: 74.5" className="w-full rounded-xl border border-slate-400 bg-white shadow-sm px-3 py-2" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Massa Muscular (kg)</label>
            <input type="number" step="0.1" value={massaMuscular} onChange={(e) => setMassaMuscular(e.target.value)} placeholder="ex: 32.1" className="w-full rounded-xl border border-slate-400 bg-white shadow-sm px-3 py-2" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Massa Gorda (kg)</label>
            <input type="number" step="0.1" value={massaGorda} onChange={(e) => setMassaGorda(e.target.value)} placeholder="ex: 14.8" className="w-full rounded-xl border border-slate-400 bg-white shadow-sm px-3 py-2" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Gordura Visceral</label>
            <input type="number" step="0.1" value={gorduraVisceral} onChange={(e) => setGorduraVisceral(e.target.value)} placeholder="ex: 8" className="w-full rounded-xl border border-slate-400 bg-white shadow-sm px-3 py-2" />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Comentário (visível para o cliente)</label>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Notas e orientações para o cliente…"
            className="w-full rounded-xl border border-slate-400 bg-white shadow-sm px-3 py-2 min-h-[90px]"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Comentário privado (só o coach vê)</label>
          <textarea
            value={privateComment}
            onChange={(e) => setPrivateComment(e.target.value)}
            placeholder="Observações internas — não são partilhadas com o cliente"
            className="w-full rounded-xl border border-slate-400 bg-white shadow-sm px-3 py-2 min-h-[90px]"
          />
          <p className="text-xs text-slate-500 mt-1">
            Guardado em <code>checkins/&lt;id&gt;/coachNotes/default</code> e invisível ao cliente pelas regras.
          </p>
        </div>

        {msg && (
          <div className="rounded-xl border px-3 py-2 text-sm border-slate-200 bg-slate-50 text-slate-900">
            {msg}
          </div>
        )}

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving || !clientId}
            className="rounded-[20px] overflow-hidden border-[3px] border-[#706800] text-[#706800] bg-white px-4 py-2.5 shadow hover:bg-[#FFF4D1] disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {saving ? "A guardar…" : editingUI ? "Atualizar check-in" : "Guardar check-in"}
          </button>
        </div>
      </form>
    </main>
  );
}
