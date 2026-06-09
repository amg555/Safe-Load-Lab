FROM node:20-alpine
WORKDIR /app
COPY package.json ./
COPY bin ./bin
COPY examples ./examples
RUN npm link
ENTRYPOINT ["safe-load-lab"]
CMD ["help"]
