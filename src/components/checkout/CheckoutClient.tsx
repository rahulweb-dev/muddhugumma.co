"use client";
import Link from "next/link";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "../Icon";
import { useStore } from "../StoreProvider";
import { useCartReady, useCoupon, useGiftCard, useLivePrices } from "./hooks";
import { CouponBox, GiftCardBox, PriceSummary } from "./Summary";
import { Steps } from "./Steps";
import { loadRazorpay, type RazorpayResponse } from "./razorpay";
import { confirmRazorpayPayment, placeOrder } from "@/lib/actions/checkout";
import { confirmCodOtp, requestCodOtp } from "@/lib/actions/otp";
import { GIFT_MESSAGE_MAX, computeTotals, isCodMethod, methodsFor, optionLabels, optionsPrice, type CheckoutSettings, type PaymentMethod } from "@/lib/checkout-pricing";
import type { ActiveSale } from "@/lib/pricing";
import { REGION_CONFIG, formatMoney, type Region } from "@/lib/region";

export type SavedAddress = { id: string; name: string; phone: string; line1: string; line2: string; city: string; state: string; postcode: string; region: Region; isDefault: boolean };
export type CheckoutUser = { name: string; email: string; phone: string; addresses: SavedAddress[]; loyaltyPoints: number };

type Addr = { name: string; phone: string; postcode: string; line1: string; line2: string; city: string; state: string };
type RazorpayParams = { key: string; orderId: string; amount: number; currency: string; prefill: { name: string; email: string; contact: string } };

const METHOD_COPY: Record<PaymentMethod, { title: string; note: string; icon: "lock" | "cash" }> = {
  razorpay: { title: "UPI / Cards / Net banking (Razorpay)", note: "GPay, PhonePe, Paytm, RuPay, Visa, Mastercard and all major banks.", icon: "lock" },
  cod: { title: "Cash on delivery", note: "Pay in cash or UPI when your order arrives.", icon: "cash" },
  partcod: { title: "Part pay now, rest on delivery", note: "Pay a small advance by UPI or card now and the rest in cash or UPI at the door.", icon: "cash" },
  stripe: { title: "Card, Apple Pay or Google Pay (Stripe)", note: "Visa, Mastercard and Amex. You'll pay on Stripe's secure page.", icon: "lock" },
};

const digits = (s: string) => s.replace(/\D/g, "");
const localPhone = (phone: string, region: Region) => {
  const d = digits(phone);
  if (region === "in") return d.replace(/^(91|0)(?=\d{10}$)/, "");
  return d.replace(/^(44|0)(?=\d{9,10}$)/, "");
};
const blank = (user: CheckoutUser | null, region: Region): Addr => ({
  name: user?.name ?? "",
  phone: user?.phone ? localPhone(user.phone, region) : "",
  postcode: "",
  line1: "",
  line2: "",
  city: "",
  state: "",
});
const fromSaved = (a: SavedAddress, region: Region): Addr => ({
  name: a.name,
  phone: localPhone(a.phone, region),
  postcode: a.postcode,
  line1: a.line1,
  line2: a.line2,
  city: a.city,
  state: a.state,
});

function validate(region: Region, a: Addr, email: string, needEmail: boolean): Record<string, string> {
  const r = REGION_CONFIG[region];
  const e: Record<string, string> = {};
  if (needEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) e.email = "Enter a valid email address";
  if (a.name.trim().length < 2) e["address.name"] = "Enter the full name";
  const p = localPhone(a.phone, region);
  if (region === "in" ? !/^[6-9]\d{9}$/.test(p) : !/^\d{9,10}$/.test(p)) e["address.phone"] = region === "in" ? "Enter a 10-digit mobile number" : "Enter a valid UK phone number";
  if (!r.postPattern.test(a.postcode.trim())) e["address.postcode"] = region === "in" ? "Enter a valid 6-digit pincode" : "Enter a valid UK postcode";
  if (a.line1.trim().length < 2) e["address.line1"] = region === "in" ? "Enter flat / house number and building" : "Enter address line 1";
  if (region === "in" && a.line2.trim().length < 2) e["address.line2"] = "Enter area or street";
  if (a.city.trim().length < 2) e["address.city"] = region === "in" ? "Enter the city" : "Enter the town or city";
  if (region === "in" && !(r.states ?? []).includes(a.state)) e["address.state"] = "Choose a state";
  return e;
}

