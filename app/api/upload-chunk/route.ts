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

// Track processing files to prevent race conditions
const processingFiles = new Set<string>()

// Track successfully written chunks for debugging
const writtenChunks = new Map<string, Set<number>>()

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

    // Check if this chunk was already processed
    const alreadyWritten = writtenChunks.get(fileId)?.has(chunkIndex)
    if (alreadyWritten) {
      console.log(`Chunk ${chunkIndex} for file ${fileId} was already written, skipping`)
      return NextResponse.json({
        success: true,
        chunkIndex,
        message: 'Chunk already processed',
        processingTime: '0ms'
      })
    }

    // Create unique filename for this chunk
    const chunkFileName = `${fileId}_${chunkIndex}.chunk`
    
    // Try multiple possible temp directories
    const possibleTempDirs = ['/tmp', '/var/tmp', process.cwd() + '/tmp']
    let chunkPath = ''
    let tempDir = ''
    
    for (const dir of possibleTempDirs) {
      try {
        await access(dir)
        tempDir = dir
        chunkPath = join(dir, chunkFileName)
        break
      } catch {
        continue
      }
    }
    
    if (!chunkPath) {
      throw new Error('No accessible temporary directory found')
    }
    
    console.log(`Using temp directory: ${tempDir} for chunk ${chunkIndex}`)

    // Convert base64 chunk to buffer and save with retry mechanism
    const buffer = Buffer.from(chunk, 'base64')
    
    // Retry writing the chunk up to 3 times
    let writeSuccess = false
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        console.log(`Writing chunk ${chunkIndex} (attempt ${attempt}) to ${chunkPath}, buffer size: ${buffer.length} bytes`)
        await writeFile(chunkPath, buffer)
        
        // Verify the file was written successfully
        if (await fileExists(chunkPath)) {
          const stats = await import('fs/promises').then(fs => fs.stat(chunkPath))
          console.log(`Chunk ${chunkIndex} written successfully, file size: ${stats.size} bytes`)
          
          // Track this chunk as successfully written
          if (!writtenChunks.has(fileId)) {
            writtenChunks.set(fileId, new Set())
          }
          writtenChunks.get(fileId)!.add(chunkIndex)
          
          writeSuccess = true
          break
        } else {
          console.error(`Chunk ${chunkIndex} file not found after write attempt ${attempt}`)
        }
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
      // Check if this file is already being processed
      if (processingFiles.has(fileId)) {
        console.warn(`File ${fileId} is already being processed, waiting...`)
        // Wait and retry a few times
        for (let retry = 0; retry < 5; retry++) {
          await new Promise(resolve => setTimeout(resolve, 200))
          if (!processingFiles.has(fileId)) {
            break
          }
        }
        
        if (processingFiles.has(fileId)) {
          return NextResponse.json(
            { 
              success: false,
              error: 'File is already being processed. Please wait and retry.',
              fileId
            },
            { status: 409 }
          )
        }
      }
      
      // Mark file as being processed
      processingFiles.add(fileId)
      
      try {
        // Wait a moment to ensure all chunks are written
        await new Promise(resolve => setTimeout(resolve, 100))
        
        // Debug: Show which chunks we expect to have written
        const expectedChunks = writtenChunks.get(fileId) || new Set()
        console.log(`Expected written chunks for ${fileId}:`, Array.from(expectedChunks).sort())
        console.log(`Total chunks expected: ${totalChunks}`)
      
      // Combine all chunks
      const chunks = []
      const missingChunks = []
      const chunkPaths = []
      
      // Determine which temp directory to use (same logic as chunk writing)
      const possibleTempDirs = ['/tmp', '/var/tmp', process.cwd() + '/tmp']
      let tempDir = '/tmp' // default fallback
      
      for (const dir of possibleTempDirs) {
        try {
          await access(dir)
          tempDir = dir
          break
        } catch {
          continue
        }
      }
      
      console.log(`Using temp directory for final processing: ${tempDir}`)
      
      // First, verify all chunks exist
      for (let i = 0; i < totalChunks; i++) {
        const tempChunkPath = join(tempDir, `${fileId}_${i}.chunk`)
        chunkPaths.push(tempChunkPath)
        
        // Check if chunk file exists before reading
        if (!(await fileExists(tempChunkPath))) {
          missingChunks.push(i)
          console.warn(`Chunk ${i} for file ${fileId} not found at ${tempChunkPath}`)
          console.warn(`Was chunk ${i} tracked as written? ${expectedChunks.has(i)}`)
        } else {
          console.log(`Chunk ${i} found at ${tempChunkPath}`)
        }
      }
      
      // If we have missing chunks, wait a bit more and check again
      if (missingChunks.length > 0) {
        console.log(`Waiting for missing chunks: ${missingChunks.join(', ')}`)
        await new Promise(resolve => setTimeout(resolve, 500))
        
        // Re-check missing chunks
        const stillMissing = []
        for (const chunkIndex of missingChunks) {
          const tempChunkPath = join(tempDir, `${fileId}_${chunkIndex}.chunk`)
          if (!(await fileExists(tempChunkPath))) {
            stillMissing.push(chunkIndex)
          }
        }
        
        if (stillMissing.length > 0) {
          console.error(`Still missing chunks after retry: ${stillMissing.join(', ')}`)
          return NextResponse.json(
            { 
              success: false,
              error: `Missing chunks: ${stillMissing.join(', ')}. Please retry the upload.`,
              missingChunks: stillMissing
            },
            { status: 400 }
          )
        }
      }
      
      // Now read all chunks
      for (let i = 0; i < totalChunks; i++) {
        const tempChunkPath = join(tempDir, `${fileId}_${i}.chunk`)
        
        try {
          const chunkData = await readFile(tempChunkPath)
          chunks.push(chunkData)
        } catch (error) {
          console.error(`Error reading chunk ${i} for file ${fileId}:`, error)
          return NextResponse.json(
            { 
              success: false,
              error: `Failed to read chunk ${i}: ${error instanceof Error ? error.message : 'Unknown error'}`
            },
            { status: 500 }
          )
        }
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

      // Clean up all chunk files
      for (let i = 0; i < totalChunks; i++) {
        const tempChunkPath = join(tempDir, `${fileId}_${i}.chunk`)
        try {
          await unlink(tempChunkPath)
        } catch (error) {
          console.warn(`Failed to clean up chunk ${i} file ${tempChunkPath}:`, error)
          // Don't fail the entire operation for cleanup errors
        }
      }
      
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
      } finally {
        // Always remove from processing set and cleanup tracking
        processingFiles.delete(fileId)
        writtenChunks.delete(fileId)
      }
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
    
    // Clean up processing set if this was the last chunk
    const data = await req.json().catch(() => ({}))
    if (data.chunkIndex === data.totalChunks - 1) {
      processingFiles.delete(data.fileId)
    }
    
    return NextResponse.json(
      { 
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      },
      { status: 500 }
    )
  }
}
