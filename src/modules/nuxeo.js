const Nuxeo = require('nuxeo');
const {from, of, timer, interval} = require('rxjs');
const {map, mapTo, delay, pipe, switchMap, mergeMap, concatMap, reduce, catchError, repeat} = require('rxjs/operators');
const fs = require('fs');
const path = require('path');
const arrAvg = yourArray => Math.round(yourArray.reduce((a, b) => a + b, 0) / yourArray.length);
const cache = require('./cache')(false);
const axios = require('axios');

module.exports = function (inTestMode) {

    let nuxeoModule = {};
    nuxeoModule.internal = {};
    nuxeoModule.api = {};
    nuxeoModule.web = {};
    nuxeoModule.internal.nuxeoClient = null;
    nuxeoModule.internal.nuxeoConnectInProgress = false;
    nuxeoModule.internal.nuxeoUrl = process.env.NUXEO_URL || 'http://localhost:8080/nuxeo/';
    nuxeoModule.internal.nuxeoClientId = process.env.NUXEO_CLIENT_ID || 'myAppId';
    nuxeoModule.internal.nuxeoClientSecret = process.env.NUXEO_CLIENT_SECRET || 'secret';
    nuxeoModule.web.timoutLimit = 60000;
    nuxeoModule.web.delayReadTestLoop = 30;
    nuxeoModule.web.delayCreateTestLoop = 30;
    this.nbUser = 0;
    this.code = null;
    this.token = null;

    nuxeoModule.web.testReadQuery = "SELECT * FROM Document"
        + " WHERE ecm:primaryType = 'File'"
        + " AND ecm:path STARTSWITH '/default-domain'"
    //+ " AND content/data IS NOT NULL"
    //+ " AND dc:title <> content/name"
    //+ " AND ecm:isProxy = 0 AND ecm:isCheckedInVersion = 0"
    //+ " AND ecm:currentLifeCycleState != 'deleted'"
    ;

    nuxeoModule.web.testSampleQuery = "SELECT ecm:uuid, ecm:fulltextScore FROM Document WHERE ecm:fulltext = '*'"
    ;

    const useAuth2Authentication = async () => {
        console.log("getAuthentificationCode");

        try {
            nuxeoModule.internal.nuxeoConnectInProgress = true;
            const config = {
                auth: {username: 'Administrator', password: 'Administrator'},
                maxRedirects: 0,
            };
            const noResponseBecauseOf302 = await axios.get(nuxeoModule.internal.nuxeoUrl
                + 'oauth2/authorize' +
                '?response_type=code' +
                '&client_id=' + nuxeoModule.internal.nuxeoClientId,
                config);
        } catch (errorDue302) {

            if (errorDue302.response && errorDue302.response.status === 302) {
                const path = errorDue302.response.headers.location;
                if (path.includes("/?code=")) {
                    this.code = path.split("/?code=")[1];
                    if (this.code) {
                        await createNuxeoClientWithOAuth2();
                    }
                }
            } else {
                console.error(errorDue302);
            }
        }
    };

    const createNuxeoClientWithOAuth2 = async () => {
        console.log("createNuxeoClientWithOAuth2");
        try {
            const response = await axios.post(nuxeoModule.internal.nuxeoUrl
                + 'oauth2/token'
                + '?grant_type=authorization_code'
                + '&client_secret=' + nuxeoModule.internal.nuxeoClientSecret
                + '&client_id=' + nuxeoModule.internal.nuxeoClientId
                + '&code=' + this.code)

            if (response.status === 200) {
                this.token = response.data;
                nuxeoModule.internal.nuxeoClient = new Nuxeo({
                    baseURL: nuxeoModule.internal.nuxeoUrl,
                    auth: {
                        method: 'bearerToken',
                        token: this.token.access_token,
                        clientId: nuxeoModule.internal.nuxeoClientId // optional OAuth2 client ID to refresh the access token
                    }
                });
            }
        } catch (e) {
            console.error(e);
        }
    };

    nuxeoModule.internal.init = async () => {
        if (nuxeoModule.internal.nuxeoClient || nuxeoModule.internal.nuxeoConnectInProgress) {
            return;
        }
        await useAuth2Authentication();
        await nuxeoModule.internal.initHomeConf();
    };

    nuxeoModule.internal.requireUncached = (module) => {
        delete require.cache[require.resolve(module)];
        return require(module)
    };

    nuxeoModule.internal.$getNameWithStatus = async () => {

        await nuxeoModule.internal.init();

        return nuxeoModule.internal.nuxeoClient.connect()
            .then(function (client) {
                // client.connected === true
                // client === nuxeo
                console.log('Connected OKF!', client);
                return Promise.resolve('' + process.env.NUXEO_LOGIN + ' - OK ' + client.serverVersion);
            })
            .catch(function (error) {
                // wrong credentials / auth method / ...
                console.error('Connection KO!', error);
                return Promise.resolve('' + process.env.NUXEO_LOGIN + ' - KO : ' + error);
            });
    };

    nuxeoModule.internal.$readAllDocs = () => {

        nuxeoModule.internal.init();

        let query = nuxeoModule.web.testReadQuery;
        console.log(query);

        return nuxeoModule.internal.nuxeoClient
            .repository()
            .schemas(['dublincore', 'file'])
            .query({query: query})
            ;
    };

    nuxeoModule.internal.$readOneDoc = async (doc) => {

        await nuxeoModule.internal.init();

        const beforeRequest = new Date();

        let query = `SELECT *
                     FROM Document
                     WHERE uid = "${doc.uid}"`;
        // console.log(query);

        return nuxeoModule.internal.nuxeoClient
            .repository()
            .schemas(['dublincore', 'file'])
            .query({query: query})
            .then(doc => {
                doc.requestTimeSpentInMs = new Date() - beforeRequest;
                return Promise.resolve(doc);
            })
            .catch(err => {
                const doc = {};
                doc.requestTimeSpentInMs = new Date() - beforeRequest;
                console.error(err);
                return Promise.resolve(doc);
            });
    };

    nuxeoModule.internal.$readQuery = async (query) => {

        await nuxeoModule.internal.init();

        const beforeRequest = new Date();

        return nuxeoModule.internal.nuxeoClient
            .repository()
            //.schemas(['dublincore', 'file'])
            .enricher('document', 'thumbnail')
            .query(query)
            // TODO MLE .queryAndFetch()
            .then(doc => {
                doc.requestTimeSpentInMs = new Date() - beforeRequest;
                return Promise.resolve(doc);
            })
            .catch(err => {
                const doc = {};
                doc.requestTimeSpentInMs = new Date() - beforeRequest;
                // console.error(err);
                return Promise.reject(err);
            });
    };

    nuxeoModule.internal.$readNXQL = async (nxql) => {
        await nuxeoModule.internal.init();

        return nuxeoModule.internal.$readQuery({query: nxql, currentPageIndex: 0});
    };

    nuxeoModule.internal.$readOperation = async (op, input) => {

        await nuxeoModule.internal.init();

        const beforeRequest = new Date();

        return nuxeoModule.internal.nuxeoClient
            .operation(op)
            .input(input)
            .schemas(['dublincore', 'file'])
            //   .params({
            //     name: 'workspaces',
            //   })
            .execute()
            //return nuxeoModule.internal.nuxeoClient
            //   .repository()
            //   .schemas(['dublincore', 'file'])
            //   .automation({automation: automation, currentPageIndex: 0})
            .then(doc => {
                doc.requestTimeSpentInMs = new Date() - beforeRequest;
                return Promise.resolve(doc);
            })
            .catch(err => {
                const doc = {};
                doc.requestTimeSpentInMs = new Date() - beforeRequest;
                // console.error(err);
                return Promise.reject(err);
            });
    };

    nuxeoModule.internal.$updateOneDoc = async (doc) => {

        await nuxeoModule.internal.init();

        const beforeRequest = new Date();

        if (!doc.properties['file:content']) {
            console.log('bad file - skip it.', doc.properties['dc:title']);
            return Promise.resolve(doc);
        }

        //console.log(doc.properties['file:content'].name);
        doc.set({'dc:title': '' + doc.properties['file:content'].name + ' - ' + new Date().toLocaleString()});
        return doc.save()
            .then(doc => {
                doc.requestTimeSpentInMs = new Date() - beforeRequest;
                return Promise.resolve(doc);
            });
    };

    nuxeoModule.internal.$createOneDoc = async () => {

        await nuxeoModule.internal.init();

        const beforeRequest = new Date();
        let afterRequest = beforeRequest;
        const now = new Date();
        const filePath = path.join(__dirname, 'small.txt'); // todo big file ?
        // var file = fs.readFileSync(filePath, 'utf8');
        const file = fs.createReadStream(filePath);
        const blob = new Nuxeo.Blob({
            content: file + ' ' + beforeRequest.toISOString(),
            name: 'test-small-' + now.toISOString() + '.txt',
            mimeType: 'plain/text'
        });
        const fileDocument = {
            'entity-type': 'document',
            name: 'test-small-' + now.toISOString(),
            type: 'File',
            properties: {
                'dc:title': 'test-small-' + now.toISOString()
            }
        };

        return nuxeoModule.internal.nuxeoClient
            .repository()
            .create('/test/', fileDocument)
            .then(doc => {
                // console.log(doc);
                return nuxeoModule.internal.nuxeoClient
                    .batchUpload()
                    .upload(blob);
            })
            .then(res => {
                return nuxeoModule.internal.nuxeoClient
                    .operation('Blob.AttachOnDocument')
                    .param('document', '/test-small-' + now.toISOString())
                    .input(res.blob)
                    .execute();
            })
            .then(() => {
                afterRequest = new Date();
                return nuxeoModule.internal.nuxeoClient
                    .repository()
                    .fetch('/test-small-' + now.toISOString(), {schemas: ['dublincore', 'file']})
                    .then(doc => {
                        doc.requestTimeSpentInMs = afterRequest - beforeRequest;
                        return Promise.resolve(doc);
                    });
            });

    };

    nuxeoModule.internal.initHomeConf = async () => {

        try {
            const samplefilePath = path.join(__dirname, 'home.sample.json');
            const filePath = path.join(__dirname, '../../data/home.json');
            console.log('filepaths: ', samplefilePath, filePath);

            if (fs.existsSync(filePath)) {
                return;
            }

            fs.copyFile(samplefilePath, filePath, (err) => {
                if (err) throw err;
                console.log('copy done');
            });
        } catch (e) {
            console.error(e);
        }
    };

    nuxeoModule.internal.getHomeConf = () => {

        let conf;
        try {
            const filePath = path.join(__dirname, '../../data/home.json');
            console.log('filepath: ', filePath);
            conf = nuxeoModule.internal.requireUncached(filePath);
        } catch (e) {

        }
        if (!conf) {
            conf = {brand: {}, news: []};
        }
        return conf;
    };

    nuxeoModule.internal.$getBranding = async () => {
        await nuxeoModule.internal.init();

        let branding = nuxeoModule.internal.getHomeConf().brand;

        return cache.api.$getImgData(branding.logo)
            .then((logo) => {
                branding.logo = logo;
                return cache.api.$getImgData(branding.bg);
            })
            .then((bg) => {
                branding.bg = bg;
                return Promise.resolve(branding);
            });
    };

    nuxeoModule.internal.$refreshtNewsImage = (news, index) => {

        return cache.api.$getImgData(news[index].img)
            .then((img) => {
                news[index].img = img;
                return Promise.resolve(news);
            });
    };

    nuxeoModule.internal.$getNews = () => {

        nuxeoModule.internal.init();

        let news = nuxeoModule.internal.getHomeConf().news;

        let all = [];
        for (let i = 0; i < news.length; i++) {
            all.push(nuxeoModule.internal.$refreshtNewsImage(news, i));
        }

        return Promise.all(all).then(() => Promise.resolve(news));
    };

    nuxeoModule.internal.$getPrefered = () => {

        nuxeoModule.internal.init();

        let preferedDocs = [
            {
                uid: 344,
                name: 'test 01',
                img: './images/product.png'
            },
            {
                uid: 345,
                name: 'test 02',
                img: './images/product.png'
            }];

        //return nuxeoModule.internal.$readNXQL("select * from DOCUMENT where ecm:fulltext = 'test'")
        //return nuxeoModule.internal.$readNXQL("SELECT * FROM Document where ecm:mixinType != 'HiddenInNavigation' AND ecm:isCheckedInVersion = 0 AND ecm:currentLifeCycleState != 'deleted' AND collectionMember:collectionIds/* = ?")
        return nuxeoModule.internal
            .$readOperation("Favorite.Fetch")
            //.nuxeoClient.repository().fetch('/')
            //.then((doc => {
            //    let test = doc instanceof Nuxeo.Document;
            //    return doc.fetchRendition('thumbnail');
            //}))
            //.then((res) => {
            // in the browser, use res.blob() to work with the rendition
            // in Node.js, use res.body
            //    return res.blob();
            //})
            .then((doc) => {

                // repository.fetch('/default-domain')
                //         .then((doc) => repository.query({
                //           pageProvider: 'CURRENT_DOC_CHILDREN',
                //           queryParams: [doc.uid],
                //         }))
                //         .then((res) => {
                //           const {
                //             entries, resultsCount, currentPageSize, currentPageIndex, numberOfPages,
                //           } = res;
                //           expect(entries.length).to.be.equal(3);
                //           expect(resultsCount).to.be.equal(3);
                //           expect(currentPageSize).to.be.equal(3);
                //           expect(currentPageIndex).to.be.equal(0);
                //           expect(numberOfPages).to.be.equal(1);
                //         })
                //     ));

                return nuxeoModule.internal.$readQuery({
                    pageProvider: 'default_content_collection',
                    queryParams: [doc.uid]
                });
                // OK but without all properties: return nuxeoModule.internal.$readOperation("Collection.GetDocumentsFromCollection", doc.uid);
            })
            .then((docs) => {

                let all = [];
                if (docs && docs.entries && docs.entries.length > 0) {
                    preferedDocs = [];
                    docs.entries.forEach(doc => {

                        console.log('$readNXQL: ', doc);

                        // let path = doc.properties['file:content'] ? doc.properties['file:content'].data : 'na';
                        // path = path.split('file:content')[0] + '@rendition/thumbnail';
                        // path = path.replace('nuxeo/nxfile/default', 'nuxeo/api/v1/repo/default/id');
                        // if (process.env.NUXEO_PUBLIC_URL) {
                        //     path = path.replace(process.env.NUXEO_URL, process.env.NUXEO_PUBLIC_URL);
                        // }

                        //let path = doc.contextParameters.thumbnail.url;

                        const p = doc
                            //.fetchBlob()
                            .fetchRendition('thumbnail')
                            .then(function (res) {
                                // in the browser, use res.blob() to work with the rendition
                                // in Node.js, use res.body
                                return res.blob();
                            })
                            .then((blob) => {
                                //const urlCreator = window.URL || window.webkitURL;
                                //var imageUrl = URL.createObjectURL(blob);
                                //document.querySelector("#image").src = imageUrl;

                                //var bufferSym = Symbol('buffer');
                                //const symbols = Object.getOwnPropertySymbols(blob);
                                //var bufferSym = Symbol.for('buffer');

                                //console.log(symbols[3] === bufferSym);
                                //bufferSym = symbols[3];
                                let bufferBase64 = 'AAABAAEAEBAAAAEACABoBQAAFgAAACgAAAAQAAAAIAAAAAEACAAAAAAAAAEAAAAAAAAAAAAAAAEAAAAAAAAAAAAAx8fHAPv7+wA9PT0Aenp6ANnZ2QAbGxsA4uLiAIyMjABhYWEACwsLACYmJgAvLy8Ay8vLAP///wB1dXUAqampAEpKSgAfHx8AMTExAA8PDwDW1tYATExMACoqKgCSkpIAZ2dnADw8PADz8/MA0dHRABMTEwCmpqYAR0dHAK+vrwADAwMAwcHBAJaWlgA3NzcAa2trALGxsQBSUlIAj4+PAPf39wA5OTkAFxcXAFRUVACRkZEABwcHAJqamgA7OzsAzs7OAODg4AAiIiIAtbW1AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADg4ODg4ODg4ODg4ODg4ODg4ODgAAKxYnKQ4ODg4ODg4ODgAXHS4uChQCDg4ODg4ODg4ALgAAAAAdFBwODg4ODg4HIS4ADg4ODgoLDg4ODg4OHS4oAA4ODg4GMxkQDg4ODhIuJQAODgAABjMOMRMaDg4jChQrDg4AFxIBAg4OEyAODhQOBSILMxcMAgQvDg4ODg4JDg4OFzMONA4OMy0ODg4SMw4ODgIYAikwGw4LAw4OBg8ODg4OCDMOJh8OMjMODiQVDg4ODg4TDg4nDA4ODg4ODg4ODg4ODTMODgssDg4ODg4ODg4ODg4zAA4aKg4ODg4ODg4ODg4OHhEODg4ODgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';
                                Object.getOwnPropertySymbols(blob).forEach((symbol) => {
                                    if (symbol.toString() === 'Symbol(buffer)') {
                                        const bufferSymVal = blob[symbol];
                                        const buffer = Buffer.from(bufferSymVal);
                                        //let buffer = new Buffer( blob, 'binary' )
                                        bufferBase64 = buffer.toString('base64');
                                        //let arraybuffer = Uint8Array.from(buffer).buffer;
                                    }
                                });

                                preferedDocs.push({img: "data:image/x-icon;base64," + bufferBase64});
                                // <img class="w-100" src="data:image/x-icon;base64,AAABAAEAEBAAAAEACABoBQAAFgAAACgAAAAQAAAAIAAAAAEACAAAAAAAAAEAAAAAAAAAAAAAAAEAAAAAAAAAAAAAx8fHAPv7+wA9PT0Aenp6ANnZ2QAbGxsA4uLiAIyMjABhYWEACwsLACYmJgAvLy8Ay8vLAP///wB1dXUAqampAEpKSgAfHx8AMTExAA8PDwDW1tYATExMACoqKgCSkpIAZ2dnADw8PADz8/MA0dHRABMTEwCmpqYAR0dHAK+vrwADAwMAwcHBAJaWlgA3NzcAa2trALGxsQBSUlIAj4+PAPf39wA5OTkAFxcXAFRUVACRkZEABwcHAJqamgA7OzsAzs7OAODg4AAiIiIAtbW1AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADg4ODg4ODg4ODg4ODg4ODg4ODgAAKxYnKQ4ODg4ODg4ODgAXHS4uChQCDg4ODg4ODg4ALgAAAAAdFBwODg4ODg4HIS4ADg4ODgoLDg4ODg4OHS4oAA4ODg4GMxkQDg4ODhIuJQAODgAABjMOMRMaDg4jChQrDg4AFxIBAg4OEyAODhQOBSILMxcMAgQvDg4ODg4JDg4OFzMONA4OMy0ODg4SMw4ODgIYAikwGw4LAw4OBg8ODg4OCDMOJh8OMjMODiQVDg4ODg4TDg4nDA4ODg4ODg4ODg4ODTMODgssDg4ODg4ODg4ODg4zAA4aKg4ODg4ODg4ODg4OHhEODg4ODgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=">
                            });
                        //const p = cache.api.$getImgData(path).then((data) => {
                        //    preferedDocs.push({img: data});
                        //    return Promise.resolve(data);
                        //});
                        all.push(p);
                    });
                }

                return Promise.all(all);
            })
            .then((all) => {
                console.log(all);
                return preferedDocs;
            })
            .catch(err => {
                console.error(err);
                return preferedDocs;
            });


        //return Promise.resolve(preferedDocs);
    };

    nuxeoModule.api.getBranding = (req, res) => {

        nuxeoModule.internal.$getBranding()
            .then(branding => {
                res.status(200);
                res.jsonp(branding);
            })
            .catch(error => {
                res.status(500);
                res.render('error', {message: 'Nuxeo looks not well configured', error: error});
            });
    };

    nuxeoModule.api.getPrefered = (req, res) => {

        nuxeoModule.internal.$getPrefered()
            .then(prefered => {
                res.status(200);
                res.jsonp(prefered);
            })
            .catch(error => {
                res.status(500);
                res.render('error', {message: 'Nuxeo looks not well configured', error: error});
            });
    };

    nuxeoModule.api.getNbUser = (req, res) => {

        res.status(200);
        //console.log(this.nbUser);
        res.jsonp(this.nbUser);
    };

    nuxeoModule.web.error = (res, err) => {

        let branding;

        nuxeoModule.internal.$getBranding()
            .then((b) => {
                branding = b;
            })
            .then(() => {

                // set locals, only providing error in development
                res.locals.message = JSON.stringify(err);
                //res.locals.error = req.app.get('env') === 'development' ? err : {};

                err.status = 500;
                // render the error page
                res.status(500);
                res.render('error', {message: err.message || JSON.stringify(err), error: err, branding: branding});
            });
    };

    nuxeoModule.web.testAll = (req, res) => {
        let branding;

        nuxeoModule.internal.$getBranding()
            .then((b) => {
                branding = b;
            })
            .then(() => {
                res.status(200);
                res.render('tests', {title: 'Nuxeo Minute Test', branding: branding});
            });
    };

    nuxeoModule.web.testRead = (req, res) => {

        let delayMs = req.params.delay;
        if (!delayMs) {
            delayMs = nuxeoModule.web.delayReadTestLoop;
        }
        delayMs = Math.round(parseInt('' + delayMs));
        let countAllDocs = 0,
            countRequest = 0;
        const before = new Date();

        const arrayAsObservable = of(null)
            .pipe(
                delay(delayMs),
                concatMap(_ => nuxeoModule.internal.$readAllDocs()),
                // catchError(error => of()),
                map(val => {
                    //console.log('Create - one more ?');
                    countAllDocs = val.entries.length;
                    return (val.entries);
                }),
                concatMap(val => from(val))
            );

        const eachElementAsObservable = arrayAsObservable
            .pipe(
                concatMap(value => timer(delayMs).pipe(mapTo(value))),
                concatMap(doc => {
                    this.nbUser++;
                    return nuxeoModule.internal.$readOneDoc(doc);
                }),
                // catchError(error => of()),
                map(val => {
                    //console.log('this.nbUser:',this.nbUser);
                    this.nbUser--;
                    countRequest++;
                    const limit = new Date(before.getTime() + nuxeoModule.web.timoutLimit);
                    if (new Date() > limit) throw 'Read - Need to stop';
                    return (val);
                }),
                repeat(),
                catchError(error => {
                    console.log('#Error:', error);
                    return of();
                })
            );

        let values = [];
        const summarizeAsObservable = eachElementAsObservable
            .pipe(
                reduce((a, b) => {
                    values.push(b.requestTimeSpentInMs);
                    const max = Math.max(a, b.requestTimeSpentInMs);
                    console.log('b.requestTimeSpentInMs:', this.nbUser, b.requestTimeSpentInMs, max);
                    return max;
                }, 0)
            );

        summarizeAsObservable
            .subscribe(max => {
                console.log('Read - We did a max ms of', arrAvg(values), max);
                //res.render('test', {title: `Read ${countAllDocs} docs with ${countRequest} requests in ${arrAvg(values)} / ${max} ms response time`});
                res.render('test', {title: `Read: ${countRequest} requests in ${arrAvg(values)} ms average response time`});

            });

    };

    nuxeoModule.web.testUpdate = (req, res) => {

        let delayMs = req.params.delay;
        if (!delayMs) {
            delayMs = nuxeoModule.web.delayReadTestLoop;
        }
        delayMs = Math.round(parseInt('' + delayMs));
        let countAllDocs = 0,
            countRequest = 0;
        const before = new Date();

        const arrayAsObservable = of(null)
            .pipe(
                delay(delayMs),
                concatMap(_ => nuxeoModule.internal.$readAllDocs()),
                // catchError(error => of()),
                map(val => {
                    //console.log('Update - one more ?');
                    countAllDocs = val.entries.length;
                    return (val.entries);
                }),
                concatMap(val => from(val))
            );

        const eachElementAsObservable = arrayAsObservable
            .pipe(
                concatMap(value => timer(delayMs).pipe(mapTo(value))),
                concatMap(doc => {
                        this.nbUser++;
                        return nuxeoModule.internal.$readOneDoc(doc)
                            .then(nuxeoModule.internal.$updateOneDoc(doc))
                    }
                ),
                // catchError(error => of()),
                map(val => {
                    this.nbUser--;
                    countRequest++;
                    const limit = new Date(before.getTime() + nuxeoModule.web.timoutLimit);
                    if (new Date() > limit) throw 'Update - Need to stop';
                    return (val);
                }),
                repeat(),
                catchError(error => {
                    console.log('#Error:', error);
                    return of();
                })
            );

        let values = [];
        const summarizeAsObservable = eachElementAsObservable
            .pipe(
                reduce((a, b) => {
                    values.push(b.requestTimeSpentInMs);
                    const max = Math.max(a, b.requestTimeSpentInMs);
                    console.log('b.requestTimeSpentInMs:', this.nbUser, b.requestTimeSpentInMs, max);
                    return max;
                }, 0)
            );

        summarizeAsObservable
            .subscribe(max => {
                console.log('Update - We did a max ms of', max);
                // res.render('test', {title: `Update ${countAllDocs} docs with ${countRequest} requests in ${arrAvg(values)} / ${max} ms response time`});
                res.render('test', {title: `Update: ${countRequest} requests in ${arrAvg(values)} ms average response time`});
            });

    };

    nuxeoModule.web.testCreate = (req, res) => {

        let delayMs = req.params.delay;
        if (!delayMs) {
            delayMs = nuxeoModule.web.delayCreateTestLoop;
        }
        delayMs = Math.round(parseInt('' + delayMs));
        let countAllDocs = 0,
            countRequest = 0;
        const before = new Date();

        const eachElementAsObservable = interval(delayMs)
            .pipe(
                concatMap(_ => {
                    this.nbUser++;
                    return nuxeoModule.internal.$createOneDoc()
                }),
                // catchError(error => of()),
                map(val => {
                    this.nbUser--;
                    const limit = new Date(before.getTime() + nuxeoModule.web.timoutLimit);
                    if (new Date() > limit) throw 'Create - Need to stop';
                    countRequest++;
                    return (val);
                }),
                //repeat(),
                catchError(error => {
                    console.log('#Error:', error);
                    return of();
                })
            );

        let values = [];
        const summarizeAsObservable = eachElementAsObservable
            .pipe(
                reduce((a, b) => {
                    values.push(b.requestTimeSpentInMs);
                    const max = Math.max(a, b.requestTimeSpentInMs);
                    console.log('b.requestTimeSpentInMs:', this.nbUser, b.requestTimeSpentInMs, max);
                    return max;
                }, 0)
            );

        summarizeAsObservable
            .subscribe(max => {
                console.log('Update - We did a max ms of', max);
                //res.render('test', {title: `Create ${countRequest} docs in ${arrAvg(values)} / ${max} ms response time`});
                res.render('test', {title: `Create: ${countRequest} requests in ${arrAvg(values)} ms average response time`});
            });

    };


    nuxeoModule.web.testNXQL = (req, res) => {
        let branding;

        nuxeoModule.internal.$getBranding()
            .then((b) => {
                branding = b;
            })
            .then(() => {


                let nxql = req.query.nxql;
                if (!nxql) {
                    return res.render('nxql', {title: `No NXQL.`, nxql: nxql, branding: branding});
                }

                nuxeoModule.internal.$readNXQL(nxql)
                    .then(vals => {
                        let max = 0;
                        let values = [];
                        vals.entries.forEach(val => {
                            values.push(val);
                            max++;
                        });
                        res.render('nxql', {
                            title: `NXQL returns ${values.length} entity(ies)`,
                            nxql: nxql,
                            result: JSON.stringify(values)
                        });
                    })
                    .catch(error => {
                        console.log('#Error:', error);
                        res.render('nxql', {
                            title: `NXQL failed`,
                            nxql: nxql,
                            error: JSON.stringify(error),
                            branding: branding
                        });
                    });
            });

    };

    nuxeoModule.web.importContent = (req, res) => {

        let branding;

        nuxeoModule.internal.$getBranding()
            .then((b) => {
                branding = b;
            })
            .then(() => {
                res.render('import', {title: `Import your content`, branding: branding});
            });
    };


    return nuxeoModule;

};
