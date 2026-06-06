import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

const optionalUrl = z.string().url().optional();
const optionalString = z.string().min(1).optional();

export const env = createEnv({
  server: {
    DATABASE_URL: z.string().min(1),
    NEXTAUTH_SECRET: z.string().min(1),
    NEXTAUTH_URL: z.string().url(),
    STORAGE_PROVIDER: z.enum(["minio", "r2"]).optional(),
    S3_ENDPOINT: optionalUrl,
    S3_ACCESS_KEY_ID: optionalString,
    S3_SECRET_ACCESS_KEY: optionalString,
    S3_BUCKET_NAME: optionalString,
    S3_PUBLIC_URL: optionalUrl,
    R2_ACCOUNT_ID: optionalString,
    R2_ENDPOINT: optionalUrl,
    R2_ACCESS_KEY_ID: optionalString,
    R2_SECRET_ACCESS_KEY: optionalString,
    R2_BUCKET_NAME: optionalString,
    R2_PUBLIC_URL: optionalUrl,
    R2_REGION: optionalString,
    ENABLE_LOCAL_DEMO_AUDIO: z.enum(["true", "false"]).optional(),
    ENABLE_DEV_FAKE_PLAYERS: z.enum(["true", "false"]).optional(),
  },
  client: {},
  runtimeEnv: {
    DATABASE_URL: process.env.DATABASE_URL,
    NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET,
    NEXTAUTH_URL: process.env.NEXTAUTH_URL,
    STORAGE_PROVIDER: process.env.STORAGE_PROVIDER,
    S3_ENDPOINT: process.env.S3_ENDPOINT,
    S3_ACCESS_KEY_ID: process.env.S3_ACCESS_KEY_ID,
    S3_SECRET_ACCESS_KEY: process.env.S3_SECRET_ACCESS_KEY,
    S3_BUCKET_NAME: process.env.S3_BUCKET_NAME,
    S3_PUBLIC_URL: process.env.S3_PUBLIC_URL,
    R2_ACCOUNT_ID: process.env.R2_ACCOUNT_ID,
    R2_ENDPOINT: process.env.R2_ENDPOINT,
    R2_ACCESS_KEY_ID: process.env.R2_ACCESS_KEY_ID,
    R2_SECRET_ACCESS_KEY: process.env.R2_SECRET_ACCESS_KEY,
    R2_BUCKET_NAME: process.env.R2_BUCKET_NAME,
    R2_PUBLIC_URL: process.env.R2_PUBLIC_URL,
    R2_REGION: process.env.R2_REGION,
    ENABLE_LOCAL_DEMO_AUDIO: process.env.ENABLE_LOCAL_DEMO_AUDIO,
    ENABLE_DEV_FAKE_PLAYERS: process.env.ENABLE_DEV_FAKE_PLAYERS,
  },
  emptyStringAsUndefined: true,
});
