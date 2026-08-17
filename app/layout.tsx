// app/layout.tsx
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import { brand } from "@/lib/brand";
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
  metadataBase: new URL(brand.siteUrl),
  title: brand.metaTitle,
  description: brand.metaDescription,
  openGraph: {
    title: brand.metaTitle,
    description: brand.metaDescription,
    url: brand.siteUrl,
    siteName: brand.name,
    type: "website",
    images: [
      {
        url: "/og.png",
        width: 2400,
        height: 1260,
        alt: brand.ogImageAlt,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: brand.metaTitle,
    description: brand.metaDescription,
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
        {process.env.NODE_ENV === "production" && (
          <>
            {/* beforeInteractive scripts are injected into the document head. */}
            <Script
              id="plausible-loader"
              strategy="beforeInteractive"
              async
              src="https://plausible.io/js/pa-IvadW-ZiJU71wFTpSyL7C.js"
            />
            <Script id="plausible-init" strategy="beforeInteractive">
              {`window.plausible=window.plausible||function(){(plausible.q=plausible.q||[]).push(arguments)},plausible.init=plausible.init||function(i){plausible.o=i||{}};
plausible.init()`}
            </Script>
          </>
        )}
        <NuqsAdapter>
          <Providers>{children}</Providers>
        </NuqsAdapter>
      </body>
    </html>
  );
}
