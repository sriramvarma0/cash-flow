type EnvConfig = {
  PORT?: string;
  FRONTEND_URL?: string;
  DATABASE_PROVIDER?: string;
  DATABASE_URL?: string;
  CLOUDFLARE_ACCOUNT_ID?: string;
  CLOUDFLARE_D1_DATABASE_ID?: string;
  CLOUDFLARE_API_TOKEN?: string;
  CLOUDFLARE_D1_HTTP_URL?: string;
  JWT_SECRET?: string;
  JWT_EXPIRES_IN?: string;
  BCRYPT_ROUNDS?: string;
  NODE_ENV?: string;
};

export function validateEnv(config: EnvConfig) {
  if (!config.JWT_SECRET) {
    throw new Error('Missing required environment variable: JWT_SECRET');
  }

  const provider = (config.DATABASE_PROVIDER || 'sqlite').trim().toLowerCase();

  if (provider === 'd1') {
    const hasDirectConfig =
      config.CLOUDFLARE_ACCOUNT_ID &&
      config.CLOUDFLARE_D1_DATABASE_ID &&
      config.CLOUDFLARE_API_TOKEN;
    const hasProxyConfig = !!config.CLOUDFLARE_D1_HTTP_URL;

    if (!hasDirectConfig && !hasProxyConfig) {
      throw new Error(
        'DATABASE_PROVIDER is set to "d1", but required Cloudflare D1 credentials are missing. ' +
          'Must provide either CLOUDFLARE_D1_HTTP_URL or all of: ' +
          'CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_D1_DATABASE_ID, CLOUDFLARE_API_TOKEN.'
      );
    }
  } else if (provider === 'sqlite') {
    if (!config.DATABASE_URL) {
      throw new Error('Missing required environment variable: DATABASE_URL (for DATABASE_PROVIDER=sqlite)');
    }
  } else {
    throw new Error(
      `Invalid DATABASE_PROVIDER: "${config.DATABASE_PROVIDER}". Allowed values are "sqlite" or "d1".`
    );
  }

  return {
    ...config,
    DATABASE_PROVIDER: provider,
    DATABASE_URL: config.DATABASE_URL ?? 'file:../../data/dev.db',
    PORT: config.PORT ?? '4000',
    FRONTEND_URL: config.FRONTEND_URL ?? 'http://localhost:3000',
    JWT_EXPIRES_IN: config.JWT_EXPIRES_IN ?? '7d',
    BCRYPT_ROUNDS: config.BCRYPT_ROUNDS ?? '12',
    NODE_ENV: config.NODE_ENV ?? 'development'
  };
}
