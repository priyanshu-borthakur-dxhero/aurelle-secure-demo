FROM node:16-alpine
WORKDIR /app
ENV DEBUG=true
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY . .
EXPOSE 8080
CMD ["node", "server.js"]
