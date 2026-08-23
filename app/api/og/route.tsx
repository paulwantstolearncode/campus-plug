import { ImageResponse } from 'next/og'
import { NextRequest } from 'next/server'

export const runtime = 'edge'

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl

  const title = searchParams.get('title') || 'Campus Plug'
  const price = searchParams.get('price') || ''
  const location = searchParams.get('location') || ''
  const category = searchParams.get('category') || ''
  const image = searchParams.get('image') || ''

  // Load Manrope font from Google Fonts (weight 700)
  const fontResponse = await fetch(
    'https://fonts.gstatic.com/s/manrope/v15/xn7_YHE41ni1AdIRqAuZuw1Bx9mbZk59FO_F87jxeN7B.woff2',
  )
  const fontData = await fontResponse.arrayBuffer()

  // Load DM Serif Display for the italic accent
  const serifResponse = await fetch(
    'https://fonts.gstatic.com/s/dmserifdisplay/v15/-nFnOHM81r4j6k0gjAW3mujVU2B2K_d109jy92k.woff2',
  )
  const serifData = await serifResponse.arrayBuffer()

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
            background: 'linear-gradient(90deg, #D4AF37, #F4EBC9, #D4AF37)',
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
            zIndex: 1,
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
                backgroundColor: '#D4AF37',
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
            zIndex: 1,
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
                  display: 'inline-flex',
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
            zIndex: 1,
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
                display: 'inline-flex',
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
            background: 'linear-gradient(90deg, #D4AF37, #F4EBC9, #D4AF37)',
          }}
        />
      </div>
    ),
    {
      width: 1200,
      height: 630,
      fonts: [
        {
          name: 'Manrope',
          data: fontData,
          style: 'normal',
          weight: 700,
        },
      ],
    },
  )
}
