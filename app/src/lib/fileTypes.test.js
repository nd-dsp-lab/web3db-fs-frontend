import { Image as ImageIcon, Video, FileText, File as FileIcon } from "lucide-react";
import { fileVisual, hasThumbnailFor, formatBytes } from "./fileTypes";

describe("fileVisual", () => {
  test("maps extensions to the expected icon", () => {
    expect(fileVisual("photo.PNG").Icon).toBe(ImageIcon);
    expect(fileVisual("clip.mp4").Icon).toBe(Video);
    expect(fileVisual("report.pdf").Icon).toBe(FileText);
  });

  test("unknown extension falls back to the generic file icon", () => {
    expect(fileVisual("mystery.xyz").Icon).toBe(FileIcon);
    expect(fileVisual("noext").Icon).toBe(FileIcon);
  });

  test("is case-insensitive", () => {
    expect(fileVisual("a.JPG").color).toBe(fileVisual("a.jpg").color);
  });
});

describe("hasThumbnailFor", () => {
  test("true for supported types, false otherwise", () => {
    expect(hasThumbnailFor("a.png")).toBe(true);
    expect(hasThumbnailFor("a.PDF")).toBe(true);
    expect(hasThumbnailFor("a.py")).toBe(true);
    expect(hasThumbnailFor("a.mp4")).toBe(false);
    expect(hasThumbnailFor("a.zip")).toBe(false);
    expect(hasThumbnailFor("")).toBe(false);
  });
});

describe("formatBytes", () => {
  test("zero / falsy", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(undefined)).toBe("0 B");
  });

  test("bytes are whole numbers", () => {
    expect(formatBytes(512)).toBe("512 B");
  });

  test("sub-10 values keep one decimal, >=10 round", () => {
    expect(formatBytes(1024)).toBe("1.0 KB");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(10 * 1024)).toBe("10 KB");
  });

  test("scales through units", () => {
    expect(formatBytes(1024 ** 2)).toBe("1.0 MB");
    expect(formatBytes(1024 ** 3)).toBe("1.0 GB");
  });
});

test("tsv is treated exactly like csv", () => {
  // Regression: tsv was missing from the spreadsheet icons and the thumbnail
  // list, so .tsv files got a generic icon and no thumbnail.
  expect(fileVisual("a.tsv").color).toBe(fileVisual("a.csv").color);
  expect(hasThumbnailFor("a.tsv")).toBe(hasThumbnailFor("a.csv"));
});
