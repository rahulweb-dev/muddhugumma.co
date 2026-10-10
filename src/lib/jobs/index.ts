import "server-only";
import * as abandonedCarts from "./abandoned-carts";
import * as birthdays from "./birthdays";
import * as lowStock from "./low-stock";
import * as backInStock from "./back-in-stock";
import * as reviewRequests from "./review-requests";
import * as dailySummary from "./daily-summary";

/** Jobs reachable at /api/cron/<name>. Schedules live in .github/workflows/cron.yml (GitHub Actions). */
export const JOBS: Record<string, { run: () => Promise<string>; schedule: string; description: string }> = {
  "abandoned-carts": { run: abandonedCarts.run, schedule: "0 * * * *", description: "Remind signed-in shoppers about items left in their bag" },
  birthdays: { run: birthdays.run, schedule: "30 3 * * *", description: "Send birthday offers (09:00 IST)" },
  "low-stock": { run: lowStock.run, schedule: "0 4 * * *", description: "Email the team a low-stock summary (09:30 IST)" },
  "back-in-stock": { run: backInStock.run, schedule: "*/30 * * * *", description: "Tell waiting shoppers when a size is back" },
  "daily-summary": { run: dailySummary.run, schedule: "30 2 * * *", description: "Email the owner yesterday's sales, what's waiting and stock alerts (08:00 IST)" },
  "review-requests": { run: reviewRequests.run, schedule: "30 4 * * *", description: "Ask customers to review their order 4+ days after delivery (10:00 IST)" },
};
