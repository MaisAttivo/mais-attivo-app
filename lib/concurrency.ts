// lib/concurrency.ts
export async function mapLimit<T>(
  items: readonly T[],
  limit: number,
  worker: (item: T, index: number) => Promise<void>
) {
  let i = 0, run = 0;
  return new Promise<void>((resolve, reject) => {
    const next = () => {
      if (i >= items.length && run === 0) return resolve();
      while (run < limit && i < items.length) {
        const idx = i++;
        run++;
        worker(items[idx], idx).then(() => { run--; next(); }).catch(reject);
      }
    };
    next();
  });
}
