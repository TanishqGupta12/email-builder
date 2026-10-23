import { AppNav } from "@/components/AppNav";
import { SendProgressProvider } from "@/components/SendProgressProvider";

export default function EmailLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <SendProgressProvider>
      <AppNav />
      {children}
    </SendProgressProvider>
  );
}
