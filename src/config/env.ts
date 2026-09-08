/**
 * 环境变量统一出口。
 * Taro 内置 dotenv 支持，`.env` 中以 TARO_APP_ 为前缀的变量会在编译期注入 process.env。
 */
const supabaseUrl = process.env.TARO_APP_SUPABASE_URL
const supabaseAnonKey = process.env.TARO_APP_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    '[env] 缺少 TARO_APP_SUPABASE_URL / TARO_APP_SUPABASE_ANON_KEY，请复制 .env.example 为 .env 并填写后重新构建'
  )
}

export const SUPABASE_URL = supabaseUrl
export const SUPABASE_ANON_KEY = supabaseAnonKey
