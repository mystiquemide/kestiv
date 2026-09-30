import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Footer } from "@/components/Footer";
import { HideOnPaths } from "@/components/HideOnPaths";
import { MotionInit } from "@/components/MotionInit";
import { Nav } from "@/components/Nav";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const revalidate = 60;

const SITE = "https://kestiv.midelabs.xyz";
const DESCRIPTION =
  "Kestiv turns a token's creator fees into a founder stake, and locks every token it buys where nobody can cancel it.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  alternates: { canonical: "/" },
  openGraph: { type: "website", siteName: "Kestiv", title: "Kestiv · Own what you launched", description: DESCRIPTION, url: SITE },
  twitter: { card: "summary", title: "Kestiv · Own what you launched", description: DESCRIPTION, creator: "@Kestiv_xyz" },
  title: { default: "Kestiv · Own what you launched", template: "%s · Kestiv" },
  description: DESCRIPTION,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col bg-canvas text-ink">
        <Nav />
        <div className="flex-1">{children}</div>
        <HideOnPaths paths={["/stake"]}>
          <Footer />
        </HideOnPaths>
        <MotionInit />
      </body>
    </html>
  );
}
