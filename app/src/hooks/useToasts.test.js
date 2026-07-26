import { renderHook, act } from "@testing-library/react";
import { useToasts } from "./useToasts";

// useToasts is the toast queue behind the `toast.*` convenience API. Non-loading
// toasts auto-expire on a timer, so these tests drive time with fake timers.

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

test("toast.success pushes a toast and auto-dismisses it after the default delay", () => {
  const { result } = renderHook(() => useToasts());

  act(() => { result.current.toast.success("Saved"); });
  expect(result.current.toasts).toEqual([
    { id: 1, message: "Saved", type: "success", action: undefined, progress: null },
  ]);

  act(() => { vi.advanceTimersByTime(5000); });
  expect(result.current.toasts).toEqual([]);
});

test("each toast.* helper tags its own type and ids increment", () => {
  const { result } = renderHook(() => useToasts());

  act(() => {
    result.current.toast.error("Nope");
    result.current.toast.info("FYI");
    result.current.toast.loading("Uploading");
  });

  expect(result.current.toasts.map((t) => [t.id, t.type])).toEqual([
    [1, "error"], [2, "info"], [3, "loading"],
  ]);
});

test("a loading toast stays until it is updated to a settled type", () => {
  const { result } = renderHook(() => useToasts());

  let id;
  act(() => { id = result.current.toast.loading("Uploading", { progress: 0 }); });

  act(() => { vi.advanceTimersByTime(60000); });
  expect(result.current.toasts).toHaveLength(1);

  act(() => { result.current.toast.update(id, "Done", "success"); });
  expect(result.current.toasts[0]).toMatchObject({ id, message: "Done", type: "success", progress: null });

  act(() => { vi.advanceTimersByTime(5000); });
  expect(result.current.toasts).toEqual([]);
});

test("update carries action and progress, and honours a custom duration", () => {
  const { result } = renderHook(() => useToasts());
  const action = { label: "Undo", onClick: vi.fn() };

  let id;
  act(() => { id = result.current.toast.loading("Working"); });
  act(() => { result.current.toast.update(id, "Deleted", "info", { action, progress: 42, duration: 1000 }); });

  expect(result.current.toasts[0]).toMatchObject({ message: "Deleted", action, progress: 42 });

  act(() => { vi.advanceTimersByTime(1000); });
  expect(result.current.toasts).toEqual([]);
});

test("dismiss removes only the targeted toast", () => {
  const { result } = renderHook(() => useToasts());

  let keep;
  act(() => {
    keep = result.current.toast.loading("Keep me");
    result.current.toast.loading("Drop me");
  });

  act(() => { result.current.toast.dismiss(result.current.toasts[1].id); });
  expect(result.current.toasts.map((t) => t.id)).toEqual([keep]);
});
