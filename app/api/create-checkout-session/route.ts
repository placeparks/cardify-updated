import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';
import crypto from 'crypto';
import Stripe from 'stripe';
import { withRateLimit, RateLimitConfigs } from '@/lib/rate-limiter';
import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';

// Constants
const ALLOWED_SHIPPING_COUNTRIES = [
  'US', 'CA', 'MX', 'GB', 'DE', 'FR', 'IT', 'ES', 'NL', 'BE', 
  'AT', 'CH', 'SE', 'NO', 'DK', 'FI', 'IE', 'PT', 'PL', 'CZ', 
  'HU', 'RO', 'BG', 'HR', 'SI', 'SK', 'LT', 'LV', 'EE', 'GR', 
  'CY', 'MT', 'LU', 'AU', 'NZ', 'JP', 'SG', 'HK', 'KR', 'TW', 
  'MY', 'TH', 'PH', 'ID', 'VN', 'IN', 'AE', 'SA', 'IL', 'TR', 
  'ZA', 'BR', 'AR', 'CL', 'PE', 'CO'
];

/**
 * Save order details to our database
 */
async function saveOrderDetails(session: Stripe.Checkout.Session, body: any, lineItems: any[]) {
  try {
    console.log('🔍 Debug - Session data:', {
      id: session.id,
      amount_total: session.amount_total,
      currency: session.currency,
      customer_email: session.customer_details?.email,
      shipping: session.shipping_details
    });
    
    console.log('🔍 Debug - Body data:', {
      customerEmail: body.customerEmail,
      email: body.email,
      shippingAddress: body.shippingAddress,
      quantity: body.quantity
    });

    const buyerId = session.metadata?.userId || null;
    
    const orderData = {
      stripeSessionId: session.id,
      buyerId, // Add buyer ID from session metadata
      customerEmail: body.customerEmail || body.email || session.customer_details?.email,
      customerName: body.customerName || body.name || session.customer_details?.name,
      customerPhone: body.customerPhone || body.phone || session.customer_details?.phone,
      shippingAddress: body.shippingAddress || session.shipping_details?.address,
      billingAddress: body.billingAddress || session.customer_details?.address,
      totalAmountCents: session.amount_total,
      currency: session.currency,
      quantity: body.quantity || 1,
      productType: body.productType || 'mixed',
      productDetails: {
        lineItems: lineItems,
        cartItems: body.cartItems || [],
        metadata: session.metadata
      },
      cardFinish: body.cardFinish,
      includeDisplayCase: body.includeDisplayCase || false,
      displayCaseQuantity: body.displayCaseQuantity || 0,
      imageUrl: body.imageUrl || body.customImageUrl,
      originalFilename: body.originalFilename,
      shippingCountry: body.shippingCountry || body.shippingAddress?.country || session.shipping_details?.address?.country,
      shippingCostCents: session.shipping_cost?.amount_total,
      shippingRateId: session.shipping_cost?.shipping_rate,
      status: 'pending',
      paymentStatus: 'pending',
      metadata: body.metadata || {},
      stripeMetadata: session.metadata || {}
    };

    console.log('📤 Sending order data to API:', {
      stripeSessionId: orderData.stripeSessionId,
      customerEmail: orderData.customerEmail,
      totalAmountCents: orderData.totalAmountCents,
      quantity: orderData.quantity
    });

    const response = await fetch(`${process.env.NEXT_PUBLIC_SITE_URL}/api/orders/save-details`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(orderData)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Order details API error:', {
        status: response.status,
        statusText: response.statusText,
        error: errorText
      });
      throw new Error(`Failed to save order details: ${response.status} ${response.statusText} - ${errorText}`);
    }

    const result = await response.json();
    console.log('✅ Order details saved successfully:', result);
  } catch (error) {
    console.error('❌ Error saving order details:', error);
    throw error;
  }
}


/**
 * Get shipping option based on customer's country
 * Returns a single shipping option appropriate for the destination
 */
function getShippingOptionForCountry(country: string) {
  // US Shipping
  if (country === 'US') {
    return {
      shipping_rate_data: {
        type: 'fixed_amount' as const,
        fixed_amount: {
          amount: 499, // $4.99 in cents
          currency: 'usd',
        },
        display_name: 'Standard Shipping',
        delivery_estimate: {
          minimum: {
            unit: 'business_day' as const,
            value: 5,
          },
          maximum: {
            unit: 'business_day' as const,
            value: 7,
          },
        },
        tax_behavior: 'exclusive' as const,
      },
    };
  }
  
  // Canada Shipping
  if (country === 'CA') {
    return {
      shipping_rate_data: {
        type: 'fixed_amount' as const,
        fixed_amount: {
          amount: 1199, // $11.99 in cents
          currency: 'usd',
        },
        display_name: 'Standard Shipping',
        delivery_estimate: {
          minimum: {
            unit: 'business_day' as const,
            value: 7,
          },
          maximum: {
            unit: 'business_day' as const,
            value: 14,
          },
        },
        tax_behavior: 'exclusive' as const,
      },
    };
  }
  
  // International Shipping (all other countries)
  return {
    shipping_rate_data: {
      type: 'fixed_amount' as const,
      fixed_amount: {
        amount: 1699, // $16.99 in cents
        currency: 'usd',
      },
      display_name: 'International Shipping',
      delivery_estimate: {
        minimum: {
          unit: 'business_day' as const,
          value: 10,
        },
        maximum: {
          unit: 'business_day' as const,
          value: 21,
        },
      },
      tax_behavior: 'exclusive' as const,
    },
  };
}

