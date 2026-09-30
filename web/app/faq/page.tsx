import type { Metadata } from "next";

/** This path is the home page scrolled to a section (see MotionInit), so it is a real route and prefetches like any other. */
export { default } from "../page";

export const metadata: Metadata = { alternates: { canonical: "/" } };
