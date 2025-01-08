FROM node:alpine
RUN apk add --no-cache ffmpeg
WORKDIR /app
EXPOSE 3000
EXPOSE 80
COPY . .
RUN npm install
CMD ["npm", "run", "start"]
