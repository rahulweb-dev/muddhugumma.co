import Link from "next/link";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Oops } from "@/components/Oops";
import { getRegion } from "@/lib/queries";

// Catches URLs outside every route group, so it renders the shop chrome itself.
export default async function RootNotFound() {
  const region = await getRegion();
  return (
    <>
      <Header region={region} />
      <main id="main">
        <Oops
          script="Oh, darling"
          title="We couldn't"
          accent="find that page"
          actions={<><Link className="btn" href="/c/new">See new arrivals</Link><Link className="btn ghost" href="/">Go to home</Link></>}
        >
          <p>The link may be old or the piece may have sold out. Try the new arrivals or search for what you had in mind.</p>
        </Oops>
      </main>
      <Footer region={region} />
    </>
  );
}
