import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { AlertTriangleIcon, CheckIcon, XIcon } from "./Icons";

type ToastKind = "success" | "error" | "info";

type Toast = {
  id: number;
  kind: ToastKind;
  message: string;
};

type ToastContextValue = {
  pushToast: (message: string, kind?: ToastKind) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const removeToast = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const pushToast = useCallback((message: string, kind: ToastKind = "info") => {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    setToasts((current) => [...current, { id, kind, message }].slice(-4));
    window.setTimeout(() => removeToast(id), 4200);
  }, [removeToast]);

  const value = useMemo(() => ({ pushToast }), [pushToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toastRegion" aria-live="polite" aria-relevant="additions">
        {toasts.map((toast) => (
          <div className={`toast toast-${toast.kind}`} key={toast.id}>
            {toast.kind === "success" ? <CheckIcon /> : <AlertTriangleIcon />}
            <span>{toast.message}</span>
            <button
              aria-label="Dismiss notification"
              className="toastClose"
              onClick={() => removeToast(toast.id)}
              type="button"
            >
              <XIcon size={16} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const value = useContext(ToastContext);
  if (!value) throw new Error("useToast must be used inside ToastProvider.");
  return value;
}

type ConfirmOptions = {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
};

type ConfirmState = ConfirmOptions & {
  resolve: (confirmed: boolean) => void;
};

type ConfirmContextValue = {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
};

const ConfirmContext = createContext<ConfirmContextValue | null>(null);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<ConfirmState | null>(null);

  const confirm = useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      setPending({ ...options, resolve });
    });
  }, []);

  const finish = useCallback((confirmed: boolean) => {
    setPending((current) => {
      current?.resolve(confirmed);
      return null;
    });
  }, []);

  const value = useMemo(() => ({ confirm }), [confirm]);

  return (
    <ConfirmContext.Provider value={value}>
      {children}
      {pending && (
        <div className="confirmOverlay" role="presentation">
          <div
            aria-describedby="confirmDialogMessage"
            aria-labelledby="confirmDialogTitle"
            aria-modal="true"
            className="confirmDialog"
            role="dialog"
          >
            <div className="confirmIcon">
              <AlertTriangleIcon />
            </div>
            <div>
              <h2 id="confirmDialogTitle">{pending.title}</h2>
              <p id="confirmDialogMessage">{pending.message}</p>
              <div className="confirmActions">
                <button className="uiBtn" onClick={() => finish(false)} type="button">
                  {pending.cancelLabel ?? "Cancel"}
                </button>
                <button
                  className={`uiBtn ${pending.danger ? "uiBtnDanger" : "uiBtnPrimary"}`}
                  onClick={() => finish(true)}
                  type="button"
                >
                  {pending.confirmLabel ?? "Confirm"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const value = useContext(ConfirmContext);
  if (!value) throw new Error("useConfirm must be used inside ConfirmProvider.");
  return value;
}

type TextPromptOptions = {
  title: string;
  message: string;
  placeholder?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  required?: boolean;
};

type TextPromptState = TextPromptOptions & {
  resolve: (value: string | null) => void;
};

type TextPromptContextValue = {
  requestText: (options: TextPromptOptions) => Promise<string | null>;
};

const TextPromptContext = createContext<TextPromptContextValue | null>(null);

export function TextPromptProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<TextPromptState | null>(null);
  const [value, setValue] = useState("");

  const requestText = useCallback((options: TextPromptOptions) => {
    return new Promise<string | null>((resolve) => {
      setValue("");
      setPending({ ...options, resolve });
    });
  }, []);

  const finish = useCallback((result: string | null) => {
    setPending((current) => {
      current?.resolve(result);
      return null;
    });
  }, []);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!pending) return;
    const trimmed = value.trim();
    if (pending.required && !trimmed) return;
    finish(trimmed);
  }

  const contextValue = useMemo(() => ({ requestText }), [requestText]);

  return (
    <TextPromptContext.Provider value={contextValue}>
      {children}
      {pending && (
        <div className="confirmOverlay" role="presentation">
          <form
            aria-describedby="textPromptMessage"
            aria-labelledby="textPromptTitle"
            aria-modal="true"
            className="confirmDialog textPromptDialog"
            onSubmit={submit}
            role="dialog"
          >
            <div className="confirmIcon">
              <AlertTriangleIcon />
            </div>
            <div>
              <h2 id="textPromptTitle">{pending.title}</h2>
              <p id="textPromptMessage">{pending.message}</p>
              <input
                autoFocus
                className="textPromptInput"
                onChange={(event) => setValue(event.target.value)}
                placeholder={pending.placeholder}
                value={value}
              />
              <div className="confirmActions">
                <button className="uiBtn" onClick={() => finish(null)} type="button">
                  {pending.cancelLabel ?? "Cancel"}
                </button>
                <button className="uiBtn uiBtnPrimary" type="submit">
                  {pending.confirmLabel ?? "Submit"}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}
    </TextPromptContext.Provider>
  );
}

export function useTextPrompt() {
  const value = useContext(TextPromptContext);
  if (!value) throw new Error("useTextPrompt must be used inside TextPromptProvider.");
  return value;
}

export function SkeletonBlock({ className = "", rows = 1 }: { className?: string; rows?: number }) {
  return (
    <div className={`skeletonStack ${className}`} aria-hidden="true">
      {Array.from({ length: rows }, (_, index) => (
        <span className="skeletonLine" key={index} />
      ))}
    </div>
  );
}

export function EmptyState({
  title,
  message,
  actionLabel,
  onAction,
}: {
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="emptyState">
      <div className="emptyStateTitle">{title}</div>
      <div className="emptyStateMessage">{message}</div>
      {actionLabel && onAction && (
        <button className="uiBtn uiBtnPrimary" onClick={onAction} type="button">
          {actionLabel}
        </button>
      )}
    </div>
  );
}

export function CoverFallback({ label = "No image" }: { label?: string }) {
  return (
    <span className="coverFallback">
      <span>{label}</span>
    </span>
  );
}
