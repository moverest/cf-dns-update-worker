const CF_API_BASE_URL = 'https://api.cloudflare.com/client/v4'

export class CFAuthenticationError extends Error {
  constructor() {
    super('Could authenticate with the Cloudflare API')
  }
}

export async function fetch_cf_api(path, init) {
  const params = init.params || {}
  let query = ''
  if (Object.keys(params) != 0) {
    query =
      '?' +
      Object.entries(params)
        .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
        .join('&')
  }

  const r = await fetch(CF_API_BASE_URL + path + query, {
    headers: {
      Authorization: `Bearer ${CF_DNS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    method: init.method || 'GET',
    body: 'body' in init ? JSON.stringify(init.body) : null,
  })

  if (r.status == 401) {
    throw new CFAuthenticationError()
  }

  return {
    body: await r.json(),
    status: r.status,
  }
}

export async function get_cf_dns_record_id(name, type) {
  const r = await fetch_cf_api(`/zones/${CF_ZONE_ID}/dns_records`, {
    params: {
      type: type,
      name: name,
    },
  })

  if (r.body.result.length == 0) {
    return null
  }

  return r.body.result[0].id
}

export async function update_cf_dns_record_ip(id, ip) {
  const r = await fetch_cf_api(`/zones/${CF_ZONE_ID}/dns_records/${id}`, {
    method: 'PATCH',
    body: { content: ip },
  })

  if (!r.body.success) {
    return null
  }

  return r.body.result.id
}

export async function create_cf_dns_record(name, ip, type) {
  const r = await fetch_cf_api(`/zones/${CF_ZONE_ID}/dns_records`, {
    method: 'POST',
    body: {
      type: type,
      name: name,
      content: ip,
      ttl: 1,
    },
  })

  if (!r.body.success) {
    return null
  }

  return r.body.result.id
}
