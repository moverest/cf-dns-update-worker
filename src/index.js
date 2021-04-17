import { get_token_from_request } from './token'
import {
  handle_route_tokens,
  handle_route_token_me,
  handle_route_delete_token_me,
  handle_route_post_tokens,
} from './routes_token'

async function handle_route_ip(request, url, token) {
  return {
    data: { ip: request.headers.get('CF-Connecting-IP') },
  }
}

const ROUTES = [
  ['/tokens', 'GET', handle_route_tokens],
  ['/tokens', 'POST', handle_route_post_tokens],
  ['/tokens/me', 'GET', handle_route_token_me],
  ['/tokens/me', 'DELETE', handle_route_delete_token_me],
  ['/ip', 'GET', handle_route_ip],
]

async function handleRequest(request) {
  let token = await get_token_from_request(request)
  if (token === null) {
    return new Response(null, { status: 401 })
  }

  const url = new URL(request.url)

  for (let route of ROUTES) {
    const path = route[0]
    const method = route[1]
    const handler = route[2]

    if (request.method != method) {
      continue
    }

    if (url.pathname != path) {
      continue
    }

    const response = await handler(request, url, token)

    if (!response.no_update_last_use) {
      token.save_with_last_use()
    }
    return new Response(JSON.stringify(response.data), {
      headers: { 'content-type': 'application/json' },
      status: response.status || 200,
    })
  }

  token.save_with_last_use()
  return new Response(
    JSON.stringify({ path: url.pathname, method: request.method }),
    { status: 404 },
  )
}

addEventListener('fetch', (event) => {
  event.respondWith(handleRequest(event.request))
})
