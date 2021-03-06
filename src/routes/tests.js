let express = require('express');
let router = express.Router();
let nxo = require('../modules/nuxeo')(false);

router.get('/', nxo.web.testAll);
router.get('/read/:delay?', nxo.web.testRead);
router.get('/update/:delay?', nxo.web.testUpdate);
router.get('/create/:delay?', nxo.web.testCreate);

module.exports = router;
