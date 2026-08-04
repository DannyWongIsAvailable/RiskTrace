interface Env {
  APP_NAME: string
  APP_ENV: string
  XFYUN_API_BASE_URL?: string
  XFYUN_API_KEY: string
  XFYUN_API_SECRET: string
  XFYUN_FLOW_ID_REVIEW: string
  RISKTRACE_CALLBACK_TOKEN: string
  CLOUDFLARE_ACCOUNT_ID: string
  R2_BUCKET_NAME: string
  R2_ACCESS_KEY_ID: string
  R2_SECRET_ACCESS_KEY: string
  risktrace_db: D1Database
  risktrace_files: R2Bucket
}
