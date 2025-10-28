'use client'

import { useCallback, useEffect, useMemo, useState, Suspense } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { Search, User as UserIcon, ChevronLeft, ChevronRight, Link2, ArrowUpDown, Star } from "lucide-react"

import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useToast } from '@/hooks/use-toast'
import { track } from "../../lib/analytics-client"
import { ListingDescriptionPopup } from '@/components/listing-description-popup'
import { CustomCardCheckoutModal } from '@/components/custom-card-checkout-modal'
import { CategorySelector, CardCategory, CARD_CATEGORIES } from '@/components/category-selector'
import { FeaturedCardsSection } from '@/components/featured-cards-section'

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
  categories: CardCategory[]
  asset_id?: string
  featured?: boolean
  remaining_supply?: number | null
  total_supply?: number | null
}

type SellerMeta = {
  id: string
  display_name: string | null
  avatar_url: string | null
}

/* ───────────────────────── helpers ───────────────────────── */

const dollars = (cents: number) => (cents / 100).toFixed(2)

const initials = (name?: string | null) => {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/).slice(0, 2)
  return parts.map(p => p[0]?.toUpperCase() || '').join('') || '?'
}

/* ───────────────────────── card ───────────────────────── */

function MarketplaceCard({
  listing,
  currentUserId,
  seller,
  onCancel,
  onBuy,
  onView,
  isAdmin,
  editingId,
  editTitle,
  onAdminDelete,
  onAdminRename,
  onStartEdit,
  onCancelEdit,
  onEditTitleChange,
  priority = false,
}: {
  listing: ListingRow
  currentUserId: string | null
  seller?: SellerMeta
  onCancel: (l: ListingRow) => Promise<void>
  onBuy: (l: ListingRow) => void
  onView: (l: ListingRow) => void
  priority?: boolean
}) {
  const { toast } = useToast()
  const isSoldOrInactive = listing.status !== 'active' || !listing.is_active
  const isSeller = !!currentUserId && currentUserId === listing.seller_id
  const priceUSD = Number(listing.price_cents) / 100

  const copyLink = (e: React.MouseEvent) => {
    e.stopPropagation()
    const url = `${window.location.origin}/card/${listing.id}`
    navigator.clipboard.writeText(url)
    toast({
      title: "Link copied!",
      description: "Share link copied to clipboard",
      duration: 2000,
    })
  }

  return (
    <Card className="bg-cyber-dark/60 border border-cyber-cyan/30 hover:border-cyber-cyan/60 transition-all duration-300 overflow-hidden hover:shadow-[0_0_30px_rgba(34,211,238,0.3)] h-full">
      <CardContent className="p-3 flex flex-col h-full">
        {/* Card frame with trading card aspect ratio - clickable */}
        <div className="relative group">
          <button
            onClick={() => !isSeller && onView(listing)}
            disabled={isSoldOrInactive || isSeller}
            className="block relative aspect-[5/7] bg-gradient-to-br from-cyber-dark/40 to-cyber-dark/80 rounded-lg overflow-hidden cursor-pointer w-full border-2 border-cyber-cyan/50 transition-all duration-300 hover:border-cyber-cyan disabled:cursor-default"
          >
            <Image
              src={listing.image_url || '/placeholder.svg'}
              alt={listing.title}
              fill
              sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 20vw"
              className="object-fill"
              priority={priority}
            />

            {/* Featured Badge */}
            {listing.featured && (
              <div className="absolute top-2 left-2 z-10 pointer-events-none">
                <Badge className="bg-yellow-500/90 text-black border-yellow-400 border-2 font-bold text-xs px-2 py-1 shadow-lg flex items-center gap-1">
                  <Star className="w-3 h-3 fill-black" />
                  FEATURED
                </Badge>
              </div>
            )}

            {/* Remaining Supply Badge - Show for ALL featured cards with supply info (visible to everyone) */}
            {listing.featured && listing.remaining_supply !== null && listing.remaining_supply !== undefined && (
              <div className="absolute top-11 left-2 z-10 pointer-events-none">
                <Badge className={`${
                  listing.remaining_supply === 0 
                    ? 'bg-red-500/90 text-white border-red-400 animate-pulse' 
                    : listing.remaining_supply <= 5 
                      ? 'bg-orange-500/90 text-white border-orange-400 animate-pulse' 
                      : 'bg-cyan-500/90 text-white border-cyan-400'
                } border-2 font-bold text-xs px-2 py-1 shadow-lg flex items-center gap-1`}>
                  {listing.remaining_supply === 0 ? '❌ SOLD OUT' : `⚡ ${listing.remaining_supply} LEFT`}
                </Badge>
              </div>
            )}

            {/* Hover overlay with view text */}
            <div className="absolute inset-0 pointer-events-none">
              {/* Background gradient overlay */}
              <div className="absolute inset-0 bg-gradient-to-t from-cyber-dark/95 via-cyber-dark/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

              {/* View text in center on hover (only for buyers) */}
              {!isSeller && !isSoldOrInactive && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-cyber-cyan text-lg font-bold tracking-wider opacity-0 group-hover:opacity-100 transition-all duration-300 transform scale-90 group-hover:scale-100">VIEW</span>
                </div>
              )}
            </div>
          </button>

          {/* Share button - outside the main button, positioned absolutely */}
          <button
            onClick={copyLink}
            className="absolute top-2 right-2 p-2 rounded-full bg-cyber-dark/90 backdrop-blur-sm border border-cyber-cyan/50 opacity-0 group-hover:opacity-100 transition-all duration-300 hover:bg-cyber-dark hover:border-cyber-cyan z-10"
            title="Copy link to share"
          >
            <Link2 className="w-4 h-4 text-cyber-cyan" />
          </button>
        </div>

        {/* Card info below */}
        <div className="mt-3 space-y-2">
          <h3 className="text-sm font-semibold text-white truncate" title={listing.title}>
            {listing.title}
          </h3>
          {/* Categories */}
          {listing.categories.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-2">
              {listing.categories.map(category => {
                const categoryInfo = CARD_CATEGORIES.find(c => c.value === category)
                return (
                  <Badge
                    key={category}
                    variant="secondary"
                    className="px-1.5 py-0.5 text-[10px] bg-cyber-dark/60 border border-cyber-cyan/30 text-cyber-cyan/80 hover:bg-cyber-dark/60 pointer-events-none"
                  >
                    {categoryInfo?.label}
                  </Badge>
                )
              })}
            </div>
          )}
          {/* Featured Badge */}
          {(() => {
            console.log('🔍 Rendering listing:', {
              id: listing.id,
              title: listing.title,
              featured: listing.featured,
              featuredType: typeof listing.featured,
              featuredStrict: listing.featured === true,
              featuredTruthy: !!listing.featured
            })
            
            if (listing.featured === true) {
              console.log('🔍 Featured badge should show!')
              return (
                <div className="flex justify-start">
                  <Badge className="bg-yellow-500/90 text-black border-yellow-400 border-2 font-bold text-xs px-2 py-1 shadow-lg flex items-center gap-1">
                    <Star className="w-3 h-3 fill-black" />
                    FEATURED
                  </Badge>
                </div>
              )
            } else {
              console.log('🔍 Featured badge NOT showing because:', {
                featured: listing.featured,
                hasValue: listing.featured !== undefined,
                isTruthy: !!listing.featured
              })
              return null
            }
          })()}
          {/* Debug: Show featured status */}
          {process.env.NODE_ENV === 'development' && (
            <div className="text-xs text-gray-500">
              Featured: {listing.featured ? 'true' : 'false'}
            </div>
          )}

          {/* Seller info - avatar + name */}
          <Link
            href={`/seller/${listing.seller_id}`}
            title={seller?.display_name || 'View seller'}
            className="flex items-center gap-2 transition-all duration-300 group"
          >
            {/* Seller avatar */}
            <div className="relative grid place-items-center w-7 h-7 rounded-full overflow-hidden border border-cyber-cyan/50 group-hover:border-cyber-cyan group-hover:shadow-[0_0_8px_rgba(34,211,238,0.5)] transition-all duration-300 flex-shrink-0">
              {seller?.avatar_url ? (
                <Image
                  src={seller.avatar_url}
                  alt={seller.display_name || 'Seller'}
                  fill
                  sizes="28px"
                  className="object-cover"
                />
              ) : (seller?.display_name && initials(seller.display_name) !== '?') ? (
                <span className="text-cyber-cyan text-xs font-bold">
                  {initials(seller.display_name)}
                </span>
              ) : (
                <UserIcon className="w-3.5 h-3.5 text-cyber-cyan" />
              )}
            </div>
            {/* Seller name */}
            {seller?.display_name && (
              <span className="text-xs text-cyber-cyan/80 group-hover:text-cyber-cyan transition-colors truncate">
                {seller.display_name}
              </span>
            )}
          </Link>
        </div>

        {/* Action buttons - pushed to bottom */}
        <div className="mt-auto pt-3 space-y-2">
          {isSeller && !listing.featured ? (
            <Button
              variant="destructive"
              size="sm"
              onClick={() => onCancel(listing)}
              disabled={isSoldOrInactive}
              className="w-full text-xs h-8"
            >
              {isSoldOrInactive ? 'Unavailable' : 'Cancel Listing'}
            </Button>
          ) : (
            <Button 
              className="cyber-button w-full text-xs h-8" 
              size="sm" 
              onClick={() => onBuy(listing)}
              disabled={isSoldOrInactive}
            >
              Buy Now
            </Button>
          )}
          
        </div>
      </CardContent>
    </Card>
  )
}

