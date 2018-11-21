var express = require('express');
var router = express.Router();
let nxo = require('../modules/nuxeo')(false);

router.get('/branding', nxo.api.getBranding);
router.get('/prefered', nxo.api.getPrefered);
router.get('/users', nxo.api.getNbUser);

module.exports = router;
