import { NextRequest, NextResponse } from 'next/server'
import { writeFile, readFile, unlink, access } from 'fs/promises'
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

// Helper function to check if file exists
async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath)
    return true
  } catch {
    return false
  }
}

export async function POST(req: NextRequest) {
  const startTime = Date.now()
  
  try {
    const data = await req.json()
    const { chunk, chunkIndex, totalChunks, fileId } = data

    console.log(`Processing chunk ${chunkIndex + 1}/${totalChunks} for file ${fileId}`)

    if (!chunk || chunkIndex === undefined || !totalChunks || !fileId) {
      return NextResponse.json(
        { error: 'Missing required chunk upload data' },
        { status: 400 }
      )
    }

    // Validate chunk index
    if (chunkIndex < 0 || chunkIndex >= totalChunks) {
      return NextResponse.json(
        { error: `Invalid chunk index ${chunkIndex}. Must be between 0 and ${totalChunks - 1}` },
        { status: 400 }
      )
    }

    // Create unique filename for this chunk
    const chunkFileName = `${fileId}_${chunkIndex}.chunk`
    const chunkPath = join('/tmp', chunkFileName)

    // Convert base64 chunk to buffer and save with retry mechanism
    const buffer = Buffer.from(chunk, 'base64')
    
    // Retry writing the chunk up to 3 times
    let writeSuccess = false
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        await writeFile(chunkPath, buffer)
        writeSuccess = true
        break
      } catch (error) {
        console.warn(`Attempt ${attempt} to write chunk ${chunkIndex} failed:`, error)
        if (attempt === 3) {
          throw new Error(`Failed to write chunk ${chunkIndex} after 3 attempts: ${error instanceof Error ? error.message : 'Unknown error'}`)
        }
        // Wait 100ms before retry
        await new Promise(resolve => setTimeout(resolve, 100))
      }
    }
    
    if (!writeSuccess) {
      throw new Error(`Failed to write chunk ${chunkIndex} for file ${fileId}`)
    }

    // Check if we have all chunks
    const isLastChunk = chunkIndex === totalChunks - 1

    if (isLastChunk) {
      // Combine all chunks
      const chunks = []
      const missingChunks = []
      
      for (let i = 0; i < totalChunks; i++) {
        const tempChunkPath = join('/tmp', `${fileId}_${i}.chunk`)
        
        // Check if chunk file exists before reading
        if (!(await fileExists(tempChunkPath))) {
          missingChunks.push(i)
          console.warn(`Chunk ${i} for file ${fileId} not found at ${tempChunkPath}`)
          continue
        }
        
        try {
          const chunkData = await readFile(tempChunkPath)
          chunks.push(chunkData)
          
          // Clean up chunk file
          await unlink(tempChunkPath)
        } catch (error) {
          console.error(`Error reading chunk ${i} for file ${fileId}:`, error)
          missingChunks.push(i)
        }
      }
      
      // Check if we have all required chunks
      if (missingChunks.length > 0) {
        console.error(`Missing chunks for file ${fileId}:`, missingChunks)
        return NextResponse.json(
          { 
            success: false,
            error: `Missing chunks: ${missingChunks.join(', ')}. Please retry the upload.`,
            missingChunks
          },
          { status: 400 }
        )
      }
      
      if (chunks.length !== totalChunks) {
        console.error(`Expected ${totalChunks} chunks but only found ${chunks.length} for file ${fileId}`)
        return NextResponse.json(
          { 
            success: false,
            error: `Incomplete upload: expected ${totalChunks} chunks but only found ${chunks.length}`
          },
          { status: 400 }
        )
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
      try {
        await unlink(finalPath)
      } catch (error) {
        console.warn(`Failed to clean up final file ${finalPath}:`, error)
        // Don't fail the entire operation for cleanup errors
      }

      const totalProcessingTime = Date.now() - startTime
      return NextResponse.json({
        success: true,
        pinataUrl,
        ipfsHash: result.IpfsHash,
        message: 'File uploaded successfully to IPFS',
        processingTime: `${totalProcessingTime}ms`,
        totalChunks: totalChunks
      })
    }

    // If not the last chunk, return success for this chunk
    const processingTime = Date.now() - startTime
    return NextResponse.json({
      success: true,
      chunkIndex,
      message: 'Chunk uploaded successfully',
      processingTime: `${processingTime}ms`
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
