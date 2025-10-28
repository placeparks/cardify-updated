import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { writeFile } from 'fs/promises'
import { join } from 'path'
import { v4 as uuidv4 } from 'uuid'

// Configure route to handle larger payloads
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb'
    }
  }
}

export async function POST(req: NextRequest) {
  try {
    const data = await req.json()
    const { imageData, fileName } = data

    if (!imageData || !fileName) {
      return NextResponse.json(
        { error: 'Image data and filename are required' },
        { status: 400 }
      )
    }

    // Remove data URL prefix to get base64 data
    const base64Data = imageData.replace(/^data:image\/\w+;base64,/, '')
    const buffer = Buffer.from(base64Data, 'base64')

    // Create unique filename
    const uniqueId = uuidv4()
    const ext = fileName.split('.').pop()
    const tempFileName = `${uniqueId}.${ext}`
    const tempFilePath = join('/tmp', tempFileName)

    // Save to temporary storage
    await writeFile(tempFilePath, buffer)

    // Now upload this file to Pinata using the existing route
    const formData = new FormData()
    const tempFile = new File([buffer], tempFileName, { type: 'image/jpeg' })
    formData.append('file', tempFile)

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

    return NextResponse.json({
      success: true,
      pinataUrl,
      ipfsHash: result.IpfsHash
    })

  } catch (error) {
    console.error('Error handling upload:', error)
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      },
      { status: 500 }
    )
  }
}
