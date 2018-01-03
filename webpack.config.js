const path = require('path');

module.exports = {
    context: path.resolve('public/src'),
    entry: './app.js',
    output: {
        path: path.resolve('./public/bundles/'),
        filename: 'bundle.js'
    },
    resolve: {
        alias: {
            vue: 'vue/dist/vue.js'
        }
    }
};