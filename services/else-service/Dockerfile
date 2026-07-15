# Cloud Run 部署镜像。必须从仓库根目录构建（需要携带前端 fixtures 数据源）：
#   docker build -f services/else-service/Dockerfile -t else-service .
FROM node:22-slim
WORKDIR /app
COPY services/else-service/package.json services/else-service/package-lock.json* ./services/else-service/
RUN cd services/else-service && npm ci --omit=dev
COPY services/else-service/src ./services/else-service/src
COPY design-lab/prototypes-vanilla/src/fixtures ./design-lab/prototypes-vanilla/src/fixtures
ENV NODE_ENV=production
WORKDIR /app/services/else-service
CMD ["node", "src/server.js"]
