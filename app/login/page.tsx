'use client'
import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [isSignUp, setIsSignUp] = useState(false)
  const router = useRouter()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    // Extra safety check
    const trimmedEmail = email.trim()
    const trimmedPassword = password.trim()

    if (!trimmedEmail || !trimmedPassword) {
      alert('Please enter both email and password')
      return
    }

    setLoading(true)

    try {
      if (isSignUp) {
        if (trimmedPassword.length < 6) {
          alert('Password must be at least 6 characters')
          return
        }

        // Sign Up
        const { data, error } = await supabase.auth.signUp({
          email: trimmedEmail,
          password: trimmedPassword,
          options: {
            emailRedirectTo: `${window.location.origin}/`,
          }
        })

        if (error) {
          alert(error.message)
        } else {
          const domain = trimmedEmail.toLowerCase().split('@').pop() || ''
          const isUgEmail = domain === 'ug.edu.gh' || domain.endsWith('.ug.edu.gh')

          // Create a profile row for EVERY signup so the become-seller flow can
          // later update it. (Only UG accounts are auto-granted selling rights;
          // anyone else uses the WhatsApp-number flow on /become-seller.)
          // Best-effort: check the returned error — Supabase resolves { error }
          // instead of throwing. RLS may still block this write at signup time;
          // a DB trigger on auth.users is the more reliable place for it.
          if (data.user) {
            const { error: upsertError } = await supabase
              .from('profiles')
              .upsert({ id: data.user.id, is_seller: isUgEmail }, { onConflict: 'id' })
            if (upsertError) {
              console.error('Could not set seller status:', upsertError)
            }
          }

          alert(
            '📧 Check your email!\n\n' +
            'We sent a confirmation link to ' + trimmedEmail + '\n\n' +
            'Click the link to activate your account, then come back and log in.' +
            (isUgEmail ? ' You will be able to sell items.' : '')
          )
          setIsSignUp(false) // Switch to login mode
        }
      } else {
        // Login
        const { error } = await supabase.auth.signInWithPassword({
          email: trimmedEmail,
          password: trimmedPassword,
        })

        if (error) {
          alert(error.message)
        } else {
          router.push('/')
          router.refresh()
        }
      }
    } catch (err) {
      alert('Something went wrong. Please try again.')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4 bg-gray-50">
      <div className="bg-white p-8 rounded-xl shadow-md w-full max-w-sm">

        <h1 className="text-2xl font-bold mb-2 text-center text-black">
  Campus Plug 🔌
</h1>
<p className="text-center text-gray-500 mb-2">
  {isSignUp ? 'Create your account' : 'Welcome back'}
</p>

{isSignUp && (
  <div className="bg-green-50 border border-green-200 rounded-lg p-3 mb-4">
    <p className="text-xs text-green-800">
      💡 <strong>New here?</strong> Sign up with any email to browse.
      Want to sell? Add your WhatsApp number after signing up.
    </p>
  </div>
)}

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <input
            type="email"
            placeholder="University Email"
            className="border p-3 rounded-lg text-black focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <input
            type="password"
            placeholder="Password (min. 6 characters)"
            className="border p-3 rounded-lg text-black focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />

          {/* Single submit button that changes based on mode */}
          <button
            type="submit"
            disabled={loading}
            className="bg-blue-600 text-white p-3 rounded-lg font-semibold hover:bg-blue-700 disabled:bg-gray-400 transition-colors"
          >
            {loading
              ? 'Processing...'
              : isSignUp
              ? 'Create Account'
              : 'Login'}
          </button>

          {/* Toggle between login and signup */}
          <button
            type="button"
            onClick={() => setIsSignUp(!isSignUp)}
            className="text-blue-600 text-sm font-medium hover:underline text-center"
          >
            {isSignUp
              ? 'Already have an account? Login'
              : "Don't have an account? Sign Up"}
          </button>
        </form>

      </div>
    </div>
  )
}