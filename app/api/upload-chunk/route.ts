import { NextRequest, NextResponse } from 'next/server'
import { v4 as uuidv4 } from 'uuid'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(req: NextRequest) {
  try {
    const data = await req.json()
    const { chunk, chunkIndex, totalChunks, fileId } = data

    if (!chunk || chunkIndex === undefined || !totalChunks || !fileId) {
      return NextResponse.json(
        { error: 'Missing required chunk upload data' },
        { status: 400 }
      )
    }

    // Convert base64 chunk to buffer
    const buffer = Buffer.from(chunk, 'base64')

    // Check if this is the last chunk
    const isLastChunk = chunkIndex === totalChunks - 1

    if (isLastChunk) {
      // For single chunk uploads, process immediately
      if (totalChunks === 1) {
        // Create form data for Pinata
        const formData = new FormData()
        const file = new File([buffer], 'card-image.jpg', { type: 'image/jpeg' })
        formData.append('file', file)

        // Add metadata
        const metadata = JSON.stringify({
          name: 'Cardify Card Image',
          description: 'AI-generated trading card image',
          keyvalues: {
            type: 'cardify-card',
            generated: new Date().toISOString()
          }
        })
        formData.append('pinataMetadata', metadata)

        // Add options
        const options = JSON.stringify({
          cidVersion: 1
        })
        formData.append('pinataOptions', options)

        // Check if Pinata JWT is configured
        if (!process.env.NEXT_PUBLIC_PINATA_JWT) {
          throw new Error('Pinata JWT not configured. Please set NEXT_PUBLIC_PINATA_JWT environment variable.')
        }

        // Upload to Pinata
        const pinataResponse = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.NEXT_PUBLIC_PINATA_JWT}`,
          },
          body: formData,
        })

        if (!pinataResponse.ok) {
          const errorText = await pinataResponse.text()
          console.error('Pinata upload error:', errorText)
          throw new Error(`Failed to upload to Pinata: ${pinataResponse.status} ${errorText}`)
        }

        const result = await pinataResponse.json()
        const pinataUrl = `https://gateway.pinata.cloud/ipfs/${result.IpfsHash}`

        return NextResponse.json({
          success: true,
          pinataUrl,
          ipfsHash: result.IpfsHash
        })
      } else {
        // For multi-chunk uploads, we need a different approach
        // Since serverless functions don't persist memory between requests,
        // we'll need to use a different strategy
        return NextResponse.json({
          success: false,
          error: 'Multi-chunk uploads not supported in serverless environment. Please use single chunk upload.'
        }, { status: 400 })
      }
    }

    // If not the last chunk, return success for this chunk
    return NextResponse.json({
      success: true,
      chunkIndex,
      message: 'Chunk uploaded successfully'
    })

  } catch (error) {
    console.error('Error handling chunk upload:', error)
    console.error('Error details:', {
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      name: error instanceof Error ? error.name : undefined
    })
    return NextResponse.json(
      { 
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
        details: process.env.NODE_ENV === 'development' ? error : undefined
      },
      { status: 500 }
    )
  }
}
