"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, notFound } from "next/navigation";
import { db, auth } from "@/lib/firebase";
import {
  collection,
  addDoc,
  query,
  orderBy,
  getDocs,
  serverTimestamp,
  deleteDoc,
  doc,
  updateDoc,
  setDoc,
  limit,
} from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";

type Checkin = {
  id: string;
  date: string;          // YYYY-MM-DD
  nextDate: string;      // YYYY-MM-DD
  type?: "online" | "presencial";
  commentPublic?: string;
  commentPrivate?: string;
};

const COACH_WHATSAPP = "351963032907"; // <- atualiza se quiseres

function toISODate(d: Date) {
  return d.toISOString().slice(0, 10);
}

// Atualiza cache (users/{userId})
async function writeUserCheckinCache(userId: string, last: Date | null, next: Date | null) {
  await setDoc(
    doc(db, `users/${userId}`),
    {
      lastCheckinDate: last ? toISODate(last) : null,
      nextCheckinDate: next ? toISODate(next) : null,
      checkinMetaUpdatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

async function refreshUserCheckinCache(userId: string) {
  const qy = query(
    collection(db, `users/${userId}/checkins`),
    orderBy("date", "desc"),
    limit(1)
  );
  const snap = await getDocs(qy);
  if (snap.empty) {
    await writeUserCheckinCache(userId, null, null);
  } else {
    const d: any = snap.docs[0].data();
    const last: Date | undefined = d.date?.toDate?.();
    const next: Date | undefined = d.nextDate?.toDate?.();
    await writeUserCheckinCache(userId, last || null, next || null);
  }
}

export default function CheckinsForUserPage() {
  const { userId } = useParams<{ userId: string }>();
  const [me, setMe] = useState<string | null>(null);
  const [isCoach, setIsCoach] = useState(false);
  const [loadingAuth, setLoadingAuth] = useState(true);

  const [checkins, setCheckins] = useState<Checkin[]>([]);
  const [loadingList, setLoadingList] = useState(true);

  // form state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formDate, setFormDate] = useState("");
  const [formType, setFormType] = useState<"online" | "presencial">("online");
  const [formCommentPublic, setFormCommentPublic] = useState("");
  const [formCommentPrivate, setFormCommentPrivate] = useState("");
  const [saving, setSaving] = useState(false);

  // filtros
  const [filterFrom, setFilterFrom] = useState("");
  const [filterTo, setFilterTo] = useState("");

  // toasts
  const [toast, setToast] = useState<{type:"success"|"error"; msg:string} | null>(null);
  const showToast = (type:"success"|"error", msg:string) => {
    setToast({type, msg});
    setTimeout(() => setToast(null), 2800);
  };

  // Auth
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!u) {
        setMe(null);
        setIsCoach(false);
        setLoadingAuth(false);
        return;
      }
      setMe(u.uid);
      const token = await u.getIdTokenResult();
      setIsCoach(!!(token.claims.coach || token.claims.role === "coach"));
      setLoadingAuth(false);
    });
    return () => unsub();
  }, []);

  // Segurança de UI: cliente não vê outros
  if (!loadingAuth && me && !isCoach && me !== userId) {
    return notFound();
  }

  // Carregar check-ins
  async function loadCheckins() {
    setLoadingList(true);
    try {
      const qy = query(collection(db, `users/${userId}/checkins`), orderBy("date", "desc"));
      const snap = await getDocs(qy);
      const list: Checkin[] = [];
      snap.forEach((docSnap) => {
        const d: any = docSnap.data();
        list.push({
          id: docSnap.id,
          date: d.date?.toDate?.().toISOString().slice(0,10) || d.date || "",
          nextDate: d.nextDate?.toDate?.().toISOString().slice(0,10) || d.nextDate || "",
          type: d.type || "online",
          commentPublic: d.commentPublic || "",
          commentPrivate: d.commentPrivate || "",
        });
      });
      setCheckins(list);
    } catch (e) {
      console.error(e);
      showToast("error","Falha a carregar check-ins.");
    } finally {
      setLoadingList(false);
    }
  }

  useEffect(() => {
    if (!userId) return;
    loadCheckins();
  }, [userId]);

  // Próxima data auto +21
  const nextFromForm = useMemo(() => {
    if (!formDate) return "";
    const d = new Date(formDate);
    d.setDate(d.getDate() + 21);
    return toISODate(d);
  }, [formDate]);

  // Save
  async function handleSave() {
    if (!isCoach) return;
    if (!formDate) { showToast("error","Escolhe a data."); return; }
    setSaving(true);
    try {
      const dateObj = new Date(formDate);
      const nextDateObj = new Date(dateObj);
      nextDateObj.setDate(nextDateObj.getDate() + 21);

      const payload = {
        date: dateObj,
        nextDate: nextDateObj,
        type: formType,
        commentPublic: formCommentPublic.trim(),
        commentPrivate: formCommentPrivate.trim(),
        ...(editingId ? {} : { createdAt: serverTimestamp() }),
      };

      if (editingId) {
        await updateDoc(doc(db, `users/${userId}/checkins/${editingId}`), payload as any);
      } else {
        await addDoc(collection(db, `users/${userId}/checkins`), payload as any);
      }
      await writeUserCheckinCache(userId, dateObj, nextDateObj);

      setFormDate(""); setFormType("online"); setFormCommentPublic(""); setFormCommentPrivate("");
      setEditingId(null);
      await loadCheckins();
      showToast("success", editingId ? "Check-in atualizado." : "Check-in criado.");
    } catch (e) {
      console.error(e);
      showToast("error","Erro ao guardar.");
    } finally {
      setSaving(false);
    }
  }

  function startEdit(c: Checkin) {
    setEditingId(c.id);
    setFormDate(c.date);
    setFormType((c.type as any) || "online");
    setFormCommentPublic(c.commentPublic || "");
    setFormCommentPrivate(c.commentPrivate || "");
    window?.scrollTo?.({ top: 0, behavior: "smooth" });
  }

  async function handleDelete(id: string) {
    if (!isCoach) return;
    if (!confirm("Apagar este check-in?")) return;
    try {
      await deleteDoc(doc(db, `users/${userId}/checkins/${id}`));
      await refreshUserCheckinCache(userId);
      await loadCheckins();
      showToast("success","Check-in apagado.");
    } catch (e) {
      console.error(e);
      showToast("error","Erro ao apagar.");
    }
  }

  // aplicar filtros locais
  const filtered = useMemo(() => {
    return checkins.filter(c => {
      if (filterFrom && c.date < filterFrom) return false;
      if (filterTo && c.date > filterTo) return false;
      return true;
    });
  }, [checkins, filterFrom, filterTo]);

  if (loadingAuth) return <div className="p-4">A carregar…</div>;
  if (!me) return <div className="p-4">Inicia sessão para aceder.</div>;

  return (
    <div className="max-w-2xl mx-auto p-4 space-y-6">
      {/* Toast */}
      {toast && (
        <div className={`fixed right-4 top-4 z-50 px-4 py-2 rounded-xl text-white shadow
                        ${toast.type === "success" ? "bg-emerald-600" : "bg-rose-600"}`}>
          {toast.msg}
        </div>
      )}

      <h1 className="text-2xl font-semibold">Check-ins — {userId}</h1>

      {/* Formulário (só coach) */}
      {isCoach && (
        <div className="space-y-4 border p-4 rounded-2xl shadow-sm">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1">Data do check-in</label>
              <input
                type="date"
                value={formDate}
                onChange={(e) => setFormDate(e.target.value)}
                className="border rounded-xl px-3 py-2 w-full"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Próximo (auto +21d)</label>
              <input
                type="text"
                value={nextFromForm}
                readOnly
                className="border rounded-xl px-3 py-2 w-full bg-gray-50"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Tipo</label>
              <select
                value={formType}
                onChange={(e) => setFormType(e.target.value as any)}
                className="border rounded-xl px-3 py-2 w-full"
              >
                <option value="online">Online</option>
                <option value="presencial">Presencial</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Comentário (visível ao cliente)</label>
            <textarea
              value={formCommentPublic}
              onChange={(e) => setFormCommentPublic(e.target.value)}
              className="border rounded-xl px-3 py-2 w-full min-h-[70px]"
              placeholder="Notas/resumo que o cliente pode ver…"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Nota privada do coach</label>
            <textarea
              value={formCommentPrivate}
              onChange={(e) => setFormCommentPrivate(e.target.value)}
              className="border rounded-xl px-3 py-2 w-full min-h-[70px]"
              placeholder="Só o coach vê isto."
            />
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 rounded-xl border shadow disabled:opacity-50"
            >
              {saving ? "A guardar…" : editingId ? "Guardar alterações" : "Criar check-in"}
            </button>
            {editingId && (
              <button
                type="button"
                onClick={() => { setEditingId(null); setFormDate(""); setFormType("online"); setFormCommentPublic(""); setFormCommentPrivate(""); }}
                className="px-4 py-2 rounded-xl border"
              >
                Cancelar
              </button>
            )}
          </div>
        </div>
      )}

      {/* Filtros de datas */}
      <div className="border p-4 rounded-2xl">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
          <div>
            <label className="block text-sm font-medium mb-1">De</label>
            <input type="date" value={filterFrom} onChange={e=>setFilterFrom(e.target.value)} className="border rounded-xl px-3 py-2 w-full"/>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Até</label>
            <input type="date" value={filterTo} onChange={e=>setFilterTo(e.target.value)} className="border rounded-xl px-3 py-2 w-full"/>
          </div>
          <button
            className="px-4 py-2 rounded-xl border"
            onClick={()=>{ setFilterFrom(""); setFilterTo(""); }}
          >
            Limpar filtros
          </button>
        </div>
      </div>

      {/* Lista */}
      <div className="space-y-2">
        {loadingList && <div className="text-sm text-gray-500">A carregar…</div>}
        {!loadingList && filtered.length === 0 && (
          <div className="text-sm text-gray-500">Sem check-ins neste intervalo.</div>
        )}

        {filtered.map((c) => (
          <div key={c.id} className="border p-3 rounded-2xl space-y-1">
            <div className="flex flex-wrap items-center gap-x-3 text-sm">
              <span><b>Data:</b> {c.date || "-"}</span>
              <span><b>Próximo:</b> {c.nextDate || "-"}</span>
              <span className="inline-flex items-center px-2 py-0.5 rounded bg-gray-100 border text-xs">
                {c.type === "presencial" ? "Presencial" : "Online"}
              </span>
            </div>

            {c.commentPublic && (
              <div className="text-sm"><b>Comentário:</b> {c.commentPublic}</div>
            )}

            {/* Nota privada só o coach vê */}
            {isCoach && c.commentPrivate && (
              <div className="text-sm text-gray-600">
                <b>Nota privada:</b> {c.commentPrivate}
              </div>
            )}

            <a
              href={`https://wa.me/${COACH_WHATSAPP}?text=Ol%C3%A1%20Coach,%20sobre%20o%20meu%20check-in%20de%20${encodeURIComponent(c.date)}...`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block mt-2 px-3 py-1 bg-green-500 text-white text-sm rounded-lg shadow hover:bg-green-600"
            >
              💬 Falar no WhatsApp
            </a>

            {isCoach && (
              <div className="flex gap-2 mt-2">
                <button onClick={() => startEdit(c)} className="px-3 py-1 rounded-xl border">Editar</button>
                <button onClick={() => handleDelete(c.id)} className="px-3 py-1 rounded-xl border text-red-600">
                  Apagar
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
