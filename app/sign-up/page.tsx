import type { Metadata } from 'next';
import AccountAccess from '@/components/account/AccountAccess';
export const metadata: Metadata = { title: 'Create an account · Scene Assembly', robots: { index: false, follow: false } };
export default function SignUpPage() { return <AccountAccess mode="sign-up" />; }
