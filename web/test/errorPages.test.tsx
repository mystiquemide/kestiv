import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ErrorPage, WHERE_TO } from "../components/ErrorPage";
import { LIVE_ROUTES } from "../lib/routes";
import NotFound, { metadata } from "../app/not-found";
import ErrorBoundary from "../app/error";
import GlobalError from "../app/global-error";

describe("404 and error pages", () => {
  it("the 404 has one h1, a way home, three real destinations and no stock photo", () => {
    const html = renderToStaticMarkup(<NotFound />);
    expect(html.match(/<h1/g)).toHaveLength(1);
    expect(html).toContain("This step isn&#x27;t on the staircase.");
    expect(html).toContain('href="/"');
    for (const w of WHERE_TO) expect(html).toContain(`href="${w.href}"`);
    expect(html).not.toContain("<img");
    expect(html).not.toContain("—");
  });

  it("every destination it offers is a live page", () => {
    for (const w of WHERE_TO) expect(LIVE_ROUTES, w.href).toContain(w.href);
    expect(LIVE_ROUTES).toContain("/stake");
  });

  it("the 404 stays out of search results", () => {
    expect(metadata.robots).toEqual({ index: false });
    expect(metadata.title).toBe("Page not found");
  });

  it("the error page offers a retry button and a way home, and reassures without blaming the visitor", () => {
    const html = renderToStaticMarkup(<ErrorBoundary error={new Error("x")} reset={() => undefined} />);
    expect(html).toContain("Try again");
    expect(html).toContain("<button");
    expect(html).toContain('href="/"');
    expect(html).toContain("on our side");
    expect(html).not.toContain("—");
  });

  it("never leaks the error message or digest to the visitor", () => {
    const html = renderToStaticMarkup(<ErrorBoundary error={Object.assign(new Error("secret rpc key abc123"), { digest: "d1x9" })} reset={() => undefined} />);
    expect(html).not.toContain("abc123");
    expect(html).not.toContain("d1x9");
  });

  it("the global fallback carries its own page and a retry", () => {
    const html = renderToStaticMarkup(<GlobalError error={new Error("x")} reset={() => undefined} />);
    expect(html).toContain("<html");
    expect(html).toContain("Try again");
  });

  it("the shared layout takes any actions", () => {
    expect(renderToStaticMarkup(<ErrorPage eyebrow="e" title="t" text="x" actions={<a href="/z">Z</a>} />)).toContain('href="/z"');
  });
});
