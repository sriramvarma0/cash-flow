type EnvConfig = {
  PORT?: string;
  FRONTEND_URL?: string;
  DATABASE_URL?: string;
  JWT_SECRET?: string;
  JWT_EXPIRES_IN?: string;
  BCRYPT_ROUNDS?: string;
};

export function validateEnv(config: EnvConfig) {
  const requiredKeys: Array<keyof EnvConfig> = ['DATABASE_URL', 'JWT_SECRET'];

  for (const key of requiredKeys) {
    if (!config[key]) {
      throw new Error(`Missing required environment variable: ${key}`);
    }
  }

  return {
    ...config,
    PORT: config.PORT ?? '4000',
    FRONTEND_URL: config.FRONTEND_URL ?? 'http://localhost:3000',
    JWT_EXPIRES_IN: config.JWT_EXPIRES_IN ?? '7d',
    BCRYPT_ROUNDS: config.BCRYPT_ROUNDS ?? '12'
  };
}
