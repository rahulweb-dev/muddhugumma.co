"use client";
import Link from "next/link";
import { useEffect } from "react";
import { Oops } from "@/components/Oops";

export default function StoreError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => console.error(error), [error]);
  return (
    <Oops
      script="Sorry"
      title="Something"
      accent="went wrong"
      actions={<><button className="btn" onClick={reset}>Try again</button><Link className="btn ghost" href="/">Go to home</Link></>}
    >
      <p>This page didn&apos;t load properly. Try again, and if it keeps happening, message us on WhatsApp and we&apos;ll help you place your order.</p>
      {error.digest && <p className="mt-2 text-xs">Reference: {error.digest}</p>}
    </Oops>
  );
}
