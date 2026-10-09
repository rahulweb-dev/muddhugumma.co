import { describe, expect, it } from "vitest";
import { esc, renderEmail } from "@/lib/email-layout";

describe("esc", () => {
  it("escapes HTML special characters", () => {
    expect(esc(`<script>alert("x")</script> & 'y'`)).toBe("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &#39;y&#39;");
  });
  it("leaves ordinary text and currency signs alone", () => {
    expect(esc("Priya's ₹4,999 / £59 order")).toBe("Priya&#39;s ₹4,999 / £59 order");
    expect(esc("Kanjeevaram silk")).toBe("Kanjeevaram silk");
  });
});

describe("renderEmail", () => {
  const out = renderEmail({
    preheader: "Your order is on its way",
    kicker: "Order MG1",
    heading: "Shipped <today>",
    body: "<p>Dear Priya,</p><p>Your saree is on its way.<br>Track it below.</p><ul><li>One</li><li>Two</li></ul>",
    cta: { label: "Track order", url: "https://example.com/track?o=1&x=2" },
    footnote: "Thank you for shopping with us.",
  });

  it("builds a plain-text version without tags", () => {
    expect(out.text).not.toMatch(/<\/?(p|br|ul|li|b|i|a)\b[^>]*>/i);
    expect(out.text).toContain("Order MG1");
    expect(out.text).toContain("Dear Priya,");
    expect(out.text).toContain("Your saree is on its way.\nTrack it below.");
    expect(out.text).toContain("One\nTwo");
    expect(out.text).toContain("Track order: https://example.com/track?o=1&x=2");
    expect(out.text).toContain("Thank you for shopping with us.");
  });
  it("orders the text kicker, heading, body, button, footnote", () => {
    const order = ["Order MG1", "Shipped", "Dear Priya", "Track order:", "Thank you for"].map((s) => out.text.indexOf(s));
    expect(order.every((n) => n >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(out.text).not.toMatch(/\n{3,}/);
  });
  it("escapes the heading and button link in the HTML", () => {
    expect(out.html).toContain("Shipped &lt;today&gt;");
    expect(out.html).not.toContain("Shipped <today>");
    expect(out.html).toContain("https://example.com/track?o=1&amp;x=2");
    expect(out.html).toContain("Your order is on its way");
  });
  it("skips optional parts when they are missing", () => {
    const m = renderEmail({ preheader: "p", heading: "Hello", body: "Body text" });
    expect(m.text).toBe("Hello\n\nBody text");
  });
});
