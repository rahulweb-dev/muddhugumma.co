import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { imagekitConfigured } from "@/lib/imagekit";
import { DEFAULT_SLIDES, DEFAULT_STORY } from "@/lib/home-defaults";
import { HomeEditor } from "@/components/admin/site/HomeEditor";

export const metadata: Metadata = { title: "Homepage" };

export default async function AdminHomepage() {
  await requireAdmin("content.manage");
  const s = await getSettings();
  const saved = !!s.home?.slides?.length;

  return (
    <div className="adm-page">
      <header className="adm-head">
        <div>
          <p className="kick">Website</p>
          <h1 className="adm-title">Homepage</h1>
        </div>
        <Link className="adm-more" href="/" target="_blank">View on site</Link>
      </header>
      <p className="muted adm-small m-0">
        The big slides at the top and the story section. Category tiles come from <Link href="/admin/categories">Categories</Link>; the top bar and the scrolling strip from <Link href="/admin/settings">Settings</Link>.
      </p>
      <HomeEditor
        saved={saved}
        uploadsEnabled={imagekitConfigured()}
        initial={{
          slides: (saved ? s.home!.slides! : DEFAULT_SLIDES).map((x) => ({
            kicker: x.kicker ?? "", title: x.title ?? "", accent: x.accent ?? "", text: x.text ?? "", ctaLabel: x.ctaLabel ?? "", ctaHref: x.ctaHref ?? "",
            linkLabel: x.linkLabel ?? "", linkHref: x.linkHref ?? "", image: x.image ?? "", alt: x.alt ?? "",
          })),
          story: (() => {
            const st = s.home?.story?.title ? s.home.story : DEFAULT_STORY;
            return { kicker: st.kicker ?? "", title: st.title ?? "", accent: st.accent ?? "", text: st.text ?? "", image: st.image ?? "" };
          })(),
        }}
      />
    </div>
  );
}
