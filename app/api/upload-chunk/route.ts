import { NextRequest, NextResponse } from 'next/server'
import { writeFile, readFile, unlink, mkdir } from 'fs/promises'
import { join } from 'path'
import { v4 as uuidv4 } from 'uuid'
import { existsSync } from 'fs'

export const runtime = 'nodejs'
export const maxDuration = 60

// Configure route to handle larger payloads
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '2mb' // Limit each chunk to 2MB
    }
  }
}

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

    // Create temp directory if it doesn't exist
    const tempDir = join(process.cwd(), 'temp')
    if (!existsSync(tempDir)) {
      await mkdir(tempDir, { recursive: true })
    }

    // Create unique filename for this chunk
    const chunkFileName = `${fileId}_${chunkIndex}.chunk`
    const chunkPath = join(tempDir, chunkFileName)

    // Convert base64 chunk to buffer and save
    const buffer = Buffer.from(chunk, 'base64')
    await writeFile(chunkPath, buffer)

    // Check if we have all chunks
    const isLastChunk = chunkIndex === totalChunks - 1

    if (isLastChunk) {
      // Combine all chunks
      const chunks = []
      for (let i = 0; i < totalChunks; i++) {
        const tempChunkPath = join(tempDir, `${fileId}_${i}.chunk`)
        const chunkData = await readFile(tempChunkPath)
        chunks.push(chunkData)
        
        // Clean up chunk file
        await unlink(tempChunkPath)
      }

      // Combine chunks into final file
      const finalBuffer = Buffer.concat(chunks)
      const finalPath = join(tempDir, `${fileId}_final.jpg`)
      await writeFile(finalPath, finalBuffer)

      // Create form data for Pinata
      const formData = new FormData()
      const file = new File([finalBuffer], 'card-image.jpg', { type: 'image/jpeg' })
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

      // Clean up final file
      await unlink(finalPath)

      return NextResponse.json({
        success: true,
        pinataUrl,
        ipfsHash: result.IpfsHash
      })
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