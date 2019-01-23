FROM node:lts-jessie
USER root
WORKDIR /usr/app

COPY package*.json ./
COPY src ./src
COPY data ./data
#COPY . .

RUN npm install
RUN npm i nuxeo-node-example -g
# If you are building your code for production
# RUN npm install --only=production
#RUN mkdir -p /usr/app/data
#RUN chown -R 1000:1000 /usr/app/data

#CMD [ "npm", "start" ]
CMD nuxeo-node-example
#CMD [ "npm", "run", "start-empty" ]

EXPOSE 3000
#VOLUME ["/usr/src/app/data"]
#ENTRYPOINT ["/usr/sbin/apache2ctl", "-D", "FOREGROUND"]

#USER 1000

