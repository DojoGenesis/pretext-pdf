# Build stage — includes native build tools for `canvas` (Cairo bindings)
FROM node:20-alpine AS builder
RUN apk add --no-cache python3 make g++ pkgconfig cairo-dev pango-dev jpeg-dev giflib-dev
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --ignore-scripts=false
COPY tsconfig.json ./
COPY src/ ./src/
COPY fonts/ ./fonts/
RUN npm run build

# Runtime stage — minimal image with Cairo runtime libs
FROM node:20-alpine
RUN apk add --no-cache cairo pango jpeg giflib fontconfig
WORKDIR /app
COPY --from=builder /app/dist/ ./dist/
COPY --from=builder /app/node_modules/ ./node_modules/
COPY --from=builder /app/package.json ./
COPY --from=builder /app/fonts/ ./fonts/
RUN adduser -D -u 1000 dojo
USER dojo
ENTRYPOINT ["node", "dist/index.js"]
