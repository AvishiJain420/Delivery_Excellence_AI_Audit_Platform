# ================= STAGE 1: Build =================
FROM node:20-slim AS builder

WORKDIR /app

# Install dependencies first (same caching logic as backend)
COPY package.json package-lock.json ./
RUN npm ci
# "npm ci" (not "npm install") = clean, reproducible install from the lock file.

# Copy the rest and build the production bundle
COPY . .

# Public build-time variables must be present DURING the build, because Next.js
# bakes NEXT_PUBLIC_* values into the compiled JavaScript. These are passed in
# at build time (see Day 4). They are NOT secrets.
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_WS_URL
ARG NEXT_PUBLIC_POLARIS_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_WS_URL=$NEXT_PUBLIC_WS_URL
ENV NEXT_PUBLIC_POLARIS_URL=$NEXT_PUBLIC_POLARIS_URL

RUN npm run build

# ================= STAGE 2: Run =================
FROM node:20-slim AS runner

WORKDIR /app

# Run as a non-root user for security (why: if the app is ever compromised,
# the attacker is a limited user, not the container's admin).
ENV NODE_ENV=production

# Copy only what's needed to RUN the built app, from the builder stage
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json

EXPOSE 3000

# Next.js production start command
CMD ["npm", "start"]