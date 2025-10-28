/* app/(cardify)/upload/page.tsx */
"use client"

import { useState, useCallback, useEffect, useRef, Suspense } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Navigation } from "@/components/navigation"
import { UploadArea } from "@/components/upload-area"
import { FlippableCardPreview } from "@/components/flippable-card-preview"
import { CustomCardCheckoutModal } from "@/components/custom-card-checkout-modal"
import { useNavigationVisibility } from "@/hooks/use-navigation-visibility"
import { Upload, AlertCircle, ArrowRight, Loader2, Package, CreditCard } from "lucide-react"
import { Checkbox } from "@/components/ui/checkbox"
import { cropImageToAspectRatio } from "@/lib/image-processing"
import { uploadUserImage } from "@/lib/supabase-storage";
import { getSupabaseBrowserClient, signInWithGoogle } from "@/lib/supabase-browser"
import { useToast } from "@/hooks/use-toast"
import { ToastAction } from "@/components/ui/toast"
import { useNotifications, notificationHelpers } from "@/components/notification-system"
import { track } from "../../../lib/analytics-client"
import Link from "next/link"
import { formatCreditsWithDollars } from "@/lib/utils"
import { useRouter, useSearchParams } from "next/navigation"
import { NFTGenerationOption } from "@/components/nft-generation-option"
import { NFTCollectionForm } from "@/components/nft-collection-form"

// Package purchase response interface
interface PackagePurchaseResponse {
  success: boolean
  message: string
  package_id: string | null
  uploads_remaining: number
}

// Upload status interface for tiered system
interface UploadStatus {
  upload_count: number
  upload_package_count: number
  remaining_uploads: number
  next_package_cost: number
  message: string
}

function UploadPageContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  
  /* ───────── series auto-linking ───────────────── */
  const [activeSeriesId, setActiveSeriesId] = useState<string | null>(null)
  const [seriesType, setSeriesType] = useState<string | null>(null)
  
  /* ───────── NFT+Card linking ───────────────── */
  const [uploadedCardId, setUploadedCardId] = useState<string | null>(null)
  
  useEffect(() => {
    // Check if there's an active series in localStorage
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('activeSeries')
      console.log('🔍 [Upload] Checking localStorage for activeSeries:', stored)
      if (stored) {
        try {
          const { seriesId, series_type, timestamp } = JSON.parse(stored)
          const age = Date.now() - timestamp
          console.log('🔍 [Upload] Found series:', seriesId, 'Type:', series_type, 'Age:', age, 'ms')
          // Only use if created within last 10 minutes
          if (age < 600000) {
            console.log('✅ [Upload] Using series ID:', seriesId, 'Type:', series_type)
            setActiveSeriesId(seriesId)
            setSeriesType(series_type || 'physical_only')
          } else {
            console.log('⏰ [Upload] Series expired, removing')
            localStorage.removeItem('activeSeries')
          }
        } catch (e) {
          console.error('❌ [Upload] Error parsing localStorage:', e)
          localStorage.removeItem('activeSeries')
        }
      } else {
        console.log('ℹ️ [Upload] No activeSeries in localStorage')
      }
    }
  }, [])
  
  /* ────────────────────────────── state ────────────────────────────── */
  const [uploadedImage, setUploadedImage] = useState<string | null>(null)
  const [processedImageBlob, setProcessedImageBlob] = useState<Blob | null>(null)
  const [uploadedImageUrl, setUploadedImageUrl] = useState<string | null>(null)

  const [isUploading, setIsUploading] = useState(false)
  const [isUploadingToDatabase, setIsUploadingToDatabase] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)

  const [uploadProgress, setUploadProgress] = useState(0)
  const [fileName, setFileName] = useState("")
  const [fileSize, setFileSize] = useState("")

  const [showCheckoutModal, setShowCheckoutModal] = useState(false)

  const [hasAgreed, setHasAgreed] = useState(false)
  const [showLegalDetails, setShowLegalDetails] = useState(false)

  const [credits, setCredits] = useState<number>(0)
  const [user, setUser] = useState<any>(null)
  const [freeGenerationsUsed, setFreeGenerationsUsed] = useState(0);
  const [isLoadingCredits, setIsLoadingCredits] = useState(false);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true); // Add auth loading state
  
  // New upload status state
  const [uploadStatus, setUploadStatus] = useState<UploadStatus | null>(null)
  const [isLoadingUploadStatus, setIsLoadingUploadStatus] = useState(false)
  const [isPurchasingPackage, setIsPurchasingPackage] = useState(false)

  // NFT generation state
  const [generateNFT, setGenerateNFT] = useState(true) // Always enabled for series
  const [showNFTForm, setShowNFTForm] = useState(false)
  const [collectionNumber, setCollectionNumber] = useState(0)

  const isGuest        = !user
  const hasNoCredits   = !!user && credits < 1
  const cannotUpload   = !!user && uploadStatus && uploadStatus.remaining_uploads === 0

  /* ────────────────────── misc refs & helpers ──────────────────────── */
  const isNavVisible = useNavigationVisibility()
  const desktopButtonRef = useRef<HTMLDivElement>(null)
  const tooltipTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 })
  const [showTooltip, setShowTooltip] = useState(false)
  const [tooltipVisible, setTooltipVisible] = useState(false)
  const [tooltipText, setTooltipText] = useState("")
  const { toast } = useToast()
  const { showNotification, showLoading, hideLoading } = useNotifications()

  /* ──────────────────────── supabase session & RT ───────────────────── */
  useEffect(() => {
    const sb = getSupabaseBrowserClient()

    const init = async () => {
      const { data: { user } } = await sb.auth.getUser()
      setUser(user)
      setIsCheckingAuth(false) // Auth check complete
      
      if (!user?.id) return

      // Fetch credits and free generations
      const { data } = await sb
        .from("profiles") // Updated table name
        .select("credits, free_generations_used")
        .eq("id", user.id)
        .maybeSingle()

      const userCredits = Number(data?.credits ?? 0)
      setCredits(userCredits)
      setFreeGenerationsUsed(Number(data?.free_generations_used ?? 0))
      
      // Fetch upload status
      await fetchUploadStatus(user.id)
      
      // Check if user came from sign-in with purchase intent
      const intent = searchParams.get('intent')
      if (intent === 'purchase' && userCredits < 10) {
        // User just signed in and needs credits
        router.push('/credits?returnTo=/upload')
      }
    }
    init()

    let sub: ReturnType<typeof sb.channel> | null = null
    const listen = async () => {
      const { data: { user } } = await sb.auth.getUser()
      if (!user?.id) return

      sub = sb.channel(`profile-${user.id}`)
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "profiles", filter: `id=eq.${user.id}` }, // Updated table name
          (payload) => {
            if (payload.new) {
              const newData = payload.new as { credits?: number; free_generations_used?: number }
              setCredits(Number(newData.credits ?? 0))
              setFreeGenerationsUsed(Number(newData.free_generations_used ?? 0))
              
              // Refresh upload status when profile changes
              fetchUploadStatus(user.id)
            }
          }
        )
        .subscribe()
    }
    listen()

    return () => { if (sub) sb.removeChannel(sub) }
  }, [searchParams, router])

  // Function to fetch upload status
  const fetchUploadStatus = async (userId: string) => {
    setIsLoadingUploadStatus(true)
    try {
      const sb = getSupabaseBrowserClient()
      
      // Try to call the new function first
      const { data, error } = await sb.rpc('get_user_upload_status', { p_user_id: userId })
      
      
      if (error) {
        // Handle specific error codes
        if (error.code === '42702') {
          // Create fallback status based on current profile data
          const fallbackStatus: UploadStatus = {
            upload_count: 0,
            upload_package_count: 1, // Assume user has package since they have credits
            remaining_uploads: 25, // First package gives 25 uploads
            next_package_cost: 100, // Next package costs 100 credits
            message: 'Database function needs update. Using fallback status.'
          }
          setUploadStatus(fallbackStatus)
          return
        }
        
        if (error.code === '42703' || error.message?.includes('column') || error.message?.includes('does not exist')) {
          // Create temporary fallback status based on current profile data
          const fallbackStatus: UploadStatus = {
            upload_count: 0,
            upload_package_count: 0,
            remaining_uploads: 0, // No uploads available until function is working
            next_package_cost: 1,
            message: 'Database functions not ready. Please contact support.'
          }
          
          setUploadStatus(fallbackStatus)
          return
        }
        
        
        // Generic fallback for other errors
        const fallbackStatus: UploadStatus = {
          upload_count: 0,
          upload_package_count: 1, // Assume user has package since they have credits
          remaining_uploads: 25, // First package gives 25 uploads
          next_package_cost: 100, // Next package costs 100 credits
          message: 'Error loading status. Using fallback status.'
        }
        setUploadStatus(fallbackStatus)
      } else if (data && Array.isArray(data) && data.length > 0) {
        setUploadStatus(data[0] as UploadStatus)
      } else if (data && typeof data === 'object' && 'upload_count' in data) {
        // Handle case where data is returned as single object instead of array
        setUploadStatus(data as UploadStatus)
      } else {
        // No data returned, use fallback
        const fallbackStatus: UploadStatus = {
          upload_count: 0,
          upload_package_count: 1, // Assume user has package since they have credits
          remaining_uploads: 25, // First package gives 25 uploads
          next_package_cost: 100, // Next package costs 100 credits
          message: 'No data returned. Using fallback status.'
        }
        setUploadStatus(fallbackStatus)
      }
    } catch (error) {
      // Fallback on any error
      const fallbackStatus: UploadStatus = {
        upload_count: 0,
        upload_package_count: 1, // Assume user has package since they have credits
        remaining_uploads: 25, // First package gives 25 uploads
        next_package_cost: 100, // Next package costs 100 credits
        message: 'Database error. Using fallback status.'
      }
      
      setUploadStatus(fallbackStatus)
    } finally {
      setIsLoadingUploadStatus(false)
    }
  }


