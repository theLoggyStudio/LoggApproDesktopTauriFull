const webpack = require("webpack");

module.exports = function override(config) {
  config.resolve.fallback = {
    ...config.resolve.fallback,
    process: require.resolve("process/browser"),
    zlib: require.resolve("browserify-zlib"),
    stream: require.resolve("stream-browserify"),
    buffer: require.resolve("buffer"),
  };
  config.plugins = (config.plugins || []).concat([
    new webpack.ProvidePlugin({
      process: "process/browser",
      Buffer: ["buffer", "Buffer"],
    }),
  ]);

  // Augmenter la limite de mémoire pour ForkTsCheckerWebpackPlugin
  const ForkTsCheckerWebpackPlugin = config.plugins.find(
    plugin => plugin.constructor.name === 'ForkTsCheckerWebpackPlugin'
  );
  
  if (ForkTsCheckerWebpackPlugin) {
    ForkTsCheckerWebpackPlugin.options = {
      ...ForkTsCheckerWebpackPlugin.options,
      typescript: {
        ...ForkTsCheckerWebpackPlugin.options?.typescript,
        memoryLimit: 4096, // Augmenter à 4GB
      },
    };
  }

  return config;
};
