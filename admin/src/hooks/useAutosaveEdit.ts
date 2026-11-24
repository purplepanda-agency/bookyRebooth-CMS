import { useEffect, useRef, useState } from "react";
import { useSaveNotice } from "../components/SaveNotice";

type UseAutosaveEditOptions<TBody> = {
  editingId: string | null;
  /** Any value that changes when the draft form changes (usually `form`). */
  deps: unknown;
  /** Return null while the draft is incomplete or invalid. */
  buildBody: () => TBody | null;
  save: (id: string, body: TBody) => Promise<void>;
  onError: (message: string | null) => void;
  debounceMs?: number;
};

export function useAutosaveEdit<TBody>({
  editingId,
  deps,
  buildBody,
  save,
  onError,
  debounceMs = 300,
}: UseAutosaveEditOptions<TBody>) {
  const { markSaved } = useSaveNotice();
  const [saving, setSaving] = useState(false);
  const savedByIdRef = useRef(new Map<string, string>());
  const timerRef = useRef<number | null>(null);
  const pendingRef = useRef<{
    id: string;
    snapshot: string;
    body: TBody;
  } | null>(null);
  const chainRef = useRef(Promise.resolve());
  const editingIdRef = useRef(editingId);
  const buildBodyRef = useRef(buildBody);
  const saveRef = useRef(save);
  const onErrorRef = useRef(onError);

  editingIdRef.current = editingId;
  buildBodyRef.current = buildBody;
  saveRef.current = save;
  onErrorRef.current = onError;

  function enqueue(id: string, body: TBody, snapshot: string) {
    chainRef.current = chainRef.current
      .then(async () => {
        if (savedByIdRef.current.get(id) === snapshot) return;
        setSaving(true);
        try {
          await saveRef.current(id, body);
          savedByIdRef.current.set(id, snapshot);
          onErrorRef.current(null);
          markSaved();
        } catch (err) {
          onErrorRef.current(
            err instanceof Error ? err.message : "Opslaan mislukt",
          );
        } finally {
          setSaving(false);
        }
      })
      .catch(() => undefined);
  }

  function schedule(id: string, body: TBody, snapshot: string) {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    pendingRef.current = { id, snapshot, body };
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      pendingRef.current = null;
      enqueue(id, body, snapshot);
    }, debounceMs);
  }

  function flush() {
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const id = editingIdRef.current;
    if (!id) {
      pendingRef.current = null;
      return;
    }
    const body = buildBodyRef.current();
    if (body) {
      pendingRef.current = null;
      const snapshot = JSON.stringify(body);
      if (savedByIdRef.current.get(id) !== snapshot) {
        enqueue(id, body, snapshot);
      }
      return;
    }
    const pending = pendingRef.current;
    pendingRef.current = null;
    if (
      pending &&
      savedByIdRef.current.get(pending.id) !== pending.snapshot
    ) {
      enqueue(pending.id, pending.body, pending.snapshot);
    }
  }

  function rememberBaseline(id: string, body: TBody | null | undefined) {
    if (!body) return;
    savedByIdRef.current.set(id, JSON.stringify(body));
  }

  useEffect(() => {
    if (!editingId) return;
    const body = buildBody();
    if (!body) return;
    const snapshot = JSON.stringify(body);
    if (savedByIdRef.current.get(editingId) === snapshot) {
      pendingRef.current = null;
      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      return;
    }
    schedule(editingId, body, snapshot);
    // buildBody closes over the latest form via deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingId, deps]);

  useEffect(
    () => () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    },
    [],
  );

  return { saving, flush, rememberBaseline };
}
