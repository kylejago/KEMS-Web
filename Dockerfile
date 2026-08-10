FROM node:22-alpine
WORKDIR /app
COPY package.json server.mjs ./
COPY public ./public
COPY config ./config
RUN mkdir -p /data && chown -R node:node /app /data
USER node
ENV NODE_ENV=production \
    PORT=4173 \
    HOST=0.0.0.0 \
    TZ=Europe/London \
    DATA_DIR=/data
EXPOSE 4173
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:4173/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "server.mjs"]
