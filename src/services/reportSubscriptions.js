import { collection, onSnapshot, query, where } from "firebase/firestore";

// Each legacy query is independent: one failed source must not hide the others.
export function subscribeToReports({ db, uid, email, countryKey, country, canReadCountry, onChange }) {
  const definitions = [
    ["your email", "createdBy", email],
    ["your account", "createdByUid", uid]
  ];
  if (canReadCountry && countryKey) definitions.push(["country key", "countryKey", countryKey]);
  if (canReadCountry && country) definitions.push(["country label", "country", country]);
  const sources = new Map(), confirmed = new Set(), errors = new Map();
  let active = true;
  const publish = () => {
    if (!active) return;
    const byId = new Map();
    for (const rows of sources.values()) for (const report of rows) byId.set(report.id, report);
    onChange({ reports: [...byId.values()], loading: confirmed.size < definitions.length && !errors.size,
      error: [...errors.values()].join(" ") });
  };
  const unsubscribers = definitions.map(([name, field, value]) => onSnapshot(
    query(collection(db, "reports"), where(field, "==", value)), { includeMetadataChanges: true },
    snapshot => {
      sources.set(name, snapshot.docs.map(document => ({ ...document.data(), id: document.id })));
      if (!snapshot.metadata.fromCache) confirmed.add(name);
      errors.delete(name); publish();
    }, () => { errors.set(name, `Unable to load reports by ${name}. Some saved entries may be hidden. Check your connection and permissions, then retry.`); publish(); }
  ));
  return () => { active = false; unsubscribers.forEach(unsubscribe => unsubscribe()); };
}
