import type { Metadata } from 'next';
import AccountDashboard from '@/components/account/AccountDashboard';

export const metadata: Metadata = { title: 'Your account · Scene Assembly', robots: { index: false, follow: false } };

export default function AccountPage() {
  return <AccountDashboard />;
}
