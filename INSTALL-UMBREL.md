# Pages 0.1.0 – Build and Umbrel installation

This package contains the complete first release of Pages. The version intentionally remains `0.1.0` because no earlier build has been published.

Pages now uses two containers in addition to Umbrel's app proxy:

- `web` — dashboard, templates, editor, static websites, and Onion-service management
- `tor` — dedicated Tor process for independent per-site Onion v3 addresses

The shared Onion address supplied by Umbrel remains available and unchanged.

## Included folders

```text
pages-project/
├── source/                    # Source for both Docker images
│   ├── Dockerfile             # Pages web image
│   ├── Dockerfile.tor         # Pages Tor image
│   └── tor/                   # Tor configuration and entrypoint
├── umbrel/denny-pages/        # Umbrel Community App Store package
└── assets/                    # Logo and gallery screenshots
```

## 1. Optional local checks

These checks require Node.js 22.5 or newer on Windows. The Docker images already contain their required runtimes, so `npm: command not found` on the Windows host does not prevent the images from building.

From the extracted `source` folder:

```bash
npm run check
npm test
```

The tests validate the templates, site creation, draft protection, local and shared Onion links, QR generation, modal behavior, and the independent Onion lifecycle using a simulated authenticated Tor control socket.

## 2. Build and push both multiarch images

Sign in to Docker Hub:

```bash
docker login
```

From `~/pages-project/source` run:

```bash
chmod +x build-and-pin.sh docker-entrypoint.sh tor/entrypoint.sh
./build-and-pin.sh ../umbrel/denny-pages/docker-compose.yml
```

The script deliberately builds without cache and performs the following actions:

1. Creates or reuses the Buildx builder `pages-builder`.
2. Builds `linux/amd64` and `linux/arm64` for the Pages web image.
3. Pushes `dennysubke/pages:0.1.0` and `dennysubke/pages:latest`.
4. Builds `linux/amd64` and `linux/arm64` for the Tor sidecar.
5. Pushes `dennysubke/pages-tor:0.1.0` and `dennysubke/pages-tor:latest`.
6. Reads both multiarch digests.
7. Pins both image references in `../umbrel/denny-pages/docker-compose.yml`.

Verify both published manifests:

```bash
docker buildx imagetools inspect dennysubke/pages:0.1.0
docker buildx imagetools inspect dennysubke/pages-tor:0.1.0
```

The Umbrel compose file should then contain two pinned references:

```yaml
image: dennysubke/pages-tor:0.1.0@sha256:TOR_MULTIARCH_DIGEST
```

```yaml
image: dennysubke/pages:0.1.0@sha256:WEB_MULTIARCH_DIGEST
```

Do not manually reuse the digest of an earlier Pages build.

## 3. Publish the source repository

Create an empty GitHub repository named `pages`, then run from the `source` folder:

```bash
git init
git add .
git commit -m "Initial Pages release"
git branch -M master
git remote add origin https://github.com/dennysubke/pages.git
git push -u origin master
```

## 4. Publish the Gallery assets

Copy the files from `pages-project/assets` into:

```text
dennys-umbrel-app-gallery/denny-pages/
```

The final files are:

```text
logo.png
1.jpg
2.jpg
3.jpg
```

Commit and push the Gallery repository.

## 5. Add Pages to the Community App Store

Only copy the Umbrel package after the build script has pinned both image digests:

```bash
rm -rf /c/PATH/TO/dennys-umbrel-app-store/denny-pages
cp -R ../umbrel/denny-pages /c/PATH/TO/dennys-umbrel-app-store/denny-pages
```

Then commit and push your App Store repository.

## 6. Install or replace the test installation

Because the compose topology now includes a new `tor` service, the cleanest approach for an unpublished test installation is:

1. Uninstall the current Pages test installation.
2. Update the Community App Store.
3. Install Pages again.

All three containers should be running:

```bash
sudo docker ps --filter name=denny-pages
```

Expected names include:

```text
denny-pages_app_proxy_1
denny-pages_web_1
denny-pages_tor_1
```

Inspect startup logs when necessary:

```bash
sudo docker logs --tail=100 denny-pages_web_1
sudo docker logs --tail=100 denny-pages_tor_1
```

## 7. Use an independent Onion address

1. Create or open a website.
2. Open its **Sharing** tab.
3. Find **Independent Onion**.
4. Select **Generate Onion address**.
5. Wait until the status changes to **Ready**.
6. Open, copy, or display the QR code for the new root URL.

Example:

```text
http://<website-specific-onion-v3-address>.onion/
```

This address does not contain `/p/<slug>/` and is independent of Umbrel's own Pages Onion address.

The controls behave as follows:

- **Disable** stops the service but preserves the address and private key.
- **Enable** restores the same address.
- **Regenerate** retires the current identity and creates a new address. The old URL will no longer work.
- Deleting the website also removes its active Onion service and stored identity key.

The dedicated Tor sidecar means independent addresses do not require Umbrel Remote Tor to be enabled. The sidecar still requires normal outbound internet access so it can connect to the Tor network.

## 8. Shared Umbrel Onion address

When Umbrel provides `APP_HIDDEN_SERVICE`, Pages also displays the original shared app Onion address:

```text
http://<pages-umbrel-address>.onion/p/my-website/
```

This remains separate from the new website-specific address. Both publishing methods may be used at the same time.

## 9. Persistent Onion identity

The private identity key for each site is stored under the Pages application data directory:

```text
${APP_DATA_DIR}/data/tor/keys/<site-id>.key
```

Tor runtime state is stored under:

```text
${APP_DATA_DIR}/tor/state
```

The identity key keeps the Onion address stable across container restarts, Umbrel restarts, and image updates. Protect backups of the complete app-data directory. A normal website ZIP export does not include the Onion key.

## 10. Custom domain

Configure a reverse proxy with:

```text
Forward host: umbrel.local
Forward port: 8377
Protocol: http
```

Preserve the incoming `Host` header, then add the hostname in the website's **Sharing** tab.

## 11. Troubleshooting

### Independent Onion remains on Waiting

Check the Tor sidecar:

```bash
sudo docker ps --filter name=denny-pages_tor_1
sudo docker logs --tail=200 denny-pages_tor_1
```

Check that the control socket and authentication cookie exist:

```bash
sudo docker exec denny-pages_tor_1 sh -lc 'ls -la /run/tor-control'
```

Check the status seen by Pages:

```bash
sudo docker exec denny-pages_web_1 node -e \
  "fetch('http://127.0.0.1:3000/api/health').then(r=>r.text()).then(console.log)"
```

Tor may need a few minutes to bootstrap after the first installation. The Pages reconciliation loop retries automatically.

### First-start permission error

Do not add `user: "1000:1000"` to either service. Each container briefly initializes its bind mounts and then drops permanently to UID/GID `1000:1000`.

If an older test installation left incompatible ownership behind, reinstalling the unpublished test app is preferable. For the web data mount, the exact host path can also be repaired once:

```bash
DATA_PATH="$(sudo docker inspect denny-pages_web_1 --format '{{range .Mounts}}{{if eq .Destination "/data"}}{{.Source}}{{end}}{{end}}')"
printf 'Pages data path: %s\n' "$DATA_PATH"
sudo chown -R 1000:1000 "$DATA_PATH"
sudo docker restart denny-pages_web_1 denny-pages_tor_1 denny-pages_app_proxy_1
```
