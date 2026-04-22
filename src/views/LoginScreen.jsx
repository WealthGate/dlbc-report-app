import React, { useState } from "react";
import {
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signInWithEmailAndPassword
} from "firebase/auth";
import { doc, setDoc } from "firebase/firestore";
import { DEFAULT_BRANCHES } from "../reporting/serviceRecords";
import { Button, Card, InputGroup, normalizeCountryKey } from "./viewShared";

function getAuthErrorMessage(error) {
  const code = error?.code || "";
  switch (code) {
    case "auth/invalid-credential":
    case "auth/user-not-found":
    case "auth/wrong-password":
      return "Invalid email or password.";
    case "auth/invalid-email":
      return "Enter a valid email address.";
    case "auth/email-already-in-use":
      return "This email is already in use. Try signing in instead.";
    case "auth/weak-password":
      return "Password is too weak. Use at least 6 characters.";
    case "auth/operation-not-allowed":
      return "Email/password sign-in is not enabled for this project.";
    case "auth/too-many-requests":
      return "Too many attempts. Please wait a bit and try again.";
    default:
      return error?.message || "Authentication failed. Please try again.";
  }
}

const BRANCH_OPTIONS = [...DEFAULT_BRANCHES];

export default function LoginScreen({ auth, db }) {
  const [isRegistering, setIsRegistering] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [branch, setBranch] = useState("Roseau");
  const [country, setCountry] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);
  const [resetting, setResetting] = useState(false);

  const branches = BRANCH_OPTIONS;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setNotice("");

    try {
      if (isRegistering) {
        // Create auth user
        const cred = await createUserWithEmailAndPassword(auth, email, password);
        // Create basic profile doc (role = 'user' by default)
        await setDoc(doc(db, "users", cred.user.uid), {
          displayName,
          branch,
          country,
          countryKey: normalizeCountryKey(country),
          email,
          role: "user",
          createdAt: new Date().toISOString()
        });
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
    } catch (e) {
      console.error(e);
      setError(getAuthErrorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async () => {
    setError("");
    setNotice("");
    if (!email) {
      setError("Enter your email above to reset your password.");
      return;
    }
    setResetting(true);
    try {
      await sendPasswordResetEmail(auth, email);
      setNotice("Password reset email sent. Check your inbox.");
    } catch (e) {
      console.error(e);
      setError(getAuthErrorMessage(e));
    } finally {
      setResetting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
      <Card className="w-full max-w-md p-8">
        <div className="text-center mb-8">
          <img
            src="./logo.png"
            alt="DLBC Logo"
            className="h-24 mx-auto mb-4"
            onError={(e) => (e.target.style.display = "none")}
          />
          <h1 className="text-2xl font-bold text-blue-900">DLBC Reporting</h1>
          <p className="text-slate-500">
            {isRegistering ? "Create a new account" : "Sign in to access the system"}
          </p>
        </div>
        {error && (
          <div className="bg-red-50 text-red-600 p-3 rounded mb-4 text-sm border-l-4 border-red-500">
            {error}
          </div>
        )}
        {notice && (
          <div className="bg-green-50 text-green-700 p-3 rounded mb-4 text-sm border-l-4 border-green-500">
            {notice}
          </div>
        )}
        <form onSubmit={handleSubmit} className="space-y-4">
          {isRegistering && (
            <>
              <InputGroup label="Full Name">
                <input
                  required
                  className="w-full border p-2 rounded"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                />
              </InputGroup>
              <InputGroup label="Country">
                <input
                  required
                  className="w-full border p-2 rounded"
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                  placeholder="Country"
                />
              </InputGroup>
              <InputGroup label="Branch">
                <select
                  className="w-full border p-2 rounded"
                  value={branch}
                  onChange={(e) => setBranch(e.target.value)}
                >
                  {branches.map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                </select>
              </InputGroup>
            </>
          )}
          <InputGroup label="Email">
            <input
              type="email"
              required
              className="w-full border p-2 rounded"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </InputGroup>
          <InputGroup label="Password">
            <input
              type="password"
              required
              minLength={6}
              className="w-full border p-2 rounded"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </InputGroup>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Processing..." : isRegistering ? "Create Account" : "Sign In"}
          </Button>
        </form>
        {!isRegistering && (
          <div className="mt-3 text-center text-sm">
            <button
              type="button"
              onClick={handleResetPassword}
              className="text-slate-600 hover:text-blue-700 hover:underline"
              disabled={resetting}
            >
              {resetting ? "Sending reset email..." : "Forgot password?"}
            </button>
          </div>
        )}
        <div className="mt-6 text-center text-sm">
          <button
            type="button"
            onClick={() => {
              setIsRegistering((v) => !v);
              setError("");
              setNotice("");
            }}
            className="text-blue-700 hover:underline"
          >
            {isRegistering ? "Already have an account? Sign In" : "Need an account? Create one"}
          </button>
        </div>
      </Card>
    </div>
  );
}

// --- SIMPLE MONTHLY ANALYTICS ---

