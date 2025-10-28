"use client"

export const dynamic = "force-dynamic"

import { useEffect, useMemo, useState, useCallback, useRef, Suspense } from "react"
import Image from "next/image"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu"
import { useToast } from "@/hooks/use-toast"
import { useNotifications, notificationHelpers } from "@/components/notification-system"
import { useOwnedCardify } from "@/hooks/useOwnedCardify"
import NFTCard from "@/components/NFTCard"
import { WalletButton } from "@/components/WalletConnect"
import AvatarUploader from "@/components/AvatarUploader"
import { Pencil, Check, X, Sparkles, Trash2,XCircle, Loader2, AlertTriangle, ChevronDown, Upload, Plus, Package, CheckCircle, MessageSquare, Download, Link2, Layers, CreditCard, Zap, Star } from "lucide-react"
import { Lightbox } from "@/components/ui/lightbox"
import { CustomCardCheckoutModal } from "@/components/custom-card-checkout-modal"
import { CategorySelector, CardCategory } from "@/components/category-selector"
import { getDollarValue } from "@/lib/utils"

const FACTORY = process.env.NEXT_PUBLIC_FACTORY_ADDRESS as `0x${string}`

// Fallback image for broken thumbnails
const PLACEHOLDER =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><rect width="100%" height="100%" fill="#0b0f19"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="#6ee7ff" font-family="monospace" font-size="18">No Preview</text></svg>`
  )

type AssetRow = {
  id: string
  user_id: string // Updated from owner_id
  title: string | null
  asset_type: string | null // Updated from source_type
  image_url: string | null
  storage_path: string | null
  mime_type: string | null
  file_size_bytes: number | null // Updated from size_bytes
  created_at: string | null
  metadata: Record<string, any> | null
  featured: boolean
}

type UIAsset = {
  id: string
  user_id: string // Updated from owner_id
  file_path: string
  file_name: string
  file_size: number | null
  mime_type: string | null
  uploaded_at: string | null
  public_url: string
  asset_type: string | null // Updated from source_type
  isGenerated: boolean
  featured: boolean
}

const toUI = (row: AssetRow): UIAsset => {
  const file_path = row.storage_path ?? row.title ?? ""
  const file_name =
    (row.title && row.title.trim()) ||
    file_path.split("/").pop() ||
    "file"

  return {
    id: row.id,
    user_id: row.user_id, // Updated from owner_id
    file_path,
    file_name,
    file_size: row.file_size_bytes ?? null, // Updated from size_bytes
    mime_type: row.mime_type ?? null,
    uploaded_at: row.created_at ?? null,
    public_url: row.image_url ?? "",
    asset_type: row.asset_type ?? null, // Updated from source_type
    isGenerated: row.asset_type === 'generated', // Updated logic
    featured: row.featured ?? false,
  }
}


type ListingRow = {
  id: string
  asset_id: string
  seller_id: string
  title: string
  description: string | null
  price_cents: number
  currency: string
  status: 'active' | 'sold' | 'inactive'
}

function ProfileContent() {
  const supabase = createClientComponentClient()
  const { toast } = useToast()
  const { showNotification, showConfirmation } = useNotifications()
  const searchParams = useSearchParams()

  // Stripe Connect onboarding removed
  const [uid, setUid] = useState<string | null>(null)
  const [loadingAuth, setLoadingAuth] = useState(true)

  const [assets, setAssets] = useState<UIAsset[]>([])
  const [loadingAssets, setLoadingAssets] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  // Stripe Connect removed - all sales go to main account

  const [sellOpen, setSellOpen] = useState(false)
  const [selectedAsset, setSelectedAsset] = useState<UIAsset | null>(null)
  const FIXED_PRICE_USD = 9
  const [creating, setCreating] = useState(false)
  const [listingName, setListingName] = useState<string>("")
  const [selectedCategories, setSelectedCategories] = useState<CardCategory[]>([])

  const [listingBySource, setListingBySource] = useState<Record<string, ListingRow | undefined>>({})
  const [canceling, setCanceling] = useState<string | null>(null)

  const PAGE_SIZE = 30

  // Separate pagination state for generations
  const [generationsOffset, setGenerationsOffset] = useState(0)
  const [hasMoreGenerations, setHasMoreGenerations] = useState(true)
  const [loadingMoreGenerations, setLoadingMoreGenerations] = useState(false)

  // Separate pagination state for uploads
  const [uploadsOffset, setUploadsOffset] = useState(0)
  const [hasMoreUploads, setHasMoreUploads] = useState(true)
  const [loadingMoreUploads, setLoadingMoreUploads] = useState(false)


  // Avatar
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)

  // Profile Name
  const [displayName, setDisplayName] = useState<string>("")
  const [nameLoading, setNameLoading] = useState<boolean>(true)
  const [nameSaving, setNameSaving] = useState<boolean>(false)
  const [isEditingName, setIsEditingName] = useState<boolean>(false)
  const [draftName, setDraftName] = useState<string>("")
  const [nameError, setNameError] = useState<string | null>(null)
  const [checkingName, setCheckingName] = useState<boolean>(false)

  // Credit conversion state
  const [isConvertingCredits, setIsConvertingCredits] = useState<boolean>(false)

  // Image-rename state
  const [renameId, setRenameId] = useState<string | null>(null)
  const [renamingId, setRenamingId] = useState<string | null>(null) 
  const [draftTitle, setDraftTitle] = useState<string>('')
  
  // Tab state
  const [activeTab, setActiveTab] = useState<string>("cards")

  // Greeting after save
  const [greeting, setGreeting] = useState<string | null>(null)
  const greetTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
const [deletingId, setDeletingId] = useState<string | null>(null)
const [confirmOpen, setConfirmOpen] = useState(false)
const [targetAsset, setTargetAsset] = useState<UIAsset | null>(null)
const [isCreateDropdownOpen, setIsCreateDropdownOpen] = useState(false)

// Lightbox state
const [lightboxOpen, setLightboxOpen] = useState(false)
const [lightboxIndex, setLightboxIndex] = useState(0)

// Checkout modal state
const [checkoutModalOpen, setCheckoutModalOpen] = useState(false)
const [selectedCardForCheckout, setSelectedCardForCheckout] = useState<UIAsset | null>(null)

// Type for purchase transactions
type PurchaseTransaction = {
  id: string
  listingId: string
  amountCents: number
  currency: string
  status: string
  purchasedAt: string
  asset: {
    id: string
    title: string
    description: string | null
    imageUrl: string
    assetTitle: string
    assetType: string | null // Added for purchase title cleaning
  }
}

type TransactionHistory = {
  id: string
  type: 'purchase' | 'sale' | 'credit_purchase' | 'credit_usage' | 'revenue_conversion' | 'revenue_request' | 'credit_transaction' | 'credit_added' | 'generation' | 'upload' | 'credit_used'
  amount_cents?: number
  credits?: number
  description: string
  status: string
  created_at: string
  metadata?: Record<string, any>
}

const [purchases, setPurchases] = useState<PurchaseTransaction[]>([])
const [loadingPurchases, setLoadingPurchases] = useState<boolean>(true)
const [transactionHistory, setTransactionHistory] = useState<TransactionHistory[]>([])
const [loadingTransactionHistory, setLoadingTransactionHistory] = useState<boolean>(true)
const [totalSales, setTotalSales] = useState<number>(0)
const [totalRevenue, setTotalRevenue] = useState<number>(0)
const [loadingSales, setLoadingSales] = useState<boolean>(true)
const [totalSalesCount, setTotalSalesCount] = useState<number>(0) 
const [requestedAmount, setRequestedAmount] = useState<number>(0) 
const [userCredits, setUserCredits] = useState<number>(0)

// Duplicate detection states
const [duplicateDetections, setDuplicateDetections] = useState<Record<string, any>>({})
const [loadingDuplicates, setLoadingDuplicates] = useState<boolean>(false)

// Feedback modal states
const [feedbackOpen, setFeedbackOpen] = useState(false)
const [feedbackSubject, setFeedbackSubject] = useState("")
const [feedbackMessage, setFeedbackMessage] = useState("")
const [submittingFeedback, setSubmittingFeedback] = useState(false)

// Revenue request modal states
const [revenueRequestOpen, setRevenueRequestOpen] = useState(false)
const [stripePaymentOpen, setStripePaymentOpen] = useState(false)
const [stripeFormData, setStripeFormData] = useState({
  name: '',
  email: '',
  phone: '',
  stripeAccount: ''
})
const [submittingStripe, setSubmittingStripe] = useState<boolean>(false)

// ───────────────────────── Uploads (uploaded_images) state ────────────────
const [uploadsLightboxOpen, setUploadsLightboxOpen] = useState(false)
const [uploadsLightboxIndex, setUploadsLightboxIndex] = useState(0)

// ───────────────────────── Purchases lightbox state ────────────────
const [purchasesLightboxOpen, setPurchasesLightboxOpen] = useState(false)
const [purchasesLightboxIndex, setPurchasesLightboxIndex] = useState(0)



const openDeleteConfirm = (a: UIAsset) => {
  setTargetAsset(a)
  setConfirmOpen(true)
}

const openCheckoutModal = (a: UIAsset) => {
  setSelectedCardForCheckout(a)
  setCheckoutModalOpen(true)
}

const renameAsset = async (id: string, title: string) => {
  if (!uid) return
  const clean = title.trim()
  if (!clean) {
    toast({ title: 'Empty name', description: 'Provide a file name.', variant: 'destructive' })
    return
  }
  setRenamingId(id)

  // Update the asset title
  const { error } = await supabase
    .from('user_assets')
    .update({ title: clean })
    .eq('id', id)

  if (error) {
    setRenamingId(null)
    toast({ title: 'Rename failed', description: error.message, variant: 'destructive' })
    return
  }

  // Check if there's an active marketplace listing for this asset and update it too
  const existingListing = listingBySource[id]
  if (existingListing && existingListing.status === 'active') {
    const { error: listingError } = await supabase
      .from('marketplace_listings')
      .update({
        title: clean,
        description: clean // Update description too since we use the same value
      })
      .eq('asset_id', id)
      .eq('status', 'active')

    if (listingError) {
      console.error('Failed to update marketplace listing:', listingError)
      // Don't show error toast - the asset rename was successful
    } else {
      // Update the local listing state
      setListingBySource(prev => ({
        ...prev,
        [id]: { ...existingListing, title: clean, description: clean }
      }))
    }
  }

  setRenamingId(null)

  // optimistic UI
  setAssets(prev => prev.map(a => (a.id === id ? { ...a, file_name: clean } : a)))
  setRenameId(null)
  setDraftTitle('')
}

const confirmDelete = async () => {
  if (!targetAsset) return
  setConfirmOpen(false)
  await deleteAsset(targetAsset)   
  setTargetAsset(null)
}

const submitFeedback = async () => {
  if (!feedbackSubject.trim() || !feedbackMessage.trim()) {
    toast({
      title: "Missing Information",
      description: "Please fill in both subject and message fields.",
      variant: "destructive",
    })
    return
  }

  setSubmittingFeedback(true)
  
  try {
    const response = await fetch('/api/feedback', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        subject: feedbackSubject.trim(),
        message: feedbackMessage.trim(),
      }),
    })

    const result = await response.json()

    if (result.success) {
      toast({
        title: "Feedback Submitted",
        description: "Thank you for your feedback! We'll review it and get back to you soon.",
        variant: "default",
      })
      
      // Reset form and close modal
      setFeedbackSubject("")
      setFeedbackMessage("")
      setFeedbackOpen(false)
    } else {
      toast({
        title: "Submission Failed",
        description: result.error || "Failed to submit feedback. Please try again.",
        variant: "destructive",
      })
    }
  } catch (error) {
    console.error('Error submitting feedback:', error)
    toast({
      title: "Submission Failed",
      description: "An error occurred while submitting your feedback. Please try again.",
      variant: "destructive",
    })
  } finally {
    setSubmittingFeedback(false)
  }
}

  const showGreeting = (name: string) => {
    const greetings = [
      `Hey ${name}!`,
      `Welcome back, ${name}!`,
      `Nice to see you, ${name}!`,
      `Great to have you here, ${name}!`,
    ]
    const msg = greetings[Math.floor(Math.random() * greetings.length)]
    setGreeting(msg)
    if (greetTimeoutRef.current) clearTimeout(greetTimeoutRef.current)
    greetTimeoutRef.current = setTimeout(() => setGreeting(null), 4000)
    toast({ title: msg, description: "Your profile name has been updated." })
  }

  async function fetchSellerListings(userId: string, assetIds: string[]) {
    if (assetIds.length === 0) {
      setListingBySource({})
      return
    }
    const { data, error } = await supabase
      .from("marketplace_listings") 
      .select("id, asset_id, seller_id, title, description, price_cents, currency, status")
      .eq("seller_id", userId)
      .in("asset_id", assetIds)
      .eq("status", "active") 
      .returns<ListingRow[]>()
    if (error) {
      console.error(error)
      setListingBySource({})
      return
    }
    const map: Record<string, ListingRow> = {}
    for (const row of data ?? []) map[row.asset_id] = row 
    setListingBySource(map)
  }

async function fetchTotalSales(userId: string) {
  setLoadingSales(true)
  
  try {
    // 1. Get total sales count (all time) from both asset_buyers and revenue_history
    const [assetBuyersResult, revenueHistoryResult] = await Promise.all([
      supabase.from('asset_buyers').select('id').eq('seller_id', userId),
      supabase.from('revenue_history').select('id').eq('seller_id', userId)
    ])
    
    const totalSalesCount = (assetBuyersResult.data?.length || 0) + (revenueHistoryResult.data?.length || 0)
    setTotalSalesCount(totalSalesCount)

    // 2. Get available revenue from both asset_buyers and revenue_history
    const [assetBuyersData, revenueHistoryData] = await Promise.all([
      supabase.from('asset_buyers').select('revenue_status, purchase_amount_cents').eq('seller_id', userId),
      supabase.from('revenue_history').select('revenue_status, purchase_amount_cents').eq('seller_id', userId)
    ])

    if (assetBuyersData.error || revenueHistoryData.error) {
      console.error('Error fetching sales data:', assetBuyersData.error || revenueHistoryData.error)
      setTotalSales(0)
      setTotalRevenue(0)
    } else {
      // Use only asset_buyers data to avoid double-counting
      // The revenue_history table is just for tracking requests, not for calculating total revenue
      const allSalesData = assetBuyersData.data || []
      
      // Count available sales (status = 'available') and calculate revenue at fixed $2 per sale
      const availableSales = allSalesData.filter(sale => sale.revenue_status === 'available')
      const availableSalesCount = availableSales.length
      const REVENUE_PER_SALE_CENTS = 200 // Fixed $2 seller share per sale
      const totalRevenueCents = availableSalesCount * REVENUE_PER_SALE_CENTS
      
      
      setTotalSales(availableSalesCount)
      setTotalRevenue(totalRevenueCents)
    }

    // 3. Get requested amount (pending Stripe payments)
    const { data: requestedData, error: requestedError } = await supabase
      .from('revenue_requests')
      .select('amount_cents')
      .eq('user_id', userId)
      .eq('request_type', 'stripe_payment')
      .eq('status', 'pending')
    
    if (requestedError) {
      console.error('Error fetching requested amount:', requestedError)
      setRequestedAmount(0)
    } else {
      const totalRequested = requestedData?.reduce((sum, req) => sum + (req.amount_cents || 0), 0) || 0
      setRequestedAmount(totalRequested)
    }

  } catch (error) {
    console.error('Error in fetchTotalSales:', error)
    setTotalSales(0)
    setTotalRevenue(0)
    setRequestedAmount(0)
  } finally {
    setLoadingSales(false)
  }
}

async function fetchDuplicateDetections(userId: string) {
  setLoadingDuplicates(true)
  
  try {
    const { data: detections, error } = await supabase
      .from('duplicate_detections')
      .select('asset_id, status, similarity_score, created_at')
      .eq('user_id', userId)
      .in('status', ['pending', 'approved', 'rejected'])

    if (error) {
      console.error('Error fetching duplicate detections:', error)
      setDuplicateDetections({})
    } else {
      // Convert array to object keyed by asset_id
      const detectionsMap = (detections || []).reduce((acc, detection) => {
        acc[detection.asset_id] = detection
        return acc
      }, {} as Record<string, any>)
      setDuplicateDetections(detectionsMap)
    }
  } catch (error) {
    console.error('Error fetching duplicate detections:', error)
    setDuplicateDetections({})
  } finally {
    setLoadingDuplicates(false)
  }
}

async function fetchUserCredits(userId: string) {
  try {
    // Get user's current credits balance from profiles table
    const { data: profileData, error: profileError } = await supabase
      .from('profiles')
      .select('credits')
      .eq('id', userId)
      .single()
    
    if (profileError) {
      console.error('Error fetching user credits:', profileError)
      setUserCredits(0)
    } else {
      setUserCredits(Number(profileData?.credits) || 0)
    }
  } catch (error) {
    console.error('Error in fetchUserCredits:', error)
    setUserCredits(0)
  }
}

async function handleRequestRevenue() {
  if (totalRevenue === 0) {
    toast({
      title: "No Revenue Available",
      description: "You don't have any revenue to request at this time.",
      variant: "destructive"
    })
    return
  }

  // Open the revenue request modal
  setRevenueRequestOpen(true)
}


// Update the handleGetCredits function to check for pending payments first
async function handleGetCredits() {
  try {
    // Prevent multiple simultaneous conversions
    if (isConvertingCredits) {
      toast({
        title: "Conversion in Progress",
        description: "Please wait for the current conversion to complete.",
        variant: "destructive"
      })
      return
    }

    // Check if there's any revenue to convert
    if (totalRevenue <= 0) {
      toast({
        title: "No Revenue Available",
        description: "You don't have any revenue to convert to credits.",
        variant: "destructive"
      })
      return
    }

    // Proceed with credit conversion
    await convertRevenueToCredits()
  } catch (error) {
    console.error('Error in handleGetCredits:', error)
    toast({
      title: "Error",
      description: "There was an error processing your request.",
      variant: "destructive"
    })
  }
}

// Separate function for the actual credit conversion
async function convertRevenueToCredits() {
  try {
    // Check if user is authenticated
    if (!uid) {
      toast({
        title: "Authentication Required",
        description: "Please log in to convert revenue to credits.",
        variant: "destructive"
      })
      return
    }

    // Set loading state to prevent multiple conversions
    setIsConvertingCredits(true)
    
    // Check if there's already a recent revenue conversion for this amount
    const { data: existingConversion, error: checkError } = await supabase
      .from('revenue_requests')
      .select('id, created_at')
      .eq('user_id', uid)
      .eq('amount_cents', totalRevenue)
      .eq('request_type', 'revenue_conversion')
      .eq('status', 'completed')
      .gte('created_at', new Date(Date.now() - 60000).toISOString()) // Within last minute
    
    if (checkError) {
      console.error('Error checking existing conversions:', checkError)
    }
    
    if (existingConversion && existingConversion.length > 0) {
      toast({
        title: "Conversion Already Processed",
        description: "You have already converted this revenue amount recently. Please refresh the page to see updated data.",
        variant: "destructive"
      })
      return
    }
    
    // Convert revenue to credits (1 dollar = 400 credits)
    // IMPORTANT: This function only processes sales with revenue_status = 'available'
    // It will NOT touch sales that are already 'payment_requested' or 'credited'
    const creditsToAdd = Math.floor((totalRevenue / 100) * 400)
    
    if (creditsToAdd <= 0) {
      toast({
        title: "No Credits Available",
        description: "You don't have enough revenue to convert to credits.",
        variant: "destructive"
      })
      return
    }

    // First, add credits to user account
    const { error: creditsError } = await supabase.rpc('add_credits', {
      p_user_id: uid,
      p_amount: creditsToAdd,
      p_reason: 'revenue_conversion',
      p_reference_id: `revenue_${Date.now()}`
    })

    if (creditsError) {
      throw creditsError
    }
    // Second, create a revenue request record for this conversion
    const { data: revenueRequest, error: requestError } = await supabase
      .from('revenue_requests')
      .insert({
        user_id: uid,
        amount_cents: totalRevenue,
        request_type: 'revenue_conversion',
        status: 'completed',
        metadata: { credits_added: creditsToAdd }
      })
      .select()
      .single()

    if (requestError) {
      console.error('Error creating revenue request record:', requestError)
      throw requestError
    }

    // Get the revenue request ID
    const revenueRequestId = revenueRequest.id

    // Get only available sales to mark as credited (don't touch payment_requested ones)
    // Check both asset_buyers and revenue_history tables
    const [assetBuyersResult, revenueHistoryResult] = await Promise.all([
      supabase.from('asset_buyers').select('id').eq('seller_id', uid).eq('revenue_status', 'available'),
      supabase.from('revenue_history').select('id').eq('seller_id', uid).eq('revenue_status', 'available')
    ])

    if (assetBuyersResult.error || revenueHistoryResult.error) {
      console.error('Error fetching sales to update:', assetBuyersResult.error || revenueHistoryResult.error)
      throw assetBuyersResult.error || revenueHistoryResult.error
    }

    // Process asset_buyers and revenue_history separately
    const assetBuyerIds = assetBuyersResult.data?.map(sale => sale.id) || []
    const revenueHistoryIds = revenueHistoryResult.data?.map(sale => sale.id) || []

    // Handle asset_buyers records (these can have revenue_tracking records)
    if (assetBuyerIds.length > 0) {
      
      // First, verify these IDs actually exist in asset_buyers table
      const { data: verifyAssetBuyers, error: verifyError } = await supabase
        .from('asset_buyers')
        .select('id')
        .in('id', assetBuyerIds)
        .eq('seller_id', uid)
        .eq('revenue_status', 'available')

      if (verifyError) {
        console.error('Error verifying asset_buyers records:', verifyError)
        throw verifyError
      }

      const verifiedAssetBuyerIds = verifyAssetBuyers?.map(ab => ab.id) || []

      if (verifiedAssetBuyerIds.length > 0) {
        // Check if revenue_tracking records exist for these sales
        const { data: existingTracking, error: trackingCheckError } = await supabase
          .from('revenue_tracking')
          .select('asset_buyer_id')
          .in('asset_buyer_id', verifiedAssetBuyerIds)

        if (trackingCheckError) {
          console.error('Error checking existing tracking records:', trackingCheckError)
        }

        const existingTrackingIds = existingTracking?.map(t => t.asset_buyer_id) || []
        const missingTrackingIds = verifiedAssetBuyerIds.filter((id: string) => !existingTrackingIds.includes(id))

        // Create missing revenue_tracking records
        if (missingTrackingIds.length > 0) {
          const trackingRecordsToInsert = missingTrackingIds.map((saleId: string) => ({
            asset_buyer_id: saleId,
            seller_id: uid,
            revenue_status: 'credited',
            revenue_request_id: revenueRequestId
          }))

          const { error: insertError } = await supabase
            .from('revenue_tracking')
            .insert(trackingRecordsToInsert)

          if (insertError) {
            console.error('Error creating missing tracking records:', insertError)
            throw insertError
          }
        }

        // Update existing revenue_tracking records
        if (existingTrackingIds.length > 0) {
          const { error: updateError } = await supabase
            .from('revenue_tracking')
            .update({ 
              revenue_status: 'credited',
              revenue_request_id: revenueRequestId
            })
            .in('asset_buyer_id', existingTrackingIds)

          if (updateError) {
            console.error('Error updating revenue tracking:', updateError)
            throw updateError
          }
        }
      }
    }

    // Handle revenue_history records (these should NOT have revenue_tracking records)
    if (revenueHistoryIds.length > 0) {
      console.log('Processing revenue_history records:', revenueHistoryIds)
      // Revenue history records don't need revenue_tracking records
      // They will be updated directly below
    }

    // Update asset_buyers records to 'credited' status
    if (assetBuyerIds.length > 0) {
      const { error: assetBuyersUpdateError } = await supabase
        .from('asset_buyers')
        .update({ 
          revenue_status: 'credited',
          revenue_request_id: revenueRequestId
        })
        .in('id', assetBuyerIds)
        .eq('revenue_status', 'available') // Only update available records

      if (assetBuyersUpdateError) {
        console.error('Error updating asset_buyers:', assetBuyersUpdateError)
        throw assetBuyersUpdateError
      } else {
        console.log('Successfully updated asset_buyers records')
      }
    }

    // Update revenue_history records to 'credited' status
    if (revenueHistoryIds.length > 0) {
      const { error: revenueHistoryUpdateError } = await supabase
        .from('revenue_history')
        .update({ 
          revenue_status: 'credited',
          revenue_request_id: revenueRequestId
        })
        .in('id', revenueHistoryIds)
        .eq('revenue_status', 'available') // Only update available records

      if (revenueHistoryUpdateError) {
        throw revenueHistoryUpdateError
      } else {
        console.log('Successfully updated revenue_history records')
      }
    }

    toast({
      title: "Credits Added Successfully!",
      description: `Successfully converted $${(totalRevenue / 100).toFixed(2)} revenue to ${creditsToAdd} credits ($${(creditsToAdd / 400).toFixed(2)}).`,
      variant: "default"
    })

    // Reset revenue and close modal
    setTotalRevenue(0)
    setRevenueRequestOpen(false)

    // Refresh sales data to show updated revenue
    if (uid) {
      // Small delay to ensure database updates are committed
      await new Promise(resolve => setTimeout(resolve, 500))
      await fetchTotalSales(uid)
      await fetchUserCredits(uid) // Also refresh credits
    }

  } catch (error) {
    console.error('Error converting revenue to credits:', error)
    toast({
      title: "Conversion Failed",
      description: "There was an error converting your revenue to credits. Please try again.",
      variant: "destructive"
    })
  } finally {
    // Always reset the loading state
    setIsConvertingCredits(false)
  }
}

async function handleStripePayment() {
  // Open the Stripe payment form modal
  setStripePaymentOpen(true)
  setRevenueRequestOpen(false)
}

async function handleStripeFormSubmit() {
  if (!stripeFormData.name || !stripeFormData.email) {
    toast({
      title: "Missing Information",
      description: "Please fill in all required fields.",
      variant: "destructive"
    })
    return
  }

  setSubmittingStripe(true)

  try {
    // Save the Stripe payment request to database
    const { data: revenueRequest, error } = await supabase
      .from('revenue_requests')
      .insert({
        user_id: uid,
        amount_cents: totalRevenue,
        request_type: 'stripe_payment',
        contact_info: {
          name: stripeFormData.name,
          email: stripeFormData.email,
          phone: stripeFormData.phone,
          stripe_account: stripeFormData.stripeAccount
        },
        status: 'pending'
      })
      .select()
      .single()

    if (error) {
      throw error
    }

    // Get the revenue request ID
    const revenueRequestId = revenueRequest.id

    // Calculate how many sales we need to mark as payment_requested
    const salesNeeded = Math.ceil(totalRevenue / 200)

    // Get available sales from both asset_buyers and revenue_history tables
    const [assetBuyersResult, revenueHistoryResult] = await Promise.all([
      supabase
        .from('asset_buyers')
        .select('id')
        .eq('seller_id', uid)
        .eq('revenue_status', 'available')
        .limit(salesNeeded),
      
      supabase
        .from('revenue_history')
        .select('id')
        .eq('seller_id', uid)
        .eq('revenue_status', 'available')
        .limit(salesNeeded)
    ])

    if (assetBuyersResult.error) {
      throw assetBuyersResult.error
    }

    if (revenueHistoryResult.error) {
      throw revenueHistoryResult.error
    }

    // Combine sale IDs from both tables
    const assetBuyerIds = assetBuyersResult.data?.map(sale => sale.id) || []
    const revenueHistoryIds = revenueHistoryResult.data?.map(sale => sale.id) || []
    const allSaleIds = [...assetBuyerIds, ...revenueHistoryIds]

    if (allSaleIds.length === 0) {
      throw new Error('No available sales found to update')
    }

    // Update asset_buyers records to mark them as payment_requested and link to revenue request
    if (assetBuyerIds.length > 0) {
      const { error: assetBuyersUpdateError } = await supabase
        .from('asset_buyers')
        .update({ 
          revenue_status: 'payment_requested',
          revenue_request_id: revenueRequestId
        })
        .in('id', assetBuyerIds)

      if (assetBuyersUpdateError) {
        console.error('Error updating asset_buyers:', assetBuyersUpdateError)
        throw assetBuyersUpdateError
      }
    }

    // Update revenue_history records to mark them as payment_requested and link to revenue request
    if (revenueHistoryIds.length > 0) {
      const { error: revenueHistoryUpdateError } = await supabase
        .from('revenue_history')
        .update({ 
          revenue_status: 'payment_requested',
          revenue_request_id: revenueRequestId
        })
        .in('id', revenueHistoryIds)

      if (revenueHistoryUpdateError) {
        console.error('Error updating revenue_history:', revenueHistoryUpdateError)
        throw revenueHistoryUpdateError
      }
    }

    // Create or update revenue_tracking records (only for asset_buyers, not revenue_history)
    if (assetBuyerIds.length > 0) {
      // First, check if revenue_tracking records exist for these sales
      const { data: existingTracking, error: trackingCheckError } = await supabase
        .from('revenue_tracking')
        .select('asset_buyer_id')
        .in('asset_buyer_id', assetBuyerIds)

      if (trackingCheckError) {
        console.error('Error checking existing tracking records:', trackingCheckError)
      }

      const existingTrackingIds = existingTracking?.map(t => t.asset_buyer_id) || []
      const missingTrackingIds = assetBuyerIds.filter(id => !existingTrackingIds.includes(id))

      // Create missing revenue_tracking records
      if (missingTrackingIds.length > 0) {
        const trackingRecordsToInsert = missingTrackingIds.map(saleId => ({
          asset_buyer_id: saleId,
          seller_id: uid,
          revenue_status: 'payment_requested',
          revenue_request_id: revenueRequestId
        }))

        const { error: insertError } = await supabase
          .from('revenue_tracking')
          .insert(trackingRecordsToInsert)

        if (insertError) {
          console.error('Error creating missing tracking records:', insertError)
        } else {
          console.log('✅ Successfully created tracking records')
        }
      }

      // Update existing revenue_tracking records
      if (existingTrackingIds.length > 0) {
        const { error: trackingUpdateError } = await supabase
          .from('revenue_tracking')
          .update({ 
            revenue_status: 'payment_requested',
            revenue_request_id: revenueRequestId
          })
          .in('asset_buyer_id', existingTrackingIds)

        if (trackingUpdateError) {
          console.error('Error updating existing tracking records:', trackingUpdateError)
        }
      }
    }

    toast({
      title: "Request Submitted!",
      description: "Your Stripe payment request has been submitted. Processing takes 2-3 weeks.",
      variant: "default"
    })

    // Reset form and close modals
    setStripeFormData({ name: '', email: '', phone: '', stripeAccount: '' })
    setStripePaymentOpen(false)
    setTotalRevenue(0)

    // Refresh sales data to show updated revenue
    if (uid) {
      await fetchTotalSales(uid)
      await fetchUserCredits(uid) // Also refresh credits
    }

  } catch (error) {
    toast({
      title: "Submission Failed",
      description: "There was an error submitting your request. Please try again.",
      variant: "destructive"
    })
  } finally {
    setSubmittingStripe(false)
  }
}

async function fetchPurchases(userId: string) {
  setLoadingPurchases(true)

  try {
    // First, get the transactions
    const { data: transactions, error: transactionError } = await supabase
      .from('marketplace_transactions')
      .select('id, listing_id, amount_cents, currency, status, created_at, buyer_id, seller_id')
      .or(`buyer_id.eq.${userId},seller_id.eq.${userId}`)
      .order('created_at', { ascending: false })

    if (transactionError) {
      throw transactionError
    }

    if (!transactions || transactions.length === 0) {
      setPurchases([])
      setLoadingPurchases(false)
      return
    }

    // Get the listing IDs
    const listingIds = transactions.map(t => t.listing_id)

    // Fetch the listings with their assets
    const { data: listings, error: listingError } = await supabase
      .from('marketplace_listings')
      .select(`
        id,
        asset_id,
        title,
        description,
        user_assets!inner(
          image_url,
          title,
          asset_type
        )
      `)
      .in('id', listingIds)

    if (listingError) {
      throw listingError
    }

    // Create a map of listing_id to listing data
    const listingMap = new Map()
    listings?.forEach(listing => {
      listingMap.set(listing.id, listing)
    })

    // Transform the data
    const transformedPurchases = transactions.map((transaction: any) => {
      const listing = listingMap.get(transaction.listing_id)
      return {
        id: transaction.id,
        listingId: transaction.listing_id,
        amountCents: transaction.amount_cents,
        currency: transaction.currency,
        status: transaction.status,
        purchasedAt: transaction.created_at,
        asset: {
          id: listing?.asset_id,
          title: listing?.title,
          description: listing?.description,
          imageUrl: listing?.user_assets?.image_url,
          assetTitle: listing?.user_assets?.title,
          assetType: listing?.user_assets?.asset_type
        }
      }
    })

    setPurchases(transformedPurchases)

  } catch (error) {
    console.error('Error fetching purchases:', error)
    setPurchases([])
  }
  
  setLoadingPurchases(false)
}

// Helper function to clean up card titles for transaction descriptions
function getCleanCardDescription(title: string | null | undefined): string {
  if (!title) return 'Unknown Card'
  
  // If it's a very long title (likely an AI generation prompt), show "AI Generation"
  if (title.length > 100) {
    return 'AI Generation'
  }
  
  // If it contains common AI generation keywords, show "AI Generation"
  const aiKeywords = ['Create a fully designed', 'Generate', 'AI', 'prompt', 'aspect ratio', 'trading card image']
  if (aiKeywords.some(keyword => title.toLowerCase().includes(keyword.toLowerCase()))) {
    return 'AI Generation'
  }
  
  // For regular titles, truncate if too long
  if (title.length > 50) {
    return title.substring(0, 50) + '...'
  }
  
  return title
}

// Helper function to clean up generation titles
// Now that titles are saved in the database, we just need to handle display formatting
function getCleanGenerationTitle(title: string | null | undefined): string {
  if (!title) return 'AI Generated'
  
  // For regular titles, truncate if too long
  if (title.length > 50) {
    return title.substring(0, 50) + '...'
  }
  
  return title
}

// Helper function to clean up card titles for purchases display
// Shows "AI Generated" for AI-generated cards, or the seller's custom name for uploaded cards
function getCleanPurchaseTitle(title: string | null | undefined, assetType: string | null | undefined): string {
  if (!title) return 'Unknown Card'
  
  // If it's an AI-generated card, show "AI Generated"
  if (assetType === 'generated') {
    return 'AI Generated'
  }
  
  // If it's a very long title (likely an AI generation prompt), show "AI Generated"
  if (title.length > 100) {
    return 'AI Generated'
  }
  
  // If it contains common AI generation keywords, show "AI Generated"
  const aiKeywords = ['Create a fully designed', 'Generate', 'AI', 'prompt', 'aspect ratio', 'trading card image']
  if (aiKeywords.some(keyword => title.toLowerCase().includes(keyword.toLowerCase()))) {
    return 'AI Generated'
  }
  
  // For user-uploaded cards, use the title as-is (it should be the seller's custom name)
  // Truncate if too long for display
  if (title.length > 30) {
    return title.substring(0, 30) + '...'
  }
  
  return title
}

async function fetchTransactionHistory(userId: string) {
  setLoadingTransactionHistory(true)
  
  try {
    const allTransactions: TransactionHistory[] = []
    
    // 1. Fetch purchases (as buyer)
    const { data: purchases, error: purchasesError } = await supabase
      .from('marketplace_transactions')
      .select(`
        id, amount_cents, currency, status, created_at,
        marketplace_listings!inner(title, user_assets!inner(image_url))
      `)
      .eq('buyer_id', userId)
      .order('created_at', { ascending: false })
    
    if (purchasesError) {
      console.error('Error fetching purchases:', purchasesError)
    } else if (purchases) {
      purchases.forEach((purchase: any) => {
        allTransactions.push({
          id: `purchase-${purchase.id}`,
          type: 'purchase',
          amount_cents: purchase.amount_cents,
          description: `Purchased: ${getCleanCardDescription(purchase.marketplace_listings?.title)}`,
          status: purchase.status,
          created_at: purchase.created_at,
          metadata: {
            currency: purchase.currency,
            listing_id: purchase.id
          }
        })
      })
    }
    
    // 2. Fetch sales (as seller)
    const { data: sales, error: salesError } = await supabase
      .from('marketplace_transactions')
      .select(`
        id, amount_cents, currency, status, created_at,
        marketplace_listings!inner(title, user_assets!inner(image_url))
      `)
      .eq('seller_id', userId)
      .order('created_at', { ascending: false })
    
    if (salesError) {
      console.error('Error fetching sales:', salesError)
    } else if (sales) {
      sales.forEach((sale: any) => {
        allTransactions.push({
          id: `sale-${sale.id}`,
          type: 'sale',
          amount_cents: sale.amount_cents,
          description: `Sold: ${getCleanCardDescription(sale.marketplace_listings?.title)}`,
          status: sale.status,
          created_at: sale.created_at,
          metadata: {
            currency: sale.currency,
            listing_id: sale.id
          }
        })
      })
    }
    
    // 3. Fetch revenue requests
    const { data: revenueRequests, error: revenueError } = await supabase
      .from('revenue_requests')
      .select('id, amount_cents, request_type, status, created_at, metadata')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
    
    if (revenueError) {
      console.error('Error fetching revenue requests:', revenueError)
    } else if (revenueRequests) {
      revenueRequests.forEach(request => {
        if (request.request_type === 'revenue_conversion') {
          const creditsAdded = request.metadata?.credits_added || 0
          allTransactions.push({
            id: `conversion-${request.id}`,
            type: 'revenue_conversion',
            amount_cents: request.amount_cents,
            credits: creditsAdded,
            description: `Converted $${(request.amount_cents / 100).toFixed(2)} revenue to ${creditsAdded} credits`,
            status: request.status,
            created_at: request.created_at,
            metadata: request.metadata
          })
        } else if (request.request_type === 'stripe_payment') {
          allTransactions.push({
            id: `revenue-${request.id}`,
            type: 'revenue_request',
            amount_cents: request.amount_cents,
            description: `Revenue payout request: $${(request.amount_cents / 100).toFixed(2)}`,
            status: request.status,
            created_at: request.created_at,
            metadata: request.metadata
          })
        }
      })
    }
    
    // 4. Fetch credits ledger transactions
    const { data: creditsLedger, error: creditsError } = await supabase
      .from('credits_ledger')
      .select('id, amount, reason, reference_id, created_at, metadata')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
    
    if (creditsError) {
      console.error('Error fetching credits ledger:', creditsError)
    } else if (creditsLedger) {
      creditsLedger.forEach(credit => {
        // Only show significant credit transactions (not small deductions)
        if (Math.abs(credit.amount) >= 100 || credit.reason === 'revenue_conversion') {
          let description = ''
          let type: TransactionHistory['type'] = 'credit_transaction'
          
          if (credit.amount > 0) {
            if (credit.reason === 'revenue_conversion') {
              description = `Credit Purchase: +${credit.amount} credits`
              type = 'credit_purchase' as const
            } else {
              description = `Credits Added: +${credit.amount} credits (${credit.reason})`
              type = 'credit_added' as const
            }
          } else if (credit.amount < 0) {
            if (credit.reason === 'generation') {
              description = `AI Generation: ${Math.abs(credit.amount)} credits`
              type = 'generation' as const
            } else if (credit.reason === 'first_upload') {
              description = `First Upload: ${Math.abs(credit.amount)} credit`
              type = 'upload' as const
            } else {
              description = `Credits Used: ${Math.abs(credit.amount)} credits (${credit.reason})`
              type = 'credit_used' as const
            }
          }
          
          allTransactions.push({
            id: `credit-${credit.id}`,
            type: type,
            amount_cents: 0, // Credits don't have dollar amounts
            credits: credit.amount,
            description: description,
            status: 'completed',
            created_at: credit.created_at,
            metadata: {
              reason: credit.reason,
              reference_id: credit.reference_id,
              ...credit.metadata
            }
          })
        }
      })
    }
    
    // 5. Fetch credit usage (from user_assets where credits were used)
    const { data: creditUsage, error: creditError } = await supabase
      .from('user_assets')
      .select('id, title, asset_type, created_at, metadata')
      .eq('user_id', userId)
      .in('asset_type', ['generated', 'uploaded'])
      .not('metadata', 'is', null)
      .order('created_at', { ascending: false })
    
    if (creditError) {
      console.error('Error fetching credit usage:', creditError)
    } else if (creditUsage) {
      creditUsage.forEach(asset => {
        const creditsUsed = asset.metadata?.credits_used || 0
        if (creditsUsed > 0) {
          allTransactions.push({
            id: `usage-${asset.id}`,
            type: 'credit_usage',
            credits: creditsUsed,
            description: `Used ${creditsUsed} credits for ${asset.asset_type}: ${asset.title || 'Untitled'}`,
            status: 'completed',
            created_at: asset.created_at,
            metadata: asset.metadata
          })
        }
      })
    }
    
    // Sort all transactions by date (newest first)
    allTransactions.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    
    setTransactionHistory(allTransactions)
    
  } catch (error) {
    console.error('Error fetching transaction history:', error)
    setTransactionHistory([])
  }
  
  setLoadingTransactionHistory(false)
}

useEffect(() => {
  let mounted = true
  setLoadingAuth(true)

  supabase.auth.getSession().then(({ data: { session } }) => {
    const id = session?.user?.id ?? null
    if (!mounted) return

    if (!id) {
      setUid(null)
      setAvatarUrl(null)
      setAssets([])
      setHasMoreGenerations(false)
      setHasMoreUploads(false)
      setLoadingAssets(false)
      setLoadingAuth(false)
      setDisplayName("")
      setNameLoading(false)
    } else {
      setUid(id)

      // Load avatar + name in one go — use maybeSingle() to avoid 406
      supabase
        .from("profiles") // Updated table name
        .select("avatar_url, display_name")
        .eq("id", id)
        .maybeSingle()
        .then(({ data: prof }) => {
          setAvatarUrl(prof?.avatar_url ?? session?.user?.user_metadata?.avatar_url ?? null)
          setDisplayName(prof?.display_name ?? "")
          setNameLoading(false)
          setLoadingAuth(false)
        })

             // ✅ use id here (newId is not in scope in this branch)
       fetchFirstPage(id)
       fetchPurchases(id)
       fetchTotalSales(id)
       fetchDuplicateDetections(id)
       fetchUserCredits(id)
       fetchTransactionHistory(id)
    }
  })

  const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
    const newId = s?.user?.id ?? null
    if (!newId) return

    setUid(newId)

    // Use maybeSingle() here as well
    supabase
      .from("profiles") // Updated table name
      .select("avatar_url, display_name")
      .eq("id", newId)
      .maybeSingle()
      .then(({ data: prof }) => {
        setAvatarUrl(prof?.avatar_url ?? null)
        setDisplayName(prof?.display_name ?? "")
        setNameLoading(false)
      })

    fetchFirstPage(newId)
    fetchPurchases(newId)
    fetchTotalSales(newId)
    fetchDuplicateDetections(newId)
    fetchUserCredits(newId)
    fetchTransactionHistory(newId)
  })

  return () => {
    sub?.subscription?.unsubscribe?.()
    if (greetTimeoutRef.current) clearTimeout(greetTimeoutRef.current)
  }
}, [])

// Handle success parameter from Stripe payment redirect
useEffect(() => {
  const credits = searchParams.get('credits')
  
  if (credits === 'success') {
    toast({
      title: "🎉 Credits Added Successfully!",
      description: "Your credits have been added to your account.",
      variant: "default"
    })
    
    // Clean up the URL by removing the success parameter
    const url = new URL(window.location.href)
    url.searchParams.delete('credits')
    window.history.replaceState({}, '', url.toString())
  }
}, [searchParams, toast])

const deduped = useMemo(() => {
 const map = new Map<string, UIAsset>(); // key = storage_path
  for (const a of assets) {
    const key = a.file_path;              // storage_path is unique per file
    const prev = map.get(key);
    if (!prev) map.set(key, a);
    else if (a.isGenerated && !prev.isGenerated) map.set(key, a); 
  }
  return Array.from(map.values());
}, [assets]);

const uploads = useMemo(
  () => deduped.filter((a) => !a.isGenerated && a.asset_type === "uploaded" && !a.featured),
  [deduped],
);

const generations = useMemo(
  () => deduped.filter((a) => (a.isGenerated || a.asset_type === "generated") && !a.featured),
  [deduped],
);

const featuredCards = useMemo(
  () => deduped.filter((a) => a.featured),
  [deduped],
);

  const uploadsMb = useMemo(
    () =>
      uploads.reduce(
        (s, u) => s + (u.file_size ?? 0) / 1_048_576,
        0,
      ),
    [uploads],
  )
  const generationsMb = useMemo(
    () =>
      generations.reduce(
        (s, g) => s + (g.file_size ?? 0) / 1_048_576,
        0,
      ),
    [generations],
  )

  /* no separate loading flag for uploads any more */
  const loadingUploads = loadingAssets // ← changed

  /* ───── fetchFirstPage - now loads both generations and uploads separately ───── */
  async function fetchFirstPage(userId: string) {
    setLoadingAssets(true)

    // Reset pagination state for both sections
    setGenerationsOffset(PAGE_SIZE)
    setUploadsOffset(PAGE_SIZE)
    setHasMoreGenerations(true)
    setHasMoreUploads(true)

    // Fetch first page of generated assets
    const { data: generatedData } = await supabase
      .from("user_assets")
      .select(
        "id, user_id, asset_type, title, image_url, storage_path, mime_type, file_size_bytes, created_at, featured",
      )
      .eq("user_id", userId)
      .eq("asset_type", "generated")
      .order("created_at", { ascending: false })
      .range(0, PAGE_SIZE - 1)
      .returns<AssetRow[]>()

    // Fetch first page of uploaded assets
    const { data: uploadedData } = await supabase
      .from("user_assets")
      .select(
        "id, user_id, asset_type, title, image_url, storage_path, mime_type, file_size_bytes, created_at, featured",
      )
      .eq("user_id", userId)
      .eq("asset_type", "uploaded")
      .order("created_at", { ascending: false })
      .range(0, PAGE_SIZE - 1)
      .returns<AssetRow[]>()

    // Combine and convert to UI format
    const generatedAssets = (generatedData ?? []).map(toUI)
    const uploadedAssets = (uploadedData ?? []).map(toUI)
    const allAssets = [...generatedAssets, ...uploadedAssets]

    setAssets(allAssets)

    // Set hasMore flags for each section
    if (!generatedData || generatedData.length < PAGE_SIZE) {
      setHasMoreGenerations(false)
    }
    if (!uploadedData || uploadedData.length < PAGE_SIZE) {
      setHasMoreUploads(false)
    }

    // Fetch listing information for these assets
    fetchSellerListings(userId, allAssets.map(a => a.id))

    setLoadingAssets(false)
  }

  const loadMoreGenerations = useCallback(async () => {
    if (!uid || loadingMoreGenerations) return
    setLoadingMoreGenerations(true)

    const { data } = await supabase
      .from("user_assets")
      .select(
        "id, user_id, asset_type, title, image_url, storage_path, mime_type, file_size_bytes, created_at",
      )
      .eq("user_id", uid)
      .eq("asset_type", "generated")
      .order("created_at", { ascending: false })
      .range(generationsOffset, generationsOffset + PAGE_SIZE - 1)
      .returns<AssetRow[]>()

    if (data) {
      const newAssets = data.map(toUI)
      setAssets((prev) => [...prev, ...newAssets])
      setGenerationsOffset(prev => prev + PAGE_SIZE)

      if (data.length < PAGE_SIZE) {
        setHasMoreGenerations(false)
      }

      if (newAssets.length > 0) {
        fetchSellerListings(uid, newAssets.map(a => a.id))
      }
    } else {
      setHasMoreGenerations(false)
    }
    setLoadingMoreGenerations(false)
  }, [uid, generationsOffset, loadingMoreGenerations, supabase])

  const loadMoreUploads = useCallback(async () => {
    if (!uid || loadingMoreUploads) return
    setLoadingMoreUploads(true)

    const { data } = await supabase
      .from("user_assets")
      .select(
        "id, user_id, asset_type, title, image_url, storage_path, mime_type, file_size_bytes, created_at",
      )
      .eq("user_id", uid)
      .eq("asset_type", "uploaded")
      .order("created_at", { ascending: false })
      .range(uploadsOffset, uploadsOffset + PAGE_SIZE - 1)
      .returns<AssetRow[]>()

    if (data) {
      const newAssets = data.map(toUI)
      setAssets((prev) => [...prev, ...newAssets])
      setUploadsOffset(prev => prev + PAGE_SIZE)

      if (data.length < PAGE_SIZE) {
        setHasMoreUploads(false)
      }

      if (newAssets.length > 0) {
        fetchSellerListings(uid, newAssets.map(a => a.id))
      }
    } else {
      setHasMoreUploads(false)
    }
    setLoadingMoreUploads(false)
  }, [uid, uploadsOffset, loadingMoreUploads, supabase])


  const signInWithGoogle = async () => {
    const origin = window.location.origin
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${origin}/auth/callback?next=${encodeURIComponent("/profile")}` },
    })
  }

  useEffect(() => {
    if (!uid) return
    const ch = supabase
      .channel("user-assets-feed")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "user_assets", filter: `user_id=eq.${uid}` }, // Updated column name
        (payload) => {
          const ui = toUI(payload.new as AssetRow)
          setAssets((prev) => {
            const next = [ui, ...prev]
            fetchSellerListings(uid, next.map((a) => a.id))
            return next
          })
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "user_assets", filter: `user_id=eq.${uid}` }, // Updated column name
        (payload) => {
          const ui = toUI(payload.new as AssetRow)
          setAssets((prev) => {
            const idx = prev.findIndex((a) => a.id === ui.id)
            const next = idx >= 0 ? [...prev.slice(0, idx), ui, ...prev.slice(idx + 1)] : [ui, ...prev]
            fetchSellerListings(uid, next.map((a) => a.id))
            return next
          })
        }
      )
      .subscribe()
    return () => {
      supabase.removeChannel(ch)
    }
  }, [supabase, uid])

  const owned = useOwnedCardify(FACTORY)
  const nftLoading = owned.loading
  const tokens = owned.tokens ?? []

