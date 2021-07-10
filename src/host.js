const HOST_KV_KEY_PREFIX = 'host:'
const IPV4_KV_KEY_PREFIX = 'host-ipv4:'
const IPV6_KV_KEY_PREFIX = 'host-ipv6:'

import { is_ipv4, is_ipv6 } from './utils'
import {
  CFAuthenticationError,
  update_cf_dns_record_ip,
  get_cf_dns_record_id,
  create_cf_dns_record,
} from './cf_api'

export class Host {
  constructor(name, info, args) {
    args = args || {}

    this._name = name
    this._ipv4_enabled = info.ipv4_enabled == true
    this._ipv6_enabled = info.ipv6_enabled == true
    this._creation = info.creation || new Date().toISOString()

    this._ipv4 = args.ipv4
    this._ipv6 = args.ipv6
    this._dirty = args.dirty == true || !info.creation
  }

  to_json_kv() {
    return {
      ipv6_enabled: this._ipv6_enabled,
      ipv4_enabled: this._ipv4_enabled,
      creation: this._creation,
    }
  }

  to_json() {
    const j = this.to_json_kv()
    if (this._ipv4) {
      j.ipv4 = this._ipv4.to_json()
    }
    if (this._ipv6) {
      j.ipv6 = this._ipv6.to_json()
    }

    return j
  }

  get_name() {
    return this._name
  }

  async get_ipv4() {
    if (!this._ipv4_enabled) {
      return null
    }

    if (this._ipv4) {
      return this._ipv4
    }

    this._ipv4 = await IPv4Adress.fetch(this._name)
    return this._ipv4
  }

  async get_ipv6() {
    if (!this._ipv6_enabled) {
      return null
    }

    if (this._ipv6) {
      return this._ipv6
    }

    this._ipv6 = await IPv6Adress.fetch(this._name)
    return this._ipv6
  }

  async save(force) {
    if (this._dirty || force) {
      await KV.put(
        `${HOST_KV_KEY_PREFIX}${this._name}`,
        JSON.stringify(this.to_json_kv()),
      )
    }

    if (this._ipv4) {
      await this._ipv4.save(this._name, force)
    }

    if (this._ipv6) {
      await this._ipv6.save(this._name, force)
    }
  }

  async update_ip(ip) {
    if (is_ipv4(ip)) {
      if (!this._ipv4_enabled) {
        return {
          success: false,
          error: 'ipv4-not-enabled',
          message: 'IPv4 is not enabled for this domain.',
        }
      }
      return (await this.get_ipv4()).update(this._name, ip)
    } else if (is_ipv6(ip)) {
      if (!this._ipv6_enabled) {
        return {
          success: false,
          error: 'ipv4-not-enabled',
          message: 'IPv6 is not enabled for this domain.',
        }
      }
      return (await this.get_ipv6()).update(this._name, ip)
    } else {
      return {
        success: false,
        error: 'invalid-ip',
        message: 'Invalid IP',
      }
    }
  }

  static async fetch_by_name(name) {
    const raw_host = await KV.get(`${HOST_KV_KEY_PREFIX}${name}`)
    if (raw_host === null) {
      return null
    }

    return new Host(name, JSON.parse(raw_host))
  }

  static async get_all_names() {
    const host_keys = await KV.list({ prefix: HOST_KV_KEY_PREFIX })
    if (host_keys === null) {
      return null
    }
    return host_keys.keys.map((key) =>
      key.name.slice(HOST_KV_KEY_PREFIX.length),
    )
  }
}

export class Address {
  constructor(info, args) {
    args = args || {}

    this._address = info.address || null
    this._cf_dns_record_id = info.cf_dns_record_id || null
    this._last_change = info.last_change || null
    this._dirty = args.dirty == true
  }

  to_json() {
    return {
      address: this._address,
      cf_dns_record_id: this._cf_dns_record_id,
      last_change: this._last_change,
    }
  }

  async update(host_name, ip, force) {
    if (this._address == ip && !force) {
      return {
        success: true,
        changed: false,
      }
    }

    let ok = false
    let cf_dns_record_id = this._cf_dns_record_id

    try {
      if (cf_dns_record_id !== null) {
        ok = (await update_cf_dns_record_ip(cf_dns_record_id, ip)) !== null
      }

      if (!ok) {
        cf_dns_record_id = await get_cf_dns_record_id(
          host_name,
          this.constructor.get_type(),
        )

        if (cf_dns_record_id !== null) {
          ok = (await update_cf_dns_record_ip(cf_dns_record_id, ip)) !== null
        } else {
          ok = await update_cf_dns_record_ip(cf_dns_record_id, ip)
          cf_dns_record_id = await create_cf_dns_record(
            host_name,
            ip,
            this.constructor.get_type(),
          )
          ok = cf_dns_record_id !== null
        }
      }
    } catch (e) {
      if (e instanceof CFAuthenticationError) {
        return {
          success: false,
          error: 'cf-auth-error',
          message: e.message,
          changed: false,
        }
      }
      throw e
    }

    if (!ok) {
      return {
        success: false,
        error: 'cf-error',
        message: 'Error while updating IP',
        changed: false,
      }
    }

    if (this._address != ip) {
      this._dirty = true
      this._address = ip
      this._last_change = new Date().toISOString()
    }

    if (this._cf_dns_record_id != cf_dns_record_id) {
      this._dirty = true
      this._cf_dns_record_id = cf_dns_record_id
    }

    return {
      success: true,
      changed: true,
    }
  }

  static get_type() {
    throw Error('Not implemented')
  }

  static get_kv_prefix() {
    throw Error('Not implemented')
  }

  static async fetch(host_name) {
    const kv_prefix = this.get_kv_prefix()
    const raw_address = await KV.get(`${kv_prefix}${host_name}`)
    if (raw_address == null) {
      return new this({})
    }

    return new this(JSON.parse(raw_address))
  }

  async save(host_name, force) {
    if (this._dirty || force) {
      const kv_prefix = this.constructor.get_kv_prefix()
      await KV.put(`${kv_prefix}${host_name}`, JSON.stringify(this.to_json()))
    }
  }
}

export class IPv6Adress extends Address {
  static get_type() {
    return 'AAAA'
  }

  static get_kv_prefix() {
    return IPV6_KV_KEY_PREFIX
  }
}

export class IPv4Adress extends Address {
  static get_type() {
    return 'A'
  }

  static get_kv_prefix() {
    return IPV4_KV_KEY_PREFIX
  }
}
