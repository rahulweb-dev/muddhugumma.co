"use client";
// Development-only switcher for comparing the five listing grid designs on real data. Remove once a design is chosen.
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { LOOKS } from "./looks";
import { setLookAction } from "@/lib/actions/prefs";

export function LookPicker({ current }: { current: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const pick = (id: string) =>
    start(async () => {
      await setLookAction(id);
      router.refresh();
    });
  return (
    <div className="look-pick" role="radiogroup" aria-label="Preview grid design" aria-busy={pending}>
      <small>Grid design</small>
      <div>
        {LOOKS.map((l) => (
          <button key={l.id} type="button" role="radio" aria-checked={current === l.id} onClick={() => pick(l.id)}>
            <b>{l.id}</b> {l.name}
          </button>
        ))}
      </div>
    </div>
  );
}
