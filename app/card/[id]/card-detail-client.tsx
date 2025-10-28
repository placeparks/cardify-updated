'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { ArrowLeft, User as UserIcon, Link2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { useToast } from '@/hooks/use-toast'
import { MarketplaceCheckoutModal } from '@/components/marketplace-checkout-modal'
import { FlippableCardPreview } from '@/components/flippable-card-preview'

type ListingRow = {
  id: string
  title: string
  description: string | null
  image_url: string | null
  price_cents: number
  currency: string
  seller_id: string
  buyer_id: string | null
  status: 'active' | 'sold' | 'inactive'
  is_active: boolean
  created_at: string | null
}

type SellerMeta = {
  id: string
  display_name: string | null
  avatar_url: string | null
} | null

const initials = (name?: string | null) => {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/).slice(0, 2)
  return parts.map(p => p[0]?.toUpperCase() || '').join('') || '?'
}

export default function CardDetailClient({
  listing,
  seller
}: {
  listing: ListingRow
  seller: SellerMeta
}) {
  const router = useRouter()
  const supabase = createClientComponentClient()
  const { toast } = useToast()

  const [uid, setUid] = useState<string | null>(null)
  const [checkoutModalOpen, setCheckoutModalOpen] = useState(false)

  const isSoldOrInactive = listing.status !== 'active' || !listing.is_active

  // Get current user
  useEffect(() => {
    let mounted = true
    ;(async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!mounted) return
      setUid(session?.user?.id ?? null)
    })()
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setUid(session?.user?.id ?? null)
    })
    return () => {
      mounted = false
      sub.subscription.unsubscribe()
    }
  }, [supabase])

  const isSeller = !!uid && uid === listing.seller_id

  const handleBuy = () => {
    if (isSoldOrInactive) {
      toast({
        title: "Unavailable",
        description: "This item is not currently available.",
        variant: "destructive",
      })
      return
    }

    if (uid && uid === listing.seller_id) {
      toast({
        title: "You're the seller",
        description: "You can't buy your own listing.",
        variant: "destructive",
      })
      return
    }

    setCheckoutModalOpen(true)
  }

  const copyLink = () => {
    const url = `${window.location.origin}/card/${listing.id}`
    navigator.clipboard.writeText(url)
    toast({
      title: "Link copied!",
      description: "Share link copied to clipboard",
      duration: 2000,
    })
  }

  const cancelListing = async () => {
    if (!uid || uid !== listing.seller_id) {
      toast({
        title: 'Unable to cancel',
        description: 'Only the seller can cancel this listing.',
        variant: 'destructive',
      })
      return
    }

    const { error } = await supabase
      .from('marketplace_listings')
      .update({ status: 'inactive' })
      .eq('id', listing.id)
      .eq('seller_id', uid)

    if (error) {
      toast({ title: 'Cancel failed', description: error.message, variant: 'destructive' })
      return
    }

    toast({
      title: 'Listing canceled',
      description: `${listing.title} has been removed from the marketplace.`,
      variant: 'success' as const
    })

    // Redirect back to marketplace
    router.push('/marketplace')
  }

  return (
    <div className="min-h-screen bg-cyber-black relative overflow-hidden font-mono">
      {/* Background effects */}
      <div className="absolute inset-0 cyber-grid opacity-10 pointer-events-none" />
      <div className="absolute inset-0 scanlines opacity-20 pointer-events-none" />

      <div className="relative max-w-6xl mx-auto px-6 py-8 pt-32">
        {/* Main content with integrated back button */}
        <div className="grid md:grid-cols-2 gap-8">
          {/* Left side - Back button and Flippable Card */}
          <div className="flex flex-col items-center md:items-start">
            <div className="w-full max-w-md">
              {/* Back button - full width of card container */}
              <button
                onClick={() => router.push('/marketplace')}
                className="mb-4 inline-flex items-center text-cyber-cyan hover:text-cyber-pink transition-colors duration-200 group"
              >
                <ArrowLeft className="w-4 h-4 mr-2 group-hover:-translate-x-1 transition-transform duration-200" />
                <span className="text-sm font-medium tracking-wide">Back to Marketplace</span>
              </button>

              {/* Card */}
              <FlippableCardPreview
                artwork={listing.image_url}
                isLoading={false}
                defaultImage="/placeholder.svg"
              />
            </div>
          </div>

          {/* Right side - Details */}
          <div className="space-y-6 md:pt-10 min-w-0">
            {/* Title */}
            <div className="min-w-0">
              <h1 className="text-3xl font-bold text-white mb-2 break-words">{listing.title}</h1>
              {listing.description && (
                <p className="text-gray-400 break-words">{listing.description}</p>
              )}
            </div>

            {/* Price and Status */}
            <div>
              <div className="flex items-end gap-3 mb-4">
                <span className="text-4xl font-bold text-cyber-green leading-none">
                  ${(listing.price_cents / 100).toFixed(2)}
                </span>
                <div className={`flex items-center gap-1 pb-[2px] ${
                  isSoldOrInactive ? 'text-red-400' : 'text-emerald-400'
                }`}>
                  <span className={`w-2 h-2 rounded-full ${
                    isSoldOrInactive ? 'bg-red-400' : 'bg-emerald-400 animate-pulse'
                  }`} />
                  <span className="text-sm uppercase tracking-wider leading-none">
                    {isSoldOrInactive ? 'Unavailable' : 'Available'}
                  </span>
                </div>
              </div>
            </div>

            {/* Seller Info */}
            <div className="bg-cyber-dark/40 rounded-lg p-4 border border-cyber-cyan/30 overflow-hidden">
              <p className="text-sm text-gray-400 mb-2">Seller</p>
              <Link
                href={`/seller/${listing.seller_id}`}
                className="flex items-center gap-3 hover:opacity-80 transition-opacity min-w-0"
              >
                <div className="relative w-12 h-12 rounded-full overflow-hidden border-2 border-cyber-cyan flex-shrink-0">
                  {seller?.avatar_url ? (
                    <Image
                      src={seller.avatar_url}
                      alt={seller.display_name || 'Seller'}
                      fill
                      sizes="48px"
                      className="object-cover"
                    />
                  ) : (
                    <div className="w-full h-full bg-cyber-dark grid place-items-center">
                      {seller?.display_name ? (
                        <span className="text-cyber-cyan font-bold">
                          {initials(seller.display_name)}
                        </span>
                      ) : (
                        <UserIcon className="w-6 h-6 text-cyber-cyan" />
                      )}
                    </div>
                  )}
                </div>
                <span className="text-white text-lg truncate min-w-0">
                  {seller?.display_name || 'Unknown Seller'}
                </span>
              </Link>
            </div>

            {/* Metadata */}
            {listing.created_at && (
              <div className="text-sm text-gray-400">
                Listed on {new Date(listing.created_at).toLocaleDateString()}
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex gap-3">
              {isSeller ? (
                <>
                  <Button
                    variant="destructive"
                    onClick={cancelListing}
                    disabled={isSoldOrInactive}
                    className="flex-1"
                  >
                    Cancel Listing
                  </Button>
                  <Button
                    onClick={copyLink}
                    variant="outline"
                    className="px-4 bg-transparent border border-cyber-cyan text-cyber-cyan hover:text-cyber-cyan hover:border-cyber-cyan/70 hover:bg-cyber-cyan/10"
                    title="Copy share link"
                  >
                    <Link2 className="w-4 h-4" />
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    className="flex-1 cyber-button"
                    onClick={handleBuy}
                    disabled={isSoldOrInactive}
                    size="lg"
                  >
                    Buy Now
                  </Button>
                  <Button
                    onClick={copyLink}
                    variant="outline"
                    className="px-4 bg-transparent border border-cyber-cyan text-cyber-cyan hover:text-cyber-cyan hover:border-cyber-cyan/70 hover:bg-cyber-cyan/10"
                    title="Copy share link"
                  >
                    <Link2 className="w-4 h-4" />
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Checkout Modal */}
      <MarketplaceCheckoutModal
        isOpen={checkoutModalOpen}
        onClose={() => setCheckoutModalOpen(false)}
        listing={listing}
      />
    </div>
  )
}