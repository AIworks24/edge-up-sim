import { NextRequest, NextResponse } from 'next/server'
import { stripe } from '@/lib/stripe/client'
import { supabaseAdmin } from '@/lib/database/supabase-admin'
import Stripe from 'stripe'

export async function POST(request: NextRequest) {
  const body = await request.text()
  const signature = request.headers.get('stripe-signature')

  if (!signature) {
    return NextResponse.json(
      { error: 'No signature' },
      { status: 400 }
    )
  }

  let event: Stripe.Event

  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    )
  } catch (error: any) {
    console.error('[Webhook] Signature verification failed:', error.message)
    return NextResponse.json(
      { error: 'Webhook signature verification failed' },
      { status: 400 }
    )
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        await handleCheckoutCompleted(session)
        break
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription
        await handleSubscriptionUpdated(subscription)
        break
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription
        await handleSubscriptionDeleted(subscription)
        break
      }

      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as Stripe.Invoice
        await handleInvoicePaymentSucceeded(invoice)
        break
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice
        await handleInvoicePaymentFailed(invoice)
        break
      }
    }

    return NextResponse.json({ received: true })
  } catch (error: any) {
    console.error('[Webhook] Error processing event:', error)
    return NextResponse.json(
      { error: 'Webhook processing failed' },
      { status: 500 }
    )
  }
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  const userId = session.client_reference_id
  const customerId = session.customer as string
  const subscriptionId = session.subscription as string

  if (!userId) {
    console.error('[Webhook] No user ID in session')
    return
  }

  // Update user profile with Stripe IDs
  await supabaseAdmin
    .from('profiles')
    .update({
      stripe_customer_id: customerId,
      stripe_subscription_id: subscriptionId,
      subscription_status: 'trialing',
      trial_ends_at: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString()
    })
    .eq('id', userId)

  console.log('[Webhook] Checkout completed for user:', userId)
}

async function handleSubscriptionUpdated(subscription: Stripe.Subscription) {
  const userId = subscription.metadata.user_id
  
  if (!userId) {
    console.error('[Webhook] No user ID in subscription metadata')
    return
  }

  const status = subscription.status
  const tier = subscription.metadata.tier || 'edge_starter'

  await supabaseAdmin
    .from('profiles')
    .update({
      subscription_status: status,
      subscription_tier: tier,
      stripe_subscription_id: subscription.id
    })
    .eq('id', userId)

  console.log('[Webhook] Subscription updated for user:', userId, status)
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  const customerId = subscription.customer as string

  await supabaseAdmin
    .from('profiles')
    .update({
      subscription_status: 'canceled',
      subscription_tier: 'edge_starter'
    })
    .eq('stripe_customer_id', customerId)

  console.log('[Webhook] Subscription canceled:', customerId)
}

async function handleInvoicePaymentSucceeded(invoice: Stripe.Invoice) {
  const customerId = invoice.customer as string

  await supabaseAdmin
    .from('profiles')
    .update({
      subscription_status: 'active'
    })
    .eq('stripe_customer_id', customerId)

  console.log('[Webhook] Payment succeeded:', customerId)
}

async function handleInvoicePaymentFailed(invoice: Stripe.Invoice) {
  const customerId = invoice.customer as string

  await supabaseAdmin
    .from('profiles')
    .update({
      subscription_status: 'past_due'
    })
    .eq('stripe_customer_id', customerId)

  console.log('[Webhook] Payment failed:', customerId)
}