// ─── openSell (replace the whole function) ─────────────────────────────
const openSell = (a: UIAsset) => {
  setSelectedAsset(a)
  // REQUIRE the user to type a name – start with an empty field
  setListingName("")                //  ⇦  was getCleanGenerationTitle(...)
  setSellOpen(true)
}


function isDefaultListingName(
  candidate: string,
  asset?: { file_name?: string; title?: string },
  bannedNames: string[] = [],
): boolean {
  const trimmed = candidate.trim();

  /* 1  Too short / empty */
  if (trimmed.length < 3) return true;

  /* 2  All digits (“12345”) */
  if (/^\d+$/.test(trimmed)) return true;

  /* 3  Only special chars (“!!!”) */
  if (/^[^a-zA-Z0-9\s]+$/.test(trimmed)) return true;

  const lower = trimmed.toLowerCase();

  /* 4  Generic disallowed names (“image”, “untitled” …) */
  if (bannedNames.map((s) => s.toLowerCase()).includes(lower)) return true;

  if (asset) {
    /* filename without extension, e.g. “img_1234” */
    const fileStem = asset.file_name?.split(".")[0].toLowerCase() ?? "";
    const dbTitle  = asset.title?.trim().toLowerCase() ?? "";

    /* 5  Exactly matches filename or DB title */
    if (lower === fileStem || lower === dbTitle) return true;

    /* 6  Very similar to the filename (simple containment test) */
    if (fileStem && (lower.includes(fileStem) || fileStem.includes(lower))) {
      return true;
    }
  }

  return false;            // 🎉 customised enough
}



