'use client';
import { Clock3 } from 'lucide-react';
import type { CloudAsset } from '@/lib/account/contracts';

export default function TemporaryAssetNotice({assets}:{assets:CloudAsset[]}) {
  const deadlines=assets.flatMap(asset=>asset.expiresAt?[asset.expiresAt]:[]);
  if(!deadlines.length)return null;
  const earliest=Math.min(...deadlines);
  return <div role="status" className="rounded-xl border border-amber-300/40 bg-amber-300/10 p-3 text-sm text-amber-100">
    <p className="flex items-center gap-2 font-semibold"><Clock3 size={16} aria-hidden="true"/>Temporary results need storage space</p>
    <p className="mt-1 text-xs leading-relaxed">Download before <time dateTime={new Date(earliest).toISOString()}>{new Date(earliest).toLocaleString()}</time>, or free library space and resume saving the existing job. Temporary files expire automatically.</p>
  </div>;
}
