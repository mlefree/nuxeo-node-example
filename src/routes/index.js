var express = require('express');
var router = express.Router();
let nxo = require('../modules/nuxeo')(false);

router.get('/', function (req, res) {

    let nameAndStatus, branding, preferred, news, appinfo;

    try {
        appinfo = require('../../package.json');
    } catch (e) {
    }

    nxo.internal.$getBranding()
        .then((b) => {
            branding = b;
            return nxo.internal.$getPrefered();
        })
        .then((p) => {
            preferred = p;
            return nxo.internal.$getNews();
        })
        .then((n) => {
            news = n;
            return nxo.internal.$getNameWithStatus();
        })
        .then((n) => {
            nameAndStatus = n;
            res.render('home', {
                title: 'Welcome!',
                nameAndStatus: nameAndStatus,
                branding: branding,
                preferred: preferred,
                news: news,
                appinfo: appinfo
            });
        })
        .catch(error => {
            res.status(500);
            res.render('error', {message: 'Nuxeo seems not well configured', error: error});
        });
});


module.exports = router;
