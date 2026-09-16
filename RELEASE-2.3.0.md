# DLBC Reporting 2.3.0

## User administration

- Administrators can edit staff display name, location, role and phone/contact information.
- Sign-in email, country identifiers and creation date are preserved. Changing a profile never renames or deletes existing reports.
- Concurrent profile edits are rejected instead of silently overwriting another administrator's changes.
- Administrators can request Firebase password-reset emails and copy non-secret account information to share privately with the account owner. Existing passwords cannot be retrieved and are never stored in Firestore.
- Creating an already-existing account no longer signs in as that user and overwrites their staff profile. Temporary staff-creation sessions use memory-only storage.
- Database rules prevent self-promotion, self-removal of administrator access, cross-country user-profile changes, and storing passwords in profiles.

## Saved-entry reliability and mobile updates

- Dashboard defaults to all saved reports instead of hiding older months. An owner subscription also retrieves legacy reports lacking country metadata.
- New-report saves no longer crash when there is no previous combined service. Reports and combined-service notices commit together.
- Removed the automatic historical-report delete/recreate migration. Legacy Headquarters labels resolve to Goodwill without moving the underlying records.
- Monthly reads fail visibly and disable saving rather than presenting failed reads as editable empty data.
- Monthly document permissions support an as-yet-unsaved month. Expense writes preserve legacy rows, use stable IDs, and detect conflicting edits.
- Deleting the final monthly expense does not resurrect an old summary copy. Saved monthly expenses and formatted opening balances feed AI source compilation.
- Blank automatically dated expense rows do not prevent saving a letter. Unsaved changes to a previously saved expense are labelled correctly.
- Finance totals stay synchronized when the AI report is used as the letter draft.
- Phone-sized action buttons wrap; pages and wide tables scroll. Printed content stays within the page width.
- The web UI and Android metadata use version 2.3.0 (Android versionCode 3). The hosted Android wrapper uses https://dlbcdom.web.app. Web changes are picked up when the app reloads; already-open 2.3.0 clients check for a new version and offer an update prompt. Earlier APKs that contain only bundled offline assets need a one-time APK replacement. Native Android changes still require an APK update.

## Verification

- `npm run lint`: passed.
- `npm test`: 5 reporting/unit checks passed.
- Firestore emulator: 8 checks passed, including administrator profile updates, conflicts and access restrictions; chairman reads; legacy report visibility; atomic combined saves; expense migration/deletion and concurrent edits.
- Headless Chromium/Edge: 2 end-to-end scenarios passed at 390px phone width. Tested profile editing and reload, a mocked password-reset endpoint (no production emails sent), copying account information, monthly expense/balance save and reload, AI draft finance synchronization, touch scrolling, horizontal table scrolling, print width and failed-read safeguards.
- Browser evidence is under `artifacts/verification` and is not committed.
- Testing uses a demo database, not production church records. No physical Android device or paper print was used for these checks.

## Deployment limitation

Firebase rejected Functions deployment because dlbcdom is not on the Blaze plan. AI backend deployment requires the project owner to enable billing and configure the OPENAI_API_KEY secret. Website/profile/password-reset and database-rule changes do not depend on those AI functions. Do not claim AI generation is live until Functions deployment succeeds.
