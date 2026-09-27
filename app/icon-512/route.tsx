import { ImageResponse } from 'next/og';

export const runtime = 'edge';

// 512x512 maskable PWA icon. Maskable icons must keep all meaningful content
// inside the inner 80% safe zone (Android launchers crop into circles,
// squircles, and rounded squares), so the mark is drawn small and centered on
// a full-bleed obsidian field — no border, no corner radius.
export async function GET() {
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
        }}
      >
        {/* Marketplace Shopping Bag + Plug SVG (80% safe zone → 205px) */}
        <svg
          width="205"
          height="205"
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
    { width: 512, height: 512 }
  );
}
