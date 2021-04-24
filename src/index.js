import { get_token_from_request } from './token'
import {
  handle_route_tokens,
  handle_route_token_me,
  handle_route_delete_token_me,
  handle_route_post_tokens,
  handle_route_salt,
} from './routes_token'
import {
  handle_route_hosts,
  handle_route_post_hosts,
  handle_route_post_update,
} from './routes_host'

const ROUTES = [
  /* path, method, handler, authentication_needed */
  ['/hosts', 'GET', handle_route_hosts, true],
  ['/hosts', 'POST', handle_route_post_hosts, true],
  ['/update', 'POST', handle_route_post_update, true],
  ['/tokens', 'GET', handle_route_tokens, true],
  ['/tokens', 'POST', handle_route_post_tokens, true],
  ['/tokens/me', 'GET', handle_route_token_me, true],
  ['/tokens/me', 'DELETE', handle_route_delete_token_me, true],
  ['/salt', 'GET', handle_route_salt, false],
]

async function handleRequest(request) {
  const token = await get_token_from_request(request)
  const url = new URL(request.url)

  for (let route of ROUTES) {
    const [path, method, handler, authentication_needed] = route

    if (request.method != method) {
      continue
    }

    if (url.pathname != path) {
      continue
    }

    if (authentication_needed && token === null) {
      return new Response(null, { status: 401 })
    }

    const response = await handler(request, url, token)

    return new Response(JSON.stringify(response.data), {
      headers: { 'Content-Type': 'application/json' },
      status: response.status || 200,
    })
  }

  return new Response(null, { status: 404 })
}

addEventListener('fetch', (event) => {
  event.respondWith(handleRequest(event.request))
})
