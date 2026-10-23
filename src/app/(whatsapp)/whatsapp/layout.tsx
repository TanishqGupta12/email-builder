import type { Metadata } from "next";
import { WaSendProgressProvider } from "@/components/whatsapp/WaSendProgressProvider";
import { WhatsAppNav } from "@/components/whatsapp/WhatsAppNav";

export const metadata: Metadata = {
  title: "WhatsApp portal",
  description: "Upload a CSV and send WhatsApp alerts one number at a time",
};

export default function WhatsAppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="wa-shell min-h-screen">
      <WaSendProgressProvider>
        <WhatsAppNav />
        {children}
      </WaSendProgressProvider>
    </div>
  );
}
