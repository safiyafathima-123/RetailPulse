import { useCallback, useEffect, useRef, useState } from "react";

export function useFetch<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const seq = useRef(0);

  const load = useCallback(async () => {
    const mine = ++seq.current;
    setLoading(true); setError(null);
    try {
      const result = await fnRef.current();
      if (mine === seq.current) setData(result);
    } catch (e) {
      if (mine === seq.current) setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      if (mine === seq.current) setLoading(false);
    }
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void load(); }, deps);
  return { data, error, loading, reload: load };
}
