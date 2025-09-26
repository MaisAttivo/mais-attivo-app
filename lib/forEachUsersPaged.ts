// lib/forEachUsersPaged.ts
import * as admin from "firebase-admin";
type QDoc = FirebaseFirestore.QueryDocumentSnapshot<FirebaseFirestore.DocumentData>;

export async function forEachUsersPaged(
  db: admin.firestore.Firestore,
  opts: {
    pageSize?: number; fields?: string[];
    where?: [string, FirebaseFirestore.WhereFilterOp, any][];
    orderBy?: string;
    handler: (doc: QDoc) => Promise<void>;
  }
) {
  const pageSize = opts.pageSize ?? 200;
  let q: FirebaseFirestore.Query = db.collection("users");
  if (opts.fields?.length) (q as any) = (q as any).select(...opts.fields);
  if (opts.where) for (const w of opts.where) q = q.where(w[0], w[1], w[2]);
  q = q.orderBy(opts.orderBy ?? "__name__");

  let last: QDoc | undefined;
  while (true) {
    let page = q.limit(pageSize);
    if (last) page = page.startAfter(last);

    const snap = await page.get();
    if (snap.empty) break;

    for (const doc of snap.docs) await opts.handler(doc);
    last = snap.docs[snap.docs.length - 1];
    if (snap.size < pageSize) break;
  }
}
