'use strict';

require('../helper');

var server = require('../../app/server')();
var assert = require('../support/assert');
var querystring = require('querystring');
var _ = require('underscore');


describe('skipfields', function() {

    var RESPONSE_OK = {
        statusCode: 200
    };

    it('skipfields controls included fields', function(done){
        assert.response(server, {
            url: '/api/v1/sql?q=' +
                'SELECT%20*%20FROM%20untitle_table_4&skipfields=the_geom_webmercator,cartodb_id,unexistant',
            headers: {host: 'vizzuality.cartodb.com'},
            method: 'GET'
        }, RESPONSE_OK, function(err, res){
            var row0 = JSON.parse(res.body).rows[0];
            var checkfields = {'name':1, 'cartodb_id':0, 'the_geom':1, 'the_geom_webmercator':0};
            for ( var f in checkfields ) {
            if ( checkfields[f] ) {
                assert.ok(row0.hasOwnProperty(f), "result does not include '" + f + "'");
            } else {
                assert.ok(!row0.hasOwnProperty(f), "result includes '" + f + "'");
            }
            }
            done();
        });
    });

    it('multiple skipfields parameter do not kill the backend', function(done){
        assert.response(server, {
            url: '/api/v1/sql?q=SELECT%20*%20FROM%20untitle_table_4&skipfields=unexistent,the_geom_webmercator' +
                '&skipfields=cartodb_id,unexistant',
            headers: {host: 'vizzuality.cartodb.com'},
            method: 'GET'
        }, RESPONSE_OK, function(err, res){
            var row0 = JSON.parse(res.body).rows[0];
            var checkfields = {'name':1, 'cartodb_id':0, 'the_geom':1, 'the_geom_webmercator':0};
            for ( var f in checkfields ) {
            if ( checkfields[f] ) {
                assert.ok(row0.hasOwnProperty(f), "result does not include '" + f + "'");
            } else {
                assert.ok(!row0.hasOwnProperty(f), "result includes '" + f + "'");
            }
            }
            done();
        });
    });

    // See https://github.com/CartoDB/CartoDB-SQL-API/issues/109
    it('schema response takes skipfields into account', function(done){
        assert.response(server, {
            url: '/api/v1/sql?' + querystring.stringify({
            q: "SELECT 1 as a, 2 as b, 3 as c ",
            skipfields: 'b'
            }),
            headers: {host: 'vizzuality.cartodb.com'},
            method: 'GET'
        }, RESPONSE_OK, function(err, res) {
            var parsedBody = JSON.parse(res.body);
            assert.equal(_.keys(parsedBody.fields).length, 2);
            assert.ok(parsedBody.fields.hasOwnProperty('a'));
            assert.ok(!parsedBody.fields.hasOwnProperty('b'));
            assert.ok(parsedBody.fields.hasOwnProperty('c'));
            done();
        });
    });
    it('field named "the_geom_webmercator" is not skipped by default', function(done){
        assert.response(server, {
            url: '/api/v1/sql?q=SELECT%20*%20FROM%20untitle_table_4',
            headers: {host: 'vizzuality.cartodb.com'},
            method: 'GET'
        },{ }, function(err, res){
            assert.equal(res.statusCode, 200, res.body);
            var row0 = JSON.parse(res.body).rows[0];
            var checkfields = {'name':1, 'cartodb_id':1, 'the_geom':1, 'the_geom_webmercator':1};
            for ( var f in checkfields ) {
            if ( checkfields[f] ) {
                assert.ok(row0.hasOwnProperty(f), "result does not include '" + f + "'");
            } else {
                assert.ok(!row0.hasOwnProperty(f), "result includes '" + f + "'");
            }
            }
            done();
        });
    });
});
