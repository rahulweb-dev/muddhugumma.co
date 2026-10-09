import Link from "next/link";

const STEPS = ["Bag", "Address", "Payment"] as const;

/** Bag → Address → Payment header. */
export function Steps({ current }: { current: 0 | 1 | 2 }) {
  return (
    <ol className="co-steps" aria-label="Checkout steps">
      {STEPS.map((s, i) => {
        const state = i < current ? "done" : i === current ? "on" : "";
        return (
          <li key={s} className={state} aria-current={i === current ? "step" : undefined}>
            {i === 0 && current > 0 ? <Link href="/bag">{s}</Link> : <span>{s}</span>}
          </li>
        );
      })}
    </ol>
  );
}
