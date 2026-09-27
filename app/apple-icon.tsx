import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#0f0f0f',
          border: '4px solid #c9a227',
        }}
      >
        <svg
          width="110"
          height="110"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#c9a227"
          strokeWidth="1.8"
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
