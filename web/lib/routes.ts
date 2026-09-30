/** Pages that exist. A button that points at a page renders only once the page is listed here. */
export const LIVE_ROUTES: readonly string[] = [];

export const routeLive = (href: string): boolean => LIVE_ROUTES.includes(href);
