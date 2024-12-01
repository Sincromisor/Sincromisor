import postcssPresetEnv from 'postcss-preset-env';

export default {
    plugins: [
        postcssPresetEnv({
            browsers: 'defaults or chrome >= 103'
        })
    ]
};
