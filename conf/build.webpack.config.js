const path = require('path');
module.exports = {
  // the enter path
  entry: "./index.js",
  output: {
    path: path.resolve(__dirname, '../dist/'),
    filename: 'numworks.js',
    library: 'Numworks'
  }
}

