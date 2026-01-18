module.exports = {
  apps: [
    {
      name: 'tunect-backend',
      script: 'dist/src/main.js',
      node_args: '--max-old-space-size=2048',
      env: {
        NODE_ENV: 'production',
        NODE_OPTIONS: '--experimental-global-webcrypto',
      },
    },
  ],
};
