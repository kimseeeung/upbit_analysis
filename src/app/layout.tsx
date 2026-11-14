import type { Metadata, Viewport } from "next";
import { MaintenanceBanner } from "@/components/MaintenanceBanner";
import { OfflineManager } from "@/components/OfflineManager";
import { SwRegister } from "@/components/SwRegister";
import "./globals.css";

export const metadata: Metadata = {
  title: "머슬매니아",
  description: "트레이너와 수강생이 함께 쓰는 PT 일정·이용권 관리",
  applicationName: "머슬매니아",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/icons/icon.svg", type: "image/svg+xml" },
      { url: "/icons/favicon-48.png", sizes: "48x48", type: "image/png" },
    ],
    apple: "/icons/apple-touch-icon.png",
  },
  appleWebApp: { capable: true, title: "머슬매니아" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#7c5cff",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" className="h-full antialiased">
      <body className="flex min-h-full flex-col">
        <SwRegister />
        <OfflineManager />
        <MaintenanceBanner />
        {children}
      </body>
    </html>
  );
}
