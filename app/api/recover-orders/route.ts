import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { stripe } from '@/lib/stripe';

// Simple in-memory rate limiting (in production, use Redis or similar)
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT_WINDOW = 60000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 5; // 5 requests per minute per IP

/**
 * POST handler for recovering custom card orders by email
 * Returns all custom card orders associated with the provided email
 */
export async function POST(request: NextRequest) {
  try {
    // Get client IP for rate limiting
    const clientIp = request.headers.get('x-forwarded-for') ||
                    request.headers.get('x-real-ip') ||
                    'unknown';

    // Check rate limit
    const now = Date.now();
    const rateLimitKey = `recover_${clientIp}`;
    const rateLimit = rateLimitMap.get(rateLimitKey);

    if (rateLimit) {
      if (now < rateLimit.resetTime) {
        if (rateLimit.count >= MAX_REQUESTS_PER_WINDOW) {
          return NextResponse.json(
            {
              error: 'Too many requests. Please try again in a minute.',
              code: 'RATE_LIMITED'
            },
            { status: 429 }
          );
        }
        rateLimit.count++;
      } else {
        // Reset window
        rateLimitMap.set(rateLimitKey, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
      }
    } else {
      // First request
      rateLimitMap.set(rateLimitKey, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
    }

    // Clean up old entries periodically
    if (Math.random() < 0.01) { // 1% chance to clean up
      for (const [key, value] of rateLimitMap.entries()) {
        if (now > value.resetTime) {
          rateLimitMap.delete(key);
        }
      }
    }
    // Parse request body
    const { email } = await request.json();

    // Validate email input
    if (!email || typeof email !== 'string') {
      return NextResponse.json(
        {
          error: 'Email address is required',
          code: 'EMAIL_REQUIRED'
        },
        { status: 400 }
      );
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        {
          error: 'Please enter a valid email address',
          code: 'INVALID_EMAIL'
        },
        { status: 400 }
      );
    }

    // Normalize email (lowercase, trim)
    const normalizedEmail = email.toLowerCase().trim();

    console.log('Fetching orders for email:', normalizedEmail);

    // Query Stripe directly for checkout sessions
    try {
      // Search for checkout sessions by customer email
      // Stripe allows listing sessions and filtering
      const sessions = await stripe.checkout.sessions.list({
        limit: 100, // Get up to 100 most recent sessions
        expand: ['data.line_items', 'data.customer']
      });

      // Filter sessions for this email with custom card metadata
      const customerSessions = sessions.data.filter(session => {
        const sessionEmail = session.customer_details?.email || session.customer_email;
        const hasCustomCard = session.metadata?.isCustomCard === 'true' ||
                             session.metadata?.customImageUrl ||
                             session.metadata?.custom_image_url;

        return sessionEmail?.toLowerCase() === normalizedEmail &&
               hasCustomCard &&
               session.payment_status === 'paid';
      });

      console.log(`Found ${customerSessions.length} sessions for ${normalizedEmail}`);

      // Transform Stripe sessions into order format
      const orders = customerSessions.map(session => ({
        id: session.id,
        stripe_session_id: session.id,
        customer_email: session.customer_details?.email || session.customer_email || '',
        image_url: session.metadata?.customImageUrl ||
                  session.metadata?.custom_image_url ||
                  session.metadata?.imageUrl || '',
        card_finish: session.metadata?.cardFinish ||
                    session.metadata?.card_finish ||
                    'matte',
        quantity: parseInt(session.metadata?.quantity || '1'),
        created_at: new Date(session.created * 1000).toISOString(),
        price_cents: session.amount_total || 0,
        metadata: {
          payment_intent: session.payment_intent,
          customer_name: session.customer_details?.name,
          shipping_address: session.shipping_details?.address || session.customer_details?.address
        }
      }));

      // Sort by most recent first
      orders.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      console.log(`Returning ${orders.length} valid orders for ${normalizedEmail}`);

      // Return the orders
      return NextResponse.json(
        {
          orders: orders,
          count: orders.length,
          source: 'stripe' // Indicate data came from Stripe
        },
        { status: 200 }
      );

    } catch (stripeError: any) {
      console.error('Stripe error fetching sessions:', stripeError);

      // Fall back to database query if Stripe fails
      console.log('Falling back to database query...');

      // Try database as fallback
      const { data: dbOrders, error: dbError } = await supabase
        .from('custom_card_orders')
        .select('*')
        .eq('customer_email', normalizedEmail)
        .order('created_at', { ascending: false });

      if (!dbError && dbOrders && dbOrders.length > 0) {
        const validOrders = dbOrders.map(order => ({
          ...order,
          image_url: order.image_url || order.custom_image_url,
          created_at: order.created_at || order.order_date
        }));

        return NextResponse.json(
          {
            orders: validOrders,
            count: validOrders.length,
            source: 'database'
          },
          { status: 200 }
        );
      }

      // If both fail, return error
      return NextResponse.json(
        {
          error: 'Unable to fetch orders. Please try again later.',
          code: 'FETCH_ERROR'
        },
        { status: 500 }
      );
    }

  } catch (error) {
    console.error('Unexpected error in recover-orders:', error);

    return NextResponse.json(
      {
        error: 'An unexpected error occurred. Please try again.',
        code: 'INTERNAL_ERROR'
      },
      { status: 500 }
    );
  }
}

/**
 * OPTIONS handler for CORS preflight
 */
export async function OPTIONS() {
  return NextResponse.json(
    {},
    {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    }
  );
}