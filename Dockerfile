FROM node:18-alpine
ENV NODE_ENV=production

WORKDIR /app

COPY package*.json ./

RUN npm ci

COPY ./dist/* ./

CMD [ "node", "main.js" ]