/* ───────────────────────── page ───────────────────────── */

function MarketplaceContent() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const supabase = createClientComponentClient()
  const { toast } = useToast()

  const [uid, setUid] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [listings, setListings] = useState<ListingRow[]>([])
  const [q, setQ] = useState('')
  const [sellerMap, setSellerMap] = useState<Record<string, SellerMeta>>({})
  const [selectedCategories, setSelectedCategories] = useState<string[]>([])
  const [sortBy, setSortBy] = useState<'most_recent' | 'most_sold' | 'best_selling_current' | 'most_viewed'>('most_recent')

  // Pagination state - initialize from URL
  const [totalCount, setTotalCount] = useState(0)
  const ITEMS_PER_PAGE = 30
  const currentPage = Number(searchParams.get('page')) || 1
  
  
  // Detail modal state
  const [detailModalOpen, setDetailModalOpen] = useState(false)
  const [selectedListing, setSelectedListing] = useState<ListingRow | null>(null)
  
  // Checkout modal state
  const [checkoutModalOpen, setCheckoutModalOpen] = useState(false)
  const [checkoutListing, setCheckoutListing] = useState<ListingRow | null>(null)

  // resolve session and admin status
  useEffect(() => {
    let mounted = true
    ;(async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!mounted) return
      setUid(session?.user?.id ?? null)
      
    })()
    const { data: sub } = supabase.auth.onAuthStateChange(async (_e, session) => {
      setUid(session?.user?.id ?? null)
      
    })
    return () => {
      mounted = false
      sub.subscription.unsubscribe()
    }
  }, [supabase])

  const loadSellerMeta = useCallback(
    async (sellerIds: string[]) => {
      if (sellerIds.length === 0) return
      const uniq = Array.from(new Set(sellerIds))
      const { data, error } = await supabase
        .from('profiles') // Updated table name
        .select('id, display_name, avatar_url')
        .in('id', uniq)
        .returns<SellerMeta[]>()

      if (!error && data) {
        const map: Record<string, SellerMeta> = {}
        for (const s of data) map[s.id] = s
        setSellerMap(map)
      }
    },
    [supabase]
  )

  const loadListings = useCallback(async () => {
    setLoading(true)

    // Calculate range for pagination
    const from = (currentPage - 1) * ITEMS_PER_PAGE
    const to = from + ITEMS_PER_PAGE - 1

    // Build base query
    let query = supabase
      .from('marketplace_listings')
      .select(`
        id,
        title,
        description,
        price_cents,
        currency,
        seller_id,
        buyer_id,
        status,
        created_at,
        categories,
        featured,
        asset_id,
        user_assets!inner(
          image_url,
          title,
          series_id,
          series(
            remaining_supply,
            total_supply
          )
        )
      `, { count: 'exact' })
      .eq('status', 'active')
      // Include both featured and non-featured cards, but order featured first

    if (q.trim()) {
      const like = `%${q.trim()}%`
      query = query.or(`title.ilike.${like},description.ilike.${like}`)
    }

    // Filter by categories if any are selected
    if (selectedCategories.length > 0) {
      query = query.overlaps('categories', selectedCategories)
    }

    // For client-side sorting (most_sold, most_viewed), fetch all results
    // For server-side sorting (most_recent), apply pagination and order
    if (sortBy === 'most_recent') {
      query = query
        .order('featured', { ascending: false }) // Featured cards first
        .order('created_at', { ascending: false }) // Then by creation date
        .range(from, to)
    } else {
      // For client-side sorting, still order featured first
      query = query.order('featured', { ascending: false })
    }

    const { data, error, count } = await query

    // Debug: Log the raw data to see if featured field is present
    console.log('🔍 Raw marketplace data:', data)
    if (data && data.length > 0) {
      console.log('🔍 First listing featured status:', {
        id: data[0].id,
        title: data[0].title,
        featured: data[0].featured,
        hasFeaturedField: 'featured' in data[0]
      })
    }

    if (error) {
      setListings([])
      setLoading(false)
      return
    }

    // Set total count for pagination
    setTotalCount(count || 0)

    // Transform the data to match our ListingRow type
    let rows: ListingRow[] = (data ?? []).map((item: any) => {
      const row = {
        id: item.id,
        title: item.title,
        description: item.description,
        image_url: item.user_assets?.image_url || null,
        price_cents: item.price_cents,
        currency: item.currency,
        seller_id: item.seller_id,
        buyer_id: item.buyer_id,
        status: item.status as 'active' | 'sold' | 'inactive',
        is_active: item.status === 'active',
        created_at: item.created_at,
        categories: item.categories || [],
        featured: item.featured || false,
        asset_id: item.asset_id,
        remaining_supply: item.user_assets?.series?.remaining_supply || null,
        total_supply: item.user_assets?.series?.total_supply || null
      }
      
      // Debug log for featured cards - show ALL data
      if (row.featured) {
        console.log('📦 Featured card data:', {
          title: row.title,
          remaining_supply: row.remaining_supply,
          total_supply: row.total_supply,
          has_series_data: item.user_assets?.series ? 'yes' : 'no',
          series_id: item.user_assets?.series_id,
          full_series: item.user_assets?.series
        })
      }
      
      return row
    })

    // If sorting by sales, fetch sale counts via API (to bypass RLS)
    if (sortBy === 'most_sold' || sortBy === 'best_selling_current') {
      const assetIds = rows.map(r => r.asset_id).filter(Boolean)
      
      if (assetIds.length > 0) {
        // Fetch sale counts via API
        const response = await fetch('/api/marketplace/sale-counts', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ asset_ids: assetIds })
        })

        const { saleCounts } = await response.json()
        
        
        // Sort by sale count (but keep featured cards first)
        rows = rows.sort((a, b) => {
          // Featured cards always first
          if (a.featured && !b.featured) return -1
          if (!a.featured && b.featured) return 1
          
          // Then sort by sale count
          const aCount = saleCounts[a.asset_id || ''] || 0
          const bCount = saleCounts[b.asset_id || ''] || 0
          return bCount - aCount // Descending order
        })
  
      }
      
      // Apply pagination after sorting
      rows = rows.slice(from, to + 1)
    }

    // If sorting by views, fetch view counts and sort client-side
    if (sortBy === 'most_viewed') {
      const assetIds = rows.map(r => r.asset_id).filter(Boolean)
      
      if (assetIds.length > 0) {
        // Fetch view counts via API (bypasses RLS)
        const response = await fetch('/api/marketplace/view-counts', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ asset_ids: assetIds })
        })

        const { viewCounts } = await response.json()
        
        
        // Sort by view count (but keep featured cards first)
        rows = rows.sort((a, b) => {
          // Featured cards always first
          if (a.featured && !b.featured) return -1
          if (!a.featured && b.featured) return 1
          
          // Then sort by view count
          const aCount = viewCounts[a.asset_id || ''] || 0
          const bCount = viewCounts[b.asset_id || ''] || 0
          return bCount - aCount // Descending order
        })
      }
      
      // Apply pagination after sorting
      rows = rows.slice(from, to + 1)
    }

    setListings(rows)
    setLoading(false)

    // fetch seller meta for avatar + name
    loadSellerMeta(rows.map(r => r.seller_id))
  }, [supabase, q, selectedCategories, sortBy, loadSellerMeta, ITEMS_PER_PAGE, currentPage])

  useEffect(() => {
    loadListings()
    // Scroll to top when page changes (instant, no animation)
    window.scrollTo(0, 0)
  }, [loadListings, currentPage, q, selectedCategories, sortBy]) // Reload when page, search, categories, or sort changes

  const resultsText = useMemo(() => {
    if (loading) return 'Loading…'
    if (totalCount === 0) return 'No items found'
    return ''
  }, [loading, totalCount])

  const totalPages = Math.ceil(totalCount / ITEMS_PER_PAGE)

  // seller-only action
  const cancelListing = useCallback(
    async (listing: ListingRow) => {
      if (!uid || uid !== listing.seller_id) {
        toast({
          title: 'Unable to cancel',
          description: 'Only the seller can cancel this listing.',
          variant: 'destructive',
        })
        return
      }

      const { error } = await supabase
        .from('marketplace_listings') // Updated table name
        .update({ status: 'inactive' }) // Updated status value
        .eq('id', listing.id)
        .eq('seller_id', uid)

      if (error) {
        toast({ title: 'Cancel failed', description: error.message, variant: 'destructive' })
        return
      }

      setListings(prev => prev.filter(r => r.id !== listing.id))
      toast({ title: 'Listing canceled', description: `${listing.title} removed.`, variant: 'success' as const })
    },
    [supabase, uid, toast]
  )

  // buy action - opens checkout modal
