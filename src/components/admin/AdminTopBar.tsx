"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { setAdminScope } from "@/lib/actions/admin-scope";

type Scope = "all" | "in" | "uk";
const OPTIONS: { value: Scope; label: string; flag: string }[] = [
  { value: "all", label: "All", flag: "" },
  { value: "in", label: "India", flag: "🇮🇳" },
  { value: "uk", label: "UK", flag: "🇬🇧" },
];

/** Admin top bar: find anything, and pick which store every admin page shows (both, India or UK). */
export function AdminTopBar({ scope, locked = false }: { scope: Scope; locked?: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const pick = (s: Scope) =>
    start(async () => {
      await setAdminScope(s);
      router.refresh();
    });

  return (
    <div className="adm-top print:hidden">
      <form action="/admin/search" className="adm-search" role="search">
        <Icon name="search" size={16} />
        <input name="q" type="search" placeholder="Find an order, product or customer…" aria-label="Search the admin" autoComplete="off" />
      </form>
      {locked ? (
        <div className="adm-scope" title="Your account is set to one country. Ask the store owner to change it.">
          <span className="adm-scope-label">Store</span>
          <span className="adm-scope-lock">{OPTIONS.find((o) => o.value === scope)?.flag} {OPTIONS.find((o) => o.value === scope)?.label} only</span>
        </div>
      ) : (
      <div className="adm-scope" role="radiogroup" aria-label="Which store to show" aria-busy={pending || undefined}>
        <span className="adm-scope-label">Store</span>
        {OPTIONS.map((o) => (
          <button key={o.value} type="button" role="radio" aria-checked={scope === o.value} onClick={() => pick(o.value)} disabled={pending}>
            {o.flag && <span aria-hidden="true">{o.flag}</span>} {o.label}
          </button>
        ))}
      </div>
      )}
    </div>
  );
}
