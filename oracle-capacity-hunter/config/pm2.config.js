module.exports = {
  apps: [{
    name: "oracle-capacity-hunter",
    script: "./src/index.js",
    watch: false,
    env: {
      NODE_ENV: "production",
    }
  }]
}
