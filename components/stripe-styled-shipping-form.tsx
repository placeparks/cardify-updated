"use client"

import React, { useState, useMemo, useEffect } from "react"
import { ArrowLeft, Check, Wallet, Loader2, Coins } from "lucide-react"
import { allCountries } from "country-region-data"
import { usePrivy } from '@privy-io/react-auth'
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { parseUnits } from 'viem'
import { useToast } from '@/hooks/use-toast'
import { WalletButton } from '@/components/WalletConnect'

/** ---------- Shipping countries list (unchanged) ---------- */
const SHIPPING_COUNTRIES = [
  { code: 'US', name: 'United States' },
  { code: 'CA', name: 'Canada' },
  { code: 'MX', name: 'Mexico' },
  { code: 'GB', name: 'United Kingdom' },
  { code: 'DE', name: 'Germany' },
  { code: 'FR', name: 'France' },
  { code: 'IT', name: 'Italy' },
  { code: 'ES', name: 'Spain' },
  { code: 'NL', name: 'Netherlands' },
  { code: 'BE', name: 'Belgium' },
  { code: 'AT', name: 'Austria' },
  { code: 'CH', name: 'Switzerland' },
  { code: 'SE', name: 'Sweden' },
  { code: 'NO', name: 'Norway' },
  { code: 'DK', name: 'Denmark' },
  { code: 'FI', name: 'Finland' },
  { code: 'IE', name: 'Ireland' },
  { code: 'PT', name: 'Portugal' },
  { code: 'PL', name: 'Poland' },
  { code: 'CZ', name: 'Czech Republic' },
  { code: 'HU', name: 'Hungary' },
  { code: 'RO', name: 'Romania' },
  { code: 'BG', name: 'Bulgaria' },
  { code: 'HR', name: 'Croatia' },
  { code: 'SI', name: 'Slovenia' },
  { code: 'SK', name: 'Slovakia' },
  { code: 'LT', name: 'Lithuania' },
  { code: 'LV', name: 'Latvia' },
  { code: 'EE', name: 'Estonia' },
  { code: 'GR', name: 'Greece' },
  { code: 'CY', name: 'Cyprus' },
  { code: 'MT', name: 'Malta' },
  { code: 'LU', name: 'Luxembourg' },
  { code: 'AU', name: 'Australia' },
  { code: 'NZ', name: 'New Zealand' },
  { code: 'JP', name: 'Japan' },
  { code: 'SG', name: 'Singapore' },
  { code: 'HK', name: 'Hong Kong' },
  { code: 'KR', name: 'South Korea' },
  { code: 'TW', name: 'Taiwan' },
  { code: 'MY', name: 'Malaysia' },
  { code: 'TH', name: 'Thailand' },
  { code: 'PH', name: 'Philippines' },
  { code: 'ID', name: 'Indonesia' },
  { code: 'VN', name: 'Vietnam' },
  { code: 'IN', name: 'India' },
  { code: 'AE', name: 'United Arab Emirates' },
  { code: 'SA', name: 'Saudi Arabia' },
  { code: 'IL', name: 'Israel' },
  { code: 'TR', name: 'Turkey' },
  { code: 'ZA', name: 'South Africa' },
  { code: 'BR', name: 'Brazil' },
  { code: 'AR', name: 'Argentina' },
  { code: 'CL', name: 'Chile' },
  { code: 'PE', name: 'Peru' },
  { code: 'CO', name: 'Colombia' },
].sort((a, b) => a.name.localeCompare(b.name))

export interface ShippingAddress {
  email: string
  name: string
  line1: string
  line2?: string
  city: string
  state: string
  postal_code: string
  country: string
}

interface StripeStyledShippingFormProps {
  onSubmit: (address: ShippingAddress, paymentMethod: 'stripe' | 'crypto') => void
  onBack: () => void
  isSubmitting?: boolean
  subtotal?: number
  orderType?: 'custom-card' | 'limited-edition' | 'marketplace' | 'cart'
  orderDetails?: {
    customImageUrl?: string
    cardFinish?: string
    includeDisplayCase?: boolean
    displayCaseQuantity?: number
    listingId?: string
    cartItems?: any[]
  }
}

