import { NextRequest, NextResponse } from 'next/server'
import { validatePromoCode } from '@/lib/stripe/client'

export async function POST(request: NextRequest) {
  try {
    const { code } = await request.json()

    if (!code) {
      return NextResponse.json(
        { valid: false, message: 'Code required' },
        { status: 400 }
      )
    }

    const result = await validatePromoCode(code)

    return NextResponse.json(result)
  } catch (error: any) {
    console.error('[API] Promo validation error:', error)
    return NextResponse.json(
      { valid: false, message: 'Error validating code' },
      { status: 500 }
    )
  }
}