import { Metadata } from 'next'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import ListingDetailClient from './ListingDetailClient'
import { SITE_URL } from '@/lib/site'

type Props = {
  params: Promise<{ id: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params

  try {
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll()
          },
          setAll() {},
        },
      },
    )

    const { data: listing } = await supabase
      .from('listings')
      .select('title, description, price, campus_location, category, image_url, images, listing_type')
      .eq('id', id)
      .eq('approval_status', 'approved')
      .single()

    if (!listing) {
      return {
        title: 'Listing — Campus Plug',
        description: 'Browse this listing on Campus Plug, the student marketplace at University of Ghana.',
      }
    }

    const ogParams = new URLSearchParams({
      title: listing.title || 'Campus Plug Listing',
      price: listing.price ? String(listing.price) : '',
      location: listing.campus_location || '',
      category: listing.category || listing.listing_type || '',
      image: listing.image_url || (listing.images && listing.images[0]) || '',
    })

    const ogUrl = `${SITE_URL}/api/og?${ogParams.toString()}`

    const description = listing.description
      ? listing.description.slice(0, 160)
      : `Check out "${listing.title}" on Campus Plug — the student marketplace at University of Ghana.`

    return {
      title: `${listing.title} — Campus Plug`,
      description,
      openGraph: {
        title: listing.title,
        description,
        url: `${SITE_URL}/listing/${id}`,
        siteName: 'Campus Plug',
        locale: 'en_GH',
        type: 'website',
        images: [
          {
            url: ogUrl,
            width: 1200,
            height: 630,
            alt: listing.title,
          },
        ],
      },
      twitter: {
        card: 'summary_large_image',
        title: listing.title,
        description,
        images: [ogUrl],
      },
    }
  } catch {
    return {
      title: 'Listing — Campus Plug',
      description: 'Browse this listing on Campus Plug, the student marketplace at University of Ghana.',
    }
  }
}

export default async function ListingPage({ params }: Props) {
  // Await params for Next.js 16 compatibility
  await params
  return <ListingDetailClient />
}
