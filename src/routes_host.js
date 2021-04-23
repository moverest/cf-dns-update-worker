import { Host } from './host'

export async function handle_route_hosts(request, url, token) {
  let host_names

  const show_ipv4 = url.searchParams.get('show_ipv4') == 'true'
  const show_ipv6 = url.searchParams.get('show_ipv6') == 'true'

  const raw_name_params = url.searchParams.get('name')
  if (raw_name_params !== null) {
    host_names = raw_name_params.split(',')
  } else {
    host_names = await Host.get_all_names()
  }

  const host_futures = host_names
    .filter((host_name) => token.can_view_host(host_name))
    .map(Host.fetch_by_name)

  let hosts = {}
  for (let host_future of host_futures) {
    const host = await host_future
    if (host === null) {
      continue
    }

    hosts[host.get_name()] = host
  }

  const futures = []
  if (show_ipv4) {
    for (let host of Object.values(hosts)) {
      futures.push(host.get_ipv4())
    }
  }

  if (show_ipv6) {
    for (let host of Object.values(hosts)) {
      futures.push(host.get_ipv6())
    }
  }

  for (let future of futures) {
    await future
  }

  for (let host_name in hosts) {
    hosts[host_name] = hosts[host_name].to_json()
  }

  return {
    data: {
      hosts: hosts,
    },
  }
}

export async function handle_route_post_hosts(request, url, token) {
  if (!token.is_admin()) {
    return {
      status: 401,
      data: { message: 'Only admin can create new hosts.' },
    }
  }

  let new_info = await request.json()

  const existing_host = await Host.fetch_by_name(new_info.name)
  if (existing_host !== null) {
    return {
      status: 400,
      data: { message: 'Host already exists.', host: existing_host },
    }
  }

  const new_host = new Host(
    new_info.name,
    {
      ipv4_enabled: new_info.ipv4_enabled,
      ipv6_enabled: new_info.ipv6_enabled,
    },
    { dirty: true },
  )
  await new_host.save()

  return {
    data: {
      [new_host.get_name()]: new_host.to_json(),
    },
  }
}

export async function handle_route_post_update(request, url, token) {
  const host_name = url.searchParams.get('name') || url.searchParams.get('host')
  if (!token.can_update_host(host_name)) {
    return {
      status: 401,
      data: {
        message: 'Permission required.',
      },
    }
  }

  const host = await Host.fetch_by_name(host_name)
  if (host === null) {
    return {
      status: 400,
      data: {
        message: 'Host does not exist.',
      },
    }
  }

  const payload = await request.json()
  let ip = payload.ip

  if (!('ip' in payload) || ip == 'sender') {
    ip = request.headers.get('CF-Connecting-IP')
  }

  const update_response = await host.update_ip(ip)
  if (update_response.success) {
    host.last_update_token_id = token.id
    await host.save()
  }

  return {
    data: {
      hosts: {
        [host.get_name()]: host.to_json(),
      },
      update: update_response,
    },
  }
}
