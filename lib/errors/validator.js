'use-strict';

var ElasticsearchError = require('../errors.js'),
    utils = require('../utils');

function ValidatorError(property, reason){
  var message = "Validator failed for property '"+ property + "'";
  if(reason) this.message = message + " " + reason;
  if(Error.captureStackTrace) Error.captureStackTrace(this, arguments.callee);
  this.name = 'ValidatorError';
  this.property = property;
}

utils.inherits(ValidatorError, ElasticsearchError);

module.exports = ValidatorError;