const handleBuy = useCallback(
  (listing: ListingRow): void => {
    const t0 = performance.now();

    // initial click
    void track("buy", {
      action: "click",
      listingId: listing.id,
      sellerId: listing.seller_id,
      price_cents: listing.price_cents,
      status: listing.status,
      is_active: listing.is_active,
      authed: !!uid,
    });

    // unavailable guard
    if (listing.status !== "active" || !listing.is_active) {
      toast({
        title: "Unavailable",
        description: "This item is not currently available.",
        variant: "destructive",
      });
      void track("buy", {
        action: "blocked",
        reason: "unavailable",
        listingId: listing.id,
      });
      return;
    }

    // prevent self-purchase (defense in depth; UI already hides button)
    if (uid && uid === listing.seller_id) {
      toast({
        title: "You're the seller",
        description: "You can't buy your own listing.",
        variant: "destructive",
      });
      void track("buy", {
        action: "blocked",
        reason: "self_purchase",
        listingId: listing.id,
      });
      return;
    }

    // Open checkout modal with the full listing data
    setCheckoutListing(listing)
    setCheckoutModalOpen(true)
    
    // Close detail modal if open
    if (detailModalOpen) {
      setDetailModalOpen(false)
    }

    void track("buy", {
      action: "open_checkout_modal",
      listingId: listing.id,
      duration_ms: Math.round(performance.now() - t0),
      anonymous: !uid,
    });
  },
  [uid, toast, detailModalOpen]
);


  
  // Track view function
  const trackView = useCallback(async (listing: ListingRow) => {
    if (!listing.asset_id) {
      return
    }

    try {
      // Get session ID from browser (or generate one)
      let sessionId = localStorage.getItem('cardify_session_id')
      if (!sessionId) {
        sessionId = `session_${Date.now()}_${Math.random().toString(36).substring(7)}`
        localStorage.setItem('cardify_session_id', sessionId)
      }

      // Track the view via API endpoint (bypasses RLS)
      const response = await fetch('/api/marketplace/track-view', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          asset_id: listing.asset_id,
          viewer_id: uid,
          session_id: sessionId
        })
      })

      const result = await response.json()
      if (!response.ok) {
        console.error('❌ Track view failed:', result)
      } else {
        console.log('✅ View tracked:', result)
      }
    } catch (error) {
      console.error('Failed to track view:', error)
      // Don't show error to user, tracking is non-critical
    }
  }, [uid])

  // open detail modal
  const openDetailModal = useCallback((listing: ListingRow) => {
    setSelectedListing(listing)
    setDetailModalOpen(true)
    // Track the view
    trackView(listing)
  }, [trackView])


  // Navigation function that updates URL
  const navigateToPage = useCallback((page: number) => {
    const params = new URLSearchParams(searchParams.toString())
    if (page > 1) {
      params.set('page', page.toString())
    } else {
      params.delete('page')
    }

    const queryString = params.toString()
    const url = queryString ? `${pathname}?${queryString}` : pathname

    router.push(url, { scroll: false })
  }, [pathname, searchParams, router])
  
  // Navigation functions for modal
  const navigateToNext = useCallback(() => {
    if (!selectedListing || listings.length === 0) return
    const currentIndex = listings.findIndex(l => l.id === selectedListing.id)
    const nextIndex = (currentIndex + 1) % listings.length
    setSelectedListing(listings[nextIndex])
  }, [selectedListing, listings])
  
  const navigateToPrevious = useCallback(() => {
    if (!selectedListing || listings.length === 0) return
    const currentIndex = listings.findIndex(l => l.id === selectedListing.id)
    const prevIndex = currentIndex === 0 ? listings.length - 1 : currentIndex - 1
    setSelectedListing(listings[prevIndex])
  }, [selectedListing, listings])
  
  // Get current position for indicator
  const currentPosition = useMemo(() => {
    if (!selectedListing || listings.length === 0) return { current: 0, total: 0 }
    const index = listings.findIndex(l => l.id === selectedListing.id)
    return { current: index + 1, total: listings.length }
  }, [selectedListing, listings])

  // Copy share link function for modal
  const copyLink = useCallback((listingId: string) => {
    const url = `${window.location.origin}/card/${listingId}`
    navigator.clipboard.writeText(url)
    toast({
      title: "Link copied!",
      description: "Share link copied to clipboard",
      duration: 2000,
    })
  }, [toast])

  return (
    <div className="min-h-screen bg-cyber-black relative overflow-hidden font-mono">
      {/* subtle grid + scanlines to match the rest of the site */}
      <div className="absolute inset-0 cyber-grid opacity-10 pointer-events-none" />
      <div className="absolute inset-0 scanlines opacity-20 pointer-events-none" />

      <div className="relative max-w-7xl mx-auto px-6 py-8 pt-24">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl md:text-5xl font-bold tracking-wider text-white">Marketplace</h1>
          <p className="text-gray-400">Discover and purchase amazing cards</p>
        </div>

        {/* Featured Cards Section */}
     {/*   <FeaturedCardsSection />*/}

        {/* Search and filters */}
        <div className="flex flex-col gap-4 mb-8">
          {/* Search bar, category filter, sort, and refresh button */}
          <div className="flex flex-col md:flex-row items-stretch gap-3">
            {/* Search input */}
            <div className="flex-1 relative min-w-0">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 h-5 w-5 pointer-events-none" />
              <Input
                placeholder="Search listings…"
                className="pl-10 h-12 text-sm bg-cyber-dark/60 border-cyber-cyan/30 focus:border-cyber-cyan/60 text-white placeholder:text-gray-400"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && navigateToPage(1)}
              />
            </div>

            {/* Category filter - compact */}
            <CategorySelector
              compact
              selectedCategories={selectedCategories as CardCategory[]}
              onChange={(categories) => {
                setSelectedCategories(categories)
                navigateToPage(1)
              }}
              className="w-full md:w-[180px]"
            />

            {/* Sort dropdown */}
            <Select value={sortBy} onValueChange={(value: any) => {
              setSortBy(value)
              navigateToPage(1)
            }}>
              <SelectTrigger className="w-full md:w-[180px] h-12 bg-cyber-dark/60 border-cyber-cyan/30 text-white hover:border-cyber-cyan/60 hover:bg-cyber-dark/80 transition-colors [&>svg]:text-gray-400">
                <div className="flex items-center">
                  <ArrowUpDown className="w-4 h-4 mr-2 text-gray-400" />
                  <SelectValue />
                </div>
              </SelectTrigger>
              <SelectContent className="bg-cyber-dark border-cyber-cyan/30 text-white">
                <SelectItem value="most_recent">Most Recent</SelectItem>
                <SelectItem value="most_sold">Most Sold</SelectItem>
                <SelectItem value="best_selling_current">Best Selling</SelectItem>
                <SelectItem value="most_viewed">Most Viewed</SelectItem>
              </SelectContent>
            </Select>

            {/* Refresh button */}
            <Button
              onClick={() => loadListings()}
              className="h-12 w-full md:w-auto px-6 bg-cyber-dark border-2 border-cyber-cyan text-cyber-cyan hover:bg-cyber-cyan/10 hover:border-cyber-cyan transition-all"
            >
              Refresh
            </Button>
          </div>
        </div>

        {/* Results - only show if there's a message */}
        {resultsText && (
          <div className="flex items-end justify-between mb-4">
            <p className="text-gray-400">{resultsText}</p>
          </div>
        )}

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {Array.from({ length: Math.min(30, totalCount || 30) }).map((_, i) => (
              <div key={i} className="bg-cyber-dark/60 border border-cyber-cyan/30 rounded-lg p-3 animate-pulse">
                {/* Card skeleton with trading card aspect ratio */}
                <div className="relative aspect-[5/7] bg-gradient-to-br from-cyber-dark/40 to-cyber-dark/80 rounded-lg border-2 border-cyber-cyan/20">
                  <div className="absolute inset-0 bg-cyber-cyan/5 animate-pulse" />
                </div>
                {/* Title skeleton */}
                <div className="mt-3 space-y-2">
                  <div className="h-4 bg-cyber-cyan/10 rounded animate-pulse" />
                  <div className="flex justify-between items-center">
                    <div className="h-4 w-16 bg-cyber-green/10 rounded animate-pulse" />
                    <div className="w-8 h-8 rounded-full bg-cyber-cyan/10 animate-pulse" />
                  </div>
                </div>
                {/* Button skeleton */}
                <div className="mt-3">
                  <div className="h-8 bg-cyber-cyan/10 rounded animate-pulse" />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {listings.map((row, index) => (
              <MarketplaceCard
                key={row.id}
                listing={row}
                currentUserId={uid}
                seller={sellerMap[row.seller_id]}
                onCancel={cancelListing}
                onBuy={handleBuy}
                onView={openDetailModal}
                priority={index < 10}
              />
            ))}
          </div>
        )}

        {/* Pagination controls */}
        {totalPages > 1 && (
          <nav aria-label="Marketplace pagination" className="flex justify-center items-center gap-4 mt-8">
            <Button
              onClick={() => navigateToPage(currentPage - 1)}
              disabled={currentPage === 1 || loading}
              className="bg-cyber-dark border-2 border-cyber-cyan text-cyber-cyan hover:bg-cyber-cyan/10 disabled:opacity-50"
              aria-label="Go to previous page"
            >
              <ChevronLeft className="w-4 h-4 mr-2" />
              Previous
            </Button>

            <div className="flex items-center gap-2">
              <span className="text-gray-400">Page</span>
              <span className="text-cyber-cyan font-bold" aria-current="page">{currentPage}</span>
              <span className="text-gray-400">of</span>
              <span className="text-cyber-cyan font-bold">{totalPages}</span>
            </div>

            <Button
              onClick={() => navigateToPage(currentPage + 1)}
              disabled={currentPage === totalPages || loading}
              className="bg-cyber-dark border-2 border-cyber-cyan text-cyber-cyan hover:bg-cyber-cyan/10 disabled:opacity-50"
              aria-label="Go to next page"
            >
              Next
              <ChevronRight className="w-4 h-4 ml-2" />
            </Button>
          </nav>
        )}
      </div>

      {/* Listing Detail Modal */}
      <Dialog open={detailModalOpen} onOpenChange={setDetailModalOpen}>
        <DialogContent className="max-w-4xl bg-cyber-dark/95 border-2 border-cyber-cyan/50 text-white h-[85svh] max-h-[85svh] md:h-auto md:max-h-[85svh] flex flex-col p-0 gap-0 relative">
          {/* Navigation buttons - both mobile and desktop */}
          {listings.length > 1 && (
            <>
              {/* Desktop buttons - outside modal when viewport > 1008px, further out on larger screens */}
              <button
                onClick={navigateToPrevious}
                className="hidden min-[1008px]:flex absolute -left-14 lg:-left-16 xl:-left-20 top-1/2 -translate-y-1/2 z-10 w-12 h-12 rounded-full bg-cyber-dark/90 backdrop-blur-sm border-2 border-cyber-cyan/50 hover:border-cyber-cyan hover:bg-gray-800/90 active:bg-gray-700/90 transition-all duration-300 items-center justify-center"
                aria-label="Previous card"
              >
                <ChevronLeft className="w-6 h-6 text-cyber-cyan" />
              </button>
              <button
                onClick={navigateToNext}
                className="hidden min-[1008px]:flex absolute -right-14 lg:-right-16 xl:-right-20 top-1/2 -translate-y-1/2 z-10 w-12 h-12 rounded-full bg-cyber-dark/90 backdrop-blur-sm border-2 border-cyber-cyan/50 hover:border-cyber-cyan hover:bg-gray-800/90 active:bg-gray-700/90 transition-all duration-300 items-center justify-center"
                aria-label="Next card"
              >
                <ChevronRight className="w-6 h-6 text-cyber-cyan" />
              </button>
              
              {/* Mobile/Tablet buttons - inside modal when viewport < 1008px */}
              <button
                onClick={navigateToPrevious}
                className="min-[1008px]:hidden absolute left-2 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full bg-cyber-dark/90 backdrop-blur-sm border-2 border-cyber-cyan/50 hover:border-cyber-cyan hover:bg-gray-800/90 active:bg-gray-700/90 transition-all duration-300 flex items-center justify-center"
                aria-label="Previous card"
              >
                <ChevronLeft className="w-5 h-5 text-cyber-cyan" />
              </button>
              <button
                onClick={navigateToNext}
                className="min-[1008px]:hidden absolute right-2 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full bg-cyber-dark/90 backdrop-blur-sm border-2 border-cyber-cyan/50 hover:border-cyber-cyan hover:bg-gray-800/90 active:bg-gray-700/90 transition-all duration-300 flex items-center justify-center"
                aria-label="Next card"
              >
                <ChevronRight className="w-5 h-5 text-cyber-cyan" />
              </button>
            </>
          )}
          {selectedListing && (
            <>
              {/* Mobile Layout - No Scroll */}
              <div className="md:hidden flex flex-col h-full p-3 px-5">
                {/* Card image container - maximized size */}
                <div className="flex-1 min-h-0 relative mb-3">
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div
                      className="relative bg-gradient-to-br from-cyber-dark/40 to-cyber-dark/80 rounded-2xl border-2 border-cyber-cyan/50 overflow-hidden"
                      style={{
                        width: 'min(100%, calc((100vh * 0.6) * 5/7))',
                        aspectRatio: '5/7'
                      }}
                    >
                      <Image
                        src={selectedListing.image_url || '/placeholder.svg'}
                        alt={selectedListing.title}
                        fill
                        sizes="100vw"
                        className="object-fill"
                        priority
                      />
                    </div>
                  </div>
                </div>
                  
                {/* Compact info section */}
                <div className="mb-3">
                  {/* Seller Info - Super Compact */}
                  <Link 
                    href={`/seller/${selectedListing.seller_id}`}
                    className="flex items-center gap-2 hover:opacity-80 transition-opacity mt-2"
                  >
                    <div className="relative w-8 h-8 rounded-full overflow-hidden border border-cyber-cyan/50 flex-shrink-0">
                      {sellerMap[selectedListing.seller_id]?.avatar_url ? (
                        <Image
                          src={sellerMap[selectedListing.seller_id].avatar_url!}
                          alt={sellerMap[selectedListing.seller_id].display_name || 'Seller'}
                          fill
                          sizes="32px"
                          className="object-cover"
                        />
                      ) : (
                        <div className="w-full h-full bg-cyber-dark grid place-items-center">
                          {sellerMap[selectedListing.seller_id]?.display_name ? (
                            <span className="text-cyber-cyan text-xs font-bold">
                              {initials(sellerMap[selectedListing.seller_id].display_name)}
                            </span>
                          ) : (
                            <UserIcon className="w-4 h-4 text-cyber-cyan" />
                          )}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-gray-400">Seller:</span>
                      <span className="text-sm text-white">
                        {sellerMap[selectedListing.seller_id]?.display_name || 'Unknown'}
                      </span>
                    </div>
                  </Link>
                  
                  {/* Title and Price on same line */}
                  <div className="flex items-end justify-between gap-2">
                    <h2 className="text-lg font-bold text-white leading-tight flex-1">
                      {selectedListing.title}
                    </h2>
                    <div className="flex flex-col items-end">
                      <span className="text-xl font-bold text-cyber-green leading-none">
                        ${(selectedListing.price_cents / 100).toFixed(2)}
                      </span>
                      <div className={`flex items-center gap-1 mt-1 ${
                        selectedListing.status !== 'active' || !selectedListing.is_active 
                          ? 'text-red-400' 
                          : 'text-emerald-400'
                      }`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${
                          selectedListing.status !== 'active' || !selectedListing.is_active 
                            ? 'bg-red-400' 
                            : 'bg-emerald-400 animate-pulse'
                        }`} />
                        <span className="text-[10px] uppercase tracking-wider leading-none">
                          {selectedListing.status !== 'active' || !selectedListing.is_active 
                            ? 'Sold' 
                            : 'Available'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
                
                {/* Action buttons - no border, integrated */}
                <div className="flex gap-2 flex-shrink-0">
                  {/* Share button - standalone icon button */}
                  <button
                    onClick={() => copyLink(selectedListing.id)}
                    className="h-11 w-11 rounded-lg bg-transparent border border-cyber-cyan/50 flex items-center justify-center hover:bg-cyber-cyan/10 hover:border-cyber-cyan transition-all duration-300 group flex-shrink-0"
                    title="Copy share link"
                  >
                    <Link2 className="w-4 h-4 text-cyber-cyan group-hover:text-cyber-pink transition-colors" />
                  </button>
                  {uid === selectedListing.seller_id && !selectedListing.featured ? (
                    <Button
                      variant="destructive"
                      onClick={() => {
                        setDetailModalOpen(false)
                        cancelListing(selectedListing)
                      }}
                      disabled={selectedListing.status !== 'active' || !selectedListing.is_active}
                      className="flex-1 h-11"
                    >
                      Cancel Listing
                    </Button>
                  ) : (
                    <>
                      <Button
                        variant="outline"
                        onClick={() => setDetailModalOpen(false)}
                        className="flex-1 h-11 bg-transparent border border-cyber-pink text-cyber-pink hover:text-cyber-pink hover:border-cyber-pink/70 hover:bg-cyber-pink/10 transition-all"
                      >
                        Close
                      </Button>
                      <Button
                        className="flex-1 h-11 cyber-button text-base font-bold"
                        onClick={() => {
                          setDetailModalOpen(false)
                          handleBuy(selectedListing)
                        }}
                        disabled={selectedListing.status !== 'active' || !selectedListing.is_active}
                      >
                        Buy Now
                      </Button>
                    </>
                  )}
                </div>
              </div>
              
              {/* Desktop Layout */}
              <div className="hidden md:grid md:grid-cols-2 gap-6 p-6">
                {/* Left side - Image */}
                <div className="relative aspect-[5/7] bg-gradient-to-br from-cyber-dark/40 to-cyber-dark/80 rounded-2xl overflow-hidden border-2 border-cyber-cyan/50">
                  <Image
                    src={selectedListing.image_url || '/placeholder.svg'}
                    alt={selectedListing.title}
                    fill
                    sizes="(max-width: 768px) 100vw, 50vw"
                    className="object-fill"
                    priority
                  />
                </div>
                
                {/* Right side - Details */}
                <div className="flex flex-col">
                  <DialogHeader>
                    <div className="flex items-start justify-between mb-4">
                      <DialogTitle className="text-2xl font-bold text-white">
                        {selectedListing.title}
                      </DialogTitle>
                      {/* Share button for desktop */}
                      <button
                        onClick={() => copyLink(selectedListing.id)}
                        className="p-2 rounded-lg bg-transparent border border-cyber-cyan/50 hover:bg-cyber-cyan/10 hover:border-cyber-cyan transition-all duration-300 group flex-shrink-0 ml-4"
                        title="Copy share link"
                      >
                        <Link2 className="w-5 h-5 text-cyber-cyan group-hover:text-cyber-pink transition-colors" />
                      </button>
                    </div>
                  </DialogHeader>
                  
                  <div className="flex-1 space-y-4">
                  {/* Price and Status */}
                  <div>
                    <h3 className="text-sm text-gray-400 mb-2">Price</h3>
                    <div className="flex items-end gap-3">
                      <span className="text-3xl font-bold text-cyber-green leading-none">
                        ${(selectedListing.price_cents / 100).toFixed(2)}
                      </span>
                      <div className={`flex items-center gap-1 pb-[2px] ${
                        selectedListing.status !== 'active' || !selectedListing.is_active 
                          ? 'text-red-400' 
                          : 'text-emerald-400'
                      }`}>
                        <span className={`w-2 h-2 rounded-full ${
                          selectedListing.status !== 'active' || !selectedListing.is_active 
                            ? 'bg-red-400' 
                            : 'bg-emerald-400 animate-pulse'
                        }`} />
                        <span className="text-sm uppercase tracking-wider leading-none">
                          {selectedListing.status !== 'active' || !selectedListing.is_active 
                            ? 'Unavailable' 
                            : 'Available'}
                        </span>
                      </div>
                    </div>
                  </div>
                  
                  {/* Seller Info */}
                  <div>
                    <h3 className="text-sm text-gray-400 mb-2">Seller</h3>
                    <Link 
                      href={`/seller/${selectedListing.seller_id}`}
                      className="inline-flex items-center gap-3 hover:opacity-80 transition-opacity"
                    >
                      <div className="relative w-10 h-10 rounded-full overflow-hidden border-2 border-cyber-cyan">
                        {sellerMap[selectedListing.seller_id]?.avatar_url ? (
                          <Image
                            src={sellerMap[selectedListing.seller_id].avatar_url!}
                            alt={sellerMap[selectedListing.seller_id].display_name || 'Seller'}
                            fill
                            sizes="40px"
                            className="object-cover"
                          />
                        ) : (
                          <div className="w-full h-full bg-cyber-dark grid place-items-center">
                            {sellerMap[selectedListing.seller_id]?.display_name ? (
                              <span className="text-cyber-cyan text-sm font-bold">
                                {initials(sellerMap[selectedListing.seller_id].display_name)}
                              </span>
                            ) : (
                              <UserIcon className="w-5 h-5 text-cyber-cyan" />
                            )}
                          </div>
                        )}
                      </div>
                      <span className="text-white">
                        {sellerMap[selectedListing.seller_id]?.display_name || 'Unknown Seller'}
                      </span>
                    </Link>
                  </div>
                  
                  {/* Categories */}
                  {selectedListing.categories.length > 0 && (
                    <div>
                      <h3 className="text-sm text-gray-400 mb-2">Categories</h3>
                      <div className="flex flex-wrap gap-2">
                        {selectedListing.categories.map(category => {
                          const categoryInfo = CARD_CATEGORIES.find(c => c.value === category)
                          return (
                            <Badge
                              key={category}
                              variant="secondary"
                              className="px-2 py-1 bg-cyber-dark/60 border border-cyber-cyan/30 text-cyber-cyan"
                            >
                              {categoryInfo?.label}
                            </Badge>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {/* Metadata */}
                  {selectedListing.created_at && (
                    <div>
                      <h3 className="text-sm text-gray-400 mb-2">Listed</h3>
                      <p className="text-white">
                        {new Date(selectedListing.created_at).toLocaleDateString()}
                      </p>
                    </div>
                  )}
                  </div>
                  
                  {/* Action Buttons */}
                  <DialogFooter className="mt-6 gap-3">
                    {uid === selectedListing.seller_id && !selectedListing.featured ? (
                      <Button
                        variant="destructive"
                        onClick={() => {
                          setDetailModalOpen(false)
                          cancelListing(selectedListing)
                        }}
                        disabled={selectedListing.status !== 'active' || !selectedListing.is_active}
                        className="flex-1"
                      >
                        Cancel Listing
                      </Button>
                    ) : (
                      <>
                        <Button 
                          variant="outline" 
                          onClick={() => setDetailModalOpen(false)}
                          className="flex-1 bg-transparent border border-cyber-pink text-cyber-pink hover:text-cyber-pink hover:border-cyber-pink/70 hover:bg-cyber-pink/10 transition-all"
                        >
                          Close
                        </Button>
                        <Button 
                          className="flex-1 cyber-button" 
                          onClick={() => {
                            setDetailModalOpen(false)
                            handleBuy(selectedListing)
                          }}
                          disabled={selectedListing.status !== 'active' || !selectedListing.is_active}
                        >
                          Buy Now
                        </Button>
                      </>
                    )}
                  </DialogFooter>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
      
      {/* Unified Checkout Modal - handles both custom cards and marketplace items */}
      <CustomCardCheckoutModal
        isOpen={checkoutModalOpen}
        onClose={() => setCheckoutModalOpen(false)}
        uploadedImage={checkoutListing?.image_url || null}
        processedImageBlob={null}
        uploadedImageUrl={checkoutListing?.image_url || null}
        marketplaceListing={checkoutListing}
      />
    </div>
  )
}

export default function MarketplacePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-cyber-black relative overflow-hidden font-mono">
        <div className="absolute inset-0 cyber-grid opacity-10 pointer-events-none" />
        <div className="absolute inset-0 scanlines opacity-20 pointer-events-none" />
        <div className="relative max-w-7xl mx-auto px-6 py-8 pt-24">
          <div className="mb-8">
            <h1 className="text-4xl md:text-5xl font-bold tracking-wider text-white">Marketplace</h1>
            <p className="text-gray-400">Discover and purchase amazing cards</p>
          </div>
          <div className="flex items-center justify-center h-96">
            <div className="text-cyber-cyan">Loading marketplace...</div>
          </div>
        </div>
      </div>
    }>
      <MarketplaceContent />
    </Suspense>
  )
}
