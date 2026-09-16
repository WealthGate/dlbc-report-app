import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createServer } from 'vite';
import { chromium, expect } from '@playwright/test';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, collection, getDocs } from 'firebase/firestore';

test('administrator can edit and reload staff details, copy recovery information, and request a reset without exposing passwords', { timeout: 90000 }, async () => {
  const env = await initializeTestEnvironment({ projectId: 'demo-dlbc-reliability', firestore: { rules: fs.readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8089 } });
  const server = await createServer({ server: { host: '127.0.0.1', port: 5178 }, logLevel: 'error' });
  await server.listen();
  const executablePath = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe'].find(path => fs.existsSync(path));
  const browser = await chromium.launch({ executablePath, headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const errors = [], requests = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('dialog', dialog => dialog.accept());
  // Intercept only the test reset endpoint; no emails are sent to real accounts.
  await page.route('https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode*', async route => {
    requests.push(route.request().postDataJSON());
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ email: 'staff@test.test' }) });
  });
  try {
    await env.clearFirestore();
    await env.withSecurityRulesDisabled(async context => {
      await setDoc(doc(context.firestore(), 'users/browser-chair'), { displayName: 'Test Admin', role: 'admin', countryKey: 'dominica', country: 'Dominica', email: 'browser-chair@test.test' });
      await setDoc(doc(context.firestore(), 'users/staff'), { displayName: 'Test Staff', role: 'user', branch: 'Roseau', countryKey: 'dominica', country: 'Dominica', email: 'staff@test.test', createdAt: 'original-created-date' });
    });
    await page.goto('http://127.0.0.1:5178/tests/fixture.html?users');
    const staffRow = page.locator('tr').filter({ hasText: 'staff@test.test' });
    await staffRow.getByRole('button', { name: 'Edit profile', exact: true }).click();
    await page.getByLabel('Edit display name').fill('Updated Staff');
    await page.getByLabel('Edit phone').fill('+1 767 555 0100');
    await page.getByLabel('Edit location').selectOption('Goodwill');
    await page.getByLabel('Edit role').selectOption('vetting_committee_chairman');
    await page.getByRole('button', { name: 'Save profile', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('Profile saved');
    await page.reload();
    await expect(staffRow).toContainText('Updated Staff');
    await expect(staffRow).toContainText('Goodwill');
    await expect(staffRow).toContainText('Vetting Committee Chairman');
    await env.withSecurityRulesDisabled(async context => {
      const saved = (await getDoc(doc(context.firestore(), 'users/staff'))).data();
      assert.equal(saved.createdAt, 'original-created-date');
      assert.equal(saved.phone, '+1 767 555 0100');
      assert.equal(saved.password, undefined);
      assert.equal(saved.email, 'staff@test.test');
    });
    await staffRow.getByRole('button', { name: 'Account info', exact: true }).click();
    await expect(page.locator('pre')).toContainText('Sign-in email: staff@test.test');
    await expect(page.locator('pre')).toContainText('Passwords are private');
    await staffRow.getByRole('button', { name: 'Reset password', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('Password-reset email requested');
    assert.equal(requests.length, 1);
    assert.equal(requests[0].requestType, 'PASSWORD_RESET');
    assert.equal(requests[0].email, 'staff@test.test');
    assert.deepEqual(errors, []);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    fs.mkdirSync('artifacts/verification', { recursive: true });
    await page.screenshot({ path: 'artifacts/verification/staff-admin-2.3.0.png', fullPage: true });
  } finally { await browser.close(); await server.close(); await env.cleanup(); }
});

test('mobile monthly entries survive save/reload, AI draft finance sync, legacy visibility, and safe read errors', { timeout: 120000 }, async () => {
  const env = await initializeTestEnvironment({ projectId: 'demo-dlbc-reliability', firestore: { rules: fs.readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8089 } });
  const server = await createServer({ server: { host: '127.0.0.1', port: 5178 }, logLevel: 'error' });
  await server.listen();
  const executablePath = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe'].find(path => fs.existsSync(path));
  const browser = await chromium.launch({ executablePath, headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const errors = [], dialogs = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('dialog', async dialog => { dialogs.push(dialog.message()); await dialog.accept(); });
  const now = new Date(), month = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  const summaryPath = `monthly_summaries/dominica__${month}`;
  try {
    await env.clearFirestore();
    await env.withSecurityRulesDisabled(async context => {
      await setDoc(doc(context.firestore(), 'users/browser-chair'), { role: 'vetting_committee_chairman', countryKey: 'dominica', email: 'browser-chair@test.test' });
      await setDoc(doc(context.firestore(), `monthly_ai_reports/dominica__${month}`), { month, status: 'completed', enrichedReport: 'Monthly overview\nAttendance was encouraging.\n\nFinances\nTotal Income: 9999\nTotal Expense: 9999\nClosing Balance: 0\n\nConclusion\nThank you.' });
    });
    await page.goto('http://127.0.0.1:5178/tests/fixture.html');
    const save = page.getByRole('button', { name: 'Save letter', exact: true });
    await expect(save).toBeEnabled();
    const saveAndWait = async () => {
      const count = dialogs.length;
      await save.click();
      await expect.poll(() => dialogs.length).toBeGreaterThan(count);
      assert.equal(dialogs.at(-1), 'Monthly letter saved.');
      await expect(save).toBeEnabled();
    };
    // A new month with only the automatically supplied date must save without a phantom expense.
    await saveAndWait();
    const opening = page.getByPlaceholder('0.00').first();
    await opening.fill('1,250.00');
    const expenseTable = page.locator('table').filter({ has: page.getByRole('columnheader', { name: 'Status', exact: true }) });
    await expenseTable.locator('tbody select').first().selectOption('Transport');
    await expenseTable.getByPlaceholder('0.00').first().fill('50');
    await saveAndWait();
    await page.reload();
    await expect(opening).toHaveValue('1250');
    await expect(expenseTable.getByPlaceholder('0.00').first()).toHaveValue('50');
    await expenseTable.getByPlaceholder('0.00').first().fill('60');
    await expect(expenseTable.getByText('Unsaved changes')).toBeVisible();
    await page.getByRole('button', { name: 'Use as letter draft', exact: true }).click();
    await saveAndWait();
    await env.withSecurityRulesDisabled(async context => {
      const data = (await getDoc(doc(context.firestore(), summaryPath))).data();
      assert.equal(data.balanceBroughtForward, 1250);
      assert.match(data.text, /1390.00/);
      assert.doesNotMatch(data.text, /9999/);
      const expenses = await getDocs(collection(context.firestore(), 'monthly_expense_records'));
      assert.equal(expenses.size, 1);
      assert.equal(expenses.docs[0].data().amount, 60);
    });
    // Real touch gesture plus horizontal table movement in a narrow viewport.
    await page.evaluate(() => window.scrollTo(0, 0));
    const session = await page.context().newCDPSession(page);
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 180, y: 650 }] });
    for (let y = 600; y >= 150; y -= 50) await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 180, y }] });
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect.poll(() => page.evaluate(() => Math.max(window.scrollY, document.body.scrollTop)), { message: 'mobile touch scroll moves the page' }).toBeGreaterThan(100);
    await expenseTable.evaluate(table => table.parentElement.scrollLeft = 150);
    assert.ok(await expenseTable.evaluate(table => table.parentElement.scrollLeft > 0), 'wide table scrolls horizontally');
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'no page-level horizontal overflow');
    fs.mkdirSync('artifacts/verification', { recursive: true });
    await expenseTable.scrollIntoViewIfNeeded();
    await page.screenshot({ path: 'artifacts/verification/mobile-expenses-2.2.0.png' });
    // Financial action buttons must wrap rather than being clipped off the phone screen.
    const printStatement = page.getByRole('button', { name: 'Print statement only', exact: true });
    const buttonBox = await printStatement.boundingBox();
    assert.ok(buttonBox.x >= 0 && buttonBox.x + buttonBox.width <= 391);
    await page.setViewportSize({ width: 794, height: 1123 });
    await page.emulateMedia({ media: 'print' });
    const letter = page.locator('.monthly-letter-card');
    await letter.scrollIntoViewIfNeeded();
    assert.ok(await page.locator('.printable-area').evaluate(element => element.scrollWidth <= element.clientWidth + 1), 'printed content fits the page width');
    await page.screenshot({ path: 'artifacts/verification/print-letter-2.2.0.png', fullPage: true });
    await page.emulateMedia({ media: 'screen' });
    await page.setViewportSize({ width: 390, height: 844 });
    // Bad permissions must never turn saved data into an editable blank month.
    await env.withSecurityRulesDisabled(context => setDoc(doc(context.firestore(), 'users/browser-chair'), { role: 'user', countryKey: 'dominica' }));
    await page.reload();
    await expect(page.getByRole('alert')).toContainText('Saving is disabled');
    await expect(save).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Retry loading saved entries' })).toBeEnabled();
    await page.goto('http://127.0.0.1:5178/tests/fixture.html?dashboard');
    await expect(page.getByText('Belfast', { exact: true }).last()).toBeVisible();
    assert.deepEqual(errors, []);
  } finally { await browser.close(); await server.close(); await env.cleanup(); }
});
