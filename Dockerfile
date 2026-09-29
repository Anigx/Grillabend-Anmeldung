FROM node:22-bookworm-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY server.js ./
COPY src/ ./src/
COPY public/ ./public/

RUN mkdir -p /app/data && chown node:node /app/data

ENV NODE_ENV=production \
    PORT=621 \
    DATA_DIR=/app/data

USER node
EXPOSE 621
CMD ["node", "server.js"]
