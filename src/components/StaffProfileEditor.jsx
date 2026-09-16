import React, { useState } from "react";
import { Button, Card, InputGroup, formatRoleLabel, normalizeRole } from "../views/viewShared";
import { DEFAULT_BRANCHES } from "../reporting/serviceRecords";
import { saveStaffProfile, STAFF_ROLES } from "../services/userProfiles";

export default function StaffProfileEditor({ profile, db, countryKey, actorUid, onClose, onSaved }) {
  const normalizedRole = normalizeRole(profile.role);
  const role = ["committee_chairman", "vetting_committee_chair"].includes(normalizedRole) ? "vetting_committee_chairman" : ["accountant", "financial_secretary", "finance_secretary"].includes(normalizedRole) ? "finance_reporter" : normalizedRole;
  const [draft, setDraft] = useState({ displayName: profile.displayName || "", branch: profile.branch === "Headquarters" ? "Goodwill" : profile.branch || "", role, phone: profile.phone || "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const branches = [...new Set([...DEFAULT_BRANCHES, draft.branch].filter(Boolean))];
  const change = (key, value) => setDraft(previous => ({ ...previous, [key]: value }));
  const save = async event => {
    event.preventDefault();
    setSaving(true); setError("");
    try {
      await saveStaffProfile({ db, original: profile, changes: draft, countryKey, actorUid });
      onSaved(`Profile saved for ${draft.displayName}. Existing reports and sign-in details were preserved.`);
    } catch (err) { setError(err.message || "Unable to save this profile."); }
    finally { setSaving(false); }
  };
  return <Card className="p-5 border-blue-200 bg-blue-50">
    <h3 className="font-semibold mb-3">Edit user profile</h3>
    {error && <p role="alert" className="text-red-700 mb-3">{error}</p>}
    <form onSubmit={save}>
      <fieldset disabled={saving} className="grid grid-cols-1 sm:grid-cols-2 gap-3 min-w-0">
        <InputGroup label="Display name"><input aria-label="Edit display name" required maxLength={120} className="w-full border rounded p-2" value={draft.displayName} onChange={event => change("displayName", event.target.value)} /></InputGroup>
        <InputGroup label="Phone / contact"><input aria-label="Edit phone" type="tel" maxLength={60} className="w-full border rounded p-2" value={draft.phone} onChange={event => change("phone", event.target.value)} /></InputGroup>
        <InputGroup label="Location"><select aria-label="Edit location" required className="w-full border rounded p-2" value={draft.branch} onChange={event => change("branch", event.target.value)}><option value="">Select location</option>{branches.map(branch => <option key={branch}>{branch}</option>)}</select></InputGroup>
        <InputGroup label="Role"><select aria-label="Edit role" disabled={profile.id === actorUid} className="w-full border rounded p-2" value={draft.role} onChange={event => change("role", event.target.value)}>{STAFF_ROLES.map(value => <option key={value} value={value}>{formatRoleLabel(value)}</option>)}</select></InputGroup>
        <p className="sm:col-span-2 text-sm break-words">Sign-in email: {profile.email}<br />Country: {profile.country || countryKey}<br />These identifiers are read-only here to protect login and historical records. Passwords are never displayed or stored in profiles.</p>
        <div className="sm:col-span-2 flex flex-wrap gap-2"><Button type="submit">{saving ? "Saving…" : "Save profile"}</Button><Button variant="secondary" type="button" onClick={onClose}>Cancel editing</Button></div>
      </fieldset>
    </form>
  </Card>;
}
