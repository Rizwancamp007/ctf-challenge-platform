FROM node:20-alpine
WORKDIR /app
COPY server.js .
EXPOSE 3000
# The flag is passed in at run time with -e FLAG=... — it is never
# written into this image.
CMD ["node", "server.js"]
