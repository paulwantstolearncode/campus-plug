'use client'
import { useState, useEffect, Suspense } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'

function NewListingContent() {
  const [title, setTitle] = useState('')
  const [price, setPrice] = useState('')
  const [description, setDescription] = useState('')
  const [image, setImage] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [existingImageUrl, setExistingImageUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [listingType, setListingType] = useState<'product' | 'service'>('product')
  const [serviceDuration, setServiceDuration] = useState('')
  const [serviceLocation, setServiceLocation] = useState('')
  const [checking, setChecking] = useState(true)
  const [isEditMode, setIsEditMode] = useState(false)
  const router = useRouter()
  const searchParams = useSearchParams()
  const editId = searchParams.get('edit')

  useEffect(() => {
    async function initialize() {
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
        alert('You need to become a seller first. Add your WhatsApp number to start selling!')
        router.push('/become-seller')
        return
      }

      // If editing, load the existing listing
      if (editId) {
        setIsEditMode(true)
        const { data: listing } = await supabase
          .from('listings')
          .select('*')
          .eq('id', editId)
          .eq('seller_id', user.id)
          .single()

        if (!listing) {
          alert('Listing not found or you don\'t have permission to edit it.')
          router.push('/')
          return
        }

        setTitle(listing.title)
        setPrice(String(listing.price))
        setDescription(listing.description || '')
        setListingType(listing.listing_type as 'product' | 'service')
        setServiceDuration(listing.service_duration || '')
        setServiceLocation(listing.service_location || '')
        setExistingImageUrl(listing.image_url)
      }

      setChecking(false)
    }

    initialize()
  }, [router, editId])

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

    if (!title || !price) {
      alert('Title and price are required')
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

      let imageUrl = existingImageUrl

      // Upload new image if selected
      if (image) {
        const fileExt = image.name.split('.').pop()
        const fileName = user.id + '-' + Date.now() + '.' + fileExt

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

      const payload = {
        title,
        price: Number(price),
        description,
        image_url: imageUrl,
        listing_type: listingType,
        service_duration: listingType === 'service' ? serviceDuration : null,
        service_location: listingType === 'service' ? serviceLocation : null,
      }

      let result
      if (isEditMode && editId) {
        // UPDATE existing listing
        result = await supabase
          .from('listings')
          .update(payload)
          .eq('id', editId)
          .eq('seller_id', user.id)
      } else {
        // CREATE new listing
        result = await supabase.from('listings').insert({
          ...payload,
          seller_id: user.id,
        })
      }

      if (result.error) {
        alert(result.error.message)
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

  if (checking) {
    return (
      <div className="flex items-center justify-center min-h-screen animated-gradient">
        <div className="text-center">
          <div className="text-4xl mb-2 animate-pulse">🔌</div>
          <p className="text-white/70">Loading...</p>
        </div>
      </div>
    )
  }

  const displayImage = imagePreview || existingImageUrl

  return (
    <main className="min-h-screen bg-charcoal">
      <nav className="fixed top-0 w-full z-50 bg-charcoal/80 backdrop-blur-xl border-b border-white/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex justify-between items-center">
          <Link href="/" className="flex items-center gap-2 group">
            <span className="text-2xl group-hover:rotate-12 transition-transform">🔌</span>
            <span className="text-lg sm:text-xl font-bold text-white tracking-tight">Campus Plug</span>
          </Link>
          <Link href="/" className="text-sm text-white/60 hover:text-white transition-colors flex items-center gap-1 group">
            <span className="group-hover:-translate-x-1 transition-transform">←</span>
            Back
          </Link>
        </div>
      </nav>

      <section className="relative pt-32 pb-12 md:pt-40 md:pb-16 overflow-hidden animated-gradient">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="blob absolute top-10 -left-20 w-96 h-96 bg-gold/30 rounded-full blur-3xl"></div>
          <div className="blob absolute top-20 right-0 w-96 h-96 bg-purple-500/20 rounded-full blur-3xl" style={{animationDelay: '5s'}}></div>
        </div>
        <div className="absolute inset-0 opacity-[0.05]" style={{backgroundImage: 'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)', backgroundSize: '60px 60px'}}></div>

        <div className="relative max-w-3xl mx-auto px-4 sm:px-6 text-center">
          <div className="fade-up inline-block text-sm font-semibold text-gold tracking-widest uppercase mb-4">
            {isEditMode ? 'Edit Listing' : 'New Listing'}
          </div>
          <h1 className="fade-up fade-up-delay-1 text-4xl md:text-5xl lg:text-6xl font-bold text-white leading-tight tracking-tight mb-4">
            {isEditMode ? (<>Update your<br /><span className="gradient-text">listing</span></>) : (<>Share what<br /><span className="gradient-text">you offer</span></>)}
          </h1>
          <p className="fade-up fade-up-delay-2 text-lg text-white/70 max-w-xl mx-auto">
            {isEditMode ? 'Make changes and save when ready.' : 'Reach fellow students on your campus. Set your price, own your terms.'}
          </p>
        </div>
      </section>

      <section className="relative pb-24 md:pb-32 bg-off-white -mt-8">
        <div className="relative max-w-2xl mx-auto px-4 sm:px-6">

          <form onSubmit={handleSubmit} className="relative bg-white rounded-3xl shadow-2xl p-6 md:p-10 border border-gray-100 space-y-8">

            <div>
              <label className="block text-sm font-bold text-charcoal mb-3 uppercase tracking-widest">Listing Type</label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setListingType('product')}
                  className={"relative p-5 rounded-2xl font-semibold border-2 transition-all overflow-hidden group " + (listingType === 'product' ? "border-gold bg-gradient-to-br from-gold/10 to-gold/5 text-charcoal shadow-lg" : "border-gray-200 text-gray-500 hover:border-gray-400")}
                >
                  {listingType === 'product' && (<div className="absolute top-2 right-2 w-2 h-2 bg-gold rounded-full"></div>)}
                  <div className="text-3xl mb-2">📦</div>
                  <div className="font-bold">Product</div>
                  <div className="text-xs mt-1 opacity-60">Physical items to sell</div>
                </button>
                <button
                  type="button"
                  onClick={() => setListingType('service')}
                  className={"relative p-5 rounded-2xl font-semibold border-2 transition-all overflow-hidden group " + (listingType === 'service' ? "border-gold bg-gradient-to-br from-gold/10 to-gold/5 text-charcoal shadow-lg" : "border-gray-200 text-gray-500 hover:border-gray-400")}
                >
                  {listingType === 'service' && (<div className="absolute top-2 right-2 w-2 h-2 bg-gold rounded-full"></div>)}
                  <div className="text-3xl mb-2">💼</div>
                  <div className="font-bold">Service</div>
                  <div className="text-xs mt-1 opacity-60">Skills or work to offer</div>
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-bold text-charcoal mb-3 uppercase tracking-widest">Photo</label>
              {displayImage ? (
                <div className="relative group">
                  <img src={displayImage} alt="Preview" className="w-full h-64 object-cover rounded-2xl" />
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity rounded-2xl flex items-center justify-center gap-2">
                    <label className="bg-white text-charcoal px-5 py-2.5 rounded-full font-semibold hover:bg-gold cursor-pointer transition-colors">
                      Change
                      <input type="file" accept="image/*" className="hidden" onChange={handleImageChange} />
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        setImage(null)
                        setImagePreview(null)
                        setExistingImageUrl(null)
                      }}
                      className="bg-white text-charcoal px-5 py-2.5 rounded-full font-semibold hover:bg-red-500 hover:text-white transition-colors"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ) : (
                <label className="relative flex flex-col items-center justify-center w-full h-48 border-2 border-dashed border-gray-300 rounded-2xl cursor-pointer hover:border-gold hover:bg-gold/5 transition-all group">
                  <div className="text-center">
                    <div className="text-5xl mb-3 group-hover:scale-110 transition-transform">📸</div>
                    <div className="font-semibold text-charcoal">Click to upload</div>
                    <div className="text-xs text-gray-500 mt-1">JPG, PNG, WEBP • Max 5MB</div>
                  </div>
                  <input type="file" accept="image/*" className="hidden" onChange={handleImageChange} />
                </label>
              )}
            </div>

            <div>
              <label className="block text-sm font-bold text-charcoal mb-3 uppercase tracking-widest">Title *</label>
              <input
                type="text"
                placeholder={listingType === 'product' ? "e.g. Calculus Textbook" : "e.g. Hair Braiding"}
                className="w-full px-5 py-4 rounded-2xl border-2 border-gray-200 text-charcoal placeholder:text-gray-400 focus:outline-none focus:border-gold transition-colors text-lg"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
              />
            </div>

            <div>
              <label className="block text-sm font-bold text-charcoal mb-3 uppercase tracking-widest">
                {listingType === 'service' ? 'Price per session *' : 'Price *'}
              </label>
              <div className="relative">
                <span className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-500 font-bold text-lg">GH₵</span>
                <input
                  type="number"
                  placeholder="0.00"
                  className="w-full pl-20 pr-5 py-4 rounded-2xl border-2 border-gray-200 text-charcoal placeholder:text-gray-400 focus:outline-none focus:border-gold transition-colors text-lg font-semibold"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-bold text-charcoal mb-3 uppercase tracking-widest">Description</label>
              <textarea
                placeholder="Tell buyers what makes your offering special..."
                className="w-full px-5 py-4 rounded-2xl border-2 border-gray-200 text-charcoal placeholder:text-gray-400 focus:outline-none focus:border-gold transition-colors resize-none"
                rows={4}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>

            {listingType === 'service' && (
              <div className="space-y-8 p-6 bg-gradient-to-br from-gold/5 to-transparent rounded-2xl border border-gold/20">
                <div className="flex items-center gap-2 text-gold-dark">
                  <span className="text-xl">💼</span>
                  <span className="text-sm font-bold uppercase tracking-widest">Service Details</span>
                </div>

                <div>
                  <label className="block text-sm font-bold text-charcoal mb-3 uppercase tracking-widest">Duration</label>
                  <input
                    type="text"
                    placeholder="e.g. 1 hour, 30 mins"
                    className="w-full px-5 py-4 rounded-2xl border-2 border-gray-200 bg-white text-charcoal placeholder:text-gray-400 focus:outline-none focus:border-gold transition-colors"
                    value={serviceDuration}
                    onChange={(e) => setServiceDuration(e.target.value)}
                  />
                </div>

                <div>
                  <label className="block text-sm font-bold text-charcoal mb-3 uppercase tracking-widest">Location</label>
                  <input
                    type="text"
                    placeholder="e.g. Legon Campus, I come to you"
                    className="w-full px-5 py-4 rounded-2xl border-2 border-gray-200 bg-white text-charcoal placeholder:text-gray-400 focus:outline-none focus:border-gold transition-colors"
                    value={serviceLocation}
                    onChange={(e) => setServiceLocation(e.target.value)}
                  />
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-charcoal text-white py-4 rounded-2xl font-bold text-lg hover:bg-black transition-all hover:scale-[1.02] disabled:opacity-50 disabled:hover:scale-100 shadow-xl shadow-charcoal/25 flex items-center justify-center gap-2 group"
            >
              {loading ? (
                <span>{isEditMode ? 'Saving...' : 'Publishing...'}</span>
              ) : (
                <>
                  <span>{isEditMode ? 'Save Changes' : 'Publish Listing'}</span>
                  <span className="group-hover:translate-x-1 transition-transform">→</span>
                </>
              )}
            </button>
          </form>

          <div className="mt-6 p-6 rounded-2xl bg-gradient-to-br from-charcoal to-gray-900 text-white text-center">
            <p className="text-sm text-white/70">
              💡 <strong className="text-gold">Pro tip:</strong> Great photos and clear descriptions get 3x more inquiries.
            </p>
          </div>
        </div>
      </section>
    </main>
  )
}

export default function NewListingPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-screen animated-gradient">
        <div className="text-center">
          <div className="text-4xl mb-2 animate-pulse">🔌</div>
          <p className="text-white/70">Loading...</p>
        </div>
      </div>
    }>
      <NewListingContent />
    </Suspense>
  )
}