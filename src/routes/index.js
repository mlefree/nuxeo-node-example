var express = require('express');
var router = express.Router();
let nxo = require('../modules/nuxeo')(false);

router.get('/', function (req, res) {

    let nameAndStatus, branding, prefered, news;

    nxo.internal.$getBranding()
        .then((b) => {
            branding = b;
            return nxo.internal.$getPrefered();
        })
        .then((p) => {
            prefered = p;
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
                prefered: prefered,
                news: news
            });
        })
        .catch(error => {
            res.status(500);
            res.render('error', {message: 'Nuxdeo looks not well configured', error: error});
        });
});


module.exports = router;
