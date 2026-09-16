import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { build } from 'esbuild';
import { compileMonthlyReportData, buildCompiledReportText } from '../functions/src/reportCompilation.js';
import { isCombinedServiceRecord } from '../src/reporting/serviceRecords.js';

test('new service has no previous combined report; null is safe', () => {
  assert.equal(isCombinedServiceRecord(null), false);
  assert.equal(isCombinedServiceRecord({ isCombinedService: true }), true);
});
test('saved monthly register and formatted opening balance are included in AI source totals', () => {
  const compiled = compileMonthlyReportData({ month: '2026-09', country: 'Dominica', countryKey: 'dominica',
    reports: [{ id: 'one', date: '2026-09-01', branch: 'Goodwill', serviceType: 'Tuesday Bible Study', attendance: { men: 10 }, financials: { income: [{ label: 'Offering', amount: 200 }], expenses: [{ label: 'Legacy', amount: 999 }] } }],
    monthlyExpenses: [{ date: '2026-09-01', purpose: 'Transport', amount: '50.00' }], balanceBroughtForward: '1,250.00' });
  const finance = compiled.structuredCompilation.financialData;
  assert.equal(finance.totalIncome, 200);
  assert.equal(finance.totalExpense, 50);
  assert.equal(finance.balanceBroughtForward, 1250);
  assert.equal(finance.closingBalance, 1400);
  assert.match(buildCompiledReportText(compiled), /Balance Brought Forward \(XCD\): 1250.00/);
});
test('empty authoritative register does not resurrect expenses from service records', () => {
  const compiled = compileMonthlyReportData({ month: '2026-09', country: 'Dominica', reports: [{ id: 'a', date: '2026-09-01', financials: { income: [], expenses: [{ label: 'Old', amount: 999 }] } }], monthlyExpenses: [], expenseRegisterInitialized: true });
  assert.equal(compiled.structuredCompilation.financialData.totalExpense, 0);
});
test('blank dated expense is a draft, not a validation-blocking expense; both null helpers are safe', async () => {
  const compiled = await build({ entryPoints: ['src/views/viewShared.jsx'], bundle: true, platform: 'node', format: 'esm', write: false });
  const shared = await import('data:text/javascript;base64,' + Buffer.from(compiled.outputFiles[0].text).toString('base64'));
  assert.equal(shared.isMonthlyExpenseRowMeaningful(shared.defaultMonthlyExpenseRow('2026-09-01')), false);
  assert.equal(shared.isCombinedServiceRecord(null), false);
});
test('web and Android release versions agree', () => {
  const version = JSON.parse(fs.readFileSync('package.json')).version;
  assert.equal(JSON.parse(fs.readFileSync('public/version.json')).version, version);
  assert.match(fs.readFileSync('android/app/build.gradle','utf8'), new RegExp(`versionName "${version.replaceAll('.', '\\.') }"`));
});
