import { ImageResponse } from 'next/og'
import { NextRequest } from 'next/server'

export const runtime = 'edge'

// ---------------------------------------------------------------------------
// Font loading — vendored, same-origin, rotation-proof.
//
// History: this route pinned versioned fonts.gstatic.com URLs that Google
// later 404'd, then tried resolving css2 URLs at runtime — but Google now
// serves WOFF2 to every UA and this satori build rejects 'wOF2' signatures.
// The result was 500s and EMPTY PNGs on WhatsApp/social unfurls.
//
// Fix: Manrope 700 + DM Serif Display 400 are vendored as WOFF (satori-parseable)
// under public/fonts/og/ (from @fontsource via jsDelivr) and fetched from the
// request's own origin — no external dependency, no URL rotation risk.
// Caching: per-isolate after first fetch; failures are NOT cached so the next
// request retries instead of the isolate staying fontless until cold-start.
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

  // Vendored same-origin fonts (see note above) — both families registered so
  // the serif accent renders in the italic headline spans.
  const { manrope: fontData, serif: serifData } = await loadFonts(request.nextUrl.origin)

  return new ImageResponse(
    (
      <div
        style={{
          width: '1200px',
          height: '630px',
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: '#F8F8F8',
          fontFamily: 'Manrope',
          color: '#0F0F0F',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Subtle grid pattern */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundImage:
              'radial-gradient(circle, #DCD9D2 0.8px, transparent 0.8px)',
            backgroundSize: '24px 24px',
            opacity: 0.4,
          }}
        />

        {/* Gold top accent line */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: '4px',
            background: 'linear-gradient(90deg, #c9a227, #F4EBC9, #c9a227)',
          }}
        />

        {/* Brand header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '28px 48px 0',
            position: 'relative',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '32px' }}>🔌</span>
            <span
              style={{
                fontSize: '20px',
                fontWeight: 700,
                letterSpacing: '-0.02em',
              }}
            >
              CAMPUS PLUG
            </span>
            <span
              style={{
                fontSize: '14px',
                color: '#5B5B5B',
                fontWeight: 500,
              }}
            >
              ·
            </span>
            <span
              style={{
                fontSize: '14px',
                color: '#5B5B5B',
                fontWeight: 500,
              }}
            >
              University of Ghana
            </span>
          </div>
          {/* Category pill */}
          {category && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                padding: '6px 16px',
                borderRadius: '999px',
                backgroundColor: '#c9a227',
                color: '#0F0F0F',
                fontSize: '13px',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
              }}
            >
              {category}
            </div>
          )}
        </div>

        {/* Main content area */}
        <div
          style={{
            display: 'flex',
            flex: 1,
            padding: '24px 48px',
            gap: image ? '40px' : '0',
            position: 'relative',
          }}
        >
          {/* Text column */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              flex: 1,
              minWidth: 0,
            }}
          >
            {/* Title */}
            <div
              style={{
                fontSize: image ? '38px' : '48px',
                fontWeight: 700,
                lineHeight: 1.15,
                letterSpacing: '-0.03em',
                marginBottom: '20px',
                color: '#0F0F0F',
                overflow: 'hidden',
                display: '-webkit-box',
                WebkitLineClamp: 3,
                WebkitBoxOrient: 'vertical',
              }}
            >
              {title}
            </div>

            {/* Location tag */}
            {location && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  fontSize: '16px',
                  color: '#5B5B5B',
                  fontWeight: 500,
                  marginBottom: '16px',
                }}
              >
                <span style={{ fontSize: '18px' }}>📍</span>
                <span>{location}</span>
              </div>
            )}

            {/* Price badge */}
            {price && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  alignSelf: 'flex-start',
                  padding: '10px 24px',
                  borderRadius: '12px',
                  backgroundColor: '#F4EBC9',
                  color: '#0F0F0F',
                  fontSize: '24px',
                  fontWeight: 700,
                  letterSpacing: '-0.01em',
                }}
              >
                GH₵ {price}
              </div>
            )}
          </div>

          {/* Image column */}
          {image && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <div
                style={{
                  width: '360px',
                  height: '360px',
                  borderRadius: '24px',
                  overflow: 'hidden',
                  border: '3px solid #DCD9D2',
                  boxShadow: '0 8px 32px rgba(0,0,0,0.08)',
                }}
              >
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
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 48px 28px',
            position: 'relative',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontSize: '14px',
              color: '#5B5B5B',
              fontWeight: 500,
            }}
          >
            <span
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '28px',
                height: '28px',
                borderRadius: '50%',
                backgroundColor: '#128C4A',
                color: '#FFFFFF',
                fontSize: '14px',
              }}
            >
              💬
            </span>
            Message seller directly on WhatsApp
          </div>
          <div
            style={{
              fontSize: '14px',
              color: '#5B5B5B',
              fontWeight: 600,
            }}
          >
            campuspluggh.com
          </div>
        </div>

        {/* Gold bottom accent line */}
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            height: '4px',
            background: 'linear-gradient(90deg, #c9a227, #F4EBC9, #c9a227)',
          }}
        />
      </div>
    ),
    {
      width: 1200,
      height: 630,
      fonts: [
        // Both buffers may be undefined when Google Fonts is unreachable —
        // omitting them lets satori render with its fallback font instead of
        // crashing, so share unfurls never get an empty image again.
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
