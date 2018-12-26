let express = require('express');
let router = express.Router();
let nxo = require('../modules/nuxeo')(false);

router.get('/', nxo.web.testNXQL);

module.exports = router;
