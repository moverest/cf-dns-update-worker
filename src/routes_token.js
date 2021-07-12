import {
  Token,
  get_token_from_id,
  generate_apikey,
  apikey_to_token_id,
  generate_salt_and_apikey,
} from './token'

export async function handle_route_tokens(request, url, token) {
  if (!token.is_admin()) {
    return {
      status: 403,
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
}

export async function handle_route_post_tokens(request, url, token) {
  if (!token.is_admin()) {
    return {
      status: 403,
      data: { message: 'Only admins can create new tokens' },
    }
  }

  let info = await request.json()
  let apikey = undefined

  if ('id' in info) {
    const edited_token = get_token_from_id(info.id)
    if (edited_token === null) {
      return {
        status: 400,
        data: {
          error: 'token-not-found',
        },
      }
    }
  } else {
    apikey = generate_apikey()
    info.id = await apikey_to_token_id(apikey)
  }

  const errors = Token.validate_info(info)
  if (errors.length !== 0) {
    return {
      status: 400,
      data: {
        error: 'invalid-token',
        details: errors,
      },
    }
  }

  const new_token = new Token(info.id, info)
  await new_token.save()
  return {
    data: {
      apikey: apikey,
      token_id: new_token.id,
      info: new_token.to_json(),
    },
  }
}

export async function handle_route_salt(request, url, token) {
  return {
    data: await generate_salt_and_apikey(),
  }
}