// Function to purchase upload package
const purchaseUploadPackage = async () => {
  if (!user?.id) return
  
  // Check if user has enough credits for the package
  const requiredCredits = uploadStatus?.next_package_cost || 1
  if (credits < requiredCredits) {
    // Redirect to credits page if they don't have enough
    toast({
      title: "Insufficient Credits",
      description: `You need ${requiredCredits} credit${requiredCredits !== 1 ? 's' : ''} to purchase this package.`,
      variant: "destructive",
      action: <ToastAction altText="Buy Credits" onClick={() => window.location.href = '/credits?returnTo=/upload'}>Buy Credits</ToastAction>
    })
    
    // Redirect after a short delay to show the toast
    setTimeout(() => {
      window.location.href = '/credits?returnTo=/upload'
    }, 2000)
    return
  }
  
  setIsPurchasingPackage(true)
  const loadingId = showLoading(notificationHelpers.purchasing())
  
  try {
    const response = await fetch('/api/purchase-upload-package', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    })
    
    const result = await response.json()
    
    if (result.success) {
      hideLoading(loadingId)
      showNotification({
        type: 'success',
        title: 'Package Purchased! 🎉',
        description: result.message,
        action: {
          label: 'View Status',
          onClick: () => window.location.reload()
        }
      })
      
      // Refresh credits and upload status
      const sb = getSupabaseBrowserClient()
      const { data: profileData } = await sb
        .from("profiles")
        .select("credits")
        .eq("id", user.id)
        .maybeSingle()
      
      setCredits(Number(profileData?.credits ?? 0))
      await fetchUploadStatus(user.id)
    } else {
      hideLoading(loadingId)
      showNotification({
        type: 'error',
        title: 'Purchase Failed',
        description: result.message || "Failed to purchase package",
        action: {
          label: 'Try Again',
          onClick: () => purchaseUploadPackage()
        }
      })
    }
  } catch (error) {
    hideLoading(loadingId)
    showNotification({
      type: 'error',
      title: 'Purchase Failed',
      description: "An error occurred while purchasing the package",
      action: {
        label: 'Try Again',
        onClick: () => purchaseUploadPackage()
      }
    })
  } finally {
    setIsPurchasingPackage(false)
  }
}

