// app/layout.tsx
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import { Providers } from "./providers";
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
  metadataBase: new URL("https://nbanana.mzork.com"),
  title: "Nano Banana UI — AI Image Studio",
  description: "Generate and edit images with Google Gemini, Pollinations FLUX, and Cloudflare Workers AI.",
  openGraph: {
    title: "Nano Banana UI — AI Image Studio",
    description:
      "Multi-engine AI image studio — Gemini, Pollinations FLUX, and Cloudflare Workers AI.",
    url: "https://nbanana.mzork.com",
    siteName: "Nano Banana UI",
    type: "website",
    images: [
      {
        url: "/og.png",
        width: 2400,
        height: 1260,
        alt: "Nano Banana UI — multi-engine AI image studio",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Nano Banana UI — AI Image Studio",
    description:
      "Multi-engine AI image studio — Gemini, Pollinations FLUX, and Cloudflare Workers AI.",
    images: ["/og.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <NuqsAdapter>
          <Providers>{children}</Providers>
        </NuqsAdapter>
      </body>
    </html>
  );
}
