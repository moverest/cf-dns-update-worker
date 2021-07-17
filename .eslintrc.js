module.exports = {
  env: {
    browser: true,
    es2021: true,
  },
  extends: 'eslint:recommended',
  parserOptions: {
    ecmaVersion: 12,
    sourceType: 'module',
  },
  rules: {},
  globals: {
    KV: false,
    CF_ZONE_ID: false,
    CF_DNS_TOKEN: false,
    TOKEN_SALT: false,
    CORS_ALLOW_ORIGIN: true,
  },
}
