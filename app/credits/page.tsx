"use client"

import { useEffect, useState, useRef, Suspense } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { useToast } from "@/hooks/use-toast"
import { CreditCard, Coins, Loader2 } from "lucide-react"
import { CryptoPaymentModal } from "@/components/crypto-payment-modal"

const PACKS = [
  { usd: 10, images: 4000, tag: "Starter" },
  { usd: 25, images: 10000, tag: "Popular" },
  { usd: 50, images: 20000, tag: "Best Value" },
] as const

function CreditsPageContent() {
  const supabase = createClientComponentClient()
  const router = useRouter()
  const searchParams = useSearchParams()
  const { toast } = useToast()
  const [uid, setUid] = useState<string | null>(null)
  const [busy, setBusy] = useState<number | null>(null)
  const [credits, setCredits] = useState<number>(0)
  const previousCreditsRef = useRef<number>(0)
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [selectedPack, setSelectedPack] = useState<number | null>(null)
  const [showCryptoPaymentModal, setShowCryptoPaymentModal] = useState(false)
  const [cryptoPaymentData, setCryptoPaymentData] = useState<any>(null)

  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      setUid(session?.user?.id ?? null)
      
      if (session?.user?.id) {
        // Fetch current credits
        const { data } = await supabase
          .from("profiles")
          .select("credits")
          .eq("id", session.user.id)
          .maybeSingle()
        
        if (data) {
          setCredits(Number(data.credits ?? 0))
        }
      }
    }
    init()
  }, [supabase])

  // Handle success parameter from Stripe redirect
  useEffect(() => {
    const success = searchParams.get('success')
    const canceled = searchParams.get('canceled')
    
    if (success === '1') {
      toast({
        title: "Payment Successful!",
        description: "Your credits have been added to your account.",
        variant: "default"
      })
      // Redirect to profile after a short delay
      setTimeout(() => {
        router.push('/profile?credits=success')
      }, 2000)
    } else if (canceled === '1') {
      toast({
        title: "Payment Canceled",
        description: "Your payment was canceled. You can try again anytime.",
        variant: "destructive"
      })
    }
  }, [searchParams, toast, router])
  
  // Monitor for credit changes and redirect if needed
  useEffect(() => {
    if (!uid) return

    const returnTo = searchParams.get('returnTo')
    // Validate returnTo is a safe internal path
    const isValidReturnPath = returnTo && returnTo.startsWith('/') && !returnTo.startsWith('//')

    // Update previous credits ref whenever credits change
    if (credits > 0 && previousCreditsRef.current === 0) {
      previousCreditsRef.current = credits
    }

    // Set up realtime subscription for credit updates
    const sub = supabase.channel(`profile-${uid}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "profiles", filter: `id=eq.${uid}` },
        (payload) => {
          if (payload.new) {
            const newCredits = Number((payload.new as any).credits ?? 0)
            const oldCredits = previousCreditsRef.current
            setCredits(newCredits)

            // Redirect if credits increased (indicates a purchase)
            if (newCredits > oldCredits && oldCredits > 0) {
              const redirectPath = isValidReturnPath ? returnTo : '/profile'
              toast({
                title: "Credits purchased!",
                description: `You now have ${newCredits} credits. Redirecting...`
              })
              setTimeout(() => {
                router.push(redirectPath)
              }, 1500)
            }

            // Update ref for next comparison
            previousCreditsRef.current = newCredits
          }
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(sub) }
  }, [uid, credits, searchParams, router, supabase, toast])

  const buy = async (usd: number) => {
    if (!uid) {
      toast({ title: "Sign in required", description: "Please sign in to buy credits.", variant: "destructive" })
      return
    }
    setSelectedPack(usd)
    setShowPaymentModal(true)
  }

  const handleStripePayment = async () => {
    if (!selectedPack) return
    setBusy(selectedPack)
    try {
      const res = await fetch("/api/credits/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ usd: selectedPack }),
      })
      const json = await res.json()
      if (!res.ok || !json?.url) {
        toast({ title: "Checkout failed", description: json?.error ?? "Unexpected error", variant: "destructive" })
        setBusy(null)
        return
      }
      window.location.href = json.url as string
    } catch (e: any) {
      toast({ title: "Checkout failed", description: String(e?.message ?? e), variant: "destructive" })
      setBusy(null)
    } finally {
      setShowPaymentModal(false)
    }
  }

  const handleCryptoPayment = async () => {
    if (!selectedPack || !uid) return
    setBusy(selectedPack)
    try {
      const res = await fetch("/api/credits/crypto-payment", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ usd: selectedPack }),
      })
      const json = await res.json()
      if (!res.ok) {
        toast({ title: "Crypto payment failed", description: json?.error ?? "Unexpected error", variant: "destructive" })
        setBusy(null)
        return
      }
      
      // Show crypto payment modal with payment details
      setCryptoPaymentData(json.paymentData)
      setShowCryptoPaymentModal(true)
    } catch (e: any) {
      toast({ title: "Crypto payment failed", description: String(e?.message ?? e), variant: "destructive" })
      setBusy(null)
    } finally {
      setShowPaymentModal(false)
    }
  }

  return (
    <div className="min-h-screen bg-cyber-black pt-24 px-6">
      <div className="max-w-5xl mx-auto">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl md:text-4xl font-bold text-white tracking-wider">Buy Credits</h1>
            <p className="text-gray-400">$1 = 400 credits • Minimum $10 purchase</p>
            {searchParams.get('returnTo') === '/upload' && (
              <p className="text-cyber-cyan text-sm mt-2">Purchase credits to start uploading your artwork</p>
            )}
          </div>
          <Link href={searchParams.get('returnTo') || "/profile"}>
            <Button className="cyber-button">
              Back to {searchParams.get('returnTo') === '/upload' ? 'Upload' : 'Profile'}
            </Button>
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {PACKS.map(p => (
            <Card key={p.usd} className="bg-cyber-dark/60 border border-cyber-cyan/30 hover:border-cyber-cyan/60">
              <CardHeader className="flex items-center justify-between">
                <CardTitle className="text-white">${p.usd} Pack</CardTitle>
                <Badge className="bg-cyber-cyan/20 border border-cyber-cyan/40 text-cyber-cyan">{p.tag}</Badge>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="text-4xl font-extrabold text-white">{p.images}</div>
                <div className="text-sm text-gray-400">Credits included</div>
                <Button className="cyber-button w-full" onClick={() => buy(p.usd)} disabled={busy === p.usd}>
                  {busy === p.usd ? "Starting…" : `Buy for $${p.usd}`}
                </Button>
                <div className="text-xs text-gray-500">~ $0.50 per image</div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Payment Method Selection Modal */}
        {showPaymentModal && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center">
            <div 
              className="absolute inset-0 bg-black/50"
              onClick={() => setShowPaymentModal(false)}
            />
            <div className="relative bg-cyber-dark border border-cyber-cyan/30 rounded-lg shadow-xl max-w-md w-full mx-4">
              <div className="p-6">
                <h2 className="text-center text-xl font-semibold mb-6 text-white">
                  Choose Payment Method
                </h2>
              
                <div className="space-y-4 py-4">
                  <div className="text-center text-sm text-gray-400 mb-6">
                    Total Amount: ${selectedPack}
                  </div>
                  
                  <div className="space-y-3">
                    {/* Stripe Payment Option */}
                    <Button
                      onClick={handleStripePayment}
                      className="w-full h-16 flex items-center justify-center gap-3 bg-blue-600 hover:bg-blue-700 text-white"
                      disabled={busy === selectedPack}
                    >
                      <CreditCard className="h-6 w-6" />
                      <div className="text-left">
                        <div className="font-semibold">Pay with Card</div>
                        <div className="text-sm opacity-90">Visa, Mastercard, etc.</div>
                      </div>
                    </Button>

                    {/* Crypto Payment Option */}
                    <Button
                      onClick={handleCryptoPayment}
                      className="w-full h-16 flex items-center justify-center gap-3 bg-orange-600 hover:bg-orange-700 text-white"
                      disabled={busy === selectedPack}
                    >
                      {busy === selectedPack ? (
                        <Loader2 className="h-6 w-6 animate-spin" />
                      ) : (
                        <Coins className="h-6 w-6" />
                      )}
                      <div className="text-left">
                        <div className="font-semibold">Pay with Crypto</div>
                        <div className="text-sm opacity-90">USDC on Base network</div>
                      </div>
                    </Button>
                  </div>
                  
                  <div className="text-xs text-gray-500 text-center pt-2">
                    Crypto payments are processed instantly and credits are added immediately
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Crypto Payment Modal */}
        {showCryptoPaymentModal && cryptoPaymentData && (
          <CryptoPaymentModal
            isOpen={showCryptoPaymentModal}
            onClose={() => {
              setShowCryptoPaymentModal(false)
              setCryptoPaymentData(null)
              setBusy(null)
            }}
            paymentData={cryptoPaymentData}
            onPaymentComplete={async (txHash) => {
              // Complete the crypto payment and add credits
              try {
                const res = await fetch("/api/credits/crypto-payment/complete", {
                  method: "POST",
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify({ 
                    transactionId: cryptoPaymentData.transactionId,
                    txHash 
                  }),
                })
                const json = await res.json()
                if (res.ok) {
                  toast({ 
                    title: "🎉 Credits Added!", 
                    description: `You received ${cryptoPaymentData.credits?.toLocaleString()} credits!` 
                  })
                  // Redirect to profile page after successful crypto payment
                  setTimeout(() => {
                    router.push('/profile?credits=success')
                  }, 2000)
                } else {
                  toast({ 
                    title: "Payment Error", 
                    description: json?.error ?? "Failed to add credits",
                    variant: "destructive"
                  })
                }
              } catch (error) {
                toast({ 
                  title: "Payment Error", 
                  description: "Failed to complete payment",
                  variant: "destructive"
                })
              }
              setShowCryptoPaymentModal(false)
              setCryptoPaymentData(null)
              setBusy(null)
            }}
          />
        )}
      </div>
    </div>
  )
}

export default function CreditsPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-cyber-black pt-24 px-6 flex items-center justify-center">
        <div className="text-white">Loading...</div>
      </div>
    }>
      <CreditsPageContent />
    </Suspense>
  )
}
