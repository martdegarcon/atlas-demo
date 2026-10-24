# Образ для своего сервера (VPS). Данные — во встроенной базе в /app/.data
# (смонтируйте туда том) или в Postgres, если задан DATABASE_URL.
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build && npm prune --omit=dev

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000
COPY --from=build /app ./
VOLUME ["/app/.data"]
EXPOSE 3000
CMD ["npx", "next", "start", "-p", "3000"]