// ... existing code ...
  /* ───────────────────────── UI helpers ─────────────────────────────── */
  const getTooltipMessage = () => {
    if (isGuest)              return "Sign in to continue"
    if (cannotUpload)          return ""  // No tooltip - button is clickable
    if (!uploadedImage)        return "Please upload an image first"
    if (!hasAgreed)            return "☝ Agree to terms above"
    return ""
  }

  /* ───────────────────────── upload handler ─────────────────────────── */
const handleFileUpload = useCallback(async (file: File) => {
  const t0 = performance.now()
  await track("upload", {
    action: "select_file",
    name: file.name,
    size: file.size,
    type: file.type,
  })

  // For authenticated users, check upload status
  if (user?.id) {
    setIsLoadingCredits(true)
    try {
      const sb = getSupabaseBrowserClient()
      
      // Check upload status first
      await fetchUploadStatus(user.id)
      
      // Check if user can upload
      if (uploadStatus && uploadStatus.remaining_uploads === 0) {
        // Don't set error here - just show toast
        toast({
          title: "Upload Limit Reached",
          description: uploadStatus.next_package_cost === 1 
            ? "You're a first time user! Get 25 uploads for 1 credit."
            : "You've used all your uploads. Purchase a package for 100 credits ($0.25) to get 10 more uploads.",
          variant: "destructive",
          action: <ToastAction altText="Purchase Package" onClick={() => purchaseUploadPackage()}>Purchase Package</ToastAction>
        })
        return
      }
      
      // Check credits for upload - now handled by the tiered system
      // The database functions will check if user has enough credits for their tier
    } catch (error) {
      // Continue with upload if we can't check
    } finally {
      setIsLoadingCredits(false)
    }
  }

  setIsUploading(true)
  setFileName(file.name)
  setFileSize((file.size / (1024 * 1024)).toFixed(2) + " MB")
  setUploadProgress(0)
  setUploadError(null)
  
  // Show loading notification (disabled - using existing UI loader instead)
  // const loadingId = showLoading(notificationHelpers.uploading(file.name))

  // Clear previous states
  setUploadedImageUrl(null)

  // Temporary preview while we process/upload
  const tempPreviewURL = URL.createObjectURL(file)
  setUploadedImage(tempPreviewURL)

  const prog = setInterval(() => setUploadProgress(p => (p >= 70 ? 70 : p + 10)), 200)

  try {
    // 1) Process to card aspect
    let processedBlob: Blob = file
    try {
      processedBlob = await cropImageToAspectRatio(file)
      setProcessedImageBlob(processedBlob)
      await track("upload", { phase: "cropped" })
    } catch (cropErr: any) {
      // Fallback to raw file, but record the failure of cropping
      setProcessedImageBlob(file)
      await track(
        "upload",
        { phase: "crop_failed_fallback_raw", msg: String(cropErr?.message || cropErr) },
        "error"
      )
    }

    clearInterval(prog)
    setUploadProgress(80)

    // 2) Guests: preview only (no upload/billing)
    if (isGuest) {
      setUploadProgress(100)
      await track("upload", { phase: "guest_preview_only" }, "ok", performance.now() - t0)
      // hideLoading(loadingId) // Disabled - no popup
      setTimeout(() => setIsUploading(false), 400)
      return
    }

    // 3) Authenticated: upload and let the DB trigger bill a paid credit.
    //    IMPORTANT: Do NOT mark as AI generation here (uploads don't get free gens).
    try {
      console.log('📤 [Upload] Initial upload with activeSeriesId:', activeSeriesId);
      
      const result = await uploadUserImage(
        processedBlob,
        undefined,
        {
          /* 👇 NEW: make the row unambiguously an *upload* */
          is_ai_generation: false,
          source_type:      "uploaded_image",   // <── added
        },
        activeSeriesId ? true : false, // featured (4th param)
        activeSeriesId || undefined    // seriesId (5th param)
      );
      
      console.log('✅ [Upload] Initial upload result:', result.success, 'Series was:', activeSeriesId);
      
      // Get the user_assets ID (not uploaded_images ID)
      if (result.imageRecordId) {
        try {
          const supabase = getSupabaseBrowserClient();
          const { data: assetData } = await supabase
            .from('user_assets')
            .select('id')
            .eq('source_id', result.imageRecordId)
            .single<{ id: string }>();
          
          setUploadedCardId(assetData?.id ?? null);
          console.log('💾 [Upload] Card ID for NFT linking:', assetData?.id);
        } catch (error) {
          console.error('Failed to get user_assets ID:', error);
          setUploadedCardId(null);
        }
      }

      // Check if upload was blocked due to duplicate
      if (!result.success) {
        if (result.error === 'duplicate_image') {
          const errorMsg = result.message || 'This image appears to be a duplicate.';
          setUploadError(errorMsg);
          toast({
            title: "Duplicate Image Detected",
            description: errorMsg,
            variant: "destructive",
            action: <ToastAction altText="Choose Another">Choose Another</ToastAction>
          });
        } else {
          const errorMsg = result.message || 'Upload failed. Please try again.';
          setUploadError(errorMsg);
          toast({
            title: "Upload Failed",
            description: errorMsg,
            variant: "destructive",
            action: <ToastAction altText="Try Again">Try Again</ToastAction>
          });
        }
        setUploadProgress(100);
        return;
      }
      
      // Check if upload was flagged for review (first duplicate)
      if (result.success && result.duplicateCheckResult && result.duplicateCheckResult.action === 'flag') {
        const warningMsg = result.duplicateCheckResult.message || 'Similar image detected - this will be reviewed by our team.';
        // Only show toast, not both error UI and notification
        toast({
          title: "Image Flagged for Review",
          description: warningMsg,
          variant: "destructive",
        });
      }

      const { publicUrl } = result;

      setUploadedImageUrl(publicUrl || null)
      setUploadedImage(publicUrl || null)
      URL.revokeObjectURL(tempPreviewURL)
      setUploadProgress(100)

      await track(
        "upload",
        { phase: "saved_to_supabase", hasUrl: !!publicUrl },
        "ok",
        performance.now() - t0
      )

      // Show success toast with longer duration
      toast({
        variant: "success",
        title: "Card Uploaded Successfully! 🎉",
        description: "Your card has been saved to your profile and is ready to list on the marketplace.",
        duration: 8000, // Show for 8 seconds instead of default 5
      })

      // Soft refresh credits and upload status in case Realtime lags
      try {
        const sb = getSupabaseBrowserClient()
        if (user?.id) {
          const { data } = await sb
            .from("profiles") // Updated table name
            .select("credits")
            .eq("id", user.id)
            .maybeSingle()
          if (data) setCredits(Number(data.credits ?? 0))
          
          // Refresh upload status
          await fetchUploadStatus(user.id)
        }
      } catch {
        /* non-fatal */
      }
    } catch (uploadErr: any) {
      const msg = String(uploadErr?.message || uploadErr)

      await track(
        "upload",
        { phase: "upload_error", msg },
        "error",
        performance.now() - t0
      )

      // Only show toast notifications, not multiple error displays
      
      if (msg.includes("insufficient_credits") || msg.includes("insufficient_credits_or_free_gens")) {
        setUploadError("Insufficient credits. You need 10 credits to upload an image.")
        toast({
          title: "Insufficient Credits",
          description: "You need 10 credits to upload an image.",
          variant: "destructive",
          action: <ToastAction altText="Buy Credits" onClick={() => window.location.href = '/credits'}>Buy Credits</ToastAction>
        })
      } else if (msg === "not_signed_in") {
        setUploadError("Please sign in to upload images.")
        toast({
          title: "Sign In Required",
          description: "You must be signed in to upload images.",
          variant: "destructive",
          action: <ToastAction altText="Sign In" onClick={() => signInWithGoogle()}>Sign In</ToastAction>
        })
      } else {
        setUploadError("Failed to upload image. Please try again.")
        toast({
          title: "Upload Failed",
          description: "Failed to upload image. Please try again.",
          variant: "destructive",
          action: <ToastAction altText="Try Again">Try Again</ToastAction>
        })
      }
      setUploadProgress(100)
    }
  } catch (error: any) {
    clearInterval(prog)
    await track(
      "upload",
      { phase: "processing_exception", msg: String(error?.message || error) },
      "error",
      performance.now() - t0
    )
    setUploadError("Failed to process image. Please try again.")
    setUploadProgress(100)
  } finally {
    clearInterval(prog)
    setTimeout(() => setIsUploading(false), 400)
  }
}, [isGuest, user?.id, credits, uploadStatus, cannotUpload, hasNoCredits])



  /* ───────────────────── finalize / buy / sign-in ───────────────────── */
