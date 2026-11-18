# Build context: backend/
#   cd backend
#   docker build -t outinggo-backend .
#
# Run the image with the same env vars as local development:
# PORT, NODE_ENV, DATABASE_URL, JWT_SECRET, JWT_EXPIRES_IN, CORS_ORIGIN.
#
# bcrypt 6.0.0 ships prebuilt N-API binaries for linux-x64 and linux-arm64
# (musl included), so node:20-alpine does NOT need python3/make/g++ to
# install or run bcrypt.

# ---- build stage ----
FROM node:20-alpine AS build
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ---- runtime stage ----
FROM node:20-alpine
WORKDIR /app

ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/dist ./dist

# PORT is read from the environment; EXPOSE is documentation only.
EXPOSE 3000

USER node

CMD ["node", "dist/server.js"]
