import { buildPaginationResult } from "@/lib/pagination";
import { decodeCursor } from "@/lib/api-helpers";

function makeItems(count: number) {
  const base = new Date("2024-01-01T00:00:00Z");
  return Array.from({ length: count }, (_, i) => ({
    _id: `id-${String(i).padStart(4, "0")}`,
    updatedAt: new Date(base.getTime() - i * 1000),
    title: `Task ${i}`,
  }));
}

describe("buildPaginationResult", () => {
  it("returns all items and null nextCursor when items <= limit", () => {
    const items = makeItems(5);
    const result = buildPaginationResult(items, 10);

    expect(result.items).toHaveLength(5);
    expect(result.nextCursor).toBeNull();
  });

  it("returns items sliced to limit when items > limit", () => {
    const items = makeItems(21); // limit+1 pattern
    const result = buildPaginationResult(items, 20);

    expect(result.items).toHaveLength(20);
    expect(result.nextCursor).not.toBeNull();
  });

  it("encodes the last item's _id and updatedAt into the cursor", () => {
    const items = makeItems(11);
    const { items: sliced, nextCursor } = buildPaginationResult(items, 10);

    const last = sliced[sliced.length - 1];
    const decoded = decodeCursor(nextCursor!);

    expect(decoded._id).toBe(last._id);
    expect(decoded.updatedAt).toBe(last.updatedAt.toISOString());
  });

  it("cursor from page 1 can be used to filter page 2 correctly", () => {
    const allItems = makeItems(30);

    // Simulate page 1: fetch 21, slice to 20
    const page1 = buildPaginationResult(allItems.slice(0, 21), 20);
    expect(page1.items).toHaveLength(20);
    expect(page1.nextCursor).not.toBeNull();

    const cursor = decodeCursor(page1.nextCursor!);
    const lastOnPage1 = page1.items[page1.items.length - 1];

    expect(cursor._id).toBe(lastOnPage1._id);
    expect(cursor.updatedAt).toBe(lastOnPage1.updatedAt.toISOString());

    // Page 2 would use $lt on updatedAt or combo — verify cursor points to correct boundary
    const page2Items = allItems.slice(20);
    expect(page2Items[0].updatedAt.getTime()).toBeLessThan(lastOnPage1.updatedAt.getTime());
  });

  it("returns empty items and null cursor for empty input", () => {
    const result = buildPaginationResult([], 10);
    expect(result.items).toHaveLength(0);
    expect(result.nextCursor).toBeNull();
  });

  it("cursor is base64url encoded (no padding characters)", () => {
    const items = makeItems(11);
    const { nextCursor } = buildPaginationResult(items, 10);
    // base64url must not contain + or /
    expect(nextCursor).not.toMatch(/[+/=]/);
  });
});