// ─── createListing (replace the whole function) ───────────────────────
const createListing = async () => {
  if (!uid || !selectedAsset) return

  const cleanName = listingName.trim()

  // 1️⃣  basic validation
  if (cleanName.length < 3) {
    toast({
      title: "Name too short",
      description: "Use at least 3 characters.",
      variant: "destructive",
    })
    return
  }

  // 2️⃣  reject default / unchanged names
  if (isDefaultListingName(cleanName)) {
    toast({
      title: "Please rename your card",
      description: "Give every card a unique, descriptive name before listing.",
      variant: "destructive",
    })
    return
  }

  // 3️⃣  already listed?
  const { data: existing, error: checkErr } = await supabase
    .from("marketplace_listings")
    .select("id")
    .eq("asset_id", selectedAsset.id)
    .eq("status", "active")
    .single()

  if (!checkErr && existing) {
    toast({
      title: "Already listed",
      description: "This card is already for sale.",
      variant: "destructive",
    })
    return
  }

  // 3.5️⃣  For featured cards, check if series is sold out
  if (selectedAsset.featured) {
    const { data: seriesData } = await supabase
      .from("generated_images")
      .select("series_id")
      .eq("id", selectedAsset.id)
      .single()

    const { data: uploadedSeriesData } = await supabase
      .from("uploaded_images")
      .select("series_id")
      .eq("id", selectedAsset.id)
      .single()

    const seriesId = seriesData?.series_id || uploadedSeriesData?.series_id

    if (seriesId) {
      const { data: series } = await supabase
        .from("series")
        .select("remaining_supply, status, title")
        .eq("id", seriesId)
        .single()

      if (series && (series.remaining_supply <= 0 || series.status === 'sold_out')) {
        toast({
          title: "Series Sold Out",
          description: `The "${series.title}" series is sold out and cannot accept new listings.`,
          variant: "destructive",
        })
        return
      }
    }
  }

  // 4️⃣  create listing
  setCreating(true)
  const { data, error } = await supabase
    .from("marketplace_listings")
    .insert({
      title: cleanName,
      description: cleanName,
      price_cents: FIXED_PRICE_USD * 100,
      seller_id: uid,
      status: "active",
      asset_id: selectedAsset.id,
      categories: selectedCategories,
      featured: selectedAsset.featured || false, // Include featured flag from asset
    })
    .select()
    .single()
  setCreating(false)

  if (error) {
    toast({ title: "Listing failed", description: error.message, variant: "destructive" })
    return
  }

  // 5️⃣  keep local state in-sync
  setListingBySource(prev => ({ ...prev, [selectedAsset.id]: data }))
  setAssets(prev => prev.map(a => a.id === selectedAsset.id ? { ...a, file_name: cleanName } : a))
  await supabase.from("user_assets").update({ title: cleanName }).eq("id", selectedAsset.id)

  toast({
    title: "Listed for sale",
    description: `${cleanName} • $${FIXED_PRICE_USD}.00`,
    action: (
      <Button
        variant="ghost"
        size="sm"
        onClick={() => window.location.href = '/marketplace'}
        className="bg-transparent border border-cyber-cyan text-cyber-cyan hover:bg-cyber-cyan/10 hover:text-cyber-cyan hover:border-cyber-cyan"
      >
        View Marketplace
      </Button>
    ),
  })

  setSellOpen(false)
  setSelectedAsset(null)
  setListingName("")
}


  const cancelListing = async (listing: ListingRow) => {
    if (!uid) return
    setCanceling(listing.id)
    const { error } = await supabase.from("marketplace_listings").update({ status: "inactive" }).eq("id", listing.id) // Updated table name and status
    setCanceling(null)
    if (error) {
      toast({ title: "Cancel failed", description: error.message, variant: "destructive" })
      return
    }
    setListingBySource((prev) => {
      const next = { ...prev }
      delete next[listing.asset_id] // Updated column name
      return next
    })
    toast({ title: "Listing canceled" })
  }

  // Check if username is taken
  const checkUsernameTaken = useCallback(
    async (name: string) => {
      if (!uid || !name.trim()) return false
      
      setCheckingName(true)
      setNameError(null)
      
      try {
        const { data, error } = await supabase
          .from("profiles")
          .select("id, display_name")
          .eq("display_name", name.trim())
          .neq("id", uid) // Exclude current user
        
        if (error) {
          console.error("Error checking username:", error)
          return false
        }
        
        const isTaken = data && data.length > 0
        if (isTaken) {
          setNameError("Username is already taken")
        } else {
          setNameError(null)
        }
        
        return isTaken
      } finally {
        setCheckingName(false)
      }
    },
    [uid, supabase]
  )

  // Save Name (no autosave)
  const saveName = useCallback(
    async () => {
      if (!uid) return
      const name = (draftName || "").trim()
      if (!name) {
        toast({ title: "Invalid name", description: "Name cannot be empty.", variant: "destructive" })
        return
      }
      if (name.length > 60) {
        toast({ title: "Too long", description: "Max 60 characters.", variant: "destructive" })
        return
      }
      
      // Check if username is taken
      const isTaken = await checkUsernameTaken(name)
      if (isTaken) {
        toast({ title: "Username taken", description: "This username is already taken. Please choose a different one.", variant: "destructive" })
        return
      }
      
      setNameSaving(true)
      const { error } = await supabase
        .from("profiles") // Updated table name
        .upsert({ id: uid, display_name: name }, { onConflict: "id" })
      setNameSaving(false)
      if (error) {
        toast({ title: "Name not saved", description: error.message, variant: "destructive" })
        return
      }
      setDisplayName(name)
      setIsEditingName(false)
      setNameError(null) // Clear any previous errors
      showGreeting(name)
    },
    [uid, draftName, supabase, toast, checkUsernameTaken]
  )

