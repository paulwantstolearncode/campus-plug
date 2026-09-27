import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const size = { width: 32, height: 32 };
export const contentType = 'image/png';

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#0f0f0f',
          borderRadius: '7px',
          border: '1px solid rgba(201, 162, 39, 0.6)',
        }}
      >
        {/* Marketplace Shopping Bag + Plug SVG — same refined mark as the
            apple icon (filled bag + gold zap), with 2px strokes for
            legibility at 32px. */}
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#c9a227"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {/* Shopping Bag Outline */}
          <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" fill="#18181b" />
          <line x1="3" y1="6" x2="21" y2="6" />
          {/* Bag Handle */}
          <path d="M16 10a4 4 0 0 1-8 0" strokeWidth="2" />
          {/* Gold Electric Plug / Zap Symbol on Front */}
          <path d="M13 11L9 17h4l-1 4 5-6h-4l1-4z" fill="#c9a227" stroke="#c9a227" strokeWidth="1" />
        </svg>
      </div>
    ),
    { ...size }
  );
}
