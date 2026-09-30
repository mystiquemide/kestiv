"use client";

/** Last resort: replaces the whole layout when even the layout fails, so it carries its own styles. */
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#F6F6F6", color: "#1F1F1F", fontFamily: "system-ui, sans-serif", textAlign: "center", padding: 24 }}>
        <div>
          <h1 style={{ fontSize: 40, fontWeight: 500, margin: 0 }}>That didn&apos;t load.</h1>
          <p style={{ fontSize: 18, color: "#5D5D5D", margin: "16px 0 32px" }}>It&apos;s on our side. Your stake and the chain are untouched.</p>
          <button type="button" onClick={() => reset()} style={{ background: "#D9A441", color: "#1F1F1F", border: 0, borderRadius: 99, padding: "14px 22px", fontSize: 15, fontWeight: 500, cursor: "pointer" }}>
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