/**
 * Validate CSRF tokens for App Router
 * Adapts the CSRF validation logic for NextRequest instead of NextApiRequest
 */
function validateCSRFForAppRouter(request: NextRequest): boolean {
  // Extract CSRF token from cookies
  const cookieHeader = request.headers.get('cookie') || '';
  const cookies = Object.fromEntries(
    cookieHeader.split(';').map(cookie => {
      const [key, value] = cookie.trim().split('=');
      return [key, value];
    })
  );
  const cookieToken = cookies['csrf_token'] || null;
  
  // Extract CSRF token from headers
  const headerToken = request.headers.get('x-csrf-token') || null;
  
  // Both tokens must be present
  if (!cookieToken || !headerToken) {
    return false;
  }
  
  // Both tokens must be the same length to prevent timing attacks
  if (cookieToken.length !== headerToken.length) {
    return false;
  }
  
  try {
    // Use constant-time comparison to prevent timing attacks
    return crypto.timingSafeEqual(
      Buffer.from(cookieToken, 'hex'),
      Buffer.from(headerToken, 'hex')
    );
  } catch {
    // If there's an error (e.g., invalid hex), tokens don't match
    return false;
  }
}

/**
 * Handle cart checkout with multiple items
 */
interface CartItem {
  productId: string
  quantity: number
  pricePerUnit?: number
  name: string
  cardFinish?: string
  customImageUrl?: string
  image?: string
}

interface ShippingAddressData {
  email: string
  name: string
  line1: string
  line2?: string
  city: string
  state: string
  postal_code: string
  country: string
}

