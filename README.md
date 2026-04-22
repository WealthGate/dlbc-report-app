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
