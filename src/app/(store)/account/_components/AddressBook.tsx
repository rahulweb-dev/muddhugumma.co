"use client";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { REGION_CONFIG, type Region } from "@/lib/region";
import { deleteAddress, saveAddress, setDefaultAddress, type ActionState } from "@/lib/actions/auth";
import { Field, FormNotice } from "./Field";
import { LocateButton, usePostcodeLookup, type GeoFill } from "@/components/address/AddressAutofill";

const ADDRESS_KEYS = ["line1", "line2", "city", "state", "postcode"] as const;

export type AddressItem = {
  id: string;
  name: string;
  phone: string;
  line1: string;
  line2: string;
  city: string;
  state: string;
  postcode: string;
  region: Region;
  isDefault: boolean;
};

const INITIAL: ActionState = { ok: false };
const MAX = 12;

export function AddressBook({ addresses, defaultRegion, defaultName, defaultPhone }: { addresses: AddressItem[]; defaultRegion: Region; defaultName: string; defaultPhone: string }) {
  // null = closed, "new" = adding, otherwise the id being edited
  const [editing, setEditing] = useState<string | null>(addresses.length ? null : "new");
  const [formKey, setFormKey] = useState(0);
  const [flash, setFlash] = useState<ActionState | null>(null);
  const [busy, startTransition] = useTransition();
  const router = useRouter();

  const open = (id: string) => {
    setFlash(null);
    setEditing(id);
    setFormKey((k) => k + 1);
  };
  const current = editing && editing !== "new" ? addresses.find((a) => a.id === editing) : undefined;

  const run = (fn: () => Promise<ActionState>) =>
    startTransition(async () => {
      const res = await fn();
      setFlash(res);
      router.refresh();
    });

  return (
    <div className="flex min-w-0 flex-col gap-7">
      {flash?.message && <FormNotice state={flash} />}

      {addresses.length > 0 && (
        <ul className="ac-addr-grid">
          {addresses.map((a) => {
            const country = a.region === "uk" ? "United Kingdom" : "India";
            return (
              <li key={a.id} className={`ac-addr-card${a.isDefault ? " is-default" : ""}${editing === a.id ? " is-editing" : ""}`}>
                <div className="ac-addr-tags">
                  <span className="chip">{a.region === "uk" ? "UK" : "India"}</span>
                  {a.isDefault && <span className="chip ac-default">Default</span>}
                </div>
                <address className="ac-addr">
                  <b>{a.name}</b>
                  <span>{a.line1}</span>
                  {a.line2 && <span>{a.line2}</span>}
                  <span>
                    {a.city}
                    {a.state ? `, ${a.state}` : ""} {a.postcode}
                  </span>
                  <span>{country}</span>
                  <span className="muted">Phone {a.phone}</span>
                </address>
                <div className="ac-addr-actions">
                  <button type="button" onClick={() => open(a.id)} disabled={busy}>
                    <Icon name="edit" size={15} /> Edit
                  </button>
                  {!a.isDefault && (
                    <button type="button" onClick={() => run(() => setDefaultAddress(a.id))} disabled={busy}>
                      <Icon name="check" size={15} /> Set as default
                    </button>
                  )}
                  <button
                    type="button"
                    className="danger"
                    disabled={busy}
                    onClick={() => {
                      if (window.confirm(`Remove the address for ${a.name}, ${a.city}?`)) {
                        if (editing === a.id) setEditing(null);
                        run(() => deleteAddress(a.id));
                      }
                    }}
                  >
                    <Icon name="trash" size={15} /> Remove
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {editing === null ? (
        addresses.length < MAX ? (
          <div>
            <button type="button" className="btn ghost" onClick={() => open("new")}>
              <Icon name="plus" size={16} /> Add a new address
            </button>
          </div>
        ) : (
          <p className="muted">You have saved {MAX} addresses, the most we keep. Remove one to add another.</p>
        )
      ) : (
        <AddressForm
          key={formKey}
          address={current}
          defaultRegion={current?.region ?? defaultRegion}
          defaultName={defaultName}
          defaultPhone={defaultPhone}
          isFirst={addresses.length === 0}
          onCancel={addresses.length ? () => setEditing(null) : undefined}
          onSaved={(s) => {
            setFlash(s);
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function AddressForm({
  address,
  defaultRegion,
  defaultName,
  defaultPhone,
  isFirst,
  onCancel,
  onSaved,
}: {
  address?: AddressItem;
  defaultRegion: Region;
  defaultName: string;
  defaultPhone: string;
  isFirst: boolean;
  onCancel?: () => void;
  onSaved: (s: ActionState) => void;
}) {
  const [state, action, pending] = useActionState(saveAddress, INITIAL);
  const [region, setRegion] = useState<Region>(defaultRegion);
  const cfg = REGION_CONFIG[region];
  const uk = region === "uk";
  const formRef = useRef<HTMLFormElement>(null);
  // Autofilled values for a location in the other country (the fields remount on region switch).
  const [prefill, setPrefill] = useState<Partial<Record<keyof AddressItem, string>>>({});

  const field = (k: string) => formRef.current?.elements.namedItem(k) as HTMLInputElement | HTMLSelectElement | null;
  /** Fill the address fields; with onlyEmpty, never overwrite what the shopper already typed. */
  const applyFill = (fill: GeoFill, onlyEmpty = false): string | void => {
    if (!fill.region) return "We deliver to India and the UK only, and that location is outside both. Please type the delivery address.";
    if (fill.region !== region) {
      const next: Partial<Record<keyof AddressItem, string>> = { name: field("name")?.value ?? "", phone: field("phone")?.value ?? "" };
      for (const k of ADDRESS_KEYS) next[k] = fill[k] ?? "";
      setPrefill(next);
      setRegion(fill.region);
      return;
    }
    for (const k of ADDRESS_KEYS) {
      const el = field(k);
      if (el && fill[k] && !(onlyEmpty && el.value)) el.value = fill[k];
    }
  };
  const lookupPostcode = usePostcodeLookup(region, (fill) => applyFill(fill, true));

  useEffect(() => {
    if (state.ok) onSaved(state);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  // Values typed before a failed save win over the stored address.
  const v = (k: keyof AddressItem) => prefill[k] ?? state.values?.[k] ?? (address ? String(address[k] ?? "") : "");
  const err = state.errors ?? {};

  return (
    <form ref={formRef} action={action} onSubmit={() => setPrefill({})} className="ac-panel ac-addr-form" noValidate>
      <div className="sec-head">
        <h2 className="h3">{address ? "Edit address" : "Add a new address"}</h2>
        {onCancel && (
          <button type="button" className="ac-x" onClick={onCancel} aria-label="Close form">
            <Icon name="x" size={18} />
          </button>
        )}
      </div>
      <input type="hidden" name="id" value={address?.id ?? ""} />
      <input type="hidden" name="region" value={region} />

      <fieldset className="ac-seg">
        <legend>Deliver to</legend>
        {(["in", "uk"] as Region[]).map((r) => (
          <label key={r} className={region === r ? "on" : undefined}>
            <input type="radio" name="region-pick" value={r} checked={region === r} onChange={() => { setPrefill({}); setRegion(r); }} />
            {REGION_CONFIG[r].label}
          </label>
        ))}
      </fieldset>

      <FormNotice state={state.ok ? undefined : state} />

      <LocateButton onFill={(fill) => applyFill(fill)} />

      {/* Region-specific fields remount on switch so stale values never carry across */}
      <div className="form-grid two" key={region}>
        <Field label="Full name" name="name" autoComplete="name" required maxLength={80} defaultValue={v("name") || defaultName} state={{ ok: false, errors: err }} />
        <Field
          label={uk ? "Phone" : "Mobile number"}
          name="phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          required
          maxLength={20}
          placeholder={uk ? "07700 900123" : "98765 43210"}
          defaultValue={v("phone") || defaultPhone}
          hint={uk ? "UK number for the courier." : "10-digit mobile for delivery updates."}
          state={{ ok: false, errors: err }}
        />
        <Field
          className="full"
          label={uk ? "Address line 1" : "Flat, house no., building"}
          name="line1"
          autoComplete="address-line1"
          required
          maxLength={120}
          defaultValue={v("line1")}
          state={{ ok: false, errors: err }}
        />
        <Field
          className="full"
          label={uk ? "Address line 2 (optional)" : "Area, street, landmark (optional)"}
          name="line2"
          autoComplete="address-line2"
          maxLength={120}
          defaultValue={v("line2")}
          state={{ ok: false, errors: err }}
        />
        <Field label={uk ? "Town or city" : "City"} name="city" autoComplete="address-level2" required maxLength={60} defaultValue={v("city")} state={{ ok: false, errors: err }} />
        {uk ? (
          <Field label="County (optional)" name="state" autoComplete="address-level1" maxLength={60} defaultValue={v("state")} state={{ ok: false, errors: err }} />
        ) : (
          <div className="field">
            <label htmlFor="f-state">State</label>
            <select id="f-state" name="state" autoComplete="address-level1" defaultValue={v("state")} aria-invalid={err.state ? true : undefined} required>
              <option value="">Choose a state</option>
              {(REGION_CONFIG.in.states ?? []).map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            {err.state && <span className="err">{err.state}</span>}
          </div>
        )}
        <Field
          label={cfg.postLabel}
          name="postcode"
          autoComplete="postal-code"
          inputMode={uk ? "text" : "numeric"}
          maxLength={uk ? 8 : 6}
          required
          placeholder={uk ? "LE1 6RL" : "500034"}
          defaultValue={v("postcode")}
          onChange={(e) => lookupPostcode(e.target.value)}
          hint={cfg.postHint}
          state={{ ok: false, errors: err }}
          style={uk ? { textTransform: "uppercase" } : undefined}
        />
      </div>

      {!isFirst && !address?.isDefault && (
        <label className="check">
          <input type="checkbox" name="isDefault" defaultChecked={state.values?.isDefault === "on"} /> Use as my default address
        </label>
      )}
      {isFirst && <p className="ac-hint">Your first address becomes your default for checkout.</p>}

      <div className="ac-form-actions">
        <button className="btn" disabled={pending} aria-busy={pending}>
          {pending ? "Saving…" : address ? "Save changes" : "Save address"}
        </button>
        {onCancel && (
          <button type="button" className="btn ghost" onClick={onCancel} disabled={pending}>
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
