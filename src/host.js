const HOST_KV_KEY_PREFIX = 'host:'

export class Host {
  constructor(name, info) {
    this.name = name
    this.ipv4 = info.ipv4 || null
    this.ipv6 = info.ipv6 || null

    // These are the IDs used by the Cloudflare IP to reference the records.
    // If these values are expired or not set, we search and set them here.
    this.cf_A_dns_record_id = info.cf_A_dns_record_id || null
    this.cf_AAAA_dns_record_id = info.cf_AAAA_dns_record_id || null

    this.last_update = info.last_update || null
    this.last_update_token_id = info.last_update_token_id || null
  }

  to_json() {
    return {
      ipv4: this.ipv4,
      ipv6: this.ipv6,
      cf_A_dns_record_id: this.cf_A_dns_record_id,
      cf_AAAA_dns_record_id: this.cf_AAAA_dns_record_id,
      last_update: this.last_update,
      last_update_token_id: this.last_update_token_id,
    }
  }

  async save() {
    await KV.put(
      `${HOST_KV_KEY_PREFIX}${this.name}`,
      JSON.stringify(this.to_json()),
    )
  }

  async update_ip(ip) {
    let type
    if (is_ipv4(ip)) {
      type = 'A'
    } else if (is_ipv6(ip)) {
      type = 'AAAA'
    } else {
      return {
        success: false,
        error: 'invalid-ip',
        message: 'Invalid IP',
      }
    }

    let record_id =
      type == 'A' ? this.cf_A_dns_record_id : this.cf_AAAA_dns_record_id

    let ok = false
    if (record_id !== null) {
      ok = await update_cf_dns_record_ip(record_id, ip)
    }

    if (!ok) {
      record_id = await get_cf_dns_record_id(this.name, type)
    }

    if (record_id !== null) {
      ok = await update_cf_dns_record_ip(record_id, ip)
    } else {
      ok = await create_cf_dns_record(this.name, ip, type)
    }

    if (!ok) {
      return {
        success: false,
        error: 'cf-error',
        message: 'Error while updating IP',
      }
    }

    if (type == 'A') {
      this.cf_A_dns_record_id = record_id
      this.ipv4 = ip
    } else {
      this.cf_AAAA_dns_record_id = record_id
      this.ipv6 = ip
    }

    this.last_update = new Date().toISOString()
    this.last_update_token_id = null

    return {
      success: true,
    }
  }
}

export async function get_host(name) {
  const raw_host = await KV.get(`${HOST_KV_KEY_PREFIX}${name}`)
  if (raw_host === null) {
    return null
  }

  return new Host(name, JSON.parse(raw_host))
}

export async function get_all_host_names() {
  const host_keys = await KV.list({ prefix: HOST_KV_KEY_PREFIX })
  if (host_keys === null) {
    return null
  }
  return host_keys.keys.map((key) => key.name.slice(HOST_KV_KEY_PREFIX.length))
}

const CF_API_BASE_URL = 'https://api.cloudflare.com/client/v4'

async function fetch_cf_api(path, init) {
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

  return {
    body: await r.json(),
    status: r.status,
  }
}

async function get_cf_dns_record_id(name, type) {
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

async function update_cf_dns_record_ip(id, ip) {
  const r = await fetch_cf_api(`/zones/${CF_ZONE_ID}/dns_records/${id}`, {
    method: 'PATCH',
    body: { content: ip },
  })

  return r.body.success === true
}

async function create_cf_dns_record(name, ip, type) {
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

const IPV4_RE = RegExp(
  '^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)(.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)){3}$',
)
function is_ipv4(ip) {
  return IPV4_RE.test(ip)
}

const IPV6_RE = RegExp(
  '^(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]).){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]).){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))$',
)
function is_ipv6(ip) {
  return IPV6_RE.test(ip)
}
