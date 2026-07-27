FROM node:22.16.0-alpine3.22

RUN apk add --no-cache tini unzip zip libqrencode-tools su-exec

WORKDIR /app
COPY --chown=node:node package.json server.mjs ./
COPY --chown=node:node public ./public
COPY --chown=node:node templates ./templates
COPY --chown=root:root docker-entrypoint.sh /usr/local/bin/pages-entrypoint
RUN chmod 0755 /usr/local/bin/pages-entrypoint

ENV NODE_ENV=production \
    PORT=3000 \
    DATA_DIR=/data \
    PUID=1000 \
    PGID=1000 \
    MAX_UPLOAD_BYTES=104857600

EXPOSE 3000
ENTRYPOINT ["/sbin/tini", "--", "/usr/local/bin/pages-entrypoint"]
CMD ["node", "--no-warnings", "server.mjs"]
