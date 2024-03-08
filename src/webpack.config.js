const path = require("node:path");

module.exports = {
    mode: 'development',
    entry: {
        "Sincromisor": "./js/main.js",
        "SincroGlass": "./js/glass.js"
    },
    devtool: 'source-map',
    output: {
        // ファイル名
        filename: "[name].js",
        // 出力するフォルダ
        path: path.resolve(__dirname, "dist"),
    },
    module: {
        rules: [
            {
                test: /\.m?js/,
                resolve: {
                    fullySpecified: false
                }
            }
        ]
    }
}
