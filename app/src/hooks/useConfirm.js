import { useState, useCallback } from "react";

// Promise-based confirm dialog. App renders one ConfirmModal from `dialog`
// state and passes `confirm` down (to useFileActions and via LayoutContext).
// Call sites keep their control flow: `if (!(await confirm(...))) return;`.
//
// confirm accepts a message string or an options object
// { message, title, confirmLabel, danger }, and resolves to true/false.
export function useConfirmDialog() {
  const [dialog, setDialog] = useState(null); // { opts, resolve } | null

  const confirm = useCallback((arg) => {
    const opts = typeof arg === "string" ? { message: arg } : (arg || {});
    return new Promise((resolve) => setDialog({ opts, resolve }));
  }, []);

  const settle = (result) =>
    setDialog((d) => { d?.resolve(result); return null; });

  return {
    confirm,
    confirmDialog: dialog,
    onConfirm: () => settle(true),
    onCancel: () => settle(false),
  };
}
