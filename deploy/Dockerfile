# Card Agent console — static build served by nginx, which also reverse-proxies the card-agent API
# so the browser talks to one origin (no CORS, admin token never crosses origins).
#   docker build -f deploy/Dockerfile -t card-agent-console .
#   docker run -p 8081:8080 -e CARD_AGENT_API=http://card-agent:8080 card-agent-console
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

FROM nginxinc/nginx-unprivileged:1.27-alpine
ENV CARD_AGENT_API=http://card-agent:8080
COPY deploy/nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:8080/console-health || exit 1
