import path from 'path';

export default {
    entry: './src/index.ts',
    module: {
        rules: [
            {
                test: /\.ts?$/,
                use: 'ts-loader',
                exclude: /node_modules/,
            },
        ],
    },
    resolve: {
        extensions: ['.tsx', '.ts', '.js'],
    },
    output: {
        filename: 'bundle.js',
        path: path.resolve(process.cwd(), 'dist'),
    },
    devServer: {
        static: path.join(path.dirname(new URL(import.meta.url).pathname), "dist"),
        compress: true,
        port: 4000,
    },
};
