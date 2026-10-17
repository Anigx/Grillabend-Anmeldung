FROM node:22-trixie-slim@sha256:b26b04c123d9ff8ab646ceb18b9d75a1173acf64b9a401094b906d27b29338d4

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts

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
