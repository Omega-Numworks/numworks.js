const path = require('path');
module.exports = {
  // the enter path
  entry: "./example/index.js",
  devServer: {
    contentBase: './example/',
    port: 3000,
    index: 'index.html'
  },
  output: {
    path: path.resolve(__dirname, '../dist/'),
    filename: 'numworks.js',
    library: 'Numworks'
  }
}

