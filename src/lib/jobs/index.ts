import "server-only";
import * as abandonedCarts from "./abandoned-carts";
import * as birthdays from "./birthdays";
import * as lowStock from "./low-stock";
import * as backInStock from "./back-in-stock";

/** Jobs reachable at /api/cron/<name>. Schedules live in vercel.json. */
export const JOBS: Record<string, { run: () => Promise<string>; schedule: string; description: string }> = {
  "abandoned-carts": { run: abandonedCarts.run, schedule: "0 * * * *", description: "Remind signed-in shoppers about items left in their bag" },
  birthdays: { run: birthdays.run, schedule: "30 3 * * *", description: "Send birthday offers (09:00 IST)" },
  "low-stock": { run: lowStock.run, schedule: "0 4 * * *", description: "Email the team a low-stock summary (09:30 IST)" },
  "back-in-stock": { run: backInStock.run, schedule: "*/30 * * * *", description: "Tell waiting shoppers when a size is back" },
};
