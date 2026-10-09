"use client";
import Image from "next/image";
import Link from "next/link";
import { useActionState } from "react";
import { lookupTracking, type TrackLookupState } from "@/lib/actions/shipping";
import { fmtTrackDay } from "@/lib/shipping";
import { ShipmentTracker } from "./ShipmentTracker";

export function TrackForm({ initialNumber = "" }: { initialNumber?: string }) {
  const [state, action, pending] = useActionState<TrackLookupState, FormData>(lookupTracking, { status: "idle" });
  const number = state.status === "notfound" ? state.number : state.status === "found" ? state.data.number : initialNumber;
  const contact = state.status === "notfound" ? state.contact : "";

  return (
    <div className="flex flex-col gap-8">
      <form action={action} className="grid gap-3.5 border border-line bg-paper p-5 md:grid-cols-[1fr_1fr_auto] md:items-end">
        <div className="field">
          <label htmlFor="t-number">Order number</label>
          <input id="t-number" name="number" required defaultValue={number} placeholder="e.g. MG261009AB12" autoCapitalize="characters" spellCheck={false} />
        </div>
        <div className="field">
          <label htmlFor="t-contact">Email or phone used at checkout</label>
          <input id="t-contact" name="contact" required defaultValue={contact} placeholder="you@example.com or 98765 43210" autoComplete="email" />
        </div>
        <button className="btn" type="submit" disabled={pending}>{pending ? "Finding…" : "Track order"}</button>
        {state.status === "notfound" && (
          <p className="notice err m-0 md:col-span-3" role="alert">
            We couldn&apos;t find an order with those details. Check the order number in your confirmation email, and use the same email or phone you gave at checkout.
          </p>
        )}
      </form>

      {state.status === "found" && (
        <section className="flex flex-col gap-5 border border-line p-5 md:p-7" aria-live="polite">
          <header className="flex flex-wrap items-center gap-4">
            {state.data.firstItem?.image && (
              <span className="mount relative block h-[84px] w-16 shrink-0">
                <Image src={state.data.firstItem.image} alt="" fill sizes="64px" />
              </span>
            )}
            <div className="flex min-w-0 flex-col gap-1">
              <span className="kick">Order {state.data.number}</span>
              <b className="text-[15px]">
                {state.data.firstItem?.name}
                {state.data.itemCount > 1 ? ` + ${state.data.itemCount - 1} more` : ""}
              </b>
              <small className="text-muted">
                Placed {fmtTrackDay(state.data.placedAt, state.data.region)}
                {state.data.city ? ` · Delivering to ${state.data.city}` : ""}
              </small>
            </div>
          </header>
          <ShipmentTracker status={state.data.status} region={state.data.region} shipment={state.data.shipment} placedAt={state.data.placedAt} />
          <p className="m-0 border-t border-line pt-4 text-sm text-muted">
            Have an account? See every order in <Link className="link" href="/account/orders">My orders</Link>. Questions? <Link className="link" href="/contact">Contact us</Link>.
          </p>
        </section>
      )}
    </div>
  );
}
