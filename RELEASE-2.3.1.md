# DLBC Reporting 2.3.1

## Report reliability

- Load reports by owner email and immutable account UID, plus country key and legacy country label for authorised country readers. Merge by document ID so overlapping queries never display a report twice.
- Keep successful query results visible when another query fails. Show a warning and prevent new submissions until the report list has loaded without errors.
- Show loading, loaded/matching counts, refresh and "Show all saved reports" controls so a filtered or incomplete list is not confused with lost data.
- Reuse the same document ID when retrying a new form submission; record the creator UID and prevent users from impersonating or changing that UID.
- Save confirmation remains after the database acknowledges the atomic commit, not merely after pressing Save.

## Desktop update

The Windows application now loads https://dlbcdom.web.app on launch, matching the hosted Android configuration. This replaces the installed 2.0.0 desktop application's old bundled copy. Remote content has Node integration disabled, isolation and sandboxing enabled, and navigation restricted. An internet/load failure shows an explicit retry message.

Existing hosted Android installations receive website fixes on reopening/reloading. Older bundled Android installations still need the one-time hosted APK upgrade from the 2.3.0 release. The old Windows application needs the new installer once; subsequent website fixes do not require reinstalling it.

## Verification

Passed ESLint, Electron syntax check, production web build, 5 unit tests, 10 database-emulator tests and 2 browser tests (17 automated tests total).

Flows checked:

1. Create a report, close its subscription, reopen twice and find it again. Include legacy country-label records and a record owned by UID under an old email; exclude another country's records; show each document only once.
2. Reject a spoofed creator UID and changes to a saved UID.
3. Save/reload chairman expenses and brought-forward balance; migrate legacy expense rows without duplication; delete the last expense without resurrecting it; reject stale conflicting updates.
4. Commit combined report and notice together; denied notice writes leave no partial report.
5. Edit/reload authorised staff profile details and exercise password-reset UI with a mocked email request; reject unauthorised identity/role changes.
6. Mobile browser: save/reload monthly entries, apply AI draft while keeping finance totals, vertical touch scrolling, horizontal table scrolling, no viewport overflow, printed content width and disabled saving on read failures.
7. Unit checks: null-safe combined service handling, AI source includes saved expenses and opening balance, authoritative empty registers, draft expense validation, matching web/Android versions.

## Live report check, 20 September 2026

A read-only metadata scan of all 284 current service reports found no Roseau records for 2, 4, 6, 20 or 23 August 2026 and no Loubiere records for 20 or 23 August 2026. No combined reports on these dates or non-ISO stored dates explained the gaps. Other August records for both locations were present. No production records were added, changed or deleted during this check.

This establishes current absence, not whether a user previously attempted to save a report or whether a record was once deleted. The exact historical cause cannot be proven from the current records alone.