const deleteAsset = async (a: UIAsset) => {
  if (!uid) return
  
  // Show confirmation dialog
  const confirmed = await showConfirmation({
    ...notificationHelpers.deleteAsset(getCleanGenerationTitle(a.file_name)),
    onConfirm: () => {}, // This will be replaced by the confirmation system
    onCancel: () => {}
  })
  if (!confirmed) return
  
  setDeletingId(a.id)
  try {
    const res = await fetch("/api/assets/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: a.id, table: "user_assets" }),
    })
    const json = await res.json()
    if (!res.ok || !json?.ok) {
      showNotification({
        type: 'error',
        title: 'Delete Failed',
        description: json?.detail || json?.error || "Try again.",
        action: {
          label: 'Retry',
          onClick: () => deleteAsset(a)
        }
      })
      return
    }
    setAssets(prev => prev.filter(x => x.id !== a.id))
    setListingBySource(prev => {
      const next = { ...prev }
      delete next[a.id]
      return next
    })
    showNotification({
      type: 'success',
      title: 'Asset Deleted',
      description: `${getCleanGenerationTitle(a.file_name)} has been removed from your profile.`,
    })
  } finally {
    setDeletingId(null)
  }
}


// UI
return (
  <div className="min-h-screen bg-cyber-black relative overflow-hidden font-mono">
    <div className="fixed inset-0 cyber-grid opacity-10 pointer-events-none" />
    <div className="fixed inset-0 scanlines opacity-20 pointer-events-none" />

    <div className="px-6 py-8 pt-24 relative max-w-7xl mx-auto">
      {/* Inline greeting banner */}
      {greeting && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-cyber-cyan/40 bg-cyber-dark/60 px-4 py-3 text-cyber-cyan">
          <Sparkles className="h-4 w-4" />
          <span className="font-semibold">{greeting}</span>
        </div>
      )}

      {/* Avatar + Name + Create Button */}
      <div className="mb-8 flex flex-col md:flex-row md:items-end md:justify-between gap-6">
        <div className="flex flex-col sm:flex-row sm:items-center gap-5">
          {uid && (
            <AvatarUploader
              key={uid}
              uid={uid}
              initialUrl={avatarUrl}
              onUpdated={(url) => setAvatarUrl(url)}
              size={96}
            />
          )}

          <div className="space-y-2">
            <label className="block text-sm text-gray-400">Name</label>

            {!isEditingName ? (
              <div className="flex items-center gap-2">
                <button
                  className={`min-h-[40px] w-72 py-2 rounded border border-cyber-cyan/30 bg-cyber-dark/60 text-white text-sm flex items-center transition-colors ${
                    !displayName && !nameLoading
                      ? "px-4 gap-2 justify-center hover:border-cyber-cyan/50 hover:bg-cyber-dark/80 cursor-pointer"
                      : "px-3 cursor-default"
                  }`}
                  onClick={() => {
                    if (!displayName && !nameLoading && uid) {
                      setDraftName("")
                      setIsEditingName(true)
                    }
                  }}
                  disabled={!uid || nameLoading || !!displayName}
                  title={displayName || "Click to add your name"}
                >
                  {nameLoading ? (
                    "Loading…"
                  ) : displayName ? (
                    displayName
                  ) : (
                    <>
                      <Plus className="h-4 w-4 text-gray-400" />
                      <span className="text-gray-400">Add your name</span>
                    </>
                  )}
                </button>
                {displayName && !nameLoading && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="border border-cyber-cyan/30 hover:bg-white/5"
                    onClick={() => {
                      setDraftName(displayName)
                      setIsEditingName(true)
                    }}
                    disabled={!uid}
                    aria-label="Edit name"
                    title="Edit name"
                  >
                    <Pencil className="h-4 w-4 text-white" />
                  </Button>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center">
                  <Input
                    value={draftName}
                    onChange={async (e) => {
                      const newName = e.target.value
                      setDraftName(newName)
                      
                      // Clear error when user starts typing
                      if (nameError) {
                        setNameError(null)
                      }
                      
                      // Check username if it's long enough and different from current
                      if (newName.trim().length >= 2 && newName.trim() !== displayName) {
                        // Debounce the check
                        setTimeout(() => {
                          if (newName === draftName) { // Only check if this is still the current value
                            checkUsernameTaken(newName)
                          }
                        }, 500)
                      }
                    }}
                    placeholder="Enter your name"
                    className={`w-72 bg-cyber-dark/60 border rounded font-mono text-sm ${
                      nameError 
                        ? 'border-red-500/50 text-red-400' 
                        : 'border-cyber-cyan/30 text-white'
                    }`}
                    disabled={!uid}
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        saveName()
                      } else if (e.key === "Escape") {
                        setIsEditingName(false)
                        setDraftName("")
                        setNameError(null)
                      }
                    }}
                  />
                  <Button
                    onClick={saveName}
                    disabled={!uid || nameSaving || !!nameError}
                    size="icon"
                    className="border-2 border-cyber-cyan bg-cyber-dark/60 text-cyber-cyan hover:bg-cyber-cyan/10 ml-3"
                    title="Save name"
                  >
                    {nameSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="border-2 border-red-500/30 text-red-400 hover:bg-red-500/10 hover:text-red-400 ml-2"
                    onClick={() => {
                      setIsEditingName(false)
                      setDraftName("")
                      setNameError(null)
                    }}
                    title="Cancel"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                
                {/* Username error message */}
                {nameError && (
                  <div className="flex items-center gap-2 text-red-400 text-sm mt-2">
                    <XCircle className="h-4 w-4" />
                    <span>{nameError}</span>
                    {checkingName && <Loader2 className="h-4 w-4 animate-spin" />}
                  </div>
                )}
              </div>
            )}

            {!isEditingName && !displayName && (
              <div className="text-xs text-gray-500">
                Click to add your name
              </div>
            )}
          </div>
        </div>

        {/* Right side: Sign in button OR Create Card button */}
        {!uid && !loadingAuth ? (
          <div className="flex items-center gap-3">
            <Button className="cyber-button" onClick={signInWithGoogle}>
              Sign in with Google
            </Button>
          </div>
        ) : (
          uid && !loadingAuth && (
            <div className="flex items-center gap-3">
              <DropdownMenu onOpenChange={setIsCreateDropdownOpen} modal={false}>
                <DropdownMenuTrigger asChild>
                  <Button className="relative bg-cyber-black/60 border-2 text-cyber-green tracking-wider px-4 py-2 font-mono text-sm group animate-subtle-glow overflow-hidden">
                    <span className="relative z-10 pointer-events-none">CREATE NEW CARD</span>
                    <ChevronDown
                      className={`w-4 h-4 ml-2 transition-transform duration-200 pointer-events-none relative z-10 ${
                        isCreateDropdownOpen ? "rotate-180" : ""
                      }`}
                    />
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-cyber-cyan/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700 pointer-events-none" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="end"
                  className="bg-cyber-black/95 backdrop-blur-md border-2 border-cyber-cyan/50 text-white min-w-[200px] mt-2 rounded-none shadow-[0_2px_8px_rgba(34,211,238,0.2)]"
                  sideOffset={5}
                >
                  <DropdownMenuItem
                    asChild
                    className="focus:bg-cyber-green/20 focus:text-cyber-green cursor-pointer transition-colors duration-200"
                  >
                    <Link
                      href="/generate"
                      className="flex items-center gap-3 px-4 py-3 text-cyber-green hover:text-cyber-green font-mono text-sm"
                    >
                      <Sparkles className="w-4 h-4" />
                      <span>AI Generate</span>
                      <span className="ml-auto text-[10px] text-cyber-green/60">NEW</span>
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    asChild
                    className="focus:bg-cyber-pink/20 focus:text-cyber-pink cursor-pointer transition-colors duration-200"
                  >
                    <Link
                      href="/upload"
                      className="flex items-center gap-3 px-4 py-3 text-cyber-pink hover:text-cyber-pink font-mono text-sm"
                    >
                      <Upload className="w-4 h-4" />
                      <span>Upload Image</span>
                    </Link>
                  </DropdownMenuItem>
                  
                  {/* Launch Series Option - Direct Link to Selection Page */}
                  <DropdownMenuItem
                    asChild
                    className="focus:bg-cyber-cyan/20 focus:text-cyber-cyan cursor-pointer transition-colors duration-200"
                  >
                    <Link
                      href="/series/launch"
                      className="flex items-center gap-3 px-4 py-3 text-cyber-cyan hover:text-cyber-cyan font-mono text-sm"
                    >
                      <Layers className="w-4 h-4" />
                      <span>Launch Series</span>
                    </Link>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )
        )}
      </div>

      {/* Sales & Revenue Overview */}
      {uid && (
        <div className="mb-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* 1) Total Sales */}
          <Card className="bg-cyber-dark/60 border border-cyber-cyan/30">
            <CardContent className="p-4">
              <div className="text-xs text-gray-400 mb-1">Total Sales</div>
              <div className="text-2xl font-bold text-white">
                {loadingSales ? "..." : totalSalesCount || totalSales}
              </div>
              <div className="text-xs text-gray-500 mt-1">
                Cards sold
              </div>
            </CardContent>
          </Card>

          {/* 2) Available Revenue */}
          <Card className="bg-cyber-dark/60 border border-cyber-cyan/30">
            <CardContent className="p-4">
              <div className="text-xs text-gray-400 mb-1">Available Revenue</div>
              <div className="text-2xl font-bold text-white">
                {loadingSales ? "..." : `$${(totalRevenue / 100).toFixed(2)}`}
              </div>
              <div className="text-xs text-gray-500 mt-1">
                Ready to claim
              </div>
            </CardContent>
          </Card>

          {/* 3) Under Request */}
          <Card className="bg-cyber-dark/60 border border-cyber-cyan/30">
            <CardContent className="p-4">
              <div className="text-xs text-gray-400 mb-1">Under Request</div>
              <div className="text-2xl font-bold text-white">
                {loadingSales ? "..." : `$${(requestedAmount / 100).toFixed(2)}`}
              </div>
              <div className="text-xs text-gray-500 mt-1">
                Stripe payment pending
              </div>
            </CardContent>
          </Card>

          {/* 4) Current Credits */}
          <Card className="bg-cyber-dark/60 border border-cyber-cyan/30">
            <CardContent className="p-4">
              <div className="text-xs text-gray-400 mb-1">Available Credits</div>
              <div className="text-2xl font-bold text-cyber-cyan">
                {loadingSales ? "..." : userCredits.toLocaleString()}
              </div>
              <div className="text-xs text-gray-500 mt-1">
                For AI generation & uploads
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Revenue Actions Button */}
      {uid && (totalRevenue > 0 || requestedAmount > 0) && (
        <div className="mb-8">
          <Card className="bg-cyber-dark/60 border border-cyber-cyan/30">
            <CardContent className="p-4">
              <div className="text-center">
                <Button 
                  className="w-full bg-cyber-green hover:bg-cyber-green/80 text-black font-semibold"
                  disabled={loadingSales || totalRevenue === 0}
                  onClick={handleRequestRevenue}
                >
                  {totalRevenue > 0 ? 'Request Revenue' : 'Revenue Under Request'}
                </Button>
                <div className="text-xs text-gray-500 mt-2">
                  {totalRevenue > 0 ? 'Click to request payout' : 'Payment request is pending'}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Tabs for different views */}
      <Tabs defaultValue="cards" value={activeTab} onValueChange={setActiveTab} className="w-full">
        <div className="relative p-1 bg-cyber-dark/60 border border-cyber-cyan/30 rounded-lg overflow-hidden mb-4 sm:mb-8">
          <div
            className="absolute top-1 left-1 h-[calc(100%-8px)] w-[calc(20%-4px)] bg-cyber-cyan rounded transition-transform duration-300 ease-in-out"
            style={{
              transform: activeTab === "cards" 
                ? "translateX(0)" 
                : activeTab === "featured"
                ? "translateX(calc(100% + 2px))"
                : activeTab === "purchases"
                ? "translateX(calc(200% + 4px))"
                : activeTab === "transactions"
                ? "translateX(calc(300% + 6px))"
                : "translateX(calc(400% + 8px))"
            }}
          />
          <TabsList className="relative grid w-full grid-cols-5 bg-transparent border-0 p-0 h-12 sm:h-auto">
            <TabsTrigger 
              value="cards" 
              className="relative z-10 data-[state=active]:bg-transparent data-[state=active]:text-cyber-black data-[state=inactive]:text-gray-400 data-[state=inactive]:hover:text-gray-300 transition-colors text-xs sm:text-sm px-2 sm:px-4 py-2 font-semibold"
            >
              <span className="hidden sm:inline">My Cards</span>
              <span className="sm:hidden">Cards</span>
            </TabsTrigger>
            <TabsTrigger 
              value="featured" 
              className="relative z-10 data-[state=active]:bg-transparent data-[state=active]:text-cyber-black data-[state=inactive]:text-gray-400 data-[state=inactive]:hover:text-gray-300 transition-colors text-xs sm:text-sm px-2 sm:px-4 py-2 font-semibold"
            >
              <Star className="w-4 h-4 sm:mr-2" />
              <span className="hidden sm:inline">Featured</span>
              <span className="sm:hidden">Featured</span>
            </TabsTrigger>
            <TabsTrigger 
              value="purchases" 
              className="relative z-10 data-[state=active]:bg-transparent data-[state=active]:text-cyber-black data-[state=inactive]:text-gray-400 data-[state=inactive]:hover:text-gray-300 transition-colors text-xs sm:text-sm px-2 sm:px-4 py-2 font-semibold"
            >
              Purchases
            </TabsTrigger>
            <TabsTrigger 
              value="transactions" 
              className="relative z-10 data-[state=active]:bg-transparent data-[state=active]:text-cyber-black data-[state=inactive]:text-gray-400 data-[state=inactive]:hover:text-gray-300 transition-colors text-xs sm:text-sm px-2 sm:px-4 py-2 font-semibold"
            >
              <span className="hidden sm:inline">Transaction History</span>
              <span className="sm:hidden">History</span>
            </TabsTrigger>
            <TabsTrigger 
              value="feedback" 
              className="relative z-10 data-[state=active]:bg-transparent data-[state=active]:text-cyber-black data-[state=inactive]:text-gray-400 data-[state=inactive]:hover:text-gray-300 transition-colors text-xs sm:text-sm px-2 sm:px-4 py-2 font-semibold"
            >
              <MessageSquare className="w-4 h-4 sm:mr-2" />
              <span className="hidden sm:inline">Feedback</span>
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="cards" className="space-y-8">
      {/* ───────────────────────── My Generations (user_assets) ───────────────────────── */}
   <section className="mb-8">
  <div className="flex items-end justify-between mb-3 sm:mb-4">
    <h2 className="text-xl sm:text-2xl font-bold text-white tracking-wider">My Generations</h2>
    <div className="text-xs text-gray-400">
      {generations.length > 0 && (
        <span className="hidden sm:inline">
          {generations.length} card{generations.length > 1 && "s"} •{" "}
          {generationsMb.toFixed(2)} MB
        </span>
      )}
    </div>
  </div>

  {/* loading placeholders */}
  {loadingAssets ? (
    <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4">
      {Array.from({ length: 10 }).map((_, i) => (
        <div
          key={i}
          className="bg-cyber-dark/60 border border-cyber-cyan/30 rounded-lg p-2 sm:p-3 animate-pulse"
        >
          <div className="relative aspect-[5/7] bg-gradient-to-br from-cyber-dark/40 to-cyber-dark/80 rounded-lg border-2 border-cyber-cyan/20" />
          <div className="mt-2 sm:mt-3 space-y-2">
            <div className="h-3 sm:h-4 bg-cyber-cyan/10 rounded" />
            <div className="flex justify-between items-center">
              <div className="h-3 sm:h-4 w-12 sm:w-16 bg-cyber-green/10 rounded" />
              <div className="w-6 h-6 sm:w-8 sm:h-8 rounded-full bg-cyber-cyan/10" />
            </div>
          </div>
          <div className="mt-2 sm:mt-3 space-y-2">
            <div className="flex gap-2">
              <div className="flex-1 h-7 sm:h-8 bg-cyber-cyan/10 rounded" />
              <div className="w-7 h-7 sm:w-8 sm:h-8 bg-cyber-cyan/10 rounded" />
            </div>
            <div className="h-7 sm:h-8 bg-cyber-cyan/10 rounded" />
          </div>
        </div>
      ))}
    </div>
  ) : !uid ? (
    <Card className="bg-cyber-dark/60 border border-cyber-cyan/30">
      <CardContent className="p-6 text-gray-400">
        Sign in to view your generations.
      </CardContent>
    </Card>
  ) : generations.length === 0 ? (
    <Card className="bg-cyber-dark/60 border border-cyber-cyan/30">
      <CardContent className="p-6 text-center text-gray-400">
        {loadError ? (
          <div className="text-cyber-orange">
            Failed to load generations: {loadError}
          </div>
        ) : (
          <>
            No AI generations yet.
            <div className="text-xs text-gray-500 mt-2">
              Active user id: <span className="text-cyber-cyan">{uid ?? "—"}</span>
            </div>
            <Link
              href="/generate"
              className="ml-2 text-cyber-cyan hover:text-cyber-pink underline"
            >
              Create one
            </Link>
          </>
        )}
      </CardContent>
    </Card>
  ) : (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4">
        {generations.map((a, index) => {
          const existing = listingBySource[a.id]
          const listed = !!existing && existing.status === "active" // Updated status check
          return (
            <Card
              key={a.id}
              className="bg-cyber-dark/60 border border-cyber-cyan/30 hover:border-cyber-cyan/60 transition-all duration-300 overflow-hidden hover:shadow-[0_0_30px_rgba(34,211,238,0.3)]"
            >
              <CardContent className="p-2 sm:p-3">
                {/* thumbnail */}
                <div className="relative group">
                  <button
                    onClick={() => {
                      setLightboxIndex(index)
                      setLightboxOpen(true)
                    }}
                    className="block relative aspect-[5/7] bg-gradient-to-br from-cyber-dark/40 to-cyber-dark/80 rounded-lg overflow-hidden cursor-pointer w-full border-2 border-cyber-cyan/50 transition-all duration-300 hover:border-cyber-cyan touch-manipulation"
                    title={getCleanGenerationTitle(a.file_name)}
                  >
                    <Image
                      src={a.public_url || PLACEHOLDER}
                      alt={getCleanGenerationTitle(a.file_name)}
                      fill
                      sizes="(max-width: 640px) 100vw, (max-width: 768px) 50vw, (max-width: 1024px) 33vw, 20vw"
                      className="object-fill"
                      priority={index < 6}
                      onError={(e) =>
                        ((e.currentTarget as HTMLImageElement).src = PLACEHOLDER)
                      }
                    />
                    {/* Featured Badge */}
                    {a.featured && (
                      <div className="absolute top-2 left-2 z-10 pointer-events-none">
                        <Badge className="bg-yellow-500/90 text-black border-yellow-400 border-2 font-bold text-xs px-2 py-1 shadow-lg flex items-center gap-1">
                          <Star className="w-3 h-3 fill-black" />
                          FEATURED
                        </Badge>
                      </div>
                    )}
                    {/* Hover overlay with gradient and view text */}
                    <div className="absolute inset-0 pointer-events-none">
                      {/* Background gradient overlay */}
                      <div className="absolute inset-0 bg-gradient-to-t from-cyber-dark/95 via-cyber-dark/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

                      {/* VIEW text */}
                      <div className="absolute inset-0 flex items-center justify-center">
                        <span className="text-cyber-cyan text-lg font-bold tracking-wider opacity-0 group-hover:opacity-100 transition-all duration-300 transform scale-90 group-hover:scale-100">
                          VIEW
                        </span>
                      </div>
                    </div>
                  </button>

                  {/* Share button - only for listed items, styled like marketplace */}
                  {listed && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        const url = `${window.location.origin}/card/${existing!.id}`
                        navigator.clipboard.writeText(url)
                        toast({
                          title: "Link copied!",
                          description: "Share link copied to clipboard",
                          duration: 2000,
                        })
                      }}
                      className="absolute top-2 right-2 p-2 rounded-full bg-cyber-dark/90 backdrop-blur-sm border border-cyber-cyan/50 opacity-0 group-hover:opacity-100 transition-all duration-300 hover:bg-cyber-dark hover:border-cyber-cyan z-10"
                      title="Copy share link"
                    >
                      <Link2 className="w-4 h-4 text-cyber-cyan" />
                    </button>
                  )}
                </div>

                      <div className="mt-2 sm:mt-3 space-y-1">
                        {renameId === a.id ? (
                          <div className="flex items-center gap-1">
                            <Input
                              value={draftTitle}
                              onChange={(e) => setDraftTitle(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  renameAsset(a.id, draftTitle)
                                } else if (e.key === "Escape") {
                                  setRenameId(null)
                                  setDraftTitle("")
                                }
                              }}
                              className="h-8 sm:h-7 text-xs bg-cyber-dark/60 border-cyber-cyan/50 text-white px-2 flex-1"
                              autoFocus
                              placeholder="Enter name"
                            />
                            <Button
                              size="icon"
                              className="h-8 w-8 sm:h-7 sm:w-7 min-w-[2rem] sm:min-w-[1.75rem] border-2 border-cyber-cyan bg-cyber-dark/60 text-cyber-cyan hover:bg-cyber-cyan/10 flex-shrink-0 touch-manipulation"
                              onClick={() => renameAsset(a.id, draftTitle)}
                              disabled={renamingId === a.id}
                              title="Save"
                            >
                              <Check className="h-4 w-4" />
                            </Button>
                            <Button
                              size="icon"
                              className="h-8 w-8 sm:h-7 sm:w-7 min-w-[2rem] sm:min-w-[1.75rem] border-2 border-red-500/30 text-red-400 hover:bg-red-500/10 hover:text-red-400 flex-shrink-0 touch-manipulation"
                              onClick={() => {
                                setRenameId(null)
                                setDraftTitle("")
                              }}
                              disabled={renamingId === a.id}
                              title="Cancel"
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1 group/title">
                            <h3 className="text-xs sm:text-sm font-semibold text-white truncate flex-1" title={getCleanGenerationTitle(a.file_name)}>
                              {getCleanGenerationTitle(a.file_name)}
                            </h3>
                            <Button
                              size="icon"
                              className="h-8 w-8 sm:h-7 sm:w-7 min-w-[2rem] sm:min-w-[1.75rem] border border-cyber-cyan/30 bg-cyber-dark/60 hover:bg-white/5 opacity-0 group-hover/title:opacity-100 sm:opacity-0 sm:group-hover/title:opacity-100 transition-opacity flex-shrink-0 touch-manipulation"
                              onClick={() => {
                                setRenameId(a.id)
                                setDraftTitle(getCleanGenerationTitle(a.file_name))
                              }}
                              title="Rename"
                            >
                              <Pencil className="h-3 w-3 sm:h-4 sm:w-4 text-cyber-cyan/70" />
                            </Button>
                          </div>
                        )}
                        <div className="flex items-center justify-between text-xs text-gray-400">
                          <span>{(a.file_size ? a.file_size / (1024 * 1024) : 0).toFixed(1)} MB</span>
                          {listed && (
                            <Badge className="bg-green-500/15 border-0 text-green-400 text-xs px-2 py-0">
                              ${((existing!.price_cents ?? 0) / 100).toFixed(0)}
                            </Badge>
                          )}
                        </div>
                        
                      </div>

                      <div className="mt-2 sm:mt-3 space-y-2">
                        {listed ? (
                          <>
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => cancelListing(existing!)}
                              disabled={canceling === existing!.id}
                              className="w-full text-xs h-9 sm:h-8 touch-manipulation"
                            >
                              {canceling === existing!.id ? "..." : "Unlist"}
                            </Button>
                            <Button
                              className="cyber-button w-full text-xs h-9 sm:h-8 touch-manipulation"
                              size="sm"
                              onClick={() => openCheckoutModal(a)}
                            >
                              <Package className="h-3 w-3 mr-1 hidden sm:inline-block" />
                              Buy Physical
                            </Button>
                          </>
                        ) : (
                          <>
                            <div className="flex gap-2">
                              <Button
                                className="bg-cyber-dark border-2 border-cyber-green text-cyber-green hover:bg-cyber-green/10 flex-1 text-xs h-9 sm:h-8 touch-manipulation"
                                size="sm"
                                onClick={() => openSell(a)}
                              >
                                Sell
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="border border-purple-500/50 hover:bg-purple-500/10 h-9 w-9 sm:h-8 sm:w-8 touch-manipulation"
                                title="Download"
                                onClick={async () => {
                                  try {
                                    const response = await fetch(a.public_url)
                                    const blob = await response.blob()
                                    const url = window.URL.createObjectURL(blob)
                                    const link = document.createElement('a')
                                    link.href = url
                                    link.download = a.file_name
                                    document.body.appendChild(link)
                                    link.click()
                                    document.body.removeChild(link)
                                    window.URL.revokeObjectURL(url)
                                    toast({ title: "Downloaded", description: `${a.file_name} saved to downloads` })
                                  } catch (error) {
                                    toast({ title: "Download failed", description: "Please try again", variant: "destructive" })
                                  }
                                }}
                                aria-label="Download"
                              >
                                <Download className="h-3 w-3 text-purple-400" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="border border-red-500/30 hover:bg-red-500/10 h-9 w-9 sm:h-8 sm:w-8 touch-manipulation"
                                title="Delete"
                                onClick={() => openDeleteConfirm(a)}
                                disabled={deletingId === a.id}
                                aria-label="Delete"
                              >
                                {deletingId === a.id ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <Trash2 className="h-3 w-3 text-red-400" />
                                )}
                              </Button>
                            </div>
                            <Button
                              className="cyber-button w-full text-xs h-9 sm:h-8 touch-manipulation"
                              size="sm"
                              onClick={() => openCheckoutModal(a)}
                            >
                              <Package className="h-3 w-3 mr-1 hidden sm:inline-block" />
                              Buy Physical
                            </Button>
                          </>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>

            {hasMoreGenerations && (
              <div className="flex justify-center mt-6">
                <Button onClick={loadMoreGenerations} disabled={loadingMoreGenerations} className="cyber-button">
                  {loadingMoreGenerations ? "Loading…" : "Load more"}
                </Button>
              </div>
            )}
          </>
        )}
      </section>

          {/* ───────────────────────────── Uploads (uploaded_images) ───────────────────────────── */}
          <section className="mb-8">
        <div className="flex items-end justify-between mb-3 sm:mb-4">
          <h2 className="text-xl sm:text-2xl font-bold text-white tracking-wider">Uploads</h2>
          <div className="text-xs text-gray-400">
        {uploads.length > 0 && (
          <span className="hidden sm:inline">
            {uploads.length} file{uploads.length > 1 && "s"} •{" "}
            {uploadsMb.toFixed(2)} MB
          </span>
        )}
          </div>
        </div>

        {!uid ? (
          <Card className="bg-cyber-dark/60 border border-cyber-cyan/30">
            <CardContent className="p-6 text-gray-400">Sign in to view your uploads.</CardContent>
          </Card>
        ) : loadingUploads ? (
          <Card className="bg-cyber-dark/60 border border-cyber-cyan/30">
            <CardContent className="p-6 text-gray-400">Loading uploads…</CardContent>
          </Card>
        ) : uploads.length === 0 ? (
          <Card className="bg-cyber-dark/60 border border-cyber-cyan/30">
            <CardContent className="p-6 text-center text-gray-400">
              No uploads yet.
              <Link
                href="/upload"
                className="ml-2 text-cyber-cyan hover:text-cyber-pink underline"
              >
                Upload a card
              </Link>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4">
{uploads.map((u, index) => {
  const existing = listingBySource[u.id]
  const listed = !!existing && existing.status === "active" // Updated status check

  return (
    <Card
      key={`upload-${u.id}`}
      className="bg-cyber-dark/60 border border-cyber-cyan/30 hover:border-cyber-cyan/60 transition-all duration-300 overflow-hidden hover:shadow-[0_0_30px_rgba(34,211,238,0.3)]"
    >
      <CardContent className="p-2 sm:p-3">
        {/* thumbnail */}
        <button
          onClick={() => {
            setUploadsLightboxIndex(index)
            setUploadsLightboxOpen(true)
          }}
          className="block relative aspect-[5/7] bg-gradient-to-br from-cyber-dark/40 to-cyber-dark/80 rounded-lg overflow-hidden cursor-pointer group w-full border-2 border-cyber-cyan/50 transition-all duration-300 hover:border-cyber-cyan touch-manipulation"
          title={getCleanGenerationTitle(u.file_name)}
        >
          <Image
            src={u.public_url || PLACEHOLDER}
            alt={getCleanGenerationTitle(u.file_name)}
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 768px) 50vw, (max-width: 1024px) 33vw, 20vw"
            className="object-fill"
            onError={(e) => ((e.currentTarget as HTMLImageElement).src = PLACEHOLDER)}
          />
          {/* Hover overlay with gradient and view text */}
          <div className="absolute inset-0 pointer-events-none">
            {/* Background gradient overlay */}
            <div className="absolute inset-0 bg-gradient-to-t from-cyber-dark/95 via-cyber-dark/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
            
            {/* VIEW text */}
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-cyber-cyan text-sm font-bold tracking-wider opacity-0 group-hover:opacity-100 transition-all duration-300 transform scale-90 group-hover:scale-100">
                VIEW
              </span>
            </div>
          </div>
        </button>

        {/* title + rename */}
        <div className="mt-2 sm:mt-3 space-y-1">
          {renameId === u.id ? (
            <div className="flex items-center gap-1">
              <Input
                value={draftTitle}
                onChange={(e) => setDraftTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") renameAsset(u.id, draftTitle)
                  else if (e.key === "Escape") {
                    setRenameId(null)
                    setDraftTitle("")
                  }
                }}
                className="h-8 sm:h-7 text-xs bg-cyber-dark/60 border-cyber-cyan/50 text-white px-2 flex-1"
                autoFocus
                placeholder="Enter name"
              />
              <Button
                size="icon"
                className="h-8 w-8 sm:h-7 sm:w-7 min-w-[2rem] sm:min-w-[1.75rem] border-2 border-cyber-cyan bg-cyber-dark/60 text-cyber-cyan hover:bg-cyber-cyan/10 flex-shrink-0 touch-manipulation"
                onClick={() => renameAsset(u.id, draftTitle)}
                disabled={renamingId === u.id}
                title="Save"
              >
                <Check className="h-4 w-4" />
              </Button>
              <Button
                size="icon"
                className="h-8 w-8 sm:h-7 sm:w-7 min-w-[2rem] sm:min-w-[1.75rem] border-2 border-red-500/30 text-red-400 hover:bg-red-500/10 hover:text-red-400 flex-shrink-0 touch-manipulation"
                onClick={() => {
                  setRenameId(null)
                  setDraftTitle("")
                }}
                disabled={renamingId === u.id}
                title="Cancel"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-1 group/title">
              <h3 className="text-xs sm:text-sm font-semibold text-white truncate flex-1" title={getCleanGenerationTitle(u.file_name)}>
                {getCleanGenerationTitle(u.file_name)}
              </h3>
              <Button
                size="icon"
                className="h-8 w-8 sm:h-7 sm:w-7 min-w-[2rem] sm:min-w-[1.75rem] border border-cyber-cyan/30 bg-cyber-dark/60 hover:bg-white/5 opacity-0 group-hover/title:opacity-100 sm:opacity-0 sm:group-hover/title:opacity-100 transition-opacity flex-shrink-0 touch-manipulation"
                onClick={() => {
                  setRenameId(u.id)
                  setDraftTitle(getCleanGenerationTitle(u.file_name))
                }}
                title="Rename"
              >
                <Pencil className="h-3 w-3 sm:h-4 sm:w-4 text-cyber-cyan/70" />
              </Button>
            </div>
          )}

          <div className="flex items-center justify-between text-xs text-gray-400">
            <span>{((u.file_size ?? 0) / (1024 * 1024)).toFixed(1)} MB</span>
            {listed && (
              <Badge className="bg-green-500/15 border-0 text-green-400 text-xs px-2 py-0">
                ${((existing!.price_cents ?? 0) / 100).toFixed(0)}
              </Badge>
            )}
          </div>
          

          {/* Duplicate Detection Status */}
          {duplicateDetections[u.id] && (
            <div className="mt-2">
              {duplicateDetections[u.id].status === 'pending' && (
                <Badge className="bg-amber-500/15 border-0 text-amber-400 text-xs px-2 py-0 w-full justify-center">
                  <AlertTriangle className="h-3 w-3 mr-1" />
                  Under Review
                </Badge>
              )}
              {duplicateDetections[u.id].status === 'approved' && (
                <Badge className="bg-green-500/15 border-0 text-green-400 text-xs px-2 py-0 w-full justify-center">
                  <CheckCircle className="h-3 w-3 mr-1" />
                  Approved
                </Badge>
              )}
              {duplicateDetections[u.id].status === 'rejected' && (
                <Badge className="bg-red-500/15 border-0 text-red-400 text-xs px-2 py-0 w-full justify-center">
                  <XCircle className="h-3 w-3 mr-1" />
                  Rejected
                </Badge>
              )}
            </div>
          )}
        </div>

        {/* actions: sell/buy/delete */}
        <div className="mt-2 sm:mt-3 space-y-2">
          {duplicateDetections[u.id]?.status === 'pending' || duplicateDetections[u.id]?.status === 'rejected' ? (
            <div className="text-center">
              <p className="text-xs text-amber-400 mb-2">
                {duplicateDetections[u.id]?.status === 'pending' 
                  ? 'Actions disabled while under review'
                  : 'Actions disabled - duplicate detected'
                }
              </p>
              <Button
                variant="ghost"
                size="sm"
                className="w-full text-xs h-9 sm:h-8 text-gray-500 cursor-not-allowed touch-manipulation"
                disabled
              >
                {duplicateDetections[u.id]?.status === 'pending' ? (
                  <>
                    <AlertTriangle className="h-3 w-3 mr-1" />
                    Pending Review
                  </>
                ) : (
                  <>
                    <XCircle className="h-3 w-3 mr-1" />
                    Duplicate Detected
                  </>
                )}
              </Button>
            </div>
          ) : listed ? (
            <>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => cancelListing(existing!)}
                disabled={canceling === existing!.id}
                className="w-full text-xs h-9 sm:h-8 touch-manipulation"
              >
                {canceling === existing!.id ? "..." : "Unlist"}
              </Button>
              <Button
                className="cyber-button w-full text-xs h-9 sm:h-8 touch-manipulation"
                size="sm"
                onClick={() => openCheckoutModal(u)}
              >
                <Package className="h-3 w-3 mr-1 hidden sm:inline-block" />
                Buy Physical
              </Button>
            </>
          ) : (
            <>
              <div className="flex gap-2">
                <Button
                  className="bg-cyber-dark border-2 border-cyber-green text-cyber-green hover:bg-cyber-green/10 flex-1 text-xs h-9 sm:h-8 touch-manipulation"
                  size="sm"
                  onClick={() => openSell(u)}
                >
                  Sell
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="border border-purple-500/50 hover:bg-purple-500/10 h-9 w-9 sm:h-8 sm:w-8 touch-manipulation"
                  title="Download"
                  onClick={async () => {
                    try {
                      const response = await fetch(u.public_url)
                      const blob = await response.blob()
                      const url = window.URL.createObjectURL(blob)
                      const link = document.createElement('a')
                      link.href = url
                      link.download = u.file_name
                      document.body.appendChild(link)
                      link.click()
                      document.body.removeChild(link)
                      window.URL.revokeObjectURL(url)
                      toast({ title: "Downloaded", description: `${u.file_name} saved to downloads` })
                    } catch (error) {
                      toast({ title: "Download failed", description: "Please try again", variant: "destructive" })
                    }
                  }}
                  aria-label="Download"
                >
                  <Download className="h-3 w-3 text-purple-400" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="border border-red-500/30 hover:bg-red-500/10 h-9 w-9 sm:h-8 sm:w-8 touch-manipulation"
                  title="Delete"
                  onClick={() => openDeleteConfirm(u)}
                  disabled={deletingId === u.id}
                  aria-label="Delete"
                >
                  {deletingId === u.id ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Trash2 className="h-3 w-3 text-red-400" />
                  )}
                </Button>
              </div>
              <Button
                className="cyber-button w-full text-xs h-9 sm:h-8 touch-manipulation"
                size="sm"
                onClick={() => openCheckoutModal(u)}
              >
                <Package className="h-3 w-3 mr-1 hidden sm:inline-block" />
                Buy Physical
              </Button>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  )
})}
          </div>
        )}

        {/* Load More button for Uploads */}
        {uploads.length > 0 && hasMoreUploads && (
          <div className="flex justify-center mt-6">
            <Button onClick={loadMoreUploads} disabled={loadingMoreUploads} className="cyber-button">
              {loadingMoreUploads ? "Loading…" : "Load more"}
            </Button>
          </div>
        )}
      </section>

      {/* ───────────────────────── On-chain NFTs ───────────────────────── */}
      <section className="mb-8">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl sm:text-2xl font-bold text-white tracking-wider">On-Chain Cardify NFTs</h2>
          <WalletButton />
        </div>
        {nftLoading ? (
          <Card className="bg-cyber-dark/60 border border-cyber-cyan/30">
            <CardContent className="p-6 text-gray-400">Scanning wallet…</CardContent>
          </Card>
        ) : tokens.length === 0 ? (
          <Card className="bg-cyber-dark/60 border border-cyber-cyan/30">
            <CardContent className="p-6 text-gray-400">Connect your wallet to see your Cardify NFTs.</CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {tokens.map(([collection, id]) => (
              <NFTCard key={`${collection}-${id}`} collection={collection as `0x${string}`} id={id} />
            ))}
          </div>
        )}
      </section>
        </TabsContent>

        <TabsContent value="featured" className="space-y-8">
          {/* ───────────────────────── Featured Cards ───────────────────────── */}
          <section className="mb-8">
            <div className="flex items-end justify-between mb-3 sm:mb-4">
              <h2 className="text-xl sm:text-2xl font-bold text-white tracking-wider">Featured Cards</h2>
              <div className="text-xs text-gray-400">
                {featuredCards.length > 0 && (
                  <span className="hidden sm:inline">
                    {featuredCards.length} featured card{featuredCards.length > 1 && "s"}
                  </span>
                )}
              </div>
            </div>

            {/* Featured Cards Grid */}
            {loadingAssets ? (
              <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="aspect-[3/4] bg-cyber-dark/40 border border-cyber-cyan/20 rounded-lg animate-pulse" />
                ))}
              </div>
            ) : featuredCards.length === 0 ? (
              <div className="text-center py-12">
                <div className="w-16 h-16 mx-auto mb-4 bg-cyber-dark/40 border border-cyber-cyan/20 rounded-lg flex items-center justify-center">
                  <Star className="w-8 h-8 text-cyber-cyan/40" />
                </div>
                <h3 className="text-lg font-semibold text-white mb-2">No Featured Cards</h3>
                <p className="text-gray-400 text-sm mb-4">
                  You don't have any featured cards yet. Featured cards are special cards that get highlighted in the marketplace.
                </p>
                <Link href="/generate" className="inline-flex items-center gap-2 px-4 py-2 bg-cyber-cyan text-cyber-black rounded-lg hover:bg-cyber-cyan/90 transition-colors">
                  <Sparkles className="w-4 h-4" />
                  Create Featured Card
                </Link>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4">
                {featuredCards.map((a, index) => {
                  const existing = listingBySource[a.id]
                  const listed = !!existing && existing.status === "active"
                  return (
                    <div key={a.id} className="group relative">
                      <button
                        onClick={() => {
                          setLightboxIndex(index)
                          setLightboxOpen(true)
                        }}
                        className="w-full aspect-[3/4] relative overflow-hidden rounded-lg border-2 border-cyber-cyan/30 hover:border-cyber-cyan transition-colors duration-300 bg-cyber-dark/40"
                      >
                        <Image
                          src={a.public_url}
                          alt={getCleanGenerationTitle(a.file_name)}
                          fill
                          className="object-cover transition-transform duration-300 group-hover:scale-105"
                          onError={(e) =>
                            ((e.currentTarget as HTMLImageElement).src = PLACEHOLDER)
                          }
                        />
                        {/* Featured Badge - Always visible for featured cards */}
                        <div className="absolute top-2 left-2 z-10 pointer-events-none">
                          <Badge className="bg-yellow-500/90 text-black border-yellow-400 border-2 font-bold text-xs px-2 py-1 shadow-lg flex items-center gap-1">
                            <Star className="w-3 h-3 fill-black" />
                            FEATURED
                          </Badge>
                        </div>
                        {/* Hover overlay with gradient and view text */}
                        <div className="absolute inset-0 pointer-events-none">
                          {/* Background gradient overlay */}
                          <div className="absolute inset-0 bg-gradient-to-t from-cyber-dark/95 via-cyber-dark/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

                          {/* VIEW text */}
                          <div className="absolute inset-0 flex items-center justify-center">
                            <span className="text-cyber-cyan text-lg font-bold tracking-wider opacity-0 group-hover:opacity-100 transition-all duration-300 transform scale-90 group-hover:scale-100">
                              VIEW
                            </span>
                          </div>
                        </div>
                      </button>

                      {/* Share button - only for listed items */}
                      {listed && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            navigator.clipboard.writeText(`${window.location.origin}/card/${existing.id}`)
                            toast({
                              title: "Link copied!",
                              description: "Share this card with others",
                            })
                          }}
                          className="absolute top-2 right-2 w-8 h-8 bg-cyber-dark/80 hover:bg-cyber-dark border border-cyber-cyan/50 hover:border-cyber-cyan rounded-lg flex items-center justify-center transition-colors opacity-0 group-hover:opacity-100"
                          title="Copy share link"
                        >
                          <Link2 className="w-4 h-4 text-cyber-cyan" />
                        </button>
                      )}

                      {/* Card info */}
                      <div className="mt-2 space-y-1">
                        <h3 className="text-sm font-medium text-white truncate">
                          {getCleanGenerationTitle(a.file_name)}
                        </h3>
                        <div className="flex items-center justify-between text-xs text-gray-400">
                          <span className="capitalize">{a.asset_type}</span>
                          {listed && (
                            <span className="text-cyber-green font-medium">Listed</span>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </section>
        </TabsContent>

        <TabsContent value="purchases" className="space-y-8">
          {/* Purchases */}
          <section className="mb-8">
        <div className="flex items-end justify-between mb-3 sm:mb-4">
          <h2 className="text-xl sm:text-2xl font-bold text-white tracking-wider">Purchases</h2>
        </div>

        {!uid ? (
          <Card className="bg-cyber-dark/60 border border-cyber-cyan/30">
            <CardContent className="p-6 text-gray-400">Sign in to view your purchases.</CardContent>
          </Card>
        ) : loadingPurchases ? (
          <Card className="bg-cyber-dark/60 border border-cyber-cyan/30">
            <CardContent className="p-6 text-gray-400">Loading purchases…</CardContent>
          </Card>
        ) : purchases.length === 0 ? (
          <Card className="bg-cyber-dark/60 border border-cyber-cyan/30">
            <CardContent className="p-6 text-gray-400">No purchases yet.</CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4">
            {purchases.map((p, index) => (
              <Card
                key={`purchase-${p.id}`}
                className="bg-cyber-dark/60 border border-cyber-cyan/30 hover:border-cyber-cyan/60 transition-all duration-300 overflow-hidden hover:shadow-[0_0_30px_rgba(34,211,238,0.3)]"
              >
                <CardContent className="p-2 sm:p-3">
                  <button
                    onClick={() => {
                      setPurchasesLightboxIndex(index)
                      setPurchasesLightboxOpen(true)
                    }}
                    className="block relative aspect-[5/7] bg-gradient-to-br from-cyber-dark/40 to-cyber-dark/80 rounded-lg overflow-hidden cursor-pointer group w-full border-2 border-cyber-cyan/50 transition-all duration-300 hover:border-cyber-cyan touch-manipulation"
                    title={getCleanPurchaseTitle(p.asset.title, p.asset.assetType)}
                  >
                    <Image
                      src={p.asset.imageUrl || PLACEHOLDER}
                      alt={getCleanPurchaseTitle(p.asset.title, p.asset.assetType)}
                      fill
                      sizes="(max-width: 640px) 100vw, (max-width: 768px) 50vw, (max-width: 1024px) 33vw, 20vw"
                      className="object-fill"
                      onError={(e) => ((e.currentTarget as HTMLImageElement).src = PLACEHOLDER)}
                    />
                    {/* Hover overlay with gradient and view text */}
                    <div className="absolute inset-0 pointer-events-none">
                      {/* Background gradient overlay */}
                      <div className="absolute inset-0 bg-gradient-to-t from-cyber-dark/95 via-cyber-dark/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                      
                      {/* VIEW text */}
                      <div className="absolute inset-0 flex items-center justify-center">
                        <span className="text-cyber-cyan text-sm font-bold tracking-wider opacity-0 group-hover:opacity-100 transition-all duration-300 transform scale-90 group-hover:scale-100">
                          VIEW
                        </span>
                      </div>
                    </div>
                  </button>

                  <div className="mt-2 sm:mt-3">
                    <h3 className="text-xs sm:text-sm font-semibold text-white truncate" title={getCleanPurchaseTitle(p.asset.title, p.asset.assetType)}>
                      {getCleanPurchaseTitle(p.asset.title, p.asset.assetType)}
                    </h3>
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-xs text-gray-400">
                        ${(p.amountCents / 100).toFixed(2)}
                      </span>
                      <span className="text-xs text-emerald-400">
                        {new Date(p.purchasedAt).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>
        </TabsContent>

        <TabsContent value="transactions" className="space-y-8">
          {/* Transaction History */}
          <section className="mb-8">
            <div className="flex items-end justify-between mb-3 sm:mb-4">
              <h2 className="text-xl sm:text-2xl font-bold text-white tracking-wider">Transaction History</h2>
              <div className="text-xs text-gray-400">
                {transactionHistory.length > 0 && (
                  <span className="hidden sm:inline">{transactionHistory.length} transactions</span>
                )}
              </div>
            </div>

            {!uid ? (
              <Card className="bg-cyber-dark/60 border border-cyber-cyan/30">
                <CardContent className="p-6 text-gray-400">Sign in to view your transaction history.</CardContent>
              </Card>
            ) : loadingTransactionHistory ? (
              <Card className="bg-cyber-dark/60 border border-cyber-cyan/30">
                <CardContent className="p-6 text-gray-400">Loading transaction history…</CardContent>
              </Card>
            ) : transactionHistory.length === 0 ? (
              <Card className="bg-cyber-dark/60 border border-cyber-cyan/30">
                <CardContent className="p-6 text-gray-400">No transactions yet.</CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {transactionHistory.map((transaction) => (
                  <Card
                    key={transaction.id}
                    className="bg-cyber-dark/60 border border-cyber-cyan/30 hover:border-cyber-cyan/60 transition-all duration-300"
                  >
                    <CardContent className="p-3 sm:p-4">
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 sm:gap-3 mb-2">
                            <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                              transaction.type === 'purchase' ? 'bg-blue-400' :
                              transaction.type === 'sale' ? 'bg-green-400' :
                              transaction.type === 'credit_usage' ? 'bg-yellow-400' :
                              transaction.type === 'revenue_conversion' ? 'bg-purple-400' :
                              transaction.type === 'revenue_request' ? 'bg-orange-400' :
                              transaction.type === 'credit_purchase' ? 'bg-emerald-400' :
                              transaction.type === 'credit_added' ? 'bg-emerald-400' :
                              transaction.type === 'generation' ? 'bg-pink-400' :
                              transaction.type === 'upload' ? 'bg-cyan-400' :
                              transaction.type === 'credit_used' ? 'bg-red-400' :
                              'bg-gray-400'
                            }`} />
                            <span className="text-xs sm:text-sm font-semibold text-white">
                              {transaction.type === 'purchase' ? 'Purchase' :
                               transaction.type === 'sale' ? 'Sale' :
                               transaction.type === 'credit_usage' ? 'Credit Usage' :
                               transaction.type === 'revenue_conversion' ? 'Revenue Conversion' :
                               transaction.type === 'revenue_request' ? 'Revenue Request' :
                               transaction.type === 'credit_purchase' ? 'Credit Purchase' :
                               transaction.type === 'credit_added' ? 'Credits Added' :
                               transaction.type === 'generation' ? 'AI Generation' :
                               transaction.type === 'upload' ? 'Upload' :
                               transaction.type === 'credit_used' ? 'Credits Used' :
                               'Transaction'}
                            </span>
                            <Badge 
                              variant="outline" 
                              className={`text-xs ${
                                transaction.status === 'completed' ? 'border-green-400 text-green-400' :
                                transaction.status === 'pending' ? 'border-yellow-400 text-yellow-400' :
                                transaction.status === 'failed' ? 'border-red-400 text-red-400' :
                                'border-gray-400 text-gray-400'
                              }`}
                            >
                              {transaction.status}
                            </Badge>
                          </div>
                          <p className="text-xs sm:text-sm text-gray-300 mb-1">{transaction.description}</p>
                          <p className="text-xs text-gray-500">
                            {new Date(transaction.created_at).toLocaleString()}
                          </p>
                        </div>
                        <div className="text-left sm:text-right">
                          {transaction.amount_cents && (
                            <div className="text-base sm:text-lg font-bold text-cyber-green">
                              ${(transaction.amount_cents / 100).toFixed(2)}
                            </div>
                          )}
                          {transaction.credits && (
                            <div className="text-xs sm:text-sm font-semibold text-cyber-cyan">
                              {transaction.credits} credits
                              <div className="text-xs text-gray-400">
                                ${getDollarValue(Math.abs(transaction.credits)).toFixed(2)}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </section>
        </TabsContent>

        <TabsContent value="feedback" className="space-y-8">
          {/* Feedback Section */}
          <section className="mb-8">
            <div className="flex items-end justify-between mb-3 sm:mb-4">
              <h2 className="text-xl sm:text-2xl font-bold text-white tracking-wider">Send Feedback</h2>
            </div>

            {!uid ? (
              <Card className="bg-cyber-dark/60 border border-cyber-cyan/30">
                <CardContent className="p-6 text-gray-400">Sign in to send feedback.</CardContent>
              </Card>
            ) : (
              <Card className="bg-cyber-dark/60 border border-cyber-cyan/30">
                <CardContent className="p-6">
                  <div className="space-y-6">
                    <div className="text-center">
                      <MessageSquare className="w-12 h-12 text-cyber-cyan mx-auto mb-4" />
                      <h3 className="text-lg font-semibold text-white mb-2">We'd love to hear from you!</h3>
                      <p className="text-gray-400 text-sm">
                        Share your thoughts, report bugs, or suggest new features. Your feedback helps us improve Cardify.
                      </p>
                    </div>
                    
                    <Button
                      onClick={() => setFeedbackOpen(true)}
                      className="w-full cyber-button"
                    >
                      <MessageSquare className="w-4 h-4 mr-2" />
                      Send Feedback
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </section>
        </TabsContent>
      </Tabs>

    </div>

    {/* Sell dialog – price locked to $9 */}
    <Dialog open={sellOpen} onOpenChange={(open) => {
      setSellOpen(open)
      if (!open) {
        setListingName("")
        setSelectedCategories([])
      }
    }}>
      <DialogContent className="bg-cyber-dark/95 border-2 border-cyber-cyan/50 text-white max-w-md">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold text-white">List for Sale</DialogTitle>
        </DialogHeader>
        <div>
          {/* Card Image Preview */}
          {selectedAsset && (
            <div className="flex justify-center mb-5">
              <div className="relative w-48 h-[16.8rem] rounded-lg overflow-hidden border-2 border-cyber-cyan/50 bg-gradient-to-br from-cyber-dark/40 to-cyber-dark/80">
                <Image
                  src={selectedAsset.public_url || PLACEHOLDER}
                  alt={getCleanGenerationTitle(selectedAsset.file_name)}
                  fill
                  className="object-cover"
                  sizes="192px"
                  onError={(e) => ((e.currentTarget as HTMLImageElement).src = PLACEHOLDER)}
                />
              </div>
            </div>
          )}

          {/* Editable Name Field */}
          <div className="mb-5">
            <Input
              value={listingName}
              onChange={(e) => setListingName(e.target.value)}
              placeholder="Enter a unique, descriptive name for your listing"
              className={`bg-cyber-dark/60 border-cyber-cyan/30 text-white placeholder-gray-400 focus:border-cyber-cyan ${
                isDefaultListingName(listingName.trim())
                  ? 'border-red-500/50 focus:border-red-500'
                  : ''
              }`}
              maxLength={60}
            />
            <p className="text-xs text-gray-400 mt-1.5">
              This name will appear in the marketplace
            </p>
            {isDefaultListingName(listingName.trim()) && (
              <div className="text-xs text-red-400 flex items-center gap-1 mt-1.5">
                <AlertTriangle className="h-3 w-3" />
                Please enter a unique, descriptive name (at least 3 characters)
              </div>
            )}
          </div>

          {/* Category Selection */}
          <div className="mb-5">
            <CategorySelector
              selectedCategories={selectedCategories}
              onChange={setSelectedCategories}
            />
            <p className="text-xs text-gray-400 mt-1.5">
              Select categories that best describe your card
            </p>
          </div>

          {/* Price Display */}
          <div className="flex items-center justify-between p-3 bg-cyber-cyan/10 border border-cyber-cyan/30 rounded-lg">
            <span className="text-sm text-gray-300">Price</span>
            <span className="text-lg font-bold text-cyber-cyan">${FIXED_PRICE_USD}.00</span>
          </div>
        </div>
        <DialogFooter className="pt-2 gap-2 sm:gap-2">
          <Button
            variant="outline"
            onClick={() => {
              setSellOpen(false)
              setListingName("")
              setSelectedCategories([])
            }}
            className="bg-transparent border-2 border-cyber-pink/50 text-cyber-pink hover:bg-cyber-pink/10 hover:border-cyber-pink hover:text-cyber-pink transition-all"
          >
            Cancel
          </Button>
          <Button
  onClick={createListing}
  disabled={
    creating ||
    listingName.trim().length < 3 ||
    isDefaultListingName(listingName.trim())
  }
  className="cyber-button"
>
  {creating ? "Listing…" : "List for Sale"}
</Button>

        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* Delete confirm dialog */}
    <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
      <DialogContent className="border border-cyber-cyan/30 bg-cyber-dark/60">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-white">
            <AlertTriangle className="h-5 w-5 text-cyber-orange" />
            Delete this card?
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-gray-300">
            This will remove <span className="text-white font-semibold">{targetAsset?.file_name ? getCleanGenerationTitle(targetAsset.file_name) : 'this card'}</span> from your profile.
          </p>
          <div className="rounded-md border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">
            This action cannot be undone.
          </div>
        </div>
        <DialogFooter className="pt-2 gap-2 sm:gap-2">
          <Button
            variant="outline"
            onClick={() => setConfirmOpen(false)}
            className="bg-transparent border-2 border-cyber-cyan/50 text-cyber-cyan hover:bg-cyber-cyan/10 hover:border-cyber-cyan hover:text-cyber-cyan transition-all"
          >
            Cancel
          </Button>
          <Button
            onClick={confirmDelete}
            className="bg-red-600 hover:bg-red-700 text-white border border-red-500/50"
            disabled={!!(targetAsset && deletingId === targetAsset.id)}
          >
            {targetAsset && deletingId === targetAsset.id ? "Deleting…" : "Delete"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* Feedback Modal */}
    <Dialog open={feedbackOpen} onOpenChange={setFeedbackOpen}>
      <DialogContent className="bg-cyber-dark/95 border-2 border-cyber-cyan/50 text-white max-w-md">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold text-white flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-cyber-cyan" />
            Send Feedback
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="text-sm text-gray-300">
            We'd love to hear your thoughts! Share feedback, report bugs, or suggest new features.
          </div>
          
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-300">
              Subject *
            </label>
            <Input
              value={feedbackSubject}
              onChange={(e) => setFeedbackSubject(e.target.value)}
              placeholder="Brief description of your feedback"
              className="bg-cyber-dark/60 border-cyber-cyan/30 text-white placeholder-gray-400 focus:border-cyber-cyan"
              maxLength={100}
            />
          </div>
          
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-300">
              Message *
            </label>
            <Textarea
              value={feedbackMessage}
              onChange={(e) => setFeedbackMessage(e.target.value)}
              placeholder="Please provide details about your feedback, bug report, or feature request..."
              className="bg-cyber-dark/60 border-cyber-cyan/30 text-white placeholder-gray-400 focus:border-cyber-cyan min-h-[120px] resize-none"
              maxLength={1000}
            />
            <div className="text-xs text-gray-400 text-right">
              {feedbackMessage.length}/1000 characters
            </div>
          </div>
        </div>
        <DialogFooter className="pt-2 gap-2 sm:gap-2">
          <Button
            variant="outline"
            onClick={() => {
              setFeedbackOpen(false)
              setFeedbackSubject("")
              setFeedbackMessage("")
            }}
            className="bg-transparent border-2 border-cyber-pink/50 text-cyber-pink hover:bg-cyber-pink/10 hover:border-cyber-pink hover:text-cyber-pink transition-all"
          >
            Cancel
          </Button>
          <Button 
            onClick={submitFeedback} 
            disabled={submittingFeedback || !feedbackSubject.trim() || !feedbackMessage.trim()}
            className="cyber-button"
          >
            {submittingFeedback ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Sending...
              </>
            ) : (
              "Send Feedback"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* Lightbox – Uploads */}
    <Lightbox
      images={uploads.map((u) => ({
        id: u.id,
        url: u.public_url,
        title: getCleanGenerationTitle(u.file_name),
        size: u.file_size,
        mimeType: u.mime_type,
      }))}
      initialIndex={uploadsLightboxIndex}
      isOpen={uploadsLightboxOpen}
      onClose={() => setUploadsLightboxOpen(false)}
    />

    {/* Lightbox – My Generations */}
    <Lightbox
      images={generations.map((a) => ({
        id: a.id,
        url: a.public_url,
        title: getCleanGenerationTitle(a.file_name),
        size: a.file_size,
        mimeType: a.mime_type,
      }))}
      initialIndex={lightboxIndex}
      isOpen={lightboxOpen}
      onClose={() => setLightboxOpen(false)}
    />

    {/* Lightbox – Featured Cards */}
    <Lightbox
      images={featuredCards.map((a) => ({
        id: a.id,
        url: a.public_url,
        title: getCleanGenerationTitle(a.file_name),
        size: a.file_size,
        mimeType: a.mime_type,
      }))}
      initialIndex={lightboxIndex}
      isOpen={lightboxOpen}
      onClose={() => setLightboxOpen(false)}
    />

    {/* Purchases Lightbox */}
    <Lightbox
      images={purchases.map((p) => ({
        id: p.id,
        url: p.asset.imageUrl || PLACEHOLDER,
        title: getCleanPurchaseTitle(p.asset.title, p.asset.assetType),
        size: 0, // Purchases don't have file size info
        mimeType: 'image/jpeg',
      }))}
      initialIndex={purchasesLightboxIndex}
      isOpen={purchasesLightboxOpen}
      onClose={() => setPurchasesLightboxOpen(false)}
    />

    {/* Custom Card Checkout Modal */}
    <CustomCardCheckoutModal
      isOpen={checkoutModalOpen}
      onClose={() => {
        setCheckoutModalOpen(false)
        setSelectedCardForCheckout(null)
      }}
      uploadedImage={selectedCardForCheckout?.public_url || null}
      uploadedImageUrl={selectedCardForCheckout?.public_url || null}
    />

    {/* Revenue Request Options Modal */}
    <Dialog open={revenueRequestOpen} onOpenChange={setRevenueRequestOpen}>
      <DialogContent className="bg-cyber-dark/95 border-2 border-cyber-cyan/50 text-white">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold text-white">Request Revenue</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="text-sm text-gray-300">
            You have <span className="text-2xl font-bold text-cyber-green">${(totalRevenue / 100).toFixed(2)}</span> in revenue available.
            Choose how you'd like to receive it:
          </div>
          
          <div className="grid grid-cols-1 gap-4">
            {/* Option 1: Get Credits */}
            <div className="border border-cyber-cyan/30 bg-cyber-cyan/5 rounded-lg p-4 hover:border-cyber-cyan/60 transition-colors">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-white mb-1">Convert to Credits</h3>
                  <p className="text-sm text-gray-400">Get {Math.floor((totalRevenue / 100) * 400)} credits (${(Math.floor((totalRevenue / 100) * 400) / 400).toFixed(2)}) instantly</p>
                </div>
                <Button 
                  onClick={handleGetCredits}
                  disabled={isConvertingCredits}
                  className="bg-cyber-cyan hover:bg-cyber-cyan/80 text-black font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isConvertingCredits ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Converting...
                    </>
                  ) : (
                    "Get Credits"
                  )}
                </Button>
              </div>
            </div>

            {/* Option 2: Stripe Payment */}
            <div className="border border-cyber-pink/30 bg-cyber-pink/5 rounded-lg p-4 hover:border-cyber-pink/60 transition-colors">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-white mb-1">Request Stripe Payment</h3>
                  <p className="text-sm text-gray-400">Get paid via Stripe (2-3 weeks processing)</p>
                </div>
                <Button 
                  onClick={handleStripePayment}
                  className="bg-cyber-pink hover:bg-cyber-pink/80 text-black font-semibold"
                >
                  Request Payment
                </Button>
              </div>
            </div>
          </div>
        </div>
        <DialogFooter className="pt-2">
          <Button
            variant="outline"
            onClick={() => setRevenueRequestOpen(false)}
            className="bg-transparent border-2 border-cyber-cyan/50 text-cyber-cyan hover:bg-cyber-cyan/10 hover:border-cyber-cyan hover:text-cyber-cyan transition-all"
          >
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* Stripe Payment Form Modal */}
    <Dialog open={stripePaymentOpen} onOpenChange={setStripePaymentOpen}>
      <DialogContent className="bg-cyber-dark/95 border-2 border-cyber-cyan/50 text-white max-w-md">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold text-white">Stripe Payment Request</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="text-sm text-gray-300">
            Amount: <span className="font-semibold text-cyber-green">${(totalRevenue / 100).toFixed(2)}</span>
          </div>
          
          <div className="space-y-3">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Full Name *</label>
              <Input
                value={stripeFormData.name}
                onChange={(e) => setStripeFormData(prev => ({ ...prev, name: e.target.value }))}
                placeholder="Enter your full name"
                className="bg-cyber-dark/60 border-cyber-cyan/50 text-white placeholder:text-gray-500"
              />
            </div>
            
            <div>
              <label className="block text-sm text-gray-400 mb-1">Email *</label>
              <Input
                type="email"
                value={stripeFormData.email}
                onChange={(e) => setStripeFormData(prev => ({ ...prev, email: e.target.value }))}
                placeholder="Enter your email"
                className="bg-cyber-dark/60 border-cyber-cyan/50 text-white placeholder:text-gray-500"
              />
            </div>
            
            <div>
              <label className="block text-sm text-gray-400 mb-1">Phone Number</label>
              <Input
                type="tel"
                value={stripeFormData.phone}
                onChange={(e) => setStripeFormData(prev => ({ ...prev, phone: e.target.value }))}
                placeholder="Enter your phone number"
                className="bg-cyber-dark/60 border-cyber-cyan/50 text-white placeholder:text-gray-500"
              />
            </div>
            
            <div>
              <label className="block text-sm text-gray-400 mb-1">Stripe Account</label>
              <Input
                value={stripeFormData.stripeAccount}
                onChange={(e) => setStripeFormData(prev => ({ ...prev, stripeAccount: e.target.value }))}
                placeholder="Enter your Stripe account"
                className="bg-cyber-dark/60 border-cyber-cyan/50 text-white placeholder:text-gray-500"
              />
            </div>
          </div>

          <div className="text-xs text-amber-400 bg-amber-500/10 border border-amber-500/30 rounded p-2">
            ⏱️ Payment processing will take 2-3 weeks
          </div>
        </div>
        <DialogFooter className="pt-2 gap-2">
          <Button
            variant="outline"
            onClick={() => setStripePaymentOpen(false)}
            className="bg-transparent border-2 border-cyber-cyan/50 text-cyber-cyan hover:bg-cyber-cyan/10 hover:border-cyber-cyan hover:text-cyber-cyan transition-all"
          >
            Cancel
          </Button>
          <Button 
            onClick={handleStripeFormSubmit}
            disabled={submittingStripe || !stripeFormData.name || !stripeFormData.email}
            className="bg-cyber-green hover:bg-cyber-green/80 text-black font-semibold"
          >
            {submittingStripe ? "Submitting..." : "Submit Request"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
)
}

export default function Profile() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-cyber-black pt-24 px-6 flex items-center justify-center">
        <div className="text-white">Loading...</div>
      </div>
    }>
      <ProfileContent />
    </Suspense>
  )
}
