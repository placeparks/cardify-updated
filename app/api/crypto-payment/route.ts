// app/api/crypto-payment/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { stripe } from '@/lib/stripe'
import Taxjar from 'taxjar'

export const dynamic = 'force-dynamic'

// ===== Env / Feature Flags ======================================================================
const FORCE_DESTINATION_RATE = String(process.env.FORCE_DESTINATION_RATE || '').toLowerCase() === 'true'

// ===== Supabase (service-role; RLS bypass) ======================================================
const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

// ===== Config ===================================================================================
const USDC_CONTRACT_ADDRESS = process.env.USDC_CONTRACT_ADDRESS || '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'
const CRYPTO_RECEIVING_ADDRESS = process.env.CRYPTO_RECEIVING_ADDRESS || ''

const taxjar = new Taxjar({
  apiKey: process.env.TAXJAR_API_KEY || '5fc8b688d4ff26db51cc9702b001e7c3'
})

// ===== Types ====================================================================================
interface ShippingAddress {
  email?: string
  name?: string
  company?: string
  line1: string           // form field
  line2?: string
  address?: string        // db field
  addressLine2?: string
  city: string
  state: string
  postal_code: string     // form field
  zipcode?: string        // db field
  country: string
}

interface CryptoPaymentRequest {
  listingId?: string
  quantity?: number
  includeDisplayCase?: boolean
  displayCaseQuantity?: number
  cardFinish?: string
  shippingAddress: ShippingAddress
  orderItems?: string
  customImageUrl?: string
  cartItems?: any[]
}

// ===== Helpers ==================================================================================
const cents = (n: number) => Math.round(n * 100)

const normalizeState = (country: string, state: string) => {
  const c = (country || '').toUpperCase()
  if (c === 'US' || c === 'CA') return (state || '').slice(0, 2).toUpperCase()
  return state
}

const safePct = (fraction: number) => Number((fraction * 100).toFixed(4))

/**
 * Force destination rate regardless of nexus using TaxJar "rates for a location".
 * Returns { taxRatePct, taxAmountCents, source }.
 */
async function getDestinationRateTax(params: {
  country: string
  state: string
  city: string
  street: string
  zipcode: string
  taxableCents: number
}): Promise<{
  taxRatePct: number
  taxAmountCents: number
  source: 'taxjar_rates_lookup'
}> {
  const { country, state, city, street, zipcode, taxableCents } = params

  const rates = await taxjar.ratesForLocation(zipcode, {
    country,
    state,
    city,
    street,
  } as any)

  // Prefer combined_rate; some accounts/exact locales expose combined_tax_rate
  const combined =
    Number((rates as any)?.rate?.combined_rate) ??
    Number((rates as any)?.rate?.combined_tax_rate) ?? 0

  const taxAmountCents = Math.round(taxableCents * combined)
  const taxRatePct = safePct(combined)

  return {
    taxRatePct,
    taxAmountCents,
    source: 'taxjar_rates_lookup'
  }
}

/**
 * Try TaxJar calc (nexus-aware). Returns null if no nexus/zero or if it fails.
 */
async function tryTaxJarCalc(args: {
  from: { country: string; zip: string; state: string; city: string }
  to: { country: string; zip: string; state: string; city: string; street: string }
  amountUsd: number
  quantity: number
  unitPriceUsd: number
}): Promise<{
  taxRatePct: number
  taxAmountCents: number
  source: 'taxjar_calc'
} | null> {
  const { from, to, amountUsd, quantity, unitPriceUsd } = args
  const taxArgs: any = {
    from_country: from.country,
    from_zip: from.zip,
    from_state: from.state,
    from_city: from.city,

    to_country: to.country,
    to_zip: to.zip,
    to_state: to.state,
    to_city: to.city,
    to_street: to.street,

    amount: amountUsd,   // equals Σ(line_items)
    shipping: 0,

    line_items: [
      {
        id: 'card-001',
        quantity,
        unit_price: unitPriceUsd,
        // product_tax_code: 'A_GEN_TAX'
      }
    ],
  }

  const taxCalculation = await taxjar.taxForOrder(taxArgs)

  const rateDecimal =
    (typeof taxCalculation.tax.rate === 'number' && taxCalculation.tax.rate) ||
    (taxCalculation.tax.breakdown?.combined_tax_rate ?? 0)

  const hasNexus = Boolean(taxCalculation.tax.has_nexus)
  const amountToCollect = Number(taxCalculation.tax.amount_to_collect || 0)

  if (!hasNexus || amountToCollect <= 0) return null

  const taxAmountCents = Math.round(amountToCollect * 100)
  const taxRatePct = safePct(rateDecimal)

  return {
    taxRatePct,
    taxAmountCents,
    source: 'taxjar_calc'
  }
}

