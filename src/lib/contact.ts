// Contact form options, shared by the page, the server action and the admin inbox.
export const CONTACT_TOPICS = [
  "My order or delivery",
  "Returns and exchanges",
  "Sizing and fit",
  "Bridal or custom orders",
  "Payments and refunds",
  "Wholesale or collaborations",
  "Something else",
] as const;
export type ContactTopic = (typeof CONTACT_TOPICS)[number];
