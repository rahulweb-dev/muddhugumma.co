// Staff roles and what each can do in the admin. Safe to import from client and server code.
export const STAFF_ROLES = ["admin", "manager", "packer", "stylist"] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];
export const isStaff = (role?: string): role is StaffRole => !!role && (STAFF_ROLES as readonly string[]).includes(role);

export const ROLE_LABEL: Record<StaffRole, string> = {
  admin: "Owner / admin",
  manager: "Store manager",
  packer: "Packing & dispatch",
  stylist: "Stylist & tailoring",
};

export const PERMISSIONS = {
  "dashboard.view": "See the dashboard",
  "reports.view": "See sales reports and margins",
  "orders.view": "See orders",
  "orders.manage": "Change order status and payments",
  "orders.ship": "Ship orders and print packing slips",
  "returns.manage": "Handle returns and exchanges",
  "products.manage": "Add and edit products and categories, bulk upload",
  "merch.manage": "Sales, bundles, lookbooks, coupons, gift cards",
  "content.manage": "Journal posts, pages and the homepage",
  "reviews.manage": "Moderate reviews",
  "customers.view": "See customers",
  "enquiries.manage": "Answer contact-form messages",
  "bookings.manage": "Handle consult bookings",
  "stitching.manage": "Run the blouse stitching board",
  "messages.view": "See sent emails and WhatsApp messages",
  "staff.manage": "Add staff and change roles",
  "settings.manage": "Change store settings",
  "activity.view": "See the activity log",
} as const;
export type Permission = keyof typeof PERMISSIONS;

const ALL = Object.keys(PERMISSIONS) as Permission[];

export const ROLE_PERMISSIONS: Record<StaffRole, Permission[]> = {
  admin: ALL,
  manager: ALL.filter((p) => p !== "staff.manage" && p !== "settings.manage"),
  packer: ["dashboard.view", "orders.view", "orders.ship", "returns.manage", "enquiries.manage"],
  stylist: ["dashboard.view", "orders.view", "bookings.manage", "stitching.manage", "reviews.manage", "customers.view", "enquiries.manage"],
};

export const can = (role: string | undefined, perm: Permission) => isStaff(role) && ROLE_PERMISSIONS[role].includes(perm);
