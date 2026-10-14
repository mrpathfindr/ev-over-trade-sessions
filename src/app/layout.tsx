import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

const geistPixel = localFont({
  src: "./fonts/GeistPixel-Square.woff2",
  variable: "--font-geist-pixel",
  display: "swap",
});

export const metadata: Metadata = {
  title: "EV over Trade Sessions",
  description: "Random session-open entries vs expectancy — BTC/ETH/SOL 5-minute charts",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={geistPixel.variable}>
      <body>{children}</body>
    </html>
  );
}
