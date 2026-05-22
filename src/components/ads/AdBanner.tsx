// src/components/ads/AdBanner.tsx
// Reusable Google AdSense banner component.
// Renders nothing if NEXT_PUBLIC_GOOGLE_ADSENSE_ID is not set (safe for dev/staging).
// Uses responsive ad format — Google auto-selects 300x250 or 300x600 based on
// available space, which is fully mobile-compliant.

'use client'

import { useEffect } from 'react'

interface AdBannerProps {
  adSlot: string
  adFormat?: 'auto' | 'rectangle' | 'vertical' | 'horizontal'
  fullWidthResponsive?: boolean
  className?: string
}

declare global {
  interface Window {
    adsbygoogle: unknown[]
  }
}

export function AdBanner({
  adSlot,
  adFormat = 'auto',
  fullWidthResponsive = true,
  className = '',
}: AdBannerProps) {
  const publisherId = process.env.NEXT_PUBLIC_GOOGLE_ADSENSE_ID

  useEffect(() => {
    try {
      if (typeof window !== 'undefined') {
        (window.adsbygoogle = window.adsbygoogle || []).push({})
      }
    } catch (err) {
      console.error('AdSense push error:', err)
    }
  }, [adSlot])

  // If no publisher ID is configured, render nothing — no layout shift, no errors
  if (!publisherId) return null

  return (
    <div className={`w-full overflow-hidden ${className}`}>
      <p className="text-xs text-gray-500/60 text-center uppercase tracking-widest mb-1 select-none">
        Advertisement
      </p>
      <div className="flex justify-center">
        <ins
          className="adsbygoogle"
          style={{ display: 'block', minHeight: '90px', width: '100%', maxWidth: '728px' }}
          data-ad-client={publisherId}
          data-ad-slot={adSlot}
          data-ad-format={adFormat}
          data-full-width-responsive={String(fullWidthResponsive)}
        />
      </div>
    </div>
  )
}