type OtpState = { sentTo: string; code: string; testCode?: string; verifiedFor: string; busy: boolean; error: string; resendAt: number };
const NO_OTP: OtpState = { sentTo: "", code: "", verifiedFor: "", busy: false, error: "", resendAt: 0 };

export function CheckoutClient({
  user,
  eta,
  sales,
  settings,
  otpRequired,
}: {
  user: CheckoutUser | null;
  eta: Record<Region, string>;
  sales: ActiveSale[];
  settings: CheckoutSettings;
  otpRequired: boolean;
}) {
  const router = useRouter();
  const { region, cart } = useStore();
  const ready = useCartReady();
  const r = REGION_CONFIG[region];
  const f = (n: number) => formatMoney(n, region);

  const savedFor = (rg: Region) => (user?.addresses ?? []).filter((a) => a.region === rg);
  const pick = (rg: Region) => {
    const s = savedFor(rg);
    return s.find((a) => a.isDefault) ?? s[0];
  };

  const [step, setStep] = useState<1 | 2>(1);
  const [email, setEmail] = useState(user?.email ?? "");
  const [sel, setSel] = useState<string>(() => pick(region)?.id ?? "new");
  const [addr, setAddr] = useState<Addr>(() => {
    const d = pick(region);
    return d ? fromSaved(d, region) : blank(user, region);
  });
  const [saveAddress, setSaveAddress] = useState(true);
  const [method, setMethod] = useState<PaymentMethod>(methodsFor(region)[0]);
  const [giftWrap, setGiftWrap] = useState(false);
  const [giftMessage, setGiftMessage] = useState("");
  const [usePoints, setUsePoints] = useState(false);
  const [otp, setOtp] = useState<OtpState>(NO_OTP);
  const [now, setNow] = useState(0);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<{ number: string; rz: RazorpayParams } | null>(null);
  const topRef = useRef<HTMLDivElement>(null);

  // Region switched mid-checkout: reset the address form and payment options for the new country.
  const prevRegion = useRef(region);
  useEffect(() => {
    if (prevRegion.current === region) return;
    prevRegion.current = region;
    const d = pick(region);
    setSel(d?.id ?? "new");
    setAddr(d ? fromSaved(d, region) : blank(user, region));
    setMethod(methodsFor(region)[0]);
    setErrors({});
    setError("");
    setPending(null);
    setOtp(NO_OTP);
    setStep(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [region]);

  // Warm up Razorpay's script once the shopper reaches payment.
  useEffect(() => {
    if (step === 2 && (method === "razorpay" || method === "partcod")) loadRazorpay();
  }, [step, method]);

  const { lines, loaded, refresh } = useLivePrices(cart, sales);
  const base = computeTotals(lines, region, { settings });
  const coupon = useCoupon(region, base.subtotal);
  const gift = useGiftCard(region);
  const points = user?.loyaltyPoints ?? 0;
  const opts = { couponDiscount: coupon.discount, giftWrap, giftCardBalance: gift.card?.balance ?? 0, settings };
  const t = computeTotals(lines, region, { ...opts, method, redeemPoints: usePoints ? points : 0 });
  const usable = computeTotals(lines, region, { ...opts, method, redeemPoints: points }); // most points this order can use
  const online = computeTotals(lines, region, { ...opts, method: "razorpay", redeemPoints: usePoints ? points : 0 });
  const saved = savedFor(region);
  const showForm = sel === "new" || !saved.some((a) => a.id === sel);
  const covered = t.coveredByGiftCard;
  const codChosen = !covered && isCodMethod(method);
  const phoneKey = `${region}:${localPhone(addr.phone, region)}`;
  const otpNeeded = otpRequired && codChosen && otp.verifiedFor !== phoneKey;
  const earnUnit = region === "in" ? 100 : 1;
  const willEarn = Math.floor(t.itemsPaid / earnUnit) * (settings.loyalty.pointsPerUnit[region] ?? 0);

  // Part payment disappears when the order is too small for it.
  useEffect(() => {
    if (method === "partcod" && !t.partCodAvailable) setMethod("cod");
  }, [method, t.partCodAvailable]);

  // A ticking clock for the "resend code" countdown.
  useEffect(() => {
    if (!otp.resendAt) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [otp.resendAt]);
  const resendIn = Math.max(0, Math.ceil((otp.resendAt - now) / 1000));

  const set = (k: keyof Addr) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    let v = e.target.value;
    if (k === "postcode" && region === "uk") v = v.toUpperCase();
    if (k === "postcode" && region === "in") v = digits(v).slice(0, 6);
    setAddr((a) => ({ ...a, [k]: v }));
    if (errors[`address.${k}`]) setErrors(({ [`address.${k}`]: _, ...rest }) => rest);
  };

  const choose = (id: string) => {
    setSel(id);
    setErrors({});
    const a = saved.find((x) => x.id === id);
    setAddr(a ? fromSaved(a, region) : blank(user, region));
  };

  const focusFirstError = (errs: Record<string, string>) => {
    const k = Object.keys(errs)[0];
    if (!k) return;
    requestAnimationFrame(() => document.getElementById(`co-${k.replace("address.", "")}`)?.focus());
  };

  const toStep = (s: 1 | 2) => {
    setStep(s);
    topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  async function sendCode() {
    setOtp((o) => ({ ...o, busy: true, error: "" }));
    try {
      const res = await requestCodOtp(addr.phone, region);
      if (res.ok) setOtp((o) => ({ ...o, busy: false, sentTo: phoneKey, code: "", testCode: res.testCode, resendAt: Date.now() + res.retryAfter * 1000 }));
      else setOtp((o) => ({ ...o, busy: false, error: res.error, resendAt: res.retryAfter ? Date.now() + res.retryAfter * 1000 : o.resendAt }));
    } catch {
      setOtp((o) => ({ ...o, busy: false, error: "We couldn't send a code just now. Please try again." }));
    }
  }

  async function checkCode() {
    setOtp((o) => ({ ...o, busy: true, error: "" }));
    try {
      const res = await confirmCodOtp(addr.phone, region, otp.code);
      if (res.ok) setOtp((o) => ({ ...o, busy: false, verifiedFor: phoneKey, error: "" }));
      else setOtp((o) => ({ ...o, busy: false, error: res.error }));
    } catch {
      setOtp((o) => ({ ...o, busy: false, error: "We couldn't check the code just now. Please try again." }));
    }
  }

  async function openRazorpay(number: string, rz: RazorpayParams) {
    const ok = await loadRazorpay();
    if (!ok || !window.Razorpay) {
      setBusy(false);
      setError(`We couldn't load Razorpay. Check your connection and tap “Retry payment”. Your order ${number} is saved.`);
      return;
    }
    const rzp = new window.Razorpay({
      key: rz.key,
      amount: rz.amount,
      currency: rz.currency,
      order_id: rz.orderId,
      name: "House of Muddhugumma",
      description: method === "partcod" ? `Advance for order ${number}` : `Order ${number}`,
      prefill: rz.prefill,
      notes: { order_number: number },
      theme: { color: "#1B1A18" },
      handler: async (resp: RazorpayResponse) => {
        try {
          const res = await confirmRazorpayPayment(number, resp.razorpay_order_id, resp.razorpay_payment_id, resp.razorpay_signature);
          if (res.ok) router.push(res.redirect);
          else {
            setError(res.error);
            setBusy(false);
          }
        } catch {
          router.push(`/order/${number}`);
        }
      },
      modal: {
        ondismiss: () => {
          setBusy(false);
          setError(`Payment not completed. Your order ${number} is saved; tap “Retry payment” to pay now.`);
        },
      },
    });
    rzp.on("payment.failed", (e) => setError(e.error?.description ? `Payment failed: ${e.error.description}` : "Payment failed. Please try again."));
    rzp.open();
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError("");
    if (step === 1) {
      const errs = validate(region, addr, email, !user);
      setErrors(errs);
      if (Object.keys(errs).length) {
        if (!showForm) setSel("new");
        focusFirstError(errs);
        return;
      }
      toStep(2);
      return;
    }

    if (otpNeeded) {
      setError("Please verify your mobile number to use cash on delivery.");
      requestAnimationFrame(() => document.getElementById("co-otp")?.scrollIntoView({ behavior: "smooth", block: "center" }));
      return;
    }
    if (giftMessage.length > GIFT_MESSAGE_MAX) {
      setError(`Keep the gift message to ${GIFT_MESSAGE_MAX} characters.`);
      return;
    }

    setBusy(true);
    if (pending && !covered && (method === "razorpay" || method === "partcod")) {
      await openRazorpay(pending.number, pending.rz);
      return;
    }
    try {
      const res = await placeOrder({
        region,
        email: user?.email ?? email,
        items: cart.map((l) => ({ slug: l.slug, size: l.size, qty: l.qty, options: l.options })),
        address: { ...addr },
        method,
        coupon: coupon.discount ? coupon.code : "",
        saveAddress: !!user && sel === "new" && saveAddress,
        giftWrap,
        giftMessage,
        usePoints: usePoints && points > 0,
        giftCard: gift.card?.code ?? "",
        expectedTotal: t.total,
      });
      if (!res.ok) {
        setError(res.error);
        const fe = res.fieldErrors ?? {};
        setErrors(fe);
        if (res.priceChanged) {
          refresh();
          gift.recheck();
        }
        if (res.needOtp) setOtp((o) => ({ ...o, verifiedFor: "" }));
        if (Object.keys(fe).some((k) => k === "email" || k.startsWith("address."))) {
          setSel("new");
          toStep(1);
          focusFirstError(fe);
        }
        setBusy(false);
        return;
      }
      if ("redirect" in res) {
        router.push(res.redirect);
        return;
      }
      if ("stripeUrl" in res) {
        window.location.assign(res.stripeUrl);
        return;
      }
      setPending({ number: res.number, rz: res.razorpay });
      await openRazorpay(res.number, res.razorpay);
    } catch {
      setError("Something went wrong placing your order. Please try again.");
      setBusy(false);
    }
  }

  if (!ready) {
    return (
      <div className="co-page pad wrap" aria-busy="true">
        <Steps current={1} />
        <div className="co-skel" />
      </div>
    );
  }

  if (!cart.length) {
    return (
      <div className="co-page pad wrap">
        <div className="empty">
          <Icon name="bag" size={40} />
          <h1 className="h2">Nothing to <i>check out</i></h1>
          <p>Your bag is empty. Add a piece you love and come back here to pay.</p>
          <div className="co-empty-cta">
            <Link className="btn" href="/c/new">Shop new arrivals</Link>
            <Link className="btn ghost" href="/bag">Go to bag</Link>
          </div>
        </div>
      </div>
    );
  }

  const err = (k: string) => errors[k];
  const retry = !!pending && !covered && (method === "razorpay" || method === "partcod");
  const cta =
    step === 1
      ? "Continue to payment"
      : retry
        ? "Retry payment"
        : covered || method === "cod"
          ? "Place order"
          : method === "partcod"
            ? `Pay ${f(t.payNow)} now`
            : `Pay ${f(t.total)}`;
  const chosen = saved.find((a) => a.id === sel);
  const methods = methodsFor(region).filter((m) => m !== "partcod" || t.partCodAvailable);
  const blocked = busy || (step === 2 && !loaded);

  return (
    <div className="co-page pad wrap" ref={topRef}>
      <Steps current={step} />
      <div className="co-head">
        <h1 className="h1">{step === 1 ? <>Delivery <i className="serif">address</i></> : <>Choose <i className="serif">payment</i></>}</h1>
        <span className="co-secure"><Icon name="lock" size={15} /> Secure checkout</span>
      </div>

      <div className="co-layout">
        <form id="co-form" className="co-main" onSubmit={submit} noValidate>
          {error && <p className="notice err" role="alert">{error}</p>}

          {step === 1 ? (
            <>
              <section className="co-card">
                <h2 className="h3">Contact</h2>
                {user ? (
                  <p className="co-who">Signed in as <b>{user.email}</b>. Order updates will be sent here.</p>
                ) : (
                  <>
                    <Field id="email" label="Email for order updates" error={err("email")}>
                      <input id="co-email" type="email" autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} aria-invalid={!!err("email") || undefined} />
                    </Field>
                    <p className="co-who muted">
                      Have an account? <Link className="link" href="/account/login?next=/checkout">Sign in</Link>
                    </p>
                  </>
                )}
              </section>

              <section className="co-card">
                <h2 className="h3">Deliver to · {r.country}</h2>
                {saved.length > 0 && (
                  <div className="co-addrs" role="radiogroup" aria-label="Saved addresses">
                    {saved.map((a) => (
                      <label key={a.id} className={`co-opt${sel === a.id ? " on" : ""}`}>
                        <input type="radio" name="co-addr" checked={sel === a.id} onChange={() => choose(a.id)} />
                        <span>
                          <b>{a.name}{a.isDefault && <em className="co-def">Default</em>}</b>
                          <span>{[a.line1, a.line2, a.city, a.state, a.postcode].filter(Boolean).join(", ")}</span>
                          <small>{a.phone}</small>
                        </span>
                      </label>
                    ))}
                    <label className={`co-opt${sel === "new" ? " on" : ""}`}>
                      <input type="radio" name="co-addr" checked={sel === "new"} onChange={() => choose("new")} />
                      <span><b>Add a new address</b></span>
                    </label>
                  </div>
                )}

                {showForm && (
                  <div className="form-grid two">
                    <Field id="name" label="Full name" error={err("address.name")}>
                      <input id="co-name" autoComplete="name" value={addr.name} onChange={set("name")} aria-invalid={!!err("address.name") || undefined} />
                    </Field>
                    <Field id="phone" label={region === "in" ? "Mobile number" : "Phone number"} error={err("address.phone")}>
                      <div className="co-pre">
                        <span>{region === "in" ? "+91" : "+44"}</span>
                        <input
                          id="co-phone"
                          type="tel"
                          autoComplete="tel-national"
                          inputMode="tel"
                          maxLength={region === "in" ? 14 : 16}
                          placeholder={region === "in" ? "10-digit mobile" : "7700 900123"}
                          value={addr.phone}
                          onChange={set("phone")}
                          aria-invalid={!!err("address.phone") || undefined}
                        />
                      </div>
                    </Field>

                    {region === "in" ? (
                      <>
                        <Field id="postcode" label={r.postLabel} error={err("address.postcode")}>
                          <input id="co-postcode" autoComplete="postal-code" inputMode="numeric" maxLength={6} placeholder={r.postHint} value={addr.postcode} onChange={set("postcode")} aria-invalid={!!err("address.postcode") || undefined} />
                        </Field>
                        <Field id="city" label="City / district" error={err("address.city")}>
                          <input id="co-city" autoComplete="address-level2" value={addr.city} onChange={set("city")} aria-invalid={!!err("address.city") || undefined} />
                        </Field>
                        <Field id="line1" label="Flat, house no., building" error={err("address.line1")} full>
                          <input id="co-line1" autoComplete="address-line1" value={addr.line1} onChange={set("line1")} aria-invalid={!!err("address.line1") || undefined} />
                        </Field>
                        <Field id="line2" label="Area, street, landmark" error={err("address.line2")} full>
                          <input id="co-line2" autoComplete="address-line2" value={addr.line2} onChange={set("line2")} aria-invalid={!!err("address.line2") || undefined} />
                        </Field>
                        <Field id="state" label="State" error={err("address.state")}>
                          <select id="co-state" autoComplete="address-level1" value={addr.state} onChange={set("state")} aria-invalid={!!err("address.state") || undefined}>
                            <option value="">Select state</option>
                            {(r.states ?? []).map((s) => <option key={s} value={s}>{s}</option>)}
                          </select>
                        </Field>
                      </>
                    ) : (
                      <>
                        <Field id="line1" label="Address line 1" error={err("address.line1")} full>
                          <input id="co-line1" autoComplete="address-line1" value={addr.line1} onChange={set("line1")} aria-invalid={!!err("address.line1") || undefined} />
                        </Field>
                        <Field id="line2" label="Address line 2 (optional)" error={err("address.line2")} full>
                          <input id="co-line2" autoComplete="address-line2" value={addr.line2} onChange={set("line2")} />
                        </Field>
                        <Field id="city" label="Town / city" error={err("address.city")}>
                          <input id="co-city" autoComplete="address-level2" value={addr.city} onChange={set("city")} aria-invalid={!!err("address.city") || undefined} />
                        </Field>
                        <Field id="state" label="County (optional)" error={err("address.state")}>
                          <input id="co-state" autoComplete="address-level1" value={addr.state} onChange={set("state")} />
                        </Field>
                        <Field id="postcode" label={r.postLabel} error={err("address.postcode")}>
                          <input id="co-postcode" autoComplete="postal-code" autoCapitalize="characters" maxLength={8} placeholder={r.postHint} value={addr.postcode} onChange={set("postcode")} aria-invalid={!!err("address.postcode") || undefined} />
                        </Field>
                      </>
                    )}
                    {user && sel === "new" && (
                      <label className="check full">
                        <input type="checkbox" checked={saveAddress} onChange={(e) => setSaveAddress(e.target.checked)} /> Save this address to my account
                      </label>
                    )}
                  </div>
                )}
              </section>

              <p className="co-eta"><Icon name="truck" /> <span>Estimated delivery <b>{eta[region]}</b></span></p>
            </>
          ) : (
            <>
              <section className="co-card co-recap">
                <div>
                  <h2 className="h3">Delivering to</h2>
                  <p>
                    <b>{addr.name}</b> · {region === "in" ? "+91" : "+44"} {localPhone(addr.phone, region)}<br />
                    {[addr.line1, addr.line2, addr.city, addr.state, region === "uk" ? addr.postcode.toUpperCase() : addr.postcode].filter(Boolean).join(", ")}
                  </p>
                  {!user && <p className="muted">Updates to {email}</p>}
                  {chosen && <p className="muted">Saved address</p>}
                </div>
                <button type="button" className="link" onClick={() => toStep(1)} disabled={busy}>Change</button>
              </section>

              <p className="co-eta"><Icon name="truck" /> <span>Estimated delivery <b>{eta[region]}</b></span></p>

              <section className="co-card">
                <h2 className="h3">Gift options</h2>
                <label className="check">
                  <input type="checkbox" checked={giftWrap} onChange={(e) => setGiftWrap(e.target.checked)} disabled={busy} />
                  <span>Gift wrap this order <span className="muted">(+{f(settings.giftWrapFee[region])})</span></span>
                </label>
                <p className="co-paynote muted">Wrapped in our hand-printed paper with a ribbon, and no prices inside the parcel.</p>
                <div className="field">
                  <label htmlFor="co-giftmsg">Gift message (optional)</label>
                  <textarea
                    id="co-giftmsg"
                    rows={3}
                    maxLength={GIFT_MESSAGE_MAX}
                    value={giftMessage}
                    onChange={(e) => setGiftMessage(e.target.value.slice(0, GIFT_MESSAGE_MAX))}
                    placeholder="Happy Diwali, Amma! With love, Priya"
                    aria-describedby="co-giftmsg-count"
                    disabled={busy}
                  />
                  <small id="co-giftmsg-count" className="co-count muted">{giftMessage.length}/{GIFT_MESSAGE_MAX} · printed on a card in the parcel</small>
                </div>
              </section>

              {user && (points > 0 || willEarn > 0) && (
                <section className="co-card">
                  <h2 className="h3"><Icon name="star" size={16} /> Muddhugumma Circle</h2>
                  {points > 0 && usable.loyaltyPoints > 0 ? (
                    <label className="check">
                      <input type="checkbox" checked={usePoints} onChange={(e) => setUsePoints(e.target.checked)} disabled={busy} />
                      <span>
                        Use {usable.loyaltyPoints.toLocaleString()} points <span className="muted">(worth {f(usable.loyalty)})</span>
                      </span>
                    </label>
                  ) : points > 0 ? (
                    <p className="co-paynote muted">You have {points.toLocaleString()} points. They can be used on a bigger order.</p>
                  ) : null}
                  <p className="co-paynote muted">
                    {points > 0 && <>Balance {points.toLocaleString()} points. </>}
                    {willEarn > 0 && <>You&apos;ll earn about {willEarn.toLocaleString()} points when this order is delivered.</>}
                  </p>
                </section>
              )}

              <section className="co-card">
                <h2 className="h3">Payment method</h2>
                {covered ? (
                  <p className="notice ok">Your gift card {gift.card?.code} covers this order. Nothing more to pay.</p>
                ) : (
                  <div className="co-pay" role="radiogroup" aria-label="Payment method">
                    {methods.map((m) => (
                      <label key={m} className={`co-opt${method === m ? " on" : ""}`}>
                        <input type="radio" name="co-method" value={m} checked={method === m} onChange={() => setMethod(m)} disabled={busy} />
                        <span>
                          <b>
                            <Icon name={METHOD_COPY[m].icon} size={16} />
                            {m === "partcod" ? `Pay ${f(settings.partialCodAdvance)} now, the rest on delivery` : METHOD_COPY[m].title}
                            {m === "cod" && r.codFee > 0 && <em className="co-fee">+{f(r.codFee)}</em>}
                            {m === "razorpay" && online.prepaid > 0 && <em className="co-def">{settings.prepaidDiscountPct}% off</em>}
                          </b>
                          <span>{METHOD_COPY[m].note}</span>
                          {m === "cod" && online.prepaid > 0 && <small className="co-save">Save {f(online.prepaid)} by paying online</small>}
                          {m === "partcod" && <small>No cash on delivery fee</small>}
                        </span>
                      </label>
                    ))}
                  </div>
                )}
                {!covered && (
                  <p className="co-paynote muted">
                    {method === "cod"
                      ? `A ${f(r.codFee)} handling fee applies to cash on delivery. Keep ${f(t.total)} in cash or UPI ready.`
                      : method === "partcod"
                        ? `Pay ${f(t.payNow)} now by UPI or card, then ${f(t.dueOnDelivery)} in cash or UPI when your order arrives.`
                        : "You'll confirm the payment in a secure window. We never see or store your card details."}
                  </p>
                )}

                {otpRequired && codChosen && (
                  <div className="co-otp" id="co-otp">
                    {otp.verifiedFor === phoneKey ? (
                      <p className="co-ok"><Icon name="check" size={16} /> Mobile number verified</p>
                    ) : (
                      <>
                        <p>
                          <b>Verify your mobile number</b>
                          <span className="muted"> We&apos;ll send a 6-digit code to {region === "in" ? "+91" : "+44"} {localPhone(addr.phone, region)} by SMS and WhatsApp.</span>
                        </p>
                        {otp.sentTo === phoneKey ? (
                          <div className="co-otp-row">
                            <label className="sr-only" htmlFor="co-otp-code">6-digit code</label>
                            <input
                              id="co-otp-code"
                              inputMode="numeric"
                              autoComplete="one-time-code"
                              maxLength={6}
                              placeholder="6-digit code"
                              value={otp.code}
                              onChange={(e) => setOtp((o) => ({ ...o, code: digits(e.target.value).slice(0, 6) }))}
                              aria-invalid={otp.error ? true : undefined}
                              aria-describedby={otp.error ? "co-otp-err" : undefined}
                            />
                            <button type="button" className="btn" onClick={checkCode} disabled={otp.busy || otp.code.length !== 6}>
                              {otp.busy ? "…" : "Verify"}
                            </button>
                          </div>
                        ) : null}
                        {otp.testCode && otp.sentTo === phoneKey && <p className="notice">Test mode: your code is {otp.testCode}</p>}
                        <button type="button" className="link co-otp-send" onClick={sendCode} disabled={otp.busy || resendIn > 0}>
                          {otp.sentTo === phoneKey ? (resendIn > 0 ? `Resend code in ${resendIn}s` : "Resend code") : "Send code"}
                        </button>
                        {otp.error && <p className="co-cerr" id="co-otp-err" role="alert">{otp.error}</p>}
                      </>
                    )}
                  </div>
                )}
              </section>
            </>
          )}

          <button type="submit" className="btn block co-desk-cta" disabled={blocked}>
            {busy ? "Please wait…" : cta}
          </button>
          {step === 2 && <p className="co-terms muted">By placing this order you agree to our <Link className="link" href="/help/terms">terms</Link> and <Link className="link" href="/help/returns">returns policy</Link>.</p>}
        </form>

        <aside className="co-side" aria-label="Order summary">
          <div className="co-items">
            <div className="co-items-head">
              <h2 className="h3">Your order</h2>
              <Link className="link" href="/bag">Edit bag</Link>
            </div>
            <ul>
              {lines.map((l) => {
                const unit = l.price[region].now + optionsPrice(l.options, region);
                return (
                  <li key={l.key}>
                    <div className="mount co-thumb">
                      <Image src={l.image} alt="" fill sizes="64px" />
                      <span className="co-q" aria-label={`Quantity ${l.qty}`}>{l.qty}</span>
                    </div>
                    <div>
                      <b>{l.name}</b>
                      <small>{[`Size ${l.size}`, ...optionLabels(l.options), ...(l.sale ? [l.sale.name] : [])].join(" · ")}</small>
                    </div>
                    <span className="co-lp">{f(unit * l.qty)}</span>
                  </li>
                );
              })}
            </ul>
          </div>
          <CouponBox c={coupon} />
          {step === 2 && <GiftCardBox g={gift} region={region} used={t.giftCard} />}
          <PriceSummary t={t} region={region} couponCode={coupon.discount ? coupon.code : undefined} giftCardCode={gift.card?.code} partCod={!covered && method === "partcod"} />
        </aside>
      </div>

      <div className="co-mbar">
        <div>
          <b>{f(method === "partcod" && !covered ? t.payNow : t.total)}</b>
          {method === "partcod" && !covered ? <small>Now · {f(t.dueOnDelivery)} on delivery</small> : t.savings > 0 ? <small>You save {f(t.savings)}</small> : <small>{r.taxNote}</small>}
        </div>
        <button type="submit" form="co-form" className="btn" disabled={blocked}>
          {busy ? "Please wait…" : step === 1 ? "Continue" : cta}
        </button>
      </div>
    </div>
  );
}

function Field({ id, label, error, full, children }: { id: string; label: string; error?: string; full?: boolean; children: React.ReactNode }) {
  return (
    <div className={`field${full ? " full" : ""}`}>
      <label htmlFor={`co-${id}`}>{label}</label>
      {children}
      {error && <span className="err" role="alert">{error}</span>}
    </div>
  );
}
