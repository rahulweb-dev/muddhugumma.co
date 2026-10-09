"use server";
import { sendOtp, verifyOtp } from "@/lib/otp";
import { isRegion } from "@/lib/region";

/* Phone verification for cash on delivery (the checkout asks for it when settings.codOtpRequired is on). */

const local = (phone: string, region: "in" | "uk") => {
  const d = String(phone ?? "").replace(/\D/g, "");
  return region === "in" ? d.replace(/^(91|0)(?=\d{10}$)/, "") : d.replace(/^(44|0)(?=\d{9,10}$)/, "");
};

const valid = (p: string, region: "in" | "uk") => (region === "in" ? /^[6-9]\d{9}$/.test(p) : /^\d{9,10}$/.test(p));

export async function requestCodOtp(phone: string, region: string): Promise<{ ok: true; retryAfter: number; testCode?: string; sentTo: string } | { ok: false; error: string; retryAfter?: number }> {
  if (!isRegion(region)) return { ok: false, error: "Unknown region." };
  const p = local(phone, region);
  if (!valid(p, region)) return { ok: false, error: region === "in" ? "Enter a 10-digit mobile number first." : "Enter a valid UK phone number first." };
  try {
    const res = await sendOtp(`${region === "in" ? "+91" : "+44"}${p}`, "cod", "", region);
    if (!res.ok) return res;
    return { ok: true, retryAfter: res.retryAfter, testCode: res.testCode, sentTo: res.phone };
  } catch (e) {
    console.error("[otp] send failed", e);
    return { ok: false, error: "We couldn't send a code just now. Please try again." };
  }
}

export async function confirmCodOtp(phone: string, region: string, code: string): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isRegion(region)) return { ok: false, error: "Unknown region." };
  const p = local(phone, region);
  if (!valid(p, region)) return { ok: false, error: "Enter a valid mobile number." };
  try {
    return await verifyOtp(`${region === "in" ? "+91" : "+44"}${p}`, "cod", code, region);
  } catch (e) {
    console.error("[otp] verify failed", e);
    return { ok: false, error: "We couldn't check the code just now. Please try again." };
  }
}
