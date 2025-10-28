import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'

export async function POST(req: NextRequest) {
  try {
    const { usd } = await req.json()
    
    if (!usd || usd < 10) {
      return NextResponse.json({ error: 'Minimum purchase is $10' }, { status: 400 })
    }

    const supabase = createRouteHandlerClient({ cookies })
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    // Calculate credits (same as Stripe: $1 = 400 credits)
    const credits = usd * 400

    // Create crypto payment record
    const transactionId = `crypto_credits_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    
    // Create payment data structure that matches crypto payment modal expectations
    // For credits, no tax calculation needed since it's digital purchase
    // TESTING: Using Base Sepolia network and test wallet addresses
    const usdcAmount = usd.toFixed(6) // USDC amount with 6 decimal places
    const paymentData = {
      transactionId,
      amount: usd * 100, // Convert to cents
      baseAmount: usd * 100, // Same as amount for credits (no tax)
      taxAmount: 0, // No tax for digital credits
      taxRate: 0, // No tax rate for digital credits
      receivingAddress: process.env.CRYPTO_RECEIVING_ADDRESS || '', // Base Mainnet receiving wallet
      usdcContractAddress: process.env.USDC_CONTRACT_ADDRESS || '', // USDC contract on Base Mainnet
      tokenType: 'USDC', // Fixed token type for credits
      paymentId: transactionId, // Use transaction ID as payment ID
      message: `Purchase ${credits} credits for $${usd}`, // Description for credits purchase
      usdcAmount: usdcAmount, // Add the missing usdcAmount property
      credits: credits // Add credits to payment data for toast notification
    } as any // Type assertion to avoid TypeScript inference issues

    // Store the payment record in the dedicated crypto_credit_payments table
    try {
      const { error: insertError } = await supabase
        .from('crypto_credit_payments')
        .insert({
          transaction_id: transactionId,
          user_id: user.id,
          amount_cents: paymentData.amount,
          credits: credits,
          usdc_amount: paymentData.usdcAmount,
          receiving_address: paymentData.receivingAddress,
          usdc_contract_address: paymentData.usdcContractAddress,
          status: 'pending'
        })

      if (insertError) {
        console.error('Error storing crypto credit payment:', insertError)
        return NextResponse.json({ error: 'Failed to create payment record' }, { status: 500 })
      }
    } catch (dbError) {
      console.error('Database error:', dbError)
      return NextResponse.json({ error: 'Failed to create payment record' }, { status: 500 })
    }

    // COMMENTED OUT: Previous crypto_payments table logic for physical cards
    // Uncomment this section when re-enabling physical card crypto payments
    /*
    try {
      const { error: insertError } = await supabase
        .from('crypto_payments')
        .insert({
          transaction_id: transactionId,
          user_id: user.id,
          amount_cents: paymentData.amount,
          credits: credits,
          status: 'pending',
          payment_type: 'credits_purchase'
        })

      if (insertError) {
        console.error('Error storing crypto payment:', insertError)
        return NextResponse.json({ error: 'Failed to create payment record' }, { status: 500 })
      }
    } catch (dbError) {
      console.error('Database error:', dbError)
      return NextResponse.json({ error: 'Failed to create payment record' }, { status: 500 })
    }
    */

    return NextResponse.json({
      success: true,
      paymentData,
      message: 'Crypto payment created successfully'
    })

  } catch (error) {
    console.error('Crypto payment error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
