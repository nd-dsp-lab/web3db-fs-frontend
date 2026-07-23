import { previewKind } from "./PreviewModal";

// A missing extension here fails silently: the modal shows "No preview
// available" with no error anywhere, which is how .tsv went unnoticed.

test.each([
  ["photo.png", "image"],
  ["photo.JPG", "image"],       // extension matching is case-insensitive
  ["scan.pdf", "pdf"],
  ["clip.mp4", "video"],
  ["song.mp3", "audio"],
  ["notes.txt", "text"],
  ["data.csv", "text"],
  ["data.tsv", "text"],         // regression: was "none", showed no preview
  ["settings.ini", "text"],
  ["nginx.conf", "text"],
  ["archive.zip", "none"],
  ["report.docx", "none"],      // no client-side renderer for Office docs
])("%s previews as %s", (filename, kind) => {
  expect(previewKind(filename)).toBe(kind);
});

test("a served MIME type wins over an unknown extension", () => {
  expect(previewKind("data.weird", "text/plain")).toBe("text");
  expect(previewKind("data.weird", "image/png")).toBe("image");
});

test("a file with no extension is not previewed", () => {
  expect(previewKind("README")).toBe("none");
});

test("every spreadsheet-ish text extension is previewable", () => {
  // csv and tsv are handled identically everywhere else (icon, thumbnail),
  // so they must not diverge here.
  expect(previewKind("a.csv")).toBe(previewKind("a.tsv"));
});
