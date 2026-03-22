class Cortex < Formula
  desc "Persistent memory layer for Claude Code — remembers context across sessions"
  homepage "https://cortex.sh"
  url "https://registry.npmjs.org/@cortex-memory/cli/-/cli-1.0.0.tgz"
  # SHA256 must be updated after each npm publish:
  # curl -sO https://registry.npmjs.org/@cortex-memory/cli/-/cli-1.0.0.tgz
  # shasum -a 256 cli-1.0.0.tgz
  sha256 "PLACEHOLDER_SHA256_COMPUTE_AFTER_NPM_PUBLISH"
  license "MIT"

  depends_on "node@18"

  def install
    system "npm", "install", *std_npm_args
    bin.install_symlink Dir["#{libexec}/bin/*"]
  end

  def post_install
    # Initialize database and config without starting the daemon
    system "#{bin}/cortex", "init", "--no-daemon"
  end

  def caveats
    <<~EOS
      Cortex has been installed.

      To complete setup, run:
        cortex init

      This will:
        - Create the SQLite database at ~/.cortex/cortex.db
        - Register the MCP server with Claude Code
        - Start the background daemon

      To verify your installation:
        cortex doctor

      To start the daemon manually:
        cortex server --daemon

      On macOS, a launchd service is available:
        brew services start cortex

      Documentation: https://cortex.sh/docs
    EOS
  end

  service do
    run [opt_bin/"cortex", "server", "--daemon"]
    keep_alive true
    working_dir var/"cortex"
    log_path var/"log/cortex/daemon.log"
    error_log_path var/"log/cortex/error.log"
    environment_variables CORTEX_PORT: "7434"
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/cortex --version")
    assert_match "ok", shell_output("#{bin}/cortex doctor --json 2>&1")
  end
end
