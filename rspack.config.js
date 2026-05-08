const { defineConfig } = require("@meteorjs/rspack");
const sveltePreprocess = require("svelte-preprocess");

/**
 * Rspack configuration for Meteor projects.
 *
 * Provides typed flags on the `Meteor` object, such as:
 * - `Meteor.isClient` / `Meteor.isServer`
 * - `Meteor.isDevelopment` / `Meteor.isProduction`
 * - …and other flags available
 *
 * Use these flags to adjust your build settings based on environment.
 */
module.exports = defineConfig((env) => {
  const isTrue = (value) => value === true || value === "true";
  const isClient = isTrue(env.isClient) || isTrue(env.Meteor?.isClient);
  const isServer = isTrue(env.isServer) || isTrue(env.Meteor?.isServer);
  const isProduction = isTrue(env.isProduction) || isTrue(env.Meteor?.isProduction);

  return {
    ...(isServer && {
      optimization: {
        usedExports: false,
      },
    }),
    ...(isClient && {
      resolve: {
        extensions: [".mjs", ".js", ".ts", ".svelte", ".json"],
        mainFields: ["svelte", "browser", "module", "main"],
        conditionNames: ["svelte", "browser", "import", "module", "default"],
      },
      module: {
        rules: [
          {
            test: /\.svelte$/,
            use: [
              {
                loader: "svelte-loader",
                options: {
                  compilerOptions: { dev: !isProduction },
                  emitCss: isProduction,
                  hotReload: !isProduction,
                  preprocess: sveltePreprocess({
                    sourceMap: !isProduction,
                    postcss: true,
                  }),
                },
              },
            ],
          },
        ],
      },
    }),
  };
});
