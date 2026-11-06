import { ImageResponse } from 'next/og'
import { NextRequest } from 'next/server'

export const runtime = 'edge'

// ---------------------------------------------------------------------------
// Font loading — vendored, same-origin, rotation-proof.
// ---------------------------------------------------------------------------

let fontCache: { manrope?: ArrayBuffer; serif?: ArrayBuffer } | null = null

async function loadFont(url: string): Promise<ArrayBuffer | undefined> {
  try {
    const res = await fetch(url)
    if (!res.ok) return undefined
    const buf = await res.arrayBuffer()
    // Reject HTML error pages ('<') — accept any real font container.
    const sig = new Uint8Array(buf.slice(0, 4))
    if (sig[0] === 0x3c) return undefined
    return buf
  } catch {
    return undefined
  }
}

async function loadFonts(origin: string): Promise<{ manrope?: ArrayBuffer; serif?: ArrayBuffer }> {
  if (fontCache) return fontCache
  const [manrope, serif] = await Promise.all([
    loadFont(origin + '/fonts/og/manrope-latin-700-normal.woff'),
    loadFont(origin + '/fonts/og/dm-serif-display-latin-400-normal.woff'),
  ])
  // Only cache success: if the fonts were unreachable this time, the next
  // request retries instead of the isolate being poisoned with "no fonts".
  if (manrope || serif) fontCache = { manrope, serif }
  return { manrope, serif }
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl

  const title = searchParams.get('title') || 'Campus Plug'
  const price = searchParams.get('price') || ''
  const location = searchParams.get('location') || ''
  const category = searchParams.get('category') || ''
  const image = searchParams.get('image') || ''

  // Vendored same-origin fonts
  const { manrope: fontData, serif: serifData } = await loadFonts(request.nextUrl.origin)

  return new ImageResponse(
    (
      <div
        style={{
          width: '1200px',
          height: '630px',
          display: 'flex',
          flexDirection: 'row',
          backgroundColor: '#0F0F0F', // Obsidian Dark
          color: '#F8F8F8',
          fontFamily: 'Manrope',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Gold top accent line */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: '6px',
            background: 'linear-gradient(90deg, #c9a227, #F4EBC9, #c9a227)',
            zIndex: 10,
          }}
        />

        {/* LEFT PANEL - Text Info */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            flex: image ? 1.1 : 1,
            padding: '60px',
            position: 'relative',
            zIndex: 5,
          }}
        >
          {/* Brand Header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '32px' }}>
            <span style={{ fontSize: '32px' }}>🔌</span>
            <span
              style={{
                fontSize: '22px',
                fontWeight: 700,
                letterSpacing: '0.02em',
                color: '#c9a227', // Gold
              }}
            >
              CAMPUS PLUG
            </span>
          </div>

          {/* Category Pill */}
          {category && (
            <div
              style={{
                display: 'flex',
                alignSelf: 'flex-start',
                padding: '8px 16px',
                borderRadius: '999px',
                backgroundColor: 'rgba(201, 162, 39, 0.15)', // Translucent Gold
                border: '1px solid #c9a227',
                color: '#c9a227',
                fontSize: '14px',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                marginBottom: '24px',
              }}
            >
              {category}
            </div>
          )}

          {/* Title */}
          <div
            style={{
              fontSize: image ? '42px' : '52px',
              fontWeight: 700,
              lineHeight: 1.15,
              letterSpacing: '-0.02em',
              marginBottom: '24px',
              color: '#F8F8F8',
              display: '-webkit-box',
              WebkitLineClamp: 3,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}
          >
            {title}
          </div>

          {/* Location */}
          {location && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                fontSize: '18px',
                color: '#9C9C9C',
                fontWeight: 500,
                marginBottom: '32px',
              }}
            >
              <span style={{ fontSize: '20px' }}>📍</span>
              <span>{location}</span>
            </div>
          )}

          {/* Price Badge */}
          {price && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                alignSelf: 'flex-start',
                padding: '12px 28px',
                borderRadius: '12px',
                backgroundColor: '#c9a227', // Solid Gold
                color: '#0F0F0F',
                fontSize: '28px',
                fontWeight: 700,
                letterSpacing: '-0.01em',
                boxShadow: '0 4px 16px rgba(201, 162, 39, 0.25)',
              }}
            >
              GH₵ {price}
            </div>
          )}

          {/* Footer Text */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              marginTop: 'auto',
              fontSize: '16px',
              color: '#9C9C9C',
              fontWeight: 500,
            }}
          >
            <span
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '24px',
                height: '24px',
                borderRadius: '50%',
                backgroundColor: '#128C4A',
                color: '#FFFFFF',
                fontSize: '12px',
              }}
            >
              💬
            </span>
            Message seller directly on WhatsApp
          </div>
        </div>

        {/* RIGHT PANEL - Big Image */}
        {image && (
          <div
            style={{
              display: 'flex',
              flex: 0.9,
              position: 'relative',
              height: '100%',
            }}
          >
            {/* Soft fade mask blending into the dark background */}
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                bottom: 0,
                width: '120px',
                background: 'linear-gradient(90deg, #0F0F0F 0%, rgba(15,15,15,0) 100%)',
                zIndex: 2,
              }}
            />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={image}
              alt={title}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
              }}
            />
          </div>
        )}

        {/* Gold bottom accent line */}
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            height: '6px',
            background: 'linear-gradient(90deg, #c9a227, #F4EBC9, #c9a227)',
            zIndex: 10,
          }}
        />
      </div>
    ),
    {
      width: 1200,
      height: 630,
      fonts: [
        ...(fontData
          ? [{ name: 'Manrope', data: fontData, style: 'normal' as const, weight: 700 as const }]
          : []),
        ...(serifData
          ? [{ name: 'DM Serif Display', data: serifData, style: 'normal' as const, weight: 400 as const }]
          : []),
      ],
    },
  )
}