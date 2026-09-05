'use client';

import { useState } from 'react';
import Image from 'next/image';
import { UserRound } from 'lucide-react';
import { googleProfilePicture } from '@/lib/account/profile-picture';

export default function AccountAvatar({ name, picture }: { name: string; picture?: string | null }) {
  const source = googleProfilePicture(picture);
  const [failedSource, setFailedSource] = useState<string | null>(null);
  return (
    <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-emerald-400/10 text-emerald-400 ring-1 ring-white/10">
      {source && source !== failedSource ? (
        <Image src={source} alt={`${name}'s profile photo`} width={44} height={44}
          unoptimized referrerPolicy="no-referrer" className="h-full w-full object-cover"
          onError={() => setFailedSource(source)} />
      ) : <UserRound size={20} aria-hidden="true" />}
    </span>
  );
}
