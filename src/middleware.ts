import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function middleware(req: NextRequest) {
  const res = NextResponse.next()

  // Get session token from cookie (Supabase stores it here)
  const accessToken =
    req.cookies.get('sb-access-token')?.value ||
    req.cookies.get(`sb-${process.env.NEXT_PUBLIC_SUPABASE_URL?.split('//')[1]?.split('.')[0]}-auth-token`)?.value

  const protectedPaths = ['/dashboard', '/simulate', '/history', '/settings']
  const isProtected = protectedPaths.some(path => req.nextUrl.pathname.startsWith(path))

  if (!isProtected) return res

  // If no token at all, redirect to login
  if (!accessToken) {
    return NextResponse.redirect(new URL('/login', req.url))
  }

  try {
    // Use service role to verify user and check subscription
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    const { data: { user }, error } = await supabase.auth.getUser(accessToken)

    if (error || !user) {
      return NextResponse.redirect(new URL('/login', req.url))
    }

    // Allow /settings regardless of subscription (so users can manage billing)
    if (req.nextUrl.pathname.startsWith('/settings')) {
      return res
    }

    // For all other protected routes, check subscription
    const { data: profile } = await supabase
      .from('profiles')
      .select('subscription_status')
      .eq('id', user.id)
      .single()

    const noSub = !profile?.subscription_status || profile.subscription_status === 'none'
    if (noSub) {
      return NextResponse.redirect(new URL('/pricing?trial=true', req.url))
    }

  } catch {
    // On any error, allow through — don't lock users out due to middleware failures
    return res
  }

  return res
}

export const config = {
  matcher: ['/dashboard/:path*', '/simulate/:path*', '/history/:path*', '/settings/:path*']
}