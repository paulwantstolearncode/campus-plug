import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

// 180x180 apple-touch-icon — same Campus Marketplace "Plug Bag" mark as the
// 32x32 favicon, scaled up (rounded corners + gold border match the
// established home-screen style).
export default function AppleIcon() {
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
          borderRadius: '36px',
          border: '3px solid #c9a227',
        }}
      >
        {/* Marketplace Shopping Bag + Plug SVG */}
        <svg
          width="112"
          height="112"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#c9a227"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {/* Shopping Bag Outline */}
          <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
          <line x1="3" y1="6" x2="21" y2="6" />
          {/* Bag Handle */}
          <path d="M16 10a4 4 0 0 1-8 0" />
          {/* Gold Plug Power Symbol Inside */}
          <path d="M12 13v3M10 15h4" stroke="#c9a227" strokeWidth="2" />
        </svg>
      </div>
    ),
    { ...size }
  );
}
