# Demo Script: Showing the Real Process

Three short demonstrations, each proving something different. Keep the Jenkins job
page open in one window and the Release Console page in another.

## Demo 1: A change reaches production by itself (about 3 minutes)

1. Open `http://<server>/` and note the **Build** number and **Commit**.
2. In `app/public/index.html`, change the lede text under the page title.
3. Commit and push:
   ```bash
   git add -A && git commit -m "feat: update console intro" && git push
   ```
4. Watch Jenkins: Checkout, Unit tests, Build image, Smoke test, Deploy, Verify.
5. Refresh the console page. The build number has gone up, the commit has changed,
   the new text is visible, and a new row appears in **Deployment history**.

What it proves: no manual steps between `git push` and the live page.

## Demo 2: A failing test stops the release (about 2 minutes)

1. In `app/test/app.test.js`, change an expectation, for example `assert.equal(res.status, 200)` to `201`.
2. Commit and push.
3. Jenkins stops at **Unit tests**. Later stages are skipped.
4. Refresh the console page. It still shows the previous build.

What it proves: broken code never reaches the server.

## Demo 3: A bad deployment rolls back (about 3 minutes)

This rehearses the most common real-world failure: the image passes every test,
but the server's own configuration breaks it. The smoke test runs the image without
the server's `app.env`, so it passes. The real deployment loads `app.env` and fails.

1. On the server, add a failure switch to the environment file:
   ```bash
   echo 'SIMULATE_STARTUP_FAILURE=true' >> /opt/release-console/app.env
   ```
2. In Jenkins, click **Build with Parameters** and start a build.
3. Tests, build and smoke test pass. **Deploy** starts the new container, which exits
   immediately. The console output shows its last log lines, then "Rolling back to the
   previous container", and the build is marked failed.
4. Refresh the console page. The previous build is still serving, and
   **Deployment history** has a new row marked **Rolled back**.
5. Remove the switch and build again to return to normal:
   ```bash
   sed -i '/SIMULATE_STARTUP_FAILURE/d' /opt/release-console/app.env
   ```

What it proves: a bad release is detected and the last good version is restored
without anyone logging in to fix it under pressure.

## Commands to have ready

```bash
bash scripts/status.sh                 # container, health, resources, logs, history
docker logs -f release-console         # live logs while a deploy runs
watch -n 2 docker ps                   # see the old and new containers swap
```
