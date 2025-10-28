import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'

// Configure route to handle larger payloads
export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * Compress image to reduce file size before uploading to Pinata
 * Target: Max 2MB, Quality 85%, Max dimensions 2048x2048
 */
async function compressImage(buffer: Buffer): Promise<Buffer> {
  try {
    // Try to use sharp for better compression
    const sharp = await import('sharp').catch(() => null)
    
    if (sharp) {
      return await sharp.default(buffer)
        .resize(2048, 2048, {
          fit: 'inside',
          withoutEnlargement: true
        })
        .jpeg({ quality: 85, progressive: true })
        .toBuffer()
    }
    
    // Fallback: return original buffer if sharp not available
    console.warn('Sharp not available, using original image')
    return buffer
  } catch (error) {
    console.error('Image compression failed:', error)
    return buffer // Return original on error
  }
}

export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get('content-type')
    
    let file: File
    
    if (contentType?.includes('application/json')) {
      // Handle JSON request with imageUrl
      const { imageUrl } = await req.json()
      
      if (!imageUrl) {
        return NextResponse.json(
          { error: 'Image URL is required' },
          { status: 400 }
        )
      }

      // Fetch the image from the URL
      const imageResponse = await fetch(imageUrl)
      if (!imageResponse.ok) {
        throw new Error('Failed to fetch image')
      }

      const imageBuffer = await imageResponse.arrayBuffer()
      
      // Compress image to reduce size (max 2MB)
      const compressedBuffer = await compressImage(Buffer.from(imageBuffer))
      
      // Convert Buffer to Uint8Array for Blob
      const uint8Array = new Uint8Array(compressedBuffer)
      const blob = new Blob([uint8Array], { type: 'image/jpeg' })
      file = new File([blob], 'card-image.jpg', { type: 'image/jpeg' })
    } else {
      // Handle FormData request with file
      const formData = await req.formData()
      const uploadedFile = formData.get('file') as File
      
      if (!uploadedFile) {
        return NextResponse.json(
          { error: 'File is required' },
          { status: 400 }
        )
      }

      // Check file size (10MB limit)
      const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB in bytes
      if (uploadedFile.size > MAX_FILE_SIZE) {
        return NextResponse.json(
          { 
            error: 'File too large. Please upload an image under 10MB.',
            details: {
              fileSize: uploadedFile.size,
              maxSize: MAX_FILE_SIZE,
              sizeInMB: Math.round(uploadedFile.size / (1024 * 1024))
            }
          },
          { status: 413 }
        )
      }

      // Validate file type
      if (!uploadedFile.type.startsWith('image/')) {
        return NextResponse.json(
          { error: 'Only image files are allowed' },
          { status: 400 }
        )
      }
      
      // Compress uploaded file as well
      const fileBuffer = Buffer.from(await uploadedFile.arrayBuffer())
      const compressedBuffer = await compressImage(fileBuffer)
      
      // Convert Buffer to Uint8Array for Blob
      const uint8Array = new Uint8Array(compressedBuffer)
      const blob = new Blob([uint8Array], { type: 'image/jpeg' })
      file = new File([blob], 'card-image.jpg', { type: 'image/jpeg' })
    }

    const pinataFormData = new FormData()
    pinataFormData.append('file', file)
    
    // Add metadata
    const metadata = JSON.stringify({
      name: 'Cardify Card Image',
      description: 'AI-generated trading card image',
      keyvalues: {
        type: 'cardify-card',
        generated: new Date().toISOString()
      }
    })
    pinataFormData.append('pinataMetadata', metadata)
    
    // Add options
    const options = JSON.stringify({
      cidVersion: 1
    })
    pinataFormData.append('pinataOptions', options)

    // Upload to Pinata using JWT
    const pinataResponse = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.NEXT_PUBLIC_PINATA_JWT}`,
      },
      body: pinataFormData,
    })

    if (!pinataResponse.ok) {
      const errorText = await pinataResponse.text()
      console.error('Pinata upload failed:', errorText)
      throw new Error('Failed to upload to Pinata')
    }

    const result = await pinataResponse.json()
    const pinataUrl = `https://gateway.pinata.cloud/ipfs/${result.IpfsHash}`

    return NextResponse.json({
      success: true,
      pinataUrl,
      ipfsHash: result.IpfsHash
    })

  } catch (error) {
    console.error('Error uploading to Pinata:', error)
    return NextResponse.json(
      { 
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      },
      { status: 500 }
    )
  }
}
