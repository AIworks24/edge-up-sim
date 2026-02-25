import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function proxy(req: NextRequest) {
  const protectedPaths = ['/dashboard', '/simulate', '/history', '/settings']
  const isProtected = protectedPaths.some(path => req.nextUrl.pathname.startsWith(path))

  if (!isProtected) return NextResponse.next()

  // Check for any Supabase session cookie (covers all versions/formats)
  const cookies = req.cookies.getAll()
  const hasSession = cookies.some(
    cookie =>
      cookie.name.startsWith('sb-') &&
      (cookie.name.endsWith('-auth-token') || cookie.name.endsWith('-auth-token.0') || cookie.name.endsWith('-auth-token.1'))
  )

  if (!hasSession) {
    return NextResponse.redirect(new URL('/login', req.url))
  }

  // Don't block — let the page itself handle subscription checks
  // This avoids 400 errors from DB calls in the proxy
  return NextResponse.next()
}

export const config = {
  matcher: ['/dashboard/:path*', '/simulate/:path*', '/history/:path*', '/settings/:path*']
}