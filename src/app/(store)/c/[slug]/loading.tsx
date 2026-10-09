export default function Loading() {
  return (
    <div className="pad py-8" aria-busy="true" aria-label="Loading">
      <div className="pgrid">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex flex-col gap-2.5">
            <div className="skel aspect-[3/4]" />
            <div className="skel h-3 w-2/5" />
            <div className="skel h-3 w-4/5" />
          </div>
        ))}
      </div>
    </div>
  );
}
