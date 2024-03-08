const path = require("node:path");

module.exports = {
    mode: 'development',
    entry: "./js/main.js",
    devtool: 'source-map',
    output: {
        // ファイル名
        filename: "Sincromisor.js",
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
