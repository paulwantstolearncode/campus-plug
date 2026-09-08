import { Metadata } from 'next'
import { getSellerWithListings } from '@/lib/sellers'
import { SITE_URL } from '@/lib/site'
import ShopClient from './ShopClient'

type Props = {
  params: Promise<{ id: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params

  try {
    const seller = await getSellerWithListings(id)

    if (!seller) {
      return {
        title: 'Seller Shop — Campus Plug',
        description: 'Browse this seller\'s shop on Campus Plug, the student marketplace at University of Ghana.',
      }
    }

    const displayName = seller.full_name || 'Student Seller'
    const listingCount = seller.listings.length

    const title = `${displayName}'s Shop on Campus Plug`
    const description = listingCount > 0
      ? `${listingCount} item${listingCount !== 1 ? 's' : ''} available • ${seller.campus_location || 'University of Ghana'}`
      : `${displayName}'s shop on Campus Plug — the student marketplace at University of Ghana.`
    const imageUrl = seller.listings[0]?.image_url || ''

    return {
      title: `${displayName}'s Shop — Campus Plug`,
      description,
      openGraph: {
        title,
        description,
        url: `${SITE_URL}/shop/${id}`,
        siteName: 'Campus Plug',
        locale: 'en_GH',
        type: 'website',
        images: imageUrl ? [
          {
            url: imageUrl,
            width: 1200,
            height: 630,
            alt: `${displayName}'s Shop on Campus Plug`,
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
      title: 'Seller Shop — Campus Plug',
      description: 'Browse this seller\'s shop on Campus Plug, the student marketplace at University of Ghana.',
    }
  }
}

export default async function ShopPage({ params }: Props) {
  const { id } = await params
  const seller = await getSellerWithListings(id)

  if (!seller) {
    return (
      <main className="min-h-screen bg-off-white flex items-center justify-center">
        <div className="text-center">
          <div className="text-6xl mb-4 opacity-50">🏪</div>
          <h1 className="text-2xl font-bold text-charcoal mb-2">Seller not found</h1>
          <p className="text-gray-500">This seller doesn&apos;t exist or isn&apos;t active yet.</p>
        </div>
      </main>
    )
  }

  return <ShopClient seller={seller} />
}
