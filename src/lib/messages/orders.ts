import "server-only";
import { esc, siteUrl } from "../email-layout";
import type { OrderDoc } from "../models";
import { deliveryWindow, REGION_CONFIG } from "../region";
import { courierName, trackingLink } from "../shipping";
import { addressBlock, box, build, firstName, itemsTable, link, longDay, money, orderItems, p, shortDay, small, totalsTable, type Message } from "./shared";

/* Customer messages for the order lifecycle. Each returns the email plus a short WhatsApp text. */

const orderUrl = (o: OrderDoc) => siteUrl(`/order/${encodeURIComponent(o.number)}`);
const trackUrl = (o: OrderDoc) => siteUrl(`/track?order=${encodeURIComponent(o.number)}`);
const accountOrderUrl = (o: OrderDoc) => siteUrl(`/account/orders/${encodeURIComponent(o.number)}`);
const myOrderUrl = (o: OrderDoc) => (o.userId ? accountOrderUrl(o) : orderUrl(o));

const hasStitching = (o: OrderDoc) => (o.items ?? []).some((i) => i.options?.blouse === "stitched");

function paymentLine(o: OrderDoc): string {
  const r = o.region;
  const m = o.payment?.method;
  const due = o.partialCod?.dueOnDelivery ?? 0;
  if (m === "cod") {
    if (due > 0) return `You paid ${money(o.partialCod?.paidOnline ?? 0, r)} online. Please keep ${money(due, r)} ready for the courier (cash or UPI).`;
    return `Cash on delivery: please keep ${money(o.total, r)} ready for the courier (cash or UPI).`;
  }
  if (m === "giftcard") return "Paid in full with your gift card.";
  if (o.payment?.status === "paid") return `Payment received: ${money(o.total, r)}.`;
  return "We're waiting for your payment to be confirmed. We'll email you as soon as it is.";
}

export function orderPlaced(o: OrderDoc): Message {
  const r = o.region;
  const [a, b] = deliveryWindow(r, o.createdAt ? new Date(o.createdAt) : new Date());
  const name = firstName(o.address?.name);
  const eta = `${longDay(a, r)} – ${longDay(b, r)}`;
  const body = [
    p(`Hi ${esc(name)}, thank you for shopping with us. Your order <b>${esc(o.number)}</b> is in and our Hyderabad studio is getting it ready.`),
    box(`<b>Estimated delivery:</b> ${esc(eta)}<br><span style="color:#6E6962;font-size:13px">${esc(paymentLine(o))}</span>`),
    hasStitching(o) ? small("You chose a stitched blouse: our tailor will call or WhatsApp you for measurements within one working day. Stitched pieces add about 5 working days.") : "",
    itemsTable(orderItems(o), r),
    totalsTable(o),
    o.gift?.wrap ? small(`Gift wrapped${o.gift.message ? ` with your note: “${esc(o.gift.message)}”` : ""}. Prices are left out of the parcel.`) : "",
    `<div style="margin:0 0 6px;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#6E6962;font-weight:bold">Delivering to</div>`,
    addressBlock(o),
    `<p style="margin:16px 0 0;font-size:13.5px">Track it any time at ${link("muddhugumma.com/track", trackUrl(o))} with your order number and this email address.</p>`,
  ].join("");
  return build(
    `Order confirmed: ${o.number}`,
    { preheader: `Arriving ${eta}. Thank you for your order.`, kicker: "Order confirmed", heading: "Thank you for your order", body, cta: { label: "View your order", url: myOrderUrl(o) } },
    {
      template: "order_placed",
      params: [name, o.number, money(o.total, r), eta],
      text: `Hi ${name}, thank you for your order ${o.number} (${money(o.total, r)}) with House of Muddhugumma. Estimated delivery: ${eta}. Track it: ${trackUrl(o)}`,
    }
  );
}

