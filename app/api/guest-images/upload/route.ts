// app/api/guest-images/upload/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
// Note: cropImageToAspectRatio not available in serverless environment

export const dynamic = 'force-dynamic'

// Increase body size limit to 10MB for base64 images
export const maxDuration = 30 // 30 seconds timeout
export const runtime = 'nodejs' // Use Node.js runtime for better performance

// Next.js API route config to handle large payloads
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb',
    },
  },
}

// ===== Supabase (service-role; RLS bypass) ======================================================
const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

// ===== Types ====================================================================================
interface GuestImageUploadRequest {
  imageUrl: string
  deviceId: string
  sessionId?: string
  prompt?: string
  generationOptions?: Record<string, any>
  generationTimeMs?: number
}

// ===== Route ====================================================================================
export async function GET() {
  return NextResponse.json({ 
    error: 'Method not allowed',
    message: 'This endpoint only accepts POST requests for uploading guest images'
  }, { status: 405 })
}

export async function POST(req: NextRequest) {
  try {
    console.log('🚀 Guest image upload API called')
    
    const {
      imageUrl,
      deviceId,
      sessionId,
      prompt,
      generationOptions = {},
      generationTimeMs
    }: GuestImageUploadRequest = await req.json()
    
    console.log('📦 Request data:', { 
      deviceId, 
      sessionId, 
      hasImageUrl: !!imageUrl,
      hasPrompt: !!prompt 
    })

    if (!imageUrl || !deviceId) {
      return NextResponse.json({ 
        error: 'Missing required fields: imageUrl and deviceId are required' 
      }, { status: 400 })
    }

    // ===== Download and process image ============================================================
    console.log('📥 Downloading image from URL...')
    const imageResponse = await fetch(imageUrl)
    if (!imageResponse.ok) {
      throw new Error(`Failed to download image: ${imageResponse.statusText}`)
    }
    
    const imageBlob = await imageResponse.blob()
    
    // Check file size (limit to 5MB for Vercel function limits - actual limit is 6MB)
    const maxSize = 5 * 1024 * 1024 // 5MB limit (safe margin below 6MB Vercel limit)
    let file: File
    let fileName: string
    
    if (imageBlob.size > maxSize) {
      console.warn(`⚠️ Image too large: ${imageBlob.size} bytes, skipping guest storage...`)
      
      // For large images, skip guest storage but don't fail the request
      return NextResponse.json({ 
        success: true,
        message: 'Image too large for guest storage, but generation completed successfully',
        skipped: true,
        reason: `Image size (${Math.round(imageBlob.size / 1024 / 1024)}MB) exceeds the 5MB limit for guest storage`
      })
    }
    
    file = new File([imageBlob], 'guest-generated-card.png', { type: imageBlob.type })
    fileName = `guest-${deviceId}-${Date.now()}.png`
    
    // Skip cropping for guest images (server-side cropping not available)
    // Guest images will be used as-is for simplicity
    console.log('📝 Using original image for guest storage (no server-side cropping)')
    const finalFile = file
    console.log(`📊 Final file size: ${finalFile.size} bytes (${Math.round(finalFile.size / 1024 / 1024)}MB)`)
    
    // ===== Upload to storage =====================================================================
    console.log('☁️ Uploading to storage...')
    const storagePath = `guest-generated-images/${fileName}`
    
    const { data: uploadData, error: uploadError } = await admin.storage
      .from('guest-generated-images')
      .upload(storagePath, finalFile, {
        contentType: 'image/png',
        cacheControl: '3600',
        upsert: false
      })

    if (uploadError) {
      console.error('Storage upload error:', uploadError)
      return NextResponse.json({ 
        error: 'Failed to upload image to storage',
        details: uploadError.message 
      }, { status: 500 })
    }

    // Get public URL
    const { data: urlData } = admin.storage
      .from('guest-generated-images')
      .getPublicUrl(storagePath)

    const publicUrl = urlData.publicUrl

    // ===== Save to database ======================================================================
    console.log('💾 Saving to database...')
    const { data: dbRecord, error: dbError } = await admin
      .from('guest_generated_images')
      .insert({
        device_id: deviceId,
        session_id: sessionId,
        image_url: publicUrl,
        storage_path: storagePath,
        file_name: fileName,
        file_size: finalFile.size,
        mime_type: 'image/png',
        prompt: prompt || null,
        generation_options: generationOptions,
        generation_time_ms: generationTimeMs || null,
        processed_image_url: publicUrl, // Same as image_url for now
        aspect_ratio: 0.714, // 2.5:3.5 aspect ratio
        status: 'active'
      })
      .select()
      .single()

    if (dbError) {
      console.error('Database insert error:', dbError)
      // Try to clean up the uploaded file
      await admin.storage
        .from('guest-generated-images')
        .remove([storagePath])
        .catch(console.error)
      
      return NextResponse.json({ 
        error: 'Failed to save image metadata to database',
        details: dbError.message 
      }, { status: 500 })
    }

    console.log('✅ Guest image uploaded successfully:', dbRecord.id)

    // ===== Response =============================================================================
    return NextResponse.json({
      success: true,
      imageId: dbRecord.id,
      imageUrl: publicUrl,
      storagePath: storagePath,
      fileName: fileName,
      message: 'Image uploaded and saved successfully'
    })

  } catch (error) {
    console.error('Guest image upload error:', error)
    return NextResponse.json({ 
      error: 'Image upload failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}
