import path from 'path'

// webpack-chain / webpack 的最小结构类型（避免 any）
interface WebpackChainPluginApi {
  use(plugin: unknown, args?: unknown[]): void
}
interface WebpackChainLike {
  plugin(name: string): WebpackChainPluginApi
}
interface WebpackLike {
  ProvidePlugin: new (assignments: Record<string, unknown>) => unknown
}

const URL_POLYFILL_PATH = path.resolve(__dirname, '../src/utils/url-polyfill')

const config = {
  projectName: 'taro-milk-transfer-helper',
  date: '2024-03-22',
  designWidth: 750,
  deviceRatio: {
    640: 2.34 / 2,
    750: 1,
    828: 1.81 / 2,
  },
  sourceRoot: 'src',
  outputRoot: 'dist',
  plugins: [],
  defineConstants: {},
  copy: {
    patterns: [],
    options: {},
  },
  framework: 'react',
  compiler: {
    type: 'webpack5',
    // taroify 样式在 prebundle 中 @forward 相对引用无法解析，冷启动必现 sass 报错
    // （taroify#879 / taro#12672），将其排除出预编译，走正常编译路径
    prebundle: {
      exclude: ['@taroify/core'],
    },
  },
  cache: {
    enable: false, // Webpack5 开启持久化缓存可能会导致一些问题，暂时关闭
  },
  mini: {
    // 编译期把 URL/URLSearchParams 以模块作用域注入所有引用方（含 supabase-js），
    // 不依赖运行时全局对象——weapp 环境的全局 URL 不可控（缺失或残缺实现）
    webpackChain(chain: WebpackChainLike, webpack: WebpackLike) {
      chain.plugin('provide-url-polyfill').use(webpack.ProvidePlugin, [
        {
          URL: [URL_POLYFILL_PATH, 'MiniURL'],
          URLSearchParams: [URL_POLYFILL_PATH, 'URLSearchParamsMini'],
        },
      ])
    },
    postcss: {
      pxtransform: {
        enable: true,
        config: {},
      },
      url: {
        enable: true,
        config: {
          limit: 1024, // 设定转换尺寸上限
        },
      },
      cssModules: {
        enable: false, // 默认为 false，如需使用 css modules 功能，则设为 true
        config: {
          namingPattern: 'module', // 转换模式，取值为 global/module
          generateScopedName: '[name]__[local]___[hash:base64:5]',
        },
      },
    },
  },
  h5: {
    publicPath: '/',
    staticDirectory: 'static',
    postcss: {
      autoprefixer: {
        enable: true,
        config: {},
      },
      cssModules: {
        enable: false, // 默认为 false，如需使用 css modules 功能，则设为 true
        config: {
          namingPattern: 'module', // 转换模式，取值为 global/module
          generateScopedName: '[name]__[local]___[hash:base64:5]',
        },
      },
    },
  },
};

export default function (merge: (...configs: object[]) => object) {
  if (process.env.NODE_ENV === 'development') {
    return merge({}, config, require('./dev'));
  }
  return merge({}, config, require('./prod'));
}
