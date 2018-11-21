var express = require('express');
var router = express.Router();
let nxo = require('../modules/nuxeo')(false);

router.get('/', function (req, res) {

    let branding, prefered;

    nxo.internal.$getBranding()
        .then((b) => {
            branding = b;
            return nxo.internal.$getPrefered();
        })
        .then((p) => {
            prefered = p;
            res.render('home', {title: 'Welcome!',branding: branding,  prefered: prefered});
        })
        .catch(error => {
            res.status(500);
            res.render('error', {message: 'Nuxdeo looks not well configured', error : error});
        });
});


module.exports = router;