export function orderPaid(o: OrderDoc): Message {
  const r = o.region;
  const name = firstName(o.address?.name);
  const body = [
    p(`Hi ${esc(name)}, we've received your payment of <b>${money(o.total, r)}</b> for order <b>${esc(o.number)}</b>. Nothing more to do: we'll message you when it ships.`),
    o.payment?.ref ? small(`Payment reference: ${esc(o.payment.ref)}`) : "",
    itemsTable(orderItems(o), r),
  ].join("");
  return build(
    `Payment received for ${o.number}`,
    { preheader: `We've received ${money(o.total, r)}. Your order is being prepared.`, kicker: "Payment received", heading: "You're all paid up", body, cta: { label: "View your order", url: myOrderUrl(o) } },
    { template: "order_paid", params: [name, money(o.total, r), o.number], text: `Hi ${name}, we've received your payment of ${money(o.total, r)} for order ${o.number}. We'll message you when it ships.` }
  );
}

export function orderShipped(o: OrderDoc): Message {
  const r = o.region;
  const s = o.shipment ?? {};
  const courier = courierName(s.courier);
  const url = trackingLink(s.courier, s.awb, s.trackingUrl);
  const name = firstName(o.address?.name);
  const expected = s.expectedBy ? longDay(s.expectedBy, r) : longDay(deliveryWindow(r)[1], r);
  const due = o.payment?.method === "cod" ? (o.partialCod?.dueOnDelivery || o.total) : 0;
  const body = [
    p(`Hi ${esc(name)}, good news: order <b>${esc(o.number)}</b> has left our Hyderabad studio${r === "uk" ? " and is on its way to the UK. Duties are already paid, so there's nothing to pay at the door" : ""}.`),
    box(
      (s.awb ? `<b>Courier:</b> ${esc(courier)}<br><b>Tracking number (AWB):</b> ${esc(s.awb)}<br>` : "") +
        `<b>Expected by:</b> ${esc(expected)}` +
        (url ? `<br>${link("Track with the courier", url)}` : "")
    ),
    due > 0 ? small(`Cash on delivery: please keep ${money(due, r)} ready (cash or UPI).`) : "",
    itemsTable(orderItems(o).map(({ price: _p, ...rest }) => rest), r),
    small(`Updates also appear on ${link("our tracking page", trackUrl(o))}. If you won't be home, the courier usually tries again the next working day.`),
  ].join("");
  return build(
    `Your order ${o.number} has shipped`,
    { preheader: s.awb ? `${courier} · AWB ${s.awb} · expected by ${expected}` : `Expected by ${expected}`, kicker: "On its way", heading: "Your order has shipped", body, cta: { label: "Track your parcel", url: url || trackUrl(o) } },
    {
      template: "order_shipped",
      params: [name, o.number, courier, s.awb ?? "", expected],
      text: `Hi ${name}, your order ${o.number} has shipped${s.awb ? ` with ${courier} (AWB ${s.awb})` : ""}. Expected by ${expected}. Track: ${url || trackUrl(o)}`,
    }
  );
}

export function outForDelivery(o: OrderDoc): Message {
  const r = o.region;
  const name = firstName(o.address?.name);
  const due = o.payment?.method === "cod" ? (o.partialCod?.dueOnDelivery || o.total) : 0;
  const body = [
    p(`Hi ${esc(name)}, your order <b>${esc(o.number)}</b> is out for delivery today with ${esc(courierName(o.shipment?.courier))}.`),
    due > 0 ? box(`Please keep <b>${money(due, r)}</b> ready for the courier (cash or UPI).`) : "",
    small("Keep your phone handy: the delivery partner may call before arriving."),
  ].join("");
  return build(
    `Out for delivery today: ${o.number}`,
    { preheader: "Your parcel arrives today.", kicker: "Arriving today", heading: "Out for delivery", body, cta: { label: "Track your parcel", url: trackUrl(o) } },
    {
      template: "order_out_for_delivery",
      params: [name, o.number],
      text: `Hi ${name}, your House of Muddhugumma order ${o.number} is out for delivery today.${due > 0 ? ` Please keep ${money(due, r)} ready.` : ""}`,
    }
  );
}

