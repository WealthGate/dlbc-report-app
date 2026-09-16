import React, { useEffect, useState } from "react";
import { deleteApp, initializeApp } from "firebase/app";
import {
  createUserWithEmailAndPassword,
  getAuth,
  sendPasswordResetEmail,
  setPersistence,
  inMemoryPersistence,
  signOut,
  updateProfile
} from "firebase/auth";
import { collection, deleteDoc, doc, onSnapshot, query, setDoc, where } from "firebase/firestore";
import { Trash2, UserPlus } from "lucide-react";
import StaffProfileEditor from "../components/StaffProfileEditor";
import { buildAccountInformation } from "../services/userProfiles";
import { copyTextToClipboard } from "../services/monthlyAiReportClient";
import { DEFAULT_BRANCHES } from "../reporting/serviceRecords";
import { Button, Card, formatRoleLabel, InputGroup, normalizeCountryKey } from "./viewShared";

const BRANCH_OPTIONS = [...DEFAULT_BRANCHES];

function getCreateUserErrorMessage(error) {
  const code = error?.code || "";
  switch (code) {
    case "auth/email-already-in-use":
      return "An account already exists for this email.";
    case "auth/invalid-credential":
    case "auth/wrong-password":
      return "The account already exists, but the password entered does not match it. Enter the original password to restore the profile, or reset the user's password in Firebase Authentication.";
    case "auth/invalid-email":
      return "Enter a valid email address.";
    case "auth/weak-password":
      return "Password is too weak. Use at least 6 characters.";
    case "permission-denied":
      return "You do not have permission to create staff profiles for this country.";
    default:
      return error?.message || "Unable to create the staff account.";
  }
}

