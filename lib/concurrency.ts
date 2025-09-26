// lib/concurrency.ts
export async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const ret: R[] = [];
  let i = 0;
  let running = 0;
  let resolve!: (v: R[]) => void;
  let reject!: (e: any) => void;

  const done = new Promise<R[]>((res, rej) => (resolve = res, reject = rej));

  const next = () => {
    if (i >= items.length && running === 0) return resolve(ret);
    while (running < limit && i < items.length) {
      const idx = i++;
      running++;
      worker(items[idx], idx)
        .then((r) => { ret[idx] = r as any; running--; next(); })
        .catch((e) => { reject(e); });
    }
  };

  next();
  return done;
}
