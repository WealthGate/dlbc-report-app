import React, { useEffect, useState } from "react";
import { addDoc, collection, deleteDoc, doc, onSnapshot, query, where } from "firebase/firestore";
import { Trash2, UserPlus } from "lucide-react";
import { DEFAULT_BRANCHES } from "../reporting/serviceRecords";
import { Button, Card, formatRoleLabel, InputGroup, normalizeCountryKey } from "./viewShared";

const BRANCH_OPTIONS = [...DEFAULT_BRANCHES];

export default function UserManagement({ userProfile, db }) {
  const [users, setUsers] = useState([]);
  const [isAdding, setIsAdding] = useState(false);
  const [newUser, setNewUser] = useState({
    displayName: "",
    email: "",
    password: "",
    branch: "Roseau",
    role: "user",
    country: userProfile?.country || ""
  });
  const [loading, setLoading] = useState(false);

  const branches = BRANCH_OPTIONS;
  const countryLabel = userProfile?.country || "";
  const countryKey = userProfile?.countryKey || normalizeCountryKey(countryLabel);

  useEffect(() => {
    if (!countryKey) return;
    const q = query(collection(db, "users"), where("countryKey", "==", countryKey));
    const unsub = onSnapshot(
      q,
      (snap) => setUsers(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      (e) => console.error(e)
    );
    return () => unsub();
  }, [countryKey]);

  const handleCreateUser = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      // NOTE: Admin-created accounts should ideally be created via Cloud Functions.
      // For now, we just create the user document; the owner should sign up via the login screen.
      await addDoc(collection(db, "pending_users"), {
        ...newUser,
        country: countryLabel,
        countryKey,
        createdAt: new Date().toISOString()
      });
      alert("User request saved to 'pending_users'. You can later wire a function to create auth accounts.");
      setIsAdding(false);
      setNewUser({
        displayName: "",
        email: "",
        password: "",
        branch: "Roseau",
        role: "user",
        country: countryLabel
      });
    } catch (e) {
      alert("Error creating user: " + e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteUser = async (userId) => {
    if (window.confirm("Remove this user record? (This does NOT delete the auth account.)")) {
      try {
        await deleteDoc(doc(db, "users", userId));
        alert("User record removed.");
      } catch (e) {
        alert("Error: " + e.message);
      }
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <UserPlus className="text-blue-700" />
          Staff Accounts
        </h2>
        <Button variant="secondary" onClick={() => setIsAdding((v) => !v)}>
          {isAdding ? "Cancel" : "Add New User"}
        </Button>
      </div>

      {isAdding && (
        <Card className="p-6 bg-blue-50 border-blue-200">
          <h3 className="font-bold mb-4 text-blue-900">Register New Staff</h3>
          <form onSubmit={handleCreateUser} className="grid grid-cols-2 gap-4">
            <InputGroup label="Display Name">
              <input
                required
                className="w-full border p-2 rounded"
                value={newUser.displayName}
                onChange={(e) => setNewUser({ ...newUser, displayName: e.target.value })}
              />
            </InputGroup>
            <InputGroup label="Email">
              <input
                type="email"
                required
                className="w-full border p-2 rounded"
                value={newUser.email}
                onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
              />
            </InputGroup>
            <InputGroup label="Suggested Password">
              <input
                type="text"
                className="w-full border p-2 rounded"
                value={newUser.password}
                onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
              />
            </InputGroup>
            <InputGroup label="Branch">
              <select
                className="w-full border p-2 rounded"
                value={newUser.branch}
                onChange={(e) => setNewUser({ ...newUser, branch: e.target.value })}
              >
                {branches.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            </InputGroup>
            <InputGroup label="Country">
              <input
                className="w-full border p-2 rounded bg-slate-100"
                value={countryLabel}
                disabled
              />
            </InputGroup>
            <InputGroup label="Role">
              <select
                className="w-full border p-2 rounded"
                value={newUser.role}
                onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}
              >
                <option value="user">Reporter</option>
                <option value="finance_reporter">Finance Reporter</option>
                <option value="admin">Administrator</option>
                <option value="vetting_committee_chairman">Vetting Committee Chairman</option>
              </select>
            </InputGroup>
            <div className="col-span-2 pt-2">
              <Button type="submit" disabled={loading}>
                {loading ? "Saving..." : "Save Request"}
              </Button>
            </div>
          </form>
        </Card>
      )}

      <div className="bg-white rounded-lg border overflow-hidden">
        <table className="w-full text-sm text-left">
          <thead className="bg-slate-100 border-b">
            <tr>
              <th className="p-3">Name</th>
              <th className="p-3">Email</th>
              <th className="p-3">Branch</th>
              <th className="p-3">Role</th>
              <th className="p-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b last:border-b-0">
                <td className="p-3">{u.displayName || "-"}</td>
                <td className="p-3">{u.email}</td>
                <td className="p-3">{u.branch}</td>
                <td className="p-3">{formatRoleLabel(u.role)}</td>
                <td className="p-3 text-right">
                  <button
                    onClick={() => handleDeleteUser(u.id)}
                    className="inline-flex items-center justify-center text-red-500 hover:text-red-700 p-1 rounded"
                  >
                    <Trash2 size={16} />
                  </button>
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr>
                <td className="p-4 text-center text-slate-500 text-sm" colSpan={5}>
                  No users found yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// --- USER PROFILE ---

