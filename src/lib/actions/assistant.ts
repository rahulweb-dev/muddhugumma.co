"use server";
import { getRegion } from "@/lib/queries";
import { assistantReply, type BotRequest, type BotResponse } from "@/lib/assistant";
import { TOO_MANY, allow } from "@/lib/rate-limit";

/** Shopping assistant turn (free, rule-based). The browser keeps the conversation; this answers one message. */
export async function askAssistant(req: BotRequest): Promise<BotResponse> {
  const region = await getRegion();
  if (!(await allow("assistant", 60, 600))) {
    return { messages: [{ text: "You're sending messages very quickly. Please wait a minute, or reach our team directly.", actions: [{ label: "Contact us", href: "/contact" }] }], state: {} };
  }
  try {
    return await assistantReply({ text: String(req?.text ?? ""), state: req?.state && typeof req.state === "object" ? req.state : {} }, region);
  } catch (e) {
    console.error("[assistant]", e);
    return {
      messages: [{ text: "Sorry, something went wrong on our side. Please try again, or reach our team directly.", actions: [{ label: "Contact us", href: "/contact" }] }],
      state: {},
    };
  }
}
