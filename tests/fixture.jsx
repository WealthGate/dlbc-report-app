import React from 'react';
import { createRoot } from 'react-dom/client';
import { initializeApp } from 'firebase/app';
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore';
import MonthlyAnalytics from '../src/views/MonthlyAnalytics';
import Dashboard from '../src/views/Dashboard';
import UserManagement from '../src/views/UserManagement';
import PrintStyles from '../src/components/PrintStyles';
import '../src/index.css';

const role = new URLSearchParams(location.search).get('role') || 'vetting_committee_chairman';
const app = initializeApp({ projectId: 'demo-dlbc-reliability', apiKey: 'demo-key', appId: 'demo-app' });
const db = getFirestore(app);
connectFirestoreEmulator(db, '127.0.0.1', 8089, { mockUserToken: { sub: 'browser-chair', email: 'browser-chair@test.test' } });
const now = new Date();
const month = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
const reports = [{ id: 'current', date: `${month}-01`, branch: 'Goodwill', serviceType: 'Tuesday Bible Study', attendance: { men: 10, women: 10 }, financials: { income: [{ label: 'Offering', amount: 200 }], expenses: [] } }, { id: 'old', date: '2025-01-05', branch: 'Belfast', serviceType: 'Sunday Worship Service', attendance: { men: 5 } }];
createRoot(document.getElementById('root')).render(
  <div className="p-4 mx-auto max-w-6xl">
    <PrintStyles />
    {location.search.includes('users') ? <UserManagement userProfile={{role: 'admin',country: 'Dominica',countryKey:'dominica'}} db={db} app={app} currentUserId="browser-chair" /> : location.search.includes('dashboard') ? <Dashboard reports={reports} /> : <MonthlyAnalytics reports={reports} userProfile={{ role, country: 'Dominica', countryKey: 'dominica' }} app={app} db={db} auth={{ currentUser: { email: 'browser-chair@test.test' } }} />}
  </div>
);