export function StripeStyledShippingForm({ onSubmit, onBack, isSubmitting = false, subtotal, orderType, orderDetails }: StripeStyledShippingFormProps) {
  const [formData, setFormData] = useState<ShippingAddress>({
    email: '',
    name: '',
    line1: '',
    line2: '',
    city: '',
    state: '',
    postal_code: '',
    country: 'US',
  })
  const [errors, setErrors] = useState<Partial<Record<keyof ShippingAddress, string>>>({})
  const [keepUpdated, setKeepUpdated] = useState(false)
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<'stripe' | 'crypto' | null>('stripe') // Default to Stripe

  // Crypto state
  const [cryptoPaymentData, setCryptoPaymentData] = useState<any>(null)
  const [isProcessingCrypto, setIsProcessingCrypto] = useState(false)
  const [cryptoPaymentStatus, setCryptoPaymentStatus] = useState<'pending' | 'processing' | 'submitted' | 'complete' | 'failed'>('pending')
  const [txHash, setTxHash] = useState<`0x${string}` | undefined>(undefined)

  // USDC quote state
  const [quotedUsdc, setQuotedUsdc] = useState<string>('0.000000')
  const [quotedUsd, setQuotedUsd] = useState<number>(0)

  // Wallet
  const { ready } = usePrivy()
  const { address, isConnected } = useAccount()
  const { toast } = useToast()

  const { data: sendHash, isPending: isSendPending, writeContract, error: txError } = useWriteContract()
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({ hash: sendHash })

  useEffect(() => {
    if (isConfirmed && cryptoPaymentData && sendHash) {
      setTxHash(sendHash)
      setCryptoPaymentStatus('complete')
      // Mark complete in DB
      updatePaymentStatus(cryptoPaymentData.transactionId, 'complete', sendHash)
      toast({ title: "Payment Complete", description: "Your crypto payment has been confirmed!" })
    }
  }, [isConfirmed, cryptoPaymentData, sendHash, toast])

  useEffect(() => {
    if (txError && cryptoPaymentData) {
      setCryptoPaymentStatus('failed')
      updatePaymentStatus(cryptoPaymentData.transactionId, 'failed')
      toast({ title: "Transaction Failed", description: txError.message || "Failed to send transaction", variant: "destructive" })
    }
  }, [txError, cryptoPaymentData, toast])

  // Get regions for selected country
  const regions = useMemo(() => {
    if (!formData.country) return []
    if (Array.isArray(allCountries)) {
      const firstItem = allCountries[0]
      if (Array.isArray(firstItem)) {
        const countryData = allCountries.find((c: [string, string, Array<[string, string]>]) => c[1] === formData.country)
        if (countryData && countryData[2]) {
          return countryData[2].map((region: [string, string]) => ({ name: region[0], shortCode: region[1] }))
        }
      } else {
        // @ts-ignore
        const countryData = allCountries.find((c: any) => c.countryShortCode === formData.country) as any
        return countryData?.regions || []
      }
    }
    return []
  }, [formData.country])

  const handleInputChange = (field: keyof ShippingAddress, value: string) => {
    setFormData(prev => {
      const updated = { ...prev, [field]: value }
      if (field === 'country' && value !== prev.country) updated.state = ''
      return updated
    })
    if (errors[field]) setErrors(prev => ({ ...prev, [field]: undefined }))
  }

  const validateForm = (): boolean => {
    const newErrors: Partial<Record<keyof ShippingAddress, string>> = {}
    if (!formData.email.trim()) newErrors.email = 'Email is required'
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) newErrors.email = 'Please enter a valid email'
    if (!formData.name.trim()) newErrors.name = 'Full name is required'
    if (!formData.line1.trim()) newErrors.line1 = 'Address is required'
    if (!formData.city.trim()) newErrors.city = 'City is required'
    if (regions.length > 0 && !formData.state.trim()) newErrors.state = 'State/Province is required'
    if (!formData.postal_code.trim()) newErrors.postal_code = 'Postal/ZIP code is required'
    if (!formData.country) newErrors.country = 'Country is required'
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const getShippingPrice = () => {
    if (!formData.country) return null
    if (formData.country === 'US') return 4.99
    if (formData.country === 'CA') return 11.99
    return 16.99
  }

  const shippingPrice = getShippingPrice()
  const total = subtotal !== undefined && shippingPrice !== null ? subtotal + (shippingPrice || 0) : shippingPrice

  /** Quote USDC - 1:1 with USD */
  const quoteUsdc = async (usdCents: number) => {
    const usd = usdCents / 100
    setQuotedUsd(usd)
    setQuotedUsdc(usd.toFixed(6)) // USDC has 6 decimals, 1 USDC = 1 USD
  }

  // Backend status updater
  const updatePaymentStatus = async (transactionId: string, status: string, transactionHash?: string) => {
    try {
      const res = await fetch('/api/crypto-payment/status', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transactionId,
          status,
          transactionHash,
          ...(status === 'complete' && { confirmedAt: new Date().toISOString() })
        }),
      })
      if (!res.ok) throw new Error('Failed to update payment status')
    } catch (err) {
      console.error('Failed to update payment status:', err)
    }
  }

  // Create payment → then quote ETH once
  const handleCreateAndSendPayment = async () => {
    setIsProcessingCrypto(true)
    try {
      const response = await fetch('/api/crypto-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shippingAddress: formData,
          orderItems:
            orderType === 'custom-card' ? 'Custom Card' :
            orderType === 'limited-edition' ? 'Limited Edition Card' :
            orderType === 'marketplace' ? 'Marketplace Card' : 'Cart Items',
          ...(orderType === 'custom-card' && orderDetails && {
            customImageUrl: orderDetails.customImageUrl,
            cardFinish: orderDetails.cardFinish,
            includeDisplayCase: orderDetails.includeDisplayCase,
            displayCaseQuantity: orderDetails.displayCaseQuantity,
          }),
          ...(orderType === 'marketplace' && orderDetails && { listingId: orderDetails.listingId }),
          ...(orderType === 'cart' && orderDetails && { cartItems: orderDetails.cartItems }),
        }),
      })
      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to create crypto payment')
      }
      const data = await response.json()
      setCryptoPaymentData(data)
      setCryptoPaymentStatus('pending')

      // Quote USDC (1:1 with USD)
      await quoteUsdc(data.amount)
    } catch (error) {
      console.error('Crypto payment creation failed:', error)
      setCryptoPaymentStatus('failed')
      toast({ title: "Payment Failed", description: error instanceof Error ? error.message : "Failed to create payment", variant: "destructive" })
    } finally {
      setIsProcessingCrypto(false)
    }
  }

  const createCryptoPayment = async () => {
    if (!validateForm()) {
      toast({ title: "Form Validation Error", description: "Please fill in all required fields", variant: "destructive" })
      return
    }
    if (isConnected && !cryptoPaymentData) {
      await handleCreateAndSendPayment()
    } else if (!isConnected) {
      toast({ title: "Wallet Not Connected", description: "Please connect your wallet first", variant: "destructive" })
    }
  }

  const handleSendCryptoPayment = async () => {
    if (!cryptoPaymentData) return
    if (!isConnected) {
      toast({ title: "Wallet Not Connected", description: "Please connect your wallet first", variant: "destructive" })
      return
    }

    setIsProcessingCrypto(true)
    setCryptoPaymentStatus('processing')

    try {
      // USDC transfer function call
      await writeContract({
        address: cryptoPaymentData.usdcContractAddress as `0x${string}`,
        abi: [
          {
            name: 'transfer',
            type: 'function',
            stateMutability: 'nonpayable',
            inputs: [
              { name: 'to', type: 'address' },
              { name: 'amount', type: 'uint256' }
            ],
            outputs: [{ name: '', type: 'bool' }]
          }
        ],
        functionName: 'transfer',
        args: [
          cryptoPaymentData.receivingAddress as `0x${string}`,
          parseUnits(quotedUsdc, 6) // USDC has 6 decimals
        ]
      })
      setCryptoPaymentStatus('submitted')
      toast({ title: "Transaction Sent", description: "Submitted to the network. Waiting for confirmation..." })
    } catch (error) {
      console.error('Payment error:', error)
      setCryptoPaymentStatus('failed')
      await updatePaymentStatus(cryptoPaymentData.transactionId, 'failed')
      toast({ title: "Payment Failed", description: error instanceof Error ? error.message : "Failed to send payment", variant: "destructive" })
    } finally {
      setIsProcessingCrypto(false)
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedPaymentMethod) {
      alert('Please select a payment method')
      return
    }
    // Crypto payment logic commented out - Stripe only for now
    /*
    if (selectedPaymentMethod === 'crypto') {
      if (cryptoPaymentData && isConnected) {
        handleSendCryptoPayment()
      } else {
        createCryptoPayment()
      }
      return
    }
    */
    if (validateForm()) onSubmit(formData, selectedPaymentMethod)
  }

  useEffect(() => {
    console.log('🔍 Wallet state:', { isConnected, address, hasPaymentData: !!cryptoPaymentData })
  }, [isConnected, address, cryptoPaymentData])


  return (
    <div className="p-6 stripe-styled-form-container">
      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=Pridi:wght@300;400;500;600&display=swap');
        
        /* Override global cyberpunk scrollbar styles for Stripe-styled forms */
        .stripe-styled-form-wrapper ::-webkit-scrollbar,
        .stripe-styled-form-wrapper::-webkit-scrollbar {
          width: 8px;
          height: 8px;
        }
        
        .stripe-styled-form-wrapper ::-webkit-scrollbar-track,
        .stripe-styled-form-wrapper::-webkit-scrollbar-track {
          background: transparent;
        }
        
        .stripe-styled-form-wrapper ::-webkit-scrollbar-thumb,
        .stripe-styled-form-wrapper::-webkit-scrollbar-thumb {
          background: rgba(0, 0, 0, 0.2);
          border-radius: 4px;
        }
        
        .stripe-styled-form-wrapper ::-webkit-scrollbar-thumb:hover,
        .stripe-styled-form-wrapper::-webkit-scrollbar-thumb:hover {
          background: rgba(0, 0, 0, 0.3);
        }
        
        /* Firefox scrollbar override */
        .stripe-styled-form-wrapper,
        .stripe-styled-form-wrapper * {
          scrollbar-width: thin;
          scrollbar-color: rgba(0, 0, 0, 0.2) transparent;
        }
        
        .stripe-checkout-form {
          font-family: 'Pridi', serif;
          color: #1a1f36;
          font-weight: 400;
        }
        
        .stripe-section-title {
          font-size: 20px;
          font-weight: 500;
          color: #1a1f36;
          margin-bottom: 20px;
          font-family: 'Pridi', serif;
        }
        
        .stripe-label {
          display: block;
          font-size: 14px;
          font-weight: 400;
          color: #697386;
          margin-bottom: 6px;
          font-family: 'Pridi', serif;
        }
        
        .stripe-input {
          width: 100%;
          padding: 10px 12px;
          font-size: 16px;
          font-family: 'Pridi', serif;
          font-weight: 400;
          line-height: 1.5;
          border: 1px solid #e0e6ed;
          border-radius: 6px;
          background-color: white;
          color: #1a1f36;
          transition: border-color 0.15s ease, box-shadow 0.15s ease;
          -webkit-appearance: none;
        }
        
        .stripe-input:focus {
          outline: none;
          border-color: #3bffff;
          box-shadow: 0 0 0 1px #3bffff;
        }
        
        .stripe-input::placeholder {
          color: #8898aa;
          opacity: 1;
        }
        
        .stripe-input.error {
          border-color: #ed5f74;
        }
        
        .stripe-input.error:focus {
          box-shadow: 0 0 0 1px #ed5f74;
        }
        
        .stripe-input:disabled {
          background-color: #f6f9fc;
          color: #8898aa;
          cursor: not-allowed;
        }
        
        .stripe-error {
          color: #ed5f74;
          font-size: 13px;
          margin-top: 4px;
          font-family: 'Pridi', serif;
        }
        
        .stripe-select {
          width: 100%;
          padding: 10px 12px;
          padding-right: 32px;
          font-size: 16px;
          font-family: 'Pridi', serif;
          font-weight: 400;
          line-height: 1.5;
          border: 1px solid #e0e6ed;
          border-radius: 6px;
          background-color: white;
          color: #1a1f36;
          cursor: pointer;
          background-image: url("data:image/svg+xml,%3Csvg width='10' height='6' viewBox='0 0 10 6' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1L5 5L9 1' stroke='%236b7c93' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
          background-repeat: no-repeat;
          background-position: right 12px center;
          background-size: 10px;
          -webkit-appearance: none;
          -moz-appearance: none;
          appearance: none;
          transition: border-color 0.15s ease, box-shadow 0.15s ease;
        }
        
        .stripe-select:focus {
          outline: none;
          border-color: #3bffff;
          box-shadow: 0 0 0 1px #3bffff;
        }
        
        .stripe-select.error {
          border-color: #ed5f74;
        }
        
        .stripe-select.error:focus {
          box-shadow: 0 0 0 1px #ed5f74;
        }
        
        .stripe-select:disabled {
          background-color: #f6f9fc;
          color: #8898aa;
          cursor: not-allowed;
        }
        
        .stripe-checkbox-container {
          display: flex;
          align-items: flex-start;
          margin: 20px 0;
          cursor: pointer;
        }
        
        .stripe-checkbox {
          position: relative;
          width: 16px;
          height: 16px;
          margin-right: 12px;
          margin-top: 2px;
          flex-shrink: 0;
        }
        
        .stripe-checkbox input {
          position: absolute;
          opacity: 0;
          cursor: pointer;
          height: 0;
          width: 0;
        }
        
        .stripe-checkbox-visual {
          position: absolute;
          top: 0;
          left: 0;
          height: 16px;
          width: 16px;
          background-color: white;
          border: 1px solid #d1d9e0;
          border-radius: 3px;
          transition: all 0.15s ease;
        }
        
        .stripe-checkbox input:checked ~ .stripe-checkbox-visual {
          background-color: #3bffff;
          border-color: #3bffff;
        }
        
        .stripe-checkbox-visual:after {
          content: "";
          position: absolute;
          display: none;
          left: 5px;
          top: 2px;
          width: 5px;
          height: 9px;
          border: solid white;
          border-width: 0 2px 2px 0;
          transform: rotate(45deg);
        }
        
        .stripe-checkbox input:checked ~ .stripe-checkbox-visual:after {
          display: block;
        }
        
        .stripe-checkbox-label {
          font-size: 14px;
          color: #697386;
          line-height: 1.4;
          font-family: 'Pridi', serif;
        }
        
        .stripe-checkbox-label a {
          color: #3bffff;
          text-decoration: underline;
        }
        
        .stripe-button {
          width: 100%;
          padding: 12px 20px;
          font-size: 16px;
          font-weight: 500;
          font-family: 'Pridi', serif;
          border-radius: 6px;
          border: none;
          cursor: pointer;
          transition: all 0.15s ease;
          text-decoration: none;
          display: inline-flex;
          align-items: center;
          justify-content: center;
        }
        
        .stripe-button-primary {
          background: #3bffff;
          color: #1a1f36;
        }
        
        .stripe-button-primary:hover:not(:disabled) {
          background: #2ee5e5;
          transform: translateY(-1px);
          box-shadow: 0 7px 14px rgba(50, 50, 93, 0.1), 0 3px 6px rgba(0, 0, 0, 0.08);
        }
        
        .stripe-button-secondary {
          background: white;
          color: #697386;
          border: 1px solid #e0e6ed;
        }
        
        .stripe-button-secondary:hover:not(:disabled) {
          color: #32325d;
          border-color: #c9d3e0;
          background: #f6f9fc;
        }
        
        .stripe-button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        
        .stripe-summary-box {
          background: #f6f9fc;
          border-radius: 8px;
          padding: 16px;
          margin: 20px 0;
        }
        
        .stripe-summary-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 8px;
          font-family: 'Pridi', serif;
        }
        
        .stripe-summary-row:last-child {
          margin-bottom: 0;
          padding-top: 8px;
          border-top: 1px solid #e0e6ed;
          font-weight: 500;
        }
        
        .stripe-summary-label {
          color: #697386;
          font-size: 14px;
        }
        
        .stripe-summary-value {
          color: #1a1f36;
          font-size: 14px;
          font-weight: 500;
        }
        
        .stripe-divider {
          height: 1px;
          background: #e0e6ed;
          margin: 24px 0;
        }

        /* Radio button styles */
        .stripe-radio-container {
          display: block;
          position: relative;
          cursor: pointer;
          user-select: none;
        }

        .stripe-radio-input {
          position: absolute;
          opacity: 0;
          cursor: pointer;
        }

        .stripe-radio-content {
          display: flex;
          align-items: center;
          padding: 16px;
          border: 1px solid #e0e6ed;
          border-radius: 8px;
          background: white;
          transition: all 0.15s ease;
        }

        .stripe-radio-container:hover .stripe-radio-content {
          border-color: #c9d3e0;
          background: #fafbfc;
        }

        .stripe-radio-input:checked ~ .stripe-radio-content {
          border-color: #3bffff;
          background: #f0fffe;
          box-shadow: 0 0 0 1px #3bffff;
        }

        .stripe-radio-input:disabled ~ .stripe-radio-content {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .stripe-radio-visual {
          position: relative;
          width: 20px;
          height: 20px;
          border: 2px solid #d1d9e0;
          border-radius: 50%;
          margin-right: 16px;
          flex-shrink: 0;
          transition: all 0.15s ease;
        }

        .stripe-radio-input:checked ~ .stripe-radio-content .stripe-radio-visual {
          border-color: #3bffff;
        }

        .stripe-radio-visual:after {
          content: "";
          position: absolute;
          display: none;
          width: 10px;
          height: 10px;
          border-radius: 50%;
          background: #3bffff;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
        }

        .stripe-radio-input:checked ~ .stripe-radio-content .stripe-radio-visual:after {
          display: block;
        }

        .stripe-payment-option-content {
          display: flex;
          align-items: center;
          gap: 12px;
          flex: 1;
        }

        .stripe-payment-icon-container {
          width: 40px;
          height: 40px;
          background: #f6f9fc;
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }

        .stripe-radio-input:checked ~ .stripe-radio-content .stripe-payment-icon-container {
          background: rgba(59, 255, 255, 0.15);
        }

        .stripe-payment-icon {
          width: 24px;
          height: 24px;
          color: #697386;
        }

        .stripe-radio-input:checked ~ .stripe-radio-content .stripe-payment-icon {
          color: #3bffff;
        }

        .stripe-payment-details {
          flex: 1;
        }

        .stripe-payment-label {
          font-size: 15px;
          font-weight: 500;
          color: #1a1f36;
          margin-bottom: 2px;
          font-family: 'Pridi', serif;
        }

        .stripe-payment-description {
          font-size: 13px;
          color: #697386;
          font-family: 'Pridi', serif;
        }

        /* Crypto Payment Section Styles */
        .stripe-crypto-payment-section {
          margin-top: 0;
        }

        .stripe-section-subtitle {
          font-size: 16px;
          font-weight: 500;
          color: #1a1f36;
          margin-bottom: 4px;
          font-family: 'Pridi', serif;
        }

        .stripe-crypto-connect-container {
          text-align: left;
          padding: 0;
        }

        .stripe-crypto-subheading {
          font-size: 14px;
          color: #697386;
          font-family: 'Pridi', serif;
          line-height: 1.5;
          margin: 0;
        }

        .stripe-crypto-details {
          background: #f6f9fc;
          border-radius: 8px;
          padding: 16px;
        }

        .stripe-crypto-detail-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 12px;
        }

        .stripe-crypto-detail-row:last-of-type {
          margin-bottom: 16px;
        }

        .stripe-crypto-detail-value {
          font-size: 14px;
          color: #1a1f36;
          font-family: 'Pridi', serif;
          font-weight: 500;
        }

        .stripe-crypto-amount {
          font-family: monospace;
          font-weight: 600;
          color: #3bffff;
        }

        .stripe-crypto-note {
          font-size: 12px;
          color: #697386;
          text-align: center;
          font-family: 'Pridi', serif;
          margin-top: 12px;
        }

        .stripe-wallet-status {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 12px 16px;
          border-radius: 8px;
          transition: all 0.15s ease;
        }

        .stripe-wallet-connected {
          background: #f0fffe;
          border: 1px solid #3bffff;
        }

        .stripe-status-indicator {
          width: 8px;
          height: 8px;
          background: #3bffff;
          border-radius: 50%;
          animation: pulse 2s infinite;
        }

        @keyframes pulse {
          0% {
            opacity: 1;
          }
          50% {
            opacity: 0.5;
          }
          100% {
            opacity: 1;
          }
        }

        .stripe-status-text {
          font-size: 14px;
          font-weight: 500;
          color: #1a1f36;
          font-family: 'Pridi', serif;
        }

        .stripe-wallet-address {
          font-family: monospace;
          font-size: 12px;
          color: #697386;
        }

        .stripe-payment-status {
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 12px 16px;
          border-radius: 8px;
          font-family: 'Pridi', serif;
        }

        .stripe-status-processing {
          background: #f0f4ff;
          border: 1px solid #635bff;
          color: #635bff;
        }

        .stripe-status-success {
          background: #f0fff4;
          border: 1px solid #00d924;
          color: #00a41a;
        }

        .stripe-status-error {
          background: #fff0f0;
          border: 1px solid #ed5f74;
          color: #cd3d56;
        }

        .stripe-transaction-hash {
          background: #f6f9fc;
          border-radius: 8px;
          padding: 16px;
        }

        .stripe-hash-value {
          font-family: monospace;
          font-size: 12px;
          color: #697386;
          word-break: break-all;
        }

        /* Override WalletButton styles */
        .stripe-wallet-button-wrapper button {
          width: auto !important;
          padding: 12px 20px !important;
          font-size: 16px !important;
          font-weight: 500 !important;
          font-family: 'Pridi', serif !important;
          border-radius: 6px !important;
          background: #3bffff !important;
          color: #1a1f36 !important;
          border: none !important;
          transition: all 0.15s ease !important;
          height: auto !important;
          line-height: normal !important;
          cursor: pointer !important;
        }

        .stripe-wallet-button-wrapper button:hover:not(:disabled) {
          background: #2ee5e5 !important;
          transform: translateY(-1px) !important;
          box-shadow: 0 7px 14px rgba(50, 50, 93, 0.1), 0 3px 6px rgba(0, 0, 0, 0.08) !important;
        }

        .stripe-wallet-button-wrapper button:focus {
          outline: none !important;
          box-shadow: 0 0 0 2px #3bffff !important;
        }
      `}</style>

      <form onSubmit={handleSubmit} className="stripe-checkout-form">
        <div className="mb-6">
          <h2 className="stripe-section-title">Shipping information</h2>
        </div>

        <div className="space-y-4">
          <div>
            <label htmlFor="email" className="stripe-label">
              Email
            </label>
            <input
              id="email"
              type="email"
              value={formData.email}
              onChange={(e) => handleInputChange('email', e.target.value)}
              className={`stripe-input ${errors.email ? 'error' : ''}`}
              placeholder="your@email.com"
              disabled={isSubmitting}
              autoComplete="email"
            />
            {errors.email && (
              <p className="stripe-error">{errors.email}</p>
            )}
          </div>

          <label className="stripe-checkbox-container">
            <div className="stripe-checkbox">
              <input
                type="checkbox"
                checked={keepUpdated}
                onChange={(e) => setKeepUpdated(e.target.checked)}
                disabled={isSubmitting}
              />
              <span className="stripe-checkbox-visual"></span>
            </div>
            <span className="stripe-checkbox-label">
              Keep me updated with news and personalized offers
            </span>
          </label>

          <div className="stripe-divider"></div>

          <div>
            <h3 className="stripe-label" style={{ fontSize: '16px', marginBottom: '16px', color: '#1a1f36' }}>
              Shipping address
            </h3>
          </div>

          <div>
            <input
              id="name"
              type="text"
              value={formData.name}
              onChange={(e) => handleInputChange('name', e.target.value)}
              className={`stripe-input ${errors.name ? 'error' : ''}`}
              placeholder="Full name"
              disabled={isSubmitting}
              autoComplete="name"
            />
            {errors.name && (
              <p className="stripe-error">{errors.name}</p>
            )}
          </div>

          <div>
            <select
              id="country"
              value={formData.country}
              onChange={(e) => handleInputChange('country', e.target.value)}
              className={`stripe-select ${errors.country ? 'error' : ''}`}
              disabled={isSubmitting}
              autoComplete="country"
            >
              <option value="">Select country</option>
              {SHIPPING_COUNTRIES.map(country => (
                <option key={country.code} value={country.code}>
                  {country.name}
                </option>
              ))}
            </select>
            {errors.country && (
              <p className="stripe-error">{errors.country}</p>
            )}
          </div>

          <div>
            <input
              id="line1"
              type="text"
              value={formData.line1}
              onChange={(e) => handleInputChange('line1', e.target.value)}
              className={`stripe-input ${errors.line1 ? 'error' : ''}`}
              placeholder="Address"
              disabled={isSubmitting}
              autoComplete="address-line1"
            />
            {errors.line1 && (
              <p className="stripe-error">{errors.line1}</p>
            )}
          </div>

          <div>
            <input
              id="line2"
              type="text"
              value={formData.line2}
              onChange={(e) => handleInputChange('line2', e.target.value)}
              className="stripe-input"
              placeholder="Address line 2 (optional)"
              disabled={isSubmitting}
              autoComplete="address-line2"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <input
                id="city"
                type="text"
                value={formData.city}
                onChange={(e) => handleInputChange('city', e.target.value)}
                className={`stripe-input ${errors.city ? 'error' : ''}`}
                placeholder="City"
                disabled={isSubmitting}
                autoComplete="address-level2"
              />
              {errors.city && (
                <p className="stripe-error">{errors.city}</p>
              )}
            </div>

            <div>
              <input
                id="postal_code"
                type="text"
                value={formData.postal_code}
                onChange={(e) => handleInputChange('postal_code', e.target.value)}
                className={`stripe-input ${errors.postal_code ? 'error' : ''}`}
                placeholder="ZIP"
                disabled={isSubmitting}
                autoComplete="postal-code"
              />
              {errors.postal_code && (
                <p className="stripe-error">{errors.postal_code}</p>
              )}
            </div>
          </div>

          {regions.length > 0 && (
            <div>
              <select
                id="state"
                value={formData.state}
                onChange={(e) => handleInputChange('state', e.target.value)}
                className={`stripe-select ${errors.state ? 'error' : ''}`}
                disabled={isSubmitting || !formData.country}
                autoComplete="address-level1"
              >
                <option value="">Select state</option>
                {/* @ts-ignore - region types are complex */}
                {regions.map((region: any) => (
                  <option key={region.shortCode || region.name} value={region.shortCode || region.name}>
                    {region.name}
                  </option>
                ))}
              </select>
              {errors.state && (
                <p className="stripe-error">{errors.state}</p>
              )}
            </div>
          )}
        </div>

        {subtotal && shippingPrice !== null && (
          <div className="stripe-summary-box">
            <div className="stripe-summary-row">
              <span className="stripe-summary-label">Subtotal</span>
              <span className="stripe-summary-value">${subtotal.toFixed(2)}</span>
            </div>
            <div className="stripe-summary-row">
              <span className="stripe-summary-label">Shipping</span>
              <span className="stripe-summary-value">${shippingPrice.toFixed(2)}</span>
            </div>
            <div className="stripe-summary-row">
              <span className="stripe-summary-label">Total</span>
              <span className="stripe-summary-value">${total?.toFixed(2)}</span>
            </div>
          </div>
        )}

        <div className="stripe-divider"></div>

        {/* Payment Method Selection - CRYPTO OPTION COMMENTED OUT */}
        <div className="space-y-4">
          <h3 className="stripe-label" style={{ fontSize: '16px', marginBottom: '16px', color: '#1a1f36' }}>
            Payment Method
          </h3>

          <div className="space-y-3">
            {/* Stripe Payment Option - DEFAULT SELECTED */}
            <label className="stripe-radio-container">
              <input
                type="radio"
                name="paymentMethod"
                value="stripe"
                checked={true} // Always checked - Stripe only
                onChange={(e) => setSelectedPaymentMethod(e.target.value as 'stripe')}
                disabled={isSubmitting}
                className="stripe-radio-input"
              />
              <div className="stripe-radio-content">
                <div className="stripe-radio-visual"></div>
                <div className="stripe-payment-option-content">
                  <div className="stripe-payment-icon-container">
                    <svg className="stripe-payment-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <rect x="2" y="5" width="20" height="14" rx="2" stroke="currentColor" strokeWidth="1.5"/>
                      <path d="M2 10H22" stroke="currentColor" strokeWidth="1.5"/>
                      <path d="M6 14H10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                    </svg>
                  </div>
                  <div className="stripe-payment-details">
                    <div className="stripe-payment-label">Pay with Card</div>
                    <div className="stripe-payment-description">Credit/Debit • Apple Pay • Google Pay</div>
                  </div>
                </div>
              </div>
            </label>

            {/* Crypto Payment Option - COMMENTED OUT FOR NOW */}
            {/* 
            <label className="stripe-radio-container">
              <input
                type="radio"
                name="paymentMethod"
                value="crypto"
                checked={selectedPaymentMethod === 'crypto'}
                onChange={(e) => setSelectedPaymentMethod(e.target.value as 'crypto')}
                disabled={isSubmitting}
                className="stripe-radio-input"
              />
              <div className="stripe-radio-content">
                <div className="stripe-radio-visual"></div>
                <div className="stripe-payment-option-content">
                  <div className="stripe-payment-icon-container">
                    <Coins className="stripe-payment-icon" />
                  </div>
                  <div className="stripe-payment-details">
                    <div className="stripe-payment-label">Pay with Crypto</div>
                    <div className="stripe-payment-description">Pay with digital currency</div>
                  </div>
                </div>
              </div>
            </label>
            */}
          </div>
        </div>

        {/* Crypto Payment Section - COMMENTED OUT FOR NOW */}
        {false && selectedPaymentMethod === 'crypto' && (
          <div className="stripe-crypto-payment-section">
            <div className="stripe-divider"></div>
            <h3 className="stripe-section-subtitle">Complete Crypto Payment</h3>

            {!cryptoPaymentData ? (
              <div className="stripe-crypto-connect-container">
                {!isConnected ? (
                  <>
                    <p className="stripe-crypto-subheading">Connect your wallet to proceed with crypto payment</p>
                    <div className="stripe-wallet-button-wrapper mt-4">
                    {ready ? (
                      <WalletButton />
                    ) : (
                      <button
                        type="button"
                        disabled
                        className="stripe-button stripe-button-secondary"
                      >
                        <Wallet className="w-4 h-4 mr-2" />
                        Loading...
                      </button>
                    )}
                    </div>
                  </>
                ) : (
                  <div className="space-y-4">
                    <div className="stripe-wallet-status stripe-wallet-connected">
                      <div className="flex items-center gap-2">
                        <div className="stripe-status-indicator"></div>
                        <span className="stripe-status-text">Wallet Connected</span>
                      </div>
                      <span className="stripe-wallet-address">
                        {address?.slice(0, 6)}...{address?.slice(-4)}
                      </span>
                    </div>
                    <p className="stripe-label">Wallet connected! Click "Create Crypto Payment" to complete the transaction.</p>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                {/* Payment Details */}
                <div className="stripe-summary-box">
                  <div className="stripe-summary-row">
                    <span className="stripe-summary-label">Base Amount</span>
                    <span className="stripe-summary-value">${(cryptoPaymentData.baseAmount / 100).toFixed(2)}</span>
                  </div>
                  {cryptoPaymentData.taxAmount > 0 && (
                    <div className="stripe-summary-row">
                      <span className="stripe-summary-label">Tax ({cryptoPaymentData.taxRate.toFixed(1)}%)</span>
                      <span className="stripe-summary-value">${(cryptoPaymentData.taxAmount / 100).toFixed(2)}</span>
                    </div>
                  )}
                  <div className="stripe-summary-row">
                    <span className="stripe-summary-label">Total Amount</span>
                    <span className="stripe-summary-value">${(cryptoPaymentData.amount / 100).toFixed(2)}</span>
                  </div>
                </div>

                <div className="stripe-crypto-details">
                  <div className="stripe-crypto-detail-row">
                    <span className="stripe-label">Network</span>
                    <span className="stripe-crypto-detail-value">Base</span>
                  </div>
                  <div className="stripe-crypto-detail-row">
                    <span className="stripe-label">Currency</span>
                    <span className="stripe-crypto-detail-value">USDC</span>
                  </div>
                  <div className="stripe-crypto-detail-row">
                    <span className="stripe-label">USDC Amount</span>
                    <span className="stripe-crypto-detail-value stripe-crypto-amount">{quotedUsdc} USDC</span>
                  </div>
                  <p className="stripe-crypto-note">
                    USDC is a stablecoin pegged to the US Dollar (1 USDC = $1.00 USD)
                  </p>
                </div>

                {/* Wallet Connection */}
                {!isConnected ? (
                  <div className="stripe-crypto-connect-container">
                    <p className="stripe-label mb-4">Connect your wallet to send payment</p>
                    <div className="stripe-wallet-button-wrapper">
                      {ready ? (
                        <WalletButton />
                      ) : (
                        <button
                          type="button"
                          disabled
                          className="stripe-button stripe-button-secondary"
                        >
                          <Wallet className="w-4 h-4 mr-2" />
                          Loading...
                        </button>
                      )}
                    </div>
                    <p className="stripe-crypto-note mt-3">
                      Click "Connect Wallet" first, then "Create Crypto Payment"
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* Wallet Connected */}
                    <div className="stripe-wallet-status stripe-wallet-connected">
                      <div className="flex items-center gap-2">
                        <div className="stripe-status-indicator"></div>
                        <span className="stripe-status-text">Wallet Connected</span>
                      </div>
                      <span className="stripe-wallet-address">
                        {address?.slice(0, 6)}...{address?.slice(-4)}
                      </span>
                    </div>

                    {/* Payment Status */}
                    {cryptoPaymentStatus === 'processing' && (
                      <div className="stripe-payment-status stripe-status-processing">
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        <span className="stripe-status-text">Processing payment...</span>
                      </div>
                    )}

                    {cryptoPaymentStatus === 'complete' && (
                      <div className="stripe-payment-status stripe-status-success">
                        <Check className="mr-2 h-4 w-4" />
                        <span className="stripe-status-text">Payment confirmed!</span>
                      </div>
                    )}

                    {cryptoPaymentStatus === 'failed' && (
                      <div className="stripe-payment-status stripe-status-error">
                        <span className="stripe-status-text">Payment failed. Please try again.</span>
                      </div>
                    )}

                    {/* Transaction Hash */}
                    {txHash && (
                      <div className="stripe-transaction-hash">
                        <p className="stripe-label mb-2">Transaction Hash</p>
                        <p className="stripe-hash-value">{txHash}</p>
                      </div>
                    )}

                    {/* Payment is already created and wallet is connected - show status */}
                    {cryptoPaymentStatus === 'pending' && (
                      <div className="stripe-crypto-connect-container">
                        <p className="stripe-label">Payment created! Click "Send Transaction" to complete the payment.</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        <div className="stripe-divider"></div>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={onBack}
            disabled={isSubmitting}
            className="stripe-button stripe-button-secondary"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </button>
          {/* Show different button based on payment status */}
          {selectedPaymentMethod === 'crypto' && cryptoPaymentStatus === 'complete' ? (
            <button
              type="button"
              disabled
              className="stripe-button stripe-button-primary bg-green-600 hover:bg-green-700 cursor-not-allowed"
            >
              <Check className="w-4 h-4 mr-2" />
              Payment Complete
            </button>
          ) : (
            <button
              type="submit"
              disabled={isSubmitting || isProcessingCrypto || (selectedPaymentMethod === 'crypto' && !isConnected)}
              className="stripe-button stripe-button-primary"
            >
              {isSubmitting || isProcessingCrypto ? 'Processing...' :
               selectedPaymentMethod === 'crypto' ?
                 (isConnected ? (cryptoPaymentData ? 'Send Transaction' : 'Create Crypto Payment') : 'Connect Wallet First') :
                 'Continue to payment'}
            </button>
          )}
        </div>
      </form>
    </div>
  )
}
