const {from, of, timer} = require('rxjs');
const {filter, map, mapTo, delay, pipe, switchMap, mergeMap, concatMap, reduce, catchError} = require('rxjs/operators');


const before = new Date();

function log(msg, object) {
    console.log(`<li>${msg} : ${JSON.stringify(object)}</li>`);
}

function getObjectWithArrayInPromise() {
    return new Promise(resolve => {
        setTimeout(() => resolve({myArray: [1, 2, 3, 4]}), 20);
    });
}

function getNewValueInPromise(val) {
    return new Promise((resolve, reject) => {
        setTimeout(() => {
            //console.log('----',val);
            if (val !== 3) {
                resolve(val * 2);
            }
            else
                reject('bad value');
        }, 20);
    });
}

const arrayAsObservable = of(null).pipe(
    delay(2000),
    concatMap(_ => getObjectWithArrayInPromise()),
    map(val => {
        log('array', val);
        return (val.myArray);
    }),
    concatMap(val => from(val))
);

const eachElementAsObservable = arrayAsObservable.pipe(
    concatMap(value => timer(1500).pipe(mapTo(value))),
    map(val => {
        log('value', val);
        return val;
    }),
    concatMap(val => from(getNewValueInPromise(val))),
    catchError(error => of(0)),
    map(val => {
        log('value after computing (x2)', val);
        return (val);
    })
);

const summarizeAsObservable = eachElementAsObservable.pipe(
    map(val => {
        log('value before reduce', val);
        return val;
    }),
    reduce((a, b) => a + b, 0)
);

summarizeAsObservable.subscribe(msg => {
    log('We did a total of', msg);
});

