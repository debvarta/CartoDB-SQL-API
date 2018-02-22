'use strict';

var step = require('step');
var _ = require('underscore');

function isApiKeyFound(apikey) {
    return apikey.type !== null &&
        apikey.user !== null &&
        apikey.databasePassword !== null &&
        apikey.databaseRole !== null;
}

function UserDatabaseService(metadataBackend) {
    this.metadataBackend = metadataBackend;
}

/**
 * Callback is invoked with `dbParams` and `authDbParams`.
 * `dbParams` depends on AuthApi verification so it might return a public user with just SELECT permission, where
 * `authDbParams` will always return connection params as AuthApi had authorized the connection.
 * That might be useful when you have to run a query with and without permissions.
 *
 * @param {AuthApi} authApi
 * @param {String} cdbUsername
 * @param {Function} callback (err, dbParams, authDbParams)
 */
UserDatabaseService.prototype.getConnectionParams = function (cdbUsername, apikeyToken, isAuthenticated, callback) {
    var self = this;

    var dbopts = {
        port: global.settings.db_port,
        pass: global.settings.db_pubuser_pass
    };

    // 1. Get database from redis via the username stored in the host header subdomain
    // 2. Run the request through OAuth to get R/W user id if signed
    // 3. Set to user authorization params
    step(
        function getDatabaseConnectionParams() {
            self.metadataBackend.getAllUserDBParams(cdbUsername, this);
        },
        function getApiKey (err, dbParams) {
            if (err) {
                err.http_status = 404;
                err.message = "Sorry, we can't find CartoDB user '" + cdbUsername + "'. " +
                    "Please check that you have entered the correct domain.";
                return callback(err);
            }

            const next = this;

            if (apikeyToken === undefined) {
                return next(null, dbopts, dbParams);
            }

            self.getApiKey(cdbUsername, apikeyToken, function (err, apikey) {
                if (err) {
                    return next(err);
                }

                if (!apikey) {
                    return next(null, dbopts, dbParams);
                }

                dbParams.apikey = apikeyToken;

                next(null, dbopts, dbParams, apikey);
            });
        },
        function setDBAuth(err, dbopts, dbParams, apikey) {
            const next = this;

            if (err) {
                return next(err);
            }

            dbopts.host = dbParams.dbhost;
            dbopts.dbname = dbParams.dbname;
            dbopts.user = (!!dbParams.dbpublicuser) ? dbParams.dbpublicuser : global.settings.db_pubuser;

            var user = _.template(global.settings.db_user, {user_id: dbParams.dbuser});
            var pass = null;

            if (global.settings.hasOwnProperty('db_user_pass')) {
                pass = _.template(global.settings.db_user_pass, {
                    user_id: dbParams.dbuser,
                    user_password: dbParams.dbpass
                });
            }

            if (isAuthenticated) {
                dbopts.authenticated = isAuthenticated;
                if (apikey) {
                    dbopts.user = apikey.databaseRole;
                    dbopts.pass = apikey.databasePassword;
                } else {
                    dbopts.user = user;
                    dbopts.pass = pass;
                }
            }

            var authDbOpts = _.defaults({ user: user, pass: pass }, dbopts);

            return next(null, isAuthenticated, dbopts, authDbOpts);
        },
        function getUserLimits (err, isAuthenticated, dbopts, authDbOpts) {
            var next = this;

            if (err) {
                return next(err);
            }

            self.getUserLimits(cdbUsername, isAuthenticated, function (err, userLimits) {
                if (err) {
                    return next(err);
                }

                next(null, dbopts, authDbOpts, userLimits);
            });
        },
        function errorHandle(err, dbopts, authDbOpts, userLimits) {
            if (err) {
                return callback(err);
            }

            callback(null, dbopts, authDbOpts, userLimits);
        }
    );
};

UserDatabaseService.prototype.getApiKey = function (cdbUsername, apikeyToken, callback) {
    this.metadataBackend.getApikey(cdbUsername, apikeyToken, (err, apikey) => {
        if (err) {
            return callback(err);
        }

        if (!isApiKeyFound(apikey)) {
            return callback(null);
        }

        callback(null, apikey);
    });
};

UserDatabaseService.prototype.getUserLimits = function (cdbUsername, isAuthenticated, callback) {
    this.metadataBackend.getUserTimeoutRenderLimits(cdbUsername, function (err, timeoutRenderLimit) {
        if (err) {
            return callback(err);
        }

        var userLimits = {
            timeout: isAuthenticated ? timeoutRenderLimit.render : timeoutRenderLimit.renderPublic
        };

        callback(null, userLimits);
    });
};

module.exports = UserDatabaseService;
