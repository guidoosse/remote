const { defineConfig } = require('vite');

module.exports = defineConfig({
  base: './',
  server: {
    allowedHosts: ['localhost', '127.0.0.1', 'libra', 'lira'],
  },
});
