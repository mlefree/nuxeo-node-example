const Nuxeo = require('nuxeo');
const {from, of, timer, interval} = require('rxjs');
const {map, mapTo, delay, pipe, switchMap, mergeMap, concatMap, reduce, catchError, repeat} = require('rxjs/operators');
const fs = require('fs');
const path = require('path');

module.exports = function (inTestMode) {

    let nuxeoModule = {};
    nuxeoModule.internal = {};
    nuxeoModule.api = {};
    nuxeoModule.web = {};
    nuxeoModule.internal.nuxeoClient = null;
    nuxeoModule.web.timoutLimit = 3000;
    nuxeoModule.web.delayReadTestLoop = 300;
    nuxeoModule.web.delayCreateTestLoop = 1000;

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
            baseURL: 'http://localhost:8080/nuxeo/',
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
        console.log(query);

        return nuxeoModule.internal.nuxeoClient
            .repository()
            .schemas(['dublincore', 'file'])
            .query({query: query})
            ;
    };

    nuxeoModule.internal.$readOneDoc = (doc) => {

        nuxeoModule.internal.init();

        const beforeRequest = new Date();

        let query = `SELECT * FROM Document WHERE dc:uid = "${doc.uid}"`;
        console.log(query);

        return nuxeoModule.internal.nuxeoClient
            .repository()
            .schemas(['dublincore', 'file'])
            .query({query: query})
            .then(doc => {
                doc.requestTimeSpentInMs = new Date() - beforeRequest;
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

        console.log(doc.properties['file:content'].name);
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
        const filePath = path.join(__dirname, 'small.txt');
        // var file = fs.readFileSync(filePath, 'utf8');
        const file = fs.createReadStream(filePath);
        const blob = new Nuxeo.Blob({
            content: file,
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
        res.render('tests', {title: 'test on /read, /create or /update'});
    };

    nuxeoModule.web.testRead = (req, res) => {

        let count = 0;
        const before = new Date();

        const arrayAsObservable = of(null)
            .pipe(
                delay(nuxeoModule.web.delayReadTestLoop),
                concatMap(_ => nuxeoModule.internal.$readAllDocs()),
                // catchError(error => of()),
                map(val => {
                    console.log('Create - one more ?');
                    count = val.entries.length;
                    return (val.entries);
                }),
                concatMap(val => from(val))
            );

        const eachElementAsObservable = arrayAsObservable
            .pipe(
                concatMap(value => timer(nuxeoModule.web.delayReadTestLoop).pipe(mapTo(value))),
                concatMap(doc => nuxeoModule.internal.$readOneDoc(doc)),
                // catchError(error => of()),
                map(val => {
                    const limit = new Date(before.getTime() + nuxeoModule.web.timoutLimit);
                    if (new Date() > limit) throw 'Read - Need to stop';
                    return (val);
                }),
                repeat(),
                catchError(error => {
                    console.log(error);
                    return of();
                })
            );

        const summarizeAsObservable = eachElementAsObservable
            .pipe(
                reduce((a, b) => Math.max(a,b.requestTimeSpentInMs), 0)
            );

        summarizeAsObservable
            .subscribe(max => {
                console.log('Read - We did a max ms of', max);
                res.render('test', {title: `Read ${count} docs in ${max} ms response time as max`});

            });

    };

    nuxeoModule.web.testUpdate = (req, res) => {

        let count = 0;
        const before = new Date();

        const arrayAsObservable = of(null)
            .pipe(
                delay(nuxeoModule.web.delayReadTestLoop),
                concatMap(_ => nuxeoModule.internal.$readAllDocs()),
                // catchError(error => of()),
                map(val => {
                    console.log('Update - one more ?');
                    count = val.entries.length;
                    return (val.entries);
                }),
                concatMap(val => from(val))
            );

        const eachElementAsObservable = arrayAsObservable
            .pipe(
                concatMap(value => timer(nuxeoModule.web.delayReadTestLoop).pipe(mapTo(value))),
                concatMap(doc =>
                    nuxeoModule.internal.$readOneDoc(doc)
                        .then(nuxeoModule.internal.$updateOneDoc(doc))
                ),
                // catchError(error => of()),
                map(val => {
                    const limit = new Date(before.getTime() + nuxeoModule.web.timoutLimit);
                    if (new Date() > limit) throw 'Update - Need to stop';
                    return (val);
                }),
                repeat(),
                catchError(error => {
                    console.log(error);
                    return of();
                })
            );

        const summarizeAsObservable = eachElementAsObservable
            .pipe(
                reduce((a, b) => Math.max(a,b.requestTimeSpentInMs), 0)
            );

        summarizeAsObservable
            .subscribe(max => {
                console.log('Update - We did a max ms of', max);
                res.render('test', {title: `Update ${count} docs in ${max} ms response time as max`});
            });

    };

    nuxeoModule.web.testCreate = (req, res) => {

        let count = 0;
        const before = new Date();

        const eachElementAsObservable = interval(nuxeoModule.web.delayCreateTestLoop)
            .pipe(
                concatMap(_ => nuxeoModule.internal.$createOneDoc()),
                // catchError(error => of()),
                map(val => {
                    const limit = new Date(before.getTime() + nuxeoModule.web.timoutLimit);
                    if (new Date() > limit) throw 'Create - Need to stop';
                    count++;
                    return (val);
                }),
                //repeat(),
                catchError(error => {
                    console.log(error);
                    return of();
                })
            );

        const summarizeAsObservable = eachElementAsObservable
            .pipe(
                reduce((a, b) => {
                    console.log(a, b);
                    return Math.max(a, b.requestTimeSpentInMs);
                }, 0)
            );

        summarizeAsObservable
            .subscribe(max => {
                console.log('Update - We did a max ms of', max);
                res.render('test', {title: `Create ${count} docs in ${max} ms response time as max`});
            });

    };


    return nuxeoModule;

};