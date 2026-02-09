import Stripe from 'stripe'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-11-20.acacia'
})

export { stripe }

// Price IDs from environment
export const PRICE_IDS = {
  starter: process.env.NEXT_PUBLIC_STRIPE_PRICE_STARTER!,
  pro: process.env.NEXT_PUBLIC_STRIPE_PRICE_PRO!,
  elite: process.env.NEXT_PUBLIC_STRIPE_PRICE_ELITE!,
  parlay_addon: process.env.NEXT_PUBLIC_STRIPE_PRICE_PARLAY_ADDON!
}

// Subscription tier mapping
export const TIER_LIMITS = {
  edge_starter: {
    dailySims: 3,
    price: 29,
    name: 'Edge Starter'
  },
  edge_pro: {
    dailySims: 10,
    price: 99,
    name: 'Edge Pro'
  },
  edge_elite: {
    dailySims: 50,
    price: 249,
    name: 'Edge Elite'
  }
}

/**
 * Create a checkout session with 3-day trial
 */
export async function createCheckoutSession(
  userId: string,
  userEmail: string,
  tier: 'starter' | 'pro' | 'elite',
  promoCode?: string
) {
  try {
    const priceId = PRICE_IDS[tier]
    
    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      customer_email: userEmail,
      client_reference_id: userId,
      line_items: [
        {
          price: priceId,
          quantity: 1
        }
      ],
      mode: 'subscription',
      success_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard?success=true`,
      cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/pricing?canceled=true`,
      subscription_data: {
        trial_period_days: 3, // 3-day free trial
        metadata: {
          user_id: userId,
          tier: tier
        }
      },
      metadata: {
        user_id: userId,
        tier: tier
      }
    }

    // Add promo code if provided
    if (promoCode) {
      const promotionCodes = await stripe.promotionCodes.list({
        code: promoCode,
        active: true,
        limit: 1
      })

      if (promotionCodes.data.length > 0) {
        sessionParams.discounts = [
          {
            promotion_code: promotionCodes.data[0].id
          }
        ]
      }
    }

    const session = await stripe.checkout.sessions.create(sessionParams)
    
    return { url: session.url }
  } catch (error: any) {
    console.error('[Stripe] Error creating checkout session:', error)
    throw new Error(`Failed to create checkout: ${error.message}`)
  }
}

/**
 * Create a customer portal session
 */
export async function createPortalSession(customerId: string) {
  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard`
    })
    
    return { url: session.url }
  } catch (error: any) {
    console.error('[Stripe] Error creating portal session:', error)
    throw new Error(`Failed to create portal: ${error.message}`)
  }
}

/**
 * Get subscription details
 */
export async function getSubscription(subscriptionId: string) {
  try {
    const subscription = await stripe.subscriptions.retrieve(subscriptionId)
    return subscription
  } catch (error: any) {
    console.error('[Stripe] Error fetching subscription:', error)
    return null
  }
}

/**
 * Cancel subscription
 */
export async function cancelSubscription(subscriptionId: string) {
  try {
    const subscription = await stripe.subscriptions.update(subscriptionId, {
      cancel_at_period_end: true
    })
    return subscription
  } catch (error: any) {
    console.error('[Stripe] Error canceling subscription:', error)
    throw new Error(`Failed to cancel subscription: ${error.message}`)
  }
}

/**
 * Validate promo code
 */
export async function validatePromoCode(code: string) {
  try {
    const promotionCodes = await stripe.promotionCodes.list({
      code: code,
      active: true,
      limit: 1
    })

    if (promotionCodes.data.length === 0) {
      return { valid: false, message: 'Invalid promo code' }
    }

    const promoCode = promotionCodes.data[0]
    const coupon = promoCode.coupon

    // Check if expired
    if (coupon.redeem_by && new Date(coupon.redeem_by * 1000) < new Date()) {
      return { valid: false, message: 'Promo code expired' }
    }

    // Check max redemptions
    if (coupon.max_redemptions && promoCode.times_redeemed >= coupon.max_redemptions) {
      return { valid: false, message: 'Promo code limit reached' }
    }

    return {
      valid: true,
      discount: coupon.percent_off 
        ? `${coupon.percent_off}% off` 
        : `$${(coupon.amount_off! / 100).toFixed(2)} off`
    }
  } catch (error: any) {
    console.error('[Stripe] Error validating promo code:', error)
    return { valid: false, message: 'Error validating code' }
  }
}

/**
 * Create a promo code (admin only)
 */
export async function createPromoCode(params: {
  code: string
  percentOff?: number
  amountOff?: number
  maxRedemptions?: number
  expiresAt?: Date
}) {
  try {
    // First create the coupon
    const coupon = await stripe.coupons.create({
      percent_off: params.percentOff,
      amount_off: params.amountOff ? params.amountOff * 100 : undefined, // Convert to cents
      currency: params.amountOff ? 'usd' : undefined,
      duration: 'once',
      max_redemptions: params.maxRedemptions,
      redeem_by: params.expiresAt ? Math.floor(params.expiresAt.getTime() / 1000) : undefined
    })

    // Then create the promotion code
    const promoCode = await stripe.promotionCodes.create({
      coupon: coupon.id,
      code: params.code.toUpperCase()
    })

    return promoCode
  } catch (error: any) {
    console.error('[Stripe] Error creating promo code:', error)
    throw new Error(`Failed to create promo code: ${error.message}`)
  }
}

/**
 * Get customer by email
 */
export async function getCustomerByEmail(email: string) {
  try {
    const customers = await stripe.customers.list({
      email: email,
      limit: 1
    })

    return customers.data.length > 0 ? customers.data[0] : null
  } catch (error: any) {
    console.error('[Stripe] Error fetching customer:', error)
    return null
  }
}