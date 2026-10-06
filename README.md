# Token Eater

A compact installable dashboard for three Claude accounts and Codex, showing remaining usage and reset countdowns.

Windows has a standalone installer and a dedicated window, without browser tabs or an address bar. Opening Token Eater starts its own local collector. `npm run build:windows` creates the installer in `dist/`.

Android uses the installable web app at https://paper-rockets.github.io/Usage-/. Open that address in Chrome, tap **Install app**, and confirm installation. The public data contains the four fixed labels, usage percentages, reset times and freshness/status only; no emails, provider account IDs, login profiles or credentials.

The collector reads Codex through the signed-in installed Codex CLI's `account/rateLimits/read`. It uses the signed-in GitHub CLI to update this repository's usage.json every 15 minutes and after Refresh. Keep Token Eater open and the PC online to update the phone. Claude remains unavailable until its three logins have been verified and the reader tested. Unavailable readings are shown as unknown, rather than full quotas.

The app shows when Codex was checked, marks old readings, and preserves the last reading offline. A countdown reaching zero means a reset is due; it does not assume that usage has recovered.

`node build-site.mjs` prepares the deployment directory. The GitHub Pages workflow publishes that directory only.

The owner approved publishing and automatic labelled usage sync. `publish-settings.json` names the destination; set enabled to false to stop uploads. Sign-in credentials come from the installed CLIs and are never bundled with the installer. The desktop window uses a separate loopback port and per-user usage data, so no manually started web server is needed.
