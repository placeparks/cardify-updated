"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { StripeStyledShippingForm, type ShippingAddress } from "./stripe-styled-shipping-form"
import { ArrowLeft, X } from "lucide-react"
import { csrfFetch } from "@/lib/csrf-client"
import { calculateDiscountedPrice } from "@/lib/pricing-utils"

import type { CartItem } from "@/lib/cart-context"

interface CartCheckoutModalProps {
  cartItems: CartItem[]
  subtotal: number
  onBack: () => void
  onSuccess: () => void
  onClose?: () => void
}

export function CartCheckoutModal({ cartItems, subtotal, onBack, onSuccess, onClose }: CartCheckoutModalProps) {
  const [isProcessing, setIsProcessing] = useState(false)

  const handleSubmit = async (address: ShippingAddress, paymentMethod: 'stripe' | 'crypto') => {
    setIsProcessing(true)
    
    try {
      // Build line items from cart with dynamic pricing
      const lineItems = cartItems.flatMap((item) => {
        // Add card finish price to base price if applicable
        let effectiveBasePrice = (item as any).basePricePerUnit || (item as any).pricePerUnit

        if ((item.type === 'custom-card' || item.type === 'marketplace') && 'cardFinish' in item) {
          const cardFinishPrice = ((item as any).cardFinish === 'rainbow' || (item as any).cardFinish === 'gloss') ? 4.00 : 0
          effectiveBasePrice = effectiveBasePrice + cardFinishPrice
        }

        // Calculate the discounted price based on quantity
        const pricing = calculateDiscountedPrice(
          item.type,
          item.quantity,
          effectiveBasePrice
        )
        
        const cardItem = {
          productId: item.type === 'limited-edition' ? 'limited-edition-card' : 'custom-card',
          quantity: item.quantity,
          pricePerUnit: pricing.pricePerUnit,
          name: item.name,
          image: item.image,
          ...(item.type === 'custom-card' && {
            cardFinish: item.cardFinish,
            customImageUrl: item.image,
            uploadId: item.uploadId
          })
        }
        
        const items = [cardItem]
        
        if (item.includeDisplayCase && item.displayCaseQuantity > 0) {
          items.push({
            productId: 'display-case',
            quantity: item.displayCaseQuantity,
            pricePerUnit: item.displayCasePricePerUnit || 19.00,
            name: 'Acrylic Display Case',
            image: '/display-case.jpg'
          })
        }
        
        return items
      })

      // Handle crypto payment differently if selected - COMMENTED OUT FOR NOW
      /*
      if (paymentMethod === 'crypto') {
        // For now, crypto payment for cart is not implemented
        alert('Crypto payment for cart checkout is coming soon!')
        setIsProcessing(false)
        return
      }
      */

      const response = await csrfFetch('/api/create-checkout-session', {
        method: 'POST',
        body: JSON.stringify({
          cartItems: lineItems,
          isCartCheckout: true,
          shippingAddress: address
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to create checkout session')
      }

      const data = await response.json()
      
      // Call success callback to clear cart
      onSuccess()
      
      // Redirect to Stripe Checkout
      if (data.url) {
        window.location.href = data.url
      } else {
        throw new Error('No checkout URL received')
      }
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to start checkout')
      setIsProcessing(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[100] stripe-styled-form-wrapper"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          if (onClose) {
            onClose()
          } else {
            onBack()
          }
        }
      }}
    >
      <div className="relative h-full flex items-start sm:items-center justify-center p-4"
        onClick={(e) => {
          if (e.target === e.currentTarget) {
            if (onClose) {
              onClose()
            } else {
              onBack()
            }
          }
        }}
      >
        <div className="w-full max-w-2xl py-4 sm:py-8">
          <div className="relative bg-white rounded-lg shadow-xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={onClose || onBack}
              className="absolute top-4 right-4 z-10 p-2 rounded-full bg-white shadow-lg hover:shadow-xl transition-shadow"
              aria-label="Close"
            >
              <X className="w-5 h-5 text-gray-500 hover:text-gray-700" />
            </button>
            <StripeStyledShippingForm
              onSubmit={handleSubmit}
              onBack={onBack}
              isSubmitting={isProcessing}
              subtotal={subtotal}
              orderType="cart"
              orderDetails={{
                cartItems: cartItems
              }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
