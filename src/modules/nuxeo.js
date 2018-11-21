const Nuxeo = require('nuxeo');
const {from, of, timer, interval} = require('rxjs');
const {map, mapTo, delay, pipe, switchMap, mergeMap, concatMap, reduce, catchError, repeat} = require('rxjs/operators');
const fs = require('fs');
const path = require('path');
const arrAvg = yourArray => Math.round(yourArray.reduce((a, b) => a + b, 0) / yourArray.length);

module.exports = function (inTestMode) {

    let nuxeoModule = {};
    nuxeoModule.internal = {};
    nuxeoModule.api = {};
    nuxeoModule.web = {};
    nuxeoModule.internal.nuxeoClient = null;
    nuxeoModule.web.timoutLimit = 60000;
    nuxeoModule.web.delayReadTestLoop = 30;
    nuxeoModule.web.delayCreateTestLoop = 30;
    this.nbUser = 0;

    nuxeoModule.web.testReadQuery = "SELECT * FROM Document"
        + " WHERE ecm:primaryType = 'File'"
        + " AND ecm:path STARTSWITH '/default-domain/workspaces/'"
    //+ " AND content/data IS NOT NULL"
    //+ " AND dc:title <> content/name"
    //+ " AND ecm:isProxy = 0 AND ecm:isCheckedInVersion = 0"
    //+ " AND ecm:currentLifeCycleState != 'deleted'"
    ;

    nuxeoModule.web.testSampleQuery = "SELECT * FROM Document"
        + " WHERE ecm:primaryType = 'File'"
        + " AND ecm:path STARTSWITH '/default-domain/workspaces/'"
    //+ " AND content/data IS NOT NULL"
    //+ " AND dc:title <> content/name"
    //+ " AND ecm:isProxy = 0 AND ecm:isCheckedInVersion = 0"
    //+ " AND ecm:currentLifeCycleState != 'deleted'"
    ;

    nuxeoModule.internal.init = () => {

        if (nuxeoModule.internal.nuxeoClient) return;

        nuxeoModule.internal.nuxeoClient = new Nuxeo({
            baseURL: 'http://localhost:8280/nuxeo/',
            auth: {
                method: 'basic',
                username: 'Administrator',
                password: 'Administrator'
            }
        });

    };

    nuxeoModule.internal.$readAllDocs = () => {

        nuxeoModule.internal.init();

        let query = `SELECT * FROM Document 
              WHERE ecm:primaryType = 'File'
              AND ecm:path STARTSWITH '/default-domain/workspaces/'`
            //        AND content/data IS NOT NULL
            //+ " AND dc:title <> content/name"
            //+ " AND ecm:isProxy = 0 AND ecm:isCheckedInVersion = 0"
            //+ " AND ecm:currentLifeCycleState != 'deleted'"
        ;
        //console.log(query);

        return nuxeoModule.internal.nuxeoClient
            .repository()
            .schemas(['dublincore', 'file'])
            .query({query: query})
            ;
    };

    nuxeoModule.internal.$readOneDoc = (doc) => {

        nuxeoModule.internal.init();

        const beforeRequest = new Date();

        let query = `SELECT * FROM Document WHERE uid = "${doc.uid}"`;
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

    nuxeoModule.internal.$updateOneDoc = (doc) => {

        nuxeoModule.internal.init();

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

    nuxeoModule.internal.$createOneDoc = () => {

        nuxeoModule.internal.init();

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
            .create('/', fileDocument)
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

    nuxeoModule.internal.$getBranding = () => {

        nuxeoModule.internal.init();

        let branding = {
            logo: './images/logo.png',
            bg: 'https://www.courts.com.sg/media/catalog/product/cache/image/4e8ff541545308adfd94f8ed2a2008b9/i/p/ip119172_00.jpg'
        };

        return Promise.resolve(branding);
    };

    nuxeoModule.internal.$getPrefered = () => {

        nuxeoModule.internal.init();

        let preferedDocs = [
            {
                uid: 344,
                name: 'test 01',
                thumb: 'https://www.courts.com.sg/media/catalog/product/cache/image/4e8ff541545308adfd94f8ed2a2008b9/i/p/ip119172_00.jpg'
            },
            {
                uid: 345,
                name: 'test 01',
                thumb: 'https://www.courts.com.sg/media/catalog/product/cache/image/4e8ff541545308adfd94f8ed2a2008b9/i/p/ip119172_00.jpg'
            }];

        return Promise.resolve(preferedDocs);
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

        // set locals, only providing error in development
        res.locals.message = JSON.stringify(err);
        //res.locals.error = req.app.get('env') === 'development' ? err : {};

        err.status = 500;
        // render the error page
        res.status(500);
        res.render('error', {message: err.message || JSON.stringify(err), error: err});
    };

    nuxeoModule.web.testAll = (req, res) => {
        res.status(200);
        res.render('tests', {title: 'Nuxeo Minute Test'});
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
                res.render('test', {title: `Read ${countAllDocs} docs with ${countRequest} requests in ${arrAvg(values)} / ${max} ms response time`});

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
                res.render('test', {title: `Update ${countAllDocs} docs with ${countRequest} requests in ${arrAvg(values)} / ${max} ms response time`});
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
                res.render('test', {title: `Create ${countRequest} docs in ${arrAvg(values)} / ${max} ms response time`});
            });

    };


    return nuxeoModule;

};