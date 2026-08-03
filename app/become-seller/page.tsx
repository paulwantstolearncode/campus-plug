'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function BecomeSellerPage() {
  const [whatsapp, setWhatsapp] = useState('')
  const [loading, setLoading] = useState(false)
  const [checking, setChecking] = useState(true)
  const router = useRouter()

  useEffect(() => {
    async function checkAuth() {
      try {
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) {
          router.push('/login')
          return
        }

        // Check if already a seller
        const { data: profile } = await supabase
          .from('profiles')
          .select('is_seller, whatsapp_number')
          .eq('id', user.id)
          .single()

        if (profile?.is_seller) {
          alert('You are already a verified seller!')
          router.push('/')
          return
        }

        // Pre-fill if they already added a number before
        if (profile?.whatsapp_number) {
          setWhatsapp(profile.whatsapp_number)
        }
      } catch (err) {
        // A failed auth/profile lookup must not strand the page on the
        // 'Loading...' screen forever.
        console.error('Could not check seller status:', err)
        router.push('/login')
        return
      }

      // Only reached when we're keeping the visitor here — never flash the
      // form to someone being redirected away.
      setChecking(false)
    }

    checkAuth()
  }, [router])

  const validateWhatsApp = (number: string): boolean => {
    // Remove all non-digits
    const digits = number.replace(/\D/g, '')

    // Ghana numbers: 10 digits starting with 0, OR 12 digits starting with 233
    if (digits.length === 10 && digits.startsWith('0')) return true
    if (digits.length === 12 && digits.startsWith('233')) return true
    // 9 digits without a leading 0 (e.g. 241234567 = 0241234567)
    if (digits.length === 9 && !digits.startsWith('0')) return true

    return false
  }

  const formatWhatsApp = (number: string): string => {
    // Convert to international format: 233XXXXXXXXX
    const digits = number.replace(/\D/g, '')

    if (digits.length === 10 && digits.startsWith('0')) {
      return '233' + digits.slice(1)
    }
    if (digits.length === 9) {
      return '233' + digits
    }
    return digits
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!validateWhatsApp(whatsapp)) {
      alert('Please enter a valid Ghana WhatsApp number\n\nExamples:\n0244123456\n+233244123456')
      return
    }

    setLoading(true)

    try {
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        router.push('/login')
        return
      }

      const formattedNumber = formatWhatsApp(whatsapp)

      // Upsert rather than update: a non-UG signup has no profile row yet, so
      // .update() would silently match 0 rows, 'succeed', and then /new would
      // bounce the user back here forever. Upsert creates the row if missing.
      const { error } = await supabase
        .from('profiles')
        .upsert(
          {
            id: user.id,
            whatsapp_number: formattedNumber,
            is_seller: true,
          },
          { onConflict: 'id' }
        )

      if (error) {
        alert('Something went wrong. Please try again.')
        console.error(error)
      } else {
        alert('🎉 You are now a verified seller!\n\nYou can now post listings.')
        router.push('/new')
      }
    } catch (err) {
      console.error(err)
      alert('Something went wrong.')
    } finally {
      setLoading(false)
    }
  }

  if (checking) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-gray-500">Loading...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-md mx-auto">

        <div className="flex items-center gap-4 mb-6 mt-4">
          <Link href="/" className="text-blue-600 hover:underline text-sm">
            ← Back
          </Link>
        </div>

        <div className="bg-white rounded-xl shadow-sm p-8">
          <div className="text-center mb-6">
            <div className="text-5xl mb-3">💚</div>
            <h1 className="text-2xl font-bold text-black">Become a Seller</h1>
            <p className="text-gray-500 text-sm mt-2">
              Add your WhatsApp number so buyers can contact you
            </p>
          </div>

          <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
            <p className="text-xs text-green-800">
              ✅ Your WhatsApp number will be shown on your listings so buyers can message you directly.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                WhatsApp Number
              </label>
              <input
                type="tel"
                placeholder="0244 123 456"
                className="w-full border p-3 rounded-lg text-black focus:outline-none focus:ring-2 focus:ring-green-500"
                value={whatsapp}
                onChange={(e) => setWhatsapp(e.target.value)}
                required
              />
              <p className="text-xs text-gray-400 mt-1">
                Ghana numbers only. Buyers will message you here.
              </p>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-green-600 text-white p-3 rounded-lg font-semibold hover:bg-green-700 disabled:bg-gray-400 transition-colors"
            >
              {loading ? 'Verifying...' : 'Become a Seller 🚀'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}