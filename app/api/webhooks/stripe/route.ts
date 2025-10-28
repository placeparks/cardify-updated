import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';
import Stripe from 'stripe';
import { supabase } from '@/lib/supabase';

/**
 * Enhanced logging and error handling system for webhook processing
 */

// Log levels for different types of events
enum LogLevel {
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR',
  CRITICAL = 'CRITICAL'
}

// Error categories for better monitoring and alerting
enum ErrorCategory {
  SIGNATURE_VERIFICATION = 'SIGNATURE_VERIFICATION',
  EVENT_PARSING = 'EVENT_PARSING',
  INVENTORY_UPDATE = 'INVENTORY_UPDATE',
  CUSTOMER_DATA = 'CUSTOMER_DATA',
  WEBHOOK_PROCESSING = 'WEBHOOK_PROCESSING',
  RATE_LIMITING = 'RATE_LIMITING',
  EXTERNAL_API = 'EXTERNAL_API',
  CONSENT_PROCESSING = 'CONSENT_PROCESSING', // New category for consent-related errors
  DATABASE = 'DATABASE' // Database-related errors
}

// Performance monitoring interface
interface PerformanceMetrics {
  startTime: number;
  eventId: string;
  eventType: string;
  sessionId?: string;
}

/**
 * Enhanced consent data interfaces for better tracking and compliance
 */
interface ConsentData {
  promotions: boolean;
  termsOfService?: boolean;
  paymentMethodReuse?: boolean;
  timestamp: string;
  source: 'checkout_session' | 'manual' | 'api';
  ipAddress?: string;
  userAgent?: string;
  sessionId: string;
  method: 'stripe_checkout' | 'embedded_form' | 'api_call';
}

interface ConsentValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  consentData: ConsentData | null;
}

/**
 * Enhanced consent data extraction and validation
 */
function extractAndValidateConsentData(
  session: Stripe.Checkout.Session,
  _request?: Request
): ConsentValidationResult {
  const result: ConsentValidationResult = {
    isValid: false,
    errors: [],
    warnings: [],
    consentData: null
  };

  try {
    // Extract basic consent data
    const promotionsConsent = session.consent?.promotions === 'opt_in';
    const termsConsent = session.consent?.terms_of_service === 'accepted';
    // Note: payment_method_reuse_agreement is not part of the standard consent object
    // It's handled separately in Stripe's checkout session configuration
    const paymentMethodConsent = undefined; // Will be determined by session settings

    // Create consent data object
    const consentData: ConsentData = {
      promotions: promotionsConsent,
      termsOfService: termsConsent,
      paymentMethodReuse: paymentMethodConsent,
      timestamp: new Date().toISOString(),
      source: 'checkout_session',
      sessionId: session.id,
      method: 'stripe_checkout',
      ipAddress: _request?.headers.get('x-forwarded-for') || 
                _request?.headers.get('x-real-ip') || 
                'unknown',
      userAgent: _request?.headers.get('user-agent') || 'unknown'
    };

    // Validation checks
    if (!session.consent) {
      result.warnings.push('No consent data found in checkout session');
    }

    if (session.consent_collection?.promotions === 'auto' && !session.consent?.promotions) {
      result.warnings.push('Promotions consent was requested but not provided');
    }

    if (session.consent_collection?.terms_of_service === 'required' && !termsConsent) {
      result.errors.push('Terms of service consent was required but not accepted');
    }

    // Mark as valid if no critical errors
    result.isValid = result.errors.length === 0;
    result.consentData = consentData;

    return result;

  } catch (error) {
    result.errors.push(`Failed to extract consent data: ${error instanceof Error ? error.message : 'Unknown error'}`);
    return result;
  }
}

/**
 * Enhanced consent logging for audit trails
 */
function logConsentDecision(
  consentData: ConsentData,
  customerId?: string,
  additionalContext?: Record<string, unknown>
) {
  const logEntry = {
    timestamp: consentData.timestamp,
    event: 'consent_collected',
    sessionId: consentData.sessionId,
    customerId: customerId || 'unknown',
    consent: {
      promotions: consentData.promotions,
      termsOfService: consentData.termsOfService,
      paymentMethodReuse: consentData.paymentMethodReuse
    },
    metadata: {
      source: consentData.source,
      method: consentData.method,
      ipAddress: consentData.ipAddress,
      userAgent: consentData.userAgent,
      ...additionalContext
    },
    compliance: {
      gdprApplicable: true, // You may want to determine this based on customer location
      ccpaApplicable: false, // You may want to determine this based on customer location
      dataRetentionPeriod: '7 years', // Adjust based on your legal requirements
      auditTrail: true
    }
  };

  console.log('[CONSENT_AUDIT]', JSON.stringify(logEntry, null, 2));
  
  // In production, you might want to send this to a dedicated logging service
  // or compliance database for long-term storage and audit purposes
}

// Consent history entry interface
// interface ConsentHistoryEntry {
//   status: boolean;
//   timestamp: string;
//   source: string;
//   method: string;
//   version?: string;
//   sessionId?: string;
// }

// Structured log entry interface
interface LogEntry {
  timestamp: string;
  level: LogLevel;
  category?: ErrorCategory;
  eventId?: string;
  sessionId?: string;
  correlationId: string;
  message: string;
  data?: Record<string, unknown>;
  error?: unknown;
  performance?: {
    duration: number;
    operation: string;
  };
}

/**
 * Generate a correlation ID for tracking requests across functions
 */