async function handleCartCheckout(
  request: NextRequest, 
  cartItems: CartItem[], 
  shippingAddress: ShippingAddressData,
  isCustomCard: boolean = false,
  userId: string | null = null
): Promise<NextResponse> {
  const origin = request.headers.get('origin') || 'http://localhost:3000';
  
  try {
    // Fetch real-time inventory data using the request origin
    // This ensures we're always calling the same domain the user is on
    const apiBaseUrl = origin;
    
    const inventoryResponse = await fetch(`${apiBaseUrl}/api/inventory`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!inventoryResponse.ok) {
      throw new Error('Failed to fetch inventory data');
    }

    const inventoryResult = await inventoryResponse.json();
    const inventoryData = inventoryResult.data;

    // Build line items from cart
    const lineItems: Array<Stripe.Checkout.SessionCreateParams.LineItem> = [];
    const metadata: Record<string, string> = {
      isCartCheckout: 'true',
      shippingCountry: shippingAddress.country,
      timestamp: new Date().toISOString(),
      ...(userId && { userId }),
    };
    
    let itemIndex = 0;
    let totalQuantity = 0;
    for (const item of cartItems) {
      const { productId, quantity, cardFinish, customImageUrl } = item;
      totalQuantity += quantity;
      
      if (productId === 'limited-edition-card') {
        // Limited edition card
        const productData = inventoryData.product;
        if (!productData) {
          throw new Error('Limited edition card not available');
        }
        
        // Check for existing price or create new one
        const existingPrices = await stripe.prices.list({
          product: productData.id,
          active: true,
          limit: 1
        });
        
        let priceId;
        if (existingPrices.data.length > 0) {
          priceId = existingPrices.data[0].id;
        } else {
          // Create price if it doesn't exist
          const price = await stripe.prices.create({
            currency: 'usd',
            unit_amount: inventoryData.pricePerUnit * 100, // Convert to cents
            product: productData.id,
            nickname: 'Limited Edition Card'
          });
          priceId = price.id;
        }
        
        lineItems.push({
          price: priceId,
          quantity: quantity,
          adjustable_quantity: {
            enabled: true,
            minimum: 1,
            maximum: Math.min(100, inventoryData.inventory)
          }
        });
        
        metadata[`item${itemIndex}_type`] = 'limited-edition';
        metadata[`item${itemIndex}_quantity`] = quantity.toString();
        
      } else if (productId === 'custom-card') {
        // Custom card with finish
        const basePrice = (inventoryData.customCard?.pricePerUnit || 9) * 100; // Convert dollars to cents
        const finishPrice = (cardFinish === 'rainbow' || cardFinish === 'gloss') ? 400 : 0; // $4.00 in cents
        const totalPrice = basePrice + finishPrice;
        
        const customCardName = cardFinish && cardFinish !== 'matte' 
          ? `Custom Card - ${cardFinish.charAt(0).toUpperCase() + cardFinish.slice(1)} Finish`
          : 'Custom Card - Matte Finish';
          
        lineItems.push({
          price_data: {
            currency: 'usd',
            unit_amount: totalPrice,
            tax_behavior: 'exclusive' as const,
            product_data: {
              name: customCardName,
              description: `Custom trading card with your uploaded artwork${cardFinish === 'rainbow' ? ' and holographic rainbow finish' : cardFinish === 'gloss' ? ' and high-gloss finish' : ''}. Image: ${customImageUrl || 'Not provided'}`,
              tax_code: 'txcd_99999999', // General - Tangible Goods
              metadata: {
                card_finish: cardFinish || 'matte',
                custom_image_url: customImageUrl || ''
              }
            }
          },
          quantity: quantity,
          adjustable_quantity: {
            enabled: true,
            minimum: 1,
            maximum: 100
          }
        });
        
        metadata[`item${itemIndex}_type`] = 'custom-card';
        metadata[`item${itemIndex}_quantity`] = quantity.toString();
        metadata[`item${itemIndex}_finish`] = cardFinish || 'matte';
        metadata[`item${itemIndex}_imageUrl`] = customImageUrl || '';
        
      } else if (productId === 'display-case') {
        // Display case
        const displayCaseData = inventoryData.displayCases;
        if (!displayCaseData?.product) {
          throw new Error('Display case not available');
        }
        
        // Check for existing price or create new one
        const existingPrices = await stripe.prices.list({
          product: displayCaseData.product.id,
          active: true,
          limit: 1
        });
        
        let priceId;
        if (existingPrices.data.length > 0) {
          priceId = existingPrices.data[0].id;
        } else {
          // Create price if it doesn't exist
          const price = await stripe.prices.create({
            currency: 'usd',
            unit_amount: displayCaseData.pricePerUnit * 100, // Convert to cents
            product: displayCaseData.product.id,
            nickname: 'Acrylic Display Case'
          });
          priceId = price.id;
        }
        
        lineItems.push({
          price: priceId,
          quantity: quantity,
        });
        
        metadata[`item${itemIndex}_type`] = 'display-case';
        metadata[`item${itemIndex}_quantity`] = quantity.toString();
      }
      
      itemIndex++;
    }
    
    if (lineItems.length === 0) {
      return NextResponse.json(
        { 
          error: 'No valid items in cart',
          code: 'INVALID_CART_ITEMS'
        },
        { status: 400 }
      );
    }
    
    // Add total quantity to metadata for success page display
    metadata['quantity'] = totalQuantity.toString();
    
    // Get shipping option
    const shippingOption = getShippingOptionForCountry(shippingAddress.country);
    
    // Create customer
    let customerId: string | undefined;
    try {
      const customer = await stripe.customers.create({
        email: shippingAddress.email,
        name: shippingAddress.name,
        shipping: {
          name: shippingAddress.name,
          address: {
            line1: shippingAddress.line1,
            line2: shippingAddress.line2 || undefined,
            city: shippingAddress.city,
            state: shippingAddress.state,
            postal_code: shippingAddress.postal_code,
            country: shippingAddress.country,
          },
        },
        metadata: {
          source: 'cart_checkout',
          timestamp: new Date().toISOString(),
        },
      });
      customerId = customer.id;
    } catch {
      // Continue without customer ID
    }
    
    // Create checkout session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card', 'crypto'],
      line_items: lineItems,
      mode: 'payment',
      automatic_tax: {
        enabled: true
      },
      success_url: `${origin}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: origin,
      ...(customerId && { customer: customerId }),
      // REQUIRED: When using shipping_address_collection with automatic_tax
      customer_update: {
        shipping: 'auto'
      },
      shipping_options: [shippingOption],
      // Make billing address optional for credit purchases (not custom cards)
      billing_address_collection: isCustomCard ? 'required' : 'auto',
      shipping_address_collection: {
        allowed_countries: [
          'US', 'CA', 'GB', 'FR', 'DE', 'IT', 'ES', 'AU', 'JP', 'KR', 'NL', 
          'CH', 'SE', 'NO', 'DK', 'FI', 'IE', 'BE', 'AT', 'PT', 'PL', 'CZ', 
          'HU', 'RO', 'GR', 'HR', 'SI', 'SK', 'EE', 'LV', 'LT', 'BG', 'MT', 
          'CY', 'LU', 'NZ', 'SG', 'HK', 'TW', 'MY', 'TH', 'ID', 'PH', 'VN', 
          'IN', 'IL', 'AE', 'SA', 'ZA', 'MX', 'BR', 'AR', 'CL', 'CO', 'PE'
        ],
      },
      phone_number_collection: {
        enabled: true,
      },
      consent_collection: {
        promotions: 'auto',
        terms_of_service: 'required',
      },
      custom_text: {
        submit: {
          message: 'By completing this purchase, you agree to our terms of service and privacy policy.',
        },
        terms_of_service_acceptance: {
          message: 'By completing this purchase, you agree to our terms of service and privacy policy.',
        },
      },
      metadata,
    });
    
    // Note: Order details will be saved in webhook after payment completion
    // when we have complete customer and shipping information

    return NextResponse.json(
      { 
        success: true,
        id: session.id,
        url: session.url,
        message: 'Cart checkout session created successfully'
      },
      { 
        status: 200,
        headers: {
          'Content-Type': 'application/json',
        }
      }
    );
    
  } catch (error) {
    console.error('Cart checkout error:', error);
    
    const errorMessage = error instanceof Error ? error.message : 'Failed to create checkout session';
    const errorCode = error instanceof Stripe.errors.StripeError ? error.code : 'CHECKOUT_ERROR';
    
    return NextResponse.json(
      { 
        error: errorMessage,
        code: errorCode,
        details: error instanceof Error ? error.stack : undefined
      },
      { status: 500 }
    );
  }
}

/**
 * POST handler for creating Stripe checkout sessions
 * Protected by CSRF validation and rate limiting for security
 */
async function handleCheckoutSession(request: NextRequest) {
  // Apply CSRF protection (skip in development for testing)
  const isTestEnvironment = process.env.NODE_ENV === 'development' && request.headers.get('x-test-mode') === 'true';
  
  if (!isTestEnvironment && !validateCSRFForAppRouter(request)) {
    return NextResponse.json(
      { 
        error: 'CSRF validation failed',
        code: 'CSRF_INVALID'
      },
      { status: 403 }
    );
  }

  try {
    // Log incoming request for debugging
    console.log('📨 Checkout session request received:', {
      method: request.method,
      url: request.url,
      headers: {
        origin: request.headers.get('origin'),
        'content-type': request.headers.get('content-type')
      }
    });

    // Parse request body
    let body;
    try {
      body = await request.json();
    } catch (parseError) {
      console.error('Failed to parse request body:', parseError);
      return NextResponse.json(
        { 
          error: 'Invalid JSON in request body',
          code: 'INVALID_JSON'
        },
        { status: 400 }
      );
    }

    // Get user ID if user is logged in using server-side Supabase client
    const supabase = createRouteHandlerClient({ cookies });
    let userId: string | null = null;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      userId = user?.id ?? null;
      console.log('🔍 Checkout session user debug:', {
        hasUser: !!user,
        userId: userId,
        userEmail: user?.email
      });
    } catch (error) {
      // User not logged in, continue with null userId
      console.log('No authenticated user for checkout session:', error);
    }

    const { 
      quantity, 
      includeDisplayCase, 
      displayCaseQuantity, 
      shippingAddress, 
      isCustomCard, 
      uploadId, 
      customImageUrl, 
      cardFinish,
      cartItems,
      isCartCheckout,
      returnUrl,
      // Marketplace fields
      listingId,
      isMarketplace
    } = body;
    
    console.log('📋 Checkout request details:', {
      quantity,
      includeDisplayCase,
      displayCaseQuantity,
      isCustomCard,
      uploadId,
      customImageUrl,
      cardFinish,
      isCartCheckout,
      cartItemsCount: cartItems?.length,
      hasShippingAddress: !!shippingAddress
    });

    // Validate shipping address
    if (!shippingAddress || typeof shippingAddress !== 'object') {
      return NextResponse.json(
        { 
          error: 'Shipping address is required',
          code: 'MISSING_SHIPPING_ADDRESS'
        },
        { status: 400 }
      );
    }

    const requiredFields = ['email', 'name', 'line1', 'city', 'state', 'postal_code', 'country'];
    for (const field of requiredFields) {
      if (!shippingAddress[field] || typeof shippingAddress[field] !== 'string' || shippingAddress[field].trim() === '') {
        return NextResponse.json(
          { 
            error: `Invalid shipping address: ${field} is required`,
            code: 'INVALID_SHIPPING_ADDRESS'
          },
          { status: 400 }
        );
      }
    }

    // Check if this is a cart checkout
    if (isCartCheckout && cartItems) {
      // Validate cart items
      if (!Array.isArray(cartItems) || cartItems.length === 0) {
        return NextResponse.json(
          { 
            error: 'Cart is empty',
            code: 'EMPTY_CART'
          },
          { status: 400 }
        );
      }
      
      // Process cart checkout
      return handleCartCheckout(request, cartItems, shippingAddress, false, userId); // false for cart checkout (not custom card)
    }
    
    // Check if this is a marketplace order
    if (isMarketplace && listingId) {
      return handleMarketplaceCheckout(request, listingId, quantity, includeDisplayCase, displayCaseQuantity, cardFinish, shippingAddress);
    }
    
    // Validate custom card requirements for single item checkout
    if (isCustomCard && !uploadId && !customImageUrl) {
      return NextResponse.json(
        { 
          error: 'Upload ID or custom image URL is required for custom cards',
          code: 'MISSING_UPLOAD_ID'
        },
        { status: 400 }
      );
    }

    // Validate quantity input
    const parsedQuantity = parseInt(quantity, 10);
    if (isNaN(parsedQuantity) || parsedQuantity < 1 || parsedQuantity > 100) {
      return NextResponse.json(
        { 
          error: 'Invalid quantity. Must be between 1 and 100.',
          code: 'INVALID_QUANTITY'
        },
        { status: 400 }
      );
    }

    // Validate display case quantity if included
    let parsedDisplayCaseQuantity = 0;
    if (includeDisplayCase) {
      parsedDisplayCaseQuantity = parseInt(displayCaseQuantity, 10);
      if (isNaN(parsedDisplayCaseQuantity) || parsedDisplayCaseQuantity < 1 || parsedDisplayCaseQuantity > 100) {
        return NextResponse.json(
          { 
            error: 'Invalid display case quantity. Must be between 1 and 100.',
            code: 'INVALID_DISPLAY_CASE_QUANTITY'
          },
          { status: 400 }
        );
      }
    }

    // Get the origin for success/cancel URLs
    const origin = request.headers.get('origin') || 'http://localhost:3000';
    
    // Set cancel URL based on product type
    // Use the provided return URL or fall back to default behavior
    const cancelUrl = returnUrl ? `${origin}${returnUrl}` : (isCustomCard ? `${origin}/upload` : origin);

    // Fetch real-time inventory data from inventory API
    // Use the origin from the request for internal API calls
    // This ensures we're always calling the same domain the user is on
    const apiBaseUrl = origin;
    
    let inventoryData;
    try {
      const inventoryResponse = await fetch(`${apiBaseUrl}/api/inventory`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!inventoryResponse.ok) {
        console.error('Failed to fetch inventory:', inventoryResponse.status);
        return NextResponse.json(
          { 
            error: 'Unable to verify inventory availability',
            code: 'INVENTORY_CHECK_FAILED'
          },
          { status: 503 }
        );
      }

      const inventoryResult = await inventoryResponse.json();
      if (!inventoryResult.success) {
        console.error('Inventory API returned error:', inventoryResult.error);
        return NextResponse.json(
          { 
            error: 'Unable to verify inventory availability',
            code: 'INVENTORY_CHECK_FAILED'
          },
          { status: 503 }
        );
      }

      inventoryData = inventoryResult.data;
    } catch (error) {
      console.error('Error fetching inventory:', error);
      return NextResponse.json(
        { 
          error: 'Unable to verify inventory availability',
          code: 'INVENTORY_CHECK_FAILED'
        },
        { status: 503 }
      );
    }

    // Skip inventory check for custom cards (made to order)
    if (!isCustomCard && inventoryData.inventory < parsedQuantity) {
      return NextResponse.json(
        { 
          error: inventoryData.inventory <= 0 
            ? 'Product is currently sold out'
            : `Only ${inventoryData.inventory} item(s) available`,
          code: 'INSUFFICIENT_INVENTORY',
          availableInventory: inventoryData.inventory
        },
        { status: 400 }
      );
    }

    // Validate display case inventory if needed
    if (includeDisplayCase && inventoryData.displayCases.inventory < parsedDisplayCaseQuantity) {
      return NextResponse.json(
        { 
          error: inventoryData.displayCases.inventory <= 0 
            ? 'Display cases are currently sold out'
            : `Only ${inventoryData.displayCases.inventory} display case(s) available`,
          code: 'INSUFFICIENT_DISPLAY_CASE_INVENTORY',
          availableDisplayCaseInventory: inventoryData.displayCases.inventory
        },
        { status: 400 }
      );
    }

    // Calculate pricing based on product type and card finish
    const productData = isCustomCard ? inventoryData.customCard : inventoryData;
    const productId = isCustomCard ? inventoryData.customCard.product.id : inventoryData.product.id;
    
    // Add card finish pricing for custom cards
    let cardFinishPricePerCard = 0;
    if (isCustomCard && (cardFinish === 'rainbow' || cardFinish === 'gloss')) {
      cardFinishPricePerCard = 4.00; // $4.00 additional for rainbow or gloss finish
    }
    
    const basePricePerUnit = productData.pricePerUnit;
    const totalPricePerUnit = basePricePerUnit + cardFinishPricePerCard;
    const pricePerUnitCents = Math.round(totalPricePerUnit * 100); // Convert to cents

    // Create or get a price for the product
    let priceId;
    try {
      // Create a price for the product with appropriate description
      const priceDescription = cardFinish && cardFinish !== 'matte' 
        ? `Custom Card - ${cardFinish.charAt(0).toUpperCase() + cardFinish.slice(1)} Finish`
        : 'Custom Card';
        
      // For custom cards, we'll use price_data instead of creating a price object
      // This allows us to show the finish type in the checkout
      if (isCustomCard) {
        // We'll use price_data in the session creation instead
        priceId = undefined;
      } else {
        const price = await stripe.prices.create({
          currency: 'usd',
          unit_amount: pricePerUnitCents,
          product: productId, // Reference the appropriate product
          nickname: priceDescription,
          metadata: {
            cardFinish: cardFinish || 'matte',
            basePrice: basePricePerUnit.toString(),
            finishPrice: cardFinishPricePerCard.toString()
          }
        });
        priceId = price.id;
      }
    } catch (error) {
      console.error('Error creating price:', error);
      return NextResponse.json(
        { 
          error: 'Failed to create price for product',
          code: 'PRICE_CREATION_FAILED',
          details: error instanceof Error ? error.message : 'Unknown error'
        },
        { status: 500 }
      );
    }

    // Create display case price if needed
    let displayCasePriceId;
    if (includeDisplayCase) {
      try {
        const displayCasePricePerUnitCents = Math.round(inventoryData.displayCases.pricePerUnit * 100); // Convert to cents
        const displayCasePrice = await stripe.prices.create({
          currency: 'usd',
          unit_amount: displayCasePricePerUnitCents,
          product: inventoryData.displayCases.product.id, // Reference the display case product
        });
        displayCasePriceId = displayCasePrice.id;
      } catch (error) {
        console.error('Error creating display case price:', error);
        return NextResponse.json(
          { 
            error: 'Failed to create price for display case',
            code: 'DISPLAY_CASE_PRICE_CREATION_FAILED'
          },
          { status: 500 }
        );
      }
    }

    // Build line items array with dynamic description
    const lineItems: Array<Stripe.Checkout.SessionCreateParams.LineItem> = [];
    
    if (isCustomCard) {
      // Use price_data for custom cards to show finish type
      const customCardName = cardFinish && cardFinish !== 'matte' 
        ? `Custom Card - ${cardFinish.charAt(0).toUpperCase() + cardFinish.slice(1)} Finish`
        : 'Custom Card - Matte Finish';
        
      lineItems.push({
        price_data: {
          currency: 'usd',
          unit_amount: pricePerUnitCents,
          tax_behavior: 'exclusive' as const,
          product_data: {
            name: customCardName,
            description: `Custom trading card with your uploaded artwork${cardFinish === 'rainbow' ? ' and holographic rainbow finish' : cardFinish === 'gloss' ? ' and high-gloss finish' : ''}. Image: ${customImageUrl}`,
            tax_code: 'txcd_99999999', // General - Tangible Goods
            metadata: {
              product_id: productId,
              card_finish: cardFinish || 'matte',
              custom_image_url: customImageUrl
            }
          }
        },
        quantity: parsedQuantity,
        adjustable_quantity: {
          enabled: true,
          minimum: 1,
          maximum: 100
        }
      });
    } else {
      // Use regular price ID for non-custom products
      lineItems.push({
        price: priceId,
        quantity: parsedQuantity,
        adjustable_quantity: {
          enabled: true,
          minimum: 1,
          maximum: 100
        }
      });
    }

    // Add display case line item if included
    if (includeDisplayCase && displayCasePriceId) {
      lineItems.push({
        price: displayCasePriceId,
        quantity: parsedDisplayCaseQuantity,
      });
    }

    // Get the appropriate shipping option for the customer's country
    const shippingOption = getShippingOptionForCountry(shippingAddress.country);

    // Create or update customer with shipping details
    let customerId: string | undefined;
    try {
      // Create a new customer with the shipping details
      const customer = await stripe.customers.create({
        email: shippingAddress.email,
        name: shippingAddress.name,
        shipping: {
          name: shippingAddress.name,
          address: {
            line1: shippingAddress.line1,
            line2: shippingAddress.line2 || undefined,
            city: shippingAddress.city,
            state: shippingAddress.state,
            postal_code: shippingAddress.postal_code,
            country: shippingAddress.country,
          },
        },
        metadata: {
          source: 'limited_edition_checkout',
          timestamp: new Date().toISOString(),
        },
      });
      customerId = customer.id;
    } catch {
      // Continue without customer ID if creation fails
    }

    console.log('📦 Creating checkout session with line items:', JSON.stringify(lineItems, null, 2));

    // Create Stripe checkout session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card', 'crypto'],
      line_items: lineItems,
      mode: 'payment',
      automatic_tax: {
        enabled: true
      },
      success_url: `${origin}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: cancelUrl,
      // Pass the customer ID to pre-fill their information
      ...(customerId && { customer: customerId }),
      // REQUIRED: When using shipping_address_collection with automatic_tax
      customer_update: {
        shipping: 'auto'
      },
      // Make billing address optional for credit purchases (not custom cards)
      billing_address_collection: isCustomCard ? 'required' : 'auto',
      // Add statement descriptor for custom cards
      ...(isCustomCard && {
        payment_intent_data: {
          statement_descriptor: 'CARDIFY CUSTOM',
          metadata: {
            custom_image_url: customImageUrl,
            card_finish: cardFinish || 'matte',
            ...(userId && { userId })
          }
        }
      }),
      // Let Stripe collect the shipping address and validate it
      shipping_address_collection: {
        allowed_countries: ALLOWED_SHIPPING_COUNTRIES,
      },
      // Only show the single appropriate shipping option
      shipping_options: [shippingOption],
      allow_promotion_codes: true,
      // Note: Consent collection requires Dashboard configuration
      // Go to Stripe Dashboard → Settings → Checkout settings and enable:
      // 1. "Collect consent to send promotional emails" 
      // 2. "Require customers to accept your terms of service" (with valid ToS URL)
      consent_collection: {
        promotions: 'auto', // Show marketing consent when required by law (when Dashboard enabled)
        terms_of_service: 'required', // Require terms of service acceptance (when Dashboard enabled)
      },
      custom_text: {
        submit: {
          message: isCustomCard 
            ? `We'll create your custom ${cardFinish || 'matte'} cards and ship within 7-10 business days`
            : 'We will ship your limited edition cards within 5-7 business days',
        },
        terms_of_service_acceptance: {
          message: 'By completing this purchase, you agree to our terms of service and privacy policy.',
        },
      },
      metadata: {
        quantity: parsedQuantity.toString(),
        includeDisplayCase: includeDisplayCase?.toString() || 'false',
        displayCaseQuantity: parsedDisplayCaseQuantity.toString(),
        shippingCountry: shippingAddress.country,
        timestamp: new Date().toISOString(),
        isCustomCard: isCustomCard?.toString() || 'false',
        ...(uploadId && { uploadId }),
        ...(customImageUrl && { customImageUrl }),
        ...(cardFinish && { cardFinish }),
        ...(userId && { userId }),
      },
    });

    // Note: Inventory will be decremented after successful payment via webhook
    // This prevents inventory reduction for abandoned checkouts

    // Return session information
    // Note: Order details will be saved in webhook after payment completion
    // when we have complete customer and shipping information

    return NextResponse.json(
      { 
        success: true,
        id: session.id,
        url: session.url,
        message: 'Checkout session created successfully',
        items: {
          cards: parsedQuantity,
          displayCases: includeDisplayCase ? parsedDisplayCaseQuantity : 0
        }
      },
      { status: 200 }
    );

  } catch (error: unknown) {
    console.error('Error creating checkout session:', error);
    
    // Handle specific Stripe errors
    if (error instanceof Stripe.errors.StripeError) {
      return NextResponse.json(
        { 
          error: 'Payment processing error',
          code: 'STRIPE_ERROR',
          details: error.message
        },
        { status: 500 }
      );
    }

    // Generic error response
    return NextResponse.json(
      { 
        error: 'Failed to create checkout session',
        code: 'SESSION_CREATION_FAILED'
      },
      { status: 500 }
    );
  }
}

