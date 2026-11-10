import type { Metadata, Viewport } from "next";
import "@fontsource-variable/vazirmatn";
import "./globals.css";
import "./experience.css";
import "./mission.css";

export const metadata: Metadata = {
  title: "ریروکا | Riruka",
  description: "ریروکا، استودیوی شخصیت و میز مأموریت شخصی برای تلگرام.",
  icons: { icon: "/favicon.ico" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0b0b12",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="fa" dir="rtl"><body>{children}</body></html>;
}
