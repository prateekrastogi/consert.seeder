FROM node:8.11.1-alpine

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
EXPOSE 3200

#Container Start-up
CMD [ "npm", "start" ]
