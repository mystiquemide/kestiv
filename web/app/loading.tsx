/** Shown while a page's data loads on navigation: grey blocks where the content will land, never a blank screen. */
export default function Loading() {
  return (
    <main aria-busy="true">
      <span role="status" className="sr-only">
        Loading
      </span>
      <section className="bg-band pt-[168px] pb-[120px]">
        <div className="container-k">
          <div className="mx-auto flex max-w-[880px] flex-col items-center gap-6" aria-hidden="true">
            <div className="skeleton h-4 w-40 rounded-pill" />
            <div className="skeleton h-16 w-[min(560px,90%)] rounded-card" />
            <div className="skeleton h-5 w-[min(420px,80%)] rounded-pill" />
          </div>
        </div>
      </section>
      <div className="container-k -mt-[60px] rounded-t-[60px] bg-canvas pt-[120px] pb-[120px]" aria-hidden="true">
        <div className="skeleton h-4 w-32 rounded-pill" />
        <div className="skeleton mt-6 h-12 w-[min(480px,90%)] rounded-card" />
        <div className="mt-14 grid gap-4 md:grid-cols-2">
          <div className="skeleton h-56 rounded-card" />
          <div className="skeleton h-56 rounded-card" />
        </div>
      </div>
    </main>
  );
}
