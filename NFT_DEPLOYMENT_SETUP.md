# Environment Variables Required for NFT Collection Deployment

The `/api/deploy-nft-collection` endpoint requires the following environment variables to be set:

## Required Environment Variables

### Supabase Configuration
- `SUPABASE_URL` - Your Supabase project URL
- `SUPABASE_SERVICE_KEY` - Your Supabase service role key

### NFT Factory Contract
- `NEXT_PUBLIC_FACTORY_ADDRESS_NFT_ONLY` - The address of your NFT factory contract

### OpenZeppelin Relayer Configuration
- `RELAYER_KEY` - Your OpenZeppelin relayer key
- `KEYSTORE_PASSPHRASE` - Passphrase for your relayer keystore
- `WEBHOOK_SIGNING_KEY` - Key for webhook signing

### Optional Configuration (with defaults)
- `RELAYER_NETWORK` - Network name (default: 'base-sepolia')
- `RELAYER_RPC_URL` - RPC URL (default: 'https://sepolia.base.org')
- `RELAYER_PORT` - Relayer port (default: '8080')
- `API_KEY` - API key for relayer (default: 'cardify-relayer-1234567890abcdefghijklmnopqrstuvwxyz')

## Setup Instructions

1. Create a `.env.local` file in your project root
2. Add all the required environment variables with your actual values
3. Ensure your OpenZeppelin relayer is running on the specified port
4. Test the relayer connection with: `curl -H "Authorization: Bearer your-api-key" http://localhost:8080/api/v1/health`

## Common Issues

- **500 Internal Server Error**: Usually caused by missing environment variables
- **503 Service Unavailable**: Relayer is not running or not accessible
- **502 Bad Gateway**: Relayer returned an error response

## Testing the Relayer

Before deploying NFT collections, ensure your relayer is working:

```bash
# Health check
curl -H "Authorization: Bearer cardify-relayer-1234567890abcdefghijklmnopqrstuvwxyz" http://localhost:8080/api/v1/health

# Should return: OK
```
