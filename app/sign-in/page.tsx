import type { Metadata } from 'next';
import AccountAccess from '@/components/account/AccountAccess';
export const metadata: Metadata = { title: 'Sign in · Scene Assembly', robots: { index: false, follow: false } };
export default function SignInPage() { return <AccountAccess mode="sign-in" />; }
