import { describe, expect, it } from "vitest";
import { saveUpload } from "@/server/media";
import { makeCustomer, PNG_1X1 } from "./helpers";

describe("bildeopplasting", () => {
  it("godtar ekte PNG", async () => {
    const c = await makeCustomer("Bilde AS");
    const r = await saveUpload(c.id, PNG_1X1, "test.png");
    expect(r.ok).toBe(true);
  });
  it("avviser SVG, tekst forkledd som bilde og tom fil", async () => {
    const c = await makeCustomer("Bilde2 AS");
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"></svg>');
    expect((await saveUpload(c.id, svg, "x.svg")).ok).toBe(false);
    expect((await saveUpload(c.id, Buffer.from("<script>alert(1)</script>"), "x.png")).ok).toBe(false);
    expect((await saveUpload(c.id, Buffer.alloc(0), "x.png")).ok).toBe(false);
  });
  it("avviser filer over 10 MB", async () => {
    const c = await makeCustomer("Bilde3 AS");
    const big = Buffer.concat([PNG_1X1, Buffer.alloc(10 * 1024 * 1024)]);
    const r = await saveUpload(c.id, big, "stor.png");
    expect(r.ok).toBe(false);
  });
});
