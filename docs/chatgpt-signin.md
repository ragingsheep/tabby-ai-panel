# Native Sign in with ChatGPT (development preview)

This development preview uses the official OpenAI Sign in with ChatGPT DevKit at a pinned revision, the Responses API and the existing Tabby terminal tool approval workflow. No Codex CLI, API key or generic proxy is required. The original API-key/local provider remains the default.

## Build and install

### Prebuilt Windows x64 artifact

Open the [Windows build runs](https://github.com/ragingsheep/tabby-ai-panel/actions), select the latest successful build for `feature/native-chatgpt-signin` and download `tabby-ai-panel-oaisub-windows-x64` under Artifacts. This package includes portable Node.js, so Git, npm and a system Node installation are not required. Credential encryption uses Electron safeStorage (Windows DPAPI, macOS Keychain or a supported Linux keyring). Linux without an encrypted keyring is rejected. The prebuilt package is Windows x64.

Close Tabby. Back up and remove or disable the previous subscription-preview plugin. You can retain the original upstream plugin separately. Extract the ZIP into `%APPDATA%/tabby/plugins/node_modules/` so that `tabby-ai-panel-oaisub/package.json` and `tabby-ai-panel-oaisub/dist/index.js` exist. Restart Tabby.

### Building from source

Requires Git and Node.js 22.12+ on PATH (including when Tabby starts if no portable runtime is bundled). From this branch:

    npm ci
    npm run typecheck
    npm test
    npm run build
    npm pack

The build clones the official DevKit, applies application-specific agent input/tool options to its streaming implementation and bundles a local worker. Review the DevKit's separate license before redistribution; the preview is for personal, noncommercial use. The expected package is tabby-ai-panel-oaisub-0.1.5-siwc.0.tgz.

Close Tabby. Back up the existing plugin and config. Extract the tarball into %APPDATA%/tabby/plugins/node_modules/tabby-ai-panel-oaisub with package.json and dist directly inside that directory (not nested in package). Keep backups outside node_modules. Restart Tabby.

Open Settings > AI Panel-oAIsub > AI provider > ChatGPT subscription (preview). Sign in through your browser, grant consent, choose an available model and click Test. Test checks model discovery. Keep approval set to Ask for every action.

Start a fresh session on a nonprivileged terminal. Ask for a hello message, then a read-only echo command. Reject the first command, approve the next, check output and Stop. Restart Tabby, verify persistent sign-in, then test sign-out and switching accounts. Check the original local/API-key provider as well.

## Security and limitations

OAuth credentials are stored in a separate encrypted file under Tabby's userData directory, using Electron safeStorage. The local worker performs OAuth and delegates encryption/decryption through a private pipe to Tabby's Electron bridge. Plaintext is transiently present in the worker and renderer during encryption/decryption; it is not stored in config.yaml or logged. This does not protect against other processes running as the same user. Terminal context is sent to OpenAI when using the subscription provider. No silent paid-API fallback. Tool calls reach the agent only after a complete, validated response; approvals remain in the existing agent. Account switching cancels active inference but cannot undo already-executed commands. Encrypted reasoning replay is in memory within a turn only. Use model-default reasoning if explicit effort is rejected.

Automated worker IPC tests do not exercise actual Tabby safeStorage. Live OAuth, OS keyring integration, model inference and terminal execution need testing. Do not use on privileged or production machines before testing. This is a development preview, not a production-ready release.

Official docs: https://developers.openai.com/siwc/quickstart and https://github.com/openai/sign-in-with-chatgpt-devkit

## Troubleshooting browser sign-in

After browser consent, Tabby must show a connected account with plan usage enabled. Use **Refresh account status** to reload the saved connection without opening the browser. If the earlier preview appeared stuck, fully exit Tabby before replacing the plugin. The new encryption format uses a separate credential directory and requires signing in again. The previous DPAPI-encrypted file is left untouched. The renamed plugin has its own settings and session directory; the old plugin's settings and sessions are not automatically migrated. Close or disable the old panel before opening the renamed panel; simultaneous sidebar layout is not supported. Do not share authentication URLs, OAuth codes, tokens or credential files when reporting problems. Share only the displayed error text or whether the browser reached the Return to your app page.
