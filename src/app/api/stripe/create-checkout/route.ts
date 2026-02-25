import { NextRequest, NextResponse } from 'next/server'
import { stripe, PRICE_IDS } from '@/lib/stripe/client'
import { supabaseAdmin } from '@/lib/database/supabase-admin'
import Stripe from 'stripe'

export async function POST(request: NextRequest) {
  try {
    const { tier, billingCycle, promoCode } = await request.json()

    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Verify token with admin client
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(
      authHeader.replace('Bearer ', '')
    )

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get profile
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('email, stripe_customer_id')
      .eq('id', user.id)
      .single()

    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    }

    // Determine price ID (use annual price IDs if available, else fall back to monthly)
    // NOTE: If you create annual prices in Stripe, add them to PRICE_IDS in client.ts
    // For now we use the same price IDs but pass trial data
    const priceId = PRICE_IDS[tier as keyof typeof PRICE_IDS]
    if (!priceId) {
      return NextResponse.json({ error: 'Invalid tier' }, { status: 400 })
    }

    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      customer_email: profile.email,
      client_reference_id: user.id,
      line_items: [{ price: priceId, quantity: 1 }],
      mode: 'subscription',
      payment_method_collection: 'always', // Collect card even during trial
      success_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard?success=true`,
      cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/pricing?canceled=true`,
      subscription_data: {
        trial_period_days: 3,
        metadata: {
          user_id: user.id,
          tier,
          billing_cycle: billingCycle || 'monthly'
        }
      },
      metadata: {
        user_id: user.id,
        tier,
        billing_cycle: billingCycle || 'monthly'
      }
    }

    // Apply promo code if valid
    if (promoCode) {
      const codes = await stripe.promotionCodes.list({ code: promoCode, active: true, limit: 1 })
      if (codes.data.length > 0) {
        sessionParams.discounts = [{ promotion_code: codes.data[0].id }]
      }
    }

    const session = await stripe.checkout.sessions.create(sessionParams)
    return NextResponse.json({ url: session.url })

  } catch (error: any) {
    console.error('[API] Stripe checkout error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}