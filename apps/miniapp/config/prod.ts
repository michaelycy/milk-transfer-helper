module.exports = {
  env: {
    NODE_ENV: '"production"'
  },
  defineConstants: {
  },
  mini: {
    // 生产压缩（未开启时主包体积会超出微信 2MB 上限，无法上传）
    minimize: true,
    // 将公共依赖尽量下沉到分包，控制主包体积（仓库规范：控制主包体积）
    optimizeMainPackage: {
      enable: true,
    },
  },
  h5: {}
}
