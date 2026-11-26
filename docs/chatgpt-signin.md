# Native Sign in with ChatGPT (development preview)

This Windows-only preview uses the official OpenAI Sign in with ChatGPT DevKit at a pinned revision, the Responses API and the existing Tabby terminal tool approval workflow. No Codex CLI, API key or generic proxy is required. The original API-key/local provider remains the default.

## Build and install

Requires Git, Windows PowerShell 5.1 and Node.js 22.12+ on PATH (including when Tabby starts). From this branch:

    npm ci
    npm run typecheck
    npm test
    npm run build
    npm pack

The build clones the official DevKit, applies application-specific agent input/tool options to its streaming implementation and bundles a local worker. Review the DevKit's separate license before redistribution; the preview is for personal, noncommercial use. The expected package is tabby-ai-panel-0.1.5-siwc.0.tgz.

Close Tabby. Back up the existing plugin and config. Extract the tarball into %APPDATA%/tabby/plugins/node_modules/tabby-ai-panel with package.json and dist directly inside that directory (not nested in package). Keep backups outside node_modules. Restart Tabby.

Open Settings > AI Panel > AI provider > ChatGPT subscription (preview). Sign in through your browser, grant consent, choose an available model and click Test. Test checks model discovery. Keep approval set to Ask for every action.

Start a fresh session on a nonprivileged terminal. Ask for a hello message, then a read-only echo command. Reject the first command, approve the next, check output and Stop. Restart Tabby, verify persistent sign-in, then test sign-out and switching accounts. Check the original local/API-key provider as well.

## Security and limitations

OAuth credentials are stored separately, encrypted with Windows DPAPI CurrentUser. They are not exposed to the Tabby renderer or config.yaml. This does not protect against other processes running as the same user. Terminal context is sent to OpenAI when using the subscription provider. No silent paid-API fallback. Tool calls reach the agent only after a complete, validated response; approvals remain in the existing agent. Account switching cancels active inference but cannot undo already-executed commands. Encrypted reasoning replay is in memory within a turn only. Use model-default reasoning if explicit effort is rejected.

Full build, Windows encryption, live OAuth, model inference and live terminal execution have not yet been validated. Do not use on privileged or production machines before testing. This is a development preview, not a production-ready release.

Official docs: https://developers.openai.com/siwc/quickstart and https://github.com/openai/sign-in-with-chatgpt-devkit