// ensure you have: import { track } from "@/lib/analytics-client"

const finishOrRedirect = async (): Promise<void> => {
  const t0 = performance.now();

  // block if required state missing
  if (!uploadedImage || !hasAgreed) {
    await track("upload", {
      phase: "finalize_block",
      reason: !uploadedImage ? "no_image" : "not_agreed",
      level: "warn", // label it in props, not in the status slot
    });
    return;
  }

  // auth gate
  if (isGuest) {
    await track("upload", { phase: "finalize_gate_guest" });
    toast({ 
      title: "Sign in required", 
      variant: "destructive",
      action: <ToastAction altText="Sign In" onClick={() => signInWithGoogle("/upload")}>Sign In</ToastAction>
    });
    signInWithGoogle("/upload");
    return;
  }

  // Handle case where user has no uploads remaining (which includes no credits case)
  if (cannotUpload) {
    // purchaseUploadPackage already handles the no-credits redirect
    purchaseUploadPackage();
    return;
  }

  // already uploaded? check if NFT generation is enabled
  if (uploadedImageUrl) {
    if (generateNFT) {
      // Generate a collection number and show NFT form
      const newCollectionNumber = Math.floor(Math.random() * 1000000) + 1
      setCollectionNumber(newCollectionNumber)
      setShowNFTForm(true)
      return
    } else {
      await track("upload", {
        phase: "open_checkout",
        from: "existing_url",
        duration_ms: performance.now() - t0,
      });
      await track("buy", { event: "open_checkout", source: "upload_finalize_existing" });
      setShowCheckoutModal(true);
      return;
    }
  }

  // upload now, then open checkout
  setIsUploadingToDatabase(true);
  setUploadError(null);

  try {
    // Make the blob definitively a Blob (not null)
    const blob: Blob = processedImageBlob
      ? processedImageBlob
      : await fetch(uploadedImage as string).then((r) => r.blob());

    console.log('📤 [Upload] Starting upload with activeSeriesId:', activeSeriesId);
    
    const result = await uploadUserImage(
      blob,
      undefined,
      {
        /* 👇 SAME one-liner here */
        is_ai_generation: false,
        source_type:      "uploaded_image",   // <── added
      },
      activeSeriesId ? true : false, // featured (4th param)
      activeSeriesId || undefined    // seriesId (5th param)
    );
    
    console.log('✅ [Upload] Upload result:', result.success, 'Series was:', activeSeriesId);
    
    // Clear activeSeries from localStorage after successful upload
    if (activeSeriesId && result.success && typeof window !== 'undefined') {
      console.log('🧹 [Upload] Clearing localStorage activeSeries');
      localStorage.removeItem('activeSeries');
    }

    // Check if upload was blocked due to duplicate
    if (!result.success) {
      if (result.error === 'duplicate_image') {
        const errorMsg = result.message || 'This image appears to be a duplicate.';
        setUploadError(errorMsg);
        toast({
          title: "Duplicate Image Detected",
          description: errorMsg,
          variant: "destructive",
          action: <ToastAction altText="Choose Another">Choose Another</ToastAction>
        });
      } else {
        setUploadError(result.message || 'Upload failed. Please try again.');
        toast({
          title: "Upload Failed",
          description: result.message || 'Upload failed. Please try again.',
          variant: "destructive",
          action: <ToastAction altText="Try Again">Try Again</ToastAction>
        });
      }
      return;
    }
    
    // Check if upload was flagged for review (first duplicate)
    if (result.success && result.duplicateCheckResult && result.duplicateCheckResult.action === 'flag') {
      const warningMsg = result.duplicateCheckResult.message || 'Similar image detected - this will be reviewed by our team.';
      // Only show toast, not multiple notifications
      toast({
        title: "Image Flagged for Review",
        description: warningMsg,
        variant: "destructive",
      });
    }

    const { publicUrl } = result;

    await track("upload", {
      phase: "uploading_from_finalize",
      size: blob.size,
      type: blob.type,
    });

    setUploadedImageUrl(publicUrl || null);
    setUploadedImage(publicUrl || null);
    
    // Check if NFT generation is enabled
    if (generateNFT) {
      // Generate a collection number and show NFT form
      const newCollectionNumber = Math.floor(Math.random() * 1000000) + 1
      setCollectionNumber(newCollectionNumber)
      setShowNFTForm(true)
    } else {
      setShowCheckoutModal(true);
    }

    await track("upload", {
      phase: "uploaded_from_finalize",
      hasUrl: !!publicUrl,
      duration_ms: performance.now() - t0,
    });
    await track("buy", { event: "open_checkout", source: "upload_finalize_uploaded" });
  } catch (err: any) {
    const msg = String(err?.message || err);
    await track("upload", { phase: "finalize_upload_error", msg }, "error");

    if (err?.message === "no_credits") {
      setUploadError("Insufficient credits. You need 10 credits to upload an image.");
    } else if (err?.message?.startsWith("duplicate_image:")) {
      setUploadError("This image has already been uploaded. Duplicate images are not allowed.");
      toast({
        title: "Duplicate Image",
        description: "This image has already been uploaded. Please use a different image.",
        variant: "destructive",
      });
    } else {
      setUploadError("Failed to upload image. Try again.");
    }
  } finally {
    setIsUploadingToDatabase(false);
  }
};


  /* ─────────────────────────── tooltips ─────────────────────────────── */
  const handleMouseMove = useCallback((e: MouseEvent) => {
    setMousePos({ x: e.clientX, y: e.clientY })
  }, [])

  const handleMouseEnter = useCallback(() => {
    const message = getTooltipMessage()
    if (!message || isUploadingToDatabase) return
    
    // Clear any existing timeout
    if (tooltipTimeoutRef.current) {
      clearTimeout(tooltipTimeoutRef.current)
    }
    
    setTooltipText(message)
    setShowTooltip(true)
    // Small delay for smooth fade in
    setTimeout(() => {
      setTooltipVisible(true)
    }, 10)
    
    document.addEventListener('mousemove', handleMouseMove)
  }, [uploadedImage, hasAgreed, isGuest, isUploadingToDatabase, handleMouseMove, cannotUpload])

  const handleMouseLeave = useCallback(() => {
    // Start fade out
    setTooltipVisible(false)
    
    // Remove tooltip after fade animation completes
    tooltipTimeoutRef.current = setTimeout(() => {
      setShowTooltip(false)
      setTooltipText("")
    }, 150) // Match the transition duration
    
    document.removeEventListener('mousemove', handleMouseMove)
  }, [handleMouseMove])
  
  // Clean up tooltip on unmount
  useEffect(() => {
    return () => {
      if (tooltipTimeoutRef.current) {
        clearTimeout(tooltipTimeoutRef.current)
      }
      document.removeEventListener("mousemove", handleMouseMove)
    }
  }, [handleMouseMove])
  
  // Clean up blob URLs to prevent memory leaks
  useEffect(() => {
    return () => {
      // Clean up blob URL when component unmounts
      if (uploadedImage && uploadedImage.startsWith('blob:')) {
        URL.revokeObjectURL(uploadedImage)
      }
    }
  }, [uploadedImage])

  /* ───────────────────────── action button ──────────────────────────── */
  const ActionButton = () => {
    // Determine the correct click handler based on state
    const handleClick = () => {
      if (cannotUpload) {
        purchaseUploadPackage()
      } else if (generateNFT && uploadedImage && !uploadedImageUrl) {
        // If NFT is enabled and image is uploaded but not saved to database yet
        finishOrRedirect()
      } else if (generateNFT && uploadedImageUrl) {
        // If NFT is enabled and image is already saved, show NFT form
        const newCollectionNumber = Math.floor(Math.random() * 1000000) + 1
        setCollectionNumber(newCollectionNumber)
        setShowNFTForm(true)
      } else {
        finishOrRedirect()
      }
    }

    // Calculate helper text
    const getHelperText = () => {
      if (!user || isGuest) return null
      if (!cannotUpload) return null
      
      const requiredCredits = uploadStatus?.next_package_cost || 1
      const packageSize = requiredCredits === 1 ? 25 : 10
      
      if (credits >= requiredCredits) {
        return (
          <p className="text-xs text-gray-400 mt-2">
            Uses {formatCreditsWithDollars(requiredCredits)} • {credits - requiredCredits} credits remaining
          </p>
        )
      } else {
        return (
          <p className="text-xs text-amber-400 mt-2">
            Requires {formatCreditsWithDollars(requiredCredits)} • You have {formatCreditsWithDollars(credits)}
          </p>
        )
      }
    }

    return (
      <>
        <Button
          disabled={cannotUpload ? false : (!uploadedImage || !hasAgreed || isUploadingToDatabase)}
          onClick={handleClick}
          className={`w-full text-lg py-6 tracking-wider transition-all duration-300 ${
            (uploadedImage && hasAgreed && !cannotUpload) || cannotUpload
              ? "cyber-button"
              : "bg-gray-800 border-2 border-gray-600 text-gray-500 cursor-not-allowed opacity-50"
          }`}
        >
          {isUploadingToDatabase ? (
            <>
              <Loader2 className="w-5 h-5 mr-2 animate-spin" /> Uploading…
            </>
          ) : isGuest ? (
            <>Sign In</>
          ) : cannotUpload ? (
            <>Purchase Package</>
          ) : generateNFT && uploadedImageUrl ? (
            <>
              Generate NFT <ArrowRight className="w-5 h-5 ml-2" />
            </>
          ) : (
            <>
              Finalize <ArrowRight className="w-5 h-5 ml-2" />
            </>
          )}
        </Button>
        {getHelperText()}
      </>
    )
  }


  /* ─────────────────────────────── JSX ──────────────────────────────── */
  return (
    <div className="min-h-screen bg-cyber-black relative overflow-hidden font-mono">
      <div className="fixed inset-0 cyber-grid opacity-10 pointer-events-none" />
      <div className="fixed inset-0 scanlines opacity-20 pointer-events-none" />

      <Navigation />

      <CustomCardCheckoutModal
        isOpen={showCheckoutModal}
        onClose={() => setShowCheckoutModal(false)}
        uploadedImage={uploadedImage}
        processedImageBlob={processedImageBlob}
        uploadedImageUrl={uploadedImageUrl}
      />

      <div className="px-6 py-8 pt-24 pb-20">
        <div className="max-w-7xl mx-auto">
          {/* heading */}
          <div className="mb-8">
            <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-wider">
              Upload Your Own Artwork
            </h1>
            <p className="text-gray-400">Create custom trading cards with your own designs</p>
          </div>

          <div className="grid lg:grid-cols-5 gap-8">
            {/* left column */}
            <div className="lg:col-span-3 flex flex-col gap-3">
              {/* upload card */}
<Card className="bg-cyber-dark/60 backdrop-blur-sm border border-cyber-cyan/30 flex-1 flex flex-col">
  <CardHeader className="pb-3">
    <CardTitle className="text-white flex items-center gap-2 tracking-wider text-lg">
      <Upload className="w-5 h-5 text-cyber-cyan" /> Upload Artwork
    </CardTitle>
    <p className="text-xs text-gray-400 mt-1.5 ml-7">
      Need artwork? Try Canva or Photoshop (1200×1680 px+) or our{" "}
      <a
        href="/generate"
        className="text-cyber-cyan underline hover:text-cyber-pink transition-colors"
      >
        AI Generator
      </a>
      .
    </p>
  </CardHeader>

  <CardContent className="flex-1 flex flex-col pt-3">
    {uploadError && (
      <div className="mb-4 p-3 bg-red-900/30 border border-red-500/50 rounded-lg">
        <div className="flex items-center gap-2 text-red-400">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span className="text-sm font-medium">{uploadError}</span>
        </div>
      </div>
    )}
    
    {isCheckingAuth ? (
      /* Loading animation while checking auth */
      <div className="flex-1 flex flex-col items-center justify-center py-12 px-6">
        <div className="flex flex-col items-center space-y-4">
          {/* Spinning loader with glow effect */}
          <div className="relative flex items-center justify-center w-12 h-12">
            <div className="absolute inset-0 bg-cyber-cyan/20 blur-2xl rounded-full animate-pulse" />
            <Loader2 className="w-12 h-12 text-cyber-cyan animate-spin relative" />
          </div>
          
          {/* Loading text with dots animation */}
          <div className="text-gray-400 text-sm text-center">
            Checking authentication
            <span className="inline-flex ml-1">
              <span className="animate-[bounce_1.4s_ease-in-out_0.1s_infinite]">.</span>
              <span className="animate-[bounce_1.4s_ease-in-out_0.2s_infinite]">.</span>
              <span className="animate-[bounce_1.4s_ease-in-out_0.3s_infinite]">.</span>
            </span>
          </div>
        </div>
      </div>
    ) : isGuest || hasNoCredits ? (
      /* Sign-in prompt for guests or no-credits message */
      <div className="flex-1 flex flex-col items-center justify-center py-12 px-6">
        <div className="w-full max-w-md space-y-6 text-center">
          <div className="relative">
            <div className="absolute inset-0 bg-cyber-cyan/10 blur-3xl rounded-full" />
            <div className="w-20 h-20 mx-auto relative border-2 border-cyber-cyan/50 rounded-lg bg-cyber-dark/80 backdrop-blur-sm flex items-center justify-center">
              <Upload className="w-10 h-10 text-cyber-cyan" />
            </div>
          </div>
          
          <div className="space-y-3">
            <h3 className="text-xl font-bold text-white tracking-wider">
              {isGuest ? "Sign In to Upload" : "Purchase Upload Package"}
            </h3>
            <p className="text-gray-400 text-sm leading-relaxed">
              {isGuest 
                ? "Create an account to upload your custom artwork and transform it into physical trading cards"
                : `You need ${uploadStatus?.next_package_cost === 1 ? '1 credit for your first' : '100 credits for'} an upload package (${uploadStatus?.next_package_cost === 1 ? '25' : '10'} uploads)`
              }
            </p>
            {isGuest && (
              <p className="text-xs text-gray-500 border-t border-gray-800 pt-3">
                New users will be directed to purchase credits after signing in (10 credits required per upload)
              </p>
            )}
            {hasNoCredits && (
              <p className="text-xs text-amber-400 border-t border-gray-800 pt-3">
                You currently have {formatCreditsWithDollars(credits)}. Purchase credits to continue.
              </p>
            )}
          </div>
          
          {isGuest ? (
            <Button
              onClick={() => signInWithGoogle("/upload?intent=purchase")}
              className="w-full cyber-button text-lg py-6 tracking-wider"
            >
              <svg className="w-5 h-5 mr-3" viewBox="0 0 24 24">
                <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Sign In
            </Button>
          ) : (
            <Button
              onClick={() => window.location.href = '/credits?returnTo=/upload'}
              className="w-full cyber-button text-lg py-6 tracking-wider"
            >
              <CreditCard className="w-5 h-5 mr-2" />
              Buy Credits
            </Button>
          )}
          
          <div className="pt-4 border-t border-gray-800">
            <p className="text-xs text-gray-500">
              By signing in, you agree to our{" "}
              <a href="/terms" className="text-cyber-cyan hover:text-cyber-pink transition-colors">
                Terms
              </a>{" "}
              and{" "}
              <a href="/privacy" className="text-cyber-cyan hover:text-cyber-pink transition-colors">
                Privacy Policy
              </a>
            </p>
          </div>
        </div>
      </div>
    ) : (
      /* Upload area for authenticated users */
      <UploadArea
        onFileUpload={handleFileUpload}
        disabled={isUploading || isLoadingCredits}
        isUploading={isUploading || isLoadingCredits}
        uploadProgress={uploadProgress}
        fileName={fileName}
        fileSize={fileSize}
        uploadedImage={uploadedImage}
      />
    )}
  </CardContent>
</Card>


              {/* NFT Generation Option */}
              {/* Only show NFT option if NOT physical_only series */}
              {!isCheckingAuth && !isGuest && !hasNoCredits && uploadedImage && seriesType !== 'physical_only' && (
                <NFTGenerationOption
                  onNFTToggle={setGenerateNFT}
                  isEnabled={generateNFT}
                  userCredits={credits}
                  baseCost={0} // No additional cost for base upload (already paid)
                  nftCost={10} // Only NFT cost
                  disabled={isUploading || isUploadingToDatabase}
                />
              )}

              {/* NFT Collection Form */}
              {/* Only show NFT form if NOT physical_only series */}
              {showNFTForm && uploadedImage && seriesType !== 'physical_only' && (
                <NFTCollectionForm
                  onCollectionGenerated={(address, codes) => {
                    console.log('Collection generated:', address, codes)
                    setShowNFTForm(false)
                    // You can add additional logic here to handle the generated collection
                  }}
                  onClose={() => setShowNFTForm(false)}
                  baseImage={uploadedImage}
                  collectionNumber={collectionNumber}
                  cardId={uploadedCardId}
                />
              )}

              {/* mobile preview */}
              <div className="lg:hidden">
                <Card className="bg-cyber-dark/60 backdrop-blur-sm border border-cyber-cyan/30">
                  <CardHeader>
                    <CardTitle className="text-white tracking-wider">Card Preview</CardTitle>
                    <p className="text-gray-400 text-sm">Hover to see the back of your card</p>
                  </CardHeader>
                  <CardContent>
                    <FlippableCardPreview
                      artwork={uploadedImageUrl || (isUploading ? null : uploadedImage)}
                      defaultImage="/cardify-card-1757636897120.webp"
                      isLoading={isUploading || (!!uploadedImage && !uploadedImageUrl && !isGuest)}
                       useSimpleLoader={true}
                    />
                  </CardContent>
                </Card>
              </div>

              {/* desktop action */}
              {!isCheckingAuth && !isGuest && !hasNoCredits && (
                <Card className="bg-cyber-dark/60 backdrop-blur-sm border border-cyber-green/30 hidden lg:block">
                  <CardContent className="p-4">
                    <div className="space-y-3">
                      {/* legal checkbox */}
                      <label className="flex items-start gap-2 cursor-pointer">
                        <Checkbox
                          checked={hasAgreed}
                          onCheckedChange={v => setHasAgreed(v === true || v === "indeterminate")}
                          className="h-4 w-4 mt-0.5 border-2 border-cyber-cyan data-[state=checked]:bg-cyber-cyan data-[state=checked]:border-cyber-cyan data-[state=checked]:text-cyber-black"
                        />
                        <span className="text-xs text-gray-300 leading-relaxed">
                          I confirm I have rights to use this content and agree to the{" "}
                          <a href="/terms" target="_blank" className="text-cyber-cyan underline">
                            Terms
                          </a>{" "}
                          and{" "}
                          <a href="/dmca" target="_blank" className="text-cyber-cyan underline">
                            DMCA Policy
                          </a>
                          .{" "}
                          <button
                            type="button"
                            onClick={e => {
                              e.preventDefault()
                              e.stopPropagation()
                              setShowLegalDetails(prev => !prev)
                            }}
                            className="text-gray-400 ml-0.5 text-[11px] border border-gray-600 px-1.5 py-0.5 rounded"
                          >
                            {showLegalDetails ? "− less" : "+ more"}
                          </button>
                        </span>
                      </label>
                      {showLegalDetails && (
                        <div className="text-xs text-gray-400 bg-cyber-dark/50 p-2 rounded border border-cyber-cyan/10">
                          <p className="flex items-start gap-1 mb-1">
                            <span className="text-cyber-yellow">•</span> You own or have licenses to use
                            all content
                          </p>
                          <p className="flex items-start gap-1 mb-1">
                            <span className="text-cyber-yellow">•</span> Content doesn't infringe IP
                          </p>
                          <p className="flex items-start gap-1">
                            <span className="text-cyber-yellow">•</span> No unauthorized likenesses
                          </p>
                        </div>
                      )}

                      {/* button */}
                      <div 
                        ref={desktopButtonRef} 
                        className="pt-1"
                        onMouseEnter={handleMouseEnter}
                        onMouseLeave={handleMouseLeave}
                      >
                        <ActionButton />
                      </div>

                      {uploadError && (
                        <div className="text-xs text-red-400 bg-red-900/20 border border-red-400/30 rounded p-2 mt-2">
                          <AlertCircle className="w-3 h-3 inline mr-1" /> {uploadError}
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>

            {/* right column preview */}
            <div className="hidden lg:block lg:col-span-2">
              <div
                className={`sticky transition-all duration-300 ${
                  isNavVisible ? "top-24" : "top-4"
                }`}
              >
                {/* Minimal Status - Only show when relevant */}
                {user && uploadStatus && (
                  uploadStatus.remaining_uploads > 0 || (uploadStatus.next_package_cost > 0 && credits >= (uploadStatus?.next_package_cost || 1))
                ) && (
                  <div className="mb-4">
                    {uploadStatus.remaining_uploads > 0 ? (
                      /* Simple remaining counter */
                      <div className="flex items-center justify-between p-3 bg-cyber-dark/60 backdrop-blur-sm border border-cyber-cyan/30 rounded">
                        <span className="text-gray-400 text-sm">Uploads remaining</span>
                        <span className="text-cyber-cyan font-mono font-bold text-lg">{uploadStatus.remaining_uploads}</span>
                      </div>
                    ) : uploadStatus.next_package_cost > 0 && credits >= (uploadStatus?.next_package_cost || 1) && (
                      /* Purchase CTA only when user has enough credits */
                      <Button
                        onClick={purchaseUploadPackage}
                        disabled={isPurchasingPackage}
                        className="w-full cyber-button"
                      >
                        {isPurchasingPackage ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Purchasing...
                          </>
                        ) : (
                          <>
                            Get {uploadStatus.next_package_cost === 1 ? '25' : '10'} uploads
                            <span className="mx-2">•</span>
                            {formatCreditsWithDollars(uploadStatus.next_package_cost)}
                          </>
                        )}
                      </Button>
                    )}
                  </div>
                )}

                {/* Card Preview Card - Main Focus */}
                <Card className="bg-cyber-dark/60 backdrop-blur-sm border border-cyber-cyan/30">
                  <CardHeader>
                    <CardTitle className="text-white tracking-wider">Card Preview</CardTitle>
                    <p className="text-gray-400 text-sm">Hover to see the back of your card</p>
                  </CardHeader>
                  <CardContent>
                <FlippableCardPreview
artwork={uploadedImageUrl || (isUploading ? null : uploadedImage)}
  defaultImage="/cardify-card-1757636897120.webp"
  isLoading={isUploading || (!!uploadedImage && !uploadedImageUrl && !isGuest)}
  useSimpleLoader
/>

                  </CardContent>
                </Card>
              </div>
            </div>
          </div>

          {/* mobile action */}
          {!isCheckingAuth && !isGuest && !hasNoCredits && (
            <Card className="bg-cyber-dark/60 backdrop-blur-sm border border-cyber-green/30 lg:hidden mt-8">
              <CardContent className="p-6 space-y-4">
                {uploadError && (
                  <div className="p-3 bg-red-900/30 border border-red-500/50 rounded-lg">
                    <div className="flex items-center gap-2 text-red-400">
                      <AlertCircle className="w-4 h-4 flex-shrink-0" />
                      <span className="text-sm font-medium">{uploadError}</span>
                    </div>
                  </div>
                )}
                {/* legal checkbox */}
                <label className="flex items-start gap-2 cursor-pointer">
                  <Checkbox
                    checked={hasAgreed}
                    onCheckedChange={v => setHasAgreed(v === true || v === "indeterminate")}
                    className="h-4 w-4 mt-0.5 border-2 border-cyber-cyan data-[state=checked]:bg-cyber-cyan data-[state=checked]:border-cyber-cyan data-[state=checked]:text-cyber-black"
                  />
                  <span className="text-xs text-gray-300 leading-relaxed">
                    I confirm I have rights to use this content and agree to the{" "}
                    <a href="/terms" target="_blank" className="text-cyber-cyan underline">
                      Terms
                    </a>{" "}
                    and{" "}
                    <a href="/dmca" target="_blank" className="text-cyber-cyan underline">
                      DMCA Policy
                    </a>
                    .{" "}
                    <button
                      type="button"
                      onClick={e => {
                        e.preventDefault()
                        e.stopPropagation()
                                                    setShowLegalDetails(prev => !prev)
                      }}
                      className="text-gray-400 ml-0.5 text-[11px] border border-gray-600 px-1.5 py-0.5 rounded"
                    >
                      {showLegalDetails ? "− less" : "+ more"}
                    </button>
                  </span>
                </label>
                {showLegalDetails && (
                  <div className="text-xs text-gray-400 bg-cyber-dark/50 p-2 rounded border border-cyber-cyan/10">
                    <p className="flex items-start gap-1 mb-1">
                      <span className="text-cyber-yellow">•</span> You own or have licenses to use
                      all content
                    </p>
                    <p className="flex items-start gap-1 mb-1">
                      <span className="text-cyber-yellow">•</span> Content doesn't infringe IP
                    </p>
                    <p className="flex items-start gap-1">
                      <span className="text-cyber-yellow">•</span> No unauthorized likenesses
                    </p>
                  </div>
                )}
                
                {/* NFT Generation Option for Mobile */}
                {/* Only show NFT option if NOT physical_only series */}
                {uploadedImage && seriesType !== 'physical_only' && (
                  <NFTGenerationOption
                    onNFTToggle={setGenerateNFT}
                    isEnabled={generateNFT}
                    userCredits={credits}
                    baseCost={0} // No additional cost for base upload (already paid)
                    nftCost={10} // Only NFT cost
                    disabled={isUploading || isUploadingToDatabase}
                  />
                )}

                <div 
                  onMouseEnter={handleMouseEnter}
                  onMouseLeave={handleMouseLeave}
                >
                  <ActionButton />
                </div>
                {uploadError && (
                  <div className="text-xs text-red-400 bg-red-900/20 border border-red-400/30 rounded p-2">
                    <AlertCircle className="w-3 h-3 inline mr-1" /> {uploadError}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Mobile Upload Status - Minimal */}
          {!isCheckingAuth && user && uploadStatus && (
            <div className="lg:hidden mt-4">
              {uploadStatus.remaining_uploads > 0 ? (
                /* Simple remaining counter */
                <div className="flex items-center justify-between p-3 bg-cyber-dark/60 backdrop-blur-sm border border-cyber-cyan/30 rounded">
                  <span className="text-gray-400 text-sm">Uploads remaining</span>
                  <span className="text-cyber-cyan font-mono font-bold text-lg">{uploadStatus.remaining_uploads}</span>
                </div>
              ) : uploadStatus.next_package_cost > 0 && credits >= (uploadStatus?.next_package_cost || 1) && (
                /* Purchase CTA only when user has enough credits */
                <Button
                  onClick={purchaseUploadPackage}
                  disabled={isPurchasingPackage}
                  className="w-full cyber-button"
                >
                  {isPurchasingPackage ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Purchasing...
                    </>
                  ) : (
                    <>
                      Get {uploadStatus.next_package_cost === 1 ? '25' : '10'} uploads
                      <span className="mx-2">•</span>
                      {formatCreditsWithDollars(uploadStatus.next_package_cost)}
                    </>
                  )}
                </Button>
              )}
            </div>
          )}
        </div>
      </div>


      {/* tooltip */}
      {showTooltip && tooltipText && (
        <div
          className={`fixed z-50 pointer-events-none transition-opacity duration-150 ${
            tooltipVisible ? "opacity-100" : "opacity-0"
          }`}
          style={{ left: mousePos.x + 15, top: mousePos.y + 15 }}
        >
          <div className="bg-cyber-dark border border-cyber-cyan/50 text-white text-sm px-3 py-2 rounded-md shadow-lg max-w-xs">
            {tooltipText}
          </div>
        </div>
      )}
    </div>
  )
}

export default function UploadPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-cyber-black pt-24 px-6 flex items-center justify-center">
        <div className="text-white">Loading...</div>
      </div>
    }>
      <UploadPageContent />
    </Suspense>
  )
}
