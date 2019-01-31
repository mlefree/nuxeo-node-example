FROM node:lts-jessie
USER root
WORKDIR /usr/app

COPY package*.json ./
COPY src ./src
COPY data ./data

# Run local version:
RUN npm install
CMD [ "npm", "start" ]
# Or published version as global install:
#RUN npm i nuxeo-node-example -g
#CMD nuxeo-node-example

EXPOSE 3000
