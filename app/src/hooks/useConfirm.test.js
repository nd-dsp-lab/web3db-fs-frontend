import { renderHook, act } from "@testing-library/react";
import { useConfirmDialog } from "./useConfirm";

// useConfirmDialog turns a modal into a promise: confirm(...) opens the dialog
// and resolves true/false when the user answers. Call sites do
// `if (!(await confirm(...))) return;`.

test("confirm opens the dialog and resolves true on confirm", async () => {
  const { result } = renderHook(() => useConfirmDialog());

  let answered;
  act(() => { result.current.confirm({ message: "Delete?" }).then((r) => { answered = r; }); });

  expect(result.current.confirmDialog.opts).toEqual({ message: "Delete?" });

  await act(async () => { result.current.onConfirm(); });
  expect(answered).toBe(true);
  expect(result.current.confirmDialog).toBeNull();
});

test("cancel resolves false and closes the dialog", async () => {
  const { result } = renderHook(() => useConfirmDialog());

  let answered;
  act(() => { result.current.confirm("Sure?").then((r) => { answered = r; }); });

  await act(async () => { result.current.onCancel(); });
  expect(answered).toBe(false);
  expect(result.current.confirmDialog).toBeNull();
});

test("a string argument is normalized to a message option", () => {
  const { result } = renderHook(() => useConfirmDialog());
  act(() => { result.current.confirm("Just a string"); });

  expect(result.current.confirmDialog.opts).toEqual({ message: "Just a string" });
});