export function deliveryAttempted(o: OrderDoc): Message {
  const name = firstName(o.address?.name);
  const phone = o.address?.phone ? ` on ${esc(o.address.phone)}` : "";
  const body = [
    p(`Hi ${esc(name)}, the courier tried to deliver order <b>${esc(o.number)}</b> today but couldn't hand it over.`),
    p(`They'll try again on the next working day. If you need a different time, or the address needs a landmark, simply reply to this email or WhatsApp us and we'll pass it on. Please keep your phone${phone} reachable.`),
  ].join("");
  return build(
    `We missed you: ${o.number}`,
    { preheader: "The courier will try again on the next working day.", kicker: "Delivery attempted", heading: "Sorry we missed you", body, cta: { label: "Track your parcel", url: trackUrl(o) } },
    { template: "order_delivery_attempted", params: [name, o.number], text: `Hi ${name}, the courier couldn't deliver your order ${o.number} today and will try again on the next working day. Reply here if you need to change anything.` }
  );
}

export function orderDelivered(o: OrderDoc, pointsEarned: number): Message {
  const r = o.region;
  const name = firstName(o.address?.name);
  const seen = new Set<string>();
  const products = (o.items ?? []).filter((i) => i.slug && !seen.has(i.slug) && seen.add(i.slug));
  const reviewLinks = products
    .map((i) => `<li style="margin:0 0 6px">${esc(i.name)}: ${link("Write a review", siteUrl(`/p/${i.slug}#reviews`))}</li>`)
    .join("");
  const days = REGION_CONFIG[r].returnsDays;
  const body = [
    p(`Hi ${esc(name)}, your order <b>${esc(o.number)}</b> has been delivered. We hope you love it as much as we loved choosing it.`),
    pointsEarned > 0 ? box(`You've earned <b>${pointsEarned} Muddhugumma Circle points</b> on this order. Use them on your next purchase: ${link("see your rewards", siteUrl("/account/rewards"))}.`) : "",
    reviewLinks ? p("Tell other shoppers how it drapes and fits. A two-line review helps more than you'd think:") + `<ul style="margin:0 0 16px;padding-left:18px;font-size:14px">${reviewLinks}</ul>` : "",
    small(`Not quite right? You can request a return or exchange within ${days} days from ${link("My orders", myOrderUrl(o))}.`),
  ].join("");
  return build(
    `Delivered: ${o.number}`,
    { preheader: "Your order has arrived. We'd love to hear what you think.", kicker: "Delivered", heading: "It's arrived", body, cta: products[0] ? { label: "Write a review", url: siteUrl(`/p/${products[0].slug}#reviews`) } : { label: "View your order", url: myOrderUrl(o) } },
    { template: "order_delivered", params: [name, o.number], text: `Hi ${name}, your order ${o.number} has been delivered. We hope you love it! Tell us what you think: ${siteUrl(`/p/${products[0]?.slug ?? ""}#reviews`)}` }
  );
}

function refundNote(o: OrderDoc): string {
  const r = o.region;
  const lines: string[] = [];
  const paidOnline = o.payment?.status === "paid" && o.payment?.method !== "cod" && o.payment?.method !== "giftcard";
  if (paidOnline) lines.push(`Your refund of ${money(o.total, r)} goes back to your original payment method. It usually shows within 5–7 working days, depending on your bank.`);
  else if ((o.partialCod?.paidOnline ?? 0) > 0) lines.push(`The ${money(o.partialCod!.paidOnline!, r)} you paid online will be refunded to the original payment method within 5–7 working days.`);
  else if (o.payment?.method === "cod") lines.push("This was a cash on delivery order, so there's nothing to refund and nothing more to pay.");
  else if (o.payment?.status !== "paid" && o.payment?.method !== "giftcard") lines.push("No payment was taken for this order.");
  if ((o.giftCard?.amount ?? 0) > 0) lines.push(`The ${money(o.giftCard!.amount!, r)} paid by gift card has been put back on your card${o.giftCard?.code ? ` (${esc(o.giftCard.code)})` : ""}.`);
  if ((o.loyalty?.redeemedPoints ?? 0) > 0) lines.push(`The ${o.loyalty!.redeemedPoints} Circle points you used are back in your account.`);
  return lines.join(" ");
}

export function orderCancelled(o: OrderDoc): Message {
  const name = firstName(o.address?.name);
  const note = [...(o.history ?? [])].reverse().find((h) => h.status === "cancelled")?.note;
  const refund = refundNote(o);
  const body = [
    p(`Hi ${esc(name)}, your order <b>${esc(o.number)}</b> has been cancelled${note && !/customer/i.test(note) ? ` (${esc(note)})` : ""}.`),
    refund ? box(refund) : "",
    itemsTable(orderItems(o).map(({ price: _p, ...rest }) => rest), o.region),
    small("If you didn't ask for this, or want help choosing something else, just reply to this email."),
  ].join("");
  return build(
    `Order ${o.number} cancelled`,
    { preheader: refund.slice(0, 110) || "Your order has been cancelled.", kicker: "Order cancelled", heading: "Your order is cancelled", body, cta: { label: "Continue shopping", url: siteUrl("/c/new") } },
    { template: "order_cancelled", params: [name, o.number], text: `Hi ${name}, your order ${o.number} has been cancelled. ${refund.replace(/<[^>]+>/g, "")}`.trim() }
  );
}

export function orderReturned(o: OrderDoc): Message {
  const name = firstName(o.address?.name);
  const refund = refundNote(o).replace("Your refund of", "The refund of");
  const body = [
    p(`Hi ${esc(name)}, your return for order <b>${esc(o.number)}</b> has reached our studio and has been checked in.`),
    refund ? box(refund) : "",
    small("Thank you for giving us the chance to put it right. If you'd like help finding a better fit, reply to this email for a free video styling call."),
  ].join("");
  return build(
    `Return received: ${o.number}`,
    { preheader: "Your return has reached our studio.", kicker: "Return received", heading: "We've got it back", body, cta: { label: "View your order", url: myOrderUrl(o) } },
    { template: "order_returned", params: [name, o.number], text: `Hi ${name}, your return for order ${o.number} has reached our studio. ${refund.replace(/<[^>]+>/g, "")}`.trim() }
  );
}

/** Short internal alert for the team inbox. */
export function staffNewOrder(o: OrderDoc): Message {
  const r = o.region;
  const items = (o.items ?? []).map((i) => `${esc(i.name)} · ${esc(i.size)} × ${i.qty}${i.options?.blouse === "stitched" ? " · STITCHED BLOUSE" : ""}${i.options?.fallPico ? " · fall & pico" : ""}`).join("<br>");
  const body = [
    p(`<b>${esc(o.number)}</b> · ${money(o.total, r)} · ${r === "uk" ? "UK" : "India"} · ${esc(o.payment?.method ?? "")} (${esc(o.payment?.status ?? "")})`),
    box(items),
    p(`${esc(o.address?.name ?? "")}, ${esc(o.address?.city ?? "")} · ${esc(o.email)}${o.address?.phone ? ` · ${esc(o.address.phone)}` : ""}`),
    o.gift?.wrap ? p("Gift wrap requested.") : "",
    shortDay(o.createdAt, "in") ? small(`Placed ${shortDay(o.createdAt, "in")} (IST).`) : "",
  ].join("");
  return build(`New order ${o.number} · ${money(o.total, r)}`, { preheader: `New ${r === "uk" ? "UK" : "India"} order`, kicker: "New order", heading: o.number, body, cta: { label: "Open in admin", url: siteUrl("/admin/orders") } });
}
