"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Search, Mail, Package, ShoppingCart, ArrowLeft, Sparkles, CreditCard, Calendar, Hash } from "lucide-react"
import Link from "next/link"
import Image from "next/image"
import { toast } from "sonner"
import dynamic from "next/dynamic"

// Lazy load the checkout modal for better performance
const CustomCardCheckoutModal = dynamic(() =>
  import("@/components/custom-card-checkout-modal").then(mod => ({ default: mod.CustomCardCheckoutModal })), {
  ssr: false,
  loading: () => null,
})

interface CustomCardOrder {
  id: string
  image_url: string
  card_finish: string
  quantity: number
  created_at: string
  stripe_session_id: string
}

export default function RecoverPage() {
  const [email, setEmail] = useState("")
  const [loading, setLoading] = useState(false)
  const [orders, setOrders] = useState<CustomCardOrder[]>([])
  const [searched, setSearched] = useState(false)
  const [error, setError] = useState("")

  // Modal state for reordering
  const [checkoutModalOpen, setCheckoutModalOpen] = useState(false)
  const [selectedOrderImage, setSelectedOrderImage] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setLoading(true)
    setSearched(false)

    try {
      const response = await fetch("/api/recover-orders", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email: email.toLowerCase().trim() }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "Failed to fetch orders")
      }

      const data = await response.json()
      setOrders(data.orders || [])
      setSearched(true)

      if (data.orders && data.orders.length > 0) {
        toast.success(`Found ${data.orders.length} order${data.orders.length > 1 ? 's' : ''}!`)
      }
    } catch (err: any) {
      console.error("Error fetching orders:", err)
      setError(err.message || "Something went wrong. Please try again.")
      toast.error(err.message || "Failed to fetch orders")
    } finally {
      setLoading(false)
    }
  }

  const handleReorder = (order: CustomCardOrder) => {
    // Open the checkout modal with the selected image
    setSelectedOrderImage(order.image_url)
    setCheckoutModalOpen(true)
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
  }

  const getFinishLabel = (finish: string) => {
    switch (finish) {
      case 'rainbow':
        return 'Holographic Rainbow'
      case 'gloss':
        return 'High Gloss'
      case 'matte':
      default:
        return 'Matte'
    }
  }

  return (
    <div className="min-h-screen bg-cyber-black relative overflow-hidden font-mono">
      {/* Animated Grid Background */}
      <div className="absolute inset-0 cyber-grid opacity-20" />

      {/* Scanlines Effect */}
      <div className="absolute inset-0 scanlines opacity-30" />

      {/* Glowing orbs background */}
      <div className="absolute top-20 left-10 w-64 h-64 bg-cyber-green rounded-full blur-3xl opacity-10 animate-glow-green" />
      <div className="absolute top-40 right-20 w-48 h-48 bg-cyber-pink rounded-full blur-3xl opacity-8 animate-glow-pink" />
      <div className="absolute bottom-20 left-1/3 w-80 h-80 bg-cyber-cyan rounded-full blur-3xl opacity-6 animate-glow-cyan" />

      <div className="relative flex flex-col min-h-screen">
        {/* Header */}
        <div className="px-6 py-8">
          <Link href="/" className="inline-flex items-center text-cyber-cyan hover:text-cyber-pink transition-colors">
            <ArrowLeft className="w-5 h-5 mr-2" />
            Back to Home
          </Link>
        </div>

        <div className="flex-1 px-6 pb-20">
          <div className="max-w-6xl mx-auto">
            {/* Page Title */}
            <div className="text-center mb-12">
              <h1 className="text-4xl md:text-5xl font-bold mb-4 leading-tight tracking-wider">
                <span className="holographic glitch" data-text="Recover Your Cards">
                  Recover Your Cards
                </span>
              </h1>
              <p className="text-xl text-gray-300 mb-2">
                Enter your email to view and reorder your custom card designs
              </p>
            </div>

            {/* Email Form */}
            <Card className="bg-cyber-dark/80 backdrop-blur-sm border border-cyber-cyan/50 neon-glow-cyan max-w-md mx-auto mb-12">
              <CardContent className="p-8">
                <form onSubmit={handleSubmit} className="space-y-6">
                  <div className="space-y-2">
                    <Label htmlFor="email" className="text-cyber-cyan text-sm tracking-wider">
                      Email Address
                    </Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                      <Input
                        id="email"
                        type="email"
                        placeholder="Enter your email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                        disabled={loading}
                        className="pl-10 bg-cyber-dark/50 border-cyber-cyan/30 text-white placeholder:text-gray-500 focus:border-cyber-pink focus:ring-cyber-pink/20"
                      />
                    </div>
                  </div>

                  {error && (
                    <div className="bg-cyber-red/10 border border-cyber-red/30 rounded-lg p-3">
                      <p className="text-cyber-red text-sm">{error}</p>
                    </div>
                  )}

                  <Button
                    type="submit"
                    disabled={loading || !email}
                    className="w-full cyber-button font-bold tracking-wider"
                  >
                    {loading ? (
                      <>
                        <Sparkles className="w-5 h-5 mr-2 animate-spin" />
                        Searching...
                      </>
                    ) : (
                      <>
                        <Search className="w-5 h-5 mr-2" />
                        Find My Orders
                      </>
                    )}
                  </Button>
                </form>
              </CardContent>
            </Card>

            {/* Results Section */}
            {searched && (
              <div>
                {orders.length === 0 ? (
                  <Card className="bg-cyber-dark/80 backdrop-blur-sm border border-cyber-orange/50 neon-glow-orange max-w-md mx-auto">
                    <CardContent className="p-8 text-center">
                      <Package className="w-16 h-16 text-cyber-orange mx-auto mb-4" />
                      <h2 className="text-xl font-bold text-cyber-orange mb-2 tracking-wider">
                        No Orders Found
                      </h2>
                      <p className="text-gray-300 mb-4">
                        We couldn't find any orders associated with {email}
                      </p>
                      <p className="text-sm text-gray-400">
                        Make sure you're using the same email address you used during checkout.
                      </p>
                    </CardContent>
                  </Card>
                ) : (
                  <>
                    <h2 className="text-2xl font-bold text-cyber-cyan mb-6 tracking-wider text-center">
                      Found {orders.length} Order{orders.length > 1 ? 's' : ''}
                    </h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                      {orders.map((order) => (
                        <Card
                          key={order.id}
                          className="bg-cyber-dark/80 backdrop-blur-sm border border-cyber-pink/50 hover:border-cyber-pink hover:shadow-lg hover:shadow-cyber-pink/20 transition-all duration-300"
                        >
                          <CardContent className="p-6">
                            {/* Card Image */}
                            <div className="relative aspect-square mb-4 rounded-lg overflow-hidden bg-cyber-dark/50">
                              <Image
                                src={order.image_url}
                                alt="Your custom card"
                                fill
                                className="object-cover"
                                sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                              />
                              <div className="absolute top-2 right-2">
                                <span className="px-2 py-1 bg-cyber-dark/80 backdrop-blur-sm rounded text-xs text-cyber-cyan font-bold">
                                  {getFinishLabel(order.card_finish)}
                                </span>
                              </div>
                            </div>

                            {/* Order Details */}
                            <div className="space-y-3 mb-4">
                              <div className="flex items-center justify-between">
                                <span className="text-gray-400 flex items-center">
                                  <Calendar className="w-4 h-4 mr-1" />
                                  Date:
                                </span>
                                <span className="text-white text-sm">
                                  {formatDate(order.created_at)}
                                </span>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-gray-400 flex items-center">
                                  <CreditCard className="w-4 h-4 mr-1" />
                                  Quantity:
                                </span>
                                <span className="text-white font-bold">
                                  {order.quantity} card{order.quantity > 1 ? 's' : ''}
                                </span>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-gray-400 flex items-center">
                                  <Hash className="w-4 h-4 mr-1" />
                                  Order:
                                </span>
                                <span className="text-gray-500 text-xs font-mono">
                                  ...{order.stripe_session_id.slice(-8)}
                                </span>
                              </div>
                            </div>

                            {/* Reorder Button */}
                            <Button
                              onClick={() => handleReorder(order)}
                              className="w-full bg-cyber-dark/80 border-2 border-cyber-pink text-cyber-pink hover:bg-cyber-pink/10 hover:shadow-lg hover:shadow-cyber-pink/20 font-bold tracking-wider transition-all duration-300"
                            >
                              <ShoppingCart className="w-4 h-4 mr-2" />
                              Reorder This Card
                            </Button>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Info Section */}
            {!searched && (
              <div className="max-w-2xl mx-auto mt-12">
                <Card className="bg-cyber-dark/80 backdrop-blur-sm border border-gray-700">
                  <CardContent className="p-8">
                    <h3 className="text-lg font-bold text-cyber-cyan mb-4 tracking-wider">
                      How It Works
                    </h3>
                    <div className="space-y-4 text-gray-300">
                      <div className="flex items-start gap-3">
                        <div className="w-6 h-6 bg-cyber-cyan/20 rounded-full flex items-center justify-center mt-0.5">
                          <span className="text-cyber-cyan text-xs font-bold">1</span>
                        </div>
                        <p>Enter the email address you used when purchasing your custom cards</p>
                      </div>
                      <div className="flex items-start gap-3">
                        <div className="w-6 h-6 bg-cyber-cyan/20 rounded-full flex items-center justify-center mt-0.5">
                          <span className="text-cyber-cyan text-xs font-bold">2</span>
                        </div>
                        <p>We'll show you all your previous custom card designs</p>
                      </div>
                      <div className="flex items-start gap-3">
                        <div className="w-6 h-6 bg-cyber-cyan/20 rounded-full flex items-center justify-center mt-0.5">
                          <span className="text-cyber-cyan text-xs font-bold">3</span>
                        </div>
                        <p>Click "Reorder" to purchase the same design again</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Checkout Modal for Reordering */}
      <CustomCardCheckoutModal
        isOpen={checkoutModalOpen}
        onClose={() => {
          setCheckoutModalOpen(false)
          setSelectedOrderImage(null)
        }}
        uploadedImage={selectedOrderImage}
        uploadedImageUrl={selectedOrderImage}
      />
    </div>
  )
}