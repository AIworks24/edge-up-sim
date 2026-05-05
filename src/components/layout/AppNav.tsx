'use client'
// src/components/layout/AppNav.tsx
// Shared nav header used across all authenticated pages.
// Auto-detects active route via usePathname().

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Zap } from 'lucide-react'
import { supabase } from '@/lib/database/supabase-client'

interface AppNavProps {
  user:    any
  profile: any
  /** Optional right-side extra content (e.g. sim count on Simulate page) */
  rightExtra?: React.ReactNode
}

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/simulate',  label: 'Simulate'  },
  { href: '/history',   label: 'History'   },
  { href: '/settings',  label: 'Settings'  },
]

export function AppNav({ user, profile, rightExtra }: AppNavProps) {
  const pathname = usePathname()
  const router   = useRouter()

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/')
  }

  const displayName = profile?.full_name || user?.email?.split('@')[0] || ''

  return (
    <header className="bg-slate-900/50 backdrop-blur-xl border-b border-white/10 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">

          {/* Logo + desktop nav */}
          <div className="flex items-center space-x-8">
            <Link href="/dashboard" className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/50">
                <Zap className="w-6 h-6 text-white" />
              </div>
              <span className="text-xl font-black text-white hidden sm:block">Edge Up Sim</span>
            </Link>

            <nav className="hidden md:flex items-center space-x-1">
              {NAV_ITEMS.map(item => {
                const active = pathname === item.href ||
                  (item.href !== '/dashboard' && pathname.startsWith(item.href))
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`px-4 py-2 rounded-lg text-sm font-semibold transition ${
                      active
                        ? 'bg-white/10 text-white'
                        : 'text-gray-400 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    {item.label}
                  </Link>
                )
              })}
            </nav>
          </div>

          {/* Right side: optional extra + user info + sign out */}
          <div className="flex items-center space-x-4">
            {rightExtra}
            {displayName && (
              <div className="hidden md:block text-right">
                <div className="text-xs text-gray-400 uppercase tracking-wider">Welcome back</div>
                <div className="text-white font-semibold">{displayName}</div>
              </div>
            )}
            <button
              onClick={handleSignOut}
              className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg transition font-medium text-sm"
            >
              Sign Out
            </button>
          </div>
        </div>

        {/* Mobile bottom nav bar */}
        <div className="md:hidden border-t border-white/10 flex">
          {NAV_ITEMS.map(item => {
            const active = pathname === item.href ||
              (item.href !== '/dashboard' && pathname.startsWith(item.href))
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex-1 py-2 text-center text-xs font-medium transition ${
                  active ? 'text-white bg-white/10' : 'text-gray-400 hover:text-white'
                }`}
              >
                {item.label}
              </Link>
            )
          })}
        </div>
      </div>
    </header>
  )
}