"use client"

import { useState, useCallback, useEffect, useRef } from "react"
import Image from "next/image"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { CategorySelector, CardCategory } from "@/components/category-selector"
import { CheckCircle, XCircle, AlertTriangle, HelpCircle, Wand2, Loader2, X } from "lucide-react"

type UIAsset = {
  id: string
  user_id: string
  file_path: string
  file_name: string
  file_size: number | null
  mime_type: string | null
  uploaded_at: string | null
  public_url: string
  asset_type: string | null
  isGenerated: boolean
}

interface SellCardModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  asset: UIAsset | null
  fixedPriceUSD: number
  placeholder: string
  onCreateListing: (data: {
    asset: UIAsset
    name: string
    categories: CardCategory[]
  }) => Promise<void>
}

function getCleanGenerationTitle(title: string | null | undefined): string {
  if (!title) return 'AI Generated'
  if (title.length > 50) {
    return title.substring(0, 50) + '...'
  }
  return title
}

function isDefaultListingName(
  candidate: string,
  asset?: { file_name?: string; title?: string },
  bannedNames: string[] = [],
): boolean {
  const trimmed = candidate.trim()

  /* 1  Too short / empty */
  if (trimmed.length < 3) return true

  /* 2  All digits ("12345") */
  if (/^\d+$/.test(trimmed)) return true

  /* 3  Only special chars ("!!!") */
  if (/^[^a-zA-Z0-9\s]+$/.test(trimmed)) return true

  const lower = trimmed.toLowerCase()

  /* 4  Generic disallowed names ("image", "untitled" …) */
  if (bannedNames.map((s) => s.toLowerCase()).includes(lower)) return true

  if (asset) {
    /* filename without extension, e.g. "img_1234" */
    const fileStem = asset.file_name?.split(".")[0].toLowerCase() ?? ""
    const dbTitle = asset.title?.trim().toLowerCase() ?? ""

    /* 5  Exactly matches filename or DB title */
    if (lower === fileStem || lower === dbTitle) return true

    /* 6  Very similar to the filename (simple containment test) */
    if (fileStem && (lower.includes(fileStem) || fileStem.includes(lower))) {
      return true
    }
  }

  return false // 🎉 customised enough
}

