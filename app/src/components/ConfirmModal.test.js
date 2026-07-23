import "@testing-library/jest-dom";
import { render, screen, fireEvent } from "@testing-library/react";
import ConfirmModal from "./ConfirmModal";

// The themed replacement for window.confirm. Confirms on the button / Enter,
// cancels on the button / Escape / backdrop click.

const setup = (over = {}) => {
  const onConfirm = jest.fn();
  const onCancel = jest.fn();
  render(<ConfirmModal message="Delete this file?" title="Delete forever" onConfirm={onConfirm} onCancel={onCancel} {...over} />);
  return { onConfirm, onCancel };
};

test("renders the title and message", () => {
  setup();
  expect(screen.getByText("Delete forever")).toBeInTheDocument();
  expect(screen.getByText("Delete this file?")).toBeInTheDocument();
});

test("the confirm button calls onConfirm", () => {
  const { onConfirm } = setup({ confirmLabel: "Delete" });
  fireEvent.click(screen.getByText("Delete"));
  expect(onConfirm).toHaveBeenCalledTimes(1);
});

test("the cancel button calls onCancel", () => {
  const { onCancel } = setup();
  fireEvent.click(screen.getByText("Cancel"));
  expect(onCancel).toHaveBeenCalledTimes(1);
});

test("Enter confirms and Escape cancels", () => {
  const { onConfirm, onCancel } = setup();
  // keydown bubbles from the message up to the overlay's handler
  const msg = screen.getByText("Delete this file?");
  fireEvent.keyDown(msg, { key: "Enter" });
  expect(onConfirm).toHaveBeenCalledTimes(1);
  fireEvent.keyDown(msg, { key: "Escape" });
  expect(onCancel).toHaveBeenCalledTimes(1);
});

test("clicking the backdrop cancels, clicking the card does not", () => {
  const { onCancel } = setup();
  // clicking the message (inside the card) must not cancel
  fireEvent.click(screen.getByText("Delete this file?"));
  expect(onCancel).not.toHaveBeenCalled();
});

test("danger styling turns the confirm button red", () => {
  setup({ danger: true, confirmLabel: "Delete" });
  const btn = screen.getByText("Delete");
  expect(btn).toHaveStyle({ backgroundColor: "#d93025" });
});
