module.exports = {
  apps: [
    {
      name: 'tunect-backend',

      // ✅ CORRECT ENTRY FILE
      script: 'dist/src/main.js',

      // ✅ Prevent memory crashes
      node_args: '--max-old-space-size=2048',

      // ✅ Ensure crypto is available before Nest loads
      env: {
        NODE_ENV: 'production',
        NODE_OPTIONS: '--experimental-global-webcrypto',
      },
    },
  ],
};