export default function UserManagement({ userProfile, db, app, currentUserId }) {
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
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [editing, setEditing] = useState(null);
  const [resettingId, setResettingId] = useState("");
  const [information, setInformation] = useState("");
  const [loadingUsers, setLoadingUsers] = useState(true);

  const branches = BRANCH_OPTIONS;
  const countryLabel = userProfile?.country || "";
  const countryKey = userProfile?.countryKey || normalizeCountryKey(countryLabel);

  useEffect(() => {
    if (!countryKey) return;
    const q = query(collection(db, "users"), where("countryKey", "==", countryKey));
    const unsub = onSnapshot(
      q,
      (snap) => { setUsers(snap.docs.map((d) => ({ ...d.data(), id: d.id }))); setLoadingUsers(false); },
      (e) => { console.error(e); setLoadingUsers(false); setErrorMessage("Unable to load saved users. Check your connection and permissions before creating an account again."); }
    );
    return () => unsub();
  }, [countryKey, db]);

  const handleCreateUser = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage("");
    setErrorMessage("");
    let secondaryApp = null;
    try {
      const displayName = newUser.displayName.trim();
      const email = newUser.email.trim().toLowerCase();
      const secondaryAppName = `staff-create-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2)}`;
      secondaryApp = initializeApp(app.options, secondaryAppName);
      const secondaryAuth = getAuth(secondaryApp);
      // Never persist the new staff member's login on the administrator's device.
      await setPersistence(secondaryAuth, inMemoryPersistence);
      const credential = await createUserWithEmailAndPassword(
          secondaryAuth,
          email,
          newUser.password
        );

      await updateProfile(credential.user, { displayName });
      await setDoc(doc(db, "users", credential.user.uid), {
        displayName,
        email,
        branch: newUser.branch,
        role: newUser.role,
        country: countryLabel,
        countryKey,
        updatedAt: new Date().toISOString(),
        createdAt: new Date().toISOString()
      }, { merge: true });
      await signOut(secondaryAuth);
      setMessage("Staff account created. The user can now sign in with the email and password entered.");
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
      setErrorMessage(getCreateUserErrorMessage(e));
    } finally {
      if (secondaryApp) {
        await deleteApp(secondaryApp).catch(() => {});
      }
      setLoading(false);
    }
  };

  const handleDeleteUser = async (userId) => {
    if (userId === currentUserId) { setErrorMessage("You cannot remove your own administrator profile."); return; }
    if (window.confirm("Remove this user record? (This does NOT delete the auth account.)")) {
      try {
        await deleteDoc(doc(db, "users", userId));
        alert("User record removed.");
      } catch (e) {
        alert("Error: " + e.message);
      }
    }
  };

  const resetPassword = async profile => {
    if (!profile.email || !window.confirm(`Send a password-reset email to ${profile.email}?`)) return;
    setResettingId(profile.id); setErrorMessage(""); setMessage("");
    try {
      await sendPasswordResetEmail(getAuth(app), profile.email.trim());
      setMessage(`Password-reset email requested for ${profile.email}. Ask the user to check their inbox and spam folder. For privacy, Firebase may not disclose whether an account exists.`);
    } catch (error) { setErrorMessage(error.code === "auth/too-many-requests" ? "Too many reset requests. Please wait before trying again." : "Unable to send the reset email. Check the sign-in email and connection, then try again."); }
    finally { setResettingId(""); }
  };
  const showInformation = async profile => {
    const text = buildAccountInformation(profile);
    setInformation(text);
    try { await copyTextToClipboard(text); setMessage("Account information copied. Share it privately with the account owner."); }
    catch { setMessage("Account information is shown below. You can select and copy it to share privately with the account owner."); }
  };

  if (userProfile?.role !== "admin") return <Card className="p-5">Administrator access is required.</Card>;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <UserPlus className="text-blue-700" />
          Staff Accounts
        </h2>
        <Button variant="secondary" disabled={loading} onClick={() => { setEditing(null); setIsAdding((v) => !v); }}>
          {isAdding ? "Cancel" : "Add New User"}
        </Button>
      </div>

      {message && (
        <div role="status" className="rounded-md border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
          {message}
        </div>
      )}

      {errorMessage && (
        <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {errorMessage}
        </div>
      )}

      {information && <Card className="p-4"><pre className="whitespace-pre-wrap break-words text-sm font-sans">{information}</pre><button type="button" onClick={() => setInformation("")} className="text-blue-700 underline mt-2">Close account information</button></Card>}
      {editing && <StaffProfileEditor key={editing.id} profile={editing} db={db} countryKey={countryKey} actorUid={currentUserId} onClose={() => setEditing(null)} onSaved={text => { setEditing(null); setMessage(text); }} />}
      <p className="text-sm text-slate-600">Passwords cannot be viewed or recovered by an administrator. Use Reset password to help the user choose a new one securely.</p>
      {isAdding && (
        <Card className="p-6 bg-blue-50 border-blue-200">
          <h3 className="font-bold mb-4 text-blue-900">Register New Staff</h3>
          <form onSubmit={handleCreateUser}><fieldset disabled={loading} className="grid grid-cols-1 sm:grid-cols-2 gap-4 min-w-0">
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
            <InputGroup label="Password">
              <input
                type="password"
                required
                minLength={6}
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
            <div className="sm:col-span-2 pt-2">
              <Button type="submit" disabled={loading}>
                {loading ? "Creating..." : "Create User"}
              </Button>
            </div>
          </fieldset></form>
        </Card>
      )}

      <div className="bg-white rounded-lg border overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm text-left">
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
                  <div className="flex flex-wrap justify-end gap-2">
                  <button type="button" className="text-blue-700 underline" onClick={() => { setEditing(u); setIsAdding(false); setErrorMessage(""); setMessage(""); }}>Edit profile</button>
                  <button type="button" className="text-blue-700 underline" disabled={Boolean(resettingId)} onClick={() => resetPassword(u)}>{resettingId === u.id ? "Sending…" : "Reset password"}</button>
                  <button type="button" className="text-blue-700 underline" onClick={() => showInformation(u)}>Account info</button>
                  <button
                    type="button"
                    aria-label={`Remove profile for ${u.displayName || u.email}`}
                    disabled={u.id === currentUserId}
                    onClick={() => handleDeleteUser(u.id)}
                    className="inline-flex items-center justify-center text-red-500 hover:text-red-700 p-1 rounded"
                  >
                    <Trash2 size={16} />
                  </button>
                  </div>
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr>
                <td className="p-4 text-center text-slate-500 text-sm" colSpan={5}>
                  {loadingUsers ? "Loading saved users…" : errorMessage ? "The user list could not be loaded. Do not recreate existing accounts." : "No users found yet."}
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

