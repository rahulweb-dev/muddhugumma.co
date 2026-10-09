"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addStaff, changeStaffRole, removeStaff, type StaffResult } from "@/lib/actions/staff";
import { ROLE_LABEL, STAFF_ROLES, type StaffRole } from "@/lib/permissions";

const Msg = ({ m }: { m: StaffResult | null }) => (m ? <p className={`notice ${m.ok ? "ok" : "err"}`} role="status">{m.ok ? m.message : m.error}</p> : null);

export function AddStaffForm() {
  const router = useRouter();
  const [f, setF] = useState({ email: "", name: "", role: "packer" as StaffRole, password: "" });
  const [msg, setMsg] = useState<StaffResult | null>(null);
  const [pending, start] = useTransition();
  const fields = msg && !msg.ok ? msg.fields ?? {} : {};
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));

  return (
    <form
      className="adm-form"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        setMsg(null);
        start(async () => {
          const res = await addStaff(f);
          setMsg(res);
          if (res.ok) {
            setF({ email: "", name: "", role: "packer", password: "" });
            router.refresh();
          }
        });
      }}
    >
      <div className="adm-grid4">
        <div className="field">
          <label htmlFor="s-email">Email</label>
          <input id="s-email" type="email" autoComplete="off" value={f.email} aria-invalid={!!fields.email} onChange={(e) => set("email", e.target.value)} required />
          {fields.email ? <span className="err">{fields.email}</span> : null}
        </div>
        <div className="field">
          <label htmlFor="s-name">Name (new accounts)</label>
          <input id="s-name" autoComplete="off" value={f.name} aria-invalid={!!fields.name} onChange={(e) => set("name", e.target.value)} />
          {fields.name ? <span className="err">{fields.name}</span> : null}
        </div>
        <div className="field">
          <label htmlFor="s-role">Role</label>
          <select id="s-role" value={f.role} onChange={(e) => set("role", e.target.value as StaffRole)}>
            {STAFF_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="s-pw">Temporary password (new accounts)</label>
          <input id="s-pw" type="text" autoComplete="new-password" value={f.password} aria-invalid={!!fields.password} onChange={(e) => set("password", e.target.value)} placeholder="10+ characters" />
          {fields.password ? <span className="err">{fields.password}</span> : null}
        </div>
      </div>
      <p className="muted adm-small">If the email already has a customer account, that account is promoted and keeps its own password; name and password are ignored.</p>
      <div className="adm-row">
        <button className="btn adm-btn" disabled={pending}>{pending ? "Adding…" : "Add to team"}</button>
      </div>
      <Msg m={msg} />
    </form>
  );
}

export function StaffRowControls({ id, name, role, isMe, lastAdmin }: { id: string; name: string; role: StaffRole; isMe: boolean; lastAdmin: boolean }) {
  const router = useRouter();
  const [value, setValue] = useState<StaffRole>(role);
  const [confirm, setConfirm] = useState(false);
  const [msg, setMsg] = useState<StaffResult | null>(null);
  const [pending, start] = useTransition();
  const locked = isMe || lastAdmin;
  const run = (fn: () => Promise<StaffResult>) =>
    start(async () => {
      setMsg(null);
      const res = await fn();
      setMsg(res);
      setConfirm(false);
      if (res.ok) router.refresh();
      else setValue(role);
    });

  return (
    <div className="adm-stack gap-2">
      <div className="adm-row">
        <select
          aria-label={`Role for ${name}`}
          className="adm-select"
          value={value}
          disabled={pending || locked}
          onChange={(e) => {
            const next = e.target.value as StaffRole;
            setValue(next);
            run(() => changeStaffRole(id, next));
          }}
        >
          {STAFF_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
        </select>
        {confirm ? (
          <>
            <button type="button" className="btn adm-btn adm-btn-danger" disabled={pending} onClick={() => run(() => removeStaff(id))}>Yes, remove</button>
            <button type="button" className="btn ghost adm-btn" disabled={pending} onClick={() => setConfirm(false)}>Keep</button>
          </>
        ) : (
          <button type="button" className="btn ghost adm-btn adm-btn-danger-ghost" disabled={pending || locked} onClick={() => setConfirm(true)}>Remove</button>
        )}
      </div>
      {locked ? <small className="muted">{isMe ? "This is you. Another admin can change your role." : "Last admin: add another admin before changing this."}</small> : null}
      <Msg m={msg} />
    </div>
  );
}
