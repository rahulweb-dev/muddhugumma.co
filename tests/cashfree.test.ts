import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { verifyCashfreeWebhook } from "@/lib/cashfree";

const SECRET = "cfsk_test_secret";
const sign = (ts: string, body: string, secret = SECRET) => createHmac("sha256", secret).update(ts + body).digest("base64");

describe("verifyCashfreeWebhook", () => {
  const before = process.env.CASHFREE_SECRET_KEY;
  beforeEach(() => {
    process.env.CASHFREE_SECRET_KEY = SECRET;
  });
  afterEach(() => {
    process.env.CASHFREE_SECRET_KEY = before;
  });

  const body = JSON.stringify({ type: "PAYMENT_SUCCESS_WEBHOOK", data: { order: { order_id: "MG251009ABCD" } } });

  it("accepts a correctly signed, fresh webhook (millisecond timestamp)", () => {
    const ts = String(Date.now());
    expect(verifyCashfreeWebhook(body, sign(ts, body), ts)).toBe(true);
  });

  it("accepts a timestamp in seconds", () => {
    const ts = String(Math.floor(Date.now() / 1000));
    expect(verifyCashfreeWebhook(body, sign(ts, body), ts)).toBe(true);
  });

  it("rejects a tampered body, wrong secret, stale timestamp or missing headers", () => {
    const ts = String(Date.now());
    expect(verifyCashfreeWebhook(body.replace("ABCD", "WXYZ"), sign(ts, body), ts)).toBe(false);
    expect(verifyCashfreeWebhook(body, sign(ts, body, "other"), ts)).toBe(false);
    const old = String(Date.now() - 60 * 60 * 1000);
    expect(verifyCashfreeWebhook(body, sign(old, body), old)).toBe(false);
    expect(verifyCashfreeWebhook(body, null, ts)).toBe(false);
    expect(verifyCashfreeWebhook(body, sign(ts, body), null)).toBe(false);
  });
});
