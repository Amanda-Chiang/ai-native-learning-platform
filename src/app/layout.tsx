import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { SiteHeader } from "@/features/auth/site-header.tsx";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "AI-Native Learning Platform",
  description: "An AI-native learning platform.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body>
        <div
          style={{
            flexShrink: 0,
            padding: "8px 20px",
            borderBottom: "1px solid var(--border)",
            background: "var(--surface)",
            fontSize: 13,
          }}
        >
          <SiteHeader />
        </div>
        <div style={{ flex: 1, minHeight: 0 }}>{children}</div>
      </body>
    </html>
  );
}
