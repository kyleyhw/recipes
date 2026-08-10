import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Recipes",
  description: "Personal recipe collection: storage, scaling, macros, and sharing.",
};

export const viewport: Viewport = {
  // The application is used one-handed at a kitchen counter; the layout is
  // designed mobile-first and must not be zoom-locked.
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="min-h-dvh bg-bg text-text antialiased">{children}</body>
    </html>
  );
}
