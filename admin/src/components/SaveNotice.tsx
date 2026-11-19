import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

const SaveNoticeContext = createContext<() => void>(() => {});

export function SaveNoticeProvider({ children }: { children: ReactNode }) {
  const [visible, setVisible] = useState(false);
  const timer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (timer.current) window.clearTimeout(timer.current);
    },
    [],
  );

  const notify = useCallback(() => {
    setVisible(true);
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setVisible(false), 2400);
  }, []);

  return (
    <SaveNoticeContext.Provider value={notify}>
      {children}
      {visible ? (
        <div className="save-toast" role="status">
          Opgeslagen
        </div>
      ) : null}
    </SaveNoticeContext.Provider>
  );
}

export function useSaveNotice() {
  const notify = useContext(SaveNoticeContext);
  const [savedKey, setSavedKey] = useState<string | null>(null);
  const timer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (timer.current) window.clearTimeout(timer.current);
    },
    [],
  );

  const markSaved = useCallback(
    (key = "saved") => {
      notify();
      setSavedKey(key);
      if (timer.current) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setSavedKey(null), 2400);
    },
    [notify],
  );

  return { savedKey, markSaved };
}

export function SaveButton({
  saving,
  saved = false,
  disabled = false,
  label = "Opslaan",
  className = "",
  type = "submit",
  onClick,
}: {
  saving: boolean;
  saved?: boolean;
  disabled?: boolean;
  label?: string;
  className?: string;
  type?: "submit" | "button";
  onClick?: () => void;
}) {
  const confirmed = saved && !saving;
  const text = saving ? "Opslaan…" : confirmed ? "Opgeslagen" : label;

  return (
    <button
      type={type}
      className={`btn btn-save${className ? ` ${className}` : ""}${confirmed ? " is-saved" : ""}`}
      disabled={disabled || saving}
      aria-live="polite"
      onClick={onClick}
    >
      {text}
    </button>
  );
}
