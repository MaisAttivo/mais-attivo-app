// lib/forEachUsersPaged.ts
import * as admin from "firebase-admin";

type UserDoc = admin.firestore.QueryDocumentSnapshot<admin.firestore.DocumentData>;

export async function forEachUsersPaged(
  db: admin.firestore.Firestore,
  opts: {
    pageSize?: number;               // default 200
    fields?: string[];               // ex.: ["lastDailyYMD","nextCheckinYMD"]
    where?: [string, FirebaseFirestore.WhereFilterOp, any][]; // opcional
    orderBy?: string;                // default "__name__"
    handler: (doc: UserDoc) => Promise<void>;
  }
) {
  const pageSize = opts.pageSize ?? 200;
  let q: FirebaseFirestore.Query = db.collection("users");

  if (opts.fields && opts.fields.length) {
    // Projeção (Admin SDK suporta select)
    // @ts-ignore
    q = (q as any).select(...opts.fields);
  }

  if (opts.where) {
    for (const w of opts.where) q = q.where(w[0], w[1], w[2]);
  }

  q = q.orderBy(opts.orderBy ?? "__name__");

  let last: FirebaseFirestore.QueryDocumentSnapshot | undefined;
  while (true) {
    let page = q.limit(pageSize);
    if (last) page = page.startAfter(last);

    const snap = await page.get();
    if (snap.empty) break;

    for (const doc of snap.docs) {
      await opts.handler(doc);
    }

    last = snap.docs[snap.docs.length - 1];
    if (snap.size < pageSize) break;
  }
}
