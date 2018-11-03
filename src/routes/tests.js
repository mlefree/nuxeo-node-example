let express = require('express');
let router = express.Router();
let nxo = require('../modules/nuxeo')(false);

router.get('/', nxo.web.testAll);
router.get('/read', nxo.web.testRead);
router.get('/update', nxo.web.testUpdate);
router.get('/create', nxo.web.testCreate);

module.exports = router;
