import { useState, useRef, useCallback } from "react";

// Toast queue: push/update/dismiss with auto-expiry. `toast` is the
// convenience API (toast.success/error/info/loading/update/dismiss); the
// ToastStack renders `toasts` and calls `dismissToast`.
export function useToasts() {
  const [toasts, setToasts] = useState([]);
  const toastSeq = useRef(0);

  const dismissToast = useCallback((id) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  const pushToast = useCallback((message, type = "info", opts = {}) => {
    const id = ++toastSeq.current;
    setToasts((t) => [...t, { id, message, type, action: opts.action, progress: opts.progress ?? null }]);
    if (type !== "loading") setTimeout(() => dismissToast(id), opts.duration || 5000);
    return id;
  }, [dismissToast]);

  const updateToast = useCallback((id, message, type, opts = {}) => {
    setToasts((t) => t.map((x) => (x.id === id ? { ...x, message, type, action: opts.action, progress: opts.progress ?? null } : x)));
    if (type !== "loading") setTimeout(() => dismissToast(id), opts.duration || 5000);
  }, [dismissToast]);

  const toast = {
    success: (m, o) => pushToast(m, "success", o),
    error: (m, o) => pushToast(m, "error", o),
    info: (m, o) => pushToast(m, "info", o),
    loading: (m, o) => pushToast(m, "loading", o),
    update: updateToast,
    dismiss: dismissToast,
  };

  return { toasts, dismissToast, pushToast, toast };
}
