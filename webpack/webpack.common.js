const webpack = require("webpack");
const TerserPlugin = require("terser-webpack-plugin");
const path = require("path");
const CopyPlugin = require("copy-webpack-plugin");
const srcDir = path.join(__dirname, "..", "src");
const { CleanWebpackPlugin } = require("clean-webpack-plugin"); // require

module.exports = {
    entry: {
        popup: path.join(srcDir, "popup.tsx"),
        //   options: path.join(srcDir, 'options.tsx'),
        // background: path.join(srcDir, "background.ts"),
        content_script: path.join(srcDir, "content_script.tsx"),
    },
    output: {
        path: path.join(__dirname, "../dist/js"),
        filename: "[name].js",
    },
    optimization: {
        mergeDuplicateChunks: true,
        minimize: true,
        minimizer: [
            new TerserPlugin({
                terserOptions: {
                    format: {
                        ascii_only: true,
                    },
                    compress: false,
                    mangle: true, // Note `mangle.properties` is `false` by default.
                    module: true,
                },
            }),
        ],
        splitChunks: {
            name: "vendor",
            chunks(chunk) {
                return chunk.name !== "background";
            },
        },
    },
    module: {
        rules: [
            {
                test: /\.tsx?$/,
                exclude: /node_modules/,
                use: [
                    {
                        loader: 'ts-loader',
                        options: {
                            onlyCompileBundledFiles: true
                        }
                    }
                ]
            },
        ],
    },
    resolve: {
        extensions: [".ts", ".tsx", ".js"],
        fallback: { "crypto": false },
    },
    plugins: [
        new CleanWebpackPlugin({
            cleanOnceBeforeBuildPatterns: [
                "dist/**", // cleanOnceBeforeBuildPatterns キーの中に配列指定。また、ディレクトリパスの指定ではなく、 glob での指定
            ],
        }),
        new CopyPlugin({
            patterns: [{ from: ".", to: "../", context: "public" }],
            options: {},
        }),
    ],
};
