FROM node:22-alpine AS base
WORKDIR /app

FROM base AS development-dependencies-env
COPY package.json package-lock.json ./
RUN npm ci

FROM base AS production-dependencies-env
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM base AS build-env
COPY . .
COPY --from=development-dependencies-env /app/node_modules /app/node_modules
RUN npm run db:generate
RUN npm run build

FROM base AS runtime
ENV NODE_ENV=production
COPY package.json package-lock.json ./
COPY --from=production-dependencies-env /app/node_modules /app/node_modules
COPY --from=build-env /app/node_modules/.prisma /app/node_modules/.prisma
COPY --from=build-env /app/node_modules/@prisma/client /app/node_modules/@prisma/client
COPY --from=build-env /app/build /app/build
CMD ["npm", "run", "start"]
