/**
 * cloudflare-services.ts
 *
 * Handles direct HTTP REST calls to Cloudflare KV.
 */

const CF_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID
const CF_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN
const CF_KV_NAMESPACE_ID = process.env.CLOUDFLARE_KV_NAMESPACE_ID

/**
 * Fetch a value from Cloudflare KV using the REST API.
 */
export async function fetchKVValue(key: string): Promise<string | null> {
  if (!CF_ACCOUNT_ID || !CF_API_TOKEN || !CF_KV_NAMESPACE_ID) {
    console.warn('Cloudflare credentials missing. KV fetch skipped.')
    return null
  }

  const url = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/storage/kv/namespaces/${CF_KV_NAMESPACE_ID}/values/${encodeURIComponent(key)}`

  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${CF_API_TOKEN}`,
      },
    })

    if (res.status === 404) return null
    if (!res.ok) {
      const errText = await res.text()
      throw new Error(`Cloudflare KV error: ${res.status} ${errText}`)
    }

    return await res.text()
  } catch (error) {
    console.error('Failed to fetch from Cloudflare KV:', error)
    return null
  }
}

/**
 * Write a value to Cloudflare KV using the REST API.
 */
export async function writeKVValue(key: string, value: string): Promise<boolean> {
  if (!CF_ACCOUNT_ID || !CF_API_TOKEN || !CF_KV_NAMESPACE_ID) {
    console.warn('Cloudflare credentials missing. KV write skipped.')
    return false
  }

  const url = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/storage/kv/namespaces/${CF_KV_NAMESPACE_ID}/values/${encodeURIComponent(key)}`

  try {
    const res = await fetch(url, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${CF_API_TOKEN}`,
        'Content-Type': 'text/plain',
      },
      body: value,
    })

    if (!res.ok) {
      const errText = await res.text()
      throw new Error(`Cloudflare KV error: ${res.status} ${errText}`)
    }

    return true
  } catch (error) {
    console.error('Failed to write to Cloudflare KV:', error)
    return false
  }
}
