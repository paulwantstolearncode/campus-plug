import React from 'react';

/**
 * Campus Plug "CP Monogram + Plug" brand mark — single source of truth.
 *
 * The motif: a continuous 'C' + 'P' monogram drawn as one gold-gradient stroke
 * that resolves into a 2-prong electrical plug at its core. Used by every
 * icon surface:
 *
 *   app/icon.tsx        32×32 tab favicon
 *   app/apple-icon.tsx  180×180 iOS icon
 *   app/icon-192/route  192×192 PWA "any maskable"
 *   app/icon-512/route  512×512 PWA maskable
 *
 * Tweak the mark HERE and every surface updates together.
 */
interface BrandMarkProps {
  size?: number;
  className?: string;
  color?: string;
}

export default function BrandMark({
  size = 32,
  className = '',
  color = '#c9a227',
}: BrandMarkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 512 512"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <defs>
        <linearGradient id="cpGoldGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#f8e178" />
          <stop offset="50%" stopColor={color} />
          <stop offset="100%" stopColor="#8c6a0e" />
        </linearGradient>
      </defs>

      {/* Monogram Path (C + P) */}
      <path
        d="M 320 110 C 160 110, 90 200, 90 310 C 90 420, 180 440, 300 440 C 340 440, 360 410, 360 380 L 360 210 C 360 170, 420 170, 420 220 C 420 270, 360 270, 360 270 L 280 270"
        stroke="url(#cpGoldGrad)"
        strokeWidth="32"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Plug Body Head */}
      <path
        d="M 280 242 H 230 C 215 242, 205 252, 205 270 C 205 288, 215 298, 230 298 H 280 Z"
        fill="url(#cpGoldGrad)"
      />

      {/* 2 Prongs */}
      <rect x="170" y="250" width="26" height="12" rx="4" fill="url(#cpGoldGrad)" />
      <rect x="170" y="278" width="26" height="12" rx="4" fill="url(#cpGoldGrad)" />
    </svg>
  );
}
