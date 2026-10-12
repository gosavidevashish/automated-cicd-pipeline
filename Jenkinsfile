// CI/CD pipeline for Release Console.
// GitHub commit -> test -> build image -> smoke test -> (push) -> deploy -> verify.
//
// Jenkins prerequisites (see docs/SETUP-GUIDE.md):
//   * Docker installed, and the 'jenkins' user is in the 'docker' group
//   * Plugins: Pipeline, Git, Credentials Binding, Timestamper
//   * Only for DEPLOY_TARGET=ec2 or PUSH_IMAGE=true:
//       SSH Agent plugin + credential 'ec2-ssh-key'  (SSH private key)
//       credential 'dockerhub-creds'                 (username + access token)

pipeline {
  agent any

  options {
    timestamps()
    disableConcurrentBuilds()          // two deploys must never race each other
    timeout(time: 20, unit: 'MINUTES')
    buildDiscarder(logRotator(numToKeepStr: '20'))
  }

  // A local VM is not reachable from GitHub, so Jenkins polls instead of waiting for a webhook.
  // If your server is public (for example EC2), a GitHub webhook is faster; see the setup guide.
  triggers { pollSCM('H/2 * * * *') }

  parameters {
    choice(name: 'DEPLOY_TARGET', choices: ['local', 'ec2'],
           description: 'local = the machine running Jenkins. ec2 = a remote server over SSH.')
    string(name: 'EC2_HOST', defaultValue: '',
           description: 'Public IP or DNS of the EC2 instance (only for DEPLOY_TARGET=ec2)')
    string(name: 'EC2_USER', defaultValue: 'ubuntu',
           description: 'SSH user on the EC2 instance')
    booleanParam(name: 'PUSH_IMAGE', defaultValue: false,
           description: 'Push the image to Docker Hub (required for DEPLOY_TARGET=ec2)')
    string(name: 'REGISTRY_REPO', defaultValue: '',
           description: 'Docker Hub repository, for example yourname/release-console')
    string(name: 'APP_ENV', defaultValue: 'production',
           description: 'Value of APP_ENV inside the container')
  }

  environment {
    APP_NAME   = 'release-console'
    IMAGE_REPO = 'release-console'
    HOST_PORT  = '80'
    DEPLOY_DIR = '/opt/release-console'
  }

  stages {

    stage('Checkout') {
      steps {
        checkout scm
        script {
          env.GIT_COMMIT_FULL = sh(script: 'git rev-parse HEAD', returnStdout: true).trim()
          env.GIT_COMMIT_SHORT = env.GIT_COMMIT_FULL.take(7)
          env.GIT_BRANCH_NAME = (env.GIT_BRANCH ?: sh(script: 'git rev-parse --abbrev-ref HEAD', returnStdout: true).trim()).replaceFirst('^origin/', '')
          env.BUILD_TIME = sh(script: 'date -u +%Y-%m-%dT%H:%M:%SZ', returnStdout: true).trim()
          env.IMAGE_TAG = "${env.IMAGE_REPO}:${env.BUILD_NUMBER}"
          if (params.DEPLOY_TARGET == 'ec2' && !(params.PUSH_IMAGE && params.REGISTRY_REPO && params.EC2_HOST)) {
            error('DEPLOY_TARGET=ec2 needs EC2_HOST, REGISTRY_REPO and PUSH_IMAGE=true.')
          }
          currentBuild.displayName = "#${env.BUILD_NUMBER} ${env.GIT_COMMIT_SHORT}"
          echo "Commit ${env.GIT_COMMIT_SHORT} on ${env.GIT_BRANCH_NAME}, image ${env.IMAGE_TAG}"
        }
      }
    }

    stage('Validate tooling') {
      steps {
        sh '''
          docker version --format 'Docker {{.Server.Version}}'
          for f in scripts/*.sh; do bash -n "$f"; echo "syntax ok: $f"; done
        '''
      }
    }

    stage('Unit tests') {
      steps {
        // The Dockerfile 'test' stage runs lint + unit tests in a clean Node container.
        sh 'docker build --target test --tag ${IMAGE_REPO}-test:${BUILD_NUMBER} .'
      }
    }

    stage('Build image') {
      steps {
        sh '''
          docker build \
            --target production \
            --build-arg BUILD_NUMBER="${BUILD_NUMBER}" \
            --build-arg GIT_COMMIT="${GIT_COMMIT_FULL}" \
            --build-arg GIT_BRANCH="${GIT_BRANCH_NAME}" \
            --build-arg BUILD_TIME="${BUILD_TIME}" \
            --tag "${IMAGE_TAG}" \
            --tag "${IMAGE_REPO}:latest" \
            .
          docker image ls "${IMAGE_REPO}"
        '''
      }
    }

    stage('Smoke test image') {
      steps {
        sh 'bash scripts/smoke-test.sh "${IMAGE_TAG}" "${BUILD_NUMBER}"'
      }
    }

    stage('Push image') {
      when { expression { params.PUSH_IMAGE } }
      steps {
        withCredentials([usernamePassword(credentialsId: 'dockerhub-creds',
                                          usernameVariable: 'REGISTRY_USER',
                                          passwordVariable: 'REGISTRY_TOKEN')]) {
          sh '''
            echo "${REGISTRY_TOKEN}" | docker login -u "${REGISTRY_USER}" --password-stdin
            docker tag "${IMAGE_TAG}" "${REGISTRY_REPO}:${BUILD_NUMBER}"
            docker tag "${IMAGE_TAG}" "${REGISTRY_REPO}:latest"
            docker push "${REGISTRY_REPO}:${BUILD_NUMBER}"
            docker push "${REGISTRY_REPO}:latest"
            docker logout
          '''
        }
      }
    }

    stage('Deploy') {
      steps {
        script {
          if (params.DEPLOY_TARGET == 'local') {
            sh '''
              IMAGE="${IMAGE_TAG}" APP_NAME="${APP_NAME}" HOST_PORT="${HOST_PORT}" \
              APP_ENV="${APP_ENV}" DEPLOY_DIR="${DEPLOY_DIR}" \
              BUILD_NUMBER="${BUILD_NUMBER}" GIT_COMMIT="${GIT_COMMIT_SHORT}" \
              bash scripts/deploy.sh
            '''
          } else {
            sshagent(credentials: ['ec2-ssh-key']) {
              sh '''
                ssh -o StrictHostKeyChecking=accept-new "${EC2_USER}@${EC2_HOST}" \
                  "IMAGE='${REGISTRY_REPO}:${BUILD_NUMBER}' APP_NAME='${APP_NAME}' HOST_PORT='${HOST_PORT}' \
                   APP_ENV='${APP_ENV}' DEPLOY_DIR='${DEPLOY_DIR}' \
                   BUILD_NUMBER='${BUILD_NUMBER}' GIT_COMMIT='${GIT_COMMIT_SHORT}' bash -s" < scripts/deploy.sh
              '''
            }
          }
        }
      }
    }

    stage('Verify live service') {
      steps {
        script {
          def host = params.DEPLOY_TARGET == 'ec2' ? params.EC2_HOST : '127.0.0.1'
          sh "bash scripts/verify.sh http://${host}:${env.HOST_PORT} ${env.BUILD_NUMBER}"
        }
      }
    }
  }

  post {
    success {
      echo "Build #${env.BUILD_NUMBER} (${env.GIT_COMMIT_SHORT}) is live."
    }
    failure {
      echo 'Pipeline failed. If the failure was in Deploy, deploy.sh has already restored the previous version.'
      sh 'docker logs --tail 30 "${APP_NAME}" 2>&1 || true'
    }
    always {
      // Keep the Jenkins VM's disk from filling up with old test images and layers.
      sh 'docker rmi "${IMAGE_REPO}-test:${BUILD_NUMBER}" >/dev/null 2>&1 || true; docker image prune -f >/dev/null 2>&1 || true'
    }
  }
}
