# Release readiness and testing

Baseline: the Windows development preview at db9e104 passed the build. The maintainer confirmed live inference across all available subscription models and login persistence after a Windows restart on 27 November 2026. This is not full acceptance testing. The earlier flagged artifact passed both configured antivirus checks.

## Automated checks

Run npm ci, npm run typecheck, npm test, npm run build, node --test tests/siwc-worker-lifecycle.test.mjs and node scripts/test-agent-integration.mjs. The integration suite uses the real AgentService, prompt construction, Responses-format conversion, approval logic and terminal runner with simulated terminals. It never executes model-generated shell commands. The pinned DevKit local tests exercise its own synthetic OAuth, storage, token refresh and Responses paths; they are not live subscription tests. The OS encryption bridge lifecycle test uses mocked encryption and does not establish actual OS keyring availability.

## Manual acceptance on a disposable Windows/SSH environment

| ID | Procedure | Pass condition | Status |
| --- | --- | --- | --- |
| INS-01 | Fresh install and restart Tabby | Named plugin loads; no console errors | Pending |
| INS-02 | Upgrade current plugin | Settings and conversations retained | Pending |
| INS-03 | Original plugin installed alongside fork | Distinct settings and shortcuts; only one sidebar open at a time | Pending |
| AUTH-01 | Sign in, select a model, send a message | Connected and plan usage enabled, reply received | User reported working; retest each release |
| AUTH-02 | Restart Tabby then Windows | Remains signed in | Passed (maintainer, Windows, 27 Nov 2026) |
| AUTH-03 | Cancel sign-in and retry | No stuck UI or orphan worker | Pending |
| AUTH-04 | Add/switch/sign out accounts | Correct identity/model list; no cross-account request | Pending |
| AUTH-05 | Natural token expiry and revoked grant | Refresh or actionable reauth error | Pending |
| LLM-01 | Ask for CONNECTION_SUCCESS without tools | Exact text reply | Pending |
| LLM-02a | Send a prompt with every available subscription model | All available models respond | Passed (maintainer, Windows, 27 Nov 2026) |
| LLM-02b | Switch reasoning effort | Supported combinations respond; unsupported fail clearly | Pending |
| TERM-01 | Ask to echo CI_TEST on nonprivileged disposable host | Approval required; exactly one command | Pending |
| TERM-02 | Reject echo then stop a pending request | No terminal writes | Pending |
| TERM-03 | Read-only compare two disposable SSH/local terminals | Correct host attribution | Pending |
| CTX-01 | Save, reopen and switch sessions/models | Correct continuity, no leakage across sessions | Pending |
| ERR-01 | Disconnect internet during inference and reconnect | Recoverable error and usable composer | Pending |
| PERF-01 | 50 turns and four hours idle/use | No hangs, leaks or orphan workers | Pending |
| REG-01 | Switch ChatGPT to local/API provider and back | Both settings preserved | Pending |
| OS-01 | macOS/Linux with encrypted keyring | Live install and sign-in | Pending; Windows package only |

Never upload ChatGPT credentials, private terminal logs or OAuth callback URLs to CI. Keep approvals in Ask mode during manual tests. Use synthetic data only. Zero critical/major defects, successful mandatory manual checks, and passing automated checks/security review are required before stable release. Audit reports must be triaged; absence of antivirus detections alone is not a safety guarantee.
