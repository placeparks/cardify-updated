"use client"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Sparkles, Shield, ArrowRight, Globe, Brain, Printer, Upload, Store, Gem, Layers, Coins } from "lucide-react"
import Link from "next/link"
import { Navigation } from "@/components/navigation"
import { LimitedEditionModalWithSuspense } from "@/components/LazyComponents"
import { CardGrid3D } from "@/components/card-grid-3d-optimized"
import { CardGrid3DMobileOptimized } from "@/components/card-grid-3d-mobile-optimized"
import { useState, useEffect, useCallback, useRef } from "react"
import { MouseEvent } from "react" 

export default function HomePage() {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [spotlightPos, setSpotlightPos] = useState({ x: 50, y: 50 })
  const [isMobile, setIsMobile] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [scrollProgress, setScrollProgress] = useState(0)
  const [cardsLoaded, setCardsLoaded] = useState(false)
  const throttleRef = useRef<NodeJS.Timeout | null>(null)
  const scrollThrottleRef = useRef<NodeJS.Timeout | null>(null)
  const targetScrollRef = useRef(0)
  const animationFrameRef = useRef<number | null>(null)

  const handleModalClose = () => {
    setIsModalOpen(false)
  }
  
  const handleOpenModal = () => {
    setIsModalOpen(true)
  }


  const handleMouseMove = useCallback((e: MouseEvent<HTMLElement>) => {
    // Throttle the mouse move events to prevent infinite loop
    if (throttleRef.current) return
    
    throttleRef.current = setTimeout(() => {
      throttleRef.current = null
    }, 16) // ~60fps
    
    // Get the text container element
    const textContainer = e.currentTarget.querySelector('.hero-text-container') as HTMLElement
    if (!textContainer) return
    
    const rect = textContainer.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    setSpotlightPos({ x, y })
  }, [])

  const handleScroll = useCallback(() => {
    // Update target scroll position immediately (no throttling here)
    const scrollY = window.scrollY
    const heroHeight = window.innerHeight
    targetScrollRef.current = Math.min(Math.max(scrollY / heroHeight, 0), 1)
  }, [])

  const animateScroll = useCallback(() => {
    // Lerp (smooth interpolation) between current and target scroll
    // Lower values = more momentum/lag (0.05-0.1 recommended)
    const lerpFactor = 0.1
    
    setScrollProgress(prevProgress => {
      const diff = targetScrollRef.current - prevProgress
      
      // If difference is very small, snap to target to prevent infinite animation
      if (Math.abs(diff) < 0.001) {
        return targetScrollRef.current
      }
      
      // Smooth interpolation
      return prevProgress + diff * lerpFactor
    })
    
    // Continue animation
    animationFrameRef.current = requestAnimationFrame(animateScroll)
  }, [])

  useEffect(() => {
    // Set mobile state and mounted state immediately
    setIsMobile(window.innerWidth < 768)
    setMounted(true)
    
    // Check if mobile device - only based on screen size, not touch capability
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768)
    }
    
    window.addEventListener('resize', checkMobile)
    window.addEventListener('scroll', handleScroll)
    
    // Start the smooth scroll animation loop
    animationFrameRef.current = requestAnimationFrame(animateScroll)
    
    // Check URL params on mount
    const params = new URLSearchParams(window.location.search)
    if (params.get('openLimitedEdition') === 'true') {
      handleOpenModal()
      // Clean up URL without reload
      window.history.replaceState({}, '', window.location.pathname)
    }
    
    // Listen for custom event from cart
    const handleCustomEvent = () => {
      handleOpenModal()
    }
    
    window.addEventListener('openLimitedEditionModal', handleCustomEvent)
    
    return () => {
      window.removeEventListener('resize', checkMobile)
      window.removeEventListener('scroll', handleScroll)
      window.removeEventListener('openLimitedEditionModal', handleCustomEvent)
      // Cleanup animation frame
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
      // Cleanup throttle timeouts
      if (throttleRef.current) {
        clearTimeout(throttleRef.current)
      }
      if (scrollThrottleRef.current) {
        clearTimeout(scrollThrottleRef.current)
      }
    }
  }, [handleScroll, animateScroll])

  return (
    <div className="min-h-screen bg-cyber-black relative overflow-x-hidden font-mono">
      <Navigation />

      {/* Limited Edition Modal */}
      <LimitedEditionModalWithSuspense isOpen={isModalOpen} onClose={handleModalClose} />

      {/* Animated Grid Background - Hidden when 3D cards are shown */}
      {/* <div className="absolute inset-0 cyber-grid opacity-20" /> */}

      {/* Scanlines Effect - Hidden when 3D cards are shown */}
      {/* <div className="absolute inset-0 scanlines opacity-30" /> */}

      {/* Hero Section */}
      <section
        className="relative px-6 py-20 pt-28 md:pt-40 fade-in select-none"
        onMouseMove={!isMobile ? handleMouseMove : undefined}
        onContextMenu={(e) => e.preventDefault()}
        onDragStart={(e) => e.preventDefault()}
        style={{ userSelect: 'none', WebkitUserSelect: 'none' }}
      >
        {/* 3D Card Grid Background - Only render after mount to prevent hydration mismatch */}
        {mounted && (isMobile ?
          <CardGrid3DMobileOptimized asBackground scrollProgress={scrollProgress} /> :
          <CardGrid3D asBackground scrollProgress={scrollProgress} onImagesLoaded={() => {
            // Wait for fade-in animation to complete (1.5s) before enabling mask
            setTimeout(() => setCardsLoaded(true), 1500)
          }} />
        )}

        <div className="relative max-w-6xl mx-auto text-center pointer-events-none hero-text-container" style={{ zIndex: 10 }}>
          <div
            style={mounted && !isMobile && cardsLoaded ? { 
              WebkitMaskImage: `radial-gradient(circle 400px at ${spotlightPos.x}px ${spotlightPos.y}px, transparent 0%, transparent 25%, black 100%)`,
              maskImage: `radial-gradient(circle 400px at ${spotlightPos.x}px ${spotlightPos.y}px, transparent 0%, transparent 25%, black 100%)`,
              WebkitMaskSize: '100% 100%',
              maskSize: '100% 100%',
              WebkitMaskRepeat: 'no-repeat',
              maskRepeat: 'no-repeat',
              transition: 'mask-position 0.1s ease-out, -webkit-mask-position 0.1s ease-out'
            } : {}}
          >
            <h1 className="text-[2.75rem] md:text-8xl font-bold mb-6 leading-tight tracking-wider">
              <span className="text-white">Create Epic</span>
              <br />
              <span className="holographic glitch" data-text="Trading Cards">
                Trading Cards
              </span>
            </h1>

            <p className="text-lg md:text-xl text-gray-300 mb-8 md:mb-12 max-w-3xl mx-auto leading-relaxed">
              Professional trading card designs made simple. <span className="neon-green">Create with AI, upload your art, 
              sell to collectors, and print what you love.</span>
            </p>
          </div>

          <div className="flex flex-col gap-6 justify-center items-center">
            <Link href="/generate" className="pointer-events-auto relative z-10">
              <Button
                size="lg"
                className="hero-cyber-button px-6 md:px-12 py-8 text-xl md:text-2xl font-bold tracking-wider hero-button-glow"
              >
                <Sparkles className="w-6 h-6 md:w-7 md:h-7 mr-3" />
                Generate Card
                <ArrowRight className="w-6 h-6 md:w-7 md:h-7 ml-3" />
              </Button>
            </Link>

            {/* Divider */}
            <div className="w-32 h-px bg-gradient-to-r from-transparent via-cyber-cyan/30 to-transparent"></div>

            {/* Limited Edition Link - Secondary placement */}
            <div className="text-center">
              <button
                onClick={handleOpenModal}
                className="inline-flex items-center gap-2 text-sm text-cyber-purple hover:text-cyber-pink transition-colors duration-300 group pointer-events-auto relative z-10"
              >
                <Gem className="w-4 h-4 group-hover:animate-pulse" />
                <span className="underline underline-offset-4 decoration-dotted">Limited Edition KOL Card</span>
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* What You Can Do - 3 Panel Section */}
      <section className="px-6 py-16 relative">
        <div className="max-w-6xl mx-auto">
          <div className="grid md:grid-cols-3 gap-6">
            {/* Panel 1: Buy Credits */}
            <Link href="/credits" className="block group">
              <Card className="bg-cyber-dark/80 backdrop-blur-sm border-2 border-cyber-orange/40 hover:border-cyber-orange hover:shadow-lg hover:shadow-cyber-orange/30 transition-all duration-300 h-full">
                <CardContent className="p-6 flex flex-col items-center text-center">
                  <div className="w-12 h-12 bg-cyber-orange/20 rounded-lg flex items-center justify-center mb-4 group-hover:bg-cyber-orange/30 transition-colors">
                    <Coins className="w-6 h-6 text-cyber-orange" />
                  </div>
                  <h3 className="text-lg font-bold text-cyber-orange mb-2 tracking-wider panel-text-glow-orange">Buy Credits</h3>
                  <p className="text-gray-400 text-sm leading-relaxed">
                    Pay with USDC or Stripe. Use credits for AI generation and more.
                  </p>
                </CardContent>
              </Card>
            </Link>

            {/* Panel 2: Upload Designs */}
            <Link href="/upload" className="block group">
              <Card className="bg-cyber-dark/80 backdrop-blur-sm border-2 border-cyber-green/40 hover:border-cyber-green hover:shadow-lg hover:shadow-cyber-green/30 transition-all duration-300 h-full">
                <CardContent className="p-6 flex flex-col items-center text-center">
                  <div className="w-12 h-12 bg-cyber-green/20 rounded-lg flex items-center justify-center mb-4 group-hover:bg-cyber-green/30 transition-colors">
                    <Upload className="w-6 h-6 text-cyber-green" />
                  </div>
                  <h3 className="text-lg font-bold text-cyber-green mb-2 tracking-wider panel-text-glow-green">Upload Designs</h3>
                  <p className="text-gray-400 text-sm leading-relaxed">
                    Create your profile and upload custom card designs to sell.
                  </p>
                </CardContent>
              </Card>
            </Link>

            {/* Panel 3: Browse Marketplace */}
            <Link href="/marketplace" className="block group">
              <Card className="bg-cyber-dark/80 backdrop-blur-sm border-2 border-cyber-pink/40 hover:border-cyber-pink hover:shadow-lg hover:shadow-cyber-pink/30 transition-all duration-300 h-full">
                <CardContent className="p-6 flex flex-col items-center text-center">
                  <div className="w-12 h-12 bg-cyber-pink/20 rounded-lg flex items-center justify-center mb-4 group-hover:bg-cyber-pink/30 transition-colors">
                    <Store className="w-6 h-6 text-cyber-pink" />
                  </div>
                  <h3 className="text-lg font-bold text-cyber-pink mb-2 tracking-wider panel-text-glow-pink">Browse Marketplace</h3>
                  <p className="text-gray-400 text-sm leading-relaxed">
                    Discover unique cards from creators around the world.
                  </p>
                </CardContent>
              </Card>
            </Link>
          </div>
        </div>
      </section>

      {/* Cyberpunk Divider */}
      <div className="px-6 py-8">
        <div className="max-w-6xl mx-auto">
          <div className="relative h-px">
            {/* Gradient line */}
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-cyber-cyan/40 to-transparent"></div>
            {/* Glow effect */}
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-cyber-pink/30 to-transparent blur-sm"></div>
          </div>
        </div>
      </div>

      {/* Features Section */}
      <section className="px-6 py-16 relative fade-in">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-[2.75rem] md:text-5xl font-bold text-white mb-4 tracking-wider">
              <span className="neon-cyan">Powerful</span> Features
            </h2>
            <p className="text-lg md:text-xl text-gray-400 max-w-2xl mx-auto">
              Everything you need to transform your designs into professional trading cards
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            <Link href="/generate" className="block h-full">
              <Card className="bg-cyber-dark/60 backdrop-blur-sm border border-cyber-cyan/30 hover:border-cyber-cyan hover:shadow-lg hover:shadow-cyber-cyan/20 transition-all duration-500 group hover:-translate-y-2 cursor-pointer h-full">
                <CardContent className="p-8">
                  <div className="w-16 h-16 bg-cyber-cyan/20 rounded-lg flex items-center justify-center mb-6 group-hover:bg-cyber-cyan/30 transition-colors">
                    <Brain className="w-8 h-8 text-cyber-cyan" />
                  </div>
                  <h3 className="text-xl font-bold text-cyber-cyan mb-4 tracking-wider panel-text-glow-cyan">AI-Powered Generation</h3>
                  <p className="text-gray-300 leading-relaxed text-sm">
                    Generate stunning trading card artwork with our AI engine optimized for TCG aesthetics. Create
                    unique, professional designs with character consistency and perfect card composition.
                  </p>
                </CardContent>
              </Card>
            </Link>

            <Link href="/marketplace" className="block h-full">
              <Card className="bg-cyber-dark/60 backdrop-blur-sm border border-cyber-pink/30 hover:border-cyber-pink hover:shadow-lg hover:shadow-cyber-pink/20 transition-all duration-500 group hover:-translate-y-2 cursor-pointer h-full">
                <CardContent className="p-8">
                  <div className="w-16 h-16 bg-cyber-pink/20 rounded-lg flex items-center justify-center mb-6 group-hover:bg-cyber-pink/30 transition-colors">
                    <Store className="w-8 h-8 text-cyber-pink" />
                  </div>
                  <h3 className="text-xl font-bold text-cyber-pink mb-4 tracking-wider panel-text-glow-pink">Sell Your Cards</h3>
                  <p className="text-gray-300 leading-relaxed text-sm">
                    We provide printing and shipping fulfillment for your designs. Simply "list for sale" in your profile and we will professionally print, finish and ship your designs WORLDWIDE and you earn 23% from every order, paid in cash or credits.
                  </p>
                </CardContent>
              </Card>
            </Link>

            <Link href="/upload" className="block h-full">
              <Card className="bg-cyber-dark/60 backdrop-blur-sm border border-cyber-green/30 hover:border-cyber-green hover:shadow-lg hover:shadow-cyber-green/20 transition-all duration-500 group hover:-translate-y-2 cursor-pointer h-full">
                <CardContent className="p-8">
                  <div className="w-16 h-16 bg-cyber-green/20 rounded-lg flex items-center justify-center mb-6 group-hover:bg-cyber-green/30 transition-colors">
                    <Upload className="w-8 h-8 text-cyber-green" />
                  </div>
                  <h3 className="text-xl font-bold text-cyber-green mb-4 tracking-wider panel-text-glow-green">Upload & Print</h3>
                  <p className="text-gray-300 leading-relaxed text-sm">
                    Already have artwork? Simply upload your designs and we'll transform them into beautiful physical cards.
                    Support for all major image formats with instant preview.
                  </p>
                </CardContent>
              </Card>
            </Link>

            <Card className="bg-cyber-dark/60 backdrop-blur-sm border border-cyber-purple/30 hover:border-cyber-purple hover:shadow-lg hover:shadow-cyber-purple/20 transition-all duration-500 group hover:-translate-y-2">
              <CardContent className="p-8">
                <div className="w-16 h-16 bg-cyber-purple/20 rounded-lg flex items-center justify-center mb-6 group-hover:bg-cyber-purple/30 transition-colors">
                  <Printer className="w-8 h-8 text-cyber-purple" />
                </div>
                <h3 className="text-xl font-bold text-cyber-purple mb-4 tracking-wider">Professional Quality</h3>
                <p className="text-gray-300 leading-relaxed text-sm">
                  Premium card stock with multiple foil options including holographic, rainbow, and metallic finishes.
                  Professional printing that rivals major trading card companies.
                </p>
              </CardContent>
            </Card>

            <Card className="bg-cyber-dark/60 backdrop-blur-sm border border-cyber-blue/30 hover:border-cyber-blue hover:shadow-lg hover:shadow-cyber-blue/20 transition-all duration-500 group hover:-translate-y-2">
              <CardContent className="p-8">
                <div className="w-16 h-16 bg-cyber-blue/20 rounded-lg flex items-center justify-center mb-6 group-hover:bg-cyber-blue/30 transition-colors">
                  <Globe className="w-8 h-8 text-cyber-blue" />
                </div>
                <h3 className="text-xl font-bold text-cyber-blue mb-4 tracking-wider">Worldwide Delivery</h3>
                <p className="text-gray-300 leading-relaxed text-sm">
                  We ship to any country supported by our payment system. Secure packaging, tracking included, 
                  and reliable international delivery for your precious cards.
                </p>
              </CardContent>
            </Card>

            <Card className="bg-cyber-dark/60 backdrop-blur-sm border border-cyber-orange/30 hover:border-cyber-orange hover:shadow-lg hover:shadow-cyber-orange/20 transition-all duration-500 group hover:-translate-y-2">
              <CardContent className="p-8">
                <div className="w-16 h-16 bg-cyber-orange/20 rounded-lg flex items-center justify-center mb-6 group-hover:bg-cyber-orange/30 transition-colors">
                  <Layers className="w-8 h-8 text-cyber-orange" />
                </div>
                <h3 className="text-xl font-bold text-cyber-orange mb-4 tracking-wider">Order More, Save More</h3>
                <p className="text-gray-300 leading-relaxed text-sm">
                  Get better prices when you order multiple cards. Perfect for collectors building sets, 
                  artists creating collections, or anyone wanting to share their cards with friends.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="px-6 py-20 relative fade-in">
        <div className="absolute inset-0 bg-gradient-to-r from-cyber-cyan/5 via-cyber-pink/5 to-cyber-purple/5" />
        <div className="max-w-4xl mx-auto text-center relative">
          <Card className="bg-cyber-dark/80 backdrop-blur-sm border border-cyber-cyan/50 neon-glow-cyan">
            <CardContent className="p-8 sm:p-12">
              <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4 tracking-wider pointer-events-none">
                <span className="holographic">Ready to Create?</span>
              </h2>
              <p className="text-lg sm:text-xl text-gray-300 mb-8 max-w-md mx-auto pointer-events-none">
                From idea to printed card in minutes.{" "}
                <span className="neon-green">AI-powered or bring your own designs.</span>
              </p>
              <div className="flex flex-col gap-4 justify-center max-w-2xl mx-auto">
                <Link href="/generate" className="w-full pointer-events-auto">
                  <Button
                    size="lg"
                    className="cyber-button w-full px-8 sm:px-12 py-4 sm:py-6 text-lg sm:text-xl font-bold tracking-wider"
                  >
                    <Sparkles className="w-5 h-5 sm:w-6 sm:h-6 mr-3" />
                    AI Generate
                    <ArrowRight className="w-5 h-5 sm:w-6 sm:h-6 ml-3" />
                  </Button>
                </Link>
                <Link href="/upload" className="w-full pointer-events-auto">
                  <Button
                    size="lg"
                    className="bg-black/90 border-2 border-cyber-pink text-cyber-pink
                               hover:bg-gray-900 hover:shadow-lg hover:shadow-cyber-pink/20
                               w-full px-8 sm:px-12 py-4 sm:py-6 text-lg sm:text-xl
                               font-bold tracking-wider transition-all duration-300"
                  >
                    <Upload className="w-5 h-5 sm:w-6 sm:h-6 mr-3" />
                    Upload
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

    </div>
  )
}