/**
 * Stripe Tax fallback (still destination-based but product-agnostic here).
 * Returns null if it fails or returns zero.
 */
async function tryStripeTaxFallback(args: {
  country: string
  state: string
  city: string
  postal_code: string
  line1: string
  line2?: string | null
  taxableCents: number
}): Promise<{
  taxRatePct: number
  taxAmountCents: number
  source: 'stripe_tax'
} | null> {
  const { country, state, city, postal_code, line1, line2, taxableCents } = args

  const calc = await stripe.tax.calculations.create({
    currency: 'usd',
    line_items: [
      {
        amount: taxableCents,
        reference: 'crypto_payment_fallback',
        tax_code: 'txcd_99999999',
        tax_behavior: 'exclusive',
      },
    ],
    customer_details: {
      address: {
        country,
        state,
        city,
        postal_code,
        line1,
        line2: line2 || undefined,
      },
    },
  })

  const exclusive = Number(calc.tax_amount_exclusive || 0)
  if (exclusive <= 0) return null

  const taxAmountCents = Math.round(exclusive)
  const taxRatePct = safePct(exclusive / taxableCents)

  return {
    taxRatePct,
    taxAmountCents,
    source: 'stripe_tax'
  }
}

// ===== Route ====================================================================================
export async function POST(req: NextRequest) {
  try {
    const {
      listingId,
      quantity = 1,
      includeDisplayCase = false,
      displayCaseQuantity = 1,
      cardFinish = 'matte',
      shippingAddress,
      orderItems = 'Custom Card',
      customImageUrl,
      cartItems
    }: CryptoPaymentRequest = await req.json()

    if (!shippingAddress) {
      return NextResponse.json({ error: 'Missing shipping address' }, { status: 400 })
    }

    // Map/normalize address fields
    const address = shippingAddress.address || shippingAddress.line1
    const zipcode = shippingAddress.zipcode || shippingAddress.postal_code
    const country = (shippingAddress.country || '').toUpperCase()
    const state = normalizeState(country, shippingAddress.state)

    if (!address || !shippingAddress.city || !state || !zipcode || !country) {
      return NextResponse.json({
        error: 'Missing required address fields: address, city, state, zipcode, and country are required'
      }, { status: 400 })
    }

    // Get user (anonymous allowed)
    const supabase = createRouteHandlerClient({ cookies })
    const { data: { user } } = await supabase.auth.getUser()
    const buyerId = user?.id || null

    // ===== Pricing (product only; NO shipping for crypto) ======================================
    const unitPriceUsd = 9.00
    const quantityInt = Math.max(1, Math.floor(quantity))
    const baseAmountUsd = unitPriceUsd * quantityInt
    const baseAmountCents = cents(baseAmountUsd)
    const totalBeforeTaxCents = baseAmountCents

    // Guard: payload amount must equal sum(line_items) for TaxJar calc usage
    const payloadAmount = totalBeforeTaxCents / 100
    const sumLineItems = unitPriceUsd * quantityInt
    if (Number(payloadAmount.toFixed(2)) !== Number(sumLineItems.toFixed(2))) {
      return NextResponse.json({ error: 'Tax payload mismatch: amount must equal sum(line_items).' }, { status: 400 })
    }

    // ===== Tax ==========================================================================
    let taxRatePct = 0
    let taxAmountCents = 0
    let taxSource: 'taxjar_calc' | 'taxjar_rates_lookup' | 'stripe_tax' | 'none' = 'none'

    const from = { country: 'US', zip: '89108', state: 'NV', city: 'Las Vegas' }
    const to = {
      country,
      zip: zipcode,
      state,
      city: shippingAddress.city,
      street: address
    }

    // Strategy:
    // - If FORCE_DESTINATION_RATE: use rate lookup directly (ignore nexus).
    // - Else try TaxJar calc (nexus-aware). If no nexus/zero → fallback to destination rate lookup.
    // - Else try Stripe Tax as tertiary fallback.
    if (FORCE_DESTINATION_RATE) {
      const forced = await getDestinationRateTax({
        country, state, city: shippingAddress.city, street: address, zipcode, taxableCents: totalBeforeTaxCents
      })
      taxRatePct = forced.taxRatePct
      taxAmountCents = forced.taxAmountCents
      taxSource = 'taxjar_rates_lookup'
    } else {
      // 1) Try nexus-aware calc
      try {
        const tj = await tryTaxJarCalc({
          from,
          to,
          amountUsd: payloadAmount,
          quantity: quantityInt,
          unitPriceUsd
        })
        if (tj) {
          taxRatePct = tj.taxRatePct
          taxAmountCents = tj.taxAmountCents
          taxSource = tj.source
        } else {
          // 2) Fallback to destination rate lookup (ignores nexus)
          const forced = await getDestinationRateTax({
            country, state, city: shippingAddress.city, street: address, zipcode, taxableCents: totalBeforeTaxCents
          })
          taxRatePct = forced.taxRatePct
          taxAmountCents = forced.taxAmountCents
          taxSource = forced.source
        }
      } catch {
        // 3) Stripe Tax tertiary fallback
        const st = await tryStripeTaxFallback({
          country, state, city: shippingAddress.city, postal_code: zipcode,
          line1: address, line2: shippingAddress.addressLine2 || shippingAddress.line2 || null,
          taxableCents: totalBeforeTaxCents
        })
        if (st) {
          taxRatePct = st.taxRatePct
          taxAmountCents = st.taxAmountCents
          taxSource = st.source
        } else {
          // Last resort: apply zero tax
          taxRatePct = 0
          taxAmountCents = 0
          taxSource = 'none'
        }
      }
    }

    // ===== Totals ===============================================================================
    const totalAmountCents = totalBeforeTaxCents + taxAmountCents

    // ===== IDs ==================================================================================
    const transactionId = `crypto_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    const orderId = `923${String(Date.now()).slice(-3)}${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`

    // ===== Persist ==============================================================================
    const { data: cryptoPayment, error: dbError } = await admin
      .from('crypto_payments')
      .insert({
        transaction_id: transactionId,
        buyer_id: buyerId,
        listing_id: listingId || null,

        amount_cents: totalAmountCents,           // Product + Tax (no shipping)
        base_amount_cents: totalBeforeTaxCents,   // Product only (before tax)
        tax_amount_cents: taxAmountCents,
        tax_rate_percentage: taxRatePct,          // e.g., 13.0

        currency: 'USD',
        status: 'pending',
        receiving_address: CRYPTO_RECEIVING_ADDRESS,
        usdc_contract_address: USDC_CONTRACT_ADDRESS,

        company: shippingAddress.company || null,
        address,
        address_line_2: shippingAddress.addressLine2 || shippingAddress.line2 || null,
        city: shippingAddress.city,
        state,
        zipcode,
        country,

        order_id: orderId,
        order_items: orderItems,

        quantity: quantityInt,
        include_display_case: includeDisplayCase,
        display_case_quantity: displayCaseQuantity,
        card_finish: cardFinish,

        pounds: null,
        length: null,
        width: null,
        height: null,

        metadata: {
          payment_method: 'usdc',
          token_type: 'USDC',
          usdc_contract_address: USDC_CONTRACT_ADDRESS,
          tax_calculation_source: taxSource, // 'taxjar_calc' | 'taxjar_rates_lookup' | 'stripe_tax' | 'none'
          ...(customImageUrl && { custom_image_url: customImageUrl }),
          ...(cartItems && { cart_items: cartItems }),
          ...(listingId && { listing_id: listingId }),
        },
      })
      .select()
      .single()

    if (dbError) {
      console.error('DB insert error:', dbError)
      return NextResponse.json({ error: 'Failed to create payment record' }, { status: 500 })
    }

    // ===== Response =============================================================================
    return NextResponse.json({
      success: true,
      transactionId,
      amount: totalAmountCents,         // cents
      baseAmount: baseAmountCents,      // cents
      shippingAmount: 0,                // cents
      taxAmount: taxAmountCents,        // cents
      taxRate: taxRatePct,              // %
      receivingAddress: CRYPTO_RECEIVING_ADDRESS,
      usdcContractAddress: USDC_CONTRACT_ADDRESS,
      tokenType: 'USDC',
      paymentId: cryptoPayment.id,
      message: `Please send $${(totalAmountCents / 100).toFixed(2)} USDC to the address below.`,
    })
  } catch (error) {
    console.error('Crypto payment creation error:', error)
    return NextResponse.json({ error: 'Payment creation failed' }, { status: 500 })
  }
}