/**
 * Export the POST handler with rate limiting applied
 * Using checkout configuration: 20 requests per 5 minutes per IP
 */
export const POST = withRateLimit(handleCheckoutSession, RateLimitConfigs.checkout);

/**
 * Handle other HTTP methods
 * Only POST is allowed for checkout session creation
 */
export async function GET() {
  return NextResponse.json(
    { error: 'Method not allowed', code: 'METHOD_NOT_ALLOWED' },
    { status: 405 }
  );
}

export async function PUT() {
  return NextResponse.json(
    { error: 'Method not allowed', code: 'METHOD_NOT_ALLOWED' },
    { status: 405 }
  );
}

/**
 * Handle marketplace checkout - unified with physical card checkout
 */
async function handleMarketplaceCheckout(
  request: NextRequest,
  listingId: string,
  quantity: number,
  includeDisplayCase: boolean,
  displayCaseQuantity: number,
  cardFinish: string,
  shippingAddress: any
): Promise<NextResponse> {
  const origin = request.headers.get('origin') || 'http://localhost:3000';
  
  // Get user ID if user is logged in using server-side Supabase client
  const supabase = createRouteHandlerClient({ cookies });
  let userId: string | null = null;
  try {
    const { data: { user } } = await supabase.auth.getUser();
    userId = user?.id || null;
    console.log('🔍 Marketplace checkout user debug:', {
      hasUser: !!user,
      userId: userId,
      userEmail: user?.email
    });
  } catch (error) {
    // User not logged in, continue with null userId
    console.log('No authenticated user for marketplace checkout:', error);
  }
  
  // Create customer from shipping address (same as physical card checkout)
  let customerId: string | undefined;
  try {
    const customer = await stripe.customers.create({
      email: shippingAddress.email,
      name: shippingAddress.name,
      shipping: {
        name: shippingAddress.name,
        address: {
          line1: shippingAddress.line1,
          line2: shippingAddress.line2,
          city: shippingAddress.city,
          state: shippingAddress.state,
          postal_code: shippingAddress.postal_code,
          country: shippingAddress.country,
        },
      },
    });
    customerId = customer.id;
  } catch (error) {
    console.error('Failed to create customer:', error);
    // Continue without customer ID
  }
  
  try {
    console.log('🛒 Processing marketplace checkout:', {
      listingId,
      quantity,
      includeDisplayCase,
      displayCaseQuantity,
      cardFinish
    });

    // Get listing details from database
    const { data: listing, error: listingError } = await supabase
      .from('marketplace_listings')
      .select(`
        id, 
        title, 
        price_cents, 
        currency, 
        status, 
        seller_id, 
        asset_id, 
        featured,
        asset:user_assets!inner (
          id, 
          image_url,
          series_id,
          series!left (
            id, 
            remaining_supply, 
            total_supply
          )
        )
      `)
      .eq('id', listingId)
      .eq('status', 'active')
      .single();

    if (listingError || !listing) {
      console.error('❌ Marketplace listing not found:', {
        listingId,
        error: listingError?.message,
        code: listingError?.code
      });
      
      return NextResponse.json(
        { 
          error: 'Listing not found or unavailable',
          code: 'LISTING_NOT_FOUND',
          details: listingError?.message
        },
        { status: 404 }
      );
    }

    // Get the asset image URL separately
    const { data: asset, error: assetError } = await supabase
      .from('user_assets')
      .select('image_url')
      .eq('id', listing.asset_id)
      .single();

    if (assetError) {
      console.error('❌ Asset not found:', {
        assetId: listing.asset_id,
        error: assetError?.message
      });
    }

    // Calculate pricing with bulk discounts (same as physical cards)
    const basePrice = listing.price_cents;
    const cardFinishPrice = (cardFinish === 'rainbow' || cardFinish === 'gloss') ? 400 : 0; // $4.00 in cents
    const basePriceWithFinish = basePrice + cardFinishPrice;
    
    // Apply bulk discount tiers (same as custom cards)
    let pricePerCard = basePriceWithFinish;
    let discountPercentage = 0;
    
    if (quantity >= 10) {
      discountPercentage = 50;
      pricePerCard = Math.floor(basePriceWithFinish * 0.50);
    } else if (quantity >= 5) {
      discountPercentage = 35;
      pricePerCard = Math.floor(basePriceWithFinish * 0.65);
    } else if (quantity >= 2) {
      discountPercentage = 25;
      pricePerCard = Math.floor(basePriceWithFinish * 0.75);
    }
    
    const cardsTotalCents = pricePerCard * quantity;
    
    // Add display case if requested
    const displayCasePriceCents = 1900; // $19.00 in cents
    const displayCaseTotalCents = includeDisplayCase ? (displayCasePriceCents * displayCaseQuantity) : 0;
    
    const totalAmountCents = cardsTotalCents + displayCaseTotalCents;

    // Create line items for Stripe
    const lineItems: Array<Stripe.Checkout.SessionCreateParams.LineItem> = [];
    
    // Main marketplace item
    const itemName = `${listing.title}${cardFinish !== 'matte' ? ` - ${cardFinish.charAt(0).toUpperCase() + cardFinish.slice(1)} Finish` : ''}`;
    lineItems.push({
      price_data: {
        currency: 'usd',
        unit_amount: pricePerCard,
        tax_behavior: 'exclusive' as const,
        product_data: {
          name: itemName,
          description: `Marketplace item from seller ${listing.seller_id}`,
          images: asset?.image_url ? [asset.image_url] : []
        }
      },
      quantity: quantity,
      adjustable_quantity: {
        enabled: true,
        minimum: 1,
        maximum: listing.asset?.series?.remaining_supply || 100
      }
    });

    // Display case if requested
    if (includeDisplayCase && displayCaseQuantity > 0) {
      lineItems.push({
        price_data: {
          currency: 'usd',
          unit_amount: displayCasePriceCents,
          tax_behavior: 'exclusive' as const,
          product_data: {
            name: 'Acrylic Display Case',
            description: 'Protective acrylic display case for trading cards'
          }
        },
        quantity: displayCaseQuantity
      });
    }

    // Create shipping option (same as physical cards)
    const shippingOption = getShippingOptionForCountry(shippingAddress.country);

    // Create metadata for webhook processing (same as physical cards)
    const metadata: Record<string, string> = {
      isMarketplace: 'true',
      listingId: listing.id,
      sellerId: listing.seller_id,
      quantity: quantity.toString(),
      cardFinish: cardFinish,
      includeDisplayCase: includeDisplayCase.toString(),
      displayCaseQuantity: displayCaseQuantity.toString(),
      basePriceCents: basePrice.toString(),
      pricePerCardCents: pricePerCard.toString(),
      discountPercentage: discountPercentage.toString(),
      totalPriceCents: totalAmountCents.toString(),
      shippingCountry: shippingAddress.country,
      timestamp: new Date().toISOString(),
      // Add image URL like physical cards
      custom_image_url: asset?.image_url || '',
      // Add user ID for logged-in users
      ...(userId && { userId: userId }),
    };

    // Debug: Log the metadata being passed
    console.log('🔍 Marketplace checkout metadata debug:', {
      userId: userId,
      hasUserId: !!userId,
      metadata: metadata
    });

    // Create Stripe checkout session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: lineItems,
      mode: 'payment',
      // automatic_tax: {
      //   enabled: true
      // },
      success_url: `${origin}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/marketplace`,
      ...(customerId && { customer: customerId }),
      // REQUIRED: When using shipping_address_collection with automatic_tax
      customer_update: {
        shipping: 'auto'
      },
      shipping_address_collection: {
        allowed_countries: ALLOWED_SHIPPING_COUNTRIES,
      },
      shipping_options: [shippingOption],
      allow_promotion_codes: true,
      metadata: metadata,
      // Add statement descriptor like physical cards
      payment_intent_data: {
        statement_descriptor: 'CARDIFY MARKETPLACE',
        metadata: {
          custom_image_url: asset?.image_url || '',
          card_finish: cardFinish || 'matte',
          isMarketplace: 'true',
          listingId: listing.id
        }
      }
    });

    console.log('✅ Marketplace checkout session created:', {
      sessionId: session.id,
      amount: totalAmountCents,
      listingId: listing.id
    });

    // Note: Order details will be saved in webhook after payment completion
    // when we have complete customer and shipping information

    return NextResponse.json({ url: session.url });

  } catch (error) {
    console.error('❌ Marketplace checkout failed:', error);
    
    // Log detailed error information
    console.error('💥 Error details:', {
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      listingId,
      quantity,
      cardFinish
    });
    
    return NextResponse.json(
      { 
        error: 'Failed to create marketplace checkout session',
        code: 'MARKETPLACE_CHECKOUT_FAILED',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

export async function DELETE() {
  return NextResponse.json(
    { error: 'Method not allowed', code: 'METHOD_NOT_ALLOWED' },
    { status: 405 }
  );
}

export async function PATCH() {
  return NextResponse.json(
    { error: 'Method not allowed', code: 'METHOD_NOT_ALLOWED' },
    { status: 405 }
  );
} 
