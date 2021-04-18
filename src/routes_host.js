import { get_host, get_all_host_names, Host } from './host'

export async function handle_route_hosts(request, url, token) {
  let host_names

  const raw_name_params = url.searchParams.get('name')
  if (raw_name_params !== null) {
    host_names = raw_name_params.split(',')
  } else {
    host_names = await get_all_host_names()
  }

  const host_futures = host_names
    .filter((host_name) => token.can_view_host(host_name))
    .map(get_host)

  let hosts = {}
  for (let host_future of host_futures) {
    const host = await host_future
    if (host === null) {
      continue
    }

    hosts[host.name] = host.to_json()
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

  const existing_host = await get_host(new_info.name)
  if (existing_host !== null) {
    return {
      status: 400,
      data: { message: 'Host already exists.', host: existing_host },
    }
  }

  const new_host = new Host(new_info.name, {})
  await new_host.save()

  return {
    data: {
      [new_host.name]: new_host.to_json(),
    },
  }
}

export async function handle_route_post_update(request, url, token) {
  const host_name = url.searchParams.get('name')
  if (!token.can_update_host(host_name)) {
    return {
      status: 401,
      data: {
        message: 'Permission required.',
      },
    }
  }

  const host = await get_host(host_name)
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
        [host.name]: host.to_json(),
      },
      update: update_response,
    },
  }
}
