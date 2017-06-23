FROM node:8.1.2-alpine

# Create app directory
RUN mkdir -p /seeder
WORKDIR /seeder

# Bundle app source
COPY package.json package-lock.json /seeder/
COPY /client  /seeder/client
COPY /common  /seeder/common
COPY /server  /seeder/server
COPY /lib  /seeder/lib

# Install app dependencies
RUN npm install --production

#Finally setting container parameters
ENV NODE_ENV 'production'
ENV MONGODB_URL 'mongodb://mongo:27017/seeder'
EXPOSE 3200
CMD [ "npm", "start" ]
