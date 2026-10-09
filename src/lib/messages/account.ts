import "server-only";
import { esc, siteUrl } from "../email-layout";
import { box, build, codeBox, firstName, itemsTable, longDay, p, small, type LineItem, type Message } from "./shared";
import type { Region } from "../region";

/* Account and marketing emails: password reset, birthday offer, abandoned bag. */

export function passwordReset(name: string, url: string): Message {
  return build("Reset your House of Muddhugumma password", {
    preheader: "This link works for one hour.",
    kicker: "Password reset",
    heading: "Reset your password",
    body: [
      p(`Hi ${esc(firstName(name))}, we received a request to reset the password for your account.`),
      p("Tap the button below to choose a new one. The link works once and expires in one hour."),
      small(`If the button doesn't work, copy this link into your browser:<br><span style="word-break:break-all">${esc(url)}</span>`),
    ].join(""),
    cta: { label: "Choose a new password", url },
    footnote: "Didn't ask for this? You can ignore this email: your password stays the same.",
  });
}

export function birthdayOffer(name: string, code: string, pct: number, expires: Date, region: Region): Message {
  return build(`Happy birthday, ${firstName(name)}! A little gift inside`, {
    preheader: `${pct}% off anything you love, for the next 30 days.`,
    kicker: "Happy birthday",
    heading: `Happy birthday, ${firstName(name)}`,
    body: [
      p("From all of us at the studio in Hyderabad, wishing you a year full of good things and beautiful drapes."),
      p(`Here's <b>${pct}% off</b> anything you'd like, on us:`),
      codeBox(code, `${pct}% off, valid until ${longDay(expires, region)}. Use it once at checkout.`),
      small("Works on sarees, kurta sets and lehengas, in India and the UK."),
    ].join(""),
    cta: { label: "Treat yourself", url: siteUrl("/c/new") },
    footnote: "You're getting this because you opted in to offers. Change this any time in your profile.",
  });
}

export function abandonedBag(name: string, items: LineItem[], region: Region, freeShipNote: string): Message {
  return build(`${firstName(name)}, your bag is waiting`, {
    preheader: "The pieces you picked are still in your bag.",
    kicker: "Still thinking?",
    heading: "You left something behind",
    body: [
      p(`Hi ${esc(firstName(name))}, the pieces you picked are still in your bag. Handwoven stock is limited, so sizes can sell out.`),
      itemsTable(items, region),
      freeShipNote ? box(esc(freeShipNote)) : "",
      small("Questions about fit or drape? Reply to this email or book a free video styling call."),
    ].join(""),
    cta: { label: "Go to your bag", url: siteUrl("/bag") },
    footnote: "You're getting this because you opted in to offers. Change this any time in your profile.",
  });
}
