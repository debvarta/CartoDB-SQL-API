'use strict';

const Logger = require('../app/services/logger');

class BatchLogger extends Logger {
    constructor (path, name) {
        super(path, name);
    }

    log (job) {
        return job.log(this.logger);
    }

}

module.exports = BatchLogger;
