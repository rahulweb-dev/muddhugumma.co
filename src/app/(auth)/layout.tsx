import Image from "next/image";
import Link from "next/link";

// Sign-in and sign-up: a quiet page with just the logo, no shop navigation, footer or app bar.
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="pad flex items-center justify-between border-b border-line py-3">
        <Link href="/" className="flex items-center gap-2.5" aria-label="House of Muddhugumma home">
          <Image src="brand/logo.webp" alt="" width={40} height={40} className="rounded-full border border-line" priority />
          <span className="leading-none">
            <small className="block font-display text-[8.5px] tracking-[.38em] text-muted">HOUSE OF</small>
            <strong className="mt-[3px] block font-script text-[25px] font-normal text-cocoa">Muddhugumma</strong>
          </span>
        </Link>
        <Link href="/" className="text-xs font-bold uppercase tracking-[.14em] text-muted hover:text-ink">← Back to shop</Link>
      </header>
      <main id="main" className="flex-1">{children}</main>
    </div>
  );
}
