import "server-only";
import { esc, siteUrl } from "../email-layout";
import type { ReturnDoc } from "../models";
import { REGION_CONFIG } from "../region";
import { courierName } from "../shipping";
import { box, build, codeBox, firstName, itemsTable, link, longDay, money, p, small, type Message } from "./shared";

/* Customer emails for return and exchange requests. */

const returnsUrl = () => siteUrl("/account/returns");

const METHOD: Record<ReturnDoc["refundMethod"], string> = {
  original: "your original payment method",
  store_credit: "store credit (a Muddhugumma gift card)",
  bank: "your bank account",
};

const items = (rt: ReturnDoc) =>
  itemsTable(
    rt.items.map((i) => ({
      name: i.name,
      image: i.image,
      size: i.size,
      qty: i.qty,
      note: i.kind === "exchange" ? `Exchange for size ${i.exchangeSize ?? ""}` : `Return · ${i.reason}`,
    })),
    rt.region
  );

const hasExchange = (rt: ReturnDoc) => rt.items.some((i) => i.kind === "exchange");
const allExchange = (rt: ReturnDoc) => rt.items.every((i) => i.kind === "exchange");
const label = (rt: ReturnDoc) => (allExchange(rt) ? "exchange" : hasExchange(rt) ? "return and exchange" : "return");

export type ReturnMessageContext = { name?: string; giftCardCode?: string; giftCardExpiry?: Date };

