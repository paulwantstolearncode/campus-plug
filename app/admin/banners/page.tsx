'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

interface BannerAd {
  id: string
  title: string
  subtitle: string | null
  image_url: string | null
  link_url: string
  bg_color: string
  text_color: string
  is_active: boolean
  slot: number
  created_at: string
  expires_at: string | null
}

export default function BannerAdsPage() {
  const [banners, setBanners] = useState<BannerAd[]>([])
  const [loading, setLoading] = useState(true)
  const [isAdmin, setIsAdmin] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const router = useRouter()

  // Form state
  const [formTitle, setFormTitle] = useState('')
  const [formSubtitle, setFormSubtitle] = useState('')
  const [formImageUrl, setFormImageUrl] = useState('')
  const [formLinkUrl, setFormLinkUrl] = useState('')
  const [formBgColor, setFormBgColor] = useState('#0a0a0c')
  const [formTextColor, setFormTextColor] = useState('#ffffff')
  const [formSlot, setFormSlot] = useState(1)
  const [formExpiresAt, setFormExpiresAt] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      const { data: profile } = await supabase
        .from('profiles').select('is_admin').eq('id', user.id).single()
      if (!profile?.is_admin) { router.push('/'); return }

      setIsAdmin(true)
      await loadBanners()
    }
    init()
  }, [router])

  async function loadBanners() {
    const { data, error } = await supabase
      .from('banner_ads')
      .select('*')
      .order('slot', { ascending: true })

    if (error) {
      console.error('Banner fetch failed:', error)
      setError('Could not load banners: ' + error.message)
    } else {
      setBanners((data as BannerAd[]) || [])
    }
    setLoading(false)
  }

  function openCreate() {
    setEditingId(null)
    setFormTitle('')
    setFormSubtitle('')
    setFormImageUrl('')
    setFormLinkUrl('https://')
    setFormBgColor('#0a0a0c')
    setFormTextColor('#ffffff')
    setFormSlot(1)
    setFormExpiresAt('')
    setShowForm(true)
  }

  function openEdit(banner: BannerAd) {
    setEditingId(banner.id)
    setFormTitle(banner.title)
    setFormSubtitle(banner.subtitle || '')
    setFormImageUrl(banner.image_url || '')
    setFormLinkUrl(banner.link_url)
    setFormBgColor(banner.bg_color)
    setFormTextColor(banner.text_color)
    setFormSlot(banner.slot)
    setFormExpiresAt(banner.expires_at ? banner.expires_at.slice(0, 16) : '')
    setShowForm(true)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!formTitle.trim() || !formLinkUrl.trim()) return
    setSubmitting(true)

    const payload = {
      title: formTitle.trim(),
      subtitle: formSubtitle.trim() || null,
      image_url: formImageUrl.trim() || null,
      link_url: formLinkUrl.trim(),
      bg_color: formBgColor,
      text_color: formTextColor,
      slot: formSlot,
      expires_at: formExpiresAt ? new Date(formExpiresAt).toISOString() : null,
    }

    if (editingId) {
      const { error } = await supabase.from('banner_ads').update(payload).eq('id', editingId)
      if (error) alert('Failed: ' + error.message)
    } else {
      const { error } = await supabase.from('banner_ads').insert(payload)
      if (error) alert('Failed: ' + error.message)
    }

    setShowForm(false)
    setEditingId(null)
    await loadBanners()
    setSubmitting(false)
  }

  async function toggleActive(id: string, current: boolean) {
    await supabase.from('banner_ads').update({ is_active: !current }).eq('id', id)
    await loadBanners()
  }

  async function deleteBanner(id: string) {
    if (!confirm('Delete this banner?')) return
    await supabase.from('banner_ads').delete().eq('id', id)
    await loadBanners()
  }

  if (loading || !isAdmin) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-charcoal">
        <div className="text-center">
          <div className="text-4xl mb-2 animate-pulse">📢</div>
          <p className="text-white/70">Loading banner ads...</p>
        </div>
      </div>
    )
  }

  return (
    <main className="min-h-screen bg-charcoal">
      <nav className="fixed top-0 w-full z-50 bg-charcoal/80 backdrop-blur-xl border-b border-white/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex justify-between items-center">
          <Link href="/admin" className="flex items-center gap-2 group">
            <span className="text-2xl group-hover:rotate-12 transition-transform">🔌</span>
            <span className="text-lg sm:text-xl font-bold text-white tracking-tight">Admin</span>
          </Link>
          <div className="flex items-center gap-4">
            <Link href="/" className="text-sm text-white/60 hover:text-white transition-colors">← Back to app</Link>
          </div>
        </div>
      </nav>

      <section className="relative pt-32 pb-12 md:pt-40 md:pb-16 overflow-hidden animated-gradient">
        <div className="relative max-w-5xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-gold tracking-widest uppercase mb-2">Banner Ads</p>
              <h1 className="text-4xl md:text-5xl font-bold text-white leading-tight tracking-tight">
                Manage Landing Page Banners
              </h1>
              <p className="text-white/60 mt-2">Sponsored banners shown between the hero and content sections.</p>
            </div>
            <button
              onClick={openCreate}
              className="bg-gold text-charcoal px-6 py-3 rounded-full font-bold hover:bg-gold-dark transition-colors"
            >
              ＋ New Banner
            </button>
          </div>
        </div>
      </section>

      <section className="relative pb-24 bg-off-white -mt-4">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 pt-8">
          {error && (
            <div className="mb-6 p-4 rounded-2xl bg-red-50 border border-red-200 text-red-700 text-sm">
              ⚠️ {error}
            </div>
          )}

          {banners.length === 0 ? (
            <div className="bg-white rounded-3xl p-12 text-center border border-gray-100">
              <div className="text-5xl mb-4 opacity-50">📢</div>
              <p className="text-xl font-bold text-charcoal mb-2">No banners yet</p>
              <p className="text-gray-500 mb-6">Create a banner to advertise local businesses or promotions.</p>
              <button onClick={openCreate} className="bg-charcoal text-white px-6 py-3 rounded-full font-semibold hover:bg-black transition-colors">
                ＋ Create first banner
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {banners.map((banner) => (
                <div key={banner.id} className="bg-white rounded-3xl overflow-hidden shadow-lg border border-gray-100">
                  {/* Preview */}
                  <div className="p-4">
                    <a
                      href={banner.link_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block rounded-xl overflow-hidden transition-all hover:scale-[1.01]"
                      style={{ backgroundColor: banner.bg_color, color: banner.text_color }}
                    >
                      <div className="flex items-center gap-4 p-4">
                        {banner.image_url && (
                          <div className="w-14 h-14 rounded-lg overflow-hidden shrink-0 bg-white/10">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={banner.image_url} alt={banner.title} className="w-full h-full object-cover" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-sm">{banner.title}</p>
                          {banner.subtitle && <p className="text-xs opacity-70 mt-0.5">{banner.subtitle}</p>}
                        </div>
                        <span className="text-xs font-bold opacity-60">Ad →</span>
                      </div>
                    </a>
                  </div>

                  {/* Controls */}
                  <div className="flex items-center gap-3 px-5 py-3 border-t border-gray-100">
                    <span className="text-xs text-gray-400 font-mono">Slot {banner.slot}</span>
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${banner.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                      {banner.is_active ? 'Active' : 'Inactive'}
                    </span>
                    {banner.expires_at && (
                      <span className="text-xs text-gray-400">
                        Expires {new Date(banner.expires_at).toLocaleDateString('en-GB')}
                      </span>
                    )}
                    <div className="ml-auto flex gap-2">
                      <button
                        onClick={() => toggleActive(banner.id, banner.is_active)}
                        className="text-xs font-semibold px-3 py-1.5 rounded-full border border-gray-200 hover:border-charcoal transition-colors"
                      >
                        {banner.is_active ? 'Deactivate' : 'Activate'}
                      </button>
                      <button
                        onClick={() => openEdit(banner)}
                        className="text-xs font-semibold px-3 py-1.5 rounded-full border border-gray-200 hover:border-charcoal transition-colors"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => deleteBanner(banner.id)}
                        className="text-xs font-semibold px-3 py-1.5 rounded-full text-red-600 border border-red-200 hover:border-red-400 hover:bg-red-50 transition-colors"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Create/Edit Modal */}
      {showForm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowForm(false)} />
          <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6 md:p-8">
            <button onClick={() => setShowForm(false)} className="absolute top-4 right-4 text-gray-400 hover:text-charcoal text-xl">✕</button>
            <h2 className="text-2xl font-bold text-charcoal mb-6">{editingId ? 'Edit Banner' : 'New Banner'}</h2>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-charcoal mb-2">Title *</label>
                <input
                  type="text" value={formTitle} onChange={(e) => setFormTitle(e.target.value)}
                  placeholder="e.g., Legon Barber Shop"
                  className="w-full px-4 py-3 rounded-2xl border-2 border-gray-200 text-charcoal focus:outline-none focus:border-gold transition-colors"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-charcoal mb-2">Subtitle</label>
                <input
                  type="text" value={formSubtitle} onChange={(e) => setFormSubtitle(e.target.value)}
                  placeholder="e.g., Haircuts from GH₵ 30"
                  className="w-full px-4 py-3 rounded-2xl border-2 border-gray-200 text-charcoal focus:outline-none focus:border-gold transition-colors"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-charcoal mb-2">Image URL</label>
                <input
                  type="url" value={formImageUrl} onChange={(e) => setFormImageUrl(e.target.value)}
                  placeholder="https://..."
                  className="w-full px-4 py-3 rounded-2xl border-2 border-gray-200 text-charcoal focus:outline-none focus:border-gold transition-colors"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-charcoal mb-2">Link URL *</label>
                <input
                  type="url" value={formLinkUrl} onChange={(e) => setFormLinkUrl(e.target.value)}
                  placeholder="https://..."
                  className="w-full px-4 py-3 rounded-2xl border-2 border-gray-200 text-charcoal focus:outline-none focus:border-gold transition-colors"
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-semibold text-charcoal mb-2">Background</label>
                  <div className="flex gap-2">
                    <input type="color" value={formBgColor} onChange={(e) => setFormBgColor(e.target.value)} className="w-12 h-12 rounded-xl border-2 border-gray-200 cursor-pointer" />
                    <input type="text" value={formBgColor} onChange={(e) => setFormBgColor(e.target.value)} className="flex-1 px-3 py-2 rounded-xl border-2 border-gray-200 text-charcoal font-mono text-sm focus:outline-none focus:border-gold" />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-charcoal mb-2">Text Color</label>
                  <div className="flex gap-2">
                    <input type="color" value={formTextColor} onChange={(e) => setFormTextColor(e.target.value)} className="w-12 h-12 rounded-xl border-2 border-gray-200 cursor-pointer" />
                    <input type="text" value={formTextColor} onChange={(e) => setFormTextColor(e.target.value)} className="flex-1 px-3 py-2 rounded-xl border-2 border-gray-200 text-charcoal font-mono text-sm focus:outline-none focus:border-gold" />
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-semibold text-charcoal mb-2">Slot (order)</label>
                  <select value={formSlot} onChange={(e) => setFormSlot(Number(e.target.value))} className="w-full px-4 py-3 rounded-2xl border-2 border-gray-200 text-charcoal focus:outline-none focus:border-gold transition-colors">
                    <option value={1}>1 (first)</option>
                    <option value={2}>2</option>
                    <option value={3}>3 (last)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-charcoal mb-2">Expires</label>
                  <input
                    type="datetime-local" value={formExpiresAt} onChange={(e) => setFormExpiresAt(e.target.value)}
                    className="w-full px-4 py-3 rounded-2xl border-2 border-gray-200 text-charcoal focus:outline-none focus:border-gold transition-colors"
                  />
                </div>
              </div>

              {/* Live preview */}
              <div>
                <label className="block text-sm font-semibold text-charcoal mb-2">Preview</label>
                <div className="rounded-xl overflow-hidden" style={{ backgroundColor: formBgColor, color: formTextColor }}>
                  <div className="flex items-center gap-3 p-4">
                    {formImageUrl && (
                      <div className="w-12 h-12 rounded-lg overflow-hidden shrink-0 bg-white/10">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={formImageUrl} alt="" className="w-full h-full object-cover" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-sm">{formTitle || 'Banner Title'}</p>
                      {formSubtitle && <p className="text-xs opacity-70 mt-0.5">{formSubtitle}</p>}
                    </div>
                    <span className="text-xs font-bold opacity-60">Ad →</span>
                  </div>
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting || !formTitle.trim() || !formLinkUrl.trim()}
                className="w-full bg-gold text-charcoal py-4 rounded-2xl font-bold text-lg hover:bg-gold-dark transition-all disabled:opacity-50 shadow-lg shadow-gold/20"
              >
                {submitting ? 'Saving...' : editingId ? 'Save Changes' : 'Create Banner'}
              </button>
            </form>
          </div>
        </div>
      )}
    </main>
  )
}
