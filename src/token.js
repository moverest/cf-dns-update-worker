const TOKEN_KV_KEY_PREFIX = 'token:'
const TOKEN_HOST_PERMISSIONS = ['view', 'update']

export class Token {
  constructor(id, info) {
    this.id = id
    this.name = info.name || null
    this.description = info.description || null
    this.type = info.type

    const permissions = info.permissions || {}
    this.host_permissions = permissions.hosts || {}
  }

  static validate_info(info) {
    const errors = []

    switch (info.type) {
      case 'ADMIN':
      case 'RESTRICTED':
        break
      default:
        errors.push({
          field: 'type',
          msg: 'Type should be either "ADMIN" or "RESTRICTED".',
        })
    }

    if (
      typeof info.name != 'string' &&
      info.name !== null &&
      info.name !== undefined
    ) {
      errors.push({
        field: 'name',
        msg: 'Name should be a string, null or not present.',
      })
    }

    if (
      typeof info.description != 'string' &&
      info.description !== null &&
      info.description !== undefined
    ) {
      errors.push({
        field: 'description',
        msg: 'Description should be a string, null or not present.',
      })
    }

    if ('permissions' in info) {
      const permissions = info.permissions
      if (typeof permissions !== 'object' || permissions === null) {
        errors.push({
          field: 'permissions',
          msg: 'Permissions should be an object.',
        })
      } else {
        this._validate_host_permissions(permissions, errors)
      }
    }

    return errors
  }

  static _validate_host_permissions(permissions, errors) {
    if (!('hosts' in permissions)) {
      return
    }

    if (typeof permissions.hosts !== 'object' || permissions.hosts === null) {
      errors.push({
        field: 'permissions.hosts',
        msg: 'Host permissions should be an object.',
      })
      return
    }

    Object.entries(permissions.hosts).forEach(
      ([host_name, host_permissions]) => {
        for (let host_permission of host_permissions) {
          if (!TOKEN_HOST_PERMISSIONS.includes(host_permission)) {
            errors.push({
              field: `permissions.hosts[${host_name}]`,
              msg: `"${host_permission}" is not a valid permission.`,
            })
          }
        }
      },
    )
  }

  is_admin() {
    return this.type == 'ADMIN'
  }

  to_json() {
    const j = {
      type: this.type,
      name: this.name,
      description: this.description,
    }

    if (this.type == 'RESTRICTED') {
      j.permissions = {
        hosts: this.host_permissions,
      }
    }

    return j
  }

  async save() {
    await KV.put(
      `${TOKEN_KV_KEY_PREFIX}${this.id}`,
      JSON.stringify(this.to_json()),
    )
  }

  async delete() {
    await KV.delete(`${TOKEN_KV_KEY_PREFIX}${this.id}`)
  }

  can_view_host(host) {
    return this.is_admin() || this._has_host_permissions(host, 'view')
  }

  can_update_host(host) {
    return this.is_admin() || this._has_host_permissions(host, 'update')
  }

  _has_host_permissions(host, permissions) {
    if (host in this.host_permissions) {
      return this.host_permissions[host].includes(permissions)
    }

    if ('#OTHERS' in this.host_permissions) {
      return this.host_permissions['#OTHERS'].includes(permissions)
    }

    return false
  }
}

export async function apikey_to_token_id(apikey, salt) {
  const token_salt = salt !== undefined ? salt : TOKEN_SALT
  const raw_id = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(`${apikey}|${token_salt}`),
  )

  return btoa(String.fromCharCode(...new Uint8Array(raw_id)))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '')
}

export function generate_apikey() {
  const b = new Uint8Array(32)
  crypto.getRandomValues(b)
  return to_hex(b)
}

function get_apikey_from_request(request) {
  const auth_header = request.headers.get('Authorization')
  if (auth_header === null) {
    return null
  }

  const auth_header_parts = auth_header.split(' ')
  if (auth_header_parts.length != 2) {
    return null
  }

  const [bearer_keyword, apikey] = auth_header_parts
  if (bearer_keyword != 'Bearer') {
    return null
  }

  return apikey
}

export async function get_token_from_id(token_id) {
  const raw_token = await KV.get(`${TOKEN_KV_KEY_PREFIX}${token_id}`)
  if (raw_token === null) {
    return null
  }

  return new Token(token_id, JSON.parse(raw_token))
}

export async function get_token_from_request(request) {
  const apikey = get_apikey_from_request(request)
  if (apikey === null) {
    return null
  }

  const token_id = await apikey_to_token_id(apikey)
  return await get_token_from_id(token_id)
}

const LUT_HEX_4b = [
  '0',
  '1',
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
  'a',
  'b',
  'c',
  'd',
  'e',
  'f',
]
const LUT_HEX_8b = new Array(0x100)
for (let n = 0; n < 0x100; n++) {
  LUT_HEX_8b[n] = `${LUT_HEX_4b[(n >>> 4) & 0xf]}${LUT_HEX_4b[n & 0xf]}`
}
function to_hex(buffer) {
  let out = ''
  for (let idx = 0, edx = buffer.length; idx < edx; idx++) {
    out += LUT_HEX_8b[buffer[idx]]
  }
  return out
}

export async function generate_salt_and_apikey() {
  const salt = generate_apikey()
  const apikey = generate_apikey()
  const token_id = await apikey_to_token_id(apikey, salt)

  return {
    salt: salt,
    apikey: apikey,
    token_id: token_id,
  }
}
