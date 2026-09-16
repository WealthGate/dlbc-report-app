import { after, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { collection, deleteDoc, doc, getDoc, getDocs, query, setDoc, updateDoc, where, writeBatch } from 'firebase/firestore';
import { saveStaffProfile } from '../src/services/userProfiles.js';
import { persistMonthlyExpenses } from '../src/services/monthlyExpenseStore.js';

let env;
before(async () => { env = await initializeTestEnvironment({ projectId: 'demo-dlbc-reliability', firestore: { rules: fs.readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8089 } }); });
after(async () => { await env?.cleanup(); });
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async context => {
    for (const [id, role] of [['admin','admin'], ['chair','vetting_committee_chairman'], ['alias','Vetting Committee Chairman'], ['user','user'], ['finance','finance_reporter']]) {
      await setDoc(doc(context.firestore(), 'users', id), { role, country: 'Dominica', countryKey: 'dominica', email: `${id}@test.test` });
    }
  });
});
const dbFor = id => env.authenticatedContext(id, { email: `${id}@test.test` }).firestore();
const summaryPath = 'monthly_summaries/dominica__2026-09';
const settings = db => ({ db, countryKey: 'dominica', country: 'Dominica', month: '2026-09', email: 'chair@test.test', baseline: new Map(), rows: [] });
const row = (localId, amount = 25) => ({ localId, date: '2026-09-01', purpose: 'Transport', otherDetails: '', amount });

test('administrator edits a profile, preserves identity, and cannot overwrite a concurrent edit', async () => {
  const db = dbFor('admin');
  const original = { ...(await getDoc(doc(db, 'users/user'))).data(), id: 'user' };
  const changes = { displayName: 'Updated Reporter', branch: 'Goodwill', phone: '+17670000000', role: 'finance_reporter' };
  await saveStaffProfile({ db, original, changes, countryKey: 'dominica', actorUid: 'admin' });
  const saved = (await getDoc(doc(db, 'users/user'))).data();
  assert.equal(saved.displayName, 'Updated Reporter');
  assert.equal(saved.email, 'user@test.test');
  assert.equal(saved.countryKey, 'dominica');
  assert.equal(saved.updatedBy, 'admin');
  assert.equal(saved.password, undefined);
  await assert.rejects(saveStaffProfile({ db, original, changes, countryKey: 'dominica', actorUid: 'admin' }), /changed while/);
});

test('profile boundaries block self-demotion, cross-country edits, passwords, and login-email changes', async () => {
  const admin = dbFor('admin'), user = dbFor('user');
  await assertFails(updateDoc(doc(admin, 'users/admin'), { role: 'user' }));
  await assertFails(deleteDoc(doc(admin, 'users/admin')));
  await assertFails(updateDoc(doc(admin, 'users/user'), { email: 'wrong@test.test' }));
  await assertFails(updateDoc(doc(admin, 'users/user'), { password: 'never-store-this' }));
  await assertFails(updateDoc(doc(user, 'users/user'), { countryKey: 'another' }));
  await assertFails(updateDoc(doc(user, 'users/chair'), { displayName: 'Wrong' }));
  await env.withSecurityRulesDisabled(context => setDoc(doc(context.firestore(), 'users/foreign'), { email: 'foreign@test.test', countryKey: 'another', role: 'user' }));
  await assertFails(updateDoc(doc(admin, 'users/foreign'), { displayName: 'Wrong' }));
});

test('chairman and display-name role can read a new month, save and reload expenses and brought-forward balance', async () => {
  for (const id of ['chair', 'alias']) {
    const db = dbFor(id);
    const empty = await assertSucceeds(getDoc(doc(db, summaryPath)));
    assert.equal(empty.exists(), id !== 'chair');
    await assertSucceeds(setDoc(doc(db, summaryPath), { countryKey: 'dominica', month: '2026-09', balanceBroughtForward: 1250, updatedAt: 'v1' }));
    assert.equal((await getDoc(doc(db, summaryPath))).data().balanceBroughtForward, 1250);
  }
  const db = dbFor('chair');
  await persistMonthlyExpenses({ ...settings(db), rows: [row('a'), row('b', 50)] });
  const saved = await getDocs(query(collection(db, 'monthly_expense_records'), where('countryKey', '==', 'dominica'), where('month', '==', '2026-09')));
  assert.equal(saved.size, 2);
  assert.equal(saved.docs.reduce((sum, entry) => sum + entry.data().amount, 0), 75);
  assert.equal((await getDoc(doc(db, summaryPath))).data().balanceBroughtForward, 1250);
});

