import Link from "next/link";
import { Oops } from "@/components/Oops";

export default function NotFound() {
  return (
    <Oops
      script="Oh, darling"
      title="We couldn't"
      accent="find that page"
      actions={<><Link className="btn" href="/c/new">See new arrivals</Link><Link className="btn ghost" href="/">Go to home</Link></>}
    >
      <p>The link may be old or the piece may have sold out. Try the new arrivals or search for what you had in mind.</p>
    </Oops>
  );
}
