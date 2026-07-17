# Cloud Run 部署镜像。必须从仓库根目录构建（需要携带前端 fixtures 数据源）：
#   docker build -f services/backend/Dockerfile -t elsewhere-backend .
FROM node:22-slim
WORKDIR /app
COPY services/backend/package.json services/backend/package-lock.json* ./services/backend/
RUN cd services/backend && npm ci --omit=dev
COPY services/backend/src ./services/backend/src
COPY services/backend/scripts ./services/backend/scripts
COPY design-lab/prototypes-vanilla/src/fixtures ./design-lab/prototypes-vanilla/src/fixtures
ENV NODE_ENV=production
WORKDIR /app/services/backend
CMD ["node", "src/server.js"]
