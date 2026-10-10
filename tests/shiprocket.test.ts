import { describe, expect, it } from "vitest";
import { shiprocketCode } from "@/lib/shiprocket";

describe("shiprocketCode", () => {
  it("maps Shiprocket statuses onto our tracking codes", () => {
    expect(shiprocketCode("PICKED UP")).toBe("picked_up");
    expect(shiprocketCode("In Transit")).toBe("in_transit");
    expect(shiprocketCode("REACHED AT DESTINATION HUB")).toBe("reached_hub");
    expect(shiprocketCode("OUT FOR DELIVERY")).toBe("out_for_delivery");
    expect(shiprocketCode("UNDELIVERED")).toBe("delivery_attempted");
    expect(shiprocketCode("DELIVERED")).toBe("delivered");
  });
  it("never treats a return-to-origin as delivered to the customer", () => {
    expect(shiprocketCode("RTO INITIATED")).toBe("rto");
    expect(shiprocketCode("RTO DELIVERED")).toBe("rto_delivered");
  });
  it("ignores statuses we don't show", () => {
    expect(shiprocketCode("NEW")).toBeNull();
    expect(shiprocketCode("")).toBeNull();
  });
});