export function returnMessage(rt: ReturnDoc, ctx: ReturnMessageContext): Message | null {
  const r = rt.region;
  const name = firstName(ctx.name);
  const kind = label(rt);
  const ref = `<b>${esc(rt.number)}</b> (order ${esc(rt.orderNumber)})`;
  const cta = { label: "View your returns", url: returnsUrl() };
  const lastNote = [...(rt.history ?? [])].reverse().find((h) => h.status === rt.status)?.note ?? "";

  switch (rt.status) {
    case "requested":
      return build(
        `We've got your ${kind} request: ${rt.number}`,
        {
          preheader: "We'll review it within one working day.",
          kicker: "Request received",
          heading: `Your ${kind} request`,
          body: [
            p(`Hi ${esc(name)}, thanks for letting us know. We've received your ${kind} request ${ref} and will review it within one working day.`),
            items(rt),
            small(r === "in" ? "Once approved, we'll arrange a free pickup from your address. Please keep the pieces unworn, with tags and the original packaging." : "Once approved, we'll email you a prepaid UK returns label. Please keep the pieces unworn, with tags and the original packaging."),
          ].join(""),
          cta,
        },
        { template: "return_requested", params: [name, rt.number], text: `Hi ${name}, we've received your ${kind} request ${rt.number} and will review it within one working day.` }
      );
    case "approved":
      return build(
        `Your ${kind} is approved: ${rt.number}`,
        {
          preheader: r === "in" ? "We'll schedule a free pickup next." : "Your prepaid returns label is on its way.",
          kicker: "Approved",
          heading: `${kind === "exchange" ? "Exchange" : "Return"} approved`,
          body: [
            p(`Hi ${esc(name)}, good news: ${ref} is approved.`),
            p(r === "in" ? "We'll book a free pickup and message you the date and courier. Please pack the pieces in the original packaging with tags attached." : "We'll email your prepaid UK returns label shortly. Drop the parcel at any Post Office or parcel locker, with the tags still attached."),
            items(rt),
          ].join(""),
          cta,
        },
        { template: "return_approved", params: [name, rt.number], text: `Hi ${name}, your ${kind} ${rt.number} is approved. ${r === "in" ? "We'll message you the pickup date shortly." : "Your prepaid returns label is on its way."}` }
      );
    case "pickup_scheduled": {
      const date = rt.pickup?.date ? longDay(rt.pickup.date, r) : "";
      const courier = rt.pickup?.courier ? courierName(rt.pickup.courier) : "";
      return build(
        `Pickup scheduled${date ? ` for ${date}` : ""}: ${rt.number}`,
        {
          preheader: date ? `${courier || "The courier"} will collect on ${date}.` : "Your pickup is booked.",
          kicker: "Pickup booked",
          heading: "Your pickup is booked",
          body: [
            p(`Hi ${esc(name)}, we've booked the pickup for ${ref}.`),
            box(
              [date ? `<b>Date:</b> ${esc(date)}` : "", courier ? `<b>Courier:</b> ${esc(courier)}` : "", rt.pickup?.awb ? `<b>Reference (AWB):</b> ${esc(rt.pickup.awb)}` : ""]
                .filter(Boolean)
                .join("<br>") || "The courier will call before arriving."
            ),
            small("Please have the parcel packed and ready, with tags attached. The courier may call before arriving, so keep your phone handy."),
          ].join(""),
          cta,
        },
        {
          template: "return_pickup_scheduled",
          params: [name, rt.number, date, courier],
          text: `Hi ${name}, the pickup for your return ${rt.number} is booked${date ? ` for ${date}` : ""}${courier ? ` with ${courier}` : ""}. Please keep the parcel packed and ready.`,
        }
      );
    }
    case "picked_up":
      return null; // the next message (received) follows soon; avoid one email too many
    case "received":
      return build(
        `Your return has reached us: ${rt.number}`,
        {
          preheader: allExchange(rt) ? "We'll send your new size next." : "We'll process your refund next.",
          kicker: "Received",
          heading: "It's back with us",
          body: [
            p(`Hi ${esc(name)}, ${ref} has reached our Hyderabad studio and passed its quality check.`),
            p(allExchange(rt) ? "We're packing your new size now and will email the tracking details when it ships." : hasExchange(rt) ? "We'll ship your exchange and process the refund for the rest within 2 working days." : `We'll process your refund to ${METHOD[rt.refundMethod]} within 2 working days.`),
          ].join(""),
          cta,
        },
        { template: "return_received", params: [name, rt.number], text: `Hi ${name}, your return ${rt.number} has reached our studio. ${allExchange(rt) ? "Your new size ships next." : "Your refund is being processed."}` }
      );
    case "refunded": {
      const amount = money(rt.refundAmount, r);
      const credit = rt.refundMethod === "store_credit" && ctx.giftCardCode;
      return build(
        `Refund of ${amount} processed: ${rt.number}`,
        {
          preheader: credit ? `Your store credit code is ${ctx.giftCardCode}.` : `${amount} is on its way to ${METHOD[rt.refundMethod]}.`,
          kicker: "Refunded",
          heading: "Your refund is done",
          body: [
            p(`Hi ${esc(name)}, we've refunded <b>${amount}</b> for ${ref} to ${METHOD[rt.refundMethod]}.`),
            credit
              ? codeBox(ctx.giftCardCode!, `Store credit of ${amount}${ctx.giftCardExpiry ? `, valid until ${longDay(ctx.giftCardExpiry, r)}` : ""}. Enter it at checkout.`)
              : box(
                  rt.refundMethod === "bank"
                    ? "Bank transfers usually arrive within 2–3 working days. If we don't have your account details yet, we'll get in touch."
                    : "It usually shows on your statement within 5–7 working days, depending on your bank."
                ),
          ].join(""),
          cta: credit ? { label: "Shop with your credit", url: siteUrl("/c/new") } : cta,
        },
        {
          template: "return_refunded",
          params: [name, amount, rt.number],
          text: `Hi ${name}, we've refunded ${amount} for ${rt.number} to ${METHOD[rt.refundMethod]}.${credit ? ` Your store credit code: ${ctx.giftCardCode}` : ""}`,
        }
      );
    }
    case "exchanged":
      return build(
        `Your exchange is on its way: ${rt.number}`,
        {
          preheader: "Your new size has been sent.",
          kicker: "Exchanged",
          heading: "Your new size is on its way",
          body: [
            p(`Hi ${esc(name)}, we've sent the replacement for ${ref}.`),
            itemsTable(rt.items.filter((i) => i.kind === "exchange").map((i) => ({ name: i.name, image: i.image, size: i.exchangeSize, qty: i.qty })), r),
            lastNote ? small(esc(lastNote)) : "",
            small(`It usually arrives in ${REGION_CONFIG[r].eta[0]}–${REGION_CONFIG[r].eta[1]} working days.`),
          ].join(""),
          cta,
        },
        { template: "return_exchanged", params: [name, rt.number], text: `Hi ${name}, the new size for your exchange ${rt.number} is on its way.` }
      );
    case "rejected":
      return build(
        `About your return request ${rt.number}`,
        {
          preheader: "We couldn't approve this request.",
          kicker: "Update",
          heading: "We couldn't approve this one",
          body: [
            p(`Hi ${esc(name)}, we're sorry, but we couldn't approve ${ref}.`),
            lastNote ? box(esc(lastNote)) : "",
            p(`Our ${link("returns policy", siteUrl("/help/returns"))} explains what can be returned. If you think we've got this wrong, reply to this email and a real person will look at it again.`),
          ].join(""),
          cta: { label: "Contact us", url: siteUrl("/contact") },
        },
        { template: "return_rejected", params: [name, rt.number], text: `Hi ${name}, we couldn't approve your return request ${rt.number}. Reply here if you'd like us to take another look.` }
      );
    default:
      return null;
  }
}
