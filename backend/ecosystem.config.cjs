/** PM2 production config — script path must match nest build output (dist/main.js). */
module.exports = {
  apps: [
    {
      name: 'tunect-backend',
      cwd: __dirname,
      script: 'dist/main.js',
      node_args: '--max-old-space-size=2048',
      env: {
        NODE_ENV: 'production',
        NODE_OPTIONS: '--experimental-global-webcrypto',
      },
    },
  ],
};
