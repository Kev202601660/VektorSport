import React, { useState } from 'react';
import { User } from 'lucide-react';

export const TeamLogo: React.FC<{
  src?: string;
  alt: string;
  abbrev: string;
  size?: 'sm' | 'md' | 'lg';
}> = ({ src, alt, abbrev, size = 'md' }) => {
  const [failed, setFailed] = useState(false);

  const dims =
    size === 'sm'
      ? 'w-6 h-6 text-[10px]'
      : size === 'lg'
        ? 'w-12 h-12 text-sm'
        : 'w-8 h-8 text-xs';

  if (!src || failed) {
    return (
      <div
        className={`${dims} rounded-lg bg-[#1A1F28] border border-white/[0.08] flex items-center justify-center font-mono font-semibold text-slate-300 shrink-0 select-none`}
        aria-label={alt}
      >
        {abbrev.slice(0, 3)}
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      referrerPolicy="no-referrer"
      loading="lazy"
      onError={() => setFailed(true)}
      className={`${dims} object-contain shrink-0`}
    />
  );
};

export const PlayerAvatar: React.FC<{
  src?: string;
  alt: string;
  size?: 'sm' | 'md' | 'lg';
}> = ({ src, alt, size = 'md' }) => {
  const [failed, setFailed] = useState(false);

  const dims =
    size === 'sm'
      ? 'w-9 h-9'
      : size === 'lg'
        ? 'w-16 h-16'
        : 'w-11 h-11';

  if (!src || failed) {
    return (
      <div
        className={`${dims} rounded-xl bg-[#1A1F28] border border-white/[0.08] flex items-center justify-center text-slate-400 shrink-0`}
        aria-label={alt}
      >
        <User className="w-5 h-5" />
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      referrerPolicy="no-referrer"
      loading="lazy"
      onError={() => setFailed(true)}
      className={`${dims} rounded-xl object-cover bg-[#161A22] border border-white/[0.06] shrink-0`}
    />
  );
};
