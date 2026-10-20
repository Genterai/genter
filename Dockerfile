# genter serve for a small team (docs/team.md): the local engine over MCP Streamable HTTP, on Node alone (genter-cli
# has no runtime dependency, so nothing is installed). It runs as the user node, not root, and writes only to /data
# (GENTER_HOME, the genter-data volume), so the root filesystem can be read-only. The folders it serves are mounted
# read-only at /repos; tokens and the seal key come as secrets, never in the image or on /data.

# The two folders, made on the machine that builds, so an image for another platform (arm64) needs no emulation: the
# image itself runs nothing at build time.
FROM --platform=$BUILDPLATFORM node:22-alpine AS folders
RUN mkdir -p /out/data /out/repos

FROM node:22-alpine
LABEL org.opencontainers.image.title="genter" \
      org.opencontainers.image.description="genter serve: search and read over a team's repositories, MCP over Streamable HTTP" \
      org.opencontainers.image.source="https://github.com/Genterai/genter" \
      org.opencontainers.image.licenses="Apache-2.0"
ENV NODE_ENV=production GENTER_HOME=/data
WORKDIR /app
COPY package.json LICENSE README.md ./
COPY bin bin
COPY src src
COPY rules rules
COPY readers readers
COPY --from=folders --chown=node:node /out/data /data
COPY --from=folders /out/repos /repos
USER node
VOLUME ["/data"]
EXPOSE 8787
# /health on the port CMD serves (change both together); no token needed, and it says nothing but "ok".
HEALTHCHECK --interval=15s --timeout=5s --start-period=120s \
  CMD ["node", "-e", "fetch('http://127.0.0.1:8787/health').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
ENTRYPOINT ["node", "/app/bin/genter.js"]
CMD ["serve", "/repos", "--host", "0.0.0.0", "--port", "8787"]
