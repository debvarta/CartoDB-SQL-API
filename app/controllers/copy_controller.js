'use strict';

const userMiddleware = require('../middlewares/user');
const errorMiddleware = require('../middlewares/error');
const authorizationMiddleware = require('../middlewares/authorization');
const connectionParamsMiddleware = require('../middlewares/connection-params');
const timeoutLimitsMiddleware = require('../middlewares/timeout-limits');
const { initializeProfilerMiddleware } = require('../middlewares/profiler');
const rateLimitsMiddleware = require('../middlewares/rate-limit');
const { RATE_LIMIT_ENDPOINTS_GROUPS } = rateLimitsMiddleware;
// const Busboy = require('busboy');

const PSQL = require('cartodb-psql');
const copyTo = require('pg-copy-streams').to;
const copyFrom = require('pg-copy-streams').from;


function CopyController(metadataBackend, userDatabaseService, userLimitsService) {
    this.metadataBackend = metadataBackend;
    this.userDatabaseService = userDatabaseService;
    this.userLimitsService = userLimitsService;
}

CopyController.prototype.route = function (app) {
    const { base_url } = global.settings;

    const copyFromMiddlewares = endpointGroup => {
        return [
            initializeProfilerMiddleware('copyfrom'),
            userMiddleware(),
            rateLimitsMiddleware(this.userLimitsService, endpointGroup),
            authorizationMiddleware(this.metadataBackend),
            connectionParamsMiddleware(this.userDatabaseService),
            timeoutLimitsMiddleware(this.metadataBackend),
            this.handleCopyFrom.bind(this),
            this.responseCopyFrom.bind(this),
            errorMiddleware()
        ];
    };

    const copyToMiddlewares = endpointGroup => {
        return [
            initializeProfilerMiddleware('copyto'),
            userMiddleware(),
            rateLimitsMiddleware(this.userLimitsService, endpointGroup),
            authorizationMiddleware(this.metadataBackend),
            connectionParamsMiddleware(this.userDatabaseService),
            timeoutLimitsMiddleware(this.metadataBackend),
            this.handleCopyTo.bind(this),
            this.responseCopyTo.bind(this),
            errorMiddleware()
        ];
    };

    app.post(`${base_url}/sql/copyfrom`, copyFromMiddlewares(RATE_LIMIT_ENDPOINTS_GROUPS.COPY_FROM));
    app.get(`${base_url}/sql/copyto`, copyToMiddlewares(RATE_LIMIT_ENDPOINTS_GROUPS.COPY_TO));
};

CopyController.prototype.handleCopyTo = function (req, res, next) {
    const { sql } = req.query;

    if (!sql) {
        throw new Error("Parameter 'sql' is missing");
    }

    // Only accept SQL that starts with 'COPY'
    if (!sql.toUpperCase().startsWith("COPY ")) {
        throw new Error("SQL must start with COPY");
    }

    try {
        // Open pgsql COPY pipe and stream out to HTTP response
        const pg = new PSQL(res.locals.userDbParams);
        pg.connect(function (err, client) {
            if (err) {
                return next(err);
            }

            let copyToStream = copyTo(sql);
            const pgstream = client.query(copyToStream);

            res.on('error', next);
            pgstream.on('error', next);
            pgstream.on('end', next);
            
            pgstream.pipe(res);
        });
    } catch (err) {
        next(err);
    }

};

CopyController.prototype.responseCopyTo = function (req, res) {
    let { filename } = req.query;
    
    if (!filename) {
        filename = 'carto-sql-copyto.dmp';
    }

    res.setHeader("Content-Disposition", `attachment; filename=${encodeURIComponent(filename)}`);
    res.setHeader("Content-Type", "application/octet-stream");
    res.send();
};

CopyController.prototype.handleCopyFrom = function (req, res, next) {
    let sql = req.query.sql;
        
    // curl -vv -X POST --data-binary @test.csv "http://cdb.localhost.lan:8080/api/v2/sql/copyfrom?api_key=5b7056ebaa4bae42c0e99283785f0fd63e36e961&sql=copy+foo+(i,t)+from+stdin+with+(format+csv,header+false)"

    // curl -vv -X POST --data-binary @test.csv "http://cdb.localhost.lan:8080/api/v2/sql/copyfrom?api_key=5b7056ebaa4bae42c0e99283785f0fd63e36e961&sql=copy+foo+(i,t)+from+stdin"


    // curl -X POST --data-binary @test.csv -G --data-urlencode "sql=COPY FOO (i, t) FROM stdin" --data-urlencode "api_key=5b7056ebaa4bae42c0e99283785f0fd63e36e961" "http://cdb.localhost.lan:8080/api/v2/sql/copyfrom"

    // curl -X POST -G --data-urlencode "sql=COPY FOO (i, t) FROM stdin" --data-urlencode "api_key=5b7056ebaa4bae42c0e99283785f0fd63e36e961" "http://cdb.localhost.lan:8080/api/v2/sql/copyfrom"

    
    try {
        const start_time = Date.now();

        // Connect and run the COPY
        const pg = new PSQL(res.locals.userDbParams);
        pg.connect(function (err, client) {
            if (err) {
                return next(err);
            }

            let copyFromStream = copyFrom(sql);
            const pgstream = client.query(copyFromStream);
            pgstream.on('error', next);
            pgstream.on('end', function () {
                const end_time = Date.now();
                res.body = {
                    time: (end_time - start_time) / 1000,
                    total_rows: copyFromStream.rowCount
                };

                return next();
            });

            // req is a readable stream (cool!)
            req.pipe(pgstream);
        });

    } catch (err) {
        next(err);
    }

};

CopyController.prototype.responseCopyFrom = function (req, res, next) {
    if (!res.body || !res.body.total_rows) {
        return next(new Error("No rows copied"));
    }

    res.send(res.body);
};

module.exports = CopyController;