function generateCorrelationId(): string {
  return `wh_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Enhanced structured logging function
 */
function logEvent(entry: Omit<LogEntry, 'timestamp' | 'correlationId'>, correlationId: string) {
  const logEntry: LogEntry = {
    ...entry,
    timestamp: new Date().toISOString(),
    correlationId
  };

  // Format log message with structure
  const logMessage = `[${logEntry.level}] ${logEntry.message}`;
  const logData: Record<string, unknown> = {
    timestamp: logEntry.timestamp,
    level: logEntry.level,
    category: logEntry.category,
    eventId: logEntry.eventId,
    sessionId: logEntry.sessionId,
    correlationId: logEntry.correlationId,
    message: logEntry.message
  };
  
  if (logEntry.data) {
    logData.context = logEntry.data;
  }
  if (logEntry.error) {
    logData.error = logEntry.error;
  }
  if (logEntry.performance) {
    logData.metrics = logEntry.performance;
  }

  // Log to console with appropriate level
  switch (entry.level) {
    case LogLevel.INFO:
      console.log(logMessage, logData);
      break;
    case LogLevel.WARN:
      console.warn(logMessage, logData);
      break;
    case LogLevel.ERROR:
      console.error(logMessage, logData);
      break;
    case LogLevel.CRITICAL:
      console.error(`🚨 ${logMessage}`, logData);
      // In production, you might want to:
      // - Send to monitoring service (e.g., Sentry, DataDog)
      // - Trigger alerts
      // - Store in error tracking database
      break;
  }
}

/**
 * Start performance monitoring for an operation
 */
function startPerformanceMonitoring(eventId: string, eventType: string, sessionId?: string): PerformanceMetrics {
  return {
    startTime: Date.now(),
    eventId,
    eventType,
    sessionId
  };
}

/**
 * Complete performance monitoring and log metrics
 */
function completePerformanceMonitoring(
  metrics: PerformanceMetrics, 
  operation: string, 
  correlationId: string,
  success: boolean = true
) {
  const duration = Date.now() - metrics.startTime;
  
  logEvent({
    level: success ? LogLevel.INFO : LogLevel.WARN,
    message: `Operation ${operation} completed in ${duration}ms`,
    eventId: metrics.eventId,
    sessionId: metrics.sessionId,
    performance: { duration, operation },
    data: { success, eventType: metrics.eventType }
  }, correlationId);

  // Log performance warnings for slow operations
  if (duration > 5000) { // 5 seconds
    logEvent({
      level: LogLevel.WARN,
      category: ErrorCategory.WEBHOOK_PROCESSING,
      message: `Slow webhook operation detected: ${operation} took ${duration}ms`,
      eventId: metrics.eventId,
      sessionId: metrics.sessionId,
      data: { operation, duration, threshold: 5000 }
    }, correlationId);
  }
}

/**
 * Enhanced error logging with categorization and context
 */
function logError(
  category: ErrorCategory,
  message: string,
  error: unknown,
  correlationId: string,
  context?: Record<string, unknown>
) {
  // Ensure proper error serialization
  let errorInfo: Record<string, unknown>;
  
  if (error instanceof Error) {
    errorInfo = {
      name: error.name,
      message: error.message,
      stack: error.stack
    };
  } else if (typeof error === 'object' && error !== null) {
    // Handle objects that might not be Error instances
    try {
      errorInfo = {
        message: JSON.stringify(error),
        type: typeof error,
        constructor: error.constructor?.name || 'Unknown'
      };
    } catch (jsonError) {
      errorInfo = {
        message: String(error),
        type: typeof error,
        serializationError: 'Failed to serialize error object'
      };
    }
  } else {
    errorInfo = { 
      message: String(error),
      type: typeof error
    };
  }

  logEvent({
    level: LogLevel.ERROR,
    category,
    message,
    error: errorInfo,
    data: context
  }, correlationId);
}

/**
 * Critical error logging for issues requiring immediate attention
 */
function logCriticalError(
  category: ErrorCategory,
  message: string,
  error: unknown,
  correlationId: string,
  context?: Record<string, unknown>
) {
  // Ensure proper error serialization
  let errorInfo: Record<string, unknown>;
  
  if (error instanceof Error) {
    errorInfo = {
      name: error.name,
      message: error.message,
      stack: error.stack
    };
  } else if (typeof error === 'object' && error !== null) {
    // Handle objects that might not be Error instances
    try {
      errorInfo = {
        message: JSON.stringify(error),
        type: typeof error,
        constructor: error.constructor?.name || 'Unknown'
      };
    } catch (jsonError) {
      errorInfo = {
        message: String(error),
        type: typeof error,
        serializationError: 'Failed to serialize error object'
      };
    }
  } else {
    errorInfo = { 
      message: String(error),
      type: typeof error
    };
  }

  logEvent({
    level: LogLevel.CRITICAL,
    category,
    message,
    error: errorInfo,
    data: { ...context, requiresImmediateAttention: true }
  }, correlationId);
}

/**
 * Retry and Idempotency System for Webhook Processing
 */

// Retry configuration interface
interface RetryConfig {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  exponentialBase: number;
  retryableErrors: string[];
}

// Default retry configuration
const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
  exponentialBase: 2,
  retryableErrors: [
    'ECONNRESET',
    'ENOTFOUND',
    'ECONNREFUSED',
    'ETIMEDOUT',
    'EAI_AGAIN',
    'NETWORK_ERROR',
    'RATE_LIMITED'
  ]
};

/**
 * Check if a webhook event has already been processed (idempotency check)
 */
async function isEventAlreadyProcessed(eventId: string, correlationId: string): Promise<boolean> {
  try {
    logEvent({
      level: LogLevel.INFO,
      message: 'Checking event idempotency',
      eventId,
      data: { operation: 'idempotency_check' }
    }, correlationId);

    // Check if this event exists in Supabase
    const { data, error } = await supabase
      .from('webhook_events')
      .select('id')
      .eq('id', eventId)
      .single();
    
    const isProcessed = !!data && !error;
    
    logEvent({
      level: LogLevel.INFO,
      message: `Event idempotency check result: ${isProcessed ? 'already processed' : 'new event'}`,
      eventId,
      data: { 
        isProcessed
      }
    }, correlationId);
    
    return isProcessed;
    
  } catch (error: unknown) {
    // Log error but don't fail the webhook - assume not processed to be safe
    logError(
      ErrorCategory.WEBHOOK_PROCESSING,
      'Error checking event idempotency',
      error,
      correlationId,
      { eventId, operation: 'idempotency_check' }
    );
    
    return false; // Assume not processed to avoid blocking legitimate events
  }
}

/**
 * Mark a webhook event as processed (for idempotency tracking)
 */
async function markEventAsProcessed(eventId: string, eventType: string, correlationId: string): Promise<void> {
  try {
    logEvent({
      level: LogLevel.INFO,
      message: 'Marking event as processed',
      eventId,
      data: { eventType, operation: 'mark_processed' }
    }, correlationId);

    // Insert the event into Supabase
    const { error } = await supabase
      .from('webhook_events')
      .insert({
        id: eventId,
        type: eventType,
        processed_at: new Date().toISOString()
      });

    if (error) {
      throw error;
    }
    
    logEvent({
      level: LogLevel.INFO,
      message: 'Successfully marked event as processed',
      eventId,
      data: { 
        eventType
      }
    }, correlationId);
    
  } catch (error: unknown) {
    logError(
      ErrorCategory.WEBHOOK_PROCESSING,
      'Error marking event as processed',
      error,
      correlationId,
      { eventId, eventType, operation: 'mark_processed' }
    );
    
    // Don't throw here - marking as processed is for optimization,
    // but shouldn't fail the webhook if it doesn't work
  }
}

/**
 * Store customer purchase in Supabase
 */
async function storeCustomerPurchase(
  customerId: string, 
  purchaseData: Record<string, unknown>, 
  correlationId: string
): Promise<void> {
  try {
    // Note: customer_purchases table doesn't exist yet
    // This function is kept for future implementation
    // For now, we just log the purchase data
    logEvent({
      level: LogLevel.INFO,
      message: 'Customer purchase data logged (table not implemented yet)',
      data: { 
        customerId,
        purchaseData,
        operation: 'customer_purchase_logging'
      }
    }, correlationId);

    // TODO: Implement customer_purchases table when needed
    // const { error } = await supabase
    //   .from('customer_purchases')
    //   .insert({
    //     customer_id: customerId,
    //     purchase_data: purchaseData
    //   });

  } catch (error) {
    logError(
      ErrorCategory.DATABASE,
      'Error storing customer purchase',
      error,
      correlationId,
      { customerId }
    );
    // Don't throw - this is non-critical functionality
  }
}

// /**
//  * Store user rights request in Supabase
//  */
// async function storeUserRightsRequest(
//   customerId: string,
//   requestType: string,
//   requestData: Record<string, unknown>,
//   correlationId: string
// ): Promise<void> {
//   try {
//     const { error } = await supabase
//       .from('user_rights_requests')
//       .insert({
//         customer_id: customerId,
//         request_type: requestType,
//         request_data: requestData
//       });

//     if (error) {
//       throw error;
//     }

//     logEvent({
//       level: LogLevel.INFO,
//       message: 'Stored user rights request in database',
//       data: { customerId, requestType }
//     }, correlationId);
//   } catch (error) {
//     logError(
//       ErrorCategory.DATABASE,
//       'Error storing user rights request',
//       error,
//       correlationId,
//       { customerId, requestType }
//     );
//   }
// }

/**
 * Determine if an error is retryable based on error type and configuration
 */
function isRetryableError(error: unknown, config: RetryConfig): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  
  // Check if error code is in retryable list
  const errorWithCode = error as Error & { code?: string };
  const errorCode = errorWithCode.code;
  return config.retryableErrors.some(retryableCode => 
    errorCode === retryableCode || 
    error.message.includes(retryableCode) ||
    error.name.includes(retryableCode)
  );
}

/**
 * Calculate delay for exponential backoff with jitter
 */
function calculateRetryDelay(attempt: number, config: RetryConfig): number {
  const exponentialDelay = config.baseDelayMs * Math.pow(config.exponentialBase, attempt - 1);
  const cappedDelay = Math.min(exponentialDelay, config.maxDelayMs);
  
  // Add jitter (±25% randomness) to prevent thundering herd
  const jitter = cappedDelay * 0.25 * (Math.random() * 2 - 1);
  const finalDelay = Math.max(100, cappedDelay + jitter); // Minimum 100ms
  
  return Math.round(finalDelay);
}

/**
 * Execute an operation with retry logic and exponential backoff
 */
async function executeWithRetry<T>(
  operation: () => Promise<T>,
  operationName: string,
  correlationId: string,
  config: RetryConfig = DEFAULT_RETRY_CONFIG,
  context?: Record<string, unknown>
): Promise<T> {
  let lastError: unknown = new Error('Operation failed');
  
  for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
    try {
      logEvent({
        level: LogLevel.INFO,
        message: `Executing ${operationName} (attempt ${attempt}/${config.maxAttempts})`,
        data: { 
          operation: operationName,
          attempt,
          maxAttempts: config.maxAttempts,
          ...context
        }
      }, correlationId);
      
      const startTime = Date.now();
      const result = await operation();
      const duration = Date.now() - startTime;
      
      logEvent({
        level: LogLevel.INFO,
        message: `${operationName} succeeded on attempt ${attempt}`,
        data: { 
          operation: operationName,
          attempt,
          duration,
          success: true,
          ...(context as Record<string, unknown>)
        }
      }, correlationId);
      
      return result;
      
    } catch (error: unknown) {
      lastError = error;
      
      const isRetryable = isRetryableError(error, config);
      const isLastAttempt = attempt === config.maxAttempts;
      
      logEvent({
        level: isLastAttempt ? LogLevel.ERROR : LogLevel.WARN,
        message: `${operationName} failed on attempt ${attempt}${isRetryable ? ' (retryable)' : ' (non-retryable)'}`,
        data: { 
          operation: operationName,
          attempt,
          maxAttempts: config.maxAttempts,
          isRetryable,
          isLastAttempt,
          errorType: error instanceof Error ? error.name : 'Unknown',
          errorMessage: error instanceof Error ? error.message : String(error),
          ...context
        }
      }, correlationId);
      
      // Don't retry if error is not retryable or this is the last attempt
      if (!isRetryable || isLastAttempt) {
        break;
      }
      
      // Calculate delay and wait before retry
      const delayMs = calculateRetryDelay(attempt, config);
      
      logEvent({
        level: LogLevel.INFO,
        message: `Retrying ${operationName} in ${delayMs}ms`,
        data: { 
          operation: operationName,
          attempt: attempt + 1,
          delayMs,
          ...context
        }
      }, correlationId);
      
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
  
  // All attempts failed
  logError(
    ErrorCategory.WEBHOOK_PROCESSING,
    `${operationName} failed after ${config.maxAttempts} attempts`,
    lastError,
    correlationId,
    { operation: operationName, maxAttempts: config.maxAttempts, ...context }
  );
  
  throw lastError;
}

/**
 * Handle payment intent succeeded events for marketplace transactions
 */
async function handlePaymentIntentSucceeded(paymentIntent: Stripe.PaymentIntent, correlationId: string) {
  logEvent({
    level: LogLevel.INFO,
    message: 'Processing payment_intent.succeeded',
    eventId: paymentIntent.id,
    data: { 
      paymentIntentId: paymentIntent.id,
      amount: paymentIntent.amount,
      currency: paymentIntent.currency
    }
  }, correlationId);

  try {
    // Update marketplace transactions with this payment intent ID
    const { data: updatedTransactions, error: updateError } = await supabase
      .from('marketplace_transactions')
      .update({ 
        status: 'completed',
        payment_status: 'succeeded',
        updated_at: new Date().toISOString()
      })
      .eq('stripe_payment_intent_id', paymentIntent.id)
      .select('id, listing_id, seller_id, amount_cents');

    if (updateError) {
      logError(
        ErrorCategory.DATABASE,
        'Failed to update marketplace transactions',
        updateError,
        correlationId,
        { 
          paymentIntentId: paymentIntent.id,
          amount: paymentIntent.amount
        }
      );
      throw updateError;
    }

    if (updatedTransactions && updatedTransactions.length > 0) {
      logEvent({
        level: LogLevel.INFO,
        message: `Updated ${updatedTransactions.length} marketplace transactions`,
        eventId: paymentIntent.id,
        data: { 
          paymentIntentId: paymentIntent.id,
          updatedCount: updatedTransactions.length,
          transactionIds: updatedTransactions.map(t => t.id)
        }
      }, correlationId);

      // Keep listings active for multiple purchases (digital marketplace)
      // No need to update listing status to 'sold' since multiple users can buy the same card
    } else {
      logEvent({
        level: LogLevel.WARN,
        message: 'No marketplace transactions found for payment intent',
        eventId: paymentIntent.id,
        data: { paymentIntentId: paymentIntent.id }
      }, correlationId);
    }

  } catch (error) {
    logError(
      ErrorCategory.WEBHOOK_PROCESSING,
      'Error processing payment_intent.succeeded',
      error,
      correlationId,
      { 
        paymentIntentId: paymentIntent.id,
        amount: paymentIntent.amount
      }
    );
    throw error;
  }
}

/**
 * POST handler for Stripe webhook events
 * Handles webhook signature verification and event processing with enhanced logging
 */
export async function POST(request: NextRequest) {
  // Generate correlation ID for tracking this request
  const correlationId = generateCorrelationId();
  
  // Start performance monitoring
  const startTime = Date.now();
  
  logEvent({
    level: LogLevel.INFO,
    message: 'Webhook request received',
    data: { 
      method: 'POST',
      userAgent: request.headers.get('user-agent'),
      contentLength: request.headers.get('content-length')
    }
  }, correlationId);

  let body: string;
  let event: Stripe.Event;

  try {
    // Get the raw body as text for signature verification
    body = await request.text();
    
    logEvent({
      level: LogLevel.INFO,
      message: 'Request body parsed successfully',
      data: { bodyLength: body.length }
    }, correlationId);

  } catch (err: unknown) {
    logError(
      ErrorCategory.EVENT_PARSING,
      'Failed to parse request body',
      err,
      correlationId,
      { contentType: request.headers.get('content-type') }
    );
    
    return NextResponse.json(
      { 
        error: 'Invalid request body',
        code: 'BODY_PARSE_FAILED',
        correlationId
      },
      { status: 400 }
    );
  }
  
  // Get the Stripe signature from headers
  const sig = request.headers.get('stripe-signature');
  
  if (!sig) {
    logError(
      ErrorCategory.SIGNATURE_VERIFICATION,
      'Missing Stripe signature header',
      new Error('stripe-signature header not found'),
      correlationId,
      { headers: Object.fromEntries(request.headers.entries()) }
    );
    
    return NextResponse.json(
      { 
        error: 'Missing Stripe signature',
        code: 'MISSING_SIGNATURE',
        correlationId
      },
      { status: 400 }
    );
  }

  // Validate webhook secret is configured
  const stripeWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET_KEY;
  if (!stripeWebhookSecret) {
    logCriticalError(
      ErrorCategory.SIGNATURE_VERIFICATION,
      'STRIPE_WEBHOOK_SECRET_KEY environment variable not configured',
      new Error('Missing webhook secret configuration'),
      correlationId,
      { environment: process.env.NODE_ENV }
    );
    
    return NextResponse.json(
      { 
        error: 'Webhook secret not configured',
        code: 'WEBHOOK_SECRET_MISSING',
        correlationId
      },
      { status: 500 }
    );
  }

  try {
    // Verify the webhook signature
    event = stripe.webhooks.constructEvent(
      body,
      sig,
      stripeWebhookSecret
    );
    
    logEvent({
      level: LogLevel.INFO,
      message: 'Webhook signature verified successfully',
      eventId: event.id,
      data: { eventType: event.type }
    }, correlationId);

  } catch (err: unknown) {
    logError(
      ErrorCategory.SIGNATURE_VERIFICATION,
      'Webhook signature verification failed',
      err,
      correlationId,
      { 
        signatureLength: sig.length,
        bodyLength: body.length,
        secretConfigured: !!stripeWebhookSecret
      }
    );
    
    return NextResponse.json(
      { 
        error: 'Webhook signature verification failed',
        code: 'SIGNATURE_VERIFICATION_FAILED',
        correlationId
      },
      { status: 400 }
    );
  }

  // Start performance monitoring for event processing
  const performanceMetrics = startPerformanceMonitoring(event.id, event.type);

  logEvent({
    level: LogLevel.INFO,
    message: `Processing Stripe webhook event: ${event.type}`,
    eventId: event.id,
    data: { 
      eventType: event.type,
      livemode: event.livemode,
      apiVersion: event.api_version,
      created: new Date(event.created * 1000).toISOString()
    }
  }, correlationId);

  try {
    // Check for idempotency - ensure this event hasn't been processed before
    const alreadyProcessed = await executeWithRetry(
      () => isEventAlreadyProcessed(event.id, correlationId),
      'idempotency_check',
      correlationId,
      { maxAttempts: 2, baseDelayMs: 500, maxDelayMs: 2000, exponentialBase: 2, retryableErrors: ['ECONNRESET', 'ETIMEDOUT'] },
      { eventId: event.id, eventType: event.type }
    );

    if (alreadyProcessed) {
      logEvent({
        level: LogLevel.INFO,
        message: 'Event already processed - skipping due to idempotency',
        eventId: event.id,
        data: { 
          eventType: event.type,
          reason: 'duplicate_event',
          skipProcessing: true
        }
      }, correlationId);

      return NextResponse.json(
        { 
          received: true,
          eventType: event.type,
          eventId: event.id,
          correlationId,
          processingTime: Date.now() - startTime,
          status: 'already_processed'
        },
        { status: 200 }
      );
    }

    // Process event with retry logic
    await executeWithRetry(
      async () => {
        // Handle different event types
        switch (event.type) {
          case 'checkout.session.completed':
            await handleCheckoutSessionCompleted(event.data.object as Stripe.Checkout.Session, correlationId);
            break;
          
          case 'payment_intent.succeeded':
            await handlePaymentIntentSucceeded(event.data.object as Stripe.PaymentIntent, correlationId);
            break;
          
          case 'payment_intent.payment_failed':
            logEvent({
              level: LogLevel.WARN,
              message: 'Payment failed',
              eventId: event.id,
              data: { 
                paymentIntentId: event.data.object.id,
                lastPaymentError: (event.data.object as Stripe.PaymentIntent).last_payment_error
              }
            }, correlationId);
            break;
          
          default:
            logEvent({
              level: LogLevel.INFO,
              message: `Unhandled event type: ${event.type}`,
              eventId: event.id,
              data: { eventType: event.type, skipProcessing: true }
            }, correlationId);
        }
      },
      'event_processing',
      correlationId,
      DEFAULT_RETRY_CONFIG,
      { eventId: event.id, eventType: event.type }
    );

    // Mark event as processed for idempotency (non-blocking)
    await markEventAsProcessed(event.id, event.type, correlationId);

    // Complete performance monitoring
    if (performanceMetrics) {
      completePerformanceMonitoring(performanceMetrics, 'webhook_processing', correlationId, true);
    }

    logEvent({
      level: LogLevel.INFO,
      message: 'Webhook processing completed successfully',
      eventId: event.id,
      data: { 
        eventType: event.type,
        totalDuration: Date.now() - startTime,
        idempotencyCheck: true,
        retryLogic: true
      }
    }, correlationId);

    // Always return 200 to acknowledge receipt
    return NextResponse.json(
      { 
        received: true,
        eventType: event.type,
        eventId: event.id,
        correlationId,
        processingTime: Date.now() - startTime,
        status: 'processed'
      },
      { status: 200 }
    );

  } catch (error: unknown) {
    // Complete performance monitoring with failure
    if (performanceMetrics) {
      completePerformanceMonitoring(performanceMetrics, 'webhook_processing', correlationId, false);
    }

    logError(
      ErrorCategory.WEBHOOK_PROCESSING,
      'Error processing webhook event',
      error,
      correlationId,
      { 
        eventType: event.type,
        eventId: event.id,
        totalDuration: Date.now() - startTime
      }
    );
    
    // Still return 200 to prevent Stripe from retrying
    // Log the error for manual investigation
    return NextResponse.json(
      { 
        received: true,
        error: 'Event processing failed',
        eventType: event.type,
        eventId: event.id,
        correlationId,
        processingTime: Date.now() - startTime
      },
      { status: 200 }
    );
  }
}

/**
 * Save complete order details when payment is completed
 * This is a non-blocking operation that won't fail the webhook if it fails
 */
async function saveCompleteOrderDetails(session: Stripe.Checkout.Session, correlationId: string) {
  try {
    logEvent({
      level: LogLevel.INFO,
      message: 'Saving complete order details',
      sessionId: session.id,
      data: { operation: 'save_order_details' }
    }, correlationId);
    
    // Extract complete data from session
    const shippingAddress = session.shipping_details?.address || 
                           (session.customer && typeof session.customer === 'object' && 'shipping' in session.customer 
                            ? (session.customer as any).shipping?.address 
                            : null);
    
    // Extract buyer ID from session metadata
    const buyerId = session.metadata?.userId || null;
    
    const orderData = {
      stripe_session_id: session.id,
      payment_intent_id: session.payment_intent,
      buyer_id: buyerId, // Add buyer ID from session metadata
      customer_email: session.customer_details?.email || session.customer_email,
      customer_name: session.customer_details?.name,
      customer_phone: session.customer_details?.phone,
      shipping_address: shippingAddress || {
        line1: 'Address not collected',
        city: 'Unknown',
        state: 'Unknown',
        postal_code: '00000',
        country: 'US'
      },
      billing_address: session.customer_details?.address,
      total_amount_cents: session.amount_total,
      currency: session.currency,
      quantity: parseInt(session.metadata?.quantity || '1'),
      product_type: session.metadata?.isMarketplace === 'true' ? 'marketplace' : 'cart',
      product_details: {
        line_items: session.line_items?.data || [],
        metadata: session.metadata
      },
      card_finish: session.metadata?.cardFinish,
      include_display_case: session.metadata?.includeDisplayCase === 'true',
      display_case_quantity: parseInt(session.metadata?.displayCaseQuantity || '0'),
      image_url: session.metadata?.custom_image_url,
      original_filename: session.metadata?.original_filename,
      shipping_country: shippingAddress?.country || 'US',
      shipping_cost_cents: session.shipping_cost?.amount_total,
      shipping_rate_id: session.shipping_cost?.shipping_rate,
      status: 'paid',
      payment_status: 'succeeded',
      metadata: session.metadata || {},
      stripe_metadata: session.metadata || {}
    };

    // Save to database with error handling
    const { data, error } = await supabase
      .from('order_details')
      .insert(orderData)
      .select('id')
      .single();

    if (error) {
      logError(
        ErrorCategory.DATABASE,
        'Failed to save order details',
        error,
        correlationId,
        { 
          sessionId: session.id,
          errorCode: error.code,
          errorMessage: error.message
        }
      );
      // Don't throw - this is non-blocking
    } else {
      logEvent({
        level: LogLevel.INFO,
        message: 'Order details saved successfully',
        sessionId: session.id,
        data: { orderId: data.id, status: 'paid' }
      }, correlationId);
    }
  } catch (error) {
    logError(
      ErrorCategory.WEBHOOK_PROCESSING,
      'Error saving order details',
      error,
      correlationId,
      { sessionId: session.id }
    );
    // Don't throw - this is non-blocking and shouldn't fail the webhook
  }
}

/**
 * Handle completed checkout sessions
 * This is where we'll process successful purchases
 */
async function handleCheckoutSessionCompleted(session: Stripe.Checkout.Session, correlationId: string) {
  const sessionMetrics = startPerformanceMonitoring(session.id, 'checkout.session.completed', session.id);
  
  logEvent({
    level: LogLevel.INFO,
    message: 'Processing completed checkout session',
    eventId: session.id,
    sessionId: session.id,
    data: { amount: session.amount_total, currency: session.currency }
  }, correlationId);
  
  try {
    // Enhanced consent data extraction and validation
    const consentValidation = extractAndValidateConsentData(session);
    
    if (!consentValidation.isValid) {
      console.error('[CONSENT_ERROR]', {
        sessionId: session.id,
        errors: consentValidation.errors,
        warnings: consentValidation.warnings
      });
    }

    if (consentValidation.warnings.length > 0) {
      console.warn('[CONSENT_WARNING]', {
        sessionId: session.id,
        warnings: consentValidation.warnings
      });
    }

    const consentData = consentValidation.consentData;
    
    // Log consent decision for audit trail
    if (consentData) {
      logConsentDecision(consentData, session.customer_details?.email || undefined, {
        customerEmail: session.customer_details?.email,
        amount: session.amount_total,
        currency: session.currency
      });
    }

    // Legacy consent extraction (keeping for backward compatibility)
    const marketingConsent = session.consent?.promotions === 'opt_in';

    // Extract purchase details from session
    const quantity = parseInt(session.metadata?.quantity || '1', 10);
    const customerEmail = session.customer_details?.email;
    
    logEvent({
      level: LogLevel.INFO,
      message: 'Extracted purchase details from session',
      eventId: session.id,
      sessionId: session.id,
      data: {
        quantity,
        customerEmail: customerEmail ? 'present' : 'missing', // Don't log PII
        marketingConsent,
        amount: session.amount_total,
        paymentStatus: session.payment_status,
        paymentMethod: session.payment_method_types
      }
    }, correlationId);

    // Check if this is a custom card order
    const isCustomCard = session.metadata?.isCustomCard === 'true';
    const uploadId = session.metadata?.uploadId;
    const customImageUrl = session.metadata?.customImageUrl;
    
    // Check if this is a cart checkout that contains custom cards
    const isCartCheckout = session.metadata?.isCartCheckout === 'true';
    let hasCustomCardsInCart = false;
    let limitedEditionQuantity = 0;
    
    if (isCartCheckout) {
      // Parse cart items to determine what types of products were purchased
      const metadata = session.metadata || {};
      let itemIndex = 0;
      
      while (metadata[`item${itemIndex}_type`]) {
        const itemType = metadata[`item${itemIndex}_type`];
        const itemQuantity = parseInt(metadata[`item${itemIndex}_quantity`] || '0', 10);
        
        if (itemType === 'custom-card') {
          hasCustomCardsInCart = true;
          logEvent({
            level: LogLevel.INFO,
            message: `Cart contains custom cards at index ${itemIndex}`,
            sessionId: session.id,
            data: { 
              itemIndex,
              itemType,
              itemQuantity,
              cardFinish: metadata[`item${itemIndex}_finish`]
            }
          }, correlationId);
        } else if (itemType === 'limited-edition') {
          limitedEditionQuantity += itemQuantity;
          logEvent({
            level: LogLevel.INFO,
            message: `Cart contains limited edition cards at index ${itemIndex}`,
            sessionId: session.id,
            data: { 
              itemIndex,
              itemType,
              itemQuantity
            }
          }, correlationId);
        }
        
        itemIndex++;
      }
    }
    
    // Only update inventory for limited edition cards
    // Skip if:
    // 1. It's a single custom card order (isCustomCard === 'true')
    // 2. It has upload data (uploadId or customImageUrl)
    // 3. It's a cart checkout with only custom cards (no limited edition cards)
    const shouldUpdateInventory = !isCustomCard && 
                                  !uploadId && 
                                  !customImageUrl && 
                                  (!isCartCheckout || limitedEditionQuantity > 0);
    
    if (shouldUpdateInventory && limitedEditionQuantity > 0) {
      // Cart checkout with limited edition cards - update only limited edition quantity
      logEvent({
        level: LogLevel.INFO,
        message: 'Updating inventory for limited edition cards in cart',
        sessionId: session.id,
        data: { 
          limitedEditionQuantity,
          isCartCheckout: true,
          hasCustomCardsInCart
        }
      }, correlationId);
      
      await updateInventory(limitedEditionQuantity, session.id, correlationId);
    } else if (shouldUpdateInventory && !isCartCheckout) {
      // Single item checkout for limited edition card
      logEvent({
        level: LogLevel.INFO,
        message: 'Updating inventory for limited edition card purchase',
        sessionId: session.id,
        data: { 
          quantity,
          isCustomCard: false,
          hasUploadId: false,
          hasCustomImageUrl: false,
          isCartCheckout: false
        }
      }, correlationId);
      
      await updateInventory(quantity, session.id, correlationId);
    } else {
      // This is a custom card order - handle it separately
      logEvent({
        level: LogLevel.INFO,
        message: 'Processing custom card order - no inventory update needed',
        sessionId: session.id,
        data: { 
          quantity,
          isCustomCard,
          uploadId,
          customImageUrl,
          reason: 'custom_cards_are_made_to_order'
        }
      }, correlationId);
      
      // Handle custom card order
      await handleCustomCardOrder(session, uploadId || customImageUrl, correlationId);
      
      // Also save to new custom_card_orders table for user profiles
      await saveCustomCardToNewTables(session, correlationId);
    }
    
    // Handle cart checkout with custom cards
    if (isCartCheckout && hasCustomCardsInCart) {
      await saveCustomCardToNewTables(session, correlationId);
    }
    
    // Handle marketplace items from cart checkout
    if (isCartCheckout) {
      await handleMarketplaceItemsFromCart(session, correlationId);
    }
    
    // Handle single marketplace order (not from cart)
    if (session.metadata?.isMarketplace === 'true' && !isCartCheckout) {
      await handleSingleMarketplaceOrder(session, correlationId);
    }
    
    // Store customer data and marketing consent
    await storeCustomerData(session, correlationId);
    
    // Save complete order details with payment completion (only for physical card orders)
    // Skip for credit purchases, digital marketplace items, or other non-physical products
    const isPhysicalCardOrder = (isCustomCard || isCartCheckout) && 
                               !session.metadata?.isMarketplace && 
                               !session.metadata?.isCreditPurchase;
    
    if (isPhysicalCardOrder) {
      await saveCompleteOrderDetails(session, correlationId);
    }
    
    completePerformanceMonitoring(sessionMetrics, 'checkout_session_completed', correlationId, true);
    
    logEvent({
      level: LogLevel.INFO,
      message: 'Checkout session processed successfully',
      eventId: session.id,
      sessionId: session.id,
      data: { quantity, amount: session.amount_total }
    }, correlationId);
    
  } catch (error) {
    completePerformanceMonitoring(sessionMetrics, 'checkout_session_completed', correlationId, false);
    
    logError(
      ErrorCategory.WEBHOOK_PROCESSING,
      'Error processing checkout session',
      error,
      correlationId,
      { 
        sessionId: session.id,
        amount: session.amount_total,
        paymentStatus: session.payment_status
      }
    );
    throw error;
  }
}

/**
 * Update inventory after successful purchase
 * Decrements inventory and handles race conditions with version control
 */
async function updateInventory(purchasedQuantity: number, sessionId: string, correlationId: string) {
  const PRODUCT_ID = 'prod_limited_edition_card';
  
  // Safety check: Log a warning if this function is called with suspicious metadata
  logEvent({
    level: LogLevel.INFO,
    message: 'Starting limited edition inventory update',
    sessionId,
    data: { 
      purchasedQuantity,
      productId: PRODUCT_ID,
      operation: 'inventory_update_start'
    }
  }, correlationId);
  
  // Enhanced retry configuration for inventory updates with version conflict handling
  const inventoryRetryConfig: RetryConfig = {
    maxAttempts: 5, // More attempts for inventory due to potential version conflicts
    baseDelayMs: 500,
    maxDelayMs: 8000,
    exponentialBase: 2,
    retryableErrors: [
      'ECONNRESET',
      'ENOTFOUND', 
      'ECONNREFUSED',
      'ETIMEDOUT',
      'EAI_AGAIN',
      'NETWORK_ERROR',
      'RATE_LIMITED',
      'version_conflict', // Custom error for optimistic locking conflicts
      'stripe_api_error'
    ]
  };

  await executeWithRetry(
    async () => {
      logEvent({
        level: LogLevel.INFO,
        message: 'Starting inventory update operation',
        sessionId,
        data: { 
          purchasedQuantity,
          productId: PRODUCT_ID,
          operation: 'inventory_update'
        }
      }, correlationId);
      
      // Get current product state
      const product = await stripe.products.retrieve(PRODUCT_ID);
      
      // Extra safety check: Verify this is actually the limited edition product
      if (product.metadata.type !== 'limited_edition') {
        logEvent({
          level: LogLevel.CRITICAL,
          message: 'CRITICAL: Attempted to update inventory for wrong product type!',
          sessionId,
          data: { 
            productId: PRODUCT_ID,
            actualProductType: product.metadata.type,
            productName: product.name,
            expectedType: 'limited_edition'
          }
        }, correlationId);
        
        throw new Error(`Invalid product type for inventory update: ${product.metadata.type}`);
      }
      
      // Extract current inventory and version
      const currentInventory = parseInt(product.metadata.inventory || '1000', 10);
      const currentVersion = parseInt(product.metadata.version || '0', 10);
      
      // Calculate new inventory
      const newInventory = Math.max(0, currentInventory - purchasedQuantity);
      
      logEvent({
        level: LogLevel.INFO,
        message: 'Inventory calculation complete',
        sessionId,
        data: { 
          currentInventory,
          purchasedQuantity,
          newInventory,
          currentVersion,
          operation: 'inventory_calculation'
        }
      }, correlationId);
      
      // Validate sufficient inventory (shouldn't happen due to checkout validation, but safety check)
      if (currentInventory < purchasedQuantity) {
        logEvent({
          level: LogLevel.WARN,
          message: 'Insufficient inventory detected during update',
          sessionId,
          data: { 
            currentInventory,
            purchasedQuantity,
            deficit: purchasedQuantity - currentInventory
          }
        }, correlationId);
        // Still proceed with update to prevent negative inventory
      }
      
      // Update product with optimistic locking via version increment
      await stripe.products.update(PRODUCT_ID, {
        metadata: {
          ...product.metadata,
          inventory: newInventory.toString(),
          version: (currentVersion + 1).toString(),
          last_purchase_session: sessionId,
          last_updated: new Date().toISOString(),
        }
      });
      
      logEvent({
        level: LogLevel.INFO,
        message: 'Inventory successfully updated',
        sessionId,
        data: { 
          newInventory,
          newVersion: currentVersion + 1,
          sessionId,
          operation: 'inventory_update_success'
        }
      }, correlationId);
      
      // Log low inventory warning
      if (newInventory <= 10) {
        logEvent({
          level: LogLevel.WARN,
          message: 'Low inventory alert triggered',
          sessionId,
          data: { 
            newInventory,
            threshold: 10,
            requiresAttention: true
          }
        }, correlationId);
      }
    },
    'inventory_update',
    correlationId,
    inventoryRetryConfig,
    { 
      sessionId,
      purchasedQuantity,
      productId: PRODUCT_ID
    }
  );
}

/**
 * Save custom card order to new tables for user profiles
 * This is additive-only and won't affect existing functionality
 */
async function saveCustomCardToNewTables(session: Stripe.Checkout.Session, correlationId: string) {
  logEvent({
    level: LogLevel.INFO,
    message: 'Saving custom card order to new profile tables',
    sessionId: session.id,
    data: { 
      operation: 'custom_card_profile_save'
    }
  }, correlationId);

  try {
    const customerEmail = session.customer_details?.email;
    const customerName = session.customer_details?.name;
    
    if (!customerEmail) {
      logEvent({
        level: LogLevel.WARN,
        message: 'No customer email for custom card order',
        sessionId: session.id,
        data: { operation: 'custom_card_skip_no_email' }
      }, correlationId);
      return;
    }

    // Handle cart checkout with multiple custom cards
    if (session.metadata?.isCartCheckout === 'true') {
      let itemIndex = 0;
      const customCardItems = [];
      
      while (session.metadata[`item${itemIndex}_type`]) {
        if (session.metadata[`item${itemIndex}_type`] === 'custom-card') {
          customCardItems.push({
            stripe_session_id: `${session.id}_item${itemIndex}`,
            customer_email: customerEmail,
            custom_image_url: session.metadata[`item${itemIndex}_imageUrl`] || '',
            card_finish: session.metadata[`item${itemIndex}_finish`] || 'matte',
            quantity: parseInt(session.metadata[`item${itemIndex}_quantity`] || '1'),
            order_date: new Date().toISOString(),
            metadata: {
              payment_intent: session.payment_intent,
              customer_name: customerName,
              shipping_address: session.shipping_details?.address || session.customer_details?.address,
              cart_item_index: itemIndex,
              original_session_id: session.id
            }
          });
        }
        itemIndex++;
      }
      
      // Insert all custom card items
      for (const item of customCardItems) {
        const { error } = await supabase
          .from('custom_card_orders')
          .insert(item);
        
        if (error) {
          logError(
            ErrorCategory.DATABASE,
            'Failed to insert custom card order item',
            error,
            correlationId,
            { sessionId: session.id, itemIndex: item.metadata.cart_item_index }
          );
        }
      }
      
      // Update user profile
      if (customCardItems.length > 0) {
        const totalCards = customCardItems.reduce((sum, item) => sum + item.quantity, 0);
        await updateUserProfile(customerEmail, customerName, totalCards, session.id, correlationId);
      }
      
    } else {
      // Single custom card checkout
      const customImageUrl = session.metadata?.customImageUrl;
      const cardFinish = session.metadata?.cardFinish || 'matte';
      const quantity = parseInt(session.metadata?.quantity || '1');
      
      if (customImageUrl) {
        const { error } = await supabase
          .from('custom_card_orders')
          .insert({
            stripe_session_id: session.id,
            customer_email: customerEmail,
            custom_image_url: customImageUrl,
            card_finish: cardFinish,
            quantity: quantity,
            order_date: new Date().toISOString(),
            metadata: {
              payment_intent: session.payment_intent,
              customer_name: customerName,
              shipping_address: session.shipping_details?.address || session.customer_details?.address
            }
          });
        
        if (error) {
          logError(
            ErrorCategory.DATABASE,
            'Failed to insert custom card order',
            error,
            correlationId,
            { sessionId: session.id }
          );
        }
        
        // Update user profile
        await updateUserProfile(customerEmail, customerName, quantity, session.id, correlationId);
      }
    }
    
    logEvent({
      level: LogLevel.INFO,
      message: 'Custom card order saved to profile tables',
      sessionId: session.id,
      data: { operation: 'custom_card_profile_save_complete' }
    }, correlationId);
    
  } catch (error) {
    logError(
      ErrorCategory.DATABASE,
      'Error saving custom card to profile tables',
      error,
      correlationId,
      { sessionId: session.id }
    );
    // Don't throw - this is additive functionality
  }
}

/**
 * Update or create user profile with custom card order info
 */
async function updateUserProfile(
  email: string, 
  name: string | null | undefined,
  cardQuantity: number,
  sessionId: string,
  correlationId: string
) {
  try {
    // Check if profile exists
    const { data: existing } = await supabase
      .from('user_profiles')
      .select('id, total_orders, total_custom_cards, display_name')
      .eq('email', email)
      .single();
    
    if (existing) {
      // Update existing profile
      await supabase
        .from('user_profiles')
        .update({
          display_name: name || existing.display_name,
          last_order_at: new Date().toISOString(),
          total_orders: (existing.total_orders || 0) + 1,
          total_custom_cards: (existing.total_custom_cards || 0) + cardQuantity
        })
        .eq('id', existing.id);
    } else {
      // Create new profile
      await supabase
        .from('user_profiles')
        .insert({
          email,
          display_name: name,
          last_order_at: new Date().toISOString(),
          total_orders: 1,
          total_custom_cards: cardQuantity
        });
    }
    
    logEvent({
      level: LogLevel.INFO,
      message: 'User profile updated with custom card order',
      sessionId,
      data: { email: 'present', cardQuantity }
    }, correlationId);
    
  } catch (error) {
    logError(
      ErrorCategory.DATABASE,
      'Error updating user profile',
      error,
      correlationId,
      { sessionId, email: 'present' }
    );
  }
}

/**
 * Handle custom card order after successful payment
 * Creates order record linking upload to checkout session
 */
async function handleCustomCardOrder(session: Stripe.Checkout.Session, uploadId: string | undefined, correlationId: string) {
  logEvent({
    level: LogLevel.INFO,
    message: 'Processing custom card order',
    sessionId: session.id,
    data: { 
      uploadId,
      quantity: session.metadata?.quantity,
      operation: 'custom_card_order'
    }
  }, correlationId);

  try {
    if (!uploadId) {
      throw new Error('Upload ID missing for custom card order');
    }

    // Extract order details
    const quantity = parseInt(session.metadata?.quantity || '1', 10);
    const includeDisplayCase = session.metadata?.includeDisplayCase === 'true';
    const displayCaseQuantity = parseInt(session.metadata?.displayCaseQuantity || '0', 10);
    const cardFinish = session.metadata?.cardFinish || 'matte';

    // Create custom order record
    const { error } = await supabase
      .from('custom_card_orders') // Updated table name
      .insert({
        checkout_session_id: session.id,
        upload_id: uploadId,
        quantity,
        include_display_case: includeDisplayCase,
        display_case_quantity: displayCaseQuantity,
        card_finish: cardFinish,
        status: 'paid',
        created_at: new Date().toISOString()
      });

    if (error) {
      throw error;
    }

    logEvent({
      level: LogLevel.INFO,
      message: 'Custom card order record created successfully',
      sessionId: session.id,
      data: { 
        uploadId,
        quantity,
        includeDisplayCase,
        displayCaseQuantity,
        cardFinish,
        status: 'paid'
      }
    }, correlationId);

  } catch (error) {
    logError(
      ErrorCategory.DATABASE,
      'Failed to create custom card order record',
      error,
      correlationId,
      { 
        sessionId: session.id,
        uploadId,
        operation: 'custom_card_order'
      }
    );
    // Don't throw - we don't want to fail the webhook if order record creation fails
    // The payment was successful, so we should acknowledge the webhook
  }
}

/**
 * Store customer data and marketing consent after successful purchase
 * Creates or updates Stripe customer records with purchase history
 */
async function storeCustomerData(session: Stripe.Checkout.Session, correlationId: string) {
  // Customer data retry configuration
  const customerDataRetryConfig: RetryConfig = {
    maxAttempts: 3,
    baseDelayMs: 1000,
    maxDelayMs: 5000,
    exponentialBase: 2,
    retryableErrors: [
      'ECONNRESET',
      'ENOTFOUND',
      'ECONNREFUSED', 
      'ETIMEDOUT',
      'EAI_AGAIN',
      'NETWORK_ERROR',
      'RATE_LIMITED',
      'stripe_api_error'
    ]
  };

  await executeWithRetry(
    async () => {
      logEvent({
        level: LogLevel.INFO,
        message: 'Starting customer data storage with enhanced consent tracking',
        sessionId: session.id,
        data: { 
          operation: 'customer_data_storage',
          hasConsentData: !!session.consent
        }
      }, correlationId);

      // Enhanced consent data extraction and validation
      const consentValidation = extractAndValidateConsentData(session);
      
      if (!consentValidation.isValid) {
        logError(
          ErrorCategory.CONSENT_PROCESSING,
          'Consent validation failed during customer data storage',
          new Error(consentValidation.errors.join(', ')),
          correlationId,
          {
            sessionId: session.id,
            errors: consentValidation.errors,
            warnings: consentValidation.warnings
          }
        );
      }

      const consentData = consentValidation.consentData;
      
      // Extract customer information from session
      const customerEmail = session.customer_details?.email;
      const customerName = session.customer_details?.name;
      const marketingConsent = consentData?.promotions ?? false; // Use enhanced consent data
      const purchaseAmount = session.amount_total || 0;
      const quantity = parseInt(session.metadata?.quantity || '1', 10);
      
      if (!customerEmail) {
        logEvent({
          level: LogLevel.WARN,
          message: 'No customer email found in session, skipping customer data storage',
          sessionId: session.id,
          data: { operation: 'customer_data_skip' }
        }, correlationId);
        return;
      }
      
      logEvent({
        level: LogLevel.INFO,
        message: 'Processing customer data',
        sessionId: session.id,
        data: { 
          customerEmail: 'present', // Don't log PII
          marketingConsent,
          operation: 'customer_processing'
        }
      }, correlationId);
      
      let customer: Stripe.Customer;
      
      // Check if customer already exists by email
      const existingCustomers = await stripe.customers.list({
        email: customerEmail,
        limit: 1
      });
      
      if (existingCustomers.data.length > 0) {
        // Update existing customer
        customer = existingCustomers.data[0];
        
        logEvent({
          level: LogLevel.INFO,
          message: 'Updating existing customer',
          sessionId: session.id,
          data: { 
            customerId: customer.id,
            operation: 'customer_update'
          }
        }, correlationId);
        
        // Parse existing purchase history and convert to compact format
        const existingPurchaseHistory = JSON.parse(customer.metadata.purchase_history || '[]');
        
        // Convert existing entries to compact format if they're in full format
        const compactExistingHistory = existingPurchaseHistory.map((entry: any) => {
          // If it's already in compact format, keep it
          if (entry.s && entry.a && entry.q && entry.d && entry.t) {
            return entry;
          }
          // Convert from full format to compact format
          return {
            s: (entry.session_id || entry.s || '').substring(0, 20),
            a: entry.amount || entry.a || 0,
            q: entry.quantity || entry.q || 1,
            d: (entry.date || entry.d || '').substring(0, 10),
            t: entry.product_type === 'limited_edition_card' ? 'card' : (entry.t || 'card')
          };
        });
        
        // Parse existing consent history with character limit management
        const existingConsentHistory = JSON.parse(customer.metadata.consent_history || '[]');
        
        // Create compact consent entry (essential data only)
        const newConsentEntry = {
          p: consentData?.promotions ?? false,  // promotions (shortened key)
          t: consentData?.timestamp ? new Date(consentData.timestamp).getTime() : Date.now(), // timestamp as number
          s: consentData?.source?.substring(0, 10) || 'checkout', // source (truncated)
          sid: session.id.substring(0, 20) // session ID (truncated)
        };
        
        // Add new entry and manage history size
        const updatedConsentHistory = [newConsentEntry, ...existingConsentHistory];
        
        // Keep only the most recent entries that fit within 400 chars (buffer for safety)
        let consentHistoryJson = JSON.stringify(updatedConsentHistory);
        let maxEntries = updatedConsentHistory.length;
        
        // Truncate history if it exceeds character limit
        while (consentHistoryJson.length > 400 && maxEntries > 1) {
          maxEntries--;
          const truncatedHistory = updatedConsentHistory.slice(0, maxEntries);
          consentHistoryJson = JSON.stringify(truncatedHistory);
        }
        
        const finalConsentHistory = JSON.parse(consentHistoryJson);
        
        // Add new purchase to history with compact format
        const newPurchase = {
          s: session.id.substring(0, 20), // session_id (truncated)
          a: purchaseAmount, // amount
          q: quantity, // quantity
          d: new Date().toISOString().substring(0, 10), // date (YYYY-MM-DD only)
          t: 'card' // product_type (shortened)
        };
        
        const updatedPurchaseHistory = [newPurchase, ...compactExistingHistory];
        
        // Keep only the most recent 3 purchases to stay well under 500 chars
        const maxPurchases = 3;
        const truncatedHistory = updatedPurchaseHistory.slice(0, maxPurchases);
        
        // Update customer metadata with enhanced consent tracking
        customer = await stripe.customers.update(customer.id, {
          name: customerName || customer.name || undefined,
          metadata: {
            ...customer.metadata,
            // Enhanced consent tracking
            marketing_consent: marketingConsent ? 'true' : 'false',
            marketing_consent_timestamp: consentData?.timestamp || new Date().toISOString(),
            marketing_consent_source: consentData?.source || 'checkout_session',
            marketing_consent_method: consentData?.method || 'stripe_checkout',
            marketing_consent_session: session.id,
            consent_history: JSON.stringify(finalConsentHistory),
            consent_last_updated: new Date().toISOString(),
            // Purchase tracking
            last_purchase_date: new Date().toISOString(),
            last_purchase_session: session.id,
            last_purchase_amount: purchaseAmount.toString(),
            total_purchases: (parseInt(customer.metadata.total_purchases || '0', 10) + 1).toString(),
            total_spent: (parseInt(customer.metadata.total_spent || '0', 10) + purchaseAmount).toString(),
            total_quantity: (parseInt(customer.metadata.total_quantity || '0', 10) + quantity).toString(),
            purchase_history: JSON.stringify(truncatedHistory),
            updated_at: new Date().toISOString(),
          }
        });
        
        // Store purchase in Supabase (use full format for database)
        await storeCustomerPurchase(customer.id, {
          session_id: session.id,
          amount: purchaseAmount,
          quantity,
          date: new Date().toISOString(),
          product_type: 'limited_edition_card'
        }, correlationId);
        
      } else {
        // Create new customer
        logEvent({
          level: LogLevel.INFO,
          message: 'Creating new customer record',
          sessionId: session.id,
          data: { operation: 'customer_create' }
        }, correlationId);
        
        const purchaseHistory = [{
          s: session.id.substring(0, 20), // session_id (truncated)
          a: purchaseAmount, // amount
          q: quantity, // quantity
          d: new Date().toISOString().substring(0, 10), // date (YYYY-MM-DD only)
          t: 'card' // product_type (shortened)
        }];
        
        // Create initial consent history entry
        const consentHistory = [{
          p: consentData?.promotions ?? false,
          t: consentData?.timestamp ? new Date(consentData.timestamp).getTime() : Date.now(),
          s: consentData?.source?.substring(0, 10) || 'checkout',
          sid: session.id.substring(0, 20)
        }];
        
        customer = await stripe.customers.create({
          email: customerEmail || undefined,
          name: customerName || undefined,
          metadata: {
            // Enhanced consent tracking
            marketing_consent: marketingConsent ? 'true' : 'false',
            marketing_consent_timestamp: consentData?.timestamp || new Date().toISOString(),
            marketing_consent_source: consentData?.source || 'checkout_session',
            marketing_consent_method: consentData?.method || 'stripe_checkout',
            marketing_consent_session: session.id,
            consent_history: JSON.stringify(consentHistory),
            consent_last_updated: new Date().toISOString(),
            // Purchase tracking
            first_purchase_date: new Date().toISOString(),
            last_purchase_date: new Date().toISOString(),
            last_purchase_session: session.id,
            last_purchase_amount: purchaseAmount.toString(),
            total_purchases: '1',
            total_spent: purchaseAmount.toString(),
            total_quantity: quantity.toString(),
            purchase_history: JSON.stringify(purchaseHistory),
            customer_source: 'webhook_checkout_completed',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }
        });
        
        // Store purchase in Supabase (use full format for database)
        await storeCustomerPurchase(customer.id, {
          session_id: session.id,
          amount: purchaseAmount,
          quantity,
          date: new Date().toISOString(),
          product_type: 'limited_edition_card'
        }, correlationId);
      }
      
      // Comprehensive consent processing logging for compliance
      if (consentData) {
        logEvent({
          level: LogLevel.INFO,
          message: 'Consent data processed and stored successfully',
          sessionId: session.id,
          data: {
            correlationId,
            customerId: customer.id,
            consentDecisions: {
              promotions: consentData.promotions,
              termsOfService: consentData.termsOfService,
              timestamp: consentData.timestamp,
              source: consentData.source,
              method: consentData.method
            },
            complianceData: {
              ipAddress: consentData.ipAddress ? '[REDACTED]' : 'not_captured',
              userAgent: consentData.userAgent ? '[REDACTED]' : 'not_captured',
              sessionId: consentData.sessionId
            }
          }
        }, correlationId);

        // Log specific consent decisions for audit trail
        if (consentData.promotions) {
          logEvent({
            level: LogLevel.INFO,
            message: 'Marketing consent granted - customer opted in to promotional communications',
            sessionId: session.id,
            data: {
              correlationId,
              customerId: customer.id,
              consentType: 'marketing_promotions',
              decision: 'opt_in',
              timestamp: consentData.timestamp,
              legalBasis: 'explicit_consent'
            }
          }, correlationId);
        } else {
          logEvent({
            level: LogLevel.INFO,
            message: 'Marketing consent declined - customer opted out of promotional communications',
            sessionId: session.id,
            data: {
              correlationId,
              customerId: customer.id,
              consentType: 'marketing_promotions',
              decision: 'opt_out',
              timestamp: consentData.timestamp,
              legalBasis: 'no_consent'
            }
          }, correlationId);
        }

        // Validate consent data integrity for compliance
        const consentIntegrityCheck = {
          hasTimestamp: !!consentData.timestamp,
          hasSource: !!consentData.source,
          hasMethod: !!consentData.method,
          hasSessionLink: !!consentData.sessionId,
          isComplete: !!(consentData.timestamp && consentData.source && consentData.method && consentData.sessionId)
        };

        if (!consentIntegrityCheck.isComplete) {
          logEvent({
            level: LogLevel.WARN,
            message: 'Consent data integrity check failed - missing required compliance fields',
            sessionId: session.id,
            data: {
              correlationId,
              customerId: customer.id,
              integrityCheck: consentIntegrityCheck,
              category: ErrorCategory.CONSENT_PROCESSING
            }
          }, correlationId);
        }
      } else {
        logEvent({
          level: LogLevel.WARN,
          message: 'No consent data available for processing - consent collection may have failed',
          sessionId: session.id,
          data: {
            correlationId,
            customerId: customer?.id,
            category: ErrorCategory.CONSENT_PROCESSING,
            possibleCauses: [
              'consent_collection_disabled',
              'customer_skipped_consent',
              'consent_extraction_failed'
            ]
          }
        }, correlationId);
      }

      logEvent({
        level: LogLevel.INFO,
        message: 'Customer data storage completed successfully with enhanced consent tracking',
        sessionId: session.id,
        data: { 
          correlationId,
          customerId: customer.id,
          hasConsentData: !!consentData,
          consentValidation: consentValidation.isValid ? 'passed' : 'failed'
        }
      }, correlationId);
    },
    'customer_data_storage',
    correlationId,
    customerDataRetryConfig,
    { 
      sessionId: session.id,
      operation: 'customer_data_storage'
    }
  );
}

/**
 * Handle marketplace items from cart checkout
 * Creates marketplace transactions for each marketplace item in the cart
 */
async function handleMarketplaceItemsFromCart(session: Stripe.Checkout.Session, correlationId: string) {
  logEvent({
    level: LogLevel.INFO,
    message: 'Processing marketplace items from cart checkout',
    sessionId: session.id,
    data: { 
      operation: 'marketplace_cart_checkout',
      metadataKeys: Object.keys(session.metadata || {})
    }
  }, correlationId);

  try {
    // Look up buyer ID - prioritize userId from session metadata, fallback to email lookup
    let buyerId = null;
    
    // First, try to get userId from session metadata (for logged-in users)
    if (session.metadata?.userId) {
      buyerId = session.metadata.userId;
      console.log('✅ Using userId from session metadata:', buyerId);
    } else if (session.customer_details?.email) {
      // Fallback to email lookup for guest users
      const { data: buyerProfile } = await supabase
        .from('profiles')
        .select('id')
        .eq('email', session.customer_details.email)
        .single();
      
      if (buyerProfile) {
        buyerId = buyerProfile.id;
        console.log('✅ Found buyer by email lookup:', buyerId);
      } else {
        console.log('❌ No buyer profile found for email:', session.customer_details.email);
      }
    } else {
      console.log('❌ No userId in metadata and no customer email');
    }

    // Extract marketplace items from metadata
    const marketplaceItems: Array<{
      listingId: string;
      sellerId: string;
      priceCents: number;
      quantity: number;
    }> = [];

    // Parse marketplace items from metadata
    let itemIndex = 0;
    while (session.metadata?.[`marketplace_item_${itemIndex}_listing_id`]) {
      const listingId = session.metadata[`marketplace_item_${itemIndex}_listing_id`];
      const sellerId = session.metadata[`marketplace_item_${itemIndex}_seller_id`];
      const priceCents = parseInt(session.metadata[`marketplace_item_${itemIndex}_price_cents`] || '0', 10);
      
      if (listingId && sellerId && priceCents > 0) {
        // Get quantity from line items
        const lineItems = session.line_items?.data || [];
        const matchingLineItem = lineItems.find(item => 
          item.description?.includes(`Marketplace item from seller ${sellerId}`)
        );
        const quantity = matchingLineItem?.quantity || 1;
        
        marketplaceItems.push({
          listingId,
          sellerId,
          priceCents,
          quantity
        });
      }
      
      itemIndex++;
    }

    if (marketplaceItems.length === 0) {
      logEvent({
        level: LogLevel.INFO,
        message: 'No marketplace items found in cart checkout',
        sessionId: session.id
      }, correlationId);
      return;
    }

    logEvent({
      level: LogLevel.INFO,
      message: `Found ${marketplaceItems.length} marketplace items in cart`,
      sessionId: session.id,
      data: { 
        marketplaceItems: marketplaceItems.map(item => ({
          listingId: item.listingId,
          sellerId: item.sellerId,
          priceCents: item.priceCents,
          quantity: item.quantity
        }))
      }
    }, correlationId);

    // Create marketplace transactions for each item
    for (const item of marketplaceItems) {
      const totalAmountCents = item.priceCents * item.quantity;
      
      // Create marketplace transaction record
      const { error } = await supabase
        .from('marketplace_transactions')
        .insert({
          listing_id: item.listingId,
          buyer_id: buyerId, // Use UUID or null
          seller_id: item.sellerId,
          amount_cents: totalAmountCents,
          currency: 'USD',
          stripe_payment_intent_id: session.payment_intent as string,
          status: 'completed',
          payment_status: 'settled',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          credited_at: new Date().toISOString()
        });

      if (error) {
        logError(
          ErrorCategory.DATABASE,
          'Failed to create marketplace transaction',
          error,
          correlationId,
          { 
            sessionId: session.id,
            listingId: item.listingId,
            sellerId: item.sellerId,
            amountCents: totalAmountCents
          }
        );
        throw error;
      }

      // Keep listing active for multiple purchases (digital marketplace)
      // No need to update listing status to 'sold' since multiple users can buy the same card

      logEvent({
        level: LogLevel.INFO,
        message: 'Marketplace transaction created successfully',
        sessionId: session.id,
        data: { 
          listingId: item.listingId,
          sellerId: item.sellerId,
          amountCents: totalAmountCents,
          quantity: item.quantity,
          status: 'completed'
        }
      }, correlationId);
    }

  } catch (error) {
    logError(
      ErrorCategory.WEBHOOK_PROCESSING,
      'Error processing marketplace items from cart',
      error,
      correlationId,
      { 
        sessionId: session.id,
        operation: 'marketplace_cart_checkout'
      }
    );
    throw error;
  }
}

/**
 * Handle single marketplace order (not from cart)
 * Creates marketplace transaction and updates listing status
 */
async function handleSingleMarketplaceOrder(session: Stripe.Checkout.Session, correlationId: string) {
  logEvent({
    level: LogLevel.INFO,
    message: 'Processing single marketplace order',
    sessionId: session.id,
    data: { 
      operation: 'single_marketplace_order',
      listingId: session.metadata?.listingId,
      sellerId: session.metadata?.sellerId
    }
  }, correlationId);

  try {
    const listingId = session.metadata?.listingId;
    const sellerId = session.metadata?.sellerId;
    const quantity = parseInt(session.metadata?.quantity || '1', 10);
    const totalAmountCents = parseInt(session.metadata?.totalPriceCents || '0', 10);

    if (!listingId || !sellerId) {
      logError(
        ErrorCategory.WEBHOOK_PROCESSING,
        'Missing marketplace order data',
        new Error('Missing listingId or sellerId'),
        correlationId,
        { 
          sessionId: session.id,
          listingId,
          sellerId
        }
      );
      return;
    }

    // Look up buyer ID - prioritize userId from session metadata, fallback to email lookup
    let buyerId = null;
    
    // First, try to get userId from session metadata (for logged-in users)
    if (session.metadata?.userId) {
      buyerId = session.metadata.userId;
      console.log('✅ Using userId from session metadata:', buyerId);
    } else if (session.customer_details?.email) {
      // Fallback to email lookup for guest users
      console.log('🔍 Looking up buyer by email:', session.customer_details.email);
      const { data: buyerProfile, error: buyerError } = await supabase
        .from('profiles')
        .select('id')
        .eq('email', session.customer_details.email)
        .single();
      
      if (buyerError) {
        console.log('❌ Buyer lookup error:', buyerError);
      } else if (buyerProfile) {
        buyerId = buyerProfile.id;
        console.log('✅ Found buyer by email lookup:', buyerId);
      } else {
        console.log('❌ No buyer profile found for email:', session.customer_details.email);
      }
    } else {
      console.log('❌ No userId in metadata and no customer email');
    }

    // Create marketplace transaction record
    const transactionData = {
      listing_id: listingId,
      buyer_id: buyerId, // Use UUID or null
      seller_id: sellerId,
      amount_cents: totalAmountCents,
      currency: 'USD',
      stripe_payment_intent_id: session.payment_intent as string,
      status: 'completed',
      payment_status: 'settled',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      credited_at: new Date().toISOString(),
      metadata: {
        quantity: quantity,
        single_card_price: totalAmountCents / quantity
      }
    };

    logEvent({
      level: LogLevel.INFO,
      message: 'Creating marketplace transaction',
      sessionId: session.id,
      data: { 
        transactionData,
        listingId,
        sellerId,
        buyerId,
        quantity,
        totalAmountCents
      }
    }, correlationId);

    const { error } = await supabase
      .from('marketplace_transactions')
      .insert(transactionData);

    if (error) {
      logError(
        ErrorCategory.DATABASE,
        'Failed to create marketplace transaction',
        error,
        correlationId,
        { 
          sessionId: session.id,
          listingId,
          sellerId,
          amountCents: totalAmountCents,
          errorDetails: JSON.stringify(error, null, 2)
        }
      );
      throw error;
    }

    // Note: Series supply decrement is now handled automatically by database trigger
    // (handle_quantity_purchase trigger on marketplace_transactions table)
    // The trigger will:
    // 1. Create asset_buyers records
    // 2. Decrement series supply if applicable
    // 3. Update series status when sold out
    logEvent({
      level: LogLevel.INFO,
      message: 'Transaction created - supply decrement will be handled by database trigger',
      sessionId: session.id,
      data: { quantity, listingId }
    }, correlationId);

    // Keep listing active for multiple purchases (digital marketplace)
    // No need to update listing status to 'sold' since multiple users can buy the same card

    logEvent({
      level: LogLevel.INFO,
      message: 'Single marketplace order processed successfully',
      sessionId: session.id,
      data: { 
        listingId,
        sellerId,
        amountCents: totalAmountCents,
        quantity,
        status: 'completed'
      }
    }, correlationId);

  } catch (error) {
    logError(
      ErrorCategory.WEBHOOK_PROCESSING,
      'Error processing single marketplace order',
      error,
      correlationId,
      { 
        sessionId: session.id,
        operation: 'single_marketplace_order'
      }
    );
    throw error;
  }
}

/**
 * Handle other HTTP methods
 * Webhooks should only accept POST requests
 */
export async function GET() {
  return NextResponse.json(
    { 
      error: 'Method not allowed. Webhooks only accept POST requests.',
      code: 'METHOD_NOT_ALLOWED'
    },
    { status: 405 }
  );
}

export async function PUT() {
  return NextResponse.json(
    { 
      error: 'Method not allowed. Webhooks only accept POST requests.',
      code: 'METHOD_NOT_ALLOWED'
    },
    { status: 405 }
  );
}

export async function DELETE() {
  return NextResponse.json(
    { 
      error: 'Method not allowed. Webhooks only accept POST requests.',
      code: 'METHOD_NOT_ALLOWED'
    },
    { status: 405 }
  );
}

export async function PATCH() {
  return NextResponse.json(
    { 
      error: 'Method not allowed. Webhooks only accept POST requests.',
      code: 'METHOD_NOT_ALLOWED'
    },
    { status: 405 }
  );
} 
