// Conversation test for the free shopping assistant against the real database.
// Usage: node --env-file=.env.local --conditions=react-server --import tsx scripts/test-assistant.mts
// Needs the TEST order from scripts/test-tracking.mts (create + ship) for the tracking flow; prints each turn.
import mongoose from "mongoose";
import { assistantReply, type BotState } from "../src/lib/assistant.ts";

let state: BotState = {};
async function say(text: string, region: "in" | "uk" = "in") {
  const r = await assistantReply({ text, state }, region);
  state = r.state;
  for (const m of r.messages) {
    console.log(`\n> ${text || "(open)"}  [${region}]`);
    console.log(`  ${m.text}`);
    if (m.products?.length) console.log(`  products: ${m.products.map((p) => `${p.name} ${p.price}${p.mrp ? ` (was ${p.mrp})` : ""}`).join(" | ")}`);
    if (m.actions?.length) console.log(`  buttons: ${m.actions.map((a) => a.label).join(" · ")}`);
    if (m.form) console.log(`  + leave-a-message form`);
  }
  return r;
}

await say("");
await say("#track");
await say("MGTEST0001");
await say("someone@else.com");
state = {};
await say("where is my order MGTEST0001");
await say("98765 43210");
state = {};
await say("red silk saree under 20000");
await say("cotton kurti for office");
await say("bust 36 waist 30");
await say("#size");
await say("97 cm");
await say("will I pay customs duties in the UK", "uk");
await say("do you have cash on delivery");
await say("I want to return my saree");
await say("any discount codes?");
await say("how do I wash silk");
await say("can I talk to a person");
await say("xyzzy blorp");
await mongoose.disconnect();
