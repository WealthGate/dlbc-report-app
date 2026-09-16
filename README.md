# DLBC Reporting App

DLBC Reporting App is a React + Firebase application for collecting branch activity reports, consolidating monthly reporting data, and generating official monthly church reports.

## Stack

- React 19 + Vite
- Firebase Authentication
- Cloud Firestore
- Firebase Cloud Functions
- OpenAI JavaScript SDK for backend-only monthly report enrichment

## Local Setup

1. Install frontend dependencies:

```bash
npm install
```

2. Install Cloud Functions dependencies:

```bash
npm install --prefix functions
```

3. Set the OpenAI API key for Firebase Functions.

For deployed Functions, use:

```bash
firebase functions:secrets:set OPENAI_API_KEY
```

For the local Functions emulator, copy [`functions/.env.example`](functions/.env.example) to `functions/.env` and set `OPENAI_API_KEY`.

4. Optional: point the frontend at the local Functions emulator.

Copy [`.env.example`](.env.example) to `.env.local` and set:

```bash
VITE_USE_FIREBASE_FUNCTIONS_EMULATOR=true
```

The default emulator host is `127.0.0.1:5001`.

5. Start the frontend:

```bash
npm run dev
```

6. Start the Firebase Functions emulator in a separate terminal when testing the AI monthly report flow locally:

```bash
npm run serve --prefix functions
```

## AI Monthly Report Flow

The monthly AI report feature:

- loads submitted `reports` for a selected month
- compiles structured monthly source data
- sends the compiled payload to OpenAI from Firebase Cloud Functions only
- stores both raw compiled data and the enriched report in `monthly_ai_reports`
- lets authorized users review, copy, and export the result from the monthly analytics view

## Required Secret

- `OPENAI_API_KEY`

## Deployment

Deploy the frontend, Firestore rules, and Cloud Functions with Firebase:

```bash
firebase deploy
```

## Android app

The Android app uses Capacitor to package the same React build used by Firebase Hosting.
It loads `https://dlbcdom.web.app` so deployments to Firebase Hosting are visible in
the installed Android app after it is closed and reopened. A new APK is only required
when native Android configuration, permissions, plugins, icons, or the app version changes.

1. Install the frontend dependencies, including Capacitor:

```bash
npm install
```

2. Generate the Android Studio project (first time only):

```bash
npx cap add android
```

3. Build and copy the current web app into Android:

```bash
npm run android:sync
```

4. Open the project in Android Studio to run it on a device or create a signed release:

```bash
npm run android:open
```

Use `npm run android:run` to build, sync, and launch directly on a connected Android device or emulator.

To create an installable debug APK without opening Android Studio, run:

```bash
npm run android:apk
```

The helper detects Java 21 and, on Windows, offers Windows Package Manager the
Microsoft OpenJDK 21 package when it is missing. The APK is copied to
`artifacts/DLBC-Reporting-debug.apk`. To build and install it
on an Android phone connected with USB debugging enabled, run:

```bash
npm run android:install
```
