import { describe, expect, it } from "vitest";
import { parseMeasurements, understand } from "@/lib/assistant-intents";

const intent = (t: string) => understand(t).intent;

describe("assistant intents", () => {
  it("tracks orders from common phrasings and order numbers", () => {
    expect(intent("where is my order")).toBe("track");
    expect(intent("Where's my parcel??")).toBe("track");
    expect(intent("my order not yet delivered")).toBe("track");
    expect(understand("status of MG261009AB12 please")).toMatchObject({ intent: "track", orderNumber: "MG261009AB12" });
    expect(understand("mg261009ab12").orderNumber).toBe("MG261009AB12");
  });

  it("puts returns ahead of tracking", () => {
    expect(intent("I want to return my order")).toBe("returns");
    expect(intent("exchange for a bigger size")).toBe("returns");
    expect(intent("received damaged saree")).toBe("returns");
    expect(understand("refund for MG261009AB12").intent).toBe("returns");
  });

  it("understands delivery, payment, care and people", () => {
    expect(intent("how long does delivery take to London")).toBe("delivery");
    expect(intent("will I pay customs duties in the UK")).toBe("delivery");
    expect(intent("do you have cash on delivery")).toBe("payment");
    expect(intent("can I pay with UPI")).toBe("payment");
    expect(intent("how do I wash a silk saree")).toBe("care");
    expect(intent("can I talk to a person")).toBe("human");
    expect(intent("whatsapp number?")).toBe("human");
  });

  it("treats product requests as shopping, even with wedding or sale words", () => {
    expect(intent("red silk saree under 15000")).toBe("shop");
    expect(intent("kanjivaram saree for wedding")).toBe("shop");
    expect(intent("cotton kurti")).toBe("shop");
    expect(intent("bridal consultation")).toBe("bridal");
    expect(intent("any discount codes?")).toBe("offers");
  });

  it("greets, thanks and admits when it doesn't know", () => {
    expect(intent("hi")).toBe("greet");
    expect(intent("Namaste")).toBe("greet");
    expect(intent("thanks!")).toBe("thanks");
    expect(intent("what is the meaning of life")).toBe("unknown");
  });

  it("reads measurements", () => {
    expect(parseMeasurements("bust 36 waist 30")).toEqual({ bust: 36, waist: 30, hip: undefined, unit: "in" });
    expect(parseMeasurements("my bust is 91 cm")).toEqual({ bust: 91, waist: undefined, hip: undefined, unit: "cm" });
    expect(parseMeasurements("38")).toEqual({ bust: 38, waist: undefined, hip: undefined, unit: "in" });
    expect(parseMeasurements("hello")).toBeUndefined();
    expect(intent("bust 36")).toBe("size");
    expect(intent("what size should I order")).toBe("size");
  });
});
