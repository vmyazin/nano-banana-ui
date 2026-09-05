import type { ReactNode } from 'react';
import Link from 'next/link';
import { BrandWordmark } from '@/components/BrandMark';

export default function AccountPageShell({
  children,
  title,
  description,
  eyebrow = 'YOUR CREATIVE SPACE',
  narrow = false,
}: {
  children: ReactNode;
  title: string;
  description: string;
  eyebrow?: string;
  narrow?: boolean;
}) {
  return (
    <div className="min-h-screen w-full overflow-x-clip">
      <header className="border-b border-[var(--border)] bg-[hsl(var(--tint-hue)_38%_5%/0.72)] backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-6 py-3.5 sm:px-8 md:px-12 md:py-4 lg:px-16">
          <Link href="/" aria-label="Go to Scene Assembly home" className="block min-w-0 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--brand-accent)]">
            <BrandWordmark className="h-8 w-auto text-[var(--foreground)] sm:h-9" />
          </Link>
          <Link href="/" className="btn-secondary shrink-0">Back to studio</Link>
        </div>
      </header>
      <main className={`mx-auto w-full px-6 py-10 sm:px-8 md:px-12 md:py-14 lg:px-16 ${narrow ? 'max-w-xl' : 'max-w-7xl'}`}>
        <div className={narrow ? '' : 'max-w-2xl'}>
          <p className="eyebrow mb-3 text-[var(--brand-accent)]">{eyebrow}</p>
          <h1 className="display text-3xl font-semibold tracking-tight text-[var(--foreground)] sm:text-4xl">{title}</h1>
          <p className="mt-3 text-base leading-relaxed text-[var(--foreground-muted)]">{description}</p>
        </div>
        {children}
      </main>
    </div>
  );
}
