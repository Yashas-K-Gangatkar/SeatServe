import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as SonnerToaster } from "@/components/ui/sonner";
import { SoundProvider } from "@/lib/sound/SoundProvider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const SITE_URL = "https://notifetch.in";
const SITE_TITLE = "NotiFetch — order food to your classroom";
const SITE_DESCRIPTION =
  "NotiFetch turns your classroom into a food counter. Scan the door QR, order from the campus canteen, pay by UPI or card, and get snacks delivered at the break — to your classroom door. Payments by Razorpay.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: SITE_TITLE,
  description: SITE_DESCRIPTION,
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    url: SITE_URL,
    siteName: "NotiFetch",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: [
      {
        url: "/menu/samosa.jpg",
        width: 1024,
        height: 1024,
        alt: "Samosa and chai — ordered from your classroom with NotiFetch",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: ["/menu/samosa.jpg"],
  },
  icons: {
    icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🥟</text></svg>",
  },
};

export const viewport: Viewport = {
  themeColor: "#fbf7ef",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}>
        <SoundProvider>
          {children}
          <Toaster />
          <SonnerToaster position="top-center" theme="light" richColors closeButton />
        </SoundProvider>
      </body>
    </html>
  );
}
