'use client'
import { useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'

interface Listing {
  id: string
  title: string
  description: string | null
  price: number
  image_url: string | null
  seller: {
    full_name: string | null
    whatsapp_number: string | null
  } | null
}

export default function Home() {
  const [listings, setListings] = useState<Listing[]>([])
  const [isSeller, setIsSeller] = useState(false)
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
   async function getListings() {
  const { data } = await supabase
    .from('listings')
    .select(`
      *,
      seller:profiles!seller_id (
        full_name,
        whatsapp_number
      )
    `)
    .order('created_at', { ascending: false })
  if (data) setListings(data as any)
}

   async function checkUser() {
  const { data: { user } } = await supabase.auth.getUser()
  setUser(user)

  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('is_seller')
      .eq('id', user.id)
      .single()

    setIsSeller(profile?.is_seller || false)
  }
}

    async function loadEverything() {
      try {
        await checkUser()
        await getListings()
      } catch (err) {
        console.error('Failed to load the marketplace:', err)
      } finally {
        setLoading(false)
      }
    }

    loadEverything()
  }, [])

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut()
    } catch (err) {
      console.error('Sign out failed:', err)
    } finally {
      setUser(null)
      window.location.reload()
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-gray-500">Loading Campus Plug...</p>
      </div>
    )
  }

  return (
    <main className="min-h-screen bg-gray-50">
      {/* Top Navigation Bar */}
      <nav className="bg-white shadow-sm p-4">
        <div className="max-w-4xl mx-auto flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-black">Campus Plug 🔌</h1>
            <p className="text-sm text-gray-500">The student marketplace</p>
          </div>

          <div className="flex items-center gap-4">
            {user ? (
  <>
    <span className="text-sm text-gray-500 hidden sm:block">
      {user.email}
      {isSeller && <span className="ml-2 text-green-600">✓ Seller</span>}
    </span>
    {isSeller ? (
      <Link
        href="/new"
        className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-green-700 transition-colors"
      >
        + Post Item
      </Link>
    ) : (
      <Link
        href="/become-seller"
        className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-green-700 transition-colors"
      >
        💚 Sell
      </Link>
    )}
    <button
      onClick={handleLogout}
      className="text-red-500 text-sm hover:underline"
    >
      Logout
    </button>
  </>
) : (
              <Link
                href="/login"
                className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-blue-700 transition-colors"
              >
                Login
              </Link>
            )}
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <div className="max-w-4xl mx-auto p-4 mt-6">
        {listings.length === 0 ? (
  <div className="border-2 border-dashed rounded-xl p-16 text-center">
    <p className="text-4xl mb-4">🛒</p>
    <p className="text-gray-500 text-lg">No listings yet</p>
   {isSeller ? (
  <Link
    href="/new"
    className="mt-4 inline-block bg-green-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-green-700 transition-colors"
  >
    Post Your First Item
  </Link>
) : user ? (
  <Link
    href="/become-seller"
    className="mt-4 inline-block bg-green-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-green-700 transition-colors"
  >
    💚 Become a Seller
  </Link>
) : (
      <p className="text-gray-400 mt-2 text-sm">
        Login to start buying or selling
      </p>
    )}
  </div>
) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {listings.map((item) => (
              <div
                key={item.id}
                className="bg-white border rounded-xl shadow-sm hover:shadow-md transition-shadow overflow-hidden"
              >
                {/* Image */}
                {item.image_url ? (
                  <img
                    src={item.image_url}
                    alt={item.title}
                    className="w-full h-48 object-cover"
                  />
                ) : (
                  <div className="w-full h-48 bg-gray-100 flex items-center justify-center">
                    <span className="text-4xl">📦</span>
                  </div>
                )}

                {/* Info */}
                <div className="p-4">
                  <h2 className="font-bold text-lg text-black">
                    {item.title}
                  </h2>
                  {item.description && (
                    <p className="text-gray-500 text-sm mt-1 line-clamp-2">
                      {item.description}
                    </p>
                  )}
                  <p className="text-green-600 font-bold text-xl mt-3">
                    GH₵ {Number(item.price || 0).toLocaleString()}
                  </p>
                  {item.seller?.whatsapp_number && (
  <a
    href={`https://wa.me/${item.seller.whatsapp_number}?text=${encodeURIComponent(
      `Hi! I'm interested in your "${item.title}" listing on Campus Plug 🔌`
    )}`}
    target="_blank"
    rel="noopener noreferrer"
    className="mt-4 flex items-center justify-center gap-2 bg-green-500 text-white py-2 px-4 rounded-lg font-semibold hover:bg-green-600 transition-colors text-sm"
    onClick={(e) => e.stopPropagation()}
  >
    <span>💬</span> Message on WhatsApp
  </a>
)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  )
}