import { mergePendingUploads, pendingUploadRow } from "./usePendingUploads";

const row = (over = {}) => pendingUploadRow({
  cid: "c1", filename: "a.pdf", fullPath: "docs/a.pdf", fileFormat: "pdf",
  size: 12, owner: "0xME", ...over,
});

describe("pendingUploadRow", () => {
  test("reads the folder out of the full path, like the listing endpoint does", () => {
    expect(row()).toMatchObject({
      cid: "c1", filename: "a.pdf", folder_path: "/docs", file_format: "pdf",
      size: 12, owner: "0xME", is_owner: true, pending: true,
    });
  });

  test("a file at the root gets the root folder", () => {
    expect(row({ fullPath: "a.pdf" }).folder_path).toBe("/");
    expect(row({ fullPath: "/a.pdf" }).folder_path).toBe("/");
  });

  test("nothing is claimed on the chain's behalf", () => {
    // Permissions and shares don't exist until the transaction mines, so the
    // row must not imply any — the views read these to label sharing.
    expect(row()).toMatchObject({ permissions: 0, shared_with: [], ipfs_url: "" });
  });

  test("timestamp is set so the row sorts where the mined file will", () => {
    const now = Math.floor(Date.now() / 1000);
    expect(row().timestamp).toBeGreaterThanOrEqual(now - 1);
  });
});

describe("mergePendingUploads", () => {
  const chain = [{ cid: "onchain", filename: "b.pdf" }];

  test("with nothing pending the fetched list passes through untouched", () => {
    expect(mergePendingUploads(chain, [])).toBe(chain);
  });

  test("pending rows are appended after the fetched ones", () => {
    expect(mergePendingUploads(chain, [row()]).map((f) => f.cid)).toEqual(["onchain", "c1"]);
  });

  test("a pending row drops out once the chain reports the same CID", () => {
    // This is what retires a pending row: the refresh after its receipt brings
    // the file back with the same CID, so no explicit cleanup has to race it.
    const merged = mergePendingUploads([...chain, { cid: "c1", filename: "a.pdf" }], [row()]);
    expect(merged.filter((f) => f.cid === "c1")).toHaveLength(1);
    expect(merged.find((f) => f.cid === "c1").pending).toBeUndefined();
  });
});
