'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState, useRef } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import BrandMark from '@/lib/brandMark'
import NotificationBell from './NotificationBell'

interface NavBarProps {
  /** 'dark' = charcoal bg, 'light' = transparent→white scroll, 'admin' = charcoal + admin brand, 'dashboard' = charcoal + logout */
  variant?: 'dark' | 'light' | 'admin' | 'dashboard'
  /** When set, renders "← {label}" on ALL viewports. Suppresses hamburger + mobile row. */
  back?: { href: string; label: string; onClick?: () => void }
  /** Custom right-side content (replaces default actions). Used by privacy/terms for login buttons. */
  rightSlot?: React.ReactNode
  /** Additional className on the <nav> element (e.g. 'no-print'). */
  className?: string
}

export default function NavBar({ variant = 'dark', back, rightSlot, className: extraClassName }: NavBarProps) {
  const pathname = usePathname()
  const [user, setUser] = useState<User | null>(null)
  const [isSeller, setIsSeller] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    async function loadUser() {
      const { data: { user } } = await supabase.auth.getUser()
      setUser(user)

      if (user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('is_seller, is_admin')
          .eq('id', user.id)
          .single()

        setIsSeller(profile?.is_seller || false)
        setIsAdmin(profile?.is_admin || false)
      }
    }

    loadUser()

    const handleScroll = () => setScrolled(window.scrollY > 20)
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  // Close dropdown on outside click

  useEffect(() => {
    if (!dropdownOpen) return
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [dropdownOpen])

  const handleLogout = async () => {
    setDropdownOpen(false)
    try {
      await supabase.auth.signOut()
    } catch (err) {
      console.error('Logout failed:', err)
    } finally {
      setUser(null)
      window.location.reload()
    }
  }

  // Switch Account: sign out and land on /login so the user can pick
  // another account (Google chooser or email/phone).
  const handleSwitchAccount = async () => {
    setDropdownOpen(false)
    try {
      await supabase.auth.signOut()
    } catch (err) {
      console.error('Switch account failed:', err)
    } finally {
      setUser(null)
      window.location.href = '/login'
    }
  }

  const isDark = variant === 'dark' || variant === 'admin' || variant === 'dashboard'
  const isActive = (path: string) => pathname === path
  const showBack = !!back
  const showHamburger = !showBack && !rightSlot

  const navBg = isDark
    ? (scrolled ? 'bg-charcoal/80 backdrop-blur-xl border-b border-white/10' : 'bg-transparent')
    : (scrolled ? 'bg-white/80 backdrop-blur-xl shadow-sm' : 'bg-transparent')

  const textColor = isDark ? 'text-white' : 'text-charcoal'
  const mutedText = isDark ? 'text-white/60' : 'text-gray-500'
  const hoverText = isDark ? 'hover:text-gold' : 'hover:text-gold'
  const activeBorder = isDark ? 'border-white' : 'border-gold'

  const brandName = variant === 'admin' ? 'Campus Plug Admin' : 'Campus Plug'
  const showNavLinks = variant !== 'admin' && variant !== 'dashboard'
  const displayName = user?.user_metadata?.full_name || user?.user_metadata?.name
  const contactInfo = user?.phone || user?.email
  const userInitial = displayName?.charAt(0).toUpperCase() || user?.email?.charAt(0).toUpperCase() || '?'

  // Back link element (renders on ALL viewports when back prop is set)
  const backLink = showBack && (
    back.onClick ? (
      <button
        onClick={back.onClick}
        className={`text-sm ${mutedText} hover:text-white transition-colors flex items-center gap-1 group`}
      >
        <span className="group-hover:-translate-x-1 transition-transform">←</span>
        {back.label}
      </button>
    ) : (
      <Link
        href={back!.href}
        className={`text-sm ${mutedText} ${hoverText} transition-colors flex items-center gap-1 group`}
      >
        <span className="group-hover:-translate-x-1 transition-transform">←</span>
        {back!.label}
      </Link>
    )
  )

  return (
    <nav className={`fixed top-0 w-full z-50 transition-all duration-300 ${navBg}${extraClassName ? ' ' + extraClassName : ''}`}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex justify-between items-center">
        {/* Left: Logo + nav links */}
        <div className="flex items-center gap-4 sm:gap-8">
          <Link href="/" className="flex items-center gap-2 group">
            <BrandMark size={28} className="group-hover:scale-110 transition-transform" />
            <span className={`text-lg sm:text-xl font-bold tracking-tight ${textColor}`}>{brandName}</span>
          </Link>
          {showNavLinks && (
            <div className="hidden md:flex gap-6">
              <Link
                href="/services"
                className={`text-sm font-medium transition-colors pb-1 ${
                  isActive('/services')
                    ? `${textColor} border-b-2 ${activeBorder} pb-1`
                    : `${mutedText} ${hoverText}`
                }`}
              >
                Services
              </Link>
              <Link
                href="/categories"
                className={`text-sm font-medium transition-colors pb-1 ${
                  isActive('/categories')
                    ? `${textColor} border-b-2 ${activeBorder} pb-1`
                    : `${mutedText} ${hoverText}`
                }`}
              >
                Categories
              </Link>
              <Link
                href="/requests"
                className={`text-sm font-medium transition-colors pb-1 ${
                  isActive('/requests')
                    ? `${textColor} border-b-2 ${activeBorder} pb-1`
                    : `${mutedText} ${hoverText}`
                }`}
              >
                Wanted Board
              </Link>
              <Link
                href="/fresher-kit"
                className={`text-sm font-medium transition-colors pb-1 ${
                  isActive('/fresher-kit')
                    ? `${textColor} border-b-2 ${activeBorder} pb-1`
                    : `${mutedText} ${hoverText}`
                }`}
              >
                Fresher Kit 🎓
              </Link>
              {user && (
                <Link
                  href="/favorites"
                  className={`text-sm font-medium transition-colors pb-1 ${
                    isActive('/favorites')
                      ? `${textColor} border-b-2 ${activeBorder} pb-1`
                      : `${mutedText} ${hoverText}`
                  }`}
                >
                  Favorites
                </Link>
              )}
            </div>
          )}
        </div>

        {/* Right: back link + optional rightSlot, OR custom rightSlot, OR default actions */}
        {showBack ? (
          // Back mode: link on ALL viewports, no hamburger
          <div className="flex items-center gap-4">
            {backLink}
            {rightSlot}
          </div>
        ) : rightSlot ? (
          // Custom right content (privacy/terms login buttons) — visible on ALL viewports
          <div className="flex items-center gap-2 sm:gap-4">
            {rightSlot}
          </div>
        ) : (
          // Default: user-aware actions (desktop) + mobile hamburger
          <>
            {/* Desktop actions */}
            <div className="hidden md:flex items-center gap-4">
              {user ? (
                <>
                  {isSeller ? (
                    <Link href="/new" className="bg-white text-charcoal px-5 py-2 rounded-full text-sm font-semibold hover:bg-gold transition-all hover:scale-105">
                      + Post
                    </Link>
                  ) : (
                    <Link href="/become-seller" className="shine-button text-charcoal px-5 py-2 rounded-full text-sm font-semibold hover:scale-105 transition-transform">
                      Sell
                    </Link>
                  )}

                  {variant !== 'dashboard' && <NotificationBell />}

                  {/* Avatar dropdown */}
                  <div className="relative" ref={dropdownRef}>
                    <button
                      onClick={() => setDropdownOpen(!dropdownOpen)}
                      className="w-9 h-9 rounded-full bg-gold/20 border border-gold/40 flex items-center justify-center text-sm font-bold text-gold hover:bg-gold/30 transition-colors"
                      aria-label="User menu"
                    >
                      {userInitial}
                    </button>

                    {dropdownOpen && (
                      <div className="absolute right-0 top-12 w-64 bg-white rounded-xl shadow-2xl border border-gray-100 py-2 z-50">
                        <div className="px-4 py-3 border-b border-gray-100">
                          <p className="text-xs text-gray-400 mb-0.5">Signed in as</p>
                          <p className="text-sm text-charcoal font-semibold truncate">{displayName || contactInfo || 'Student'}</p>
                          {displayName && contactInfo && (
                            <p className="text-xs text-gray-400 truncate mt-0.5">{contactInfo}</p>
                          )}
                        </div>

                        {user && (
                          <Link
                            href="/dashboard"
                            onClick={() => setDropdownOpen(false)}
                            className="flex items-center gap-3 px-4 py-2.5 text-sm text-charcoal hover:bg-gray-50 transition-colors"
                          >
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="9"/><rect x="14" y="3" width="7" height="5"/><rect x="14" y="12" width="7" height="9"/><rect x="3" y="16" width="7" height="5"/></svg> {isSeller ? 'Dashboard' : 'My Account'}
                          </Link>
                        )}

                        {isSeller && (
                          <div className="px-4 py-2.5 flex items-center gap-3">
                            <span className="inline-flex items-center gap-1.5 bg-gold/15 text-gold px-2.5 py-1 rounded-full text-xs font-semibold border border-gold/30">
                               <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg> Seller
                            </span>
                          </div>
                        )}

                        {isAdmin && (
                          <Link
                            href="/admin"
                            onClick={() => setDropdownOpen(false)}
                            className="flex items-center gap-3 px-4 py-2.5 text-sm text-red-500 hover:bg-red-50 transition-colors"
                          >
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg> Admin Panel
                          </Link>
                        )}

                        <div className="border-t border-gray-100 my-1" />

                        <button
                          onClick={handleSwitchAccount}
                          className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-charcoal hover:bg-gray-50 transition-colors text-left"
                        >
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" /></svg> Switch Account
                        </button>

                        <button
                          onClick={handleLogout}
                          className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-500 hover:bg-red-50 transition-colors text-left"
                        >
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg> Logout
                        </button>
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <Link href="/login" className="bg-gold text-charcoal px-6 py-2.5 rounded-full text-sm font-semibold hover:bg-gold-dark transition-all hover:scale-105">
                  Get Started
                </Link>
              )}
            </div>

            {/* Mobile: Post button + bell + hamburger (only when no back/rightSlot) */}
            {showHamburger && (
              <div className="md:hidden flex items-center gap-2">
                {user ? (
                  <>
                    {isSeller ? (
                      <Link href="/new" className="bg-white text-charcoal px-4 py-2 rounded-full text-sm font-semibold">+ Post</Link>
                    ) : (
                      <Link href="/become-seller" className="shine-button text-charcoal px-4 py-2 rounded-full text-sm font-semibold">Sell</Link>
                    )}
                    <NotificationBell />
                  </>
                ) : (
                  <Link href="/login" className="bg-gold text-charcoal px-4 py-2 rounded-full text-sm font-semibold">Login</Link>
                )}
                <button
                  onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                  className={`${textColor} p-2 -mr-2`}
                  aria-label="Menu"
                >
                  {mobileMenuOpen ? (
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
                  ) : (
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 12h18M3 6h18M3 18h18"/></svg>
                  )}
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Mobile drawer (only when hamburger is active) */}
      {showHamburger && mobileMenuOpen && (
        <div className={`md:hidden backdrop-blur-xl border-t px-4 py-4 ${isDark ? 'bg-charcoal/95 border-white/10' : 'bg-white/95 border-gray-200'}`}>
          <div className="flex flex-col gap-1">
            {user && (
              <div className={`px-4 py-3 border-b mb-2 ${isDark ? 'border-white/10' : 'border-gray-200'}`}>
                <p className={`text-xs mb-1 ${isDark ? 'text-white/50' : 'text-gray-400'}`}>Signed in as</p>
                <p className={`text-sm font-semibold truncate ${textColor}`}>{displayName || contactInfo || 'Student'}</p>
                {displayName && contactInfo && (
                  <p className={`text-xs truncate mt-0.5 ${isDark ? 'text-white/50' : 'text-gray-400'}`}>{contactInfo}</p>
                )}
                {isSeller && (
                  <span className="inline-flex items-center gap-1 mt-2 bg-gold/20 text-gold px-2 py-0.5 rounded-full text-xs font-semibold border border-gold/30"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg> Seller</span>
                )}
                {isAdmin && (
                  <span className="inline-flex items-center gap-1 mt-2 ml-1.5 bg-red-500/20 text-red-400 px-2 py-0.5 rounded-full text-xs font-semibold border border-red-500/30"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg> Admin</span>
                )}
              </div>
            )}

            <Link
              href="/services"
              onClick={() => setMobileMenuOpen(false)}
              className={`px-4 py-3 rounded-xl transition-colors flex items-center gap-3 ${textColor} ${isDark ? 'hover:bg-white/10' : 'hover:bg-gray-100'}`}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="inline-block shrink-0"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg> Services
            </Link>
            <Link
              href="/categories"
              onClick={() => setMobileMenuOpen(false)}
              className={`px-4 py-3 rounded-xl transition-colors flex items-center gap-3 ${textColor} ${isDark ? 'hover:bg-white/10' : 'hover:bg-gray-100'}`}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="inline-block shrink-0"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg> Categories
            </Link>
            <Link
              href="/requests"
              onClick={() => setMobileMenuOpen(false)}
              className={`px-4 py-3 rounded-xl transition-colors flex items-center gap-3 ${textColor} ${isDark ? 'hover:bg-white/10' : 'hover:bg-gray-100'}`}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="inline-block shrink-0"><rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><line x1="9" y1="12" x2="15" y2="12"/><line x1="9" y1="16" x2="13" y2="16"/></svg> Wanted Board
            </Link>
            <Link
              href="/fresher-kit"
              onClick={() => setMobileMenuOpen(false)}
              className={`px-4 py-3 rounded-xl transition-colors flex items-center gap-3 ${textColor} ${isDark ? 'hover:bg-white/10' : 'hover:bg-gray-100'}`}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="inline-block shrink-0"><path d="M22 10 12 5 2 10l10 5 10-5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg> Fresher Kit
            </Link>
            {user && (
              <Link
                href="/favorites"
                onClick={() => setMobileMenuOpen(false)}
                className={`px-4 py-3 rounded-xl transition-colors flex items-center gap-3 ${textColor} ${isDark ? 'hover:bg-white/10' : 'hover:bg-gray-100'}`}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="inline-block shrink-0"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21.2l7.8-7.8 1-1a5.5 5.5 0 0 0 0-7.8z"/></svg> Favorites
              </Link>
            )}

            {isAdmin && (
              <Link
                href="/admin"
                onClick={() => setMobileMenuOpen(false)}
                className="px-4 py-3 text-red-400 hover:bg-red-500/10 rounded-xl transition-colors flex items-center gap-3"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="inline-block shrink-0"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg> Admin Panel
              </Link>
            )}

            {user && (
              <Link
                href="/dashboard"
                onClick={() => setMobileMenuOpen(false)}
                className={`px-4 py-3 rounded-xl transition-colors flex items-center gap-3 ${textColor} ${isDark ? 'hover:bg-white/10' : 'hover:bg-gray-100'}`}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="inline-block shrink-0"><rect x="3" y="3" width="7" height="9"/><rect x="14" y="3" width="7" height="5"/><rect x="14" y="12" width="7" height="9"/><rect x="3" y="16" width="7" height="5"/></svg> {isSeller ? 'Dashboard' : 'My Account'}
              </Link>
            )}

            {user && isSeller && (
              <Link
                href="/new"
                onClick={() => setMobileMenuOpen(false)}
                className={`px-4 py-3 rounded-xl transition-colors flex items-center gap-3 ${textColor} ${isDark ? 'hover:bg-white/10' : 'hover:bg-gray-100'}`}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="inline-block shrink-0"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg> Post New Listing
              </Link>
            )}

            {user && !isSeller && (
              <Link
                href="/become-seller"
                onClick={() => setMobileMenuOpen(false)}
                className={`px-4 py-3 rounded-xl transition-colors flex items-center gap-3 ${textColor} ${isDark ? 'hover:bg-white/10' : 'hover:bg-gray-100'}`}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="inline-block shrink-0"><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3z"/><path d="M19 15l.9 2.4L22 18l-2.1.6L19 21l-.9-2.4L16 18l2.1-.6L19 15z"/></svg> Become a Seller
              </Link>
            )}

            {user ? (
              <>
                <button
                  onClick={() => { setMobileMenuOpen(false); handleSwitchAccount() }}
                  className={`px-4 py-3 rounded-xl transition-colors flex items-center gap-3 text-left ${textColor} ${isDark ? 'hover:bg-white/10' : 'hover:bg-gray-100'}`}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="inline-block shrink-0"><path d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" /></svg> Switch Account
                </button>
                <button
                  onClick={() => { setMobileMenuOpen(false); handleLogout() }}
                  className="px-4 py-3 text-red-400 hover:bg-red-500/10 rounded-xl transition-colors flex items-center gap-3 text-left"
                >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="inline-block shrink-0"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg> Logout
                </button>
              </>
            ) : (
              <Link
                href="/login"
                onClick={() => setMobileMenuOpen(false)}
                className={`px-4 py-3 rounded-xl transition-colors flex items-center gap-3 ${isDark ? 'text-gold hover:bg-gold/10' : 'text-gold hover:bg-gold/10'}`}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="inline-block shrink-0"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0 3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg> Sign In
              </Link>
            )}
          </div>
        </div>
      )}
    </nav>
  )
}
