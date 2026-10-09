/** Friendly full-width message for 404s and errors. */
export function Oops({ script, title, accent, children, actions }: { script: string; title: string; accent: string; children: React.ReactNode; actions: React.ReactNode }) {
  return (
    <div className="pad flex flex-col items-center gap-4 py-[72px] text-center">
      <span className="font-script text-[56px] leading-none text-cocoa" aria-hidden="true">{script}</span>
      <h1 className="h1">{title} <i>{accent}</i></h1>
      <div className="max-w-[44ch] text-muted [&_p]:m-0">{children}</div>
      <div className="flex flex-wrap justify-center gap-3">{actions}</div>
    </div>
  );
}
