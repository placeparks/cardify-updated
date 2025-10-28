import { NextRequest, NextResponse } from 'next/server'
import { writeFile, readFile, unlink } from 'fs/promises'
import { join } from 'path'
import { v4 as uuidv4 } from 'uuid'

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

    // Create unique filename for this chunk
    const chunkFileName = `${fileId}_${chunkIndex}.chunk`
    const chunkPath = join('/tmp', chunkFileName)

    // Convert base64 chunk to buffer and save
    const buffer = Buffer.from(chunk, 'base64')
    await writeFile(chunkPath, buffer)

    // Check if we have all chunks
    const isLastChunk = chunkIndex === totalChunks - 1

    if (isLastChunk) {
      // Combine all chunks
      const chunks = []
      for (let i = 0; i < totalChunks; i++) {
        const tempChunkPath = join('/tmp', `${fileId}_${i}.chunk`)
        const chunkData = await readFile(tempChunkPath)
        chunks.push(chunkData)
        
        // Clean up chunk file
        await unlink(tempChunkPath)
      }

      // Combine chunks into final file
      const finalBuffer = Buffer.concat(chunks)
      const finalPath = join('/tmp', `${fileId}_final.jpg`)
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

      // Upload to Pinata
      const pinataResponse = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.NEXT_PUBLIC_PINATA_JWT}`,
        },
        body: formData,
      })

      if (!pinataResponse.ok) {
        throw new Error('Failed to upload to Pinata')
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
    return NextResponse.json(
      { 
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      },
      { status: 500 }
    )
  }
}
