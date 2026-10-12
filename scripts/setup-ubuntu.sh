#!/usr/bin/env bash
#
# Prepares a fresh Ubuntu 24.04 machine (VMware VM or EC2) as a CI/CD host:
# Docker, Java 21, Jenkins, and the folder deploy.sh writes to.
#
# Usage:  sudo bash scripts/setup-ubuntu.sh [--no-jenkins]
#   --no-jenkins   install only Docker (use this for a separate deployment target)
set -Eeuo pipefail

if [ "$(id -u)" -ne 0 ]; then
  echo "Run with sudo: sudo bash $0" >&2
  exit 1
fi

INSTALL_JENKINS=true
[ "${1:-}" = "--no-jenkins" ] && INSTALL_JENKINS=false
DEPLOY_USER="${SUDO_USER:-ubuntu}"
DEPLOY_DIR=/opt/release-console

echo "==> Base packages"
apt-get update -y
apt-get install -y ca-certificates curl git gnupg fontconfig

echo "==> Docker"
if ! command -v docker >/dev/null; then
  apt-get install -y docker.io
fi
systemctl enable --now docker
usermod -aG docker "$DEPLOY_USER"

if [ "$INSTALL_JENKINS" = true ]; then
  echo "==> Java 21 and Jenkins"
  apt-get install -y openjdk-21-jre
  install -d -m 0755 /etc/apt/keyrings
  # Jenkins rotated its signing key; the 2023 key expired in March 2026, so use the 2026 one.
  curl -fsSL https://pkg.jenkins.io/debian-stable/jenkins.io-2026.key -o /etc/apt/keyrings/jenkins-keyring.asc
  echo "deb [signed-by=/etc/apt/keyrings/jenkins-keyring.asc] https://pkg.jenkins.io/debian-stable binary/" \
    > /etc/apt/sources.list.d/jenkins.list
  apt-get update -y
  apt-get install -y jenkins

  # Keep Jenkins inside a small VM: cap the Java heap at 768 MB.
  install -d /etc/systemd/system/jenkins.service.d
  cat > /etc/systemd/system/jenkins.service.d/override.conf <<'CONF'
[Service]
Environment="JAVA_OPTS=-Xms256m -Xmx768m -Djava.awt.headless=true"
CONF
  systemctl daemon-reload

  usermod -aG docker jenkins
fi

echo "==> Deployment folder $DEPLOY_DIR"
install -d -m 0755 "$DEPLOY_DIR"
chown "$DEPLOY_USER":"$DEPLOY_USER" "$DEPLOY_DIR"
if [ "$INSTALL_JENKINS" = true ]; then
  # Jenkins runs deploy.sh locally, so it must be able to write here too.
  chown jenkins:"$DEPLOY_USER" "$DEPLOY_DIR"
  chmod 0775 "$DEPLOY_DIR"
fi

if [ "$INSTALL_JENKINS" = true ]; then
  systemctl enable jenkins
  systemctl restart jenkins
  echo
  echo "Jenkins is starting on port 8080. Unlock password:"
  echo "  sudo cat /var/lib/jenkins/secrets/initialAdminPassword"
fi

echo
echo "Done. Log out and back in so '$DEPLOY_USER' picks up the docker group."
