'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function NewListingPage() {
  const [title, setTitle] = useState('')
  const [price, setPrice] = useState('')
  const [description, setDescription] = useState('')
  const [image, setImage] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  useEffect(() => {
    async function checkSellerStatus() {
      try {
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) {
          router.push('/login')
          return
        }

        const { data: profile } = await supabase
          .from('profiles')
          .select('is_seller')
          .eq('id', user.id)
          .single()

        if (!profile?.is_seller) {
          alert('Only verified UG students can post listings. Please sign up with your @ug.edu.gh email.')
          router.push('/')
        }
      } catch (err) {
        console.error('Seller check failed:', err)
        router.push('/login')
      }
    }

    checkSellerStatus()
  }, [router])

  // Revoke the preview object URL when it is replaced or the page unmounts.
  useEffect(() => {
    const preview = imagePreview
    return () => {
      if (preview) URL.revokeObjectURL(preview)
    }
  }, [imagePreview])

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (file.size > 5 * 1024 * 1024) {
      alert('Image must be under 5MB')
      return
    }

    setImage(file)
    setImagePreview(URL.createObjectURL(file))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    const priceNumber = Number(price)

    if (!title || !price || Number.isNaN(priceNumber) || priceNumber <= 0) {
      alert('Please enter a title and a price greater than 0')
      return
    }

    setLoading(true)

    try {
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        alert('You must be logged in')
        setLoading(false)
        return
      }

      // Re-verify seller status at submit time — the effect above is async and
      // a non-seller could otherwise submit before its redirect lands.
      const { data: profile } = await supabase
        .from('profiles')
        .select('is_seller')
        .eq('id', user.id)
        .single()

      if (!profile?.is_seller) {
        alert('Only verified UG students can post listings. Please sign up with your @ug.edu.gh email.')
        setLoading(false)
        return
      }

      let imageUrl = null

      if (image) {
        const fileExt = image.name.split('.').pop()
        const fileName = `${user.id}-${Date.now()}.${fileExt}`

        const { error: uploadError } = await supabase.storage
          .from('listing-images')
          .upload(fileName, image)

        if (uploadError) {
          alert('Image upload failed: ' + uploadError.message)
          setLoading(false)
          return
        }

        const { data: urlData } = supabase.storage
          .from('listing-images')
          .getPublicUrl(fileName)

        imageUrl = urlData.publicUrl
      }

      const { error } = await supabase.from('listings').insert({
        seller_id: user.id,
        title,
        price: priceNumber,
        description,
        image_url: imageUrl,
      })

      if (error) {
        alert(error.message)
      } else {
        router.push('/')
        router.refresh()
      }
    } catch (err) {
      alert('Something went wrong. Please try again.')
      console.error(err)
    }

    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-lg mx-auto">

        <div className="flex items-center gap-4 mb-6 mt-4">
          <Link href="/" className="text-blue-600 hover:underline text-sm">
            ← Back
          </Link>
          <h1 className="text-2xl font-bold text-black">Post a Listing</h1>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-white rounded-xl shadow-sm p-6 flex flex-col gap-5"
        >
          {/* Image Upload */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Photo
            </label>

            {imagePreview ? (
              <div className="relative">
                <img
                  src={imagePreview}
                  alt="Preview"
                  className="w-full h-56 object-cover rounded-lg"
                />
                <button
                  type="button"
                  onClick={() => {
                    setImage(null)
                    setImagePreview(null)
                  }}
                  className="absolute top-2 right-2 bg-red-500 text-white rounded-full w-7 h-7 flex items-center justify-center text-sm hover:bg-red-600"
                >
                  ✕
                </button>
              </div>
            ) : (
              <label className="flex flex-col items-center justify-center w-full h-40 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-colors">
                <span className="text-3xl mb-2">📷</span>
                <span className="text-sm text-gray-500">
                  Click to upload a photo
                </span>
                <span className="text-xs text-gray-400 mt-1">
                  JPG, PNG, WEBP up to 5MB
                </span>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleImageChange}
                />
              </label>
            )}
          </div>

          {/* Title */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Title *
            </label>
            <input
              type="text"
              placeholder="e.g. Calculus Textbook, iPhone 13"
              className="w-full border p-3 rounded-lg text-black focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
          </div>

          {/* Price */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Price *
            </label>
           <div className="relative">
  <span className="absolute left-3 top-3 text-gray-500 font-semibold">
   GH₵
  </span>
  <input
    type="number"
    placeholder="0.00"
    className="w-full border p-3 pl-14 rounded-lg text-black focus:outline-none focus:ring-2 focus:ring-blue-500"
    value={price}
    onChange={(e) => setPrice(e.target.value)}
    required
  />
</div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Description
            </label>
            <textarea
              placeholder="Describe your item — condition, details, pickup location..."
              className="w-full border p-3 rounded-lg text-black focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-green-600 text-white p-3 rounded-lg font-semibold hover:bg-green-700 disabled:bg-gray-400 transition-colors"
          >
            {loading ? 'Posting...' : 'Post Listing '}
          </button>
        </form>
      </div>
    </div>
  )
}