import {
  Token,
  get_token_from_id,
  generate_apikey,
  apikey_to_token_id,
} from './token'

export async function handle_route_tokens(request, url, token) {
  if (!token.is_admin()) {
    return {
      status: 401,
      data: { message: 'Only admin tokens can list tokens' },
    }
  }

  const token_key_prefix = 'token:'
  const token_keys = await KV.list({ prefix: token_key_prefix })

  const token_futures = token_keys.keys.map((key) => {
    const token_id = key.name.slice(token_key_prefix.length)
    return get_token_from_id(token_id)
  })

  let tokens = []
  for (let token_future of token_futures) {
    tokens.push(await token_future)
  }

  return {
    data: {
      tokens: Object.fromEntries(
        tokens.map((token) => [token.id, token.to_json()]),
      ),
    },
  }
}

export async function handle_route_token_me(request, url, token) {
  return {
    data: {
      tokens: {
        [token.id]: token.to_json(),
      },
    },
  }
}

export async function handle_route_delete_token_me(request, url, token) {
  await token.delete()
  return {
    no_update_last_use: true,
  }
}

export async function handle_route_post_tokens(request, url, token) {
  if (!token.is_admin()) {
    return {
      status: 401,
      data: { message: 'Only admins can create new tokens' },
    }
  }

  const new_apikey = generate_apikey()
  const new_token_id = await apikey_to_token_id(new_apikey)
  let new_info = await request.json()

  let new_token = new Token(new_token_id, new_info)
  await new_token.save()
  return {
    data: {
      apikey: new_apikey,
      token_id: new_token.id,
      info: new_token.to_json(),
    },
  }
}
