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
      .is('deleted_at', null)
      .single()

    if (!listing) {
      return {
        title: 'Listing — Campus Plug',
        description: 'Browse this listing on Campus Plug, the student marketplace at University of Ghana.',
      }
    }

    const priceLabel = listing.price ? 'GH₵' + Number(listing.price).toLocaleString() : ''
    const title = priceLabel ? `${listing.title} — ${priceLabel}` : listing.title
    const description = listing.campus_location
      ? `Available at ${listing.campus_location} • Verified on Campus Plug`
      : `Verified on Campus Plug — the student marketplace at University of Ghana.`
    const imageUrl = listing.image_url || (listing.images && listing.images[0]) || ''

    return {
      title: `${listing.title} — Campus Plug`,
      description,
      openGraph: {
        title,
        description,
        url: `${SITE_URL}/listing/${id}`,
        siteName: 'Campus Plug',
        locale: 'en_GH',
        // TODO: og:type "product" would be ideal but Next.js Metadata API doesn't support it — using "website"
        type: 'website',
        images: imageUrl ? [
          {
            url: imageUrl,
            width: 1200,
            height: 630,
            alt: listing.title,
          },
        ] : [],
      },
      twitter: {
        card: 'summary_large_image',
        title,
        description,
        images: imageUrl ? [imageUrl] : [],
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
