# syntax=docker/dockerfile:1
#
# Multi-stage build for Release Console.
#   base       - runtime + dependencies
#   test       - lint and unit tests (a failing test stops the image build)
#   production - small, non-root image that is actually deployed

FROM node:20-alpine AS base
WORKDIR /app
COPY app/package*.json ./
# The app has no runtime dependencies today; this keeps the layer ready for when it does.
RUN if [ -f package-lock.json ]; then npm ci --omit=dev --no-audit --no-fund; fi

# ---------------------------------------------------------------------------
FROM base AS test
COPY app/ ./
RUN npm run lint && npm test

# ---------------------------------------------------------------------------
FROM base AS production

ARG BUILD_NUMBER=local
ARG GIT_COMMIT=unknown
ARG GIT_BRANCH=unknown
ARG BUILD_TIME=unknown

LABEL org.opencontainers.image.title="release-console" \
      org.opencontainers.image.description="Shows the running build, its health and deployment history" \
      org.opencontainers.image.revision="${GIT_COMMIT}" \
      org.opencontainers.image.created="${BUILD_TIME}" \
      org.opencontainers.image.version="${BUILD_NUMBER}"

ENV NODE_ENV=production \
    PORT=3000 \
    APP_ENV=production \
    BUILD_NUMBER=${BUILD_NUMBER} \
    GIT_COMMIT=${GIT_COMMIT} \
    GIT_BRANCH=${GIT_BRANCH} \
    BUILD_TIME=${BUILD_TIME}

COPY app/ ./

# Forces the test stage to run on every build: BuildKit would otherwise skip it
# because nothing in this stage depends on it.
COPY --from=test /app/package.json /tmp/.tests-passed

USER node
EXPOSE 3000

HEALTHCHECK --interval=15s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
