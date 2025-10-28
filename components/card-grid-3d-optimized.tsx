'use client'

import { useState, useRef, MouseEvent, useEffect, useCallback, useMemo } from 'react'
import Image from 'next/image'
import { availableCards } from '@/lib/card-images'

interface CardGrid3DProps {
  asBackground?: boolean
  scrollProgress?: number
  onImagesLoaded?: () => void
}

export function CardGrid3D({ asBackground = false, scrollProgress = 0, onImagesLoaded }: CardGrid3DProps) {
  const [hoveredCard, setHoveredCard] = useState<number | null>(null)
  const [isSafari, setIsSafari] = useState(false)
  const [allImagesLoaded, setAllImagesLoaded] = useState(false)
  const [hasAnimatedIn, setHasAnimatedIn] = useState(false)
  const throttleRef = useRef<NodeJS.Timeout | null>(null)
  const loadedImages = useRef(new Set<number>())
  const containerRef = useRef<HTMLDivElement>(null)
  const tiltRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 })
  const [, forceUpdate] = useState({})
  
  // Create cards for 14 columns × 6 rows to fill horizontal space
  const cards = Array(84).fill(null).map((_, index) => {
    return availableCards[index % availableCards.length]
  })

  // Calculate fixed positions for cards in a grid pattern
  const getCardPosition = (index: number) => {
    const cols = 14 // More columns to fill entire width
    const cardWidth = 192 // Card width in pixels (12rem)
    const cardHeight = 269 // Card height in pixels (based on 5:7 ratio)
    const gapX = 20 // Slightly smaller gap
    const gapY = 20 // Slightly smaller gap

    const col = index % cols
    const row = Math.floor(index / cols)

    // Calculate position to fill viewport
    const totalWidth = cols * cardWidth + (cols - 1) * gapX
    const totalHeight = 6 * cardHeight + 5 * gapY // 6 rows
    // Shift left to compensate for the rotateY(-12deg) tilt
    const x = col * (cardWidth + gapX) - totalWidth / 2 - 200
    const y = row * (cardHeight + gapY) - totalHeight / 2

    return { x, y }
  }

  // Pre-calculate transform strings to avoid repetitive string concatenation
  const getCardTransform = useMemo(() => {
    const baseTransform = 'translate3d(0, 0, 0) scale(1)'
    const safariHoverTransform = 'translateY(-20px) scale(1.08)'

    return (isHovered: boolean, isSafariBrowser: boolean, tiltX: number, tiltY: number) => {
      if (!isHovered) return baseTransform
      if (isSafariBrowser) return safariHoverTransform
      // Chrome 140 fix: Apply perspective directly to avoid nested 3D context issues
      const perspectiveValue = 800 // Lower perspective for each card
      const roundedTiltX = Math.round(tiltX * 10) / 10  // Round to 1 decimal
      const roundedTiltY = Math.round(tiltY * 10) / 10
      return `perspective(${perspectiveValue}px) rotateX(${roundedTiltX}deg) rotateY(${roundedTiltY}deg) translateZ(20px) translateY(-20px) scale(1.08)`
    }
  }, [])

  useEffect(() => {
    // Detect Safari browser
    const isSafariBrowser = /^((?!chrome|android).)*safari/i.test(navigator.userAgent)
    setIsSafari(isSafariBrowser)
    
    // Mark that initial animation has played after a delay
    const animTimer = setTimeout(() => {
      setHasAnimatedIn(true)
    }, 2000) // After initial animation completes
    
    // Force Safari to re-render after a short delay
    if (isSafariBrowser) {
      const timer = setTimeout(() => {
        // Force a repaint by toggling a CSS property
        if (containerRef.current) {
          containerRef.current.style.display = 'none'
          containerRef.current.offsetHeight // Force reflow
          containerRef.current.style.display = ''
        }
      }, 100)
      
      return () => {
        clearTimeout(timer)
        clearTimeout(animTimer)
      }
    }
    
    // Cleanup throttle timeout on unmount
    return () => {
      clearTimeout(animTimer)
      if (throttleRef.current) {
        clearTimeout(throttleRef.current)
      }
    }
  }, [])

  const handleImageLoad = useCallback((index: number) => {
    loadedImages.current.add(index)
    // Check if all images are loaded
    if (loadedImages.current.size === cards.length) {
      // Small delay to ensure smooth transition
      requestAnimationFrame(() => {
        setAllImagesLoaded(true)
        // Notify parent component that images are loaded
        if (onImagesLoaded) {
          onImagesLoaded()
        }
      })
    }
  }, [cards.length, onImagesLoaded])

  const handleImageError = useCallback((index: number) => {
    // Still count errored images as "loaded" to prevent infinite waiting
    handleImageLoad(index)
  }, [handleImageLoad])
  
  const handleMouseMove = useCallback((e: MouseEvent<HTMLDivElement>) => {
    // Skip tilt calculations for Safari to avoid jitter
    if (isSafari) return

    // Throttle the mouse move events to prevent infinite loop
    if (throttleRef.current) return

    throttleRef.current = setTimeout(() => {
      throttleRef.current = null
    }, 16) // ~60fps

    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    const centerX = rect.width / 2
    const centerY = rect.height / 2

    // Calculate tilt based on cursor position (-45 to 45 degrees for more pronounced effect)
    const tiltX = ((y - centerY) / centerY) * -45
    const tiltY = ((x - centerX) / centerX) * 45

    // Store tilt in ref to avoid re-renders
    tiltRef.current = { x: tiltX, y: tiltY }
    // Only force update for the hovered card
    if (hoveredCard !== null) {
      forceUpdate({})
    }
  }, [isSafari, hoveredCard])
  
  const handleMouseLeave = () => {
    setHoveredCard(null)
    tiltRef.current = { x: 0, y: 0 }
  }
  
  if (asBackground) {
    return (
      <div
        ref={containerRef}
        className={`absolute inset-0 w-full h-full card-grid-3d-container select-none ${allImagesLoaded ? 'loaded' : ''}`}
        style={{
          zIndex: 1,
          opacity: allImagesLoaded ? 1 : 0,
          transition: 'opacity 1.5s ease-in-out',
          userSelect: 'none',
          WebkitUserSelect: 'none'
        }}
        onContextMenu={(e) => e.preventDefault()}
        onDragStart={(e) => e.preventDefault()}
      >
        {/* Background gradient overlay - no pointer events */}
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent via-70% via-cyber-black/50 to-cyber-black pointer-events-none" style={{ zIndex: 2 }} />
        
        {/* 3D perspective container - allow pointer events on cards only */}
        <div
          className="absolute inset-0 w-full h-full flex items-center justify-center overflow-hidden"
          style={{
            perspective: '1200px',
            perspectiveOrigin: '50% 50%',
            transform: 'translateZ(0)',
            // Force GPU acceleration
            willChange: 'transform',
            backfaceVisibility: 'hidden',
          }}
        >
          <div
            className="relative w-full h-full"
            style={{
              transform: 'rotateX(25deg) rotateY(-12deg) translateZ(-50px) scale(0.9)',
              // Chrome 140 fix: Use flat to break 3D context, cards will create their own
              transformStyle: 'flat',
              // Force layer creation
              willChange: 'transform',
            }}
          >
            {cards.map((_, index) => {
              // Simple vanishing effect - cards move back and up
              const vanishY = -scrollProgress * 400 // Move up as they vanish
              const vanishScale = 1 - (scrollProgress * 0.5) // Shrink as they move away
              const vanishOpacity = 1 - (scrollProgress * 0.6) // Fade as they move away

              const position = getCardPosition(index)

              return (
                <div
                  key={index}
                  className="absolute"
                  style={{
                    left: '50%',
                    top: '50%',
                    transform: `translate(${position.x}px, ${position.y + vanishY}px) scale(${vanishScale})`,
                    opacity: vanishOpacity,
                    transition: 'transform 0.6s ease-out, opacity 0.6s ease-out',
                    // Create isolated stacking context to prevent Chrome 140 jitter
                    isolation: 'isolate',
                  }}
                >
                  <div
                    className="relative group"
                    style={{
                      // Chrome 140 fix: Create own 3D context
                      transformStyle: 'preserve-3d',
                      backfaceVisibility: 'hidden',
                      // Chrome 140 fix: Explicit will-change to prevent compositor layer demotion
                      willChange: 'transform',
                      // Pre-promote to GPU layer
                      transform: 'translateZ(0)'
                    }}
                    onMouseEnter={() => setHoveredCard(index)}
                    onMouseLeave={handleMouseLeave}
                    onMouseMove={hoveredCard === index ? handleMouseMove : undefined}
                  >
                    {/* Card container with hover transform and tilt */}
                    <div
                      className="relative"
                      style={{
                        transform: getCardTransform(hoveredCard === index, isSafari, tiltRef.current.x, tiltRef.current.y),
                        // Chrome 140 fix: Use flat to prevent nested preserve-3d issues
                        transformStyle: 'flat',
                        // Chrome 140 fix: Explicit will-change on hover to maintain GPU acceleration
                        willChange: hoveredCard === index ? 'transform' : 'auto',
                        transition: hoveredCard === index
                          ? 'transform 0.5s ease-out'
                          : 'transform 1s ease-in-out',
                        // Fix transform origin for stability
                        transformOrigin: '50% 50% 0'
                      }}
                    >
                    {/* Card glow effect on hover - positioned to not affect layout */}
                    <div
                      className={`absolute bg-gradient-to-r from-purple-600/40 to-cyan-600/40 rounded-lg blur-lg pointer-events-none ${
                        hoveredCard === index ? 'opacity-100' : 'opacity-0'
                      }`}
                      style={{
                        top: '-8px',
                        left: '-8px',
                        right: '-8px',
                        bottom: '-8px',
                        zIndex: -1,
                        transition: hoveredCard === index
                          ? 'opacity 0.5s ease-out'
                          : 'opacity 1s ease-in-out'
                      }}
                    />
                    
                    {/* Card container with fixed 5:7 aspect ratio */}
                    <div
                      className={`relative w-32 h-[179px] md:w-40 md:h-[224px] lg:w-48 lg:h-[269px] ${
                        hoveredCard === index ? 'brightness-110' : 'brightness-[0.15]'
                      }`}
                      style={{
                        background: hoveredCard === index 
                          ? 'linear-gradient(135deg, rgba(139, 92, 246, 0.3), rgba(34, 211, 238, 0.3))' 
                          : 'linear-gradient(135deg, rgba(139, 92, 246, 0.1), rgba(34, 211, 238, 0.1))',
                        borderRadius: '8px',
                        padding: '2px',
                        transition: hoveredCard === index
                          ? 'filter 0.5s ease-out, background 0.5s ease-out'
                          : 'filter 1s ease-in-out, background 1s ease-in-out'
                      }}
                    >
                      <div className="bg-gray-900 rounded-lg overflow-hidden w-full h-full relative">
                        {/* Holographic overlay on hover */}
                        <div 
                          className={`absolute inset-0 bg-gradient-to-br from-transparent via-purple-600/10 to-cyan-600/10 pointer-events-none z-10 ${
                            hoveredCard === index ? 'opacity-100' : 'opacity-0'
                          }`}
                          style={{
                            transition: hoveredCard === index
                              ? 'opacity 0.5s ease-out'
                              : 'opacity 1s ease-in-out'
                          }}
                        />
                        
                        {/* Card image with 5:7 aspect ratio */}
                        <Image
                          src={cards[index]}
                          alt={`Card ${index + 1}`}
                          fill
                          className="object-fill will-change-transform select-none pointer-events-none"
                          priority={index < 20}
                          sizes="(max-width: 768px) 128px, (max-width: 1024px) 160px, 192px"
                          loading={isSafari || index < 20 ? "eager" : "lazy"}
                          quality={90}
                          draggable={false}
                          onLoad={() => handleImageLoad(index)}
                          onError={() => handleImageError(index)}
                        />
                      </div>
                    </div>
                  </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    )
  }
  
  // Non-background implementation remains the same as original
  return null
}