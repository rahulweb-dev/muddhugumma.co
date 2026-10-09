"use server";
import { getRegion } from "@/lib/queries";
import { assistantReply, type BotRequest, type BotResponse } from "@/lib/assistant";

/** Shopping assistant turn (free, rule-based). The browser keeps the conversation; this answers one message. */
export async function askAssistant(req: BotRequest): Promise<BotResponse> {
  const region = await getRegion();
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