test('owner query finds legacy reports without country metadata; country query and owner query can coexist', async () => {
  await env.withSecurityRulesDisabled(async context => {
    await setDoc(doc(context.firestore(), 'reports', 'old'), { createdBy: 'chair@test.test', date: '2025-01-01' });
    await setDoc(doc(context.firestore(), 'reports', 'new'), { createdBy: 'user@test.test', countryKey: 'dominica', date: '2026-09-01' });
  });
  const db = dbFor('chair');
  assert.equal((await getDocs(query(collection(db, 'reports'), where('createdBy', '==', 'chair@test.test')))).size, 1);
  assert.equal((await getDocs(query(collection(db, 'reports'), where('countryKey', '==', 'dominica')))).size, 1);
});

test('ordinary user cannot self-promote; finance reader can read expenses but cannot change them or another country', async () => {
  await assertFails(updateDoc(doc(dbFor('user'), 'users/user'), { role: 'admin' }));
  const finance = dbFor('finance');
  await assertSucceeds(getDoc(doc(finance, summaryPath)));
  await assertSucceeds(getDocs(query(collection(finance, 'monthly_expense_records'), where('countryKey', '==', 'dominica'))));
  await assertFails(setDoc(doc(finance, summaryPath), { countryKey: 'dominica' }));
  await assertFails(getDoc(doc(dbFor('chair'), 'monthly_summaries/another__2026-09')));
});

test('combined report and notice commit atomically; denied notice leaves no partial report', async () => {
  const db = dbFor('user');
  const data = { createdBy: 'user@test.test', countryKey: 'dominica', financials: { expenses: [] }, isCombinedService: true };
  let batch = writeBatch(db);
  batch.set(doc(db, 'reports/combined'), data);
  batch.set(doc(db, 'combined_service_notices/combined'), data);
  await assertSucceeds(batch.commit());
  assert.equal((await getDoc(doc(db, 'reports/combined'))).exists(), true);
  batch = writeBatch(db);
  batch.set(doc(db, 'reports/failed'), data);
  batch.set(doc(db, 'combined_service_notices/failed'), { ...data, createdBy: 'different@test.test' });
  await assertFails(batch.commit());
  await env.withSecurityRulesDisabled(async context => assert.equal((await getDoc(doc(context.firestore(), 'reports/failed'))).exists(), false));
});

test('legacy migration preserves other rows; retry does not duplicate; deleting last expense stays deleted', async () => {
  const db = dbFor('chair');
  const legacyRows = [row('legacy-0'), row('legacy-1', 60)];
  await setDoc(doc(db, summaryPath), { countryKey: 'dominica', monthlyExpenses: legacyRows, balanceBroughtForward: 400, updatedAt: 'v1' });
  let entries = await persistMonthlyExpenses({ ...settings(db), rows: [row('legacy-0', 30)], legacyRows, summaryRevision: 'v1' });
  assert.equal(entries.length, 2);
  assert.equal(entries[1].amount, 60);
  let baseline = new Map(entries.map(entry => [entry.id, entry]));
  await persistMonthlyExpenses({ ...settings(db), baseline, rows: [entries[0]] });
  assert.equal((await getDocs(query(collection(db, 'monthly_expense_records'), where('countryKey', '==', 'dominica')))).size, 2);
  for (const entry of entries) {
    const current = (await getDoc(doc(db, 'monthly_expense_records', entry.id))).data();
    baseline = new Map([[entry.id, current]]);
    await persistMonthlyExpenses({ ...settings(db), baseline, deleteId: entry.id });
  }
  assert.equal((await getDocs(query(collection(db, 'monthly_expense_records'), where('countryKey', '==', 'dominica')))).size, 0);
  const summary = (await getDoc(doc(db, summaryPath))).data();
  assert.equal(summary.expenseRegisterInitialized, true);
  assert.deepEqual(summary.monthlyExpenses, []);
  assert.equal(summary.balanceBroughtForward, 400);
});

test('stale expense update cannot overwrite another editor', async () => {
  const db = dbFor('chair');
  const [entry] = await persistMonthlyExpenses({ ...settings(db), rows: [row('conflict')] });
  const baseline = new Map([[entry.id, entry]]);
  await updateDoc(doc(db, 'monthly_expense_records', entry.id), { amount: 99, updatedAt: 'another-edit' });
  await assert.rejects(persistMonthlyExpenses({ ...settings(db), baseline, rows: [{ ...entry, amount: 10 }] }), /changed or deleted/);
  assert.equal((await getDoc(doc(db, 'monthly_expense_records', entry.id))).data().amount, 99);
});
