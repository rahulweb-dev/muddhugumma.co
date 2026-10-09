import { Suspense } from "react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { RegionFromUrl } from "@/components/HeaderClient";
import { SalesProvider } from "@/components/SalesProvider";
import { CompareProvider } from "@/components/compare/CompareProvider";
import { getRegion } from "@/lib/queries";
import { getActiveSales } from "@/lib/sales";
import { getSettings } from "@/lib/settings";
import { Assistant } from "@/components/assistant/Assistant";

export default async function StoreLayout({ children }: { children: React.ReactNode }) {
  const [region, sales, settings] = await Promise.all([getRegion(), getActiveSales(), getSettings()]);
  const whatsapp = region === "uk" ? settings.whatsappUk || settings.whatsappIn : settings.whatsappIn || settings.whatsappUk;
  return (
    <SalesProvider sales={sales}>
      <CompareProvider>
        <a className="sr-only" href="#main">Skip to content</a>
        <Header region={region} />
        <main id="main">{children}</main>
        <Footer region={region} />
        <Suspense fallback={null}><RegionFromUrl /></Suspense>
        <Assistant whatsapp={whatsapp} region={region} />
      </CompareProvider>
    </SalesProvider>
  );
}
