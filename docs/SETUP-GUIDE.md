# Setup Guide

Two ways to run the deployment target. Option A needs no cloud account.
Option B uses AWS EC2. Both use the same Jenkinsfile and scripts.

## Option A: Local server in VMware Workstation

### 1. Create the VM

On a host with 8 GB of RAM, give the VM enough to run Jenkins and Docker without
starving Windows.

| Setting | Value |
|---|---|
| OS | Ubuntu Server 24.04 LTS |
| Memory | 4 GB |
| Processors | 2 |
| Disk | 30 GB |
| Network | Bridged, or NAT with a port forward for 8080 and 80 |

Close other heavy applications while Jenkins builds. If the VM starts swapping,
add a 2 GB swap file:

```bash
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile
sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

### 2. Install Docker, Java and Jenkins

```bash
sudo apt-get update && sudo apt-get install -y git
git clone https://github.com/<your-user>/release-console.git
cd release-console
sudo bash scripts/setup-ubuntu.sh
```

Log out and back in once, so your user joins the `docker` group. Confirm:

```bash
docker run --rm hello-world
sudo systemctl status jenkins --no-pager
```

The script installs Jenkins from the official `debian-stable` repository using the
2026 signing key (the older 2023 key expired in March 2026, which breaks many
older tutorials), and caps the Jenkins Java heap at 768 MB.

### 3. Unlock Jenkins

1. Find the VM's address with `hostname -I`.
2. Open `http://<vm-ip>:8080`.
3. Paste the password from `sudo cat /var/lib/jenkins/secrets/initialAdminPassword`.
4. Choose **Install suggested plugins**, then create your admin user.

### 4. Create the pipeline job

1. **New Item**, name it `release-console`, choose **Pipeline**.
2. Under **Pipeline**, set **Definition** to *Pipeline script from SCM*.
3. SCM: *Git*. Repository URL: your GitHub repository. Branch: `*/main`.
4. For a private repository, add a GitHub username and personal access token under
   **Credentials**.
5. Script Path: `Jenkinsfile`. Save.
6. Click **Build with Parameters** and accept the defaults (`DEPLOY_TARGET=local`).

The first run takes a few minutes while Docker downloads the Node base image.
When it ends, open `http://<vm-ip>/`.

### 5. Trigger on every push

The Jenkinsfile polls GitHub every two minutes, which works for a VM that GitHub
cannot reach. To make it instant, add a webhook:

1. Expose Jenkins (a tunnelling tool such as ngrok is the simplest for a lab).
2. GitHub repository, **Settings**, **Webhooks**, **Add webhook**.
3. Payload URL: `https://<public-address>/github-webhook/`, content type
   `application/json`, event: *Just the push event*.
4. In the job, tick **GitHub hook trigger for GITScm polling**.

## Option B: AWS EC2

### 1. Launch the instance

| Setting | Value |
|---|---|
| AMI | Ubuntu Server 24.04 LTS |
| Type | t3.micro (free-tier eligible in many accounts; confirm in your billing console) |
| Key pair | Create one and keep the `.pem` file safe |
| Security group | Inbound 22 (your IP only), 80 (anywhere), 8080 (your IP only, only if Jenkins runs here) |

Prefer running Jenkins on your VM and deploying to EC2 over SSH. A 1 GB t3.micro is
tight for Jenkins plus Docker.

### 2. Prepare the instance as a deployment target

```bash
ssh -i your-key.pem ubuntu@<ec2-public-ip>
git clone https://github.com/<your-user>/release-console.git
cd release-console
sudo bash scripts/setup-ubuntu.sh --no-jenkins
```

### 3. Give Jenkins what it needs

In Jenkins, **Manage Jenkins**, **Credentials**, add:

| ID | Kind | Contents |
|---|---|---|
| `ec2-ssh-key` | SSH Username with private key | The `.pem` contents, username `ubuntu` |
| `dockerhub-creds` | Username with password | Docker Hub username and an access token |

Install the **SSH Agent** plugin from **Manage Jenkins**, **Plugins**.

### 4. Run with the EC2 target

**Build with Parameters**:

| Parameter | Value |
|---|---|
| DEPLOY_TARGET | `ec2` |
| EC2_HOST | The instance's public IP or DNS |
| PUSH_IMAGE | ticked |
| REGISTRY_REPO | `<dockerhub-user>/release-console` |

Open `http://<ec2-public-ip>/`.

## Environment variables

Defaults are set by the pipeline. To add or override values on the server, create
`/opt/release-console/app.env`; `deploy.sh` passes it to the container on every deploy.

```bash
# /opt/release-console/app.env
LOG_LEVEL=info
```

Keep secrets out of Git. This file lives only on the server.

## Checklist

- [ ] `docker run --rm hello-world` works for your user
- [ ] Jenkins reachable on port 8080
- [ ] Job builds from your repository
- [ ] `http://<server>/` shows the build number from Jenkins
- [ ] A second commit produces a new build number on the page