export function SellCardModal({
  open,
  onOpenChange,
  asset,
  fixedPriceUSD,
  placeholder,
  onCreateListing,
}: SellCardModalProps) {
  const [listingName, setListingName] = useState<string>("")
  const [selectedCategories, setSelectedCategories] = useState<CardCategory[]>([])
  const [creating, setCreating] = useState(false)
  const [nameValidation, setNameValidation] = useState<{
    isValid: boolean
    message: string
    isChecking: boolean
  }>({
    isValid: false,
    message: '',
    isChecking: false
  })

  // State for smooth closing animation
  const [isClosing, setIsClosing] = useState(false)
  const [isVisible, setIsVisible] = useState(false)

  const modalRef = useRef<HTMLDivElement>(null)

  // Handle smooth open/close transitions
  useEffect(() => {
    if (open) {
      setIsVisible(true)
      setIsClosing(false)
    } else if (isVisible) {
      setIsClosing(true)
      const timer = setTimeout(() => {
        setIsVisible(false)
        setIsClosing(false)
      }, 300) // Match animation duration
      return () => clearTimeout(timer)
    }
  }, [open, isVisible])

  const validateListingName = useCallback((name: string) => {
    const trimmed = name.trim()

    if (trimmed.length === 0) {
      setNameValidation({
        isValid: false,
        message: 'Card name is required',
        isChecking: false
      })
      return
    }

    if (trimmed.length < 3) {
      setNameValidation({
        isValid: false,
        message: `Need ${3 - trimmed.length} more character${3 - trimmed.length > 1 ? 's' : ''} (${trimmed.length}/3 min)`,
        isChecking: false
      })
      return
    }

    if (trimmed.length > 60) {
      setNameValidation({
        isValid: false,
        message: 'Max 60 characters exceeded',
        isChecking: false
      })
      return
    }

    if (isDefaultListingName(trimmed, asset || undefined)) {
      setNameValidation({
        isValid: false,
        message: 'Name is too generic - make it unique!',
        isChecking: false
      })
      return
    }

    setNameValidation({
      isValid: true,
      message: 'Perfect! Ready to list',
      isChecking: false
    })
  }, [asset])

  // Reset state when modal opens with new asset
  useEffect(() => {
    if (open && asset) {
      setListingName("")
      setSelectedCategories([])
      setCreating(false)
      validateListingName("")
    }
  }, [open, asset, validateListingName])

  const handleCreateListing = async () => {
    if (!asset || !nameValidation.isValid || creating) return

    setCreating(true)
    try {
      await onCreateListing({
        asset,
        name: listingName.trim(),
        categories: selectedCategories
      })
      // Reset state after successful listing
      setListingName("")
      setSelectedCategories([])
      setNameValidation({ isValid: false, message: '', isChecking: false })
    } finally {
      setCreating(false)
    }
  }

  const handleClose = () => {
    onOpenChange(false)
    setListingName("")
    setSelectedCategories([])
    setNameValidation({ isValid: false, message: '', isChecking: false })
  }

  const handleModalClick = (e: React.MouseEvent) => {
    e.stopPropagation()
  }

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      handleClose()
    }
  }

  // Keyboard escape handling
  useEffect(() => {
    if (!open) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleClose()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [open])

  // Don't render if modal is not visible
  if (!isVisible) return null

  return (
    <div
      className={`fixed inset-0 z-[100] font-mono transition-all duration-300 ${
        isClosing ? 'opacity-0' : 'opacity-100'
      }`}
      ref={modalRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      {/* Overlay Background - Dismissible */}
      <div
        className={`absolute inset-0 bg-cyber-black/80 backdrop-blur-sm transition-opacity duration-300 ${
          isClosing ? 'opacity-0' : 'opacity-100'
        }`}
        onClick={handleOverlayClick}
      />

      {/* Animated Grid Background */}
      <div className="absolute inset-0 cyber-grid opacity-10 pointer-events-none" />

      {/* Modal Content - Smart responsive centering with scrollability */}
      <div
        className="relative h-full flex items-start sm:items-center justify-center overflow-y-auto"
        onClick={handleOverlayClick}
      >
        <div className={`w-full max-w-md px-4 py-4 sm:py-8 my-auto transition-all duration-300 transform ${
          isClosing ? 'scale-95 opacity-0' : 'scale-100 opacity-100'
        }`}>
          <Card
            className="w-full bg-cyber-dark/95 backdrop-blur-sm border-2 border-cyber-cyan/50 text-white overflow-hidden relative"
            onClick={handleModalClick}
          >
            {/* Close Button */}
            <button
              onClick={(e) => {
                e.stopPropagation()
                handleClose()
              }}
              className="absolute top-3 right-3 sm:top-4 sm:right-4 z-10 p-1.5 sm:p-2 rounded-md border border-cyber-cyan/50 bg-cyber-dark/80 backdrop-blur-sm
                         text-cyber-cyan hover:bg-cyber-cyan/10 hover:border-cyber-cyan hover:shadow-lg hover:shadow-cyber-cyan/20
                         transition-all duration-200 group"
              aria-label="Close modal"
            >
              <X className="w-4 h-4 sm:w-5 sm:h-5 group-hover:rotate-90 transition-transform duration-300" />
            </button>

            <CardContent className="p-6">
              {/* Header */}
              <div className="mb-6">
                <h2 id="modal-title" className="text-xl font-bold text-white">List for Sale</h2>
              </div>

              {/* Card Image Preview */}
              {asset && (
                <div className="flex justify-center mb-5">
                  <div className="relative w-48 h-[16.8rem] rounded-lg overflow-hidden border-2 border-cyber-cyan/50 bg-gradient-to-br from-cyber-dark/40 to-cyber-dark/80">
                    <Image
                      src={asset.public_url || placeholder}
                      alt={getCleanGenerationTitle(asset.file_name)}
                      fill
                      className="object-cover"
                      sizes="192px"
                      onError={(e) => ((e.currentTarget as HTMLImageElement).src = placeholder)}
                    />
                  </div>
                </div>
              )}

              {/* Enhanced Editable Name Field */}
              <div className="mb-5">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-semibold text-cyber-cyan flex items-center gap-2">
                    <span>Card Name<span className="text-[#ff0055]">*</span></span>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button className="text-gray-400 hover:text-cyber-cyan transition-colors">
                            <HelpCircle className="h-4 w-4" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent className="bg-cyber-dark/95 border-2 border-cyber-cyan/50 text-white max-w-xs">
                          <div className="space-y-2 p-2">
                            <p className="font-semibold text-cyber-cyan text-sm">Good Examples:</p>
                            <ul className="text-xs space-y-1 text-gray-300">
                              <li>• Cyber Dragon Warrior #42</li>
                              <li>• Neon Samurai Master</li>
                              <li>• Quantum Phoenix Rising</li>
                              <li>• Digital Guardian Elite</li>
                            </ul>
                            <p className="text-xs text-gray-400 pt-2 border-t border-cyber-cyan/30">
                              Make it unique and descriptive!
                            </p>
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </label>

                  {/* Character Counter */}
                  <span className={`text-xs font-mono ${
                    listingName.length > 60
                      ? 'text-[#ff0055]'
                      : listingName.length > 50
                      ? 'text-cyber-orange'
                      : 'text-gray-500'
                  }`}>
                    {listingName.length}/60
                  </span>
                </div>

                <div className="relative">
                  <Input
                    value={listingName}
                    onChange={(e) => {
                      const newName = e.target.value
                      setListingName(newName)
                      validateListingName(newName)
                    }}
                    onBlur={() => {
                      validateListingName(listingName)
                    }}
                    placeholder="Epic Dragon Warrior #1"
                    className={`bg-cyber-dark/60 text-white placeholder-gray-500 pr-10 transition-all ${
                      nameValidation.isValid
                        ? 'border-cyber-green focus:border-cyber-green shadow-[0_0_10px_rgba(34,211,238,0.2)]'
                        : nameValidation.message
                        ? 'border-[#ff0055] focus:border-[#ff0055] shadow-[0_0_20px_rgba(255,0,85,0.5)]'
                        : 'border-cyber-cyan/30 focus:border-cyber-cyan'
                    }`}
                    maxLength={60}
                    autoFocus
                  />

                  {/* Validation Indicator */}
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    {nameValidation.isValid ? (
                      <CheckCircle
                        className="h-5 w-5 text-cyber-green"
                        style={{
                          filter: 'drop-shadow(0 0 8px rgb(34 211 238 / 0.8)) drop-shadow(0 0 12px rgb(34 211 238 / 0.5))',
                          animation: 'icon-pulse 2s ease-in-out infinite'
                        }}
                      />
                    ) : nameValidation.message ? (
                      <XCircle className="h-5 w-5 text-[#ff0055] animate-pulse" style={{ filter: 'drop-shadow(0 0 10px rgb(255 0 85 / 0.9))' }} />
                    ) : (
                      <Wand2 className="h-5 w-5 text-gray-500" />
                    )}
                  </div>
                </div>

                {/* Validation Message - Always Show */}
                <div className={`flex items-center gap-2 mt-2 text-xs transition-all ${
                  nameValidation.isValid
                    ? 'text-cyber-green'
                    : nameValidation.message
                    ? 'text-[#ff0055]'
                    : 'text-gray-400'
                }`}>
                  {nameValidation.isValid ? (
                    <>
                      <CheckCircle className="h-3 w-3" />
                      <span className="font-semibold">{nameValidation.message}</span>
                    </>
                  ) : nameValidation.message ? (
                    <>
                      <AlertTriangle className="h-3 w-3 animate-pulse" style={{ filter: 'drop-shadow(0 0 6px rgb(255 0 85 / 0.8))' }} />
                      <span className="font-medium" style={{ textShadow: '0 0 10px rgba(255, 0, 85, 0.5)' }}>{nameValidation.message}</span>
                    </>
                  ) : (
                    <span className="text-gray-500">This name will appear in the marketplace</span>
                  )}
                </div>
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
              <div className="flex items-center justify-between p-3 bg-cyber-cyan/10 border border-cyber-cyan/30 rounded-lg mb-6">
                <span className="text-sm text-gray-300">Price</span>
                <span className="text-lg font-bold text-cyber-cyan">${fixedPriceUSD}.00</span>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={handleClose}
                  className="flex-1 bg-transparent border-2 border-cyber-pink/50 text-cyber-pink hover:bg-cyber-pink/10 hover:border-cyber-pink hover:text-cyber-pink transition-all"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleCreateListing}
                  disabled={creating || !nameValidation.isValid}
                  className={`flex-1 cyber-button transition-all ${
                    nameValidation.isValid && !creating
                      ? 'hover:shadow-[0_0_20px_rgba(34,211,238,0.5)]'
                      : ''
                  }`}
                >
                  {creating ? (
                    <span className="flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Listing…
                    </span>
                  ) : (
                    "List Card"
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
