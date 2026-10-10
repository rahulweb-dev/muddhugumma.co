import type { Metadata } from "next";
import type { Types } from "mongoose";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { Activity, User } from "@/lib/models";
import { PERMISSIONS, ROLE_LABEL, ROLE_PERMISSIONS, STAFF_ROLES, type StaffRole } from "@/lib/permissions";
import { fmtDate, fmtDateTime } from "@/lib/admin-data";
import { AddStaffForm, StaffRowControls, StaffStoreControl } from "@/components/admin/StaffManager";

export const metadata: Metadata = { title: "Staff" };

type LeanStaff = { _id: Types.ObjectId; name: string; email: string; phone?: string; role: StaffRole; storeLock?: string; createdAt?: Date };

export default async function StaffPage() {
  const me = await requireAdmin("staff.manage");
  await db();
  const staff = await User.find({ role: { $in: STAFF_ROLES } }, { name: 1, email: 1, phone: 1, role: 1, storeLock: 1, createdAt: 1 })
    .sort({ role: 1, name: 1 })
    .lean<LeanStaff[]>();
  const ids = staff.map((s) => String(s._id));
  const last = await Activity.aggregate<{ _id: string; at: Date }>([
    { $match: { actorId: { $in: ids } } },
    { $group: { _id: "$actorId", at: { $max: "$createdAt" } } },
  ]);
  const lastSeen = new Map(last.map((l) => [l._id, l.at]));
  const admins = staff.filter((s) => s.role === "admin").length;
  const order: Record<StaffRole, number> = { admin: 0, manager: 1, packer: 2, stylist: 3 };
  staff.sort((a, b) => order[a.role] - order[b.role] || a.name.localeCompare(b.name));

  return (
    <div className="adm-page">
      <header className="adm-head">
        <div>
          <p className="kick">Admin</p>
          <h1 className="adm-title">Staff <span className="muted">({staff.length})</span></h1>
          <p className="muted adm-small">Role changes and removals take effect immediately.</p>
        </div>
      </header>

      <section className="adm-card">
        <h2 className="h3">Add a team member</h2>
        <AddStaffForm />
      </section>

      <div className="table-wrap adm-card flush">
        <table className="t adm-t">
          <thead>
            <tr><th>Name</th><th>Email</th><th>Since</th><th>Last admin action</th><th>Store access</th><th>Role</th></tr>
          </thead>
          <tbody>
            {staff.map((s) => {
              const id = String(s._id);
              return (
                <tr key={id}>
                  <td>{s.name}{id === me.uid ? <> <span className="chip">You</span></> : null}</td>
                  <td><a className="adm-a" href={`mailto:${s.email}`}>{s.email}</a></td>
                  <td className="nowrap">{fmtDate(s.createdAt)}</td>
                  <td className="nowrap">{lastSeen.get(id) ? fmtDateTime(lastSeen.get(id)) : <span className="muted">None yet</span>}</td>
                  <td><StaffStoreControl id={id} name={s.name} role={s.role} lock={s.storeLock === "in" || s.storeLock === "uk" ? s.storeLock : ""} /></td>
                  <td>
                    <StaffRowControls id={id} name={s.name} role={s.role} isMe={id === me.uid} lastAdmin={s.role === "admin" && admins <= 1} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <section className="adm-card">
        <h2 className="h3">What each role can do</h2>
        <div className="table-wrap">
          <table className="t adm-t">
            <thead>
              <tr><th>Permission</th>{STAFF_ROLES.map((r) => <th key={r} className="text-center">{ROLE_LABEL[r]}</th>)}</tr>
            </thead>
            <tbody>
              {(Object.keys(PERMISSIONS) as (keyof typeof PERMISSIONS)[]).map((p) => (
                <tr key={p}>
                  <td>{PERMISSIONS[p]}</td>
                  {STAFF_ROLES.map((r) => (
                    <td key={r} className="text-center">{ROLE_PERMISSIONS[r].includes(p) ? <span className="text-ok font-bold" aria-label="Yes">✓</span> : <span className="muted" aria-label="No">·</span>}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
