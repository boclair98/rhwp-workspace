FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend ./frontend
COPY pkg ./pkg
COPY assets ./assets
COPY server ./server
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8080
COPY --from=build /app/dist ./dist
COPY server.mjs ./server.mjs
COPY server ./server
USER node
EXPOSE 8080
CMD ["node", "server.mjs